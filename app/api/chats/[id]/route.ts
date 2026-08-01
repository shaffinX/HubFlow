import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { bindCredential, deleteChat, getChat, renameChat } from "@/lib/models/chat"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const chat = await getChat(getSql(), id)
    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ chat })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = (await request.json()) as { name?: string; credential_id?: string | null }
    const sql = getSql()
    let chat = null
    if (typeof body.name === "string") {
      chat = await renameChat(sql, id, body.name)
    }
    if (body.credential_id !== undefined) {
      chat = await bindCredential(sql, id, body.credential_id)
    }
    if (!chat) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    return NextResponse.json({ chat })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    await deleteChat(getSql(), id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
