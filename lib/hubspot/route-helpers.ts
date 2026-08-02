import { NextResponse } from "next/server"
import { HubSpotError, resolveAccessToken } from "./index"

// Extracts credentials for the temporary tool-test endpoints. Order of precedence:
//   1. `x-credential-id` header (keeps IDs out of URLs — cleaner for cURL/Postman)
//   2. `credential_id` query string param (handy for GET)
//   3. `credential_id` on the JSON body (POST/PATCH)
export async function getAccessTokenFromRequest(
  request: Request,
  parsedBody?: Record<string, unknown>,
): Promise<string> {
  const headerId = request.headers.get("x-credential-id")
  const queryId = new URL(request.url).searchParams.get("credential_id")
  const bodyId = parsedBody?.credential_id
  const credentialId =
    (headerId && headerId.trim()) ||
    (queryId && queryId.trim()) ||
    (typeof bodyId === "string" && bodyId.trim())

  if (!credentialId) {
    throw new HubSpotError(
      "credential_id is required (pass via x-credential-id header, ?credential_id query, or body.credential_id)",
      400,
      null,
    )
  }
  return resolveAccessToken(credentialId)
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof HubSpotError) {
    return NextResponse.json(
      {
        error: error.message,
        status: error.status,
        correlationId: error.correlationId,
        hubspot: error.body,
      },
      { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new HubSpotError("Request body is not valid JSON", 400, null)
  }
}
