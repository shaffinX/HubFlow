import { getSql } from "@/lib/db/client"
import { getChat, touchChat } from "@/lib/models/chat"
import { insertMessage } from "@/lib/models/message"
import { runAgentTurn, type AgentEvent } from "@/lib/agent/runner"

export const runtime = "nodejs"
// Never cache — this is a streaming endpoint.
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/chats/:id/send
// Server-sent events. Frames are JSON envelopes with a `type` field so the
// frontend can dispatch without parsing markers.
//
// The client must send:
//   { content: string, client_uuid: string }
//
// The endpoint:
//   1. Persists the user message (idempotent via client_uuid).
//   2. Runs the agent turn — fresh input, or resume-from-approval when a
//      graph interrupt is pending on this chat.
//   3. Streams AgentEvents as SSE `data:` frames.
//   4. Persists any assistant messages back to the messages table before
//      emitting `done`.
export async function POST(request: Request, ctx: Ctx) {
  const { id: chatId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as {
    content?: string
    client_uuid?: string
  }
  const content = typeof body.content === "string" ? body.content.trim() : ""
  const clientUuid = typeof body.client_uuid === "string" ? body.client_uuid : ""

  if (!content) return jsonError("content is required", 400)
  if (!clientUuid) return jsonError("client_uuid is required", 400)

  const sql = getSql()
  const chat = await getChat(sql, chatId)
  if (!chat) return jsonError("chat not found", 404)

  // Persist the user message up front so it survives a client disconnect.
  await insertMessage(sql, {
    chat_id: chatId,
    role: "user",
    content,
    client_uuid: clientUuid,
    status: "complete",
  })
  await touchChat(sql, chatId)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const write = (event: AgentEvent) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      // Every 15s send an SSE comment line. Browsers / proxies drop
      // long-idle connections; a periodic byte keeps the pipe alive without
      // affecting the client-side JSON parser (comments start with `:`).
      const keepAlive = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`))
        } catch {
          // controller already closed elsewhere — safe to ignore.
        }
      }, 15_000)

      try {
        for await (const event of runAgentTurn({ chatId, userMessage: content })) {
          write(event)
          // Persist assistant text to the DB so a reload replays the transcript.
          if (event.type === "assistant_message" && event.content.trim()) {
            try {
              await insertMessage(sql, {
                chat_id: chatId,
                role: "assistant",
                content: event.content,
                // Server-generated UUID — this row is not an idempotency retry.
                client_uuid: crypto.randomUUID(),
                status: "complete",
              })
            } catch (err) {
              // A failed DB insert should not kill the stream; log via the
              // stream itself so the UI still shows the reply.
              write({
                type: "error",
                error: `Failed to persist assistant message: ${(err as Error).message}`,
              })
            }
          }
        }
      } catch (error) {
        write({ type: "error", error: (error as Error).message })
      } finally {
        clearInterval(keepAlive)
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
