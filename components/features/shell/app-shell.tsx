"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import {
  IconBell,
  IconHistoryToggle,
  IconLayoutSidebar,
  IconLayoutSidebarFilled,
  IconLoader,
  IconMenu,
  IconMessageCircle,
  IconMessageCircleFilled,
  IconOctagonPlus,
  IconOctagonPlusFilled,
  IconSettings,
  IconSettingsFilled,
  IconTrash,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { BrandLockup, BrandMark } from "./brand"

interface Chat {
  id: string
  name: string
  credential_id: string | null
  created_at: string
  updated_at: string
}

interface ExpandedSidebarProps {
  chats: Chat[]
  selectedChatId: string | null
  isLoading: boolean
  error: string | null
  deletingId: string | null
  isSettingsActive: boolean
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onNewChat: () => void
}

// Chat tab icon — outline MessageCircle, swaps to the filled tabler variant
// when this chat is the selected one.
function ChatIcon({ active }: { active?: boolean }) {
  const Icon = active ? IconMessageCircleFilled : IconMessageCircle
  return (
    <Icon
      className={cn(
        "size-5 shrink-0",
        active ? "text-violet-200" : "text-white/70",
      )}
    />
  )
}

function ExpandedSidebar({
  chats,
  selectedChatId,
  isLoading,
  error,
  deletingId,
  isSettingsActive,
  onSelectChat,
  onDeleteChat,
  onNewChat,
}: ExpandedSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <BrandLockup />
      </div>

      <div className="px-4">
        <p className="px-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Menu</p>
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 active:scale-[0.98]"
        >
          <IconOctagonPlus className="size-5 shrink-0" />
          <span className="truncate">New Chat</span>
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-4 no-scrollbar">
        <p className="px-1 pb-2 text-[11px] font-semibold tracking-wider text-white/40 uppercase">Chat History</p>

        {isLoading && chats.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-[13px] text-white/40">
            <IconLoader className="size-3.5 animate-spin" />
            Loading…
          </div>
        )}

        {!isLoading && error && <p className="px-3 py-2 text-[12px] text-red-400/80">{error}</p>}

        {!isLoading && !error && chats.length === 0 && (
          <p className="px-3 py-2 text-[12px] text-white/40">No chats yet. Start one above.</p>
        )}

        <div className="flex flex-col gap-1">
          {chats.map((chat) => {
            const isActive = chat.id === selectedChatId
            const isDeleting = chat.id === deletingId
            return (
              <div
                key={chat.id}
                className={cn(
                  "group relative flex h-11 w-full items-center rounded-xl text-white/70 transition-colors",
                  isActive
                    ? "bg-violet-500/15 text-white ring-1 ring-inset ring-violet-400/30"
                    : "hover:bg-white/[0.06] hover:text-white",
                  isDeleting && "pointer-events-none opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                >
                  <ChatIcon active={isActive} />
                  <span className="truncate">{chat.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${chat.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteChat(chat.id)
                  }}
                  className="mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-white/40 opacity-0 outline-none transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400/40"
                >
                  {isDeleting ? <IconLoader className="size-4 animate-spin" /> : <IconTrash className="size-4" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50",
            isSettingsActive
              ? "bg-violet-500/15 text-white ring-1 ring-inset ring-violet-400/30"
              : "text-white/70 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          {isSettingsActive ? (
            <IconSettingsFilled className="size-6 shrink-0 text-violet-300" />
          ) : (
            <IconSettings className="size-6 shrink-0" />
          )}
          <span>Settings</span>
        </Link>
      </div>
    </div>
  )
}

function CollapsedSidebar({
  onExpand,
  onNewChat,
  isSettingsActive,
}: {
  onExpand: () => void
  onNewChat: () => void
  isSettingsActive: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center px-2 py-5">
      <BrandMark size={36} />

      {/* Panel is closed — collapsed-state icon is FILLED per spec. */}
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand sidebar"
        className="mt-5 flex size-10 items-center justify-center rounded-lg text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <IconLayoutSidebarFilled className="size-5" />
      </button>

      {/* New Chat trigger — filled icon in the collapsed state per spec. */}
      <button
        type="button"
        onClick={onNewChat}
        aria-label="New Chat"
        className="mt-2 flex size-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 outline-none transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300/60 active:scale-[0.98]"
      >
        <IconOctagonPlusFilled className="size-5" />
      </button>

      {/* Chat history — dedicated collapsed-view icon per spec. */}
      <button
        type="button"
        onClick={onExpand}
        aria-label="Chat History"
        className="mt-2 flex size-10 items-center justify-center rounded-lg text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <IconHistoryToggle className="size-5" />
      </button>

      <div className="flex-1" />

      <Link
        href="/settings"
        aria-label="Settings"
        className={cn(
          "flex size-11 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50",
          isSettingsActive
            ? "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/30"
            : "text-white/60 hover:bg-white/10 hover:text-white",
        )}
      >
        {isSettingsActive ? (
          <IconSettingsFilled className="size-6" />
        ) : (
          <IconSettings className="size-6" />
        )}
      </Link>
    </div>
  )
}

// The panel is currently OPEN — the toggle offers to CLOSE it. Outline glyph
// here; the collapsed-state expand button (above) uses the filled variant.
function CollapseToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Collapse sidebar"
      className="absolute top-4 right-3 z-10 flex size-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
    >
      <IconLayoutSidebar className="size-5" />
    </button>
  )
}

const CHAT_PATH_MATCH = /^\/chats\/([0-9a-f-]{36})/i

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isSettingsActive = pathname?.startsWith("/settings") ?? false
  // Selected chat comes from the URL — `/chats/<uuid>` — so navigating and
  // active-highlight stay in sync without a separate state.
  const selectedChatId = pathname?.match(CHAT_PATH_MATCH)?.[1] ?? null

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  const [chats, setChats] = useState<Chat[]>([])
  const [isLoadingChats, setIsLoadingChats] = useState(true)
  const [chatsError, setChatsError] = useState<string | null>(null)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newChatName, setNewChatName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    // Load chat list on mount. Setup-only effect (external -> React); the loading
    // flag defaults to true so we don't call setState synchronously in here.
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch("/api/chats", { cache: "no-store", signal: controller.signal })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || `Failed to load chats (${res.status})`)
        }
        const data = (await res.json()) as { chats: Chat[] }
        setChats(data.chats)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setChatsError((err as Error).message)
      } finally {
        setIsLoadingChats(false)
      }
    })()
    return () => controller.abort()
  }, [])

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

  function openCreateDialog() {
    setCreateError(null)
    setNewChatName("")
    setCreateDialogOpen(true)
  }

  async function handleCreateChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newChatName.trim()
    if (!name) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `Failed to create chat (${res.status})`)
      }
      const data = (await res.json()) as { chat: Chat }
      setChats((prev) => [data.chat, ...prev.filter((c) => c.id !== data.chat.id)])
      setCreateDialogOpen(false)
      setNewChatName("")
      setMobileDrawerOpen(false)
      // Navigate to the newly created chat's conversation view.
      router.push(`/chats/${data.chat.id}`)
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteChat(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `Failed to delete chat (${res.status})`)
      }
      setChats((prev) => prev.filter((c) => c.id !== id))
      // If the deleted chat was open, bounce back to the landing page.
      if (selectedChatId === id) router.push("/")
    } catch (err) {
      setChatsError((err as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  function handleSelectChat(id: string) {
    setMobileDrawerOpen(false)
    router.push(`/chats/${id}`)
  }

  const sidebarProps: ExpandedSidebarProps = {
    chats,
    selectedChatId,
    isLoading: isLoadingChats,
    error: chatsError,
    deletingId,
    isSettingsActive,
    onSelectChat: handleSelectChat,
    onDeleteChat: handleDeleteChat,
    onNewChat: openCreateDialog,
  }

  return (
    <div className="relative flex h-dvh min-h-0 w-full flex-1 overflow-hidden bg-[#07070d] text-zinc-100">
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
          sidebarCollapsed ? "md:w-[72px]" : "md:w-72",
        )}
      >
        {!sidebarCollapsed && <CollapseToggle onClick={() => setSidebarCollapsed(true)} />}
        {sidebarCollapsed ? (
          <CollapsedSidebar
            onExpand={() => setSidebarCollapsed(false)}
            onNewChat={openCreateDialog}
            isSettingsActive={isSettingsActive}
          />
        ) : (
          <ExpandedSidebar {...sidebarProps} />
        )}
      </aside>

      {/* Mobile drawer */}
      <div
        aria-hidden={!mobileDrawerOpen}
        onClick={() => setMobileDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          mobileDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Sidebar"
        aria-hidden={!mobileDrawerOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-72 flex-col border-r border-white/10 bg-[#0b0b13] shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          mobileDrawerOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-3 z-10 flex size-8 items-center justify-center rounded-md text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <IconX className="size-4" />
        </button>
        <ExpandedSidebar {...sidebarProps} />
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
              <IconMenu className="size-5" />
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
                <IconBell />
              </Button>
              <span className="pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-full bg-fuchsia-500 ring-2 ring-[#07070d]" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Account"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <IconUserCircle />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>

      {/* New Chat dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(next) => {
          setCreateDialogOpen(next)
          if (!next) {
            setCreateError(null)
          }
        }}
      >
        <DialogContent className="border border-white/10 bg-[#0d0d16] text-zinc-100 ring-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">New Chat</DialogTitle>
            <DialogDescription className="text-white/60">
              Give this conversation a short, memorable name.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChat} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="chat-name" className="text-white/80">
                Chat name
              </Label>
              <Input
                id="chat-name"
                autoFocus
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="e.g. Q4 Pipeline Review"
                maxLength={120}
                disabled={isCreating}
                className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
              />
              {createError && <p className="text-xs text-red-400">{createError}</p>}
            </div>
            <DialogFooter className="border-t-white/10 bg-white/[0.02]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={isCreating}
                className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newChatName.trim() || isCreating}
                className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-950/40 hover:brightness-110"
              >
                {isCreating ? (
                  <>
                    <IconLoader className="animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
