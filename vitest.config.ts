import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // O crawler respeita 1 req/s por domínio, então um teste que roda duas
    // análises leva ~10s. O limite alto é da politeness, não de lentidão.
    testTimeout: 60_000,
    // tests/integration/*.test.ts rodam contra um Postgres real (TEST_DATABASE_URL, banco isolado
    // — nunca o de dev/prod, ver src/lib/db/index.ts) compartilhado ENTRE os dois arquivos de
    // integração — rodá-los em paralelo faz o `beforeEach` de um (que limpa `products`) atropelar
    // o teste em andamento do outro. `fileParallelism: false` roda todo arquivo em sequência.
    fileParallelism: false,
  },
})
