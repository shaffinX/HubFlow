import { NextResponse } from "next/server"
import { MailerConfigError, sendMail, verifyMailer } from "@/lib/mailer"

export const runtime = "nodejs"

// GET /api/hubspot/emails/send
// Connection test only — runs nodemailer's transporter.verify() against the
// configured SMTP host. No email is sent. Handy for smoke-testing SMTP env
// vars from Postman before firing a real POST.
export async function GET() {
  try {
    const info = await verifyMailer()
    return NextResponse.json({
      ok: true,
      host: info.host,
      port: info.port,
      secure: info.secure,
      message: "SMTP transporter verified — connection and auth accepted.",
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/hubspot/emails/send
// Sends an email via nodemailer using the HubFlow-branded HTML template.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      to?: string | string[]
      subject?: string
      body?: string
      heading?: string
      cta_label?: string
      cta_url?: string
      preheader?: string
      from?: string
      cc?: string | string[]
      bcc?: string | string[]
      reply_to?: string
    }

    if (!body.to || (Array.isArray(body.to) && body.to.length === 0)) {
      return NextResponse.json({ error: "`to` is required" }, { status: 400 })
    }
    if (typeof body.subject !== "string" || !body.subject.trim()) {
      return NextResponse.json({ error: "`subject` is required" }, { status: 400 })
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "`body` is required" }, { status: 400 })
    }

    const result = await sendMail({
      to: body.to,
      subject: body.subject,
      body: body.body,
      heading: body.heading,
      ctaLabel: body.cta_label,
      ctaUrl: body.cta_url,
      preheader: body.preheader,
      from: body.from,
      cc: body.cc,
      bcc: body.bcc,
      replyTo: body.reply_to,
    })
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof MailerConfigError) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: message }, { status: 500 })
}
