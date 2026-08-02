import { NextResponse } from "next/server"
import { searchContacts } from "@/lib/hubspot"
import type { SearchFilter, SearchSort } from "@/lib/hubspot"
import {
  getAccessTokenFromRequest,
  readJsonBody,
  toErrorResponse,
} from "@/lib/hubspot/route-helpers"

export const runtime = "nodejs"

// POST /api/hubspot/contacts/search — filter + sort + paginate contacts.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request)
    const accessToken = await getAccessTokenFromRequest(request, body)
    const response = await searchContacts({
      accessToken,
      filterGroups: Array.isArray(body.filter_groups)
        ? (body.filter_groups as Array<{ filters: SearchFilter[] }>)
        : undefined,
      query: typeof body.query === "string" ? body.query : undefined,
      properties: Array.isArray(body.properties) ? (body.properties as string[]) : undefined,
      sorts: Array.isArray(body.sorts) ? (body.sorts as SearchSort[]) : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      after: typeof body.after === "string" ? body.after : undefined,
    })
    return NextResponse.json(response)
  } catch (error) {
    return toErrorResponse(error)
  }
}
