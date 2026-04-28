import { useEffect, useState, useMemo, useCallback, useTransition } from 'react'
import { 
  fetchTransactions, 
  backupCategories, 
  fetchBackupInfo,
  fetchMetadata,
  saveMetadataConfig,
  bulkSaveMetadata
} from '../lib/api'
import type { Transaction } from '../lib/api'
import { columns } from '../components/columns'
import { DataTable } from '../components/data-table'
import { cn } from "@/lib/utils"
import { TransactionChart } from '../components/transaction-chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addMonths, startOfMonth, endOfMonth, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Edit3, Trash2, Database, Info, History, Plus, X, Check, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import { DataTableFacetedFilter } from '../components/ui/faceted-filter'

const PRESET_COLORS = [
  { name: 'Slate', color: '#64748b' },
  { name: 'Red', color: '#ef4444' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Yellow', color: '#eab308' },
  { name: 'Lime', color: '#84cc16' },
  { name: 'Green', color: '#22c55e' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Teal', color: '#14b8a6' },
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Sky', color: '#0ea5e9' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Fuchsia', color: '#d946ef' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Rose', color: '#f43f5e' },
];


export function TransactionsPage() {
  const [isPending, startTransition] = useTransition()
  const [isVisualPending, setIsVisualPending] = useState(false)
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filterOffset, setFilterOffset] = useState<number>(0)
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false)
  
  // Metadata state
  const [metaTags, setMetaTags] = useState<{ name: string, color: string, isDefault?: boolean }[]>([])
  const [metaCategories, setMetaCategories] = useState<{ name: string, color: string, isDefault?: boolean }[]>([])
  
  // Bulk Edit state
  const [bulkActiveTab, setBulkActiveTab] = useState<string>("categories")
  const [bulkSearch, setBulkSearch] = useState("")
  const [editingItem, setEditingItem] = useState<{ name: string, color: string, isNew?: boolean, isDefault?: boolean } | null>(null)

  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupInfo, setBackupInfo] = useState<{ count: number; latestDate: string | null }>({ count: 0, latestDate: null })
  const [isMonthHovered, setIsMonthHovered] = useState(false)

  // Filter states
  const [globalSearch, setGlobalSearch] = useState("")
  const [localSearch, setLocalSearch] = useState("")
  const [ownerFilter, setOwnerFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [categoryFilter, setCategoryFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [tagFilter, setTagFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  // Debounce search input
  useEffect(() => {
    if (localSearch === globalSearch) return

    const timer = setTimeout(() => {
      setIsVisualPending(true)
      requestAnimationFrame(() => {
        startTransition(() => {
          setGlobalSearch(localSearch)
        })
      })
    }, 400) // 400ms debounce

    return () => clearTimeout(timer)
  }, [localSearch, globalSearch])

  const loadBackupInfo = useCallback(async () => {
    const info = await fetchBackupInfo()
    setBackupInfo(info)
  }, [])

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const transactions = await fetchTransactions()
      setData(transactions)
    } catch (error) {
      toast.error("Failed to load transactions")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const loadMetadata = useCallback(async () => {
    const meta = await fetchMetadata()
    setMetaTags(meta.tags || [])
    setMetaCategories(meta.categories || [])
  }, [])

  useEffect(() => {
    loadData()
    loadBackupInfo()
    loadMetadata()
  }, [loadData, loadBackupInfo, loadMetadata])

  // Sync isVisualPending with isPending
  useEffect(() => {
    if (!isPending) setIsVisualPending(false)
  }, [isPending])

  // 1. First, filter by month
  const monthData = useMemo(() => {
    const now = new Date()
    const targetDate = addMonths(now, filterOffset)
    const startStr = format(startOfMonth(targetDate), 'yyyy-MM-dd')
    const endStr = format(endOfMonth(targetDate), 'yyyy-MM-dd')

    return data.filter((item) => {
      // High-performance string date comparison
      return item.date >= startStr && item.date <= endStr
    })
  }, [data, filterOffset])

  // 2. Get unique categories, owners, and tags from all transactions + metadata
  const categories = useMemo(() => {
    const set = new Set(
      data
        .map((item) => item.category || "Uncategorized")
        .filter((cat) => cat !== "chain-transaction")
    )
    // Add categories from metadata to ensure they always show up
    metaCategories.forEach(cat => set.add(cat.name))
    return Array.from(set).sort()
  }, [data, metaCategories])

  const owners = useMemo(() => {
    const set = new Set(
      data
        .map((item) => (item.owner || "No owner"))
        .filter((owner) => owner !== "seed-transaction")
    )
    return Array.from(set).sort()
  }, [data])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    // Add tags from metadata
    metaTags.forEach(tag => set.add(tag.name))
    // Add tags from all transactions
    data.forEach(item => {
      if (item.tags) {
        item.tags.split(',').forEach(tag => {
          const trimmed = tag.trim()
          if (trimmed) set.add(trimmed)
        })
      }
    })
    return Array.from(set).sort()
  }, [data, metaTags])

  // 3. Apply the remaining filters
  const filteredData = useMemo(() => {
    const searchTerms = globalSearch.toLowerCase().split(/\s+/).filter(Boolean);

    return monthData.filter((item) => {
      // Hide system reserved rows
      if (item.category === 'chain-transaction') return false;
      if (item.owner === 'seed-transaction') return false;

      // Global multi-column search
      const matchesSearch = searchTerms.every(term => {
        const amountStr = item.amount.toString();
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.amount).toLowerCase();

        // Numeric comparisons (e.g., >100, <50, >=200, <=-10)
        const numericMatch = term.match(/^([<>]=?)(-?\d+(?:\.\d+)?)$/);
        if (numericMatch) {
          const [, operator, valueStr] = numericMatch;
          const value = parseFloat(valueStr);
          if (operator === ">") return item.amount > value;
          if (operator === "<") return item.amount < value;
          if (operator === ">=") return item.amount >= value;
          if (operator === "<=") return item.amount <= value;
        }

        return (
          item.description.toLowerCase().includes(term) ||
          (item.category || "Uncategorized").toLowerCase().includes(term) ||
          (item.tags || "").toLowerCase().includes(term) ||
          (item.owner || "No owner").toLowerCase().includes(term) ||
          item.date.includes(term) ||
          amountStr.includes(term) ||
          formattedAmount.includes(term)
        );
      });

      // Filter logic with Include/Exclude
      const applyFilter = (val: string, filter: Record<string, 'include' | 'exclude'>) => {
        const keys = Object.keys(filter)
        if (keys.length === 0) return true
        
        const includes = keys.filter(k => filter[k] === 'include')
        const excludes = keys.filter(k => filter[k] === 'exclude')

        // If there are 'include' filters, the value must be one of them
        if (includes.length > 0 && !includes.includes(val)) return false
        
        // If there are 'exclude' filters, the value must not be one of them
        if (excludes.includes(val)) return false
        
        return true
      }

      // Tags need special multi-value logic
      const applyTagFilter = (tagsStr: string, filter: Record<string, 'include' | 'exclude'>) => {
        const keys = Object.keys(filter)
        if (keys.length === 0) return true
        
        const currentTags = tagsStr.split(',').map(t => t.trim())
        const includes = keys.filter(k => filter[k] === 'include')
        const excludes = keys.filter(k => filter[k] === 'exclude')

        if (includes.length > 0 && !includes.some(t => currentTags.includes(t))) return false
        if (excludes.some(t => currentTags.includes(t))) return false
        
        return true
      }

      const matchOwner = applyFilter(item.owner || "No owner", ownerFilter)
      const matchCat = applyFilter(item.category || "Uncategorized", categoryFilter)
      const matchTag = applyTagFilter(item.tags || "", tagFilter)
      const matchDay = !dayFilter || item.date === dayFilter
      
      return matchesSearch && matchOwner && matchCat && matchTag && matchDay
    })
  }, [monthData, globalSearch, ownerFilter, categoryFilter, tagFilter, dayFilter])

  const selectedRows = useMemo(() => {
    return filteredData.filter(row => rowSelection[row.id])
  }, [filteredData, rowSelection])

  const handleSaveMetaItem = async (type: 'tags' | 'categories', item: { name: string, color: string }) => {
    const current = type === 'tags' ? [...metaTags] : [...metaCategories]
    const index = current.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase())
    
    if (index > -1) {
      if (current[index].isDefault) {
        toast.error(`Cannot modify default ${type === 'tags' ? 'tag' : 'category'}`)
        return
      }
      current[index] = { ...current[index], ...item }
    } else {
      current.push(item)
    }
    
    const success = await saveMetadataConfig(type, current)
    if (success) {
      if (type === 'tags') setMetaTags(current)
      else setMetaCategories(current)
      setEditingItem(null)
      toast.success(`${type === 'tags' ? 'Tag' : 'Category'} saved`)
    }
  }

  const handleDeleteMetaItem = async (type: 'tags' | 'categories', name: string) => {
    const current = type === 'tags' ? metaTags.filter(i => i.name !== name) : metaCategories.filter(i => i.name !== name)
    const success = await saveMetadataConfig(type, current)
    if (success) {
      if (type === 'tags') setMetaTags(current)
      else setMetaCategories(current)
      toast.success(`${type === 'tags' ? 'Tag' : 'Category'} deleted`)
    }
  }

  const handleBulkApply = async (type: 'tags' | 'categories', value: string, action: 'add' | 'remove' | 'set') => {
    if (selectedRows.length === 0) return
    setIsSaving(true)

    const updates = selectedRows.map(row => {
      const update: any = { transactionHash: row.rowHash }
      if (type === 'categories') {
        update.category = action === 'remove' ? '' : value
      } else {
        const currentTags = row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : []
        if (action === 'add') {
          if (!currentTags.includes(value)) currentTags.push(value)
        } else if (action === 'remove') {
          const index = currentTags.indexOf(value)
          if (index > -1) currentTags.splice(index, 1)
        } else {
          // 'set' is not usually used for tags in bulk but we could
        }
        update.tags = currentTags.join(',')
      }
      return update
    })

    const success = await bulkSaveMetadata(updates)
    if (success) {
      toast.success(`Updated ${selectedRows.length} transactions`)
      loadData(false)
    } else {
      toast.error("Failed to update transactions")
    }
    setIsSaving(false)
  }

  const currentMonthLabel = useMemo(() => {
    const now = new Date()
    const targetDate = addMonths(now, filterOffset)
    return format(targetDate, 'MMMM yyyy')
  }, [filterOffset])

  const handleEditCategory = (transaction: Transaction) => {
    if (transaction.category === 'chain-transaction') return;
    if (!rowSelection[transaction.id]) {
      setRowSelection({ [transaction.id]: true })
    }
    setBulkActiveTab("categories")
    setIsBulkEditDialogOpen(true)
  }

  const handleEditTags = (transaction: Transaction) => {
    if (!rowSelection[transaction.id]) {
      setRowSelection({ [transaction.id]: true })
    }
    setBulkActiveTab("tags")
    setIsBulkEditDialogOpen(true)
  }

  const handleBackup = async () => {
    setIsBackingUp(true)
    try {
      const result = await backupCategories()
      if (result.success) {
        toast.success(`Backup created: ${result.fileName}`)
        loadBackupInfo()
      } else {
        toast.error(`Backup failed: ${result.error}`)
      }
    } catch (e) {
      toast.error("Backup failed")
    } finally {
      setIsBackingUp(false)
    }
  }

  const resetFilters = useCallback(() => {
    setIsVisualPending(true)
    requestAnimationFrame(() => {
      startTransition(() => {
        setLocalSearch("")
        setGlobalSearch("")
        setOwnerFilter({})
        setCategoryFilter({})
        setTagFilter({})
        setDayFilter(null)
      })
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur()
        }
        return
      }

      if (e.key === 'Escape') {
        if (isBulkEditDialogOpen) {
          setIsBulkEditDialogOpen(false)
        } else if (Object.keys(rowSelection).length > 0) {
          setRowSelection({})
        } else if (Object.keys(ownerFilter).length > 0 || Object.keys(categoryFilter).length > 0 || Object.keys(tagFilter).length > 0 || globalSearch || dayFilter) {
          resetFilters()
        }
      } else if (e.key.toLowerCase() === 'a') {
        e.preventDefault() // Prevent scroll or other browser defaults
        const allSelection: Record<string, boolean> = {}
        filteredData.forEach(row => {
          allSelection[row.id] = true
        })
        setRowSelection(allSelection)
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        if (selectedRows.length > 0) {
          setIsBulkEditDialogOpen(true)
        } else {
          toast.error("Select transactions first to bulk edit (or press 'A' to select all)", { duration: 2000 })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredData, selectedRows.length, resetFilters, isBulkEditDialogOpen, rowSelection, ownerFilter, categoryFilter, tagFilter, globalSearch, dayFilter])

  const handleMonthChange = (offsetUpdate: number | ((prev: number) => number)) => {
    setIsVisualPending(true)
    requestAnimationFrame(() => {
      startTransition(() => {
        if (typeof offsetUpdate === 'function') {
          setFilterOffset(offsetUpdate)
        } else {
          setFilterOffset(offsetUpdate)
        }
        setDayFilter(null)
      })
    })
  }

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-lg font-medium animate-pulse">Loading transactions...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Monthly Transactions</h2>
            <p className="text-muted-foreground">
              Visualize and categorize your monthly spending.
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-indigo-50/30 dark:bg-indigo-950/20 p-1.5 rounded-lg border border-indigo-100/50 dark:border-indigo-900/50 shadow-sm">
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-none"
                onClick={handleBackup}
                disabled={isBackingUp}
              >
                <Database className="mr-2 h-3.5 w-3.5 text-indigo-100" />
                {isBackingUp ? "Backing up..." : "Backup Categories"}
              </Button>
              
              <div className="flex items-center gap-1.5 px-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-default">
                      <History className="h-3 w-3 text-indigo-400" />
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-indigo-100/50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 border-none">
                        {backupInfo.count}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-[10px] font-medium">Total category backups</p>
                  </TooltipContent>
                </Tooltip>

                {backupInfo.latestDate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-default">
                        <span className="text-[10px] font-bold text-indigo-400/70 dark:text-indigo-500 uppercase tracking-tighter">Latest:</span>
                        <span className="text-[10px] font-mono font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100/50 dark:bg-indigo-900/40 px-1.5 py-0.5 rounded leading-none">
                          {format(parseISO(backupInfo.latestDate), "dd/MM HH:mm")}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-[10px] font-medium">Last backup: {format(parseISO(backupInfo.latestDate), "PPP p")}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 border rounded-md p-1 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-sm border-indigo-100/50 dark:border-indigo-900/50">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-indigo-600 hover:text-white transition-all duration-200"
                onClick={() => handleMonthChange(prev => prev - 1)}
                aria-label="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={cn(
                  "text-xs font-mono font-bold min-w-[120px] text-center uppercase tracking-tighter cursor-pointer transition-all duration-200 rounded px-2 py-1",
                  isMonthHovered ? "bg-indigo-600 text-white scale-105" : "text-foreground hover:bg-muted/50"
                )}
                onMouseEnter={() => setIsMonthHovered(true)}
                onMouseLeave={() => setIsMonthHovered(false)}
                onClick={() => handleMonthChange(0)}
              >
                {isMonthHovered ? "Current Month" : currentMonthLabel}
              </span>

              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-indigo-600 hover:text-white transition-all duration-200"
                onClick={() => handleMonthChange(prev => prev + 1)}
                aria-label="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <TransactionChart 
        data={filteredData} 
        filterOffset={filterOffset} 
        onDayClick={(day) => setDayFilter(day === dayFilter ? null : day)}
        loading={loading}
      />

      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 -mx-4 px-4 border-b mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search all columns..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="max-w-xs h-8 text-xs font-mono"
          />
          
          <DataTableFacetedFilter
            title="Category"
            options={categories.map(cat => ({ label: cat, value: cat }))}
            selectedValues={categoryFilter}
            onSelect={(v) => startTransition(() => setCategoryFilter(v))}
          />

          <DataTableFacetedFilter
            title="Tag"
            options={allTags.map(tag => ({ label: tag, value: tag }))}
            selectedValues={tagFilter}
            onSelect={(v) => startTransition(() => setTagFilter(v))}
          />

          <DataTableFacetedFilter
            title="Owner"
            options={owners.map(owner => ({ label: owner, value: owner }))}
            selectedValues={ownerFilter}
            onSelect={(v) => startTransition(() => setOwnerFilter(v))}
          />

          {dayFilter && (
            <div className="flex items-center bg-primary/10 border border-primary/20 rounded-md px-2 py-1 h-8">
              <span className="text-[10px] font-bold text-primary mr-2 uppercase">Day: {format(parseISO(dayFilter), "dd/MM")}</span>
              <button onClick={() => setDayFilter(null)} className="hover:text-primary"><Trash2 className="h-3 w-3" /></button>
            </div>
          )}

          {(globalSearch || Object.keys(ownerFilter).length > 0 || Object.keys(categoryFilter).length > 0 || Object.keys(tagFilter).length > 0 || dayFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {selectedRows.length > 0 && (
              <Button 
                variant="default" 
                size="sm" 
                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-xs shadow-md animate-in fade-in slide-in-from-right-2"
                onClick={() => setIsBulkEditDialogOpen(true)}
              >
                <Edit3 className="mr-2 h-3.5 w-3.5" />
                Bulk Edit ({selectedRows.length})
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        {(isPending || isSaving || isVisualPending) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-start pt-32 bg-background/60 backdrop-blur-[1px] animate-in fade-in duration-200 rounded-lg">
            <div className="flex flex-col items-center p-6 bg-background/90 rounded-xl shadow-xl border border-indigo-100 dark:border-indigo-900 scale-90">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-900 dark:text-indigo-400">Processing</p>
            </div>
          </div>
        )}
        <DataTable 
          columns={columns} 
          data={filteredData} 
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.id}
          paginated={false}
          stickyHeader
          headerOffset={121}
          meta={{
            onEditTags: handleEditTags,
            onEditCategory: handleEditCategory,
            tagsMeta: metaTags,
            categoriesMeta: metaCategories
          }}
          />      </div>

      {/* Bulk Edit Tags and Categories Dialog */}
      <Dialog open={isBulkEditDialogOpen} onOpenChange={setIsBulkEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
          <div className="p-6 border-b bg-muted/20">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-indigo-600">
                <Edit3 className="h-5 w-5" />
                Bulk Edit Transactions
              </DialogTitle>
              <DialogDescription className="text-xs">
                Applying changes to <strong>{selectedRows.length}</strong> selected records.
              </DialogDescription>
            </DialogHeader>
          </div>

          <Tabs value={bulkActiveTab} onValueChange={setBulkActiveTab} className="w-full">
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <div className="flex items-center justify-center gap-2">
                  <TabsTrigger value="categories" className="text-xs flex-1">
                    Categories
                  </TabsTrigger>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-1 cursor-help">
                        <Info className="h-3 w-3 text-muted-foreground hover:text-indigo-600 transition-colors" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[300px] p-3 z-[100]">
                      <div className="space-y-2 text-[10px] leading-relaxed">
                        <p className="font-bold border-b pb-1 mb-1">Category Explanations</p>
                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                          <span className="font-bold text-indigo-600">NULLED</span> <span>TRANSAÇÕES IGNORADAS</span>
                          <span className="font-bold text-indigo-600">INCOME</span> <span>TRANSAÇÕES POSITIVAS</span>
                          <span className="font-bold text-indigo-600">HOUSING</span> <span>ALUGUEL, CONDOMÍNIO, IPTU, INTERNET, LUZ, GÁS</span>
                          <span className="font-bold text-indigo-600">HEALTH</span> <span>PLANO DE SAÚDE, FARMÁCIA, MÉDICO, ACADEMIA, NATAÇÃO</span>
                          <span className="font-bold text-indigo-600">FOOD</span> <span>SUPERMERCADO, HORTFRUTI, AÇOUGUE</span>
                          <span className="font-bold text-indigo-600">ONLINE_SERVICES</span> <span>NETFLIX, SPOTIFY, OUTROS</span>
                          <span className="font-bold text-indigo-600">TRANSPORT</span> <span>UBER, BILHETE ÚNICO, COMBUSTÍVEL</span>
                          <span className="font-bold text-indigo-600">STREET FOOD</span> <span>DELIVERY, RESTAURANTE, BAR, BALADA</span>
                          <span className="font-bold text-indigo-600">INVESTMENTS</span> <span>INVESTIMENTOS</span>
                          <span className="font-bold text-indigo-600">OTHER</span> <span>OUTROS</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <TabsTrigger value="tags" className="text-xs">Tags</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-2 mb-4 bg-muted/50 rounded-md px-2.5 py-1.5 border">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder={`Search ${bulkActiveTab}...`} 
                  className="h-6 border-none bg-transparent shadow-none focus-visible:ring-0 text-xs p-0"
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                />
                <Button 
                  size="sm" 
                  variant="ghost" 
                  aria-label="add-button"
                  className="h-6 w-6 p-0 hover:bg-indigo-100 hover:text-indigo-600 rounded-full"
                  onClick={() => setEditingItem({ name: '', color: PRESET_COLORS[0].color, isNew: true })}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {editingItem && (
                <div className="mb-6 p-4 rounded-lg border border-indigo-100 bg-indigo-50/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      {editingItem.isNew ? `New ${bulkActiveTab === 'categories' ? 'category' : 'tag'}` : `Edit ${editingItem.name}`}
                    </span>
                    <Button size="icon" variant="ghost" className="h-5 w-5 rounded-full" onClick={() => setEditingItem(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Name" 
                      className="h-8 text-xs font-medium" 
                      value={editingItem.name}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    />
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c.color}
                          className={cn(
                            "h-4 w-4 rounded-full border border-white shadow-sm transition-transform hover:scale-125",
                            editingItem.color === c.color && "ring-2 ring-indigo-400 ring-offset-1"
                          )}
                          style={{ backgroundColor: c.color }}
                          onClick={() => setEditingItem({ ...editingItem, color: c.color })}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  <Button 
                    className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => handleSaveMetaItem(bulkActiveTab as 'tags' | 'categories', { name: editingItem.name, color: editingItem.color })}
                    disabled={!editingItem.name}
                  >
                    <Check className="mr-2 h-3.5 w-3.5" />
                    Save {bulkActiveTab === 'categories' ? 'category' : 'tag'}
                  </Button>
                </div>
              )}

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {(bulkActiveTab === 'categories' ? metaCategories : metaTags)
                  .filter(item => item.name.toLowerCase().includes(bulkSearch.toLowerCase()))
                  .map(item => {
                    const isFullySelected = bulkActiveTab === 'categories' 
                      ? selectedRows.length === 1 && selectedRows[0].category === item.name
                      : selectedRows.every(r => r.tags?.split(',').map(t => t.trim()).includes(item.name));
                    
                    const isPartiallySelected = bulkActiveTab === 'tags' && !isFullySelected && selectedRows.some(r => r.tags?.split(',').map(t => t.trim()).includes(item.name));

                    return (
                      <div 
                        key={item.name} 
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md transition-colors group cursor-pointer border border-transparent",
                          isFullySelected ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900" : "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          if (bulkActiveTab === 'categories') {
                            handleBulkApply('categories', item.name, 'set')
                          } else {
                            handleBulkApply('tags', item.name, isFullySelected ? 'remove' : 'add')
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className={cn("text-xs font-medium", isFullySelected && "text-indigo-600 dark:text-indigo-400 font-bold")}>{item.name}</span>
                          {item.isDefault && <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 uppercase tracking-tighter opacity-50">Default</Badge>}
                          {isFullySelected && <Check className="h-3 w-3 text-indigo-600 animate-in zoom-in" />}
                          {isPartiallySelected && <div className="h-1 w-2 bg-indigo-400 rounded-full" title="Partially applied" />}
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          {!item.isDefault && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 rounded-full"
                                onClick={() => setEditingItem({ ...item, isNew: false })}
                              >
                                <Edit3 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 rounded-full hover:text-destructive"
                                onClick={() => handleDeleteMetaItem(bulkActiveTab as 'tags' | 'categories', item.name)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
