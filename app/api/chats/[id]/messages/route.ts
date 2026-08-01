import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { insertMessage, listMessages, type MessageRole, type MessageStatus } from "@/lib/models/message"
import { touchChat } from "@/lib/models/chat"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const messages = await listMessages(getSql(), id)
    return NextResponse.json({ messages })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id: chatId } = await ctx.params
    const body = (await request.json()) as {
      role: MessageRole
      client_uuid: string
      content?: string
      payload?: unknown
      status?: MessageStatus
    }
    if (body.role !== "user" && body.role !== "assistant") {
      return NextResponse.json({ error: "role must be 'user' or 'assistant'" }, { status: 400 })
    }
    if (!body.client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 })
    }
    const sql = getSql()
    const message = await insertMessage(sql, {
      chat_id: chatId,
      role: body.role,
      content: body.content,
      payload: body.payload,
      client_uuid: body.client_uuid,
      status: body.status,
    })
    await touchChat(sql, chatId)
    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
