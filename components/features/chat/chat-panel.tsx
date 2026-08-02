"use client"

import { Paperclip, Send } from "lucide-react"

import { BrandMark } from "@/components/features/shell/brand"

const GREETING =
  "Hello! I'm your HubFlow agent. I can help you automate your HubSpot tasks, like updating deals, syncing contacts, or generating reports. What can I do for you today?"

export function ChatPanel() {
  return (
    <>
      <div className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pt-6 pb-40 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex max-w-[85%] gap-3 sm:max-w-[75%]">
            <BrandMark size={32} />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-1.5 px-0.5">
                <span className="text-sm font-semibold text-white">HubFlow</span>
                <span className="text-xs text-white/40">Agent</span>
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-lg shadow-black/20">
                {GREETING}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating glass input pill — ONLY the pill blurs, no full-width overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-8 sm:pb-6">
        <form
          onSubmit={(e) => e.preventDefault()}
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
            placeholder="Message HubFlow..."
            aria-label="Message HubFlow"
            className="min-w-0 flex-1 bg-transparent px-1 text-sm text-white placeholder:text-white/40 outline-none"
          />
          <button
            type="submit"
            aria-label="Send message"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60"
          >
            <Send className="size-4" />
          </button>
        </form>
        <p className="pointer-events-auto mx-auto mt-3 max-w-3xl text-center text-[11px] leading-relaxed text-white/35">
          HubFlow AI can make mistakes. Consider verifying important HubSpot updates.
        </p>
      </div>
    </>
  )
}
