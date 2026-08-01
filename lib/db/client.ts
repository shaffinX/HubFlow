import postgres, { type Sql } from "postgres"

declare global {
  // Preserve the pool across HMR reloads in dev so we don't leak connections.

  var __hubflow_sql: Sql | undefined
}

let _sql: Sql | null = null

export function getSql(): Sql {
  if (_sql) return _sql
  if (globalThis.__hubflow_sql) {
    _sql = globalThis.__hubflow_sql
    return _sql
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Use the Supabase session-mode pooler (port 5432) or the direct connection URI — NOT the transaction pooler on 6543. PostgresSaver and other consumers rely on prepared statements, which the transaction pooler does not support, and the failure is intermittent rather than a clean error. Project Settings → Database → Connection string → Session pooler (or Direct connection)."
    )
  }

  _sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  if (process.env.NODE_ENV !== "production") {
    globalThis.__hubflow_sql = _sql
  }
  return _sql
}

export type { Sql }
