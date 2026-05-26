import { Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CompanyRecord } from "@/types"

type CompanyTableProps = {
  companies: CompanyRecord[]
  loading?: boolean
  onViewDetails: (company: CompanyRecord) => void
}

export function CompanyTable({ companies, loading, onViewDetails }: CompanyTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
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
              Company
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Doc Type
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              IPO Year
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Risks
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Domain
            </th>
            <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Risk Breakdown
            </th>
            <th className="py-3 px-4 sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((co) => {
            const { adequate, needs_improvement, high_concern } = co.risk_breakdown
            const total = adequate + needs_improvement + high_concern
            const adequatePct = Math.round((adequate / total) * 100)
            const improvementPct = Math.round((needs_improvement / total) * 100)
            const concernPct = Math.round((high_concern / total) * 100)

            return (
              <tr
                key={co.company_name}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
              >
                <td className="py-3 px-4">
                  <span className="font-semibold text-foreground text-xs">
                    {co.company_name}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <Badge variant={co.document_type === "DRHP" ? "blue" : "cyan"} className="text-[10px]">
                    {co.document_type}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs text-muted-foreground">{co.ipo_year}</span>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs font-semibold text-foreground">{co.total_risks}</span>
                </td>
                <td className="py-3 px-4">
                  <Badge variant="blue" className="text-[10px]">{co.domain}</Badge>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-1.5 w-24 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${adequatePct}%` }}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${improvementPct}%` }}
                      />
                      <div
                        className="h-full bg-red-500"
                        style={{ width: `${concernPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {adequate}/{needs_improvement}/{high_concern}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onViewDetails(co)}
                    className="size-7 text-muted-foreground hover:text-primary"
                  >
                    <Eye className="size-3.5" />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {companies.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No companies found.
        </div>
      )}
    </div>
  )
}
