import { execSync } from 'node:child_process';
import { applyTestEnv } from './test-env.js';

/** Aplica as migrations no banco de teste antes da suíte e2e. */
export default function setup(): void {
  applyTestEnv();
  if (process.env.E2E_SKIP_MIGRATIONS === '1') {
    return;
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
