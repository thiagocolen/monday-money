"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { type Transaction, getEffectiveMonth } from "@/lib/api"
import { format, parseISO, startOfYear, endOfYear, eachMonthOfInterval, addYears } from "date-fns"
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
import type { ChartConfig } from "@/components/ui/chart"
import { Loader2 } from "lucide-react"

interface YearlyTransactionChartProps {
  data: Transaction[]
  yearOffset: number
  loading?: boolean
  categoriesMeta: { name: string, color: string }[]
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function YearlyTransactionChart({ data, yearOffset, loading = false, categoriesMeta }: YearlyTransactionChartProps) {
  const chartData = React.useMemo(() => {
    const now = new Date()
    const targetDate = addYears(now, yearOffset)
    const start = startOfYear(targetDate)
    const end = endOfYear(targetDate)
    
    // We assume 'data' is already filtered by year and other criteria by the parent
    const yearTransactions = data.filter(t => 
      t.category !== 'chain-transaction'
    )

    const months = eachMonthOfInterval({ start, end })
    const monthsMap = months.map(m => ({
      month: format(m, "MMM"),
      monthKey: format(m, "yyyy-MM"),
      total: 0
    }))

    const result = monthsMap.map(m => {
      const monthData: any = { month: m.month }
      const monthTransactions = yearTransactions.filter(t => getEffectiveMonth(t) === m.monthKey)
      
      // Get all unique categories to ensure they exist in the object
      categoriesMeta.forEach(cat => {
        const amount = monthTransactions
          .filter(t => t.category === cat.name)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)
        
        monthData[cat.name] = parseFloat(amount.toFixed(2))
      })

      // Also handle categories not in meta
      monthTransactions.forEach(t => {
        if (!categoriesMeta.find(c => c.name === t.category)) {
          const catName = t.category || "Uncategorized"
          monthData[catName] = (monthData[catName] || 0) + Math.abs(t.amount)
        }
      })

      return monthData
    })

    return result
  }, [data, yearOffset, categoriesMeta])

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    categoriesMeta.forEach(cat => {
      config[cat.name] = {
        label: cat.name,
        color: cat.color,
      }
    })
    
    const othersMeta = categoriesMeta.find(c => c.name === "OTHERS")
    // Add default for Uncategorized if it appears
    config["Uncategorized"] = {
      label: "Uncategorized",
      color: othersMeta?.color || "#94a3b8",
    }
    return config
  }, [categoriesMeta])

  const yearLabel = React.useMemo(() => {
    return format(addYears(new Date(), yearOffset), "yyyy")
  }, [yearOffset])

  const totalYearlyAmount = React.useMemo(() => {
    const now = new Date()
    const targetDate = addYears(now, yearOffset)
    const targetYear = format(targetDate, 'yyyy')

    return data
      .filter(t => getEffectiveMonth(t).startsWith(targetYear) && t.category !== 'chain-transaction')
      .reduce((sum, t) => sum + t.amount, 0)
  }, [data, yearOffset])

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Yearly Financial Overview</CardTitle>
          <CardDescription>
            Spending by category in {yearLabel}
          </CardDescription>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-muted-foreground uppercase">Yearly Net Total</p>
          <p className={`text-2xl font-bold ${totalYearlyAmount < 0 ? "text-destructive" : "text-emerald-600"}`}>
            {formatCurrency(totalYearlyAmount)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative pt-4">
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px] transition-all rounded-b-xl">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Calculating Year...</span>
            </div>
          </div>
        )}
        
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <BarChart
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `R$${value}`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent 
                formatter={(value, name) => (
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-2 w-2 rounded-full" 
                      style={{ backgroundColor: chartConfig[name as string]?.color as string }} 
                    />
                    <span className="font-medium">{name}:</span>
                    <span className="ml-auto font-mono">{formatCurrency(Number(value))}</span>
                  </div>
                )}
              />}
            />
            {Object.keys(chartConfig).map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={chartConfig[key].color as string}
                radius={[0, 0, 0, 0]}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} className="mt-8" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

