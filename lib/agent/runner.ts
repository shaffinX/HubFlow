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

import { classifyApprovalWithLLM } from "./approval-gate"
import { getChatAccessToken } from "./credentials"
import { Command, buildApprovalSummary, getAgentGraph } from "./graph"

// Events emitted to the SSE endpoint. Every event is a self-contained frame the
// UI can render on arrival.
export type AgentEvent =
  | { type: "progress"; label: string }
  | { type: "assistant_message"; content: string }
  | { type: "approval_needed"; tool: string; args: unknown; summary: string }
  | { type: "tool_result"; tool: string; ok: boolean }
  | { type: "error"; error: string }
  | { type: "done" }

// Deterministic, human-readable status blurbs for each tool. Rendered in the
// chat as the "current step" — no LLM call is needed to produce these.
const TOOL_PROGRESS_LABELS: Record<string, string> = {
  list_contacts: "Fetching your contact list…",
  search_contacts: "Searching contacts…",
  get_task: "Loading task details…",
  list_tasks: "Fetching your tasks…",
  search_tasks: "Searching tasks…",
  create_task: "Preparing to create the task…",
  update_task: "Preparing to update the task…",
  delete_task: "Preparing to remove the task…",
  send_email: "Preparing the email…",
}
function progressForTool(name: string): string {
  return TOOL_PROGRESS_LABELS[name] ?? `Running ${name}…`
}

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
        | { tool?: string; args?: unknown; summary?: string }
        | undefined
      interruptedTool = interruptValue?.tool

      // Delegate approve/decline/modify classification to a small LLM. It
      // sees the pending action, the user's reply, and the last few messages
      // — so "yes, go ahead" reads as approval and "actually make it high
      // priority" reads as a modification with concrete guidance for the
      // main agent instead of a plain rejection.
      const classification = await classifyApprovalWithLLM({
        pendingTool: interruptValue?.tool ?? "unknown",
        pendingArgs: interruptValue?.args ?? {},
        pendingSummary: interruptValue?.summary ?? "",
        userMessage,
        recentContext: (state.values as { messages?: BaseMessage[] } | undefined)?.messages ?? [],
      })

      // Translate the classifier's decision into the shape the tools node's
      // interrupt() call expects. Both `decline` and `modify` become
      // `approved: false` at the graph level — the main agent reads the
      // feedback and either apologises + asks, or proposes a fresh tool call
      // with the requested changes.
      const resumePayload =
        classification.decision === "approve"
          ? { approved: true as const }
          : classification.decision === "modify"
            ? {
                approved: false as const,
                feedback: `The user wants changes before approving. Requested changes: ${classification.changes}. Do NOT retry the previous call as-is — propose a revised tool call that reflects the changes, or ask a targeted clarifying question first.`,
              }
            : {
                approved: false as const,
                feedback: classification.reason,
              }

      inputOrCommand = new Command({ resume: resumePayload })
    } else {
      inputOrCommand = { messages: [new HumanMessage(userMessage)] }
    }
  } catch (error) {
    yield { type: "error", error: (error as Error).message }
    yield { type: "done" }
    return
  }

  // Kick things off with a status blurb so the UI shows a step immediately
  // instead of a bare "Thinking…". This is a hardcoded message — no LLM cost.
  yield { type: "progress", label: "Analyzing your request…" }

  try {
    // stream in "updates" mode: each yield is a { nodeName: nodeReturnValue }
    // dict, and interrupts arrive as { __interrupt__: [interrupt, ...] }.
    let assistantText = ""
    let approvalEmitted = false
    // Track tool_call_id -> tool_name so we can tell tool_result which tool.
    const pendingCallNames = new Map<string, string>()
    let toolsExecuted = 0

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
              // Announce the tool we're about to run. Read tools fire this
              // immediately; write tools fire it too, followed by the
              // approval_needed frame from the tools node.
              yield { type: "progress", label: progressForTool(c.name) }
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
            toolsExecuted++
            const content = typeof m.content === "string" ? m.content : ""
            const ok = !/^(HubSpot error|Error|Unknown tool|The user did not approve)/.test(content)
            yield { type: "tool_result", tool: toolName, ok }
          }
          // After every tools batch the agent will re-run; tell the user what
          // that step is so the UI doesn't fall back to "Thinking…".
          if (toolsExecuted > 0) {
            yield { type: "progress", label: "Composing a response…" }
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
