import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { createCredential, listCredentials } from "@/lib/models/credential"
import { encryptToken } from "@/lib/db/encryption"

export const runtime = "nodejs"

export async function GET() {
  try {
    const credentials = await listCredentials(getSql())
    return NextResponse.json({ credentials })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { label?: string; token?: string }
    const label = body.label?.trim()
    const token = body.token
    if (!label || !token) {
      return NextResponse.json({ error: "label and token are required" }, { status: 400 })
    }
    const encrypted = encryptToken(token)
    const cred = await createCredential(getSql(), label, encrypted)
    return NextResponse.json(
      { credential: { id: cred.id, label: cred.label, created_at: cred.created_at } },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
