import { getSql } from "@/lib/db/client"
import { getChat } from "@/lib/models/chat"
import { listCredentials } from "@/lib/models/credential"
import { resolveAccessToken } from "@/lib/hubspot"

// Resolves the HubSpot access token the agent should use for this chat.
//   1. If the chat has an explicit credential_id, use that credential.
//   2. Otherwise fall back to the "default" credential managed by the Settings
//      page (the most recently created row — matches the list endpoint's sort).
//   3. If neither exists, return null so tools can raise a friendly error.
export async function getChatAccessToken(chatId: string): Promise<string | null> {
  const sql = getSql()
  const chat = await getChat(sql, chatId)
  if (chat?.credential_id) {
    try {
      return await resolveAccessToken(chat.credential_id)
    } catch {
      // Bound credential was deleted out from under this chat — fall through
      // to the default so we don't hard-fail the whole run.
    }
  }
  const [first] = await listCredentials(sql)
  if (first) {
    return resolveAccessToken(first.id)
  }
  return null
}
