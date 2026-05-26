import { useState, useRef } from "react"
import { Upload, FileText, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { StreamingResults } from "./StreamingResults"
import { useRiskStream } from "@/hooks/use-risk-stream"
import { cn } from "@/lib/utils"

type UploadZoneProps = {
  open: boolean
  onClose: () => void
}

export function UploadZone({ open, onClose }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { state, startStream, reset } = useRiskStream()

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file.")
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleAnalyze = () => {
    if (!selectedFile) return
    void startStream(selectedFile)
  }

  const handleClose = () => {
    setSelectedFile(null)
    reset()
    onClose()
  }

  const isActive = state.isStreaming || state.isDone || state.risks.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">Analyze New DRHP</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Upload a DRHP PDF to extract and analyze risk factors against SEBI standards.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* Drop zone */}
          {!isActive && (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer",
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-primary/5"
              )}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={cn(
                "flex size-14 items-center justify-center rounded-full transition-colors",
                dragOver ? "bg-primary/20" : "bg-muted"
              )}>
                <Upload className={cn("size-6", dragOver ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Drop your DRHP PDF here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse — PDF files only
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          )}

          {/* Selected file */}
          {selectedFile && !isActive && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <FileText className="size-5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedFile(null)
                }}
                className="shrink-0"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Streaming results */}
          {isActive && <StreamingResults state={state} />}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          {!isActive && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleAnalyze}
                disabled={!selectedFile}
                className="bg-primary hover:bg-primary/90"
              >
                <Upload className="size-4" />
                Analyze DRHP
              </Button>
            </>
          )}
          {state.isDone && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
