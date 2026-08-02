import { NextResponse } from "next/server"
import { HubSpotError } from "@/lib/hubspot"
import { createTask, listTasks } from "@/lib/hubspot"
import type { TaskPriority, TaskStatus, TaskType } from "@/lib/hubspot"
import {
  getAccessTokenFromRequest,
  readJsonBody,
  toErrorResponse,
} from "@/lib/hubspot/route-helpers"

export const runtime = "nodejs"

// GET /api/hubspot/tasks — list. Optional: ?limit, ?after, ?properties (csv),
// ?associations (csv), ?archived, plus credential_id via header/query.
export async function GET(request: Request) {
  try {
    const accessToken = await getAccessTokenFromRequest(request)
    const params = new URL(request.url).searchParams
    const limit = params.get("limit")
    const after = params.get("after") ?? undefined
    const properties = params.get("properties")?.split(",").map((s) => s.trim()).filter(Boolean)
    const associations = params.get("associations")?.split(",").map((s) => s.trim()).filter(Boolean)
    const archived = params.get("archived")
    const response = await listTasks({
      accessToken,
      limit: limit ? Number(limit) : undefined,
      after,
      properties,
      associations,
      archived: archived === "true",
    })
    return NextResponse.json(response)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/hubspot/tasks — create. See docs/tool_defination.md for the full schema.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request)
    const accessToken = await getAccessTokenFromRequest(request, body)
    if (typeof body.due_date !== "string" || !body.due_date) {
      throw new HubSpotError("due_date is required (ISO 8601 UTC or Unix ms as string)", 400, null)
    }
    const response = await createTask({
      accessToken,
      dueDate: body.due_date,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      ownerId: typeof body.owner_id === "string" ? body.owner_id : undefined,
      status: typeof body.status === "string" ? (body.status as TaskStatus) : undefined,
      priority: typeof body.priority === "string" ? (body.priority as TaskPriority) : undefined,
      type: typeof body.type === "string" ? (body.type as TaskType) : undefined,
      reminderAt: typeof body.reminder_at === "string" ? body.reminder_at : undefined,
      queueMembershipIds:
        typeof body.queue_membership_ids === "string" ? body.queue_membership_ids : undefined,
      contactId:
        typeof body.contact_id === "string" || typeof body.contact_id === "number"
          ? body.contact_id
          : undefined,
      extraAssociations: Array.isArray(body.extra_associations)
        ? (body.extra_associations as Array<{
            toId: string | number
            associationCategory?: "HUBSPOT_DEFINED" | "USER_DEFINED"
            associationTypeId: number
          }>)
        : undefined,
    })
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
