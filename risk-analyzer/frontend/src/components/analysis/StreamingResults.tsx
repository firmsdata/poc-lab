import { CheckCircle2, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RiskCard } from "./RiskCard"
import type { StreamState } from "@/hooks/use-risk-stream"

type StreamingResultsProps = {
  state: StreamState
}

export function StreamingResults({ state }: StreamingResultsProps) {
  const { isStreaming, progress, progressMessage, risks, isDone, error } = state

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {(isStreaming || isDone) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              {isStreaming ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{progressMessage}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Analysis complete — {risks.length} risks identified</span>
                </>
              )}
            </div>
            <span className="text-foreground font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Risk cards */}
      {risks.length > 0 && (
        <ScrollArea className="max-h-[500px] pr-2">
          <div className="space-y-3">
            {risks.map((risk, i) => (
              <RiskCard key={`${risk.title}-${i}`} risk={risk} index={i} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
