import { useState, useRef, useEffect } from "react"
import { MessageSquare, X, Send, Upload, Bot, User, Sparkles } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChat } from "@/hooks/use-chat"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types"

const HINTS = [
  "What are the most critical risks in tech DRHPs?",
  "Compare Zomato vs Paytm risk disclosures",
  "Show me cybersecurity disclosure patterns",
  "Which companies had the best SEBI compliance?",
]

export function ChatPanel() {
  const [open, setOpen] = useState(false)
  const { messages, isTyping, sendMessage } = useChat()
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, isTyping, open])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput("")
    void sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-blue-500 to-cyan-400",
          "shadow-lg shadow-blue-500/30",
          "transition-transform hover:scale-110 active:scale-95",
          "animate-glow-pulse",
          open && "opacity-0 pointer-events-none"
        )}
        aria-label="Open AI Chat"
      >
        <MessageSquare className="size-6 text-white" />
      </button>

      {/* Chat sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex flex-col p-0 w-[400px] bg-card border-l border-border"
        >
          {/* Header */}
          <SheetHeader className="shrink-0 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400">
                  <Bot className="size-4 text-white" />
                </div>
                <div>
                  <SheetTitle className="text-sm font-semibold">Risk Intelligence AI</SheetTitle>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span className="text-[10px] text-muted-foreground">Online</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 p-4">
              {/* Hints */}
              {messages.length === 1 && (
                <div className="flex flex-col gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Sparkles className="size-3" />
                    <span>Try asking...</span>
                  </div>
                  {HINTS.map((hint) => (
                    <button
                      key={hint}
                      onClick={() => void sendMessage(hint)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {isTyping && (
                <div className="flex items-start gap-2">
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-xs">
                      <Bot className="size-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2">
                    <div className="flex gap-1 items-center h-4">
                      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="shrink-0 border-t border-border p-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about risk patterns..."
                  className="min-h-[2.5rem] max-h-32 resize-none text-sm bg-input/30 border-border"
                  rows={1}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  size="icon-sm"
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Send className="size-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="border-border"
                  title="Upload DRHP for analysis"
                >
                  <Upload className="size-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Powered by SEBI ICDR Rulebook & FirmsData KB
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex items-start gap-2 flex-row-reverse animate-fade-in">
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            <User className="size-3.5" />
          </AvatarFallback>
        </Avatar>
        <div className="max-w-[80%] rounded-lg rounded-tr-none bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 animate-fade-in">
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-xs">
          <Bot className="size-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="max-w-[85%] rounded-lg rounded-tl-none border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground leading-relaxed">
        {message.content}
      </div>
    </div>
  )
}

