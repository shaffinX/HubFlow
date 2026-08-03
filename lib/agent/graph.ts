import {
  Command,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  interrupt,
  isGraphInterrupt,
} from "@langchain/langgraph"
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import { SystemMessage, ToolMessage, trimMessages } from "@langchain/core/messages"
import type { BaseMessage } from "@langchain/core/messages"
import type { RunnableConfig } from "@langchain/core/runnables"

import { getAgentModel } from "./model"
import { buildMainSystemPrompt, type MainPromptContext } from "./prompt"
import { AGENT_TOOLS, isWriteTool } from "./tools"

// The agent gets only the tail of the conversation. Keeps prompt cost bounded
// per turn while the checkpointer still stores the whole history.
const CONTEXT_MESSAGE_LIMIT = 10

declare global {
  var __hubflow_pg_saver: PostgresSaver | undefined
  var __hubflow_graph: Awaited<ReturnType<typeof buildGraph>> | undefined
}

async function getSaver(): Promise<PostgresSaver> {
  if (globalThis.__hubflow_pg_saver) return globalThis.__hubflow_pg_saver
  const connString = process.env.DATABASE_URL
  if (!connString) {
    throw new Error(
      "DATABASE_URL is not set — PostgresSaver needs the same session-pooler / direct connection URI as the app.",
    )
  }
  const saver = PostgresSaver.fromConnString(connString)
  // Creates the checkpoint tables on first run; idempotent on subsequent runs.
  await saver.setup()
  globalThis.__hubflow_pg_saver = saver
  return saver
}

// Builds the per-turn dynamic context the main prompt bakes into its trailing
// block. Deterministic and cheap: no network calls, just env reads + a walk of
// the checkpointed message history.
function buildMainContext(messages: BaseMessage[]): MainPromptContext {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const absMin = Math.abs(offsetMinutes)
  const offHH = String(Math.floor(absMin / 60)).padStart(2, "0")
  const offMM = String(absMin % 60).padStart(2, "0")

  const nowLocal = now.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const timezone = `${tz} (UTC${sign}${offHH}:${offMM})`
  const nowUtc = now.toISOString()

  const emailEnabled = !!(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS
  )
  const ownerId = process.env.HUBSPOT_OWNER_ID?.trim() || null
  const portalId = process.env.HUBSPOT_PORTAL_ID?.trim() || null

  const { knownContacts, committed } = extractSessionFacts(messages)

  return { nowLocal, timezone, nowUtc, ownerId, portalId, emailEnabled, knownContacts, committed }
}

// Walks the message transcript pairing each AIMessage tool_call with its
// following ToolMessage, so the main prompt can advertise:
//   • Contacts already resolved this conversation (from search/list results)
//   • Writes already committed (successful create/update/delete/send_email)
function extractSessionFacts(messages: BaseMessage[]): {
  knownContacts: MainPromptContext["knownContacts"]
  committed: MainPromptContext["committed"]
} {
  const knownContacts: MainPromptContext["knownContacts"] = []
  const committed: MainPromptContext["committed"] = []
  const seenContact = new Set<string>()
  const seenWrite = new Set<string>()
  const WRITE = new Set(["create_task", "update_task", "delete_task", "send_email"])

  const toolMsgById = new Map<string, BaseMessage>()
  for (const m of messages) {
    const type = (m as unknown as { _getType?: () => string })._getType?.()
    if (type !== "tool") continue
    const id = (m as unknown as { tool_call_id?: string }).tool_call_id
    if (id) toolMsgById.set(id, m)
  }

  for (const m of messages) {
    const type = (m as unknown as { _getType?: () => string })._getType?.()
    if (type !== "ai") continue
    const calls =
      (m as unknown as { tool_calls?: Array<{ id?: string; name: string; args?: unknown }> })
        .tool_calls ?? []
    for (const call of calls) {
      const toolMsg = call.id ? toolMsgById.get(call.id) : undefined
      if (!toolMsg) continue
      const content = typeof toolMsg.content === "string" ? toolMsg.content : ""

      if (call.name === "search_contacts" || call.name === "list_contacts") {
        try {
          const parsed = JSON.parse(content) as {
            results?: Array<{ id: string; properties?: Record<string, string | null> }>
          }
          for (const r of parsed.results ?? []) {
            if (seenContact.has(r.id)) continue
            seenContact.add(r.id)
            const p = r.properties ?? {}
            const name =
              [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || `id ${r.id}`
            knownContacts.push({ id: r.id, name: String(name), email: String(p.email ?? "") })
          }
        } catch {
          // ignore — tool returned a non-JSON error string
        }
      }

      if (WRITE.has(call.name)) {
        // Treat a write as committed if the tool response looks structured and
        // doesn't start with a HubSpot / rejection error string.
        const looksOk = !/^(HubSpot error|Error|Unknown tool|The user did not approve)/.test(
          content,
        )
        if (!looksOk) continue
        try {
          const parsed = JSON.parse(content) as {
            id?: string
            messageId?: string
            archived?: boolean
            accepted?: string[]
          }
          const key = `${call.name}:${parsed.id ?? parsed.messageId ?? content.slice(0, 40)}`
          if (seenWrite.has(key)) continue
          seenWrite.add(key)
          let summary = ""
          if (call.name === "create_task") summary = `task ${parsed.id ?? "(id?)"} created`
          else if (call.name === "update_task") summary = `task ${parsed.id ?? "(id?)"} updated`
          else if (call.name === "delete_task") summary = `task ${parsed.id ?? "(id?)"} archived`
          else if (call.name === "send_email")
            summary = `email sent to ${parsed.accepted?.[0] ?? "(recipient?)"}`
          committed.push({ tool: call.name, summary, at: "earlier this session" })
        } catch {
          // Non-JSON response — still record something so the model knows.
          committed.push({ tool: call.name, summary: content.slice(0, 60), at: "earlier this session" })
        }
      }
    }
  }
  return { knownContacts, committed }
}

// Agent node — decides on a tool call or produces a final answer.
async function agentNode(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  // Tools are bound inside getAgentModel so the fallback wrapper doesn't have
  // to expose `.bindTools` (RunnableWithFallbacks doesn't).
  const model = getAgentModel(AGENT_TOOLS)
  // trimMessages keeps the tail while staying aligned to human turns, so we
  // never send an AIMessage with unpaired tool_calls to the LLM.
  const tail = await trimMessages(state.messages, {
    maxTokens: CONTEXT_MESSAGE_LIMIT,
    strategy: "last",
    tokenCounter: (msgs) => msgs.length,
    includeSystem: false,
    startOn: "human",
  })
  const ctx = buildMainContext(state.messages)
  const messages = [new SystemMessage(buildMainSystemPrompt(ctx)), ...tail]
  const response = await model.invoke(messages, config)
  return { messages: [response] }
}

// Tools node — runs read tools directly; interrupts before write tools until
// the user resumes with an approval decision.
// Structural read that survives Turbopack module-duplication (the imported
// AIMessage class here isn't always the same identity as the one LangGraph
// hands us back through the checkpointer).
function readAIMessageWithCalls(m: BaseMessage | undefined): {
  toolCalls: Array<{ id?: string; name: string; args?: unknown }>
} | null {
  if (!m) return null
  const type = (m as unknown as { _getType?: () => string })._getType?.()
  if (type !== "ai") return null
  const raw = (m as unknown as { tool_calls?: Array<{ id?: string; name: string; args?: unknown }> })
    .tool_calls
  const toolCalls = Array.isArray(raw) ? raw : []
  if (toolCalls.length === 0) return null
  return { toolCalls }
}

async function toolsNode(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  const parsed = readAIMessageWithCalls(state.messages.at(-1))
  if (!parsed) return { messages: [] }

  const results: BaseMessage[] = []

  for (const call of parsed.toolCalls) {
    const callId = call.id ?? call.name

    if (isWriteTool(call.name)) {
      // interrupt() suspends the whole graph. On resume the runtime replays
      // this node and interrupt() returns the value passed via
      // Command({ resume }) instead of throwing.
      const decision = interrupt<
        { type: "approval_needed"; tool: string; args: unknown; summary: string },
        { approved: boolean; feedback?: string }
      >({
        type: "approval_needed",
        tool: call.name,
        args: call.args,
        summary: buildApprovalSummary(call.name, call.args as Record<string, unknown>),
      })

      if (!decision?.approved) {
        results.push(
          new ToolMessage({
            tool_call_id: callId,
            content: `The user did not approve this action${
              decision?.feedback ? `. They said: "${decision.feedback}".` : "."
            } Do not retry it without a new instruction. Acknowledge briefly and offer an alternative.`,
          }),
        )
        continue
      }
    }

    const tool = AGENT_TOOLS.find((t) => t.name === call.name)
    if (!tool) {
      results.push(
        new ToolMessage({ tool_call_id: callId, content: `Unknown tool: ${call.name}` }),
      )
      continue
    }

    let raw: string
    try {
      // Every tool in AGENT_TOOLS has its own inferred schema, so the union
      // signature of `.invoke` isn't callable without a cast. All of them
      // ultimately accept `Record<string, unknown>` at runtime because that's
      // what LangGraph hands them from the LLM's function call.
      type ToolInvoke = (
        input: Record<string, unknown>,
        config?: RunnableConfig,
      ) => Promise<string>
      const invoke = tool.invoke.bind(tool) as ToolInvoke
      raw = await invoke((call.args ?? {}) as Record<string, unknown>, config)
    } catch (error) {
      raw = error instanceof Error ? error.message : String(error)
    }
    results.push(new ToolMessage({ tool_call_id: callId, content: raw }))
  }

  return { messages: results }
}

function shouldContinue(state: typeof MessagesAnnotation.State): "tools" | typeof END {
  return readAIMessageWithCalls(state.messages.at(-1)) ? "tools" : END
}

async function buildGraph() {
  const saver = await getSaver()
  return new StateGraph(MessagesAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END])
    .addEdge("tools", "agent")
    .compile({ checkpointer: saver })
}

export async function getAgentGraph() {
  if (globalThis.__hubflow_graph) return globalThis.__hubflow_graph
  const graph = await buildGraph()
  if (process.env.NODE_ENV !== "production") {
    globalThis.__hubflow_graph = graph
  }
  return graph
}

// Deterministic, human-readable summary of the pending write. Rendered directly
// as an assistant message in the UI — no LLM call needed for the confirmation
// prompt, keeping the round-trip cost low.
export function buildApprovalSummary(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "create_task": {
      const subject = str(args.subject) ?? "(no subject)"
      const due = str(args.due_date) ?? "no due date"
      const priority = str(args.priority) ?? "MEDIUM"
      const type = str(args.type) ?? "TODO"
      const contact = str(args.contact_id) ?? args.contact_id
      const contactLine = contact ? `\n• Linked to contact: ${contact}` : ""
      return `I'm about to create a new HubSpot task:\n• Subject: ${subject}\n• Due: ${due}\n• Priority: ${priority}\n• Type: ${type}${contactLine}\n\nReply **yes** to confirm, or tell me what to change.`
    }
    case "update_task": {
      const id = str(args.task_id) ?? "?"
      const changes = Object.entries(args)
        .filter(([k]) => k !== "task_id")
        .map(([k, v]) => `  • ${k}: ${JSON.stringify(v)}`)
        .join("\n")
      return `I'm about to update task \`${id}\` with:\n${changes || "  (no changes)"}\n\nReply **yes** to confirm, or tell me what to change.`
    }
    case "delete_task": {
      const id = str(args.task_id) ?? "?"
      return `I'm about to soft-delete task \`${id}\` (moved to HubSpot recycling bin; restorable for 30 days).\n\nReply **yes** to confirm, or **no** to cancel.`
    }
    case "send_email": {
      const to = str(args.to) ?? "(no recipient)"
      const subject = str(args.subject) ?? "(no subject)"
      return `I'm about to send this email:\n• To: ${to}\n• Subject: ${subject}\n\nReply **yes** to send, or tell me what to change.`
    }
    default:
      return `I'm about to run \`${tool}\` with these arguments:\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\nReply **yes** to confirm.`
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

export { Command, isGraphInterrupt }
