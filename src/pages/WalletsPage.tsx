import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchWallets, saveWallets, fetchWalletCache, saveWalletCache } from '@/lib/api'
import type { WalletEntry, WalletCache, NormalizedTransaction } from '@/lib/chains/types'
import { CHAIN_LABELS } from '@/lib/chains/types'
import {
  refreshBalances,
  refreshManyWalletHistories,
  refreshSingleWallet,
  refreshAllWallets,
  isBalanceStale,
  isHistoryStale,
} from '@/lib/chains/wallet-data'
import { AddWalletDialog } from '@/components/add-wallet-dialog'
import { ChainIcon } from '@/components/chain-icon'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, RotateCcw, Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { formatCoinAmount } from '@/lib/coins'
import { toast } from 'sonner'

function multiSelectFilterFn<T>(row: Row<T>, columnId: string, value: string[] | undefined): boolean {
  if (!value || value.length === 0) return true
  return value.includes(String(row.getValue(columnId) ?? ''))
}

function formatUsd(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function truncateAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address
}

const DIRECTION_BADGE: Record<NormalizedTransaction['direction'], string> = {
  in: 'bg-emerald-600/15 text-emerald-600 border-emerald-600/30',
  out: 'bg-red-600/15 text-red-600 border-red-600/30',
  self: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground',
}

export function WalletsPage() {
  const [wallets, setWallets] = useState<WalletEntry[]>([])
  const [cache, setCache] = useState<WalletCache>({})
  const [loading, setLoading] = useState(true)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshingWalletId, setRefreshingWalletId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsTx, setDetailsTx] = useState<NormalizedTransaction | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [w, c] = await Promise.all([fetchWallets(), fetchWalletCache()])
      if (cancelled) return
      setWallets(w)
      setCache(c)
      setLoading(false)

      const staleBalance = w.filter((x) => isBalanceStale(c[x.id]))
      const staleHistory = w.filter((x) => isHistoryStale(c[x.id]))
      if (staleBalance.length === 0 && staleHistory.length === 0) return

      let working = c
      if (staleBalance.length) {
        working = await refreshBalances(staleBalance, working)
        if (!cancelled) setCache((prev) => ({ ...prev, ...working }))
      }
      if (staleHistory.length) {
        working = await refreshManyWalletHistories(staleHistory, working)
        if (!cancelled) setCache((prev) => ({ ...prev, ...working }))
      }
      if (!cancelled) await saveWalletCache(working)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleAddWallet = useCallback(
    async (wallet: WalletEntry) => {
      const nextWallets = [...wallets, wallet]
      setWallets(nextWallets)
      await saveWallets(nextWallets)
      try {
        const entry = await refreshSingleWallet(wallet, cache, (balanceCache) => {
          // Apply the balance as soon as it's ready — don't make the user wait
          // for this wallet's (possibly slow) full history just to see it.
          setCache((prev) => {
            const merged = { ...prev, ...balanceCache }
            saveWalletCache(merged)
            return merged
          })
        })
        setCache((prev) => {
          const merged = { ...prev, [wallet.id]: entry }
          saveWalletCache(merged)
          return merged
        })
      } catch {
        toast.error('Added the wallet, but the initial data fetch failed — try Refresh.')
      }
    },
    [wallets, cache],
  )

  const handleRemoveWallet = useCallback(
    async (id: string) => {
      const nextWallets = wallets.filter((w) => w.id !== id)
      setWallets(nextWallets)
      await saveWallets(nextWallets)
      setCache((prev) => {
        const rest = { ...prev }
        delete rest[id]
        saveWalletCache(rest)
        return rest
      })
      setExpandedId((prev) => (prev === id ? null : prev))
    },
    [wallets],
  )

  const handleRefreshWallet = useCallback(
    async (wallet: WalletEntry) => {
      setRefreshingWalletId(wallet.id)
      try {
        const entry = await refreshSingleWallet(wallet, cache, (balanceCache) => {
          setCache((prev) => {
            const merged = { ...prev, ...balanceCache }
            saveWalletCache(merged)
            return merged
          })
        })
        setCache((prev) => {
          const merged = { ...prev, [wallet.id]: entry }
          saveWalletCache(merged)
          return merged
        })
      } catch {
        toast.error('Failed to refresh wallet')
      } finally {
        setRefreshingWalletId(null)
      }
    },
    [cache],
  )

  const handleRefreshAll = useCallback(async () => {
    setRefreshingAll(true)
    try {
      const updated = await refreshAllWallets(wallets, cache, (balanceCache) => {
        setCache(balanceCache)
        saveWalletCache(balanceCache)
      })
      setCache(updated)
      await saveWalletCache(updated)
    } catch {
      toast.error('Failed to refresh wallets')
    } finally {
      setRefreshingAll(false)
    }
  }, [wallets, cache])

  const filteredWallets = useMemo(() => {
    if (!search.trim()) return wallets
    const term = search.trim().toLowerCase()
    return wallets.filter(
      (w) => w.label.toLowerCase().includes(term) || w.address.toLowerCase().includes(term),
    )
  }, [wallets, search])

  const historyColumns = useMemo<ColumnDef<NormalizedTransaction>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: 'Time',
        cell: ({ row }) => {
          const t = row.original.timestamp
          return (
            <span className="font-mono whitespace-nowrap text-[11px]">
              {t ? new Date(t).toLocaleString() : 'Pending'}
            </span>
          )
        },
      },
      {
        accessorKey: 'direction',
        header: 'Direction',
        filterFn: multiSelectFilterFn,
        meta: { filterVariant: 'multiSelect' },
        cell: ({ row }) => (
          <Badge variant="outline" className={DIRECTION_BADGE[row.original.direction]}>
            {row.original.direction}
          </Badge>
        ),
      },
      {
        accessorKey: 'ticker',
        header: 'Ticker',
        filterFn: multiSelectFilterFn,
        meta: { filterVariant: 'multiSelect' },
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => {
          const { amount, direction, ticker } = row.original
          const sign = direction === 'in' ? '+' : direction === 'out' ? '-' : ''
          return (
            <span
              className={`font-mono font-medium ${
                direction === 'in' ? 'text-emerald-600' : direction === 'out' ? 'text-destructive' : ''
              }`}
            >
              {sign}
              {formatCoinAmount(amount)} {ticker}
            </span>
          )
        },
      },
      {
        accessorKey: 'counterparty',
        header: 'Counterparty',
        cell: ({ row }) => {
          const c = row.original.counterparty
          if (!c) return <span className="text-muted-foreground">—</span>
          return (
            <div className="max-w-[160px] truncate font-mono text-[10px] text-muted-foreground" title={c}>
              {c}
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        filterFn: multiSelectFilterFn,
        meta: { filterVariant: 'multiSelect' },
      },
      {
        accessorKey: 'fee',
        header: 'Fee',
        cell: ({ row }) =>
          row.original.fee != null ? (
            <span className="font-mono text-[11px] text-muted-foreground">{formatCoinAmount(row.original.fee)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'details',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailsTx(row.original)}>
            <FileText className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-lg font-medium animate-pulse text-muted-foreground">Loading wallets...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Wallets</h2>
          <p className="text-sm text-muted-foreground">
            Track balances and full transaction history for your own on-chain wallets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search label or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px] h-8 text-xs font-mono"
          />
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshingAll || wallets.length === 0} className="h-8">
            <RotateCcw className={`mr-2 h-3.5 w-3.5 ${refreshingAll ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-8">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add Wallet
          </Button>
        </div>
      </div>

      {wallets.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          No wallets yet. Add one to start tracking its balance and history.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWallets.map((wallet) => {
            const entry = cache[wallet.id]
            const isExpanded = expandedId === wallet.id
            const isRefreshing = refreshingWalletId === wallet.id
            const totalUsd = entry?.balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0)

            return (
              <Card key={wallet.id}>
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : wallet.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="secondary">{CHAIN_LABELS[wallet.chain]}</Badge>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{wallet.label || truncateAddress(wallet.address)}</div>
                        {wallet.label && (
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {truncateAddress(wallet.address)}
                          </div>
                        )}
                      </div>
                      {entry?.stale && (
                        <Badge variant="outline" className="text-amber-600 border-amber-600/40">
                          stale
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-semibold text-sm">{formatUsd(totalUsd)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {entry?.balances.length ?? 0} asset{entry?.balances.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <ChainIcon chain={wallet.chain} size={24} />
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {entry?.balances.length ? (
                    <div className="flex flex-col items-end gap-1 mt-2">
                      {entry.balances.map((b) => (
                        <div
                          key={`${b.ticker}-${b.contractAddress ?? ''}`}
                          className="flex items-baseline gap-1.5 text-xs"
                        >
                          <span className="font-mono font-medium">{formatCoinAmount(b.amount)}</span>
                          <span className="text-muted-foreground">{b.ticker}</span>
                          {b.usdValue != null && (
                            <span className="text-muted-foreground">{formatUsd(b.usdValue)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-right text-xs text-muted-foreground animate-pulse">
                      Loading balance...
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRefreshWallet(wallet)
                        }}
                        disabled={isRefreshing}
                      >
                        <RotateCcw className={`mr-1.5 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this wallet?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This only removes it from MondayMoney's local tracking — it does not affect the wallet
                              on-chain. Its cached balance and history will be deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemoveWallet(wallet.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(entry?.balances ?? []).map((b) => (
                        <div
                          key={`${b.ticker}-${b.contractAddress ?? ''}`}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{formatCoinAmount(b.amount)}</span>
                            <span className="text-xs text-muted-foreground">{b.ticker}</span>
                            {b.isToken && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                Token
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{formatUsd(b.usdValue)}</span>
                        </div>
                      ))}
                      {(!entry || entry.balances.length === 0) && (
                        <div className="text-xs text-muted-foreground">No balance data yet.</div>
                      )}
                    </div>

                    <DataTable
                      columns={historyColumns}
                      data={entry?.transactions ?? []}
                      filterable
                      paginated
                      pageSize={25}
                      persistFiltersKey={`wallets.${wallet.id}.columnFilters`}
                    />
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <AddWalletDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAddWallet} />

      <Dialog open={detailsTx != null} onOpenChange={(open) => !open && setDetailsTx(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/50 p-3 text-[11px] font-mono whitespace-pre-wrap">
            {detailsTx ? JSON.stringify(detailsTx.raw, null, 2) : ''}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
