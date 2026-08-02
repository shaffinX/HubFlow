import type { Metadata } from "next"

import { CredentialsPanel } from "@/components/features/settings/credentials-panel"

export const metadata: Metadata = {
  title: "Settings · HubFlow",
}

export default function SettingsPage() {
  return <CredentialsPanel />
}
