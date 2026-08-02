import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import type { Runnable } from "@langchain/core/runnables"
import type { BaseMessage, AIMessageChunk } from "@langchain/core/messages"
import type { StructuredToolInterface } from "@langchain/core/tools"

// Reads Gemini config lazily (each call), so changing .env and hot-reloading
// picks the new values up without a code change.
function readModelConfig() {
  const apiKey = process.env.GOOGLE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add it to .env — get one from https://aistudio.google.com/apikey.",
    )
  }
  const primary = process.env.GOOGLE_MODEL_PRIMARY?.trim() || "gemini-3.5-flash-lite"
  const fallback = process.env.GOOGLE_MODEL_FALLBACK?.trim() || "gemini-3.1-flash-lite"
  const tempRaw = process.env.GOOGLE_MODEL_TEMPERATURE?.trim()
  const temperature =
    tempRaw && Number.isFinite(Number(tempRaw)) ? Number(tempRaw) : 0.2
  return { apiKey, primary, fallback, temperature }
}

function makeChatModel(model: string, temperature: number, apiKey: string): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model,
    temperature,
    apiKey,
    // Streaming enables incremental UI updates, no cost impact.
    streaming: true,
  })
}

// Returns a tool-bound chat model that transparently falls back to the
// secondary Gemini when the primary is rate-limited (429) or unavailable
// (5xx). Tools MUST be bound before the fallback wrap — RunnableWithFallbacks
// itself has no `.bindTools`, and the graph invokes this runnable with
// messages, so both underlying models need the tools already attached.
export function getAgentModel(
  tools: StructuredToolInterface[],
): Runnable<BaseMessage[], AIMessageChunk> {
  const cfg = readModelConfig()
  const primary = makeChatModel(cfg.primary, cfg.temperature, cfg.apiKey).bindTools(tools)
  const fallback = makeChatModel(cfg.fallback, cfg.temperature, cfg.apiKey).bindTools(tools)
  return primary.withFallbacks([fallback])
}

// A no-tools, low-temperature model used for utility classifications such as
// the approval gate. Reused-per-request; not cached so env changes take
// effect immediately in dev.
export function getClassifierModel(): Runnable<BaseMessage[], AIMessageChunk> {
  const cfg = readModelConfig()
  const primary = makeChatModel(cfg.primary, 0, cfg.apiKey)
  const fallback = makeChatModel(cfg.fallback, 0, cfg.apiKey)
  return primary.withFallbacks([fallback])
}
