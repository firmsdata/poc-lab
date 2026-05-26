import { FileText, Database, Layers, Building2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { KBStats } from "@/types"

type StatsOverviewProps = {
  stats: KBStats
  loading?: boolean
}

const statConfig = [
  {
    key: "total_risk_disclosures" as const,
    label: "Total Risk Disclosures",
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    key: "total_documents" as const,
    label: "Total Documents",
    icon: Database,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  {
    key: "domains_covered" as const,
    label: "Domains Covered",
    icon: Layers,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    key: "companies_referenced" as const,
    label: "Companies Referenced",
    icon: Building2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
]

export function StatsOverview({ stats, loading }: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {statConfig.map((s) => (
        <Card
          key={s.key}
          className={`border ${s.border} bg-card/80 py-0 gap-0`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`flex size-9 items-center justify-center rounded-lg ${s.bg}`}>
                <s.icon className={`size-4 ${s.color}`} />
              </div>
            </div>
            {loading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold gradient-text">
                {stats[s.key].toLocaleString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
