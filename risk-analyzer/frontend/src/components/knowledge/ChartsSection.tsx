import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type QualityDistribution = {
  critical: number
  high: number
  medium: number
  adequate: number
}

type CategoryCount = {
  category: string
  count: number
}

type ChartsSectionProps = {
  qualityDistribution: QualityDistribution
  risksByCategory: CategoryCount[]
}

const QUALITY_COLORS = {
  Critical: "#a855f7",
  High: "#ef4444",
  Medium: "#f59e0b",
  Adequate: "#10b981",
}

const BAR_COLOR = "#3b82f6"

export function ChartsSection({ qualityDistribution, risksByCategory }: ChartsSectionProps) {
  const donutData = [
    { name: "Critical", value: qualityDistribution.critical },
    { name: "High", value: qualityDistribution.high },
    { name: "Medium", value: qualityDistribution.medium },
    { name: "Adequate", value: qualityDistribution.adequate },
  ]

  const total = donutData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Donut chart */}
      <Card className="border-border bg-card/80 py-0 gap-0">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="text-sm font-semibold">Risk Quality Distribution</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <div className="flex items-center gap-6">
            <div className="relative flex-shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={QUALITY_COLORS[entry.name as keyof typeof QUALITY_COLORS]}
                        opacity={0.9}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1a1f35",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      `${value} (${Math.round((value / total) * 100)}%)`,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-foreground">{total}</span>
                <span className="text-[10px] text-muted-foreground">total</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full flex-shrink-0"
                    style={{ background: QUALITY_COLORS[d.name as keyof typeof QUALITY_COLORS] }}
                  />
                  <span className="text-xs text-muted-foreground w-16">{d.name}</span>
                  <span className="text-xs font-semibold text-foreground ml-auto">{d.value}</span>
                  <span className="text-[10px] text-muted-foreground w-8">
                    {Math.round((d.value / total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bar chart */}
      <Card className="border-border bg-card/80 py-0 gap-0">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="text-sm font-semibold">Risks by Category</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={risksByCategory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1f35",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: "rgba(59,130,246,0.05)" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, color: "#9ca3af" }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="count"
                fill={BAR_COLOR}
                radius={[4, 4, 0, 0]}
                name="Risk Count"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
