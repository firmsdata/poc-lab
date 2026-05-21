import { useEffect, useState } from "react"
import { Filter } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { fetchDomains } from "@/services/api"
import type { KBFilters } from "@/types"

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "regulatory", label: "Regulatory" },
  { value: "financial", label: "Financial" },
  { value: "market", label: "Market" },
  { value: "operational", label: "Operational" },
  { value: "tech", label: "Technology" },
]

const SUB_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  regulatory: [
    { value: "SEBI Compliance", label: "SEBI Compliance" },
    { value: "Litigation", label: "Litigation" },
    { value: "Corporate Governance", label: "Corporate Governance" },
    { value: "Device Approvals", label: "Device Approvals" },
  ],
  financial: [
    { value: "Liquidity", label: "Liquidity" },
    { value: "Currency Risk", label: "Currency Risk" },
    { value: "Cash Flow", label: "Cash Flow" },
    { value: "Capital Allocation", label: "Capital Allocation" },
  ],
  market: [
    { value: "Competition", label: "Competition" },
    { value: "Customer Dependency", label: "Customer Dependency" },
    { value: "Macro Risk", label: "Macro Risk" },
    { value: "Reputation", label: "Reputation" },
  ],
  operational: [
    { value: "Key Person Risk", label: "Key Person Risk" },
    { value: "Supply Chain", label: "Supply Chain" },
    { value: "HR Risk", label: "HR Risk" },
    { value: "Doctor Network", label: "Doctor Network" },
  ],
  tech: [
    { value: "Cybersecurity", label: "Cybersecurity" },
    { value: "Scalability", label: "Scalability" },
    { value: "Technology Risk", label: "Technology Risk" },
    { value: "Algorithm Risk", label: "Algorithm Risk" },
  ],
}

type FilterBarProps = {
  filters: KBFilters
  onFiltersChange: (filters: KBFilters) => void
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [domains, setDomains] = useState<string[]>([])

  useEffect(() => {
    fetchDomains().then(setDomains).catch(console.error)
  }, [])

  const subCategories = filters.category && filters.category !== "all"
    ? SUB_CATEGORIES[filters.category] ?? []
    : []

  const handleDomainChange = (value: string) => {
    onFiltersChange({ domain: value === "all" ? "" : value, category: "", sub_category: "" })
  }

  const handleCategoryChange = (value: string) => {
    onFiltersChange({ ...filters, category: value === "all" ? "" : value, sub_category: "" })
  }

  const handleSubCategoryChange = (value: string) => {
    onFiltersChange({ ...filters, sub_category: value === "all" ? "" : value })
  }

  const handleClear = () => {
    onFiltersChange({ domain: "", category: "", sub_category: "" })
  }

  const hasActiveFilters = filters.domain || filters.category || filters.sub_category

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="size-3.5" />
        <span>Filter:</span>
      </div>

      <Select
        value={filters.domain || "all"}
        onValueChange={handleDomainChange}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All Domains" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Domains</SelectItem>
          {domains.map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category || "all"}
        onValueChange={handleCategoryChange}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {subCategories.length > 0 && (
        <Select
          value={filters.sub_category || "all"}
          onValueChange={handleSubCategoryChange}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Sub-Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sub-Categories</SelectItem>
            {subCategories.map((sc) => (
              <SelectItem key={sc.value} value={sc.value}>{sc.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </Button>
      )}
    </div>
  )
}
