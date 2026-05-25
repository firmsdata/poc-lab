import type {
  KBStats,
  RiskRecord,
  CompanyRecord,
  CompanyDetail,
  DisclosurePattern,
  Document,
  KBFilters,
  ChatMessage,
} from "@/types"
import {
  mockStats,
  mockRisks,
  mockCompanies,
  mockCompanyDetail,
  mockDisclosurePattern,
  mockDocuments,
} from "@/data/mock"

const API_BASE = "/api"

async function fetchJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url)
    if (!res.ok) return fallback
    const data: unknown = await res.json()
    if (data === null || data === undefined) return fallback
    return data as T
  } catch {
    return fallback
  }
}

export async function fetchDomains(): Promise<string[]> {
  return fetchJSON<string[]>(`${API_BASE}/kb/domains`, [
    "Technology",
    "Consumer",
    "Healthcare",
    "Financial Services",
    "Infrastructure",
    "Manufacturing",
  ])
}

export async function fetchKBStats(): Promise<KBStats> {
  return fetchJSON<KBStats>(`${API_BASE}/kb/stats`, mockStats)
}

export async function fetchRisks(filters: Partial<KBFilters>): Promise<RiskRecord[]> {
  const params = new URLSearchParams()
  if (filters.domain) params.set("domain", filters.domain)
  if (filters.category) params.set("category", filters.category)
  if (filters.sub_category) params.set("sub_category", filters.sub_category)
  const qs = params.toString()
  return fetchJSON<RiskRecord[]>(
    `${API_BASE}/kb/risks${qs ? `?${qs}` : ""}`,
    mockRisks
  )
}

export async function fetchCompanies(domain?: string): Promise<CompanyRecord[]> {
  const qs = domain ? `?domain=${encodeURIComponent(domain)}` : ""
  return fetchJSON<CompanyRecord[]>(`${API_BASE}/kb/companies${qs}`, mockCompanies)
}

export async function fetchCompanyDetail(name: string): Promise<CompanyDetail> {
  return fetchJSON<CompanyDetail>(
    `${API_BASE}/kb/company/${encodeURIComponent(name)}`,
    { ...mockCompanyDetail, company_name: name }
  )
}

export async function fetchDisclosurePatterns(
  domain: string,
  category: string
): Promise<DisclosurePattern> {
  const qs = `?domain=${encodeURIComponent(domain)}&category=${encodeURIComponent(category)}`
  return fetchJSON<DisclosurePattern>(
    `${API_BASE}/kb/disclosure-patterns${qs}`,
    mockDisclosurePattern
  )
}

export async function fetchDocuments(): Promise<Document[]> {
  return fetchJSON<Document[]>(`${API_BASE}/documents`, mockDocuments)
}

export function uploadDRHP(file: File, stream: boolean = false): Promise<Response> {
  const formData = new FormData()
  formData.append("file", file)
  return fetch(`${API_BASE}/upload-drhp?stream=${stream}`, {
    method: "POST",
    body: formData,
  })
}

export async function sendChatMessage(
  messages: ChatMessage[],
  domain?: string,
  _fileContext?: string
): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        domain,
      }),
    })
    if (!res.ok) throw new Error("Chat API error")
    const data = await res.json() as { response?: string }
    return data.response ?? "I couldn't process that request."
  } catch {
    // Simulate AI response for demo
    const lastMsg = messages[messages.length - 1]?.content ?? ""
    if (lastMsg.toLowerCase().includes("critical")) {
      return "Based on the knowledge base, critical risks most commonly involve regulatory non-compliance with SEBI guidelines and cybersecurity vulnerabilities. Tech-sector DRHPs show the highest frequency of critical risk disclosures — particularly around data privacy under the DPDP Act 2023."
    }
    if (lastMsg.toLowerCase().includes("zomato") || lastMsg.toLowerCase().includes("paytm")) {
      return "Both Zomato and Paytm disclosed extensive risk factors in their DRHPs. Paytm had the highest total risk count (55 risks), with 6 rated as High Concern — particularly around RBI regulatory compliance and profitability timelines. Zomato's disclosures were more concise but still flagged cybersecurity and competitive intensity prominently."
    }
    return "I can help you analyze risk disclosure patterns across Indian IPO DRHPs. Try asking about specific risk categories, companies, or regulatory compliance patterns. You can also upload a new DRHP document for instant AI analysis."
  }
}
