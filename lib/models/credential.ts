import type { Sql } from "postgres"

export interface Credential {
  id: string
  label: string
  encrypted_token: string
  created_at: string
}

export type CredentialSafe = Omit<Credential, "encrypted_token">

export async function listCredentials(sql: Sql): Promise<CredentialSafe[]> {
  const rows = await sql<CredentialSafe[]>`
    SELECT id, label, created_at FROM credentials ORDER BY created_at DESC
  `
  return rows
}

export async function createCredential(
  sql: Sql,
  label: string,
  encryptedToken: string,
): Promise<Credential> {
  const [row] = await sql<Credential[]>`
    INSERT INTO credentials (label, encrypted_token)
    VALUES (${label}, ${encryptedToken})
    RETURNING *
  `
  return row
}

export async function getCredential(sql: Sql, id: string): Promise<Credential | null> {
  const [row] = await sql<Credential[]>`SELECT * FROM credentials WHERE id = ${id}`
  return row ?? null
}

export async function updateCredential(
  sql: Sql,
  id: string,
  encryptedToken: string,
): Promise<Credential | null> {
  const [row] = await sql<Credential[]>`
    UPDATE credentials SET encrypted_token = ${encryptedToken}
    WHERE id = ${id} RETURNING *
  `
  return row ?? null
}

export async function deleteCredential(sql: Sql, id: string): Promise<void> {
  await sql`DELETE FROM credentials WHERE id = ${id}`
}
