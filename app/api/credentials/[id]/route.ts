import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import {
  deleteCredential,
  getCredential,
  updateCredential,
} from "@/lib/models/credential"
import { encryptToken } from "@/lib/db/encryption"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const cred = await getCredential(getSql(), id)
    if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // Never leak the encrypted token — return the safe view only.
    return NextResponse.json({
      credential: { id: cred.id, label: cred.label, created_at: cred.created_at },
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = (await request.json()) as { token?: string }
    const token = typeof body.token === "string" ? body.token : ""
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 })
    }
    const encrypted = encryptToken(token)
    const updated = await updateCredential(getSql(), id, encrypted)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({
      credential: { id: updated.id, label: updated.label, created_at: updated.created_at },
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    await deleteCredential(getSql(), id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
