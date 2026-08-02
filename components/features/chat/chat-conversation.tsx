"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Loader2, Paperclip, Send } from "lucide-react"

import { cn } from "@/lib/utils"
import { BrandMark } from "@/components/features/shell/brand"

interface UIMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status?: "pending" | "streaming" | "complete" | "error"
}

interface DBMessage {
  id: string
  chat_id: string
  sequence: number
  role: "user" | "assistant"
  content: string
  payload: unknown
  client_uuid: string
  status: "pending" | "streaming" | "complete" | "error"
  created_at: string
}

interface Props {
  chatId: string
}

// The regex the agent runner uses to classify approvals — kept in sync so the
// UI can hint the user with a "reply yes to confirm" affordance if we ever
// want to. Not currently displayed but here for future use.
export function ChatConversation({ chatId }: Props) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new content. Runs every render — cheap because it only
  // adjusts scrollTop when the layout changed.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}/messages`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || `Failed to load messages (${res.status})`)
        }
        const data = (await res.json()) as { messages: DBMessage[] }
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            status: m.status,
          })),
        )
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setLoadError((err as Error).message)
      }
    })()
    return () => controller.abort()
  }, [chatId])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = input.trim()
      if (!trimmed || isSending) return

      const userClientUuid = crypto.randomUUID()
      const userMessage: UIMessage = {
        id: userClientUuid,
        role: "user",
        content: trimmed,
        status: "complete",
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
      setIsSending(true)

      // Placeholder for the assistant reply. We update it as SSE frames arrive
      // and replace with the final DB-persisted content when the stream ends.
      const assistantPlaceholderId = `pending-${crypto.randomUUID()}`
      setMessages((prev) => [
        ...prev,
        { id: assistantPlaceholderId, role: "assistant", content: "", status: "streaming" },
      ])

      try {
        const res = await fetch(`/api/chats/${chatId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, client_uuid: userClientUuid }),
        })
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || `Send failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          // Split on the SSE frame delimiter (double newline).
          const frames = buffer.split("\n\n")
          buffer = frames.pop() ?? ""
          for (const frame of frames) {
            const line = frame.trim()
            if (!line.startsWith("data:")) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            let event: {
              type: string
              content?: string
              summary?: string
              error?: string
              tool?: string
              ok?: boolean
            }
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }
            if (event.type === "assistant_message" && event.content) {
              const content = event.content
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantPlaceholderId ? { ...m, content, status: "complete" } : m,
                ),
              )
            } else if (event.type === "error" && event.error) {
              const errorContent = `⚠️ ${event.error}`
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantPlaceholderId
                    ? { ...m, content: errorContent, status: "error" }
                    : m,
                ),
              )
            }
          }
        }
      } catch (err) {
        const message = (err as Error).message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: `⚠️ ${message}`, status: "error" }
              : m,
          ),
        )
      } finally {
        setIsSending(false)
      }
    },
    [chatId, input, isSending],
  )

  return (
    <>
      <div
        ref={scrollRef}
        className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pt-6 pb-40 sm:px-8"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {loadError && (
            <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loadError}
            </div>
          )}

          {messages.length === 0 && !loadError && (
            <div className="flex max-w-[85%] gap-3 sm:max-w-[75%]">
              <BrandMark size={32} />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-1.5 px-0.5">
                  <span className="text-sm font-semibold text-white">HubFlow</span>
                  <span className="text-xs text-white/40">Agent</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-lg shadow-black/20">
                  Hey — I&#39;m your HubFlow agent. Ask me to search contacts, look up tasks, or create/update one. Writes are held for your approval.
                </div>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-8 sm:pb-6">
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all focus-within:border-violet-400/40 focus-within:ring-2 focus-within:ring-violet-500/30"
        >
          <button
            type="button"
            aria-label="Add attachment"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message HubFlow..."
            aria-label="Message HubFlow"
            disabled={isSending}
            className="min-w-0 flex-1 bg-transparent px-1 text-sm text-white placeholder:text-white/40 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!input.trim() || isSending}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-60"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </form>
        <p className="pointer-events-auto mx-auto mt-3 max-w-3xl text-center text-[11px] leading-relaxed text-white/35">
          HubFlow AI can make mistakes. Consider verifying important HubSpot updates.
        </p>
      </div>
    </>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600/90 to-fuchsia-600/90 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-violet-950/40 sm:max-w-[75%]">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex max-w-[85%] gap-3 sm:max-w-[75%]">
      <BrandMark size={32} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5 px-0.5">
          <span className="text-sm font-semibold text-white">HubFlow</span>
          <span className="text-xs text-white/40">Agent</span>
        </div>
        <div
          className={cn(
            "rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed shadow-lg shadow-black/20",
            message.status === "error"
              ? "border-red-400/25 bg-red-500/10 text-red-200"
              : "border-white/10 bg-white/[0.04] text-zinc-100",
          )}
        >
          {message.status === "streaming" && !message.content ? (
            <span className="inline-flex items-center gap-2 text-white/60">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </span>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  )
}
