import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { Document } from "@/types"

type DocumentDetailModalProps = {
  document: Document | null
  open: boolean
  onClose: () => void
}

export function DocumentDetailModal({ document, open, onClose }: DocumentDetailModalProps) {
  if (!document) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">{document.company}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Review the uploaded document details and analysis summary.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-2">Document type</p>
              <Badge variant={document.type === "DRHP" ? "blue" : "cyan"} className="text-xs">
                {document.type}
              </Badge>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-2">Year</p>
              <p className="text-sm text-foreground font-semibold">{document.year}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-2">Domain</p>
              <p className="text-sm text-foreground font-semibold capitalize">{document.domain}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-2">Total risks</p>
              <p className="text-sm text-foreground font-semibold">{document.total_risks}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-3">Date added</p>
            <p className="text-sm text-foreground">
              {new Date(document.date_added).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.24em] mb-3">Document ID</p>
            <p className="text-sm text-foreground break-all">{document.id}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
