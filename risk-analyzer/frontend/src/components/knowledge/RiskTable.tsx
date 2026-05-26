import { useState, Fragment } from "react"
import { Eye, Loader2, MessageSquareText, Sparkles as SparklesIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { RiskRecord, RelevanceLevel } from "@/types"
import { cn } from "@/lib/utils"
import { fetchRiskSummary } from "@/services/api"

type RiskTableProps = {
  risks: RiskRecord[]
  loading?: boolean
  onViewDetails: (risk: RiskRecord) => void
}

const relevanceConfig: Record<
  RelevanceLevel,
  {
    variant: "critical" | "high" | "medium" | "low" | "adequate"
    border: string
    tooltip: string
  }
> = {
  Critical: {
    variant: "critical",
    border: "border-l-purple-500",
    tooltip: "Disclosed by >80% of DRHPs in this domain. Requires specific, detailed disclosure per SEBI ICDR.",
  },
  High: {
    variant: "high",
    border: "border-l-red-500",
    tooltip: "Disclosed by 60-80% of DRHPs. Highly relevant; vague disclosures attract SEBI scrutiny.",
  },
  Medium: {
    variant: "medium",
    border: "border-l-amber-500",
    tooltip: "Disclosed by 40-60% of DRHPs. Common risk factor with moderate disclosure requirements.",
  },
  Low: {
    variant: "low",
    border: "border-l-emerald-500",
    tooltip: "Disclosed by <40% of DRHPs. Situational risk with lighter disclosure obligations.",
  },
  Adequate: {
    variant: "adequate",
    border: "border-l-emerald-500",
    tooltip: "Adequately disclosed. Meets SEBI ICDR minimum standards.",
  },
}

function RelevanceBadge({ level }: { level: RelevanceLevel }) {
  const config = relevanceConfig[level]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Badge variant={config.variant} className="cursor-help">
            {level}
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px]">{config.tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function RiskTable({ risks, loading, onViewDetails }: RiskTableProps) {
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [loadingSummary, setLoadingSummary] = useState<Record<string, boolean>>({})

  const handleGetSummary = async (riskId: string) => {
    if (summaries[riskId]) return // already fetched

    setLoadingSummary(prev => ({ ...prev, [riskId]: true }))
    try {
      const text = await fetchRiskSummary(riskId)
      setSummaries(prev => ({ ...prev, [riskId]: text }))
    } catch (e) {
      setSummaries(prev => ({ ...prev, [riskId]: "Failed to fetch summary." }))
    } finally {
      setLoadingSummary(prev => ({ ...prev, [riskId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Risk Title
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Domain
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Category
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sub-Category
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              DRHPs
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Relevance
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sr-only">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {risks.map((risk) => {
            const config = relevanceConfig[risk.relevance_level]
            return (
              <Fragment key={risk.id}>
                <tr
                  className={cn(
                    "border-b border-border/50 border-l-2 transition-all",
                    "hover:bg-muted/20",
                    config.border
                  )}
                >
                  <td className="py-3 px-4">
                    <span className="font-medium text-foreground text-xs leading-tight line-clamp-2">
                      {risk.title}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="blue" className="text-[10px]">{risk.domain}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs text-muted-foreground capitalize">{risk.category}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs text-muted-foreground">{risk.sub_category}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-semibold text-foreground">{risk.drhp_count}</span>
                  </td>
                  <td className="py-3 px-4">
                    <RelevanceBadge level={risk.relevance_level} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleGetSummary(risk.id)}
                        disabled={loadingSummary[risk.id]}
                        className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary border border-transparent hover:border-border/50"
                      >
                        {loadingSummary[risk.id] ? <Loader2 className="size-3 mr-1.5 animate-spin" /> : <MessageSquareText className="size-3 mr-1.5" />}
                        Summary
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onViewDetails(risk)}
                        className="size-7 text-muted-foreground hover:text-primary"
                        title="View Full Details"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {summaries[risk.id] && (
                  <tr className="bg-primary/5 border-b border-border/50">
                    <td colSpan={7} className="px-4 py-2.5 text-xs text-muted-foreground border-l-2 border-l-primary">
                      <div className="flex items-start gap-2">
                        <SparklesIcon className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="leading-relaxed text-foreground/80 font-medium">
                          {summaries[risk.id]}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {risks.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No risks match the current filters.
        </div>
      )}
    </div>
  )
}
