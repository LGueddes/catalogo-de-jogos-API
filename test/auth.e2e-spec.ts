import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, resetState } from './helpers.js';

describe('Auth e Health (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetState(app));
  afterAll(() => app.close());

  it('GET /health informa que banco e Redis estão no ar', async () => {
    const response = await http().get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  describe('POST /auth/register', () => {
    it('cadastra o usuário (201) e não expõe o hash da senha', async () => {
      const response = await http()
        .post('/auth/register')
        .send({ email: 'ana@example.com', name: 'Ana', password: 'senha12345' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user).toMatchObject({ email: 'ana@example.com', name: 'Ana', role: 'USER' });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|senha12345/);
    });

    it('rejeita e-mail duplicado (409), ignorando diferença de maiúsculas', async () => {
      await registerUser(app, 'ana@example.com');
      await http()
        .post('/auth/register')
        .send({ email: 'ANA@Example.com', name: 'Outra Ana', password: 'senha12345' })
        .expect(409);
    });

    it('valida o corpo da requisição (400)', async () => {
      const response = await http().post('/auth/register').send({ email: 'invalido', name: 'A', password: '123' }).expect(400);
      expect(response.body.message).toEqual(expect.arrayContaining([expect.stringContaining('email')]));
    });

    it('rejeita campos extras, impedindo que alguém se cadastre como ADMIN (400)', async () => {
      await http()
        .post('/auth/register')
        .send({ email: 'x@example.com', name: 'Xis', password: 'senha12345', role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('autentica com credenciais corretas (200)', async () => {
      await registerUser(app, 'ana@example.com');
      const response = await http().post('/auth/login').send({ email: 'ana@example.com', password: 'senha12345' }).expect(200);
      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejeita senha errada e e-mail inexistente com 401', async () => {
      await registerUser(app, 'ana@example.com');
      await http().post('/auth/login').send({ email: 'ana@example.com', password: 'errada12345' }).expect(401);
      await http().post('/auth/login').send({ email: 'ninguem@example.com', password: 'senha12345' }).expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('exige token (401)', async () => {
      await http().get('/auth/me').expect(401);
      await http().get('/auth/me').set(...bearer('token-invalido')).expect(401);
    });

    it('retorna o perfil do usuário autenticado (200)', async () => {
      const user = await registerUser(app, 'ana@example.com');
      const response = await http().get('/auth/me').set(...bearer(user.token)).expect(200);
      expect(response.body).toMatchObject({ id: user.id, email: 'ana@example.com', role: 'USER' });
    });
  });
});
