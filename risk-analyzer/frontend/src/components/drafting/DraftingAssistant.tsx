import { useState, useEffect, useCallback, useRef } from "react"
import {
  CheckCircle2, XCircle, AlertTriangle, Lightbulb, Sparkles,
  BookOpen, Loader2, ChevronDown, ChevronUp, Copy, Check,
  RefreshCw, ArrowRight, Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  analyzeDraft, fetchDraftTemplates,
  type DraftAnalysisResult, type DraftTemplate, type ChecklistItem,
} from "@/services/api"

// ─── Constants ───────────────────────────────────────────────────────────────

const DOMAINS = [
  "Technology", "Consumer", "Healthcare", "Financial Services",
  "Infrastructure", "Manufacturing", "General",
]

const CATEGORIES = [
  "regulatory", "financial", "operational", "legal",
  "market", "technology", "environmental",
]

const PLACEHOLDER = `Example: "Our top 5 customers accounted for 42.3% and 38.1% of our revenues in FY25 and FY24 respectively. Our largest customer, Company A, contributed 14.2% of revenues in FY25. Under SEBI ICDR Regulation 27(1)(b), material customer dependencies must be quantified. The loss of any of these customers could reduce our annual revenues by up to ₹245 million. See 'Our Business' on Page 92 of this DRHP."`

// ─── Score Gauge ─────────────────────────────────────────────────────────────

function ScoreGauge({ score, quality }: { score: number; quality: string }) {
  const color =
    quality === "Adequate"
      ? { ring: "text-emerald-400", bg: "bg-emerald-400", glow: "shadow-emerald-500/30" }
      : quality === "Needs Improvement"
      ? { ring: "text-amber-400", bg: "bg-amber-400", glow: "shadow-amber-500/30" }
      : { ring: "text-red-400", bg: "bg-red-400", glow: "shadow-red-500/30" }

  const circumference = 2 * Math.PI * 38
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative flex items-center justify-center rounded-full shadow-lg", color.glow)}>
        <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
          <circle cx="48" cy="48" r="38" fill="none" stroke="currentColor"
            strokeWidth="6" className="text-border/30" />
          <circle
            cx="48" cy="48" r="38" fill="none"
            stroke="currentColor" strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("transition-all duration-700", color.ring)}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={cn("text-2xl font-extrabold tabular-nums", color.ring)}>{score}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">score</span>
        </div>
      </div>
      <span className={cn(
        "text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full border",
        quality === "Adequate"
          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          : quality === "Needs Improvement"
          ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
          : "text-red-400 bg-red-500/10 border-red-500/20"
      )}>
        {quality}
      </span>
    </div>
  )
}

// ─── Checklist Panel ─────────────────────────────────────────────────────────

function ChecklistPanel({ items }: { items: ChecklistItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/50">
        <BookOpen className="size-8" />
        <p className="text-xs">Start typing to see compliance checks</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          className={cn(
            "w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all",
            item.passed
              ? "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
              : "border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
          )}
          onClick={() => setExpanded(expanded === item.id ? null : item.id)}
        >
          {item.passed ? (
            <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="size-3.5 mt-0.5 shrink-0 text-red-400" />
          )}
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-xs font-semibold leading-snug",
              item.passed ? "text-emerald-300" : "text-red-300"
            )}>
              {item.label}
            </p>
            {expanded === item.id && item.detail && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {item.detail}
              </p>
            )}
          </div>
          {item.detail && (
            expanded === item.id
              ? <ChevronUp className="size-3 shrink-0 text-muted-foreground mt-1" />
              : <ChevronDown className="size-3 shrink-0 text-muted-foreground mt-1" />
          )}
        </button>
      ))}
    </div>
  )
}

// ─── AI Feedback Panel ───────────────────────────────────────────────────────

function AIFeedbackPanel({
  result, loading
}: {
  result: DraftAnalysisResult | null
  loading: boolean
}) {
  const [copiedRewrite, setCopiedRewrite] = useState(false)

  const copyRewrite = () => {
    if (result?.rewrite) {
      void navigator.clipboard.writeText(result.rewrite)
      setCopiedRewrite(true)
      setTimeout(() => setCopiedRewrite(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">AI is analyzing your draft…</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground/50">
        <Sparkles className="size-8" />
        <p className="text-xs text-center">Click "Analyze" to get AI-powered feedback and a compliant rewrite</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Issue */}
      {result.issue && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
            <AlertTriangle className="size-3.5" />
            Key Issue
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">{result.issue}</p>
        </div>
      )}

      {/* Improvement */}
      {result.improvement && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Lightbulb className="size-3.5" />
            Improvement Suggestion
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed font-medium">{result.improvement}</p>
        </div>
      )}

      {/* AI Rewrite */}
      {result.rewrite && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">
              <Sparkles className="size-3.5" />
              AI-Compliant Rewrite
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={copyRewrite}
              title="Copy rewrite"
            >
              {copiedRewrite ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            </Button>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed font-medium italic border-l-2 border-blue-500/30 pl-3">
            {result.rewrite}
          </p>
        </div>
      )}

      {!result.ai_available && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 pt-1">
          <Info className="size-3" />
          AI rewrite unavailable — run <code className="mx-1 font-mono bg-muted px-1 rounded">ollama serve</code> for AI suggestions
        </div>
      )}
    </div>
  )
}

// ─── Template Comparison ─────────────────────────────────────────────────────

function TemplateCard({ tpl, onUse }: { tpl: DraftTemplate; onUse: (text: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <p className="text-xs font-semibold text-foreground">{tpl.title}</p>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{tpl.category}</span>
        </div>
        {open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Boilerplate */}
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider font-bold text-red-400">❌ Boilerplate (Avoid)</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed p-2.5 rounded bg-red-500/5 border border-red-500/10 italic">
              {tpl.boilerplate}
            </p>
            <div className="flex flex-wrap gap-1">
              {tpl.issues.map((iss, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                  {iss}
                </span>
              ))}
            </div>
          </div>

          {/* Compliant */}
          <div className="space-y-1.5">
            <p className="text-[9px] uppercase tracking-wider font-bold text-emerald-400">✅ Compliant (SEBI-Ready)</p>
            <p className="text-[11px] text-foreground/85 leading-relaxed p-2.5 rounded bg-emerald-500/5 border border-emerald-500/10">
              {tpl.compliant}
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full text-[10px] border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => onUse(tpl.compliant)}
          >
            <ArrowRight className="size-3 mr-1.5" />
            Use This as Template
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DraftingAssistant() {
  const [draft, setDraft] = useState("")
  const [domain, setDomain] = useState("General")
  const [category, setCategory] = useState("regulatory")
  const [result, setResult] = useState<DraftAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<DraftTemplate[]>([])
  const [activeTab, setActiveTab] = useState<"editor" | "templates">("editor")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const charCount = draft.length

  // Load templates once
  useEffect(() => {
    fetchDraftTemplates().then(setTemplates).catch(console.error)
  }, [])

  const runAnalysis = useCallback(async (text: string) => {
    if (text.trim().length < 20) {
      setResult(null)
      return
    }
    setLoading(true)
    const res = await analyzeDraft(text, domain, category)
    setResult(res)
    setLoading(false)
  }, [domain, category])

  // Debounced auto-analysis
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runAnalysis(draft)
    }, 900)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [draft, runAnalysis])

  const handleUseTemplate = (text: string) => {
    setDraft(text)
    setActiveTab("editor")
  }

  const handleReset = () => {
    setDraft("")
    setResult(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-foreground">DRHP Drafting Assistant</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Write or paste a risk factor — get live SEBI compliance scoring, checklist verification, and AI improvement suggestions.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Domain */}
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {/* Category */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 capitalize"
            >
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              className="text-muted-foreground hover:text-foreground text-[11px]"
              disabled={!draft && !result}
            >
              <RefreshCw className="size-3 mr-1.5" />
              Reset
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-muted p-0.5 rounded-lg w-fit">
          {(["editor", "templates"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "editor" ? "✏️ Draft Editor" : "📋 Example Templates"}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "templates" ? (
          /* Templates Tab */
          <ScrollArea className="h-full">
            <div className="p-6 space-y-3">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-300 flex items-start gap-2">
                <Info className="size-3.5 mt-0.5 shrink-0" />
                <span>Compare boilerplate vs. SEBI-compliant disclosures. Click "Use This as Template" to load any example into the draft editor.</span>
              </div>
              {templates.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground/50">
                  <Loader2 className="size-6 animate-spin mb-2" />
                  <p className="text-xs">Loading templates…</p>
                </div>
              ) : (
                templates.map((tpl) => (
                  <TemplateCard key={tpl.id} tpl={tpl} onUse={handleUseTemplate} />
                ))
              )}
            </div>
          </ScrollArea>
        ) : (
          /* Editor Tab — three-column layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 h-full divide-x divide-border/50">

            {/* Left: Text Editor */}
            <div className="lg:col-span-5 flex flex-col min-h-0 p-4 gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Draft Risk Factor</span>
                <span className={cn(
                  "text-[10px] font-mono",
                  charCount < 100 ? "text-red-400" : charCount < 300 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {charCount} chars
                </span>
              </div>
              <textarea
                id="draft-text-editor"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={PLACEHOLDER}
                className="flex-1 resize-none rounded-xl border border-border/60 bg-card/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 leading-relaxed min-h-[240px] font-mono"
              />
              <Button
                id="analyze-draft-btn"
                onClick={() => void runAnalysis(draft)}
                disabled={loading || draft.trim().length < 20}
                className="w-full bg-primary hover:bg-primary/90 text-sm font-semibold"
              >
                {loading ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" />Analyzing…</>
                ) : (
                  <><Sparkles className="size-4 mr-2" />Analyze Draft</>
                )}
              </Button>
            </div>

            {/* Center: Compliance Checklist */}
            <div className="lg:col-span-3 flex flex-col min-h-0 p-4 gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SEBI Compliance Checklist</span>
              <ScrollArea className="flex-1">
                <ChecklistPanel items={result?.checklist ?? []} />
              </ScrollArea>
              {result && (
                <div className="pt-3 border-t border-border/40 flex justify-center">
                  <ScoreGauge score={result.score} quality={result.quality} />
                </div>
              )}
            </div>

            {/* Right: AI Feedback */}
            <div className="lg:col-span-4 flex flex-col min-h-0 p-4 gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Audit Feedback</span>
                {result?.ai_available && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                    AI ✓
                  </span>
                )}
              </div>
              <ScrollArea className="flex-1">
                <AIFeedbackPanel result={result} loading={loading} />
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
