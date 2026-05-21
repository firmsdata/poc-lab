import { AppShell } from "@/components/layout/AppShell"
import { AnalysisHistory } from "@/components/analysis/AnalysisHistory"

export function AnalysisPage() {
  return (
    <AppShell title="Analysis History">
      <AnalysisHistory />
    </AppShell>
  )
}
