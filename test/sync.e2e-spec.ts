import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.constants.js';
import { bearer, createAdmin, createTestApp, registerUser, resetState } from './helpers.js';
import type { TestUser } from './helpers.js';

const steamEntry = (appId: number, name: string) => ({
  success: true,
  data: {
    steam_appid: appId,
    name,
    short_description: `Descrição de ${name}`,
    genres: [{ description: 'Action' }],
    developers: ['Dev'],
    release_date: { coming_soon: false, date: '18 Apr, 2011' },
    header_image: 'https://cdn.example.com/img.jpg',
  },
});

/** Simula a API da Steam: nenhuma chamada de rede real é feita nos testes. */
function mockSteam(names: Record<string, string>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const appId = new URL(String(input)).searchParams.get('appids') as string;
    const name = names[appId];
    const body = name ? { [appId]: steamEntry(Number(appId), name) } : { [appId]: { success: false } };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe('Sync (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  const http = () => request(app.getHttpServer());
  const runSync = () =>
    http()
      .post('/sync')
      .set(...bearer(admin.token));

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
    admin = await createAdmin(app);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => app.close());

  it('exige autenticação (401) e papel de admin (403)', async () => {
    const user = await registerUser(app, 'user@example.com');
    await http().post('/sync').expect(401);
    await http()
      .post('/sync')
      .set(...bearer(user.token))
      .expect(403);
  });

  it('importa os jogos da fonte e os expõe na listagem', async () => {
    mockSteam({ '620': 'Portal 2', '105600': 'Terraria' });

    const response = await runSync().expect(200);

    expect(response.body.sources).toEqual([
      { source: 'STEAM', fetched: 2, created: 2, updated: 0, errors: [] },
    ]);

    const list = await http().get('/games?sortBy=title&order=asc').expect(200);
    expect(list.body.data.map((game: { title: string }) => game.title)).toEqual(['Portal 2', 'Terraria']);
    expect(list.body.data[0]).toMatchObject({ source: 'STEAM', externalId: '620', developer: 'Dev' });
  });

  it('é idempotente e reflete mudanças da fonte sem duplicar nem servir cache velho', async () => {
    mockSteam({ '620': 'Portal 2', '105600': 'Terraria' });
    await runSync().expect(200);
    await http().get('/games').expect(200); // aquece o cache da listagem

    vi.restoreAllMocks();
    mockSteam({ '620': 'Portal 2: Edição Nova', '105600': 'Terraria' });
    const second = await runSync().expect(200);

    expect(second.body.sources[0]).toMatchObject({ created: 0, updated: 2 });
    expect(await app.get(PrismaService).game.count()).toBe(2);

    const list = await http().get('/games?sortBy=title&order=asc').expect(200);
    expect(list.body.data.map((game: { title: string }) => game.title)).toEqual(['Portal 2: Edição Nova', 'Terraria']);
  });

  it('preserva as avaliações dos usuários quando o jogo é atualizado pela sincronização', async () => {
    mockSteam({ '620': 'Portal 2', '105600': 'Terraria' });
    await runSync().expect(200);
    const game = await app.get(PrismaService).game.findFirstOrThrow({ where: { externalId: '620' } });
    const user = await registerUser(app, 'user@example.com');
    await http()
      .put(`/games/${game.id}/reviews`)
      .set(...bearer(user.token))
      .send({ rating: 5 })
      .expect(200);

    await runSync().expect(200);

    const after = await http().get(`/games/${game.id}`).expect(200);
    expect(after.body).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
  });

  it('responde 200 com os erros no relatório quando a fonte está fora do ar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('indisponível', { status: 503 }));

    const response = await runSync().expect(200);

    expect(response.body.sources[0]).toMatchObject({ fetched: 0, created: 0 });
    expect(response.body.sources[0].errors).toEqual(['appid 620: HTTP 503', 'appid 105600: HTTP 503']);
  });

  it('retorna 409 se já existe uma sincronização em andamento (lock no Redis)', async () => {
    await app.get<Redis>(REDIS).set('lock:catalog-sync', 'outra-instancia', 'EX', 60);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await runSync().expect(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('libera o lock ao terminar, permitindo uma nova execução', async () => {
    mockSteam({ '620': 'Portal 2' });
    await runSync().expect(200);
    await runSync().expect(200);
  });
});
