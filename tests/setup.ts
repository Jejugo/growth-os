import 'dotenv/config'

// Valores mínimos para módulos que validam ambiente no boot. Os testes de
// integração usam o DATABASE_URL real do .env; os de unidade não tocam banco.
process.env.AUTH_SECRET ??= 'test-secret-value-at-least-16-chars'
process.env.AUTH_GITHUB_ID ??= 'test'
process.env.AUTH_GITHUB_SECRET ??= 'test'
process.env.AUTH_ALLOWED_EMAILS ??= 'teste@exemplo.com'
process.env.ANTHROPIC_API_KEY ??= 'test'
process.env.CRAWLER_USER_AGENT ??= 'GrowthOSBot/0.1 (teste)'
