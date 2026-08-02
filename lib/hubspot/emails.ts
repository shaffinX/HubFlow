import { hubspotFetch } from "./client"

export interface SendEmailInput {
  accessToken: string
  // Content ID of a published transactional email in HubSpot. Required.
  emailId: number
  to: string
  // "Sender Name <sender@yourdomain.com>". Domain must be a connected sending domain.
  from?: string
  // Idempotency key — HubSpot dedupes retries against this per account.
  sendId?: string
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  // Contact properties written to the recipient's contact record during send.
  contactProperties?: Record<string, string>
  // Values available in the template as {{ custom.NAME }}. Not stored.
  customProperties?: Record<string, string>
}

export interface SendEmailResponse {
  requestedAt: string
  status: "PENDING" | "PROCESSING" | "CANCELED" | "COMPLETE"
  sendResult: string
  message?: string
}

// Single-Send transactional email. See §8a of hubspot-reference.md — the
// portal must have the Transactional Email add-on and an email published with
// send method "Through an API".
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResponse> {
  const message: Record<string, unknown> = { to: input.to }
  if (input.from !== undefined) message.from = input.from
  if (input.sendId !== undefined) message.sendId = input.sendId
  if (input.cc?.length) message.cc = input.cc
  if (input.bcc?.length) message.bcc = input.bcc
  if (input.replyTo?.length) message.replyTo = input.replyTo

  const body: Record<string, unknown> = {
    emailId: input.emailId,
    message,
  }
  if (input.contactProperties && Object.keys(input.contactProperties).length) {
    body.contactProperties = input.contactProperties
  }
  if (input.customProperties && Object.keys(input.customProperties).length) {
    body.customProperties = input.customProperties
  }

  return hubspotFetch<SendEmailResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/marketing/transactional/v4/single-email/send",
    body,
  })
}
