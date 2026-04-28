"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell, Cell as RechartsCell } from "recharts"
import type { Transaction } from "@/lib/api"
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ChartConfig } from "@/components/ui/chart"
import { Loader2, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TransactionChartProps {
  data: Transaction[]
  filterOffset: number
  onDayClick?: (day: string) => void
  loading?: boolean
}

const chartConfig = {
  amount: {
    label: "Amount",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

const COLORS = [
  "#264653",
  "#2a9d8f",
  "#e9c46a",
  "#f4a261",
  "#e76f51",
  "#8ab17d",
  "#b5838d",
  "#6d597a",
  "#0077b6",
  "#00b4d8",
]

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function TransactionChart({ data, filterOffset, onDayClick, loading = false }: TransactionChartProps) {
  const [isMinimized, setIsMinimized] = React.useState(() => {
    const saved = localStorage.getItem("transaction-chart-minimized")
    return saved === "true"
  })

  const toggleMinimize = () => {
    const newState = !isMinimized
    setIsMinimized(newState)
    localStorage.setItem("transaction-chart-minimized", String(newState))
  }

  const chartData = React.useMemo(() => {
    return data.filter(t => t.category !== 'NULLED' && t.category !== 'chain-transaction')
  }, [data])

  const barChartData = React.useMemo(() => {
    const now = new Date()
    const targetDate = new Date(now.getFullYear(), now.getMonth() + filterOffset, 1)
    const start = startOfMonth(targetDate)
    const end = endOfMonth(targetDate)

    const daysMap: Record<string, number> = {}
    eachDayOfInterval({ start, end }).forEach((day) => {
      daysMap[format(day, "yyyy-MM-dd")] = 0
    })

    chartData.forEach((t) => {
      const dateKey = t.date
      if (daysMap[dateKey] !== undefined) {
        daysMap[dateKey] += t.amount
      }
    })

    return Object.entries(daysMap)
      .map(([date, amount]) => ({
        date,
        day: format(parseISO(date), "dd"),
        amount: parseFloat(amount.toFixed(2)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [chartData, filterOffset])

  const pieChartData = React.useMemo(() => {
    const categoriesMap: Record<string, number> = {}
    let totalAbsolute = 0
    
    chartData.forEach((t) => {
      const cat = t.category || "Uncategorized"
      const absAmount = Math.abs(t.amount)
      categoriesMap[cat] = (categoriesMap[cat] || 0) + absAmount
      totalAbsolute += absAmount
    })

    return Object.entries(categoriesMap)
      .map(([name, value], index) => ({
        name,
        value: parseFloat(value.toFixed(2)),
        percentage: totalAbsolute > 0 ? (Math.abs(value) / totalAbsolute * 100).toFixed(1) : "0",
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value)
  }, [chartData])

  // Create dynamic config for the pie chart to support the Legend content
  const pieChartConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    pieChartData.forEach((item) => {
      config[item.name] = {
        label: `${item.name} (${item.percentage}%)`,
        color: item.fill,
      }
    })
    return config
  }, [pieChartData])

  const totalAmount = React.useMemo(() => {
    return chartData.reduce((sum, t) => sum + t.amount, 0)
  }, [chartData])

  const formattedTotal = formatCurrency(totalAmount)

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={toggleMinimize}
            title={isMinimized ? "Show chart" : "Hide chart"}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <div className="space-y-1">
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>
              {format(new Date(new Date().getFullYear(), new Date().getMonth() + filterOffset, 1), "MMMM yyyy")}
            </CardDescription>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-muted-foreground uppercase">Monthly Total</p>
          <p className={`text-2xl font-bold ${totalAmount < 0 ? "text-destructive" : "text-emerald-600"}`}>
            {formattedTotal}
          </p>
        </div>
      </CardHeader>
      {!isMinimized && (
        <CardContent className="relative">
          {loading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px] transition-all rounded-b-xl">
              <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calculating...</span>
              </div>
            </div>
          )}
          <Tabs defaultValue="categories" className="w-full">
            <div className="flex justify-end mb-4">
              <TabsList>
                <TabsTrigger value="activity">Daily Activity</TabsTrigger>
                <TabsTrigger value="categories">Categories</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="activity">
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <BarChart data={barChartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                  />
                  <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent 
                      hideLabel 
                      formatter={(value) => formatCurrency(Number(value))}
                    />}
                  />
                  <Bar dataKey="amount" onClick={(data: any) => onDayClick?.(data.date)}>
                    {barChartData.map((entry, index) => (
                      <RechartsCell 
                        key={`cell-${index}`} 
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        fill={entry.amount >= 0 ? "var(--color-emerald-500, #10b981)" : "var(--color-red-500, #ef4444)"} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </TabsContent>
            
            <TabsContent value="categories">
              <div className="h-[350px] w-full">
                <ChartContainer config={pieChartConfig} className="h-full w-full">
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent 
                        hideLabel 
                        formatter={(value: any, name: any, props: any) => [
                          `${formatCurrency(Number(value))} (${props.payload.percentage}%)`, 
                          name
                        ]}
                      />}
                    />
                    <Pie
                      data={pieChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      stroke="none"
                      labelLine={true}
                      label={({ name, value, payload }: any) => `${name}: ${formatCurrency(value)} (${payload.percentage}%)`}
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartLegend 
                      content={<ChartLegendContent nameKey="name" />} 
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      className="flex-col items-start gap-2 ml-4 overflow-y-auto max-h-[300px] custom-scrollbar" 
                    />
                  </PieChart>
                </ChartContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  )
}
