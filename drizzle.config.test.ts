import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

/**
 * Mesmo schema/migrations de `drizzle.config.ts`, mas aponta pro banco de teste isolado
 * (`TEST_DATABASE_URL`) em vez de `DATABASE_URL` — usado só por `pnpm db:migrate:test`, pra
 * manter `tests/integration/*.test.ts` num banco separado do de desenvolvimento.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.TEST_DATABASE_URL! },
  strict: true,
  verbose: true,
})
