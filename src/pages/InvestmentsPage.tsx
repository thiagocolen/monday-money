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
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'

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

      setHistoryData(history.filter(d => !isInternal(d)))
      setCryptoData(crypto.filter(d => !isInternal(d)))
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

  const historyColumns: ColumnDef<BinanceTransaction>[] = [
    { accessorKey: 'User ID', header: 'User ID' },
    { accessorKey: 'Time', header: 'Time' },
    { accessorKey: 'Account', header: 'Account' },
    { accessorKey: 'Operation', header: 'Operation' },
    { accessorKey: 'Coin', header: 'Coin' },
    { 
      accessorKey: 'Change', 
      header: 'Change',
      cell: ({ row }) => {
        const value = parseFloat(row.getValue('Change'))
        return <span className={`font-mono font-medium ${value < 0 ? "text-destructive" : "text-emerald-600"}`}>
          {value > 0 ? `+${value}` : value}
        </span>
      }
    },
    { accessorKey: 'Remark', header: 'Remark' },
    { accessorKey: 'owner', header: 'Owner' },
  ]

  const cryptoColumns: ColumnDef<BinanceDepositWithdraw>[] = [
    { accessorKey: 'Time', header: 'Time' },
    { accessorKey: 'Coin', header: 'Coin' },
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
  ]

  const fiatColumns: ColumnDef<BinanceFiatDepositWithdraw>[] = [
    { accessorKey: 'Time', header: 'Time' },
    { accessorKey: 'Method', header: 'Method' },
    { 
      accessorKey: 'Amount', 
      header: 'Amount',
      cell: ({ row }) => {
        const val = parseFloat(row.getValue('Amount'))
        return <span className="font-mono font-bold">{val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
      }
    },
    { accessorKey: 'Receive Amount', header: 'Receive' },
    { accessorKey: 'Fee', header: 'Fee' },
    { accessorKey: 'Status', header: 'Status' },
    { accessorKey: 'Transaction ID', header: 'ID' },
    { accessorKey: 'Type', header: 'Type' },
    { accessorKey: 'owner', header: 'Owner' },
  ]

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
          <DataTable columns={historyColumns} data={filteredHistory} filterable paginated pageSize={20} loading={loading} />
        </TabsContent>
        
        <TabsContent value="crypto" className="border-none p-0 outline-none">
          <DataTable columns={cryptoColumns} data={filteredCrypto} filterable paginated={false} loading={loading} />
        </TabsContent>
        
        <TabsContent value="fiat" className="border-none p-0 outline-none">
          <DataTable columns={fiatColumns} data={filteredFiat} filterable paginated={false} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

