"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  IconCircleCheck,
  IconKey,
  IconLoader,
  IconLock,
  IconPencil,
  IconShield,
  IconTrash,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CredentialSafe {
  id: string
  label: string
  created_at: string
}

// Fixed label — the settings page manages a single active HubSpot token, so
// the label carries no user-facing meaning and stays out of the UI.
const CREDENTIAL_LABEL = "HubSpot"

// The masked value the user sees when a token is present. Same length regardless
// of the real token, so there's no side-channel about the token's shape.
const MASKED = "•".repeat(24)

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export function CredentialsPanel() {
  const [credential, setCredential] = useState<CredentialSafe | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [tokenInput, setTokenInput] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const [isRemoving, setIsRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch("/api/credentials", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || `Failed to load credentials (${res.status})`)
        }
        const data = (await res.json()) as { credentials: CredentialSafe[] }
        // Multi-credential storage is supported at the DB level, but this page
        // manages a single active token — show the most recently created one.
        const latest = data.credentials[0] ?? null
        setCredential(latest)
        if (!latest) setIsEditing(true)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setLoadError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  function beginEdit() {
    setSaveError(null)
    setSavedFlash(false)
    setTokenInput("")
    setIsEditing(true)
  }

  function cancelEdit() {
    setSaveError(null)
    setTokenInput("")
    // Only allow cancelling if there's already a credential to fall back to.
    if (credential) setIsEditing(false)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = tokenInput.trim()
    if (!token) return
    setIsSaving(true)
    setSaveError(null)
    setSavedFlash(false)
    try {
      let res: Response
      if (credential) {
        // Update the existing record in place. Any chats already bound to this
        // credential_id keep working — the same UUID now points at the new token.
        res = await fetch(`/api/credentials/${credential.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
      } else {
        res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: CREDENTIAL_LABEL, token }),
        })
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `Save failed (${res.status})`)
      }
      const data = (await res.json()) as { credential: CredentialSafe }
      setCredential(data.credential)
      setTokenInput("")
      setIsEditing(false)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2400)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove() {
    if (!credential) return
    const confirmed = window.confirm(
      "Remove the saved HubSpot token? Chats bound to this credential will lose access until you save a new one.",
    )
    if (!confirmed) return
    setIsRemoving(true)
    setRemoveError(null)
    try {
      const res = await fetch(`/api/credentials/${credential.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `Remove failed (${res.status})`)
      }
      setCredential(null)
      setIsEditing(true)
      setTokenInput("")
    } catch (err) {
      setRemoveError((err as Error).message)
    } finally {
      setIsRemoving(false)
    }
  }

  const showEditor = isEditing || !credential
  const hasCredential = !!credential

  return (
    <div className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* Page header */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-violet-300 uppercase">
            <span className="inline-block size-1.5 rounded-full bg-violet-400" />
            Settings
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Credentials & Connections
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-white/60">
            Manage the credentials HubFlow uses to talk to HubSpot on your
            behalf. Tokens are encrypted at rest and never shown after saving —
            only replaced.
          </p>
        </header>

        {/* HubSpot token card */}
        <section
          className={cn(
            "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 backdrop-blur-sm",
          )}
        >
          {/* Subtle gradient accent along the top edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

          <div className="flex items-start gap-4 border-b border-white/10 px-6 py-5 sm:px-7">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20 ring-1 ring-inset ring-violet-400/25">
              <IconKey className="size-5 text-violet-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">HubSpot Access Token</h2>
                {isLoading ? (
                  <StatusPill tone="neutral">
                    <IconLoader className="size-3 animate-spin" /> Loading
                  </StatusPill>
                ) : hasCredential ? (
                  <StatusPill tone="success">
                    <IconCircleCheck className="size-3" /> Connected
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning">Not configured</StatusPill>
                )}
                {savedFlash && (
                  <StatusPill tone="success">
                    <IconCircleCheck className="size-3" /> Saved
                  </StatusPill>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                Used to authenticate every HubSpot API call the agent makes.
                Paste a Private App token from{" "}
                <span className="text-white/80">
                  HubSpot → Settings → Integrations → Private Apps
                </span>
                .
              </p>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {loadError && (
              <p className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {loadError}
              </p>
            )}

            {showEditor ? (
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hs-token" className="text-white/80">
                    {hasCredential ? "New token" : "Bearer token"}
                  </Label>
                  <Input
                    id="hs-token"
                    type="password"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="pat-na1-••••••••-••••-••••-••••-••••••••••••"
                    disabled={isSaving}
                    className="h-11 border-white/15 bg-white/5 font-mono text-sm text-white placeholder:text-white/25"
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-white/50">
                    <IconLock className="size-3" />
                    Stored encrypted with AES-256-GCM. You won&apos;t see it again
                    after saving.
                  </p>
                  {saveError && <p className="text-xs text-red-400">{saveError}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
                  {hasCredential && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={isSaving}
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!tokenInput.trim() || isSaving}
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 hover:brightness-110"
                  >
                    {isSaving ? (
                      <>
                        <IconLoader className="animate-spin" />
                        Saving…
                      </>
                    ) : hasCredential ? (
                      "Save new token"
                    ) : (
                      "Save token"
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/60">Current token</Label>
                  <div
                    aria-label="Saved HubSpot token (hidden)"
                    className="flex h-11 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 font-mono text-sm tracking-[0.25em] text-white/60 select-none"
                  >
                    {MASKED}
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-white/45">
                    <IconShield className="size-3" />
                    {credential && (
                      <>Saved {formatSavedAt(credential.created_at)}</>
                    )}
                  </p>
                  {removeError && <p className="text-xs text-red-400">{removeError}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleRemove}
                    disabled={isRemoving}
                  >
                    {isRemoving ? (
                      <>
                        <IconLoader className="animate-spin" />
                        Removing…
                      </>
                    ) : (
                      <>
                        <IconTrash />
                        Remove
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={beginEdit}
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 hover:brightness-110"
                  >
                    <IconPencil />
                    Replace token
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Help / trust footnote */}
        <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-white/50">
          <IconShield className="size-4 shrink-0 text-emerald-400/80" />
          <p>
            HubFlow never displays saved tokens — not in the UI, not in API
            responses. To rotate a token, save a new one; the old value is
            overwritten in place.
          </p>
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "neutral"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
        tone === "success" &&
          "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
        tone === "warning" &&
          "border-amber-400/30 bg-amber-500/10 text-amber-200",
        tone === "neutral" &&
          "border-white/15 bg-white/[0.06] text-white/60",
      )}
    >
      {children}
    </span>
  )
}
