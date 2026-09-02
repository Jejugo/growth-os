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
    // SQLite em memória não é thread-safe; roda tudo em um thread único.
    singleThread: true,
  },
  // Silencia erro de cleanup do better-sqlite3 (módulo nativo com vitest)
  esbuild: {
    define: {
      'global.__vitest_suppress_channel_closed__': 'true',
    },
  },
})
