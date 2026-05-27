// ─── Domain / Category types ─────────────────────────────────────────────────

export type RelevanceLevel = "Critical" | "High" | "Medium" | "Low" | "Adequate"
export type QualityRating = "Adequate" | "Needs Improvement" | "High Concern"
export type DocumentType = "DRHP" | "RHP"

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export type KBStats = {
  total_risk_disclosures: number
  total_documents: number
  domains_covered: number
  companies_referenced: number
}

export type RiskQualityDistribution = {
  critical: number
  high: number
  medium: number
  adequate: number
}

export type RiskByCategory = {
  category: string
  count: number
}

export type RiskRecord = {
  id: string
  title: string
  domain: string
  category: string
  sub_category: string
  drhp_count: number
  relevance_level: RelevanceLevel
}

export type CompanyRecord = {
  company_name: string
  document_type: DocumentType
  ipo_year: number
  total_risks: number
  domain: string
  risk_breakdown: {
    adequate: number
    needs_improvement: number
    high_concern: number
  }
}

export type CompanyRiskDetail = {
  title: string
  category: string
  quality_rating: QualityRating
}

export type CompanyDetail = {
  company_name: string
  document_type: DocumentType
  ipo_year: number
  domain: string
  risks: CompanyRiskDetail[]
  summary: {
    adequate: number
    needs_improvement: number
    high_concern: number
  }
}

export type DisclosureVariant = {
  id: string
  text: string
  count: number
  companies: string[]
}

export type DisclosurePattern = {
  risk_title: string
  domain: string
  category: string
  variants: DisclosureVariant[]
  rulebook_violations: string[]
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export type Document = {
  id: string
  company: string
  type: DocumentType
  year: number
  domain: string
  total_risks: number
  date_added: string
}

export type StreamedRisk = {
  index?: number
  title: string
  description?: string
  domain: string
  category: string
  quality_rating: QualityRating
  issue: string
  improvement_suggestion: string
  rulebook_findings: string[]
  feedback_status?: "pending" | "complete"
}

export type StreamEvent =
  | { type: "progress"; message: string; percent: number }
  | { type: "status"; message: string; percent?: number }
  | {
      type: "extracted"
      filename?: string
      domain?: string
      baseline_documents?: string[]
      total_risks?: number
      section_findings?: unknown[]
      rulebook?: unknown[]
      risks?: StreamedRisk[]
      message?: string
      percent?: number
    }
  | { type: "risk" | "risk_feedback"; risk: StreamedRisk }
  | { type: "done"; total?: number; message?: string }
  | { type: "error"; message: string }

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

// ─── Filter ──────────────────────────────────────────────────────────────────

export type KBFilters = {
  domain: string
  category: string
  sub_category: string
}
