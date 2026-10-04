export interface Env {
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN_SECONDS: number;
  SYNC_ENABLED: boolean;
  STEAM_APP_IDS: string[];
}

function required(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value.trim();
}

function toInt(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} deve ser um inteiro positivo`);
  }
  return parsed;
}

/** Valida e converte as variáveis de ambiente na inicialização (falha rápido se algo estiver errado). */
export function validateEnv(raw: Record<string, unknown>): Env {
  const jwtSecret = required(raw, 'JWT_SECRET');
  if (jwtSecret.length < 16) {
    throw new Error('JWT_SECRET deve ter pelo menos 16 caracteres');
  }

  return {
    PORT: toInt(raw, 'PORT', 3000),
    DATABASE_URL: required(raw, 'DATABASE_URL'),
    REDIS_URL: required(raw, 'REDIS_URL'),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN_SECONDS: toInt(raw, 'JWT_EXPIRES_IN_SECONDS', 3600),
    SYNC_ENABLED: String(raw.SYNC_ENABLED ?? 'true').toLowerCase() === 'true',
    STEAM_APP_IDS: String(raw.STEAM_APP_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id)),
  };
}
