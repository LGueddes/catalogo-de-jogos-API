import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createAdmin, createTestApp, registerUser, resetState } from './helpers.js';
import type { TestUser } from './helpers.js';

describe('Games (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let user: TestUser;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
    admin = await createAdmin(app);
    user = await registerUser(app, 'user@example.com');
  });
  afterAll(() => app.close());

  async function seedGames(count: number) {
    await app.get(PrismaService).game.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        title: `Jogo ${String(index + 1).padStart(2, '0')}`,
        genres: index % 2 === 0 ? ['Action'] : ['RPG', 'Indie'],
      })),
    });
  }

  describe('GET /games', () => {
    it('é público e pagina os resultados', async () => {
      await seedGames(25);

      const response = await http().get('/games?page=3&limit=10&sortBy=title&order=asc').expect(200);

      expect(response.body.meta).toEqual({ page: 3, limit: 10, total: 25, totalPages: 3 });
      expect(response.body.data.map((game: { title: string }) => game.title)).toEqual([
        'Jogo 21',
        'Jogo 22',
        'Jogo 23',
        'Jogo 24',
        'Jogo 25',
      ]);
    });

    it('rejeita parâmetros de paginação inválidos (400)', async () => {
      await http().get('/games?page=0').expect(400);
      await http().get('/games?limit=1000').expect(400);
      await http().get('/games?sortBy=passwordHash').expect(400);
    });

    it('filtra por título (sem diferenciar maiúsculas) e por gênero', async () => {
      await seedGames(10);

      const search = await http().get('/games?search=JOGO 03').expect(200);
      expect(search.body.data.map((game: { title: string }) => game.title)).toEqual(['Jogo 03']);

      const genre = await http().get('/games?genre=RPG&limit=100').expect(200);
      expect(genre.body.meta.total).toBe(5);
    });

    it('serve a segunda requisição idêntica a partir do cache (MISS e depois HIT)', async () => {
      await seedGames(3);

      const first = await http().get('/games').expect(200);
      const second = await http().get('/games').expect(200);

      expect(first.headers['x-cache']).toBe('MISS');
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body).toEqual(first.body);
    });

    it('invalida o cache quando um jogo é criado, atualizado ou removido', async () => {
      await seedGames(2);
      await http().get('/games?sortBy=title&order=asc').expect(200); // aquece o cache

      const created = await http()
        .post('/games')
        .set(...bearer(admin.token))
        .send({ title: 'Novo Jogo' })
        .expect(201);
      const afterCreate = await http().get('/games?sortBy=title&order=asc').expect(200);
      expect(afterCreate.headers['x-cache']).toBe('MISS');
      expect(afterCreate.body.meta.total).toBe(3);

      await http()
        .patch(`/games/${created.body.id}`)
        .set(...bearer(admin.token))
        .send({ title: 'Título Alterado' })
        .expect(200);
      const afterUpdate = await http().get('/games?sortBy=title&order=asc').expect(200);
      expect(afterUpdate.body.data.map((game: { title: string }) => game.title)).toContain('Título Alterado');

      await http()
        .delete(`/games/${created.body.id}`)
        .set(...bearer(admin.token))
        .expect(204);
      const afterDelete = await http().get('/games').expect(200);
      expect(afterDelete.body.meta.total).toBe(2);
    });
  });

  describe('GET /games/:id', () => {
    it('retorna o jogo e usa cache na segunda chamada', async () => {
      const created = await http()
        .post('/games')
        .set(...bearer(admin.token))
        .send({ title: 'Hades', genres: ['Action'], releaseDate: '2020-09-17' })
        .expect(201);

      const first = await http().get(`/games/${created.body.id}`).expect(200);
      const second = await http().get(`/games/${created.body.id}`).expect(200);

      expect(first.body).toMatchObject({ title: 'Hades', genres: ['Action'], source: 'MANUAL' });
      expect(first.headers['x-cache']).toBe('MISS');
      expect(second.headers['x-cache']).toBe('HIT');
    });

    it('retorna 404 para jogo inexistente e 400 para id malformado', async () => {
      await http().get('/games/00000000-0000-4000-8000-000000000000').expect(404);
      await http().get('/games/nao-e-um-uuid').expect(400);
    });
  });

  describe('escrita (somente ADMIN)', () => {
    it('exige autenticação (401) e papel de admin (403)', async () => {
      await http().post('/games').send({ title: 'X' }).expect(401);
      await http()
        .post('/games')
        .set(...bearer(user.token))
        .send({ title: 'X' })
        .expect(403);
    });

    it('valida o corpo (400)', async () => {
      await http()
        .post('/games')
        .set(...bearer(admin.token))
        .send({ title: '', coverUrl: 'não é url' })
        .expect(400);
    });

    it('retorna 404 ao atualizar ou remover um jogo inexistente', async () => {
      const id = '00000000-0000-4000-8000-000000000000';
      await http()
        .patch(`/games/${id}`)
        .set(...bearer(admin.token))
        .send({ title: 'X' })
        .expect(404);
      await http()
        .delete(`/games/${id}`)
        .set(...bearer(admin.token))
        .expect(404);
    });
  });
});
