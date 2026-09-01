"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { format } from "date-fns"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import type { BinanceFiatDepositWithdraw } from "@/lib/api"
import { parseFlexibleDate } from "@/lib/date"

const chartConfig = {
  total: {
    label: "Accumulated",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const compactCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  })

const fullCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

interface FiatFlowChartProps {
  data: BinanceFiatDepositWithdraw[]
}

function toCumulativePoints(rows: { date: Date; amount: number }[]) {
  let acc = 0
  return rows.map((r) => {
    acc += r.amount
    return { time: r.date.getTime(), amount: r.amount, total: acc }
  })
}

export function FiatFlowChart({ data }: FiatFlowChartProps) {
  const points = React.useMemo(() => {
    const rows = data
      .map((d) => ({
        date: parseFlexibleDate(d.Time),
        amount: Number(d.Amount) || 0,
      }))
      .filter((r): r is { date: Date; amount: number } => r.date != null)
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    return toCumulativePoints(rows)
  }, [data])

  if (points.length < 2) {
    return (
      <div className="flex h-[360px] items-center justify-center text-xs text-muted-foreground">
        Not enough data in range to plot.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[360px] w-full">
      <LineChart data={points} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => format(new Date(value), "dd MMM ''yy")}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={64}
          tickFormatter={(value) => compactCurrency(Number(value))}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                payload?.[0]
                  ? format(new Date((payload[0].payload as { time: number }).time), "dd MMM yyyy")
                  : ""
              }
              formatter={(value, _name, item) => {
                const amount = Number(
                  (item?.payload as { amount?: number })?.amount ?? 0
                )
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-muted-foreground">
                      {amount > 0 ? "+" : ""}
                      {fullCurrency(amount)} this transaction
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {fullCurrency(Number(value))} accumulated
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        <Line
          dataKey="total"
          type="monotone"
          stroke="var(--color-total)"
          strokeWidth={2}
          dot={{
            r: 3,
            fill: "var(--color-total)",
            stroke: "var(--background)",
            strokeWidth: 1,
          }}
          activeDot={{
            r: 6,
            fill: "var(--color-total)",
            stroke: "var(--background)",
            strokeWidth: 2,
          }}
        />
      </LineChart>
    </ChartContainer>
  )
}
