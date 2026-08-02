interface RenderOptions {
  heading?: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
  // Domain-neutral preview text shown in inbox listings before the recipient opens.
  preheader?: string
}

// Belt-and-braces HTML escaping — every user-supplied value flows through this
// before it lands in the template. Keeps stray angle brackets and quotes from
// breaking the rendered email out of its markup.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Plain text -> HTML paragraphs. Blank lines split paragraphs; single newlines
// become <br>. Whole thing is escaped first.
function bodyToHtml(body: string): string {
  const escaped = escapeHtml(body).trim()
  if (!escaped) return ""
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.65;">${para.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

// Plain-text version so email clients that block HTML still render something
// readable, and so anti-spam filters have plain content to score against.
export function renderEmailText({ heading, body, ctaLabel, ctaUrl }: RenderOptions): string {
  const parts = ["HubFlow", "", heading ?? "", heading ? "" : "", body.trim(), ""]
  if (ctaLabel && ctaUrl) parts.push(`${ctaLabel}: ${ctaUrl}`, "")
  parts.push("— Sent by HubFlow")
  return parts.filter((line) => line !== undefined).join("\n")
}

// Table-based, inline-styled HTML — the shape that survives Outlook, Gmail,
// Apple Mail, and iOS Mail alike. Uses a gradient header with a text lockup
// (safer than SVG in email clients) plus a warm-white content card.
export function renderEmailHtml(options: RenderOptions): string {
  const heading = options.heading ? escapeHtml(options.heading) : ""
  const preheader = escapeHtml(options.preheader ?? "").slice(0, 120)
  const bodyHtml = bodyToHtml(options.body)
  const cta =
    options.ctaLabel && options.ctaUrl
      ? renderCta(options.ctaLabel, options.ctaUrl)
      : ""

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>HubFlow</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(15,15,32,0.08);">
          <!-- Gradient header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 45%,#d946ef 100%);padding:36px 40px;text-align:left;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;">HubFlow</span>
                    <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
                    <div style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;">HubFlow<span style="color:rgba(255,255,255,0.55);font-weight:400;">&nbsp;·&nbsp;CRM Agent</span></div>
                    <div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>
                    <div style="color:rgba(255,255,255,0.78);font-size:13px;line-height:1.5;">Automating your HubSpot workflow.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              ${
                heading
                  ? `<h1 style="margin:0 0 18px;color:#0f0f20;font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-0.01em;">${heading}</h1>`
                  : ""
              }
              ${bodyHtml}
              ${cta}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:24px 40px 0 40px;">
              <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                Sent by <strong style="color:#4b5563;">HubFlow</strong> — your CRM agent.<br/>
                If you weren&#39;t expecting this message, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>

        <!-- Outer footer -->
        <div style="max-width:600px;width:100%;padding:16px 8px 0 8px;text-align:center;color:#9ca3af;font-size:11px;letter-spacing:0.04em;">
          &copy; ${new Date().getFullYear()} HubFlow
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderCta(label: string, url: string): string {
  const safeLabel = escapeHtml(label)
  const safeUrl = escapeHtml(url)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
    <tr>
      <td style="border-radius:10px;background:linear-gradient(135deg,#7c3aed 0%,#d946ef 100%);">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.01em;">${safeLabel}</a>
      </td>
    </tr>
  </table>`
}
