import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

const SALT = "hubflow-static-salt-v1"

function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length < 16) {
    throw new Error(
      "ENCRYPTION_KEY is not set (must be a strong random string, at least 32 chars recommended)."
    )
  }
  return scryptSync(raw, SALT, 32)
}

// AES-256-GCM. Envelope: base64([iv(12) | authTag(16) | ciphertext]).
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decryptToken(envelope: string): string {
  const buf = Buffer.from(envelope, "base64")
  if (buf.length < 12 + 16 + 1) {
    throw new Error("Encrypted token is malformed")
  }
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
