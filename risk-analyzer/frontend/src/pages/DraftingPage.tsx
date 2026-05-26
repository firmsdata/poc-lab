import { AppShell } from "@/components/layout/AppShell"
import { DraftingAssistant } from "@/components/drafting/DraftingAssistant"

export function DraftingPage() {
  return (
    <AppShell title="DRHP Drafting Assistant" fullHeight>
      <DraftingAssistant />
    </AppShell>
  )
}
