import 'dotenv/config'
import { afterAll } from 'vitest'

// Valores mínimos para módulos que validam ambiente no boot.
process.env.AUTH_SECRET ??= 'test-secret-value-at-least-16-chars'
process.env.AUTH_GITHUB_ID ??= 'test'
process.env.AUTH_GITHUB_SECRET ??= 'test'
process.env.AUTH_ALLOWED_EMAILS ??= 'teste@exemplo.com'
process.env.ANTHROPIC_API_KEY ??= 'test'
process.env.CRAWLER_USER_AGENT ??= 'GrowthOSBot/0.1 (teste)'

// Sinaliza para src/lib/db que estamos em modo vitest (SQLite em memória)
process.env.VITEST = 'true'

// Fecha o banco de teste após todos os testes
afterAll(async () => {
  const globalForDb = globalThis as any
  if (globalForDb.__growthosSqliteDb) {
    globalForDb.__growthosSqliteDb.close()
    globalForDb.__growthosSqliteDb = undefined
  }
})
