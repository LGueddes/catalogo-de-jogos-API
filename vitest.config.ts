import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['test/setup-unit.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.module.ts', 'src/**/*.spec.ts'],
    },
  },
  // O SWC emite os metadados dos decorators (necessários para a injeção de dependência do NestJS).
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
