import nodemailer, { type Transporter } from "nodemailer"

declare global {
  // Cache the transport across HMR reloads in dev so we don't leak connection pools.

  var __hubflow_mailer: Transporter | undefined
}

export class MailerConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MailerConfigError"
  }
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function readSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS
  const portRaw = process.env.SMTP_PORT?.trim() || "587"
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase()
  const from = process.env.SMTP_FROM?.trim() || user

  const missing: string[] = []
  if (!host) missing.push("SMTP_HOST")
  if (!user) missing.push("SMTP_USER")
  if (!pass) missing.push("SMTP_PASS")
  if (missing.length) {
    throw new MailerConfigError(
      `Missing SMTP env vars: ${missing.join(", ")}. See .env.example for the full list.`,
    )
  }

  const port = Number(portRaw)
  if (!Number.isFinite(port) || port <= 0) {
    throw new MailerConfigError(`SMTP_PORT is not a valid positive number (got "${portRaw}").`)
  }

  // Default: port 465 -> implicit TLS; anything else -> STARTTLS upgrade.
  // Explicit SMTP_SECURE overrides.
  const secure =
    secureRaw === "true" || secureRaw === "1"
      ? true
      : secureRaw === "false" || secureRaw === "0"
        ? false
        : port === 465

  return {
    host: host as string,
    port,
    secure,
    user: user as string,
    pass: pass as string,
    from: (from || user) as string,
  }
}

export function getSmtpFrom(): string {
  return readSmtpConfig().from
}

export function getMailer(): Transporter {
  if (globalThis.__hubflow_mailer) return globalThis.__hubflow_mailer
  const cfg = readSmtpConfig()
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  })
  if (process.env.NODE_ENV !== "production") {
    globalThis.__hubflow_mailer = transport
  }
  return transport
}

export async function verifyMailer(): Promise<{ ok: true; host: string; port: number; secure: boolean }> {
  const cfg = readSmtpConfig()
  const transport = getMailer()
  await transport.verify()
  return { ok: true, host: cfg.host, port: cfg.port, secure: cfg.secure }
}
