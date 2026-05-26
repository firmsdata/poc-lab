import { useState } from "react"
import { Upload } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { AnalysisHistory } from "@/components/analysis/AnalysisHistory"
import { UploadZone } from "@/components/analysis/UploadZone"
import { Button } from "@/components/ui/button"

export function AnalysisPage() {
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <AppShell
      title="Analysis History"
      actions={
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4 mr-2" />
          Upload DRHP
        </Button>
      }
    >
      <AnalysisHistory />
      <UploadZone open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </AppShell>
  )
}
