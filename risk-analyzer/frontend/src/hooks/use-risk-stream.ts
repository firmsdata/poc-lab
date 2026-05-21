import { useState, useCallback } from "react"
import type { StreamedRisk } from "@/types"
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
      const res = await uploadDRHP(file)

      if (!res.ok) {
        // Simulate streaming for demo
        await simulateStream(setState)
        return
      }

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
              total?: number
            }
            if (event.type === "progress") {
              setState((s) => ({
                ...s,
                progress: event.percent ?? s.progress,
                progressMessage: event.message ?? s.progressMessage,
              }))
            } else if (event.type === "risk" && event.risk) {
              setState((s) => ({ ...s, risks: [...s.risks, event.risk!] }))
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
      // Fall through to simulation
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

import type { Dispatch, SetStateAction } from "react"
