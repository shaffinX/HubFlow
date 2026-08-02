import { NextResponse } from "next/server"
import { HubSpotError, sendEmail } from "@/lib/hubspot"
import {
  getAccessTokenFromRequest,
  readJsonBody,
  toErrorResponse,
} from "@/lib/hubspot/route-helpers"

export const runtime = "nodejs"

// POST /api/hubspot/emails/send — HubSpot Single-Send transactional email.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request)
    const accessToken = await getAccessTokenFromRequest(request, body)

    const emailId = body.email_id
    if (typeof emailId !== "number") {
      throw new HubSpotError("email_id is required (number — content ID of a published template)", 400, null)
    }
    if (typeof body.to !== "string" || !body.to) {
      throw new HubSpotError("to is required (recipient address)", 400, null)
    }

    const response = await sendEmail({
      accessToken,
      emailId,
      to: body.to,
      from: typeof body.from === "string" ? body.from : undefined,
      sendId: typeof body.send_id === "string" ? body.send_id : undefined,
      cc: Array.isArray(body.cc) ? (body.cc as string[]) : undefined,
      bcc: Array.isArray(body.bcc) ? (body.bcc as string[]) : undefined,
      replyTo: Array.isArray(body.reply_to) ? (body.reply_to as string[]) : undefined,
      contactProperties:
        body.contact_properties && typeof body.contact_properties === "object"
          ? (body.contact_properties as Record<string, string>)
          : undefined,
      customProperties:
        body.custom_properties && typeof body.custom_properties === "object"
          ? (body.custom_properties as Record<string, string>)
          : undefined,
    })
    return NextResponse.json(response)
  } catch (error) {
    return toErrorResponse(error)
  }
}
