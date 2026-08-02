import { NextResponse } from "next/server"
import { listContacts } from "@/lib/hubspot"
import { getAccessTokenFromRequest, toErrorResponse } from "@/lib/hubspot/route-helpers"

export const runtime = "nodejs"

// GET /api/hubspot/contacts — list. Params: limit, after, properties (csv), archived.
export async function GET(request: Request) {
  try {
    const accessToken = await getAccessTokenFromRequest(request)
    const params = new URL(request.url).searchParams
    const limit = params.get("limit")
    const after = params.get("after") ?? undefined
    const properties = params.get("properties")?.split(",").map((s) => s.trim()).filter(Boolean)
    const archived = params.get("archived") === "true"
    const response = await listContacts({
      accessToken,
      limit: limit ? Number(limit) : undefined,
      after,
      properties,
      archived,
    })
    return NextResponse.json(response)
  } catch (error) {
    return toErrorResponse(error)
  }
}
