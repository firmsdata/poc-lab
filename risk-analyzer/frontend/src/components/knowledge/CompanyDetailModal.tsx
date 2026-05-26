import { useState, useEffect } from "react"
import { Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchCompanyDetail } from "@/services/api"
import type { CompanyRecord, CompanyDetail, QualityRating } from "@/types"

type CompanyDetailModalProps = {
  company: CompanyRecord | null
  open: boolean
  onClose: () => void
}

const qualityConfig: Record<
  QualityRating,
  { variant: "adequate" | "improvement" | "concern"; label: string }
> = {
  Adequate: { variant: "adequate", label: "Adequate" },
  "Needs Improvement": { variant: "improvement", label: "Needs Improvement" },
  "High Concern": { variant: "concern", label: "High Concern" },
}

export function CompanyDetailModal({ company, open, onClose }: CompanyDetailModalProps) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!company || !open) return
    setLoading(true)
    fetchCompanyDetail(company.company_name)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [company, open])

  if (!company) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">{company.company_name}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={company.document_type === "DRHP" ? "blue" : "cyan"}>
                {company.document_type}
              </Badge>
              <span className="text-xs text-muted-foreground">IPO {company.ipo_year}</span>
              <Badge variant="blue" className="text-xs">{company.domain}</Badge>
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {/* Summary stats */}
            {detail && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{detail.summary.adequate}</p>
                  <p className="text-xs text-muted-foreground mt-1">Adequate</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-400">{detail.summary.needs_improvement}</p>
                  <p className="text-xs text-muted-foreground mt-1">Needs Improvement</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-red-400">{detail.summary.high_concern}</p>
                  <p className="text-xs text-muted-foreground mt-1">High Concern</p>
                </div>
              </div>
            )}

            {/* SEBI note */}
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Info className="size-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Most risks are rated <span className="text-emerald-400 font-medium">Adequate</span> as
                this DRHP was accepted by SEBI. Ratings reflect disclosure quality relative to SEBI
                ICDR standards, not business risk severity.
              </p>
            </div>

            {/* Risk table */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Risk Disclosure Quality</h3>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : detail ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2.5 px-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                          Risk Title
                        </th>
                        <th className="py-2.5 px-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                          Category
                        </th>
                        <th className="py-2.5 px-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                          Quality
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.risks.map((risk, i) => {
                        const qConfig = qualityConfig[risk.quality_rating]
                        return (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                            <td className="py-2.5 px-3 font-medium text-foreground">{risk.title}</td>
                            <td className="py-2.5 px-3 text-muted-foreground capitalize">{risk.category}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant={qConfig.variant} className="text-[10px]">
                                {qConfig.label}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
