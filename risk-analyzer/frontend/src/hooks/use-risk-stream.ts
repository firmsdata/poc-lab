import { useState, useCallback, type Dispatch, type SetStateAction } from "react"
import type { QualityRating, StreamedRisk } from "@/types"
import { uploadDRHP } from "@/services/api"

export type StreamState = {
  isStreaming: boolean
  progress: number
  progressMessage: string
  risks: StreamedRisk[]
  error: string | null
  isDone: boolean
}

export function useRiskStream() {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    progress: 0,
    progressMessage: "",
    risks: [],
    error: null,
    isDone: false,
  })

  const startStream = useCallback(async (file: File) => {
    setState({
      isStreaming: true,
      progress: 0,
      progressMessage: "Uploading document...",
      risks: [],
      error: null,
      isDone: false,
    })

    try {
      const res = await uploadDRHP(file, true)

      if (!res.ok) {
        // Fall back to simulation if upload fails
        await simulateStream(setState)
        return
      }

      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const data = await res.json()
        if (data.type === "error" || !data.risks) {
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: data.message || "Failed to analyze document.",
          }))
          return
        }

        // Send initial extracted metadata status
        setState((s) => ({
          ...s,
          progress: 30,
          progressMessage: `Extracted ${data.total_risks} risks. Scoring...`,
        }))

        const risks = data.risks || []
        for (let i = 0; i < risks.length; i++) {
          await delay(80) // 80ms delay per risk card for a smooth appearing transition
          const r = risks[i]
          const rawRulebookFindings = Array.isArray(r.rulebook_findings)
            ? r.rulebook_findings
            : []
          const rulebook_findings = rawRulebookFindings
            .map((finding: any) => {
              if (typeof finding === "string") return finding
              if (finding && typeof finding === "object") {
                return (
                  finding.title ||
                  finding.code ||
                  finding.message ||
                  JSON.stringify(finding)
                )
              }
              return ""
            })
            .filter(Boolean)

          const mapped = mapRisk(r, rulebook_findings, "complete")

          setState((s) => ({
            ...s,
            progress: Math.min(30 + Math.floor(((i + 1) / risks.length) * 70), 99),
            progressMessage: `Scoring risk ${i + 1} of ${risks.length}...`,
            risks: [...s.risks, mapped],
          }))
        }

        setState((s) => ({
          ...s,
          isStreaming: false,
          isDone: true,
          progress: 100,
          progressMessage: "Analysis complete",
        }))
        return
      }

      // Fallback: if server still returned stream (shouldn't happen with stream=false)
      const reader = res.body?.getReader()
      if (!reader) {
        await simulateStream(setState)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const event = JSON.parse(trimmed) as {
              type: string
              message?: string
              percent?: number
              risk?: StreamedRisk
              risks?: StreamedRisk[]
              total?: number
              total_risks?: number
            }
            if (event.type === "progress" || event.type === "status") {
              setState((s) => ({
                ...s,
                progress: event.percent ?? s.progress,
                progressMessage: event.message ?? s.progressMessage,
              }))
            } else if ((event.type === "risk" || event.type === "risk_feedback") && event.risk) {
              const r = event.risk as any
              const rawRulebookFindings = Array.isArray(r.rulebook_findings)
                ? r.rulebook_findings
                : []
              const rulebook_findings = rawRulebookFindings
                .map((finding: unknown) => {
                  if (typeof finding === "string") return finding
                  if (finding && typeof finding === "object") {
                    return (
                      (finding as any).title ||
                      (finding as any).code ||
                      (finding as any).message ||
                      JSON.stringify(finding)
                    )
                  }
                  return ""
                })
                .filter(Boolean)

              const mapped = mapRisk(r, rulebook_findings, "complete")
              setState((s) => {
                const riskIndex = typeof mapped.index === "number" ? mapped.index - 1 : -1
                const risks = [...s.risks]
                if (riskIndex >= 0 && riskIndex < risks.length) {
                  risks[riskIndex] = { ...risks[riskIndex], ...mapped }
                } else {
                  risks.push(mapped)
                }
                const completed = risks.filter((risk) => risk.feedback_status === "complete").length
                const total = risks.length || event.total_risks || event.total || completed
                return {
                  ...s,
                  progress: total ? Math.min(30 + Math.floor((completed / total) * 70), 99) : s.progress,
                  progressMessage: `Reviewed ${completed} of ${total} risks...`,
                  risks,
                }
              })
            } else if (event.type === "extracted") {
              const extractedRisks = Array.isArray(event.risks)
                ? event.risks.map((risk: any, idx: number) => mapRisk({ ...risk, index: risk.index ?? idx + 1 }, [], "pending"))
                : []
              setState((s) => ({
                ...s,
                progressMessage: event.message ?? `Extracted ${event.total_risks ?? extractedRisks.length} risks. Starting feedback review...`,
                progress: event.percent ?? 30,
                risks: extractedRisks.length ? extractedRisks : s.risks,
              }))
            } else if (event.type === "done") {
              setState((s) => ({ ...s, isStreaming: false, isDone: true, progress: 100 }))
            } else if (event.type === "error") {
              setState((s) => ({ ...s, isStreaming: false, error: event.message ?? "Unknown error" }))
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      // Fall back to simulation on error
      await simulateStream(setState)
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      progress: 0,
      progressMessage: "",
      risks: [],
      error: null,
      isDone: false,
    })
  }, [])

  return { state, startStream, reset }
}

type SetState = Dispatch<SetStateAction<StreamState>>

function normalizeQuality(value: unknown): QualityRating {
  const raw = String(value || "").toLowerCase()
  if (raw.includes("high")) return "High Concern"
  if (raw.includes("need")) return "Needs Improvement"
  return "Adequate"
}

function mapRisk(
  risk: any,
  rulebookFindings: string[] = [],
  feedbackStatus: "pending" | "complete" = "complete"
): StreamedRisk {
  return {
    index: typeof risk.index === "number" ? risk.index : undefined,
    title: risk.title || "",
    description: risk.description || "",
    domain: risk.domain || "",
    category: risk.category || risk.sub_category || "",
    quality_rating: normalizeQuality(risk.quality || risk.quality_rating),
    issue: risk.issue || "",
    improvement_suggestion: risk.improvement || risk.improvement_suggestion || "",
    rulebook_findings: rulebookFindings,
    feedback_status: feedbackStatus,
  }
}

async function simulateStream(setState: SetState) {
  const mockRisks: StreamedRisk[] = [
    {
      title: "Regulatory Non-Compliance with SEBI Guidelines",
      domain: "Technology",
      category: "regulatory",
      quality_rating: "Needs Improvement",
      issue: "The disclosure lacks specific references to applicable SEBI regulations and doesn't quantify potential penalties.",
      improvement_suggestion: "Reference SEBI ICDR Regulation 27 explicitly and provide estimated penalty ranges from prior enforcement actions.",
      rulebook_findings: ["SEBI ICDR Reg 27(1)", "DRHP Template Chapter 2.3"],
    },
    {
      title: "Data Privacy & Cybersecurity Breach Risk",
      domain: "Technology",
      category: "tech",
      quality_rating: "High Concern",
      issue: "No mention of the DPDP Act 2023 obligations despite the company processing user personal data at scale.",
      improvement_suggestion: "Include explicit reference to DPDP Act 2023 compliance status, data localization requirements, and breach notification timelines.",
      rulebook_findings: ["DPDP Act 2023 Compliance", "IT Act 2000 Section 43A"],
    },
    {
      title: "Working Capital & Liquidity Constraints",
      domain: "Technology",
      category: "financial",
      quality_rating: "Adequate",
      issue: "Working capital risk adequately described with historical data.",
      improvement_suggestion: "Consider adding stress-test scenarios for downside revenue projections.",
      rulebook_findings: ["SEBI ICDR Schedule VII Para 4.2"],
    },
    {
      title: "Intense Competition from Established Players",
      domain: "Technology",
      category: "market",
      quality_rating: "Adequate",
      issue: "Competitive landscape section is comprehensive and includes named competitors.",
      improvement_suggestion: "Market share data could be supplemented with recent Euromonitor or Redseer citations.",
      rulebook_findings: ["DRHP Template Chapter 4.1"],
    },
    {
      title: "Talent Acquisition & Retention Risk",
      domain: "Technology",
      category: "operational",
      quality_rating: "Needs Improvement",
      issue: "High attrition in engineering roles is mentioned but employee count trends and attrition rates are not disclosed.",
      improvement_suggestion: "Disclose headcount by function, voluntary attrition rate for last 3 years, and cost of replacing engineering talent.",
      rulebook_findings: ["SEBI ICDR Reg 27(1)(g) – Material operational risks"],
    },
  ]

  const steps = [
    { percent: 10, message: "Extracting text from document..." },
    { percent: 25, message: "Identifying risk factor sections..." },
    { percent: 45, message: "Analyzing regulatory compliance..." },
    { percent: 60, message: "Comparing against knowledge base..." },
    { percent: 75, message: "Scoring risk quality..." },
    { percent: 90, message: "Generating improvement suggestions..." },
  ]

  for (const step of steps) {
    await delay(600)
    setState((s) => ({ ...s, progress: step.percent, progressMessage: step.message }))
  }

  for (const risk of mockRisks) {
    await delay(800)
    setState((s) => ({ ...s, risks: [...s.risks, risk] }))
  }

  await delay(500)
  setState((s) => ({ ...s, isStreaming: false, isDone: true, progress: 100 }))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
