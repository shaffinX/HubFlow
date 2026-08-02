import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import type { BaseMessage } from "@langchain/core/messages"

import { getClassifierModel } from "./model"

// The three real outcomes for any approval turn.
//   approve — user said yes / go ahead / any positive assent.
//   decline — user said no / cancel / stop, or explicitly rejected.
//   modify  — user wants the action taken with different arguments (different
//             subject, date, recipient, priority, etc). We treat this as a
//             decline at the graph level and hand `changes` to the main agent
//             as feedback so it can propose a fresh tool call.
export type ApprovalDecision =
  | { decision: "approve"; reason?: string }
  | { decision: "decline"; reason: string }
  | { decision: "modify"; changes: string; reason?: string }

interface ClassifyInput {
  pendingTool: string
  pendingArgs: unknown
  pendingSummary: string
  userMessage: string
  // Last few messages from the checkpointed conversation, oldest first.
  recentContext: BaseMessage[]
}

const CLASSIFIER_SYSTEM = `You are the approval gate for a CRM agent. The main agent proposed a write action (create/update/delete a task, or send an email) and asked the user to confirm. Your job: read the user's reply and classify their intent.

Return ONLY a compact JSON object, no prose, no code fences. The JSON shape is exactly one of:

  { "decision": "approve" }
  { "decision": "decline", "reason": "<short natural-language reason>" }
  { "decision": "modify", "changes": "<what the user wants changed, in plain English>" }

Rules:
- Approve on any clear positive assent: "yes", "yep", "go ahead", "do it", "sounds good", "please", "sure", "confirm", "proceed", "ok", "👍", etc.
- Decline on any clear rejection: "no", "cancel", "stop", "don't", "nope", etc — with no alternative offered.
- Modify when the user proposes a different value for any argument (subject, due date, priority, recipient, body, etc), asks a clarifying question that implies changing the action, or asks for a different action entirely. Put a concise description of what they want in \`changes\`. Do not include the raw JSON args — describe in prose.
- If the user says something ambiguous or unrelated to the pending action, choose decline and put their message in \`reason\` — the main agent will react.
- Never output anything other than the JSON object.`

function formatContext(msgs: BaseMessage[]): string {
  if (msgs.length === 0) return "(no prior messages)"
  return msgs
    .slice(-6)
    .map((m) => {
      const role = (m as unknown as { _getType?: () => string })._getType?.() ?? "unknown"
      const content =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .map((p) =>
                  typeof p === "string"
                    ? p
                    : p && typeof p === "object" && "text" in (p as Record<string, unknown>)
                      ? String((p as Record<string, unknown>).text)
                      : "",
                )
                .join("")
            : ""
      const speaker =
        role === "human"
          ? "User"
          : role === "ai"
            ? "Agent"
            : role === "tool"
              ? "Tool"
              : "System"
      return `${speaker}: ${content.slice(0, 400)}`
    })
    .join("\n")
}

function buildUserPrompt(input: ClassifyInput): string {
  return `PENDING ACTION
Tool: ${input.pendingTool}
Arguments (JSON): ${JSON.stringify(input.pendingArgs)}
Summary shown to user:
${input.pendingSummary}

RECENT CONVERSATION
${formatContext(input.recentContext)}

USER REPLY TO CLASSIFY
${input.userMessage}

Return only the JSON object.`
}

// Robust JSON extractor — the model normally returns clean JSON, but we tolerate
// prose before/after and code fences without failing the run.
function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
  try {
    return JSON.parse(withoutFence)
  } catch {
    // Find the first {...} balanced region.
    const start = withoutFence.indexOf("{")
    if (start === -1) return null
    let depth = 0
    for (let i = start; i < withoutFence.length; i++) {
      const ch = withoutFence[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(withoutFence.slice(start, i + 1))
          } catch {
            return null
          }
        }
      }
    }
    return null
  }
}

// Very small deterministic fallback used only when the classifier LLM fails
// or returns unparseable output. Keeps us from ever hanging the approval loop.
function heuristicClassify(userMessage: string): ApprovalDecision {
  const t = userMessage.trim().toLowerCase()
  const YES = new Set([
    "y", "yes", "yeah", "yep", "yup", "ok", "okay",
    "sure", "go", "go ahead", "do it", "confirm", "proceed", "approve",
  ])
  if (YES.has(t)) return { decision: "approve" }
  return { decision: "decline", reason: userMessage }
}

export async function classifyApprovalWithLLM(input: ClassifyInput): Promise<ApprovalDecision> {
  const messages: BaseMessage[] = [
    new SystemMessage(CLASSIFIER_SYSTEM),
    new HumanMessage(buildUserPrompt(input)),
  ]

  let raw: string
  try {
    const model = getClassifierModel()
    const response = await model.invoke(messages)
    raw =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((p) =>
                typeof p === "string"
                  ? p
                  : p && typeof p === "object" && "text" in (p as Record<string, unknown>)
                    ? String((p as Record<string, unknown>).text)
                    : "",
              )
              .join("")
          : ""
  } catch {
    return heuristicClassify(input.userMessage)
  }

  const parsed = extractJsonObject(raw)
  if (!parsed || typeof parsed !== "object") {
    return heuristicClassify(input.userMessage)
  }
  const obj = parsed as Record<string, unknown>
  const decision = obj.decision
  if (decision === "approve") {
    return { decision: "approve", reason: typeof obj.reason === "string" ? obj.reason : undefined }
  }
  if (decision === "decline") {
    return {
      decision: "decline",
      reason: typeof obj.reason === "string" && obj.reason ? obj.reason : input.userMessage,
    }
  }
  if (decision === "modify") {
    return {
      decision: "modify",
      changes: typeof obj.changes === "string" && obj.changes ? obj.changes : input.userMessage,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    }
  }
  return heuristicClassify(input.userMessage)
}
