import type { ReactNode } from "react"

import { AppShell } from "@/components/features/shell/app-shell"

// A route-group layout so the sidebar and header stay mounted across
// route changes between /, /settings, etc.
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
