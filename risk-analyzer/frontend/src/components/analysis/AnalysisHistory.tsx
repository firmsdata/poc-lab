import { useState, useEffect } from "react"
import { Upload, Eye, Calendar, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchDocuments } from "@/services/api"
import { UploadZone } from "./UploadZone"
import type { Document } from "@/types"

export function AnalysisHistory() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Analysis History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {documents.length} documents analyzed
            </p>
          </div>
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Upload className="size-4" />
            Upload DRHP
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Company
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Year
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Domain
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Risks
                </th>
                <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date Added
                </th>
                <th className="py-3 px-4 sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-muted animate-pulse rounded w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 text-blue-400 shrink-0" />
                        <span className="font-semibold text-foreground text-xs">{doc.company}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={doc.type === "DRHP" ? "blue" : "cyan"} className="text-[10px]">
                        {doc.type}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-muted-foreground">{doc.year}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="blue" className="text-[10px]">{doc.domain}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-semibold gradient-text">{doc.total_risks}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {new Date(doc.date_added).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-primary"
                        title="View audit"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!loading && documents.length === 0 && (
            <div className="py-16 text-center">
              <FileText className="size-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No documents analyzed yet.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setUploadOpen(true)}
              >
                Upload your first DRHP
              </Button>
            </div>
          )}
        </div>
      </div>

      <UploadZone open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
