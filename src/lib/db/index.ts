import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import postgres from 'postgres'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '@/lib/env'
import * as schema from './schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Um único pool por processo. Em dev o hot-reload recria os módulos, então o
 * cliente vive no globalThis para não vazar conexões a cada salvamento.
 * Testes de domínio usam SQLite em memória; tests/integration/*.test.ts que
 * precisam de Postgres real usam `TEST_DATABASE_URL` (banco isolado, nunca o
 * de dev/prod) — ver `requireTestDatabaseUrl` abaixo. dev/prod usam Postgres
 * via `DATABASE_URL`.
 */
const globalForDb = globalThis as unknown as {
  __growthosSql?: ReturnType<typeof postgres>
  __growthosSqliteDb?: Database.Database
  __growthosDb?: ReturnType<typeof createDb>
}

/**
 * `tests/integration/*.test.ts` precisam de Postgres real (transação, constraint única, cascade —
 * nada disso o SQLite em memória reproduz fielmente). Só é chamada quando esses arquivos pedem
 * explicitamente (`USE_TEST_POSTGRES=true`) — nunca como fallback silencioso. A checagem
 * `=== env().DATABASE_URL` existe porque já apagou dado de desenvolvimento de verdade uma vez:
 * um `DELETE` de teste rodando sem querer contra o banco de dev.
 */
function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL não definida. Testes de integração contra Postgres real precisam de um ' +
        'banco isolado — ver .env.example. Nunca aponte para o mesmo banco de DATABASE_URL.',
    )
  }
  if (url === env().DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL é igual a DATABASE_URL — recusando rodar. Isso apagaria dado de ' +
        'desenvolvimento de verdade (os testes de integração fazem DELETE em massa nas tabelas).',
    )
  }
  return url
}

function createDb() {
  if (process.env.VITEST === 'true') {
    if (process.env.USE_TEST_POSTGRES === 'true') {
      globalForDb.__growthosSql ??= postgres(requireTestDatabaseUrl(), { max: 1 })
      return drizzlePostgres(globalForDb.__growthosSql, { schema })
    }

    if (!globalForDb.__growthosSqliteDb) {
      globalForDb.__growthosSqliteDb = new Database(':memory:')
      const migrationsFolder = path.resolve(__dirname, '../../..', 'drizzle')
      migrate(globalForDb.__growthosSqliteDb, { migrationsFolder })
    }
    return drizzleSqlite(globalForDb.__growthosSqliteDb, { schema })
  }

  globalForDb.__growthosSql ??= postgres(env().DATABASE_URL, {
    max: env().NODE_ENV === 'production' ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return drizzlePostgres(globalForDb.__growthosSql, { schema })
}

function realDb() {
  globalForDb.__growthosDb ??= createDb()
  return globalForDb.__growthosDb
}

export type Db = ReturnType<typeof createDb>
/** Tipo de uma transação — services recebem isto para poderem compor. */
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Conexão preguiçosa. Sem isto, qualquer import transitivo — inclusive num
 * teste de função pura — abriria conexão e exigiria DATABASE_URL. O proxy
 * mantém `db.select()` idêntico nos call sites.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const instance = realDb()
    const value = Reflect.get(instance, property, instance) as unknown
    return typeof value === 'function' ? value.bind(instance) : value
  },
  // O adapter do Auth.js identifica o dialeto por `instanceof PgDatabase`, que
  // consulta o protótipo — sem este trap ele veria um objeto vazio e falharia.
  getPrototypeOf() {
    return Object.getPrototypeOf(realDb()) as object
  },
  has(_target, property) {
    return Reflect.has(realDb(), property)
  },
})

export { schema }
