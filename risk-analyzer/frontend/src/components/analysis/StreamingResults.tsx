import { useState, useEffect } from "react"
import { CheckCircle2, Loader2, Columns, LayoutGrid, AlertTriangle, Lightbulb, BookOpen, CheckCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RiskCard } from "./RiskCard"
import type { StreamedRisk } from "@/types"
import { cn } from "@/lib/utils"

type StreamingResultsProps = {
  state: {
    isStreaming: boolean
    progress: number
    progressMessage: string
    risks: StreamedRisk[]
    isDone: boolean
    error: string | null
  }
}

export function StreamingResults({ state }: StreamingResultsProps) {
  const { isStreaming, progress, progressMessage, risks, error } = state
  const [viewMode, setViewMode] = useState<"split" | "list">("split")
  const [selectedIdx, setSelectedIdx] = useState<number>(0)

  // Auto-select the first risk when risks list starts loading
  useEffect(() => {
    if (risks.length > 0 && selectedIdx >= risks.length) {
      setSelectedIdx(0)
    }
  }, [risks.length, selectedIdx])

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  // Compute severity counts for the stats bar
  const highConcernCount = risks.filter((r) => r.quality_rating === "High Concern").length
  const needsImprovementCount = risks.filter((r) => r.quality_rating === "Needs Improvement").length
  const adequateCount = risks.filter((r) => r.quality_rating === "Adequate").length

  const selectedRisk = risks[selectedIdx] || risks[0]

  return (
    <div className="space-y-4">
      {/* Progress & Control Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            {isStreaming ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-muted-foreground font-medium">{progressMessage}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Analysis complete — {risks.length} risks identified</span>
              </>
            )}
            <span className="ml-auto text-foreground font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* View Mode Switcher */}
        {risks.length > 0 && (
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg self-end sm:self-center">
            <button
              onClick={() => setViewMode("split")}
              className={cn(
                "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                viewMode === "split"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Split View Dashboard"
            >
              <Columns className="size-3.5" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Timeline Cards List"
            >
              <LayoutGrid className="size-3.5" />
              <span>Card List</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Stats Bar */}
      {risks.length > 0 && (
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <span className="text-sm font-bold">{adequateCount}</span>
            <span className="text-[10px] uppercase font-semibold text-emerald-500/70 tracking-wider">Adequate</span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <span className="text-sm font-bold">{needsImprovementCount}</span>
            <span className="text-[10px] uppercase font-semibold text-amber-500/70 tracking-wider">Needs Work</span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <span className="text-sm font-bold">{highConcernCount}</span>
            <span className="text-[10px] uppercase font-semibold text-red-500/70 tracking-wider">Concern</span>
          </div>
        </div>
      )}

      {/* View Layout Container */}
      {risks.length > 0 && (
        <>
          {viewMode === "list" ? (
            /* Traditional List View */
            <ScrollArea className="h-[480px] pr-2">
              <div className="space-y-3">
                {risks.map((risk, i) => (
                  <RiskCard key={`${risk.title}-${i}`} risk={risk} index={i} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            /* Premium Split Dashboard View */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 h-[480px]">
              {/* Left Side: Dynamic Risks Timeline */}
              <div className="md:col-span-6 flex flex-col min-h-0 border border-border/50 rounded-xl overflow-hidden bg-card/20">
                <div className="px-3 py-2 border-b border-border/50 bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Extracted Risks ({risks.length})
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1.5">
                    {risks.map((risk, i) => {
                      const isSelected = selectedIdx === i
                      const severityColor =
                        risk.quality_rating === "High Concern"
                          ? "bg-red-500"
                          : risk.quality_rating === "Needs Improvement"
                          ? "bg-amber-500"
                          : "bg-emerald-500"

                      return (
                        <div
                          key={`${risk.title}-${i}`}
                          onClick={() => setSelectedIdx(i)}
                          className={cn(
                            "group flex items-start gap-2.5 p-2.5 rounded-lg border text-left cursor-pointer transition-all hover:bg-muted/30 select-none animate-risk-card",
                            isSelected
                              ? "bg-primary/10 border-primary/40 shadow-sm"
                              : "bg-card/50 border-border/50 text-foreground/80"
                          )}
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          {/* Severity Indicator Badge */}
                          <div className={cn("size-2 mt-1.5 rounded-full shrink-0", severityColor)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-snug truncate group-hover:text-foreground">
                              {risk.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] text-muted-foreground px-1 py-0.25 bg-muted/60 border border-border/30 rounded capitalize">
                                {risk.domain}
                              </span>
                              <span className="text-[9px] text-muted-foreground px-1 py-0.25 bg-muted/60 border border-border/30 rounded capitalize">
                                {risk.category}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Side: Live Feedback Inspector */}
              <div className="md:col-span-6 flex flex-col min-h-0 border border-border/50 rounded-xl overflow-hidden bg-card/40">
                <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    AI Audit Inspector
                  </span>
                  {selectedRisk && (
                    <span
                      className={cn(
                        "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border tracking-wide",
                        selectedRisk.quality_rating === "High Concern"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : selectedRisk.quality_rating === "Needs Improvement"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      )}
                    >
                      {selectedRisk.quality_rating}
                    </span>
                  )}
                </div>

                {selectedRisk ? (
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      {/* Risk Title & Description */}
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-foreground leading-snug">{selectedRisk.title}</h4>
                        <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/10 p-2.5 rounded border border-border/30">
                          {selectedRisk.issue || "No description provided."}
                        </p>
                      </div>

                      {/* Feedback Info Box */}
                      {selectedRisk.quality_rating !== "Adequate" ? (
                        <div className="space-y-3">
                          {/* Issue detail */}
                          <div className="space-y-1 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                              <AlertTriangle className="size-3.5" />
                              Critical Concern Detail
                            </div>
                            <p className="text-xs text-foreground/80 leading-relaxed">
                              {selectedRisk.issue}
                            </p>
                          </div>

                          {/* Recommendation rewrite */}
                          <div className="space-y-1.5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                              <Lightbulb className="size-3.5" />
                              Improvement Suggestion
                            </div>
                            <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                              {selectedRisk.improvement_suggestion}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-2.5">
                          <CheckCircle className="size-4.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-emerald-400">Adequate Disclosure</h5>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              This risk factor meets standard regulatory disclosure requirements. No structural issues or drafting warnings have been flagged.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Rulebook Checklist */}
                      {selectedRisk.rulebook_findings.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border/30">
                          <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <BookOpen className="size-3.5 text-blue-400" />
                            SEBI / DRHP Rulebook Guidelines
                          </h5>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedRisk.rulebook_findings.map((finding, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-2 py-0.75 rounded-md border border-blue-500/20 bg-blue-500/5 text-blue-300 font-semibold"
                              >
                                {finding}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
                    <Loader2 className="size-8 animate-spin mb-3 text-muted-foreground/50" />
                    <p className="text-xs">Waiting for analysis feedback...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
