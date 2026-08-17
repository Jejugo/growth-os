import { z } from 'zod'

/**
 * Validação de ambiente na borda. Falhar no boot com uma mensagem clara é
 * melhor do que falhar em produção no meio de uma publicação.
 *
 * Só é importado por código de servidor — nunca por componentes de cliente.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET precisa de ao menos 16 chars'),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  AUTH_ALLOWED_EMAILS: z
    .string()
    .min(1, 'Defina ao menos um e-mail na allowlist')
    .transform((v) =>
      v
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    )
    .refine((list) => list.length > 0, 'Allowlist vazia'),

  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),

  AI_MONTHLY_BUDGET_USD_PER_PRODUCT: z.coerce.number().positive().default(25),

  CRAWLER_USER_AGENT: z.string().min(1).default('GrowthOSBot/0.1'),

  // Distribuição — chave AES-256-GCM (64 chars hex = 32 bytes)
  DISTRIBUTION_ENCRYPTION_KEY: z.string().default(''),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

let cached: z.infer<typeof schema> | undefined

export function env(): z.infer<typeof schema> {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}\n\nVeja .env.example.`)
  }
  cached = parsed.data
  return cached
}
