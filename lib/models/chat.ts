import type { Sql } from "postgres"

export interface Chat {
  id: string
  name: string
  credential_id: string | null
  created_at: string
  updated_at: string
}

export async function listChats(sql: Sql): Promise<Chat[]> {
  return sql<Chat[]>`SELECT * FROM chats ORDER BY updated_at DESC`
}

export async function createChat(
  sql: Sql,
  name: string,
  credentialId: string | null = null,
): Promise<Chat> {
  const [row] = await sql<Chat[]>`
    INSERT INTO chats (name, credential_id)
    VALUES (${name}, ${credentialId})
    RETURNING *
  `
  return row
}

export async function getChat(sql: Sql, id: string): Promise<Chat | null> {
  const [row] = await sql<Chat[]>`SELECT * FROM chats WHERE id = ${id}`
  return row ?? null
}

export async function renameChat(sql: Sql, id: string, name: string): Promise<Chat | null> {
  const [row] = await sql<Chat[]>`
    UPDATE chats SET name = ${name}, updated_at = now()
    WHERE id = ${id} RETURNING *
  `
  return row ?? null
}

export async function bindCredential(
  sql: Sql,
  id: string,
  credentialId: string | null,
): Promise<Chat | null> {
  const [row] = await sql<Chat[]>`
    UPDATE chats SET credential_id = ${credentialId}, updated_at = now()
    WHERE id = ${id} RETURNING *
  `
  return row ?? null
}

export async function touchChat(sql: Sql, id: string): Promise<void> {
  await sql`UPDATE chats SET updated_at = now() WHERE id = ${id}`
}

export async function deleteChat(sql: Sql, id: string): Promise<void> {
  await sql`DELETE FROM chats WHERE id = ${id}`
}
