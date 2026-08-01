import type { Sql } from "postgres"

export type MessageRole = "user" | "assistant"
export type MessageStatus = "pending" | "streaming" | "complete" | "error"

export interface Message {
  id: string
  chat_id: string
  sequence: number
  role: MessageRole
  content: string
  payload: unknown | null
  client_uuid: string
  status: MessageStatus
  created_at: string
}

export async function listMessages(sql: Sql, chatId: string): Promise<Message[]> {
  return sql<Message[]>`
    SELECT * FROM messages
    WHERE chat_id = ${chatId}
    ORDER BY sequence ASC
  `
}

// Idempotent insert keyed on client_uuid; sequence is computed atomically per chat
// so two rows written in the same millisecond during streaming still order deterministically.
export async function insertMessage(
  sql: Sql,
  input: {
    chat_id: string
    role: MessageRole
    content?: string
    payload?: unknown
    client_uuid: string
    status?: MessageStatus
  },
): Promise<Message> {
  return sql.begin(async (tx) => {
    const existing = await tx<Message[]>`
      SELECT * FROM messages WHERE client_uuid = ${input.client_uuid}
    `
    if (existing.length > 0) return existing[0]

    const [nextRow] = await tx<{ next: number }[]>`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS next
      FROM messages WHERE chat_id = ${input.chat_id}
    `

    const [row] = await tx<Message[]>`
      INSERT INTO messages (chat_id, sequence, role, content, payload, client_uuid, status)
      VALUES (
        ${input.chat_id},
        ${nextRow.next},
        ${input.role},
        ${input.content ?? ""},
        ${tx.json((input.payload ?? null) as never)},
        ${input.client_uuid},
        ${input.status ?? "complete"}
      )
      RETURNING *
    `
    return row
  }) as Promise<Message>
}

export async function updateMessage(
  sql: Sql,
  id: string,
  patch: { content?: string; payload?: unknown; status?: MessageStatus },
): Promise<Message | null> {
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.content !== undefined) {
    sets.push(`content = $${sets.length + 1}`)
    params.push(patch.content)
  }
  if (patch.payload !== undefined) {
    sets.push(`payload = $${sets.length + 1}::jsonb`)
    params.push(JSON.stringify(patch.payload))
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${sets.length + 1}`)
    params.push(patch.status)
  }
  if (sets.length === 0) {
    const [row] = await sql<Message[]>`SELECT * FROM messages WHERE id = ${id}`
    return row ?? null
  }
  const query = `UPDATE messages SET ${sets.join(", ")} WHERE id = $${sets.length + 1} RETURNING *`
  params.push(id)
  const rows = (await sql.unsafe(query, params as never[])) as unknown as Message[]
  return rows[0] ?? null
}
