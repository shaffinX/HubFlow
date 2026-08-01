import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { listAudit, recordAudit } from "@/lib/models/auditLog"

export const runtime = "nodejs"

// GET /api/audit?chat_id=UUID
export async function GET(request: Request) {
  try {
    const chatId = new URL(request.url).searchParams.get("chat_id")
    if (!chatId) return NextResponse.json({ error: "chat_id is required" }, { status: 400 })
    const entries = await listAudit(getSql(), chatId)
    return NextResponse.json({ entries })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chat_id?: string
      tool?: string
      args?: unknown
      result?: unknown
    }
    if (!body.chat_id || !body.tool) {
      return NextResponse.json({ error: "chat_id and tool are required" }, { status: 400 })
    }
    const entry = await recordAudit(getSql(), {
      chat_id: body.chat_id,
      tool: body.tool,
      args: body.args ?? null,
      result: body.result ?? null,
    })
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
