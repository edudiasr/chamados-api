import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/preparar-banco.ts'],
    // os arquivos dividem o mesmo banco de teste, então um de cada vez
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TESTE ?? 'postgres://chamados:chamados@localhost:5434/chamados_teste',
      REDIS_URL: process.env.REDIS_URL_TESTE ?? 'redis://localhost:6380/1',
      JWT_SECRET: 'segredo-so-para-os-testes-e2e-000000000',
    },
  },
});
