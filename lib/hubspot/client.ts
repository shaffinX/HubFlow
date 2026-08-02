import { getSql } from "@/lib/db/client"
import { decryptToken } from "@/lib/db/encryption"
import { getCredential } from "@/lib/models/credential"

export const HUBSPOT_BASE_URL = "https://api.hubapi.com"

// Task -> Contact, HUBSPOT_DEFINED. Fixed per project spec.
export const TASK_TO_CONTACT_ASSOCIATION_TYPE_ID = 204
export const TASK_TO_CONTACT_ASSOCIATION_CATEGORY = "HUBSPOT_DEFINED" as const

export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = "HubSpotError"
  }
}

interface FetchOptions {
  accessToken: string
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
}

// Thin wrapper around fetch that adds the Bearer header, encodes query params
// and body, and turns HubSpot's error envelope into a real Error.
export async function hubspotFetch<T = unknown>({
  accessToken,
  method = "GET",
  path,
  query,
  body,
}: FetchOptions): Promise<T> {
  if (!accessToken) {
    throw new HubSpotError("HubSpot access token is missing", 401, null)
  }

  const url = new URL(path.startsWith("http") ? path : `${HUBSPOT_BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const parsed = text ? safeJson(text) : null

  if (!response.ok) {
    const envelope = parsed as { message?: string; correlationId?: string } | null
    throw new HubSpotError(
      envelope?.message || `HubSpot ${response.status} ${response.statusText}`,
      response.status,
      parsed,
      envelope?.correlationId,
    )
  }

  return parsed as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Resolves an access token from a stored credential row. Used by the temporary
// API endpoints; agent code will pass the raw token directly.
export async function resolveAccessToken(credentialId: string): Promise<string> {
  const credential = await getCredential(getSql(), credentialId)
  if (!credential) {
    throw new HubSpotError(`Credential ${credentialId} not found`, 404, null)
  }
  return decryptToken(credential.encrypted_token)
}
