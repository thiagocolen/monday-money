import { useEffect, useState, useCallback, useMemo } from 'react'
import { 
  fetchBinanceTransactions, 
  fetchBinanceDepositWithdraw, 
  fetchBinanceFiatDepositWithdraw,
} from '../lib/api'
import type {
  BinanceTransaction,
  BinanceDepositWithdraw,
  BinanceFiatDepositWithdraw
} from '../lib/api'
import { DataTable } from '../components/data-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { toast } from 'sonner'
import { parseFlexibleDate, formatTimestamp } from '@/lib/date'
import type { DateRangeFilterValue } from '@/components/date-range-filter'
import { FiatFlowChart } from '@/components/fiat-flow-chart'
import { CoinChangeChart } from '@/components/coin-change-chart'
import { PortfolioPieChart } from '@/components/portfolio-pie-chart'
import { canonicalCoin, coinLabel, renamedCoinNote } from '@/lib/coins'

/** Inclusive epoch-ms range filter over a flexibly-formatted timestamp column. */
function dateRangeFilterFn<T>(row: Row<T>, columnId: string, value: DateRangeFilterValue | undefined): boolean {
  if (!value || (value.from == null && value.to == null)) return true
  const date = parseFlexibleDate(row.getValue(columnId))
  if (!date) return false
  const t = date.getTime()
  if (value.from != null && t < value.from) return false
  if (value.to != null && t > value.to) return false
  return true
}

/** Keeps rows whose cell value is one of the selected values (empty selection = show all). */
function multiSelectFilterFn<T>(row: Row<T>, columnId: string, value: string[] | undefined): boolean {
  if (!value || value.length === 0) return true
  return value.includes(String(row.getValue(columnId) ?? ''))
}

export function InvestmentsPage() {
  const [historyData, setHistoryData] = useState<BinanceTransaction[]>([])
  const [cryptoData, setCryptoData] = useState<BinanceDepositWithdraw[]>([])
  const [fiatData, setFiatData] = useState<BinanceFiatDepositWithdraw[]>([])
  const [loading, setLoading] = useState(true)
  const [globalSearch, setGlobalSearch] = useState("")

  const loadAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [history, crypto, fiat] = await Promise.all([
        fetchBinanceTransactions(),
        fetchBinanceDepositWithdraw(),
        fetchBinanceFiatDepositWithdraw()
      ])
      
      // Robust filter for Binance data
      const isInternal = (row: any) => {
        // Checks various fields for common internal markers across different Binance CSV formats
        const internalMarkers = ['seed', 'chain', 'chain-transaction', '0'];
        const values = Object.values(row).map(v => String(v).toLowerCase());
        return values.some(v => internalMarkers.includes(v));
      }

      setHistoryData(
        history
          .filter(d => !isInternal(d))
          .map(d => ({ ...d, Coin: canonicalCoin(d.Coin) })),
      )
      setCryptoData(
        crypto
          .filter(d => !isInternal(d))
          .map(d => ({ ...d, Coin: canonicalCoin(d.Coin) })),
      )
      setFiatData(fiat.filter(d => !isInternal(d)))
    } catch (error) {
      toast.error("Failed to load investment data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const filterData = useCallback((data: any[]) => {
    if (!globalSearch) return data;
    const searchTerms = globalSearch.toLowerCase().split(/\s+/).filter(Boolean);
    
    return data.filter(item => {
      return searchTerms.every(term => {
        return Object.values(item).some(val => 
          String(val).toLowerCase().includes(term)
        );
      });
    });
  }, [globalSearch]);

  const filteredHistory = useMemo(() => filterData(historyData), [historyData, filterData]);
  const filteredCrypto = useMemo(() => filterData(cryptoData), [cryptoData, filterData]);
  const filteredFiat = useMemo(() => filterData(fiatData), [fiatData, filterData]);

  const historyCoinNote = useMemo(
    () => renamedCoinNote(historyData.map(d => d.Coin)),
    [historyData],
  );
  const cryptoCoinNote = useMemo(
    () => renamedCoinNote(cryptoData.map(d => d.Coin)),
    [cryptoData],
  );

  // Rows currently visible in the Fiat Flow table (after its column filters); drives the chart.
  const [fiatChartRows, setFiatChartRows] = useState<BinanceFiatDepositWithdraw[]>([]);
  const [fiatSynced, setFiatSynced] = useState(false);
  const handleFiatFilteredRows = useCallback((rows: BinanceFiatDepositWithdraw[]) => {
    setFiatChartRows(rows);
    setFiatSynced(true);
  }, []);

  // Rows currently visible in the Transaction History table (after its column filters); drives the chart.
  const [historyChartRows, setHistoryChartRows] = useState<BinanceTransaction[]>([]);
  const [historySynced, setHistorySynced] = useState(false);
  const handleHistoryFilteredRows = useCallback((rows: BinanceTransaction[]) => {
    setHistoryChartRows(rows);
    setHistorySynced(true);
  }, []);

  const historyColumns = useMemo<ColumnDef<BinanceTransaction>[]>(() => [
    { accessorKey: 'User ID', header: 'User ID' },
    {
      accessorKey: 'Time',
      header: 'Time',
      filterFn: dateRangeFilterFn,
      meta: { filterVariant: 'dateRange' },
      cell: ({ row }) => (
        <span className="font-mono whitespace-nowrap">{formatTimestamp(row.getValue('Time'))}</span>
      ),
    },
    {
      accessorKey: 'Account',
      header: 'Account',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
    },
    {
      accessorKey: 'Operation',
      header: 'Operation',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
    },
    {
      accessorKey: 'Coin',
      header: 'Coin',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
      cell: ({ row }) => coinLabel(row.getValue('Coin')),
    },
    {
      accessorKey: 'Change',
      header: 'Change',
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
          const val = parseFloat(row.getValue('Change'))
          return sum + (isNaN(val) ? 0 : val)
        }, 0)
        const rounded = Number(total.toFixed(8))
        return (
          <span className={rounded < 0 ? 'text-destructive' : 'text-emerald-600'}>
            {rounded > 0 ? `+${rounded}` : rounded}
          </span>
        )
      },
      cell: ({ row }) => {
        const value = parseFloat(row.getValue('Change'))
        return <span className={`font-mono font-medium ${value < 0 ? "text-destructive" : "text-emerald-600"}`}>
          {value > 0 ? `+${value}` : value}
        </span>
      }
    },
    {
      accessorKey: 'owner',
      header: 'Owner',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
    },
  ], [])

  const cryptoColumns = useMemo<ColumnDef<BinanceDepositWithdraw>[]>(() => [
    { accessorKey: 'Time', header: 'Time' },
    { accessorKey: 'Coin', header: 'Coin', cell: ({ row }) => coinLabel(row.getValue('Coin')) },
    { accessorKey: 'Network', header: 'Network' },
    { 
      accessorKey: 'Amount', 
      header: 'Amount',
      cell: ({ row }) => <span className="font-mono font-medium">{row.getValue('Amount')}</span>
    },
    { accessorKey: 'Fee', header: 'Fee' },
    { 
      accessorKey: 'Address', 
      header: 'Address',
      cell: ({ row }) => <div className="max-w-[150px] truncate font-mono text-[10px] text-muted-foreground" title={row.getValue('Address')}>{row.getValue('Address')}</div>
    },
    { 
      accessorKey: 'TXID', 
      header: 'TXID',
      cell: ({ row }) => <div className="max-w-[150px] truncate font-mono text-[10px] text-muted-foreground" title={row.getValue('TXID')}>{row.getValue('TXID')}</div>
    },
    { accessorKey: 'Status', header: 'Status' },
    { accessorKey: 'Type', header: 'Type' },
    { accessorKey: 'owner', header: 'Owner' },
  ], [])

  const fiatColumns = useMemo<ColumnDef<BinanceFiatDepositWithdraw>[]>(() => [
    {
      accessorKey: 'Time',
      header: 'Time',
      filterFn: dateRangeFilterFn,
      meta: { filterVariant: 'dateRange' },
    },
    { accessorKey: 'Method', header: 'Method' },
    {
      accessorKey: 'Amount',
      header: 'Amount',
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((sum, row) => {
          const val = parseFloat(row.getValue('Amount'))
          return sum + (isNaN(val) ? 0 : val)
        }, 0)
        return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      },
      cell: ({ row }) => {
        const val = parseFloat(row.getValue('Amount'))
        return <span className="font-mono font-bold">{val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
      }
    },
    {
      accessorKey: 'Status',
      header: 'Status',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
    },
    {
      accessorKey: 'Type',
      header: 'Type',
      filterFn: multiSelectFilterFn,
      meta: { filterVariant: 'multiSelect' },
    },
  ], [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-lg font-medium animate-pulse text-muted-foreground">Synchronizing with Binance...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Investments</h2>
          <p className="text-sm text-muted-foreground">
            Monitor your Binance exchange activity and asset movements.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Input
              placeholder="Search all columns..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-[300px] h-8 text-xs font-mono pr-8"
            />
            {globalSearch && (
              <button 
                onClick={() => setGlobalSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={loadAllData} className="h-8">
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="mb-4 bg-muted/50 p-1 border">
          <TabsTrigger value="history" className="text-xs">Transaction History</TabsTrigger>
          <TabsTrigger value="crypto" className="text-xs">Crypto Flow</TabsTrigger>
          <TabsTrigger value="fiat" className="text-xs">Fiat Flow</TabsTrigger>
        </TabsList>
        
        <TabsContent value="history" className="border-none p-0 outline-none">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="rounded-md border p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Cumulative change per coin over time
                </p>
                <CoinChangeChart data={historySynced ? historyChartRows : filteredHistory} />
              </div>
              <div className="rounded-md border p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Today's allocation
                </p>
                <PortfolioPieChart data={historySynced ? historyChartRows : filteredHistory} />
              </div>
            </div>
            <DataTable
              columns={historyColumns}
              data={filteredHistory}
              filterable
              paginated={false}
              loading={loading}
              onFilteredRowsChange={handleHistoryFilteredRows}
            />
            {historyCoinNote && (
              <p className="text-[10px] text-muted-foreground">{historyCoinNote}</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="crypto" className="border-none p-0 outline-none">
          <div className="space-y-4">
            <DataTable columns={cryptoColumns} data={filteredCrypto} filterable paginated={false} loading={loading} />
            {cryptoCoinNote && (
              <p className="text-[10px] text-muted-foreground">{cryptoCoinNote}</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="fiat" className="border-none p-0 outline-none">
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Accumulated amount over time
              </p>
              <FiatFlowChart data={fiatSynced ? fiatChartRows : filteredFiat} />
            </div>
            <DataTable
              columns={fiatColumns}
              data={filteredFiat}
              filterable
              paginated={false}
              loading={loading}
              onFilteredRowsChange={handleFiatFilteredRows}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

