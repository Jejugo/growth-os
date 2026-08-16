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
    // Os testes de integração compartilham um banco; rodar em série evita
    // que um limpe as tabelas debaixo do outro.
    fileParallelism: false,
  },
})
