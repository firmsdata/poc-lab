import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { LeftSidebar } from "./LeftSidebar"
import { ChatPanel } from "./ChatPanel"
import { Separator } from "@/components/ui/separator"

type AppShellProps = {
  children: React.ReactNode
  title: string
  actions?: React.ReactNode
  /** When true, content fills the available height and controls its own scrolling. */
  fullHeight?: boolean
}

export function AppShell({ children, title, actions, fullHeight }: AppShellProps) {
  return (
    <SidebarProvider>
      <LeftSidebar />
      <SidebarInset>
        {/* Top header bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4 mr-2" />
          <div className="flex flex-1 items-center justify-between">
            <h1 className="text-sm font-semibold text-foreground">{title}</h1>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        {/* Page content */}
        <div className={fullHeight ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "flex-1 overflow-auto"}>
          {children}
        </div>
      </SidebarInset>

      {/* Floating chat panel */}
      <ChatPanel />
    </SidebarProvider>
  )
}
