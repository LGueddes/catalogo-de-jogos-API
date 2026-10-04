import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createTestApp, registerUser, resetState } from './helpers.js';
import type { TestUser } from './helpers.js';

describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let gameId: string;
  let ana: TestUser;
  let bruno: TestUser;
  const http = () => request(app.getHttpServer());

  const review = (user: TestUser, body: object) =>
    http()
      .put(`/games/${gameId}/reviews`)
      .set(...bearer(user.token))
      .send(body);

  const getGame = async () => (await http().get(`/games/${gameId}`).expect(200)).body;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
    ana = await registerUser(app, 'ana@example.com');
    bruno = await registerUser(app, 'bruno@example.com');
    gameId = (await app.get(PrismaService).game.create({ data: { title: 'Celeste' } })).id;
  });
  afterAll(() => app.close());

  it('recalcula a média e a quantidade conforme as avaliações chegam', async () => {
    await review(ana, { rating: 5, comment: 'Perfeito' }).expect(200);
    expect(await getGame()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });

    await review(bruno, { rating: 4 }).expect(200);
    expect(await getGame()).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });

  it('é idempotente: o mesmo usuário apenas atualiza a própria avaliação', async () => {
    await review(ana, { rating: 5 }).expect(200);
    await review(ana, { rating: 2, comment: 'Mudei de ideia' }).expect(200);

    expect(await getGame()).toMatchObject({ ratingAvg: 2, ratingCount: 1 });
  });

  it('o cache do jogo não fica desatualizado depois de uma avaliação', async () => {
    await getGame(); // aquece o cache
    await review(ana, { rating: 3 }).expect(200);

    expect(await getGame()).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
  });

  it('remove a própria avaliação e recalcula a média (204)', async () => {
    await review(ana, { rating: 5 }).expect(200);
    await review(bruno, { rating: 3 }).expect(200);

    await http()
      .delete(`/games/${gameId}/reviews`)
      .set(...bearer(ana.token))
      .expect(204);

    expect(await getGame()).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
  });

  it('retorna 404 ao remover uma avaliação que não existe', async () => {
    await http()
      .delete(`/games/${gameId}/reviews`)
      .set(...bearer(ana.token))
      .expect(404);
  });

  it('valida a nota (1 a 5) e exige autenticação', async () => {
    await review(ana, { rating: 0 }).expect(400);
    await review(ana, { rating: 6 }).expect(400);
    await review(ana, { rating: 3.5 }).expect(400);
    await http().put(`/games/${gameId}/reviews`).send({ rating: 5 }).expect(401);
  });

  it('retorna 404 para jogo inexistente', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await http()
      .put(`/games/${missing}/reviews`)
      .set(...bearer(ana.token))
      .send({ rating: 5 })
      .expect(404);
    await http().get(`/games/${missing}/reviews`).expect(404);
  });

  it('lista avaliações paginadas mostrando só o nome do autor (sem e-mail nem hash)', async () => {
    await review(ana, { rating: 5, comment: 'Ótimo' }).expect(200);
    await review(bruno, { rating: 4 }).expect(200);

    const response = await http().get(`/games/${gameId}/reviews?limit=1`).expect(200);

    expect(response.body.meta).toMatchObject({ total: 2, totalPages: 2, limit: 1 });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].user).toEqual({ id: expect.any(String), name: 'Usuário de Teste' });
    expect(JSON.stringify(response.body)).not.toMatch(/email|passwordHash/);
  });

  it('o banco recusa notas fora de 1–5 mesmo sem passar pela API (CHECK constraint)', async () => {
    await expect(
      app
        .get(PrismaService)
        .$executeRawUnsafe(
          `INSERT INTO "Review" ("id", "rating", "userId", "gameId", "updatedAt") VALUES ('r-invalida', 9, '${ana.id}', '${gameId}', NOW())`,
        ),
    ).rejects.toThrow();
  });

  it('apagar o jogo apaga as avaliações dele (ON DELETE CASCADE)', async () => {
    await review(ana, { rating: 5 }).expect(200);
    await app.get(PrismaService).game.delete({ where: { id: gameId } });

    expect(await app.get(PrismaService).review.count()).toBe(0);
  });
});
