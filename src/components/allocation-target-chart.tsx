"use client"

import * as React from "react"
import { Cell, Label, Pie, PieChart, Tooltip } from "recharts"

import { ChartContainer } from "@/components/ui/chart"
import type { ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BinanceTransaction } from "@/lib/api"
import { buildLiveAllocation, fmtUsd } from "@/lib/allocation"
import {
  fetchAllocationTarget,
  loadAllocationTarget,
  saveAllocationTarget,
  targetTotal,
} from "@/lib/allocation-target"
import type { AllocationTarget } from "@/lib/allocation-target"
import { coinColor, coinLabel } from "@/lib/coins"
import { COINGECKO_IDS } from "@/lib/prices"
import type { UsdQuotes } from "@/lib/prices"

interface AllocationTargetChartProps {
  /** rows currently visible in the table (already column-filtered) */
  data: BinanceTransaction[]
  /** shared live USD quotes; `null` while the parent fetch is in flight */
  quotes: UsdQuotes | null
}

const OVER_COLOR = "#f59e0b" // held above target — trim
const UNDER_COLOR = "#3b82f6" // held below target — add
const UNALLOCATED = "var(--muted-foreground)"

interface Row {
  coin: string
  color: string
  /** current share of the priced portfolio, 0..1 */
  curShare: number
  curUsd: number
  /** weight the user typed, in percent (0 when unset) */
  rawPct: number
  /** effective target after normalising an over-100 total, in percent */
  effPct: number
  targetUsd: number
  /** current% − effective target%, percentage points */
  deltaPct: number
  /** USD to buy (+) or sell (−) to reach the target */
  rebalanceUsd: number
  held: boolean
}

export function AllocationTargetChart({ data, quotes }: AllocationTargetChartProps) {
  const { slices, totalUsd, unpriced } = React.useMemo(
    () => buildLiveAllocation(data, quotes?.price ?? {}),
    [data, quotes],
  )

  const [target, setTarget] = React.useState<AllocationTarget>(() =>
    loadAllocationTarget(),
  )
  const [pickerKey, setPickerKey] = React.useState(0)

  // Local edits win over a late-arriving server copy.
  const dirtyRef = React.useRef(false)

  const commit = React.useCallback((next: AllocationTarget) => {
    dirtyRef.current = true
    setTarget(next)
    saveAllocationTarget(next)
  }, [])

  // Hydrate from the authoritative server copy (the one that rides along in the
  // full backup); the localStorage seed above keeps the first paint instant.
  React.useEffect(() => {
    let alive = true
    fetchAllocationTarget().then((remote) => {
      if (alive && !dirtyRef.current) setTarget(remote)
    })
    return () => {
      alive = false
    }
  }, [])

  // A weight of 0 (or a cleared field) drops the coin from the target, which
  // removes its row and returns it to the "add asset" dropdown — held or not.
  const setWeight = (coin: string, raw: string) => {
    const n = Number(raw)
    const next = { ...target }
    if (raw.trim() === "" || !Number.isFinite(n) || n <= 0) delete next[coin]
    else next[coin] = Math.min(100, n)
    commit(next)
  }

  // Picked from the "add asset" dropdown — seeds at 1%.
  const addCoin = (coin: string) => {
    if (!(coin in target)) commit({ ...target, [coin]: 1 })
    setPickerKey((k) => k + 1)
  }

  const matchCurrent = () => {
    const next: AllocationTarget = {}
    for (const s of slices) {
      const pct = Math.round(s.share * 1000) / 10
      if (pct > 0) next[s.coin.toUpperCase()] = pct
    }
    commit(next)
  }

  const total = targetTotal(target)

  const rows = React.useMemo<Row[]>(() => {
    const byCoin = new Map(slices.map((s) => [s.coin.toUpperCase(), s]))
    const order: string[] = []
    // only assets with a target weight above 0 get a row — held ones first, usd desc
    for (const s of slices) {
      const c = s.coin.toUpperCase()
      if ((target[c] ?? 0) > 0) order.push(c)
    }
    // then added (non-held) coins that carry a weight, heaviest first
    for (const c of Object.keys(target).sort((a, b) => target[b] - target[a])) {
      if ((target[c] ?? 0) > 0 && !order.includes(c)) order.push(c)
    }

    return order.map((coin) => {
      const s = byCoin.get(coin)
      const curShare = s?.share ?? 0
      const curUsd = s?.usd ?? 0
      const rawPct = target[coin] ?? 0
      const effPct = total > 100 ? (rawPct / total) * 100 : rawPct
      const targetUsd = (effPct / 100) * totalUsd
      return {
        coin,
        color: coinColor(coin),
        curShare,
        curUsd,
        rawPct,
        effPct,
        targetUsd,
        deltaPct: curShare * 100 - effPct,
        rebalanceUsd: targetUsd - curUsd,
        held: !!s,
      }
    })
  }, [slices, target, total, totalUsd])

  const pieData = React.useMemo(() => {
    const parts = rows
      .filter((r) => r.effPct > 0)
      .map((r) => ({ coin: r.coin, color: r.color, pct: r.effPct }))
    if (total > 0 && total < 100) {
      parts.push({ coin: "Unallocated", color: UNALLOCATED, pct: 100 - total })
    }
    return parts
  }, [rows, total])

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(pieData.map((p) => [p.coin, { label: p.coin, color: p.color }])),
    [pieData],
  )

  const maxAbsDelta = Math.max(1, ...rows.map((r) => Math.abs(r.deltaPct)))
  const buys = rows.reduce((s, r) => s + Math.max(0, r.rebalanceUsd), 0)
  const sells = rows.reduce((s, r) => s + Math.max(0, -r.rebalanceUsd), 0)
  const driftPct = rows.reduce((s, r) => s + Math.max(0, r.deltaPct), 0)

  const available = React.useMemo(
    () =>
      Object.keys(COINGECKO_IDS)
        .filter((c) => !rows.some((r) => r.coin === c))
        .sort(),
    [rows],
  )

  if (!quotes) {
    return (
      <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
        Fetching live USD quotes…
      </div>
    )
  }

  if (totalUsd <= 0) {
    return (
      <div className="flex h-[260px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
        No priced positive balances to plan a target against.
      </div>
    )
  }

  const totalColor =
    total >= 99 && total <= 101
      ? "text-emerald-600"
      : total === 0
        ? "text-muted-foreground"
        : "text-amber-600"

  return (
    <div className="space-y-3">
      {pieData.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Set a target weight below to see your allocation and today's drift from it.
        </div>
      ) : (
      <ChartContainer config={config} className="mx-auto aspect-square h-[240px]">
        <PieChart>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as { coin: string; pct: number }
              const row = rows.find((r) => r.coin === p.coin)
              return (
                <div className="rounded-md border bg-background px-2.5 py-2 text-xs shadow-md">
                  <div className="font-medium text-foreground">
                    {p.coin === "Unallocated" ? "Unallocated" : coinLabel(p.coin)}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-muted-foreground">
                    target {p.pct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
                    {row && p.coin !== "Unallocated" && (
                      <>
                        {" · "}now{" "}
                        {(row.curShare * 100).toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })}
                        %
                        {" · "}
                        {row.rebalanceUsd >= 0 ? "buy " : "sell "}
                        {fmtUsd(Math.abs(row.rebalanceUsd))}
                      </>
                    )}
                  </div>
                </div>
              )
            }}
          />
          <Pie
            data={pieData}
            dataKey="pct"
            nameKey="coin"
            innerRadius="58%"
            outerRadius="90%"
            paddingAngle={1}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {pieData.map((p) => (
              <Cell key={p.coin} fill={p.color} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null
                const { cx, cy } = viewBox as { cx: number; cy: number }
                return (
                  <text x={cx} y={cy} textAnchor="middle">
                    <tspan
                      x={cx}
                      y={cy - 4}
                      fill="var(--foreground)"
                      style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}
                    >
                      {fmtUsd(totalUsd, true)}
                    </tspan>
                    <tspan
                      x={cx}
                      y={cy + 14}
                      fill="var(--muted-foreground)"
                      style={{ fontSize: 10, letterSpacing: "0.15em" }}
                    >
                      TARGET
                    </tspan>
                  </text>
                )
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      )}

      {/* footer summary */}
      <div className="space-y-0.5 border-b pb-1.5 text-[11px]">
        <div className="flex items-center justify-between font-medium">
          <span className="text-foreground">Target weight</span>
          <span className={`font-mono tabular-nums ${totalColor}`}>
            {total.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
            {total > 0 && total < 100 && (
              <span className="text-muted-foreground">
                {" "}· {(100 - total).toLocaleString("en-US", { maximumFractionDigits: 1 })}% cash
              </span>
            )}
            {total > 100 && <span className="text-muted-foreground"> · normalised</span>}
          </span>
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>
              {driftPct.toLocaleString("en-US", { maximumFractionDigits: 1 })}% off target
            </span>
            <span className="font-mono tabular-nums">
              buy {fmtUsd(buys)} · sell {fmtUsd(sells)}
            </span>
          </div>
        )}
      </div>

      {/* per-coin rows */}
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const w = (Math.abs(r.deltaPct) / maxAbsDelta) * 50
          const over = r.deltaPct > 0
          return (
            <div key={r.coin} className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: r.color }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {coinLabel(r.coin)}
                  {!r.held && (
                    <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                      not held
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {r.held ? fmtUsd(r.curUsd) : "—"} ·{" "}
                  {(r.curShare * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    value={r.rawPct === 0 ? "" : String(r.rawPct)}
                    onChange={(e) => setWeight(r.coin, e.target.value)}
                    placeholder="0"
                    className="h-6 w-12 px-1.5 text-right font-mono text-[11px]"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
              </div>

              {/* drift bar: current vs. target */}
              <div className="flex items-center gap-1.5 pl-3.5 text-[10px]">
                <div className="relative h-2.5 flex-1">
                  {/* full-width track — the blue/amber bar reads against it */}
                  <div className="absolute inset-x-0 inset-y-[2px] rounded-[1px] bg-muted" />
                  {/* zero line at centre */}
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                  <div
                    className="absolute inset-y-[2px] rounded-[1px]"
                    style={{
                      left: over ? "50%" : `${50 - w}%`,
                      width: `${w}%`,
                      backgroundColor: over ? OVER_COLOR : UNDER_COLOR,
                    }}
                  />
                </div>
                <span
                  className="w-10 shrink-0 text-right font-mono tabular-nums"
                  style={{ color: over ? OVER_COLOR : UNDER_COLOR }}
                >
                  {r.deltaPct > 0 ? "+" : ""}
                  {r.deltaPct.toLocaleString("en-US", { maximumFractionDigits: 1 })}%
                </span>
                <span className="w-20 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {Math.abs(r.rebalanceUsd) < 1
                    ? "on target"
                    : `${r.rebalanceUsd >= 0 ? "buy" : "sell"} ${fmtUsd(Math.abs(r.rebalanceUsd))}`}
                </span>
              </div>
            </div>
          )
        })}

        {/* add an asset to the target list — seeds at 1% */}
        <Select key={pickerKey} onValueChange={addCoin}>
          <SelectTrigger
            className="mt-1 h-7 w-full text-xs"
            disabled={available.length === 0}
          >
            <SelectValue
              placeholder={
                available.length === 0 ? "All priced assets added" : "+ Add asset…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {available.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {coinLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={matchCurrent}
          className="flex-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Match current
        </button>
        <button
          type="button"
          onClick={() => commit({})}
          className="flex-1 rounded border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Bars show today's drift from target — {""}
        <span style={{ color: OVER_COLOR }}>amber = trim</span>,{" "}
        <span style={{ color: UNDER_COLOR }}>blue = add</span>. Rebalance amounts value
        the target against today's {fmtUsd(totalUsd, true)} priced portfolio. Set an asset
        to 0% to drop it. Saved on this device.
        {unpriced.length > 0 && ` No quote for: ${unpriced.map(coinLabel).join(", ")}.`}
      </p>
    </div>
  )
}
