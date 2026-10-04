/** Variáveis usadas pelos testes e2e. Aponte para um banco e um Redis DEDICADOS a testes. */
export function applyTestEnv(): void {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gamecatalog_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'segredo-somente-para-testes-e2e';
  process.env.JWT_EXPIRES_IN_SECONDS = '3600';
  process.env.SYNC_ENABLED = 'false';
  process.env.STEAM_APP_IDS = '620,105600';

  // Trava de segurança: os testes apagam todas as tabelas, então o banco precisa ser claramente de teste.
  if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) {
    throw new Error('Os testes e2e só rodam em um banco cujo nome contém "test" (veja TEST_DATABASE_URL).');
  }
}
