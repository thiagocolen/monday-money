"use client"

import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BinanceTransaction } from "@/lib/api"
import { fetchUsdQuotes } from "@/lib/prices"
import type { UsdQuotes } from "@/lib/prices"
import { AllocationTargetChart } from "@/components/allocation-target-chart"
import { PortfolioPieChart } from "@/components/portfolio-pie-chart"

interface DateSnapshot {
  timestamp: number
  holdings: Record<string, number>
}

interface AllocationPanelProps {
  data: BinanceTransaction[]
  snapshot?: DateSnapshot | null
  onClearSnapshot?: () => void
}

/**
 * Allocation area of the Transaction History tab: a "Snapshot" view (live or
 * picked-date pie) and a "Target" planner. One CoinGecko fetch is shared by both.
 */
export function AllocationPanel({
  data,
  snapshot,
  onClearSnapshot,
}: AllocationPanelProps) {
  const [quotes, setQuotes] = React.useState<UsdQuotes | null>(null)
  const [tab, setTab] = React.useState("snapshot")

  React.useEffect(() => {
    let alive = true
    fetchUsdQuotes().then((q) => {
      if (alive) setQuotes(q)
    })
    return () => {
      alive = false
    }
  }, [])

  // Picking a day on the price chart only makes sense against the snapshot view,
  // so a live snapshot pins the tab there without touching state.
  const activeTab = snapshot ? "snapshot" : tab

  return (
    <Tabs value={activeTab} onValueChange={setTab} className="w-full">
      <TabsList className="mb-3 grid w-full grid-cols-2">
        <TabsTrigger value="snapshot" className="text-xs">
          Snapshot
        </TabsTrigger>
        <TabsTrigger value="target" className="text-xs">
          Target
        </TabsTrigger>
      </TabsList>

      <TabsContent value="snapshot" className="outline-none">
        <PortfolioPieChart
          data={data}
          snapshot={snapshot}
          onClearSnapshot={onClearSnapshot}
          quotes={snapshot ? undefined : quotes}
        />
      </TabsContent>

      <TabsContent value="target" className="outline-none">
        <AllocationTargetChart data={data} quotes={quotes} />
      </TabsContent>
    </Tabs>
  )
}
