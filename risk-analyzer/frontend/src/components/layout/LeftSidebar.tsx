import { useState, useEffect, type ComponentType } from "react"
import { useLocation, Link } from "react-router-dom"
import { BookOpen, History, BarChart3, ChevronRight, PenLine } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { fetchKBStats } from "@/services/api"
import { cn } from "@/lib/utils"
import type { KBStats } from "@/types"

const navItems = [
  {
    title: "Knowledge Base",
    href: "/",
    icon: BookOpen,
    description: "Risk patterns & disclosures",
  },
  {
    title: "Analysis History",
    href: "/analysis",
    icon: History,
    description: "Previously analyzed DRHPs",
  },
  {
    title: "Drafting Assistant",
    href: "/draft",
    icon: PenLine,
    description: "Draft & score risk factors",
  },
]

export function LeftSidebar() {
  const location = useLocation()
  const [stats, setStats] = useState<KBStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    setLoadingStats(true)
    fetchKBStats()
      .then((data) => setStats(data as KBStats))
      .catch(console.error)
      .finally(() => setLoadingStats(false))
  }, [])

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25">
            <span className="text-lg font-bold text-white">F</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground tracking-wide">FirmsData</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-widest uppercase">
              Risk Intelligence
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3",
                          isActive && "text-primary"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span>{item.title}</span>
                        {isActive && (
                          <ChevronRight className="ml-auto size-3 text-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Quick Stats</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-2 px-2 py-1">
              <QuickStat
                icon={BarChart3}
                label="Risk Records"
                value={loadingStats ? "…" : (stats?.total_risk_disclosures ?? 0).toLocaleString()}
                color="text-blue-400"
              />
              <QuickStat
                icon={BookOpen}
                label="Documents"
                value={loadingStats ? "…" : (stats?.total_documents ?? 0).toLocaleString()}
                color="text-cyan-400"
              />
              <QuickStat
                icon={History}
                label="Companies"
                value={loadingStats ? "…" : (stats?.companies_referenced ?? 0).toLocaleString()}
                color="text-emerald-400"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2">
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
              Version
            </p>
            <p className="text-xs text-foreground">Risk Analyzer v1.0</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">SEBI ICDR 2024</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function QuickStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors">
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  )
}
