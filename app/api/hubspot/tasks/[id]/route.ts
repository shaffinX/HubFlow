import { NextResponse } from "next/server"
import { deleteTask, getTask, updateTask } from "@/lib/hubspot"
import type { TaskPriority, TaskStatus, TaskType } from "@/lib/hubspot"
import {
  getAccessTokenFromRequest,
  readJsonBody,
  toErrorResponse,
} from "@/lib/hubspot/route-helpers"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/hubspot/tasks/:id — retrieve one task with associations.
export async function GET(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const accessToken = await getAccessTokenFromRequest(request)
    const params = new URL(request.url).searchParams
    const properties = params.get("properties")?.split(",").map((s) => s.trim()).filter(Boolean)
    const associations = params.get("associations")?.split(",").map((s) => s.trim()).filter(Boolean)
    const archived = params.get("archived") === "true"
    const task = await getTask({ accessToken, taskId: id, properties, associations, archived })
    return NextResponse.json(task)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// PATCH /api/hubspot/tasks/:id — partial update.
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = await readJsonBody(request)
    const accessToken = await getAccessTokenFromRequest(request, body)
    const task = await updateTask({
      accessToken,
      taskId: id,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      dueDate: typeof body.due_date === "string" ? body.due_date : undefined,
      ownerId: typeof body.owner_id === "string" ? body.owner_id : undefined,
      status: typeof body.status === "string" ? (body.status as TaskStatus) : undefined,
      priority: typeof body.priority === "string" ? (body.priority as TaskPriority) : undefined,
      type: typeof body.type === "string" ? (body.type as TaskType) : undefined,
      reminderAt: typeof body.reminder_at === "string" ? body.reminder_at : undefined,
      queueMembershipIds:
        typeof body.queue_membership_ids === "string" ? body.queue_membership_ids : undefined,
      properties:
        body.properties && typeof body.properties === "object"
          ? (body.properties as Record<string, string | null>)
          : undefined,
    })
    return NextResponse.json(task)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/hubspot/tasks/:id — soft delete (HubSpot recycles for 30 days).
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const accessToken = await getAccessTokenFromRequest(request)
    const response = await deleteTask({ accessToken, taskId: id })
    return NextResponse.json(response)
  } catch (error) {
    return toErrorResponse(error)
  }
}
