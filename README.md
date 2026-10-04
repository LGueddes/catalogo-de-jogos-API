# GameCatalog API

API REST de catálogo de jogos feita com **NestJS, Prisma, PostgreSQL, Redis e Vitest**.
É um projeto de estudo inspirado no domínio de um launcher de jogos: catálogo com busca e paginação,
avaliações dos usuários, autenticação e sincronização periódica com uma fonte externa (Steam).

## O que a API faz

- **Autenticação** com JWT e papéis (`USER` e `ADMIN`); senhas com hash bcrypt.
- **Catálogo de jogos** com paginação, busca por título, filtro por gênero e ordenação.
- **Cache com Redis** nas listagens e nos jogos individuais, com invalidação automática quando os dados mudam.
- **Avaliações** (nota de 1 a 5 e comentário) com média e contagem mantidas no jogo.
- **Sincronização do catálogo** com a Steam, agendada (cron) ou disparada manualmente por um admin.
- **Health check** que verifica banco e Redis.
- **Documentação interativa** (Swagger) em `/docs`.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | NestJS 12 (Node.js 22, TypeScript, ESM) |
| Banco de dados | PostgreSQL 17 + Prisma 7 (com migrations) |
| Cache e locks | Redis 7 (ioredis) |
| Validação | class-validator / class-transformer |
| Jobs | @nestjs/schedule (cron) |
| Testes | Vitest + Supertest (unitários e e2e) |
| CI | GitHub Actions |

## Como rodar

Pré-requisitos: **Node.js 22.22+ (ou 24 LTS)** e **Docker**.

```bash
# 1. Instale as dependências (o postinstall gera o Prisma Client)
npm install

# 2. Crie o arquivo de variáveis de ambiente
cp .env.example .env

# 3. Suba o PostgreSQL e o Redis
docker compose up -d

# 4. Aplique as migrations e carregue dados de exemplo
npm run db:deploy
npm run db:seed

# 5. Inicie a API
npm run start:dev
```

A API sobe em `http://localhost:3000` e a documentação em `http://localhost:3000/docs`.
O seed cria um usuário admin (`admin@gamecatalog.local` / `admin12345`, configurável no `.env`) e 5 jogos de exemplo.
**Use esse admin apenas em desenvolvimento.**

### Exemplo rápido

```bash
# Listagem (a resposta traz o header X-Cache: MISS na primeira vez e HIT nas seguintes)
curl -i "http://localhost:3000/games?search=ha&sortBy=title&order=asc&limit=5"

# Login como admin
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@gamecatalog.local","password":"admin12345"}' | jq -r .accessToken)

# Criar um jogo
curl -X POST http://localhost:3000/games \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Outer Wilds","genres":["Adventure"],"releaseDate":"2019-05-28"}'

# Importar jogos da Steam agora (em vez de esperar o cron)
curl -X POST http://localhost:3000/sync -H "authorization: Bearer $TOKEN"
```

## Endpoints

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/register` | Público | Cadastra um usuário e devolve o token (201) |
| POST | `/auth/login` | Público | Autentica e devolve o token (200) |
| GET | `/auth/me` | Autenticado | Perfil do usuário logado |
| GET | `/games` | Público | Lista paginada com `page`, `limit`, `search`, `genre`, `sortBy`, `order` |
| GET | `/games/:id` | Público | Detalhe de um jogo |
| POST | `/games` | ADMIN | Cria um jogo (201) |
| PATCH | `/games/:id` | ADMIN | Atualiza um jogo |
| DELETE | `/games/:id` | ADMIN | Remove um jogo (204) |
| GET | `/games/:gameId/reviews` | Público | Lista paginada de avaliações do jogo |
| PUT | `/games/:gameId/reviews` | Autenticado | Cria ou atualiza a avaliação do próprio usuário |
| DELETE | `/games/:gameId/reviews` | Autenticado | Remove a própria avaliação (204) |
| POST | `/sync` | ADMIN | Dispara a sincronização com a Steam |
| GET | `/health` | Público | Estado do banco e do Redis (503 se algo estiver fora) |

Respostas paginadas seguem o formato `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.
Códigos de erro usados: `400` (validação), `401` (sem token/inválido), `403` (sem permissão), `404`, `409` (conflito) e `503`.

## Testes

```bash
npm test            # unitários (não precisam de banco nem Redis)
npm run test:cov    # unitários com cobertura
npm run test:e2e    # e2e: sobem a aplicação inteira contra Postgres e Redis reais
npm run typecheck   # checagem de tipos
```

Os testes e2e usam o banco `gamecatalog_test` e o Redis `db 1` (criados pelo `docker compose up -d`),
aplicam as migrations automaticamente e **apagam os dados a cada teste**. Por segurança, eles se recusam a rodar
se o nome do banco não contiver "test". Os bancos podem ser trocados com `TEST_DATABASE_URL` e `TEST_REDIS_URL`.
A Steam é simulada nos testes: nenhum teste faz chamadas de rede reais.

## Decisões técnicas

**Cache de listagens com versionamento.** Cada listagem é guardada no Redis com uma chave que inclui a versão do
namespace (`games:list:v{versão}:{hash da consulta}`). Quando um jogo muda (criação, edição, remoção, nova avaliação
ou sincronização), basta incrementar a versão (`INCR`) para invalidar todas as listagens de uma vez, sem varrer
chaves com `KEYS`/`SCAN`. As chaves antigas expiram sozinhas pelo TTL.

**Cache "fail-open".** Se o Redis cair, a API continua respondendo direto do banco em vez de falhar.

**Média de avaliações desnormalizada.** `ratingAvg` e `ratingCount` ficam na tabela `Game` e são recalculados
dentro da mesma transação que grava a avaliação, evitando um `AVG()` a cada listagem.

**Sincronização idempotente.** O jogo é identificado por `(source, externalId)` (índice único) e gravado com
`upsert`; rodar o sync várias vezes não duplica registros e não apaga as avaliações. Um **lock distribuído no Redis**
(`SET NX EX` + liberação atômica via script Lua) impede execuções concorrentes, por exemplo cron e chamada manual
ao mesmo tempo, ou várias instâncias da API.

**Fontes plugáveis.** Cada fonte implementa a interface `CatalogSource`. Adicionar Epic ou LaunchBox é criar uma
classe nova e registrá-la em `SyncModule`.

**Segurança.** `ValidationPipe` com `whitelist` e `forbidNonWhitelisted` (ninguém consegue enviar `role: "ADMIN"` no
cadastro); mensagem única para e-mail inexistente e senha errada, com comparação de hash feita nos dois casos para
não vazar por tempo de resposta quais e-mails existem; respostas nunca incluem o hash da senha.

**Integridade no banco.** Além da validação na API, a nota da avaliação tem um `CHECK (rating BETWEEN 1 AND 5)`
(migration manual, já que o Prisma não modela constraints desse tipo) e as avaliações usam `ON DELETE CASCADE`.

## Estrutura

```
src/
  auth/       registro, login, JWT, guards de autenticação e de papel
  games/      CRUD, listagem paginada e cache
  reviews/    avaliações e recálculo da média
  sync/       fontes externas (Steam), serviço de sincronização, cron e endpoint manual
  redis/      cliente Redis e CacheService (cache-aside, versionamento, locks)
  prisma/     PrismaService (Prisma Client com adapter do PostgreSQL)
  health/     health check
  config/     validação das variáveis de ambiente
prisma/       schema, migrations e seed
test/         testes e2e e helpers
```

## Próximos passos possíveis

- Busca full-text com Elasticsearch no lugar do `contains` do PostgreSQL.
- Observabilidade: Sentry para erros, logs estruturados e métricas Prometheus.
- Mover a sincronização para uma função AWS Lambda ou worker dedicado, com fila.
- Novas fontes de catálogo (Epic, LaunchBox).
- Refresh tokens e rate limiting nas rotas de autenticação.
