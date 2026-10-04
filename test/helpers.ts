import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.constants.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Esvazia o banco e o Redis de teste para que cada teste comece do zero. */
export async function resetState(app: INestApplication): Promise<void> {
  await app.get(PrismaService).$executeRawUnsafe('TRUNCATE TABLE "Review", "Game", "User" RESTART IDENTITY CASCADE');
  await app.get<Redis>(REDIS).flushdb();
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function registerUser(app: INestApplication, email = 'user@example.com'): Promise<TestUser> {
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name: 'Usuário de Teste', password: 'senha12345' })
    .expect(201);
  return { id: response.body.user.id, email, token: response.body.accessToken };
}

/** Cadastra um usuário, promove a ADMIN direto no banco e faz login para obter um token com o novo papel. */
export async function createAdmin(app: INestApplication, email = 'admin@example.com'): Promise<TestUser> {
  const user = await registerUser(app, email);
  await app.get(PrismaService).user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'senha12345' }).expect(200);
  return { ...user, token: login.body.accessToken };
}

export const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];
