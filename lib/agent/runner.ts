import { HumanMessage } from "@langchain/core/messages"
import type { BaseMessage } from "@langchain/core/messages"

// Structural checks so we don't rely on `instanceof` across Turbopack module
// boundaries (LangGraph and our code can end up with different AIMessage
// classes at runtime).
function isAI(m: BaseMessage): boolean {
  return m._getType?.() === "ai" || (m as unknown as { role?: string }).role === "assistant"
}

function extractText(m: BaseMessage): string {
  const c = m.content as unknown
  if (typeof c === "string") return c
  if (Array.isArray(c)) {
    return c
      .map((p) =>
        typeof p === "string"
          ? p
          : p && typeof p === "object" && "text" in (p as Record<string, unknown>)
            ? String((p as Record<string, unknown>).text)
            : "",
      )
      .join("")
  }
  return ""
}

function toolCallsOf(m: BaseMessage): Array<{ id?: string; name: string }> {
  const raw = (m as unknown as { tool_calls?: Array<{ id?: string; name: string }> }).tool_calls
  return Array.isArray(raw) ? raw : []
}

import { getChatAccessToken } from "./credentials"
import {
  Command,
  buildApprovalSummary,
  classifyApprovalResponse,
  getAgentGraph,
} from "./graph"

// Events emitted to the SSE endpoint. Every event is a self-contained frame the
// UI can render on arrival.
export type AgentEvent =
  | { type: "assistant_message"; content: string }
  | { type: "approval_needed"; tool: string; args: unknown; summary: string }
  | { type: "tool_result"; tool: string; ok: boolean }
  | { type: "error"; error: string }
  | { type: "done" }

interface RunOptions {
  chatId: string
  userMessage: string
}

// Drives a single user turn end-to-end. Handles both:
//   • fresh input — invoke graph with a new HumanMessage
//   • resume from a pending approval — parse user message as yes/no and
//     resume with Command({ resume: { approved, feedback } })
// yielding SSE-shaped events as things happen.
export async function* runAgentTurn(opts: RunOptions): AsyncGenerator<AgentEvent> {
  const { chatId, userMessage } = opts

  let graph
  let accessToken: string | null
  try {
    graph = await getAgentGraph()
    accessToken = await getChatAccessToken(chatId)
  } catch (error) {
    yield { type: "error", error: (error as Error).message }
    yield { type: "done" }
    return
  }

  const config = {
    configurable: {
      thread_id: chatId,
      // Tools reach for this via config.configurable.accessToken. Null is fine
      // — HubSpot tools will surface a clear error, send_email doesn't need it.
      accessToken: accessToken ?? undefined,
    },
    // Cap the agent ↔ tools loop. Without this a broken tool response can
    // spin the graph until the request times out.
    recursionLimit: 15,
  }

  // Look at graph state to decide: is this a resume from an approval, or a
  // fresh user turn? A pending interrupt shows up as an unfinished task on
  // the last checkpoint.
  let inputOrCommand: unknown
  let interruptedTool: string | undefined
  try {
    const state = await graph.getState(config)
    const pendingInterrupts = state.tasks.flatMap((task) => task.interrupts ?? [])
    if (pendingInterrupts.length > 0) {
      const interruptValue = pendingInterrupts[0].value as
        | { tool?: string; args?: unknown }
        | undefined
      interruptedTool = interruptValue?.tool
      const decision = classifyApprovalResponse(userMessage)
      inputOrCommand = new Command({ resume: decision })
    } else {
      inputOrCommand = { messages: [new HumanMessage(userMessage)] }
    }
  } catch (error) {
    yield { type: "error", error: (error as Error).message }
    yield { type: "done" }
    return
  }

  try {
    // stream in "updates" mode: each yield is a { nodeName: nodeReturnValue }
    // dict, and interrupts arrive as { __interrupt__: [interrupt, ...] }.
    let assistantText = ""
    let approvalEmitted = false
    // Track tool_call_id -> tool_name so we can tell tool_result which tool.
    const pendingCallNames = new Map<string, string>()

    for await (const update of await graph.stream(
      // Cast because LangGraph typings can't narrow the union input type here.
      inputOrCommand as never,
      { ...config, streamMode: "updates" },
    )) {
      // Interrupt: LangGraph emits { __interrupt__: [{ value, ... }] } and
      // the run pauses. We surface it and stop consuming.
      const interrupts = (update as { __interrupt__?: Array<{ value: unknown }> })
        .__interrupt__
      if (interrupts && interrupts.length > 0) {
        for (const it of interrupts) {
          const v = it.value as
            | { tool: string; args: unknown; summary: string }
            | undefined
          if (v) {
            yield {
              type: "approval_needed",
              tool: v.tool,
              args: v.args,
              summary: v.summary,
            }
            approvalEmitted = true
          }
        }
        continue
      }

      // Node updates — { agent: {...} } or { tools: {...} }.
      for (const [node, payload] of Object.entries(update as Record<string, unknown>)) {
        const msgs = (payload as { messages?: BaseMessage[] } | undefined)?.messages
        if (!Array.isArray(msgs)) continue

        if (node === "agent") {
          for (const m of msgs) {
            if (!isAI(m)) continue
            const calls = toolCallsOf(m)
            for (const c of calls) {
              if (c.id) pendingCallNames.set(c.id, c.name)
            }
            const content = extractText(m)
            // A tool-call-only chunk has no text; keep looking. When the loop
            // converges to a final answer, the AIMessage has non-empty text
            // and (usually) no tool_calls — that's what we surface.
            if (content.trim()) assistantText = content
          }
        }

        if (node === "tools") {
          for (const m of msgs) {
            const toolCallId = (m as { tool_call_id?: string }).tool_call_id
            const toolName = toolCallId ? pendingCallNames.get(toolCallId) : undefined
            if (!toolName) continue
            const content = typeof m.content === "string" ? m.content : ""
            const ok = !/^(HubSpot error|Error|Unknown tool|The user did not approve)/.test(content)
            yield { type: "tool_result", tool: toolName, ok }
          }
        }
      }
    }

    // Emit the final assistant text. If the run interrupted for approval,
    // we synthesize a friendly assistant "please confirm" line — the
    // approval_needed event already carried the details, but the DB row and
    // UI transcript need a normal assistant message too.
    if (approvalEmitted && !assistantText) {
      const pending = await graph.getState(config)
      const first = pending.tasks
        .flatMap((t) => t.interrupts ?? [])
        .at(0)
      const value = first?.value as
        | { tool?: string; args?: unknown; summary?: string }
        | undefined
      const summary =
        value?.summary ??
        (value?.tool
          ? buildApprovalSummary(value.tool, (value.args as Record<string, unknown>) ?? {})
          : "I need your approval before I proceed. Reply yes to continue.")
      yield { type: "assistant_message", content: summary }
    } else if (assistantText) {
      yield { type: "assistant_message", content: assistantText }
    }

    // Silence the unused-warning for the tracked tool — we log it via the
    // tool_result events. Also useful when debugging.
    void interruptedTool
  } catch (error) {
    yield { type: "error", error: (error as Error).message }
  } finally {
    yield { type: "done" }
  }
}
