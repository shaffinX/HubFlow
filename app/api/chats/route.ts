import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { createChat, listChats } from "@/lib/models/chat"

export const runtime = "nodejs"

export async function GET() {
  try {
    const chats = await listChats(getSql())
    return NextResponse.json({ chats })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; credential_id?: string | null }
    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const chat = await createChat(getSql(), name, body.credential_id ?? null)
    return NextResponse.json({ chat }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
