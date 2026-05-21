import { useState, useEffect, useMemo } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { FilterBar } from "@/components/knowledge/FilterBar"
import { StatsOverview } from "@/components/knowledge/StatsOverview"
import { ChartsSection } from "@/components/knowledge/ChartsSection"
import { RiskTable } from "@/components/knowledge/RiskTable"
import { CompanyTable } from "@/components/knowledge/CompanyTable"
import { RiskDetailModal } from "@/components/knowledge/RiskDetailModal"
import { CompanyDetailModal } from "@/components/knowledge/CompanyDetailModal"
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
    <AppShell title="Knowledge Base">
      <div className="p-6 space-y-6">
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
    </AppShell>
  )
}
