import { AlertTriangle, Lightbulb, BookOpen, CheckCircle, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { StreamedRisk, QualityRating } from "@/types"
import { cn } from "@/lib/utils"

type RiskCardProps = {
  risk: StreamedRisk
  index: number
}

const qualityConfig: Record<
  QualityRating,
  {
    variant: "adequate" | "improvement" | "concern"
    icon: React.ComponentType<{ className?: string }>
    border: string
    iconColor: string
  }
> = {
  Adequate: {
    variant: "adequate",
    icon: CheckCircle,
    border: "border-l-emerald-500",
    iconColor: "text-emerald-400",
  },
  "Needs Improvement": {
    variant: "improvement",
    icon: AlertTriangle,
    border: "border-l-amber-500",
    iconColor: "text-amber-400",
  },
  "High Concern": {
    variant: "concern",
    icon: XCircle,
    border: "border-l-red-500",
    iconColor: "text-red-400",
  },
}

export function RiskCard({ risk, index }: RiskCardProps) {
  const config = qualityConfig[risk.quality_rating]
  const Icon = config.icon

  return (
    <Card
      className={cn(
        "border border-l-2 bg-card/80 py-0 gap-0 animate-risk-card",
        config.border
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <Icon className={cn("size-4 shrink-0 mt-0.5", config.iconColor)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">{risk.title}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="blue" className="text-[10px]">{risk.domain}</Badge>
              <Badge variant="cyan" className="text-[10px] capitalize">{risk.category}</Badge>
              <Badge variant={config.variant} className="text-[10px]">
                {risk.quality_rating}
              </Badge>
            </div>
          </div>
        </div>

        {/* Issue */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="size-3" />
            Issue Identified
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{risk.issue}</p>
        </div>

        {/* Improvement suggestion */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Lightbulb className="size-3 text-amber-400" />
            Improvement Suggestion
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed">{risk.improvement_suggestion}</p>
        </div>

        {/* Rulebook findings */}
        {risk.rulebook_findings.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="size-3 text-blue-400" />
              DRHP Rulebook
            </p>
            <div className="flex flex-wrap gap-1.5">
              {risk.rulebook_findings.map((finding, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-300"
                >
                  {finding}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
