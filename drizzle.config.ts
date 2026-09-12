import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  // Migration precisa da conexão direta (sem "-pooler") — a pooled da Neon não sustenta estado de
  // sessão. Sem DIRECT_DATABASE_URL definida (Postgres local do docker-compose), usa DATABASE_URL
  // normalmente — só faz diferença de verdade com Neon.
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
})
