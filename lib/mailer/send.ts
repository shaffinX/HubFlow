import { getMailer, getSmtpFrom } from "./client"
import { renderEmailHtml, renderEmailText } from "./template"

export interface SendMailInput {
  // Recipient — accepts single string or array of addresses.
  to: string | string[]
  subject: string
  // Plain-text message body. Rendered into the HubFlow HTML template with
  // paragraph breaks preserved.
  body: string
  // Optional big-heading line above the body.
  heading?: string
  // Optional call-to-action button (both fields required together).
  ctaLabel?: string
  ctaUrl?: string
  // Optional inbox preview text.
  preheader?: string
  // Override the default From (defaults to SMTP_FROM / SMTP_USER).
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
}

export interface SendMailResult {
  messageId: string
  accepted: string[]
  rejected: string[]
  response: string
  from: string
  to: string[]
  subject: string
}

function toRecipientList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const toList = toRecipientList(input.to)
  if (toList.length === 0) {
    throw new Error("`to` is required (a single email address or a non-empty array)")
  }
  if (!input.subject?.trim()) throw new Error("`subject` is required")
  if (!input.body?.trim()) throw new Error("`body` is required")

  const html = renderEmailHtml({
    heading: input.heading,
    body: input.body,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    preheader: input.preheader,
  })
  const text = renderEmailText({
    heading: input.heading,
    body: input.body,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
  })

  const from = input.from ?? getSmtpFrom()
  const mailer = getMailer()

  const info = await mailer.sendMail({
    from,
    to: toList,
    cc: toRecipientList(input.cc),
    bcc: toRecipientList(input.bcc),
    replyTo: input.replyTo,
    subject: input.subject,
    html,
    text,
  })

  return {
    messageId: info.messageId,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    response: String(info.response ?? ""),
    from,
    to: toList,
    subject: input.subject,
  }
}
