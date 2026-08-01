import type { Sql } from "postgres"

export interface AuditLogEntry {
  id: string
  chat_id: string
  tool: string
  args: unknown
  result: unknown
  created_at: string
}

export async function recordAudit(
  sql: Sql,
  input: { chat_id: string; tool: string; args: unknown; result: unknown },
): Promise<AuditLogEntry> {
  const [row] = await sql<AuditLogEntry[]>`
    INSERT INTO audit_log (chat_id, tool, args, result)
    VALUES (
      ${input.chat_id},
      ${input.tool},
      ${sql.json((input.args ?? null) as never)},
      ${sql.json((input.result ?? null) as never)}
    )
    RETURNING *
  `
  return row
}

export async function listAudit(sql: Sql, chatId: string): Promise<AuditLogEntry[]> {
  return sql<AuditLogEntry[]>`
    SELECT * FROM audit_log
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
  `
}
