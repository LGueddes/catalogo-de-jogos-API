import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'um-segredo-bem-longo-123',
};

describe('validateEnv', () => {
  it('aplica valores padrão e converte tipos', () => {
    const env = validateEnv({ ...valid, STEAM_APP_IDS: '620, 292030,abc,,105600' });
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN_SECONDS).toBe(3600);
    expect(env.SYNC_ENABLED).toBe(true);
    expect(env.STEAM_APP_IDS).toEqual(['620', '292030', '105600']);
  });

  it('respeita PORT e SYNC_ENABLED informados', () => {
    const env = validateEnv({ ...valid, PORT: '8080', SYNC_ENABLED: 'false' });
    expect(env.PORT).toBe(8080);
    expect(env.SYNC_ENABLED).toBe(false);
  });

  it('falha quando uma variável obrigatória está ausente', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejeita JWT_SECRET curto demais', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
  });

  it('rejeita PORT inválida', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });
});
