import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { Upload } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { FilterBar } from "@/components/knowledge/FilterBar"
import { StatsOverview } from "@/components/knowledge/StatsOverview"
import { ChartsSection } from "@/components/knowledge/ChartsSection"
import { RiskTable } from "@/components/knowledge/RiskTable"
import { CompanyTable } from "@/components/knowledge/CompanyTable"
import { RiskDetailModal } from "@/components/knowledge/RiskDetailModal"
import { CompanyDetailModal } from "@/components/knowledge/CompanyDetailModal"
import { UploadZone } from "@/components/analysis/UploadZone"
import { fetchKBStats, fetchRisks, fetchCompanies } from "@/services/api"
import type { KBFilters, RiskRecord, CompanyRecord, KBStats } from "@/types"

export function KnowledgeBasePage() {
  const [filters, setFilters] = useState<KBFilters>({ domain: "", category: "", sub_category: "" })
  const [stats, setStats] = useState<KBStats | null>(null)
  const [risks, setRisks] = useState<RiskRecord[]>([])
  const [companies, setCompanies] = useState<CompanyRecord[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingRisks, setLoadingRisks] = useState(true)
  const [loadingCompanies, setLoadingCompanies] = useState(true)

  const [selectedRisk, setSelectedRisk] = useState<RiskRecord | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null)
  const [riskModalOpen, setRiskModalOpen] = useState(false)
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  // Load stats once
  useEffect(() => {
    setLoadingStats(true)
    fetchKBStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoadingStats(false))
  }, [])

  // Load risks when filters change
  useEffect(() => {
    setLoadingRisks(true)
    fetchRisks(filters)
      .then(setRisks)
      .catch(console.error)
      .finally(() => setLoadingRisks(false))
  }, [filters])

  // Load companies when domain filter changes
  useEffect(() => {
    setLoadingCompanies(true)
    fetchCompanies(filters.domain || undefined)
      .then(setCompanies)
      .catch(console.error)
      .finally(() => setLoadingCompanies(false))
  }, [filters.domain])

  const qualityDistribution = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, adequate: 0 }
    for (const r of risks) {
      if (r.relevance_level === "Critical") counts.critical++
      else if (r.relevance_level === "High") counts.high++
      else if (r.relevance_level === "Medium") counts.medium++
      else counts.adequate++
    }
    return counts
  }, [risks])

  const risksByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of risks) {
      if (r.category) map.set(r.category, (map.get(r.category) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [risks])

  const handleViewRisk = (risk: RiskRecord) => {
    setSelectedRisk(risk)
    setRiskModalOpen(true)
  }

  const handleViewCompany = (company: CompanyRecord) => {
    setSelectedCompany(company)
    setCompanyModalOpen(true)
  }

  return (
    <AppShell
      title="Knowledge Base"
      actions={
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4 mr-2" />
          Analyze DRHP
        </Button>
      }
    >
      <div className="p-6 space-y-6">
        <div className="rounded-3xl border border-border bg-gradient-to-br from-slate-950/70 to-slate-900/90 p-6 shadow-lg shadow-slate-950/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground/80">
                Disclosure intelligence
              </p>
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                See risk disclosure patterns, compare filings, and improve IPO readiness.
              </h2>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Explore a live knowledge base of risk factors, filter by domain and category, then upload a DRHP PDF for instant AI-backed analysis and feedback.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button className="bg-primary hover:bg-primary/90" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4 mr-2" />
                Upload DRHP
              </Button>
              <Button variant="outline" asChild>
                <Link to="/analysis">View history</Link>
              </Button>
            </div>
          </div>
        </div>
        {/* Filter bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <FilterBar filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Stats */}
        {stats && <StatsOverview stats={stats} loading={loadingStats} />}

        {/* Charts */}
        <ChartsSection
          qualityDistribution={qualityDistribution}
          risksByCategory={risksByCategory}
        />

        {/* Risk table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Risk Disclosures
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({risks.length} records)
              </span>
            </h2>
          </div>
          <RiskTable risks={risks} loading={loadingRisks} onViewDetails={handleViewRisk} />
        </div>

        {/* Company table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Company Reference
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({companies.length} companies)
              </span>
            </h2>
          </div>
          <CompanyTable
            companies={companies}
            loading={loadingCompanies}
            onViewDetails={handleViewCompany}
          />
        </div>
      </div>

      {/* Modals */}
      <RiskDetailModal
        risk={selectedRisk}
        open={riskModalOpen}
        onClose={() => setRiskModalOpen(false)}
      />
      <CompanyDetailModal
        company={selectedCompany}
        open={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
      />
      <UploadZone open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </AppShell>
  )
}
