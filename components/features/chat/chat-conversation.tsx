"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { IconPaperclip, IconSend } from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"

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

// Line height matches the textarea's leading-6 (24px). Cap the auto-grow at 5
// lines so the input never grows unboundedly — after that the textarea scrolls
// internally.
const LINE_HEIGHT_PX = 24
const MAX_INPUT_LINES = 5
const INPUT_VERTICAL_PADDING_PX = 12 // py-1.5 top+bottom on the textarea

// Speed of the typewriter reveal for the assistant's final reply. 15ms/char
// keeps a ~200-token answer comfortably under 3s of reveal time.
const TYPEWRITER_MS_PER_CHAR = 15

export function ChatConversation({ chatId }: Props) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentProgress, setCurrentProgress] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, currentProgress])

  // Auto-grow the textarea between 1 and MAX_INPUT_LINES lines. Measure by
  // resetting height to auto, reading scrollHeight, then clamping.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const maxHeight = LINE_HEIGHT_PX * MAX_INPUT_LINES + INPUT_VERTICAL_PADDING_PX
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [input])

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

  // Reveal a completed assistant message character-by-character. Returns a
  // promise that resolves once the reveal finishes so the caller can chain.
  const typewriterReveal = useCallback(
    (placeholderId: string, fullText: string): Promise<void> =>
      new Promise((resolve) => {
        let i = 0
        const total = fullText.length
        const step = () => {
          // Reveal ~4 chars per tick so short messages don't feel slow. Longer
          // messages still land in a couple of seconds.
          i = Math.min(total, i + Math.max(2, Math.ceil(total / 200)))
          const slice = fullText.slice(0, i)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: slice, status: i >= total ? "complete" : "streaming" } : m,
            ),
          )
          if (i >= total) {
            resolve()
            return
          }
          window.setTimeout(step, TYPEWRITER_MS_PER_CHAR)
        }
        step()
      }),
    [],
  )

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
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
      setCurrentProgress(null)

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
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
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
              label?: string
            }
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }
            if (event.type === "progress" && event.label) {
              setCurrentProgress(event.label)
            } else if (event.type === "assistant_message" && event.content) {
              // Clear the progress line and reveal the full text as a
              // typewriter. Await so the reveal finishes before we move on to
              // the next event or close the stream — important for long
              // replies.
              setCurrentProgress(null)
              await typewriterReveal(assistantPlaceholderId, event.content)
            } else if (event.type === "error" && event.error) {
              const errorContent = `⚠️ ${event.error}`
              setCurrentProgress(null)
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
        setCurrentProgress(null)
      }
    },
    [chatId, input, isSending, typewriterReveal],
  )

  // Enter sends, Shift+Enter inserts a newline. IME composition (e.g. Japanese
  // input) is not intercepted so the user can commit their composition first.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit],
  )

  return (
    <>
      <div
        ref={scrollRef}
        className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pt-6 pb-48 sm:px-8"
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

          {messages.map((m, i) => {
            const isLastAssistant = m.role === "assistant" && i === messages.length - 1
            return (
              <MessageBubble
                key={m.id}
                message={m}
                progress={isLastAssistant && isSending ? currentProgress : null}
                isSending={isLastAssistant && isSending}
              />
            )
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-8 sm:pb-6">
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-3xl border border-white/15 bg-white/[0.08] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all focus-within:border-violet-400/40 focus-within:ring-2 focus-within:ring-violet-500/30"
        >
          <button
            type="button"
            aria-label="Add attachment"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            <IconPaperclip className="size-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message HubFlow..."
            aria-label="Message HubFlow"
            disabled={isSending}
            rows={1}
            className="no-scrollbar min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-white placeholder:text-white/40 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!input.trim() || isSending}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-60"
          >
            {isSending ? (
              <ThreeDotSpinner />
            ) : (
              <IconSend className="size-4" />
            )}
          </button>
        </form>
        <p className="pointer-events-auto mx-auto mt-3 max-w-3xl text-center text-[11px] leading-relaxed text-white/35">
          Enter to send, Shift + Enter for a new line. HubFlow AI can make mistakes — verify important updates.
        </p>
      </div>
    </>
  )
}

// Three dots bobbing up and down. The keyframes are defined in globals.css so
// tailwind's arbitrary-value class syntax stays readable here.
function ThreeDots({
  size = "1.5",
  colorClass = "bg-white/70",
}: {
  size?: "1" | "1.5" | "2"
  colorClass?: string
}) {
  const dotClass = `size-${size} rounded-full ${colorClass}`
  return (
    <span className="inline-flex items-center gap-1" aria-label="Working">
      <span className={cn(dotClass, "animate-hubflow-dot")} style={{ animationDelay: "0ms" }} />
      <span className={cn(dotClass, "animate-hubflow-dot")} style={{ animationDelay: "150ms" }} />
      <span className={cn(dotClass, "animate-hubflow-dot")} style={{ animationDelay: "300ms" }} />
    </span>
  )
}

function ThreeDotSpinner() {
  return <ThreeDots size="1" colorClass="bg-white" />
}

function MessageBubble({
  message,
  progress,
  isSending,
}: {
  message: UIMessage
  progress: string | null
  isSending: boolean
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600/90 to-fuchsia-600/90 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-violet-950/40 sm:max-w-[75%]">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }
  const showProgressRow = isSending && !message.content
  return (
    <div className="flex max-w-[90%] gap-3 sm:max-w-[80%]">
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
          {showProgressRow ? (
            <span className="flex items-center gap-2.5 text-white/60">
              <ThreeDots />
              <span className="text-[13px]">{progress ?? "Thinking"}</span>
            </span>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>
      </div>
    </div>
  )
}

// Markdown renderer with prose classes tuned for the dark bubble. `p`, `ul`,
// `ol`, `code`, `strong`, and heading tags all get sensible defaults; anything
// else falls back to browser defaults which is fine.
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="hubflow-markdown">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="marker:text-white/40">{children}</li>,
          h1: ({ children }) => <h1 className="mt-3 mb-2 text-base font-semibold text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-2 text-sm font-semibold text-white">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-white/90">{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-violet-300 underline decoration-violet-400/40 underline-offset-2 hover:decoration-violet-300"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-violet-200">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] text-zinc-100">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-violet-400/40 pl-3 text-white/75 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
