"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  Bell,
  CircleUserRound,
  History,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Send,
  Settings,
  SquarePen,
  Trash2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const GREETING =
  "Hello! I'm your HubFlow agent. I can help you automate your HubSpot tasks, like updating deals, syncing contacts, or generating reports. What can I do for you today?"

const CHAT_HISTORY = [
  "Update Q4 Pipeline",
  "Lead Sync July 12",
  "Weekly Sales Report",
  "New Deal Automation",
  "Contact List Cleanup",
]

const HUBFLOW_LOCKUP_VIEWBOX = 1024
const HUBFLOW_LOCKUP_CONTENT = { minX: 44.6, minY: 354.2, width: 948.9, height: 315.5 }

function BrandLockup({ height = 32, className }: { height?: number; className?: string }) {
  const scale = height / HUBFLOW_LOCKUP_CONTENT.height
  const width = Math.round(HUBFLOW_LOCKUP_CONTENT.width * scale)
  const imgSize = Math.round(HUBFLOW_LOCKUP_VIEWBOX * scale)
  const left = -Math.round(HUBFLOW_LOCKUP_CONTENT.minX * scale)
  const top = -Math.round(HUBFLOW_LOCKUP_CONTENT.minY * scale)

  return (
    <div className={cn("relative shrink-0 overflow-hidden", className)} style={{ width, height }}>
      <Image
        src="/hubflow.svg"
        alt="HubFlow"
        width={imgSize}
        height={imgSize}
        style={{ position: "absolute", left, top, maxWidth: "none" }}
        preload
      />
    </div>
  )
}

function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      <Image src="/hubflow_a.svg" alt="HubFlow" fill sizes={`${size}px`} className="object-contain p-1" />
    </div>
  )
}

function StatusDot() {
  return (
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
    </span>
  )
}

function ExpandedSidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <BrandLockup height={34} />
      </div>
      <div className="flex items-center gap-1.5 px-5 pb-5 text-xs font-medium text-emerald-400">
        <StatusDot />
        CRM Agent Active
      </div>

      <div className="px-4">
        <p className="px-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Menu</p>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 active:scale-[0.98]"
        >
          <SquarePen className="size-4 shrink-0" />
          <span className="truncate">New Chat</span>
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-4 no-scrollbar">
        <p className="px-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Chat History</p>
        <div className="flex flex-col gap-0.5">
          {CHAT_HISTORY.map((title, i) => (
            <div
              key={title}
              className={cn(
                "group relative flex w-full items-center rounded-lg text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
                i === 0 && "bg-white/[0.06] text-white"
              )}
            >
              <button
                type="button"
                className="flex-1 truncate rounded-lg px-3 py-1.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
              >
                <span className="truncate">{title}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${title}`}
                className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-white/40 opacity-0 outline-none transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400/40"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/70 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <Settings className="size-5 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  )
}

function CollapsedSidebar({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center px-2 py-5">
      <BrandMark size={36} />

      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand sidebar"
        className="mt-4 flex size-9 items-center justify-center rounded-lg text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <PanelLeftOpen className="size-4" />
      </button>

      <button
        type="button"
        aria-label="New Chat"
        className="mt-2 flex size-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 active:scale-[0.98]"
      >
        <SquarePen className="size-4" />
      </button>

      <button
        type="button"
        aria-label="Chat History"
        className="mt-2 flex size-9 items-center justify-center rounded-lg text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <History className="size-4" />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Settings"
        className="flex size-10 items-center justify-center rounded-lg text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <Settings className="size-5" />
      </button>
    </div>
  )
}

function CollapseToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Collapse sidebar"
      className="absolute top-4 right-3 z-10 flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
    >
      <PanelLeftClose className="size-3.5" />
    </button>
  )
}

export default function HubFlowChat() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    if (!mobileDrawerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileDrawerOpen])

  useEffect(() => {
    if (!mobileDrawerOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileDrawerOpen])

  return (
    <div className="dark relative flex h-dvh min-h-0 w-full flex-1 overflow-hidden bg-[#07070d] text-zinc-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="animate-hubflow-glow absolute -top-40 -left-40 size-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
        <div
          className="animate-hubflow-glow absolute top-1/3 -right-40 size-[32rem] rounded-full bg-blue-600/15 blur-3xl"
          style={{ animationDelay: "-4s" }}
        />
        <div
          className="animate-hubflow-glow absolute -bottom-48 left-1/3 size-[28rem] rounded-full bg-fuchsia-600/15 blur-3xl"
          style={{ animationDelay: "-8s" }}
        />
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative z-20 hidden shrink-0 flex-col border-r border-white/5 bg-white/[0.02] transition-all duration-300 ease-in-out md:flex",
          sidebarCollapsed ? "md:w-[72px]" : "md:w-72"
        )}
      >
        {!sidebarCollapsed && <CollapseToggle onClick={() => setSidebarCollapsed(true)} />}
        {sidebarCollapsed ? (
          <CollapsedSidebar onExpand={() => setSidebarCollapsed(false)} />
        ) : (
          <ExpandedSidebar />
        )}
      </aside>

      {/* Mobile drawer */}
      <div
        aria-hidden={!mobileDrawerOpen}
        onClick={() => setMobileDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          mobileDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar"
        aria-hidden={!mobileDrawerOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-72 flex-col border-r border-white/10 bg-[#0b0b13] shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          mobileDrawerOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        )}
      >
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-3 z-10 flex size-8 items-center justify-center rounded-md text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <X className="size-4" />
        </button>
        <ExpandedSidebar />
      </aside>

      {/* Main panel */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
              className="flex size-9 items-center justify-center rounded-lg text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <Menu className="size-5" />
            </button>
            <BrandMark size={24} />
            <span className="text-sm font-bold text-white">HubFlow</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Bell />
              </Button>
              <span className="pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-full bg-fuchsia-500 ring-2 ring-[#07070d]" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Account"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <CircleUserRound />
            </Button>
          </div>
        </header>

        {/* Scrolling message area */}
        <div className="relative min-h-0 flex-1">
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
        </div>
      </div>
    </div>
  )
}
