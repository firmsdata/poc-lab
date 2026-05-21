import { useState, useEffect } from "react"
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchDisclosurePatterns } from "@/services/api"
import type { RiskRecord, DisclosurePattern, DisclosureVariant } from "@/types"
import { cn } from "@/lib/utils"

type RiskDetailModalProps = {
  risk: RiskRecord | null
  open: boolean
  onClose: () => void
}

function getHeatColor(count: number, maxCount: number): string {
  const intensity = count / maxCount
  if (intensity > 0.8) return "bg-blue-500/80 border-blue-400/40"
  if (intensity > 0.6) return "bg-blue-500/60 border-blue-400/30"
  if (intensity > 0.4) return "bg-blue-500/40 border-blue-400/20"
  if (intensity > 0.2) return "bg-blue-500/20 border-blue-400/15"
  return "bg-blue-500/10 border-blue-400/10"
}

function HeatmapCell({
  variant,
  maxCount,
}: {
  variant: DisclosureVariant
  maxCount: number
}) {
  const [expanded, setExpanded] = useState(false)
  const colorClass = getHeatColor(variant.count, maxCount)

  return (
    <div
      className={cn(
        "rounded-lg border p-3 cursor-pointer transition-all duration-150",
        colorClass,
        "hover:brightness-125"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className={cn("text-xs text-foreground leading-relaxed", expanded ? "" : "line-clamp-3")}>
          {variant.text}
        </p>
        {expanded ? (
          <ChevronUp className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-blue-300">
          {variant.count} DRHP{variant.count !== 1 ? "s" : ""}
        </span>
        {expanded && (
          <div className="flex flex-wrap gap-1">
            {variant.companies.map((c) => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded bg-background/40 text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RiskDetailModal({ risk, open, onClose }: RiskDetailModalProps) {
  const [pattern, setPattern] = useState<DisclosurePattern | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!risk || !open) return
    setLoading(true)
    fetchDisclosurePatterns(risk.domain, risk.category)
      .then(setPattern)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [risk, open])

  if (!risk) return null

  const maxCount = pattern
    ? Math.max(...pattern.variants.map((v) => v.count))
    : 1

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold pr-6">{risk.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="blue" className="text-xs">{risk.domain}</Badge>
              <Badge variant="cyan" className="text-xs capitalize">{risk.category}</Badge>
              <Badge
                variant={
                  risk.relevance_level === "Critical"
                    ? "critical"
                    : risk.relevance_level === "High"
                    ? "high"
                    : risk.relevance_level === "Medium"
                    ? "medium"
                    : "low"
                }
                className="text-xs"
              >
                {risk.relevance_level}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                Disclosed in {risk.drhp_count} DRHPs
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-6">
            {/* Disclosure patterns heatmap */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-foreground">Disclosure Patterns</h3>
                <span className="text-xs text-muted-foreground">
                  — how this risk was disclosed across DRHPs
                </span>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : pattern ? (
                <>
                  {/* Frequency legend */}
                  <div className="flex items-center gap-3 mb-3 text-[10px] text-muted-foreground">
                    <span>Frequency:</span>
                    <div className="flex items-center gap-1">
                      <span className="size-3 rounded-sm bg-blue-500/10 border border-blue-400/10 inline-block" />
                      <span>Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="size-3 rounded-sm bg-blue-500/40 border border-blue-400/20 inline-block" />
                      <span>Medium</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="size-3 rounded-sm bg-blue-500/80 border border-blue-400/40 inline-block" />
                      <span>High</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {pattern.variants.map((variant) => (
                      <HeatmapCell
                        key={variant.id}
                        variant={variant}
                        maxCount={maxCount}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </section>

            {/* Rulebook violations */}
            {pattern && pattern.rulebook_violations.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="size-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-foreground">DRHP Rulebook References</h3>
                </div>
                <div className="space-y-2">
                  {pattern.rulebook_violations.map((violation, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                    >
                      <ExternalLink className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-foreground">{violation}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
