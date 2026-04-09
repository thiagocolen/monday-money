import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchTransactions, saveCategory, saveTags, saveBulkCategories, backupCategories, fetchBackupInfo } from '../lib/api'
import type { Transaction } from '../lib/api'
import { columns } from '../components/columns'
import { DataTable } from '../components/data-table'
import { cn } from "@/lib/utils"
import { TransactionChart } from '../components/transaction-chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addMonths, startOfMonth, endOfMonth, isWithinInterval, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Edit3, Trash2, Database, Info, Tags as TagsIcon, History } from 'lucide-react'
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const CATEGORIES = [
  "INCOME",
  "HOUSE",
  "ONLINE_SERVICES",
  "HEALTH",
  "SUPERMARKET",
  "FOOD",
  "TRANSPORTATION",
  "INVESTMENTS",
  "OTHERS"
];

export function TransactionsPage() {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [filterOffset, setFilterOffset] = useState<number>(0)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [selectedTagsTransaction, setSelectedTagsTransaction] = useState<Transaction | null>(null)
  const [selectedRows, setSelectedRows] = useState<Transaction[]>([])
  const [newCategory, setNewCategory] = useState<string>("")
  const [newTags, setNewTags] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false)
  const [bulkCategory, setBulkCategory] = useState<string>("")
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupInfo, setBackupInfo] = useState<{ count: number; latestDate: string | null }>({ count: 0, latestDate: null })
  const [isMonthHovered, setIsMonthHovered] = useState(false)

  // Filter states
  const [globalSearch, setGlobalSearch] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [dayFilter, setDayFilter] = useState<string | null>(null)

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

  useEffect(() => {
    loadData()
    loadBackupInfo()
  }, [loadData, loadBackupInfo])

  // 1. First, filter by month
  const monthData = useMemo(() => {
    const now = new Date()
    const targetDate = addMonths(now, filterOffset)
    const start = startOfMonth(targetDate)
    const end = endOfMonth(targetDate)

    return data.filter((item) => {
      const itemDate = parseISO(item.date)
      return isWithinInterval(itemDate, { start, end })
    })
  }, [data, filterOffset])

  // 2. Get unique categories, owners, and tags from the current month
  const categories = useMemo(() => {
    const set = new Set(
      monthData
        .map((item) => item.category || "Uncategorized")
        .filter((cat) => cat !== "chain-transaction")
    )
    return Array.from(set).sort()
  }, [monthData])

  const owners = useMemo(() => {
    const set = new Set(
      monthData
        .map((item) => (item.owner || "No owner"))
        .filter((owner) => owner !== "seed-transaction")
    )
    return Array.from(set).sort()
  }, [monthData])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    monthData.forEach(item => {
      if (item.tags) {
        item.tags.split(',').forEach(tag => {
          const trimmed = tag.trim()
          if (trimmed) set.add(trimmed)
        })
      }
    })
    return Array.from(set).sort()
  }, [monthData])

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

      const matchOwner = ownerFilter === "all" || (item.owner || "No owner") === ownerFilter
      const matchCat = categoryFilter === "all" || (item.category || "Uncategorized") === categoryFilter
      const matchTag = tagFilter === "all" || (item.tags || "").split(',').some(t => t.trim() === tagFilter)
      const matchDay = !dayFilter || item.date === dayFilter
      
      return matchesSearch && matchOwner && matchCat && matchTag && matchDay
    })
  }, [monthData, globalSearch, ownerFilter, categoryFilter, tagFilter, dayFilter])

  const currentMonthLabel = useMemo(() => {
    const now = new Date()
    const targetDate = addMonths(now, filterOffset)
    return format(targetDate, 'MMMM yyyy')
  }, [filterOffset])

  const handleRowClick = (transaction: Transaction) => {
    if (transaction.category === 'chain-transaction') return;
    setSelectedTransaction(transaction)
    setNewCategory(transaction.category || "")
  }

  const handleEditTags = (transaction: Transaction) => {
    setSelectedTagsTransaction(transaction)
    setNewTags(transaction.tags || "")
  }

  const handleSaveCategory = async () => {
    if (!selectedTransaction) return
    setIsSaving(true)
    
    // Optimistic UI update
    const previousData = [...data]
    setData(prev => prev.map(item => 
      item.rowHash === selectedTransaction.rowHash 
        ? { ...item, category: newCategory } 
        : item
    ))

    const success = await saveCategory(selectedTransaction.rowHash, newCategory)
    if (success) {
      toast.success("Category updated")
      setSelectedTransaction(null)
      loadData(false) // Background refresh
    } else {
      toast.error("Failed to save category")
      setData(previousData) // Revert on failure
    }
    setIsSaving(false)
  }

  const handleSaveTags = async () => {
    if (!selectedTagsTransaction) return
    setIsSaving(true)
    
    // Optimistic UI update
    const previousData = [...data]
    setData(prev => prev.map(item => 
      item.rowHash === selectedTagsTransaction.rowHash 
        ? { ...item, tags: newTags } 
        : item
    ))

    const success = await saveTags(selectedTagsTransaction.rowHash, newTags)
    if (success) {
      toast.success("Tags updated")
      setSelectedTagsTransaction(null)
      loadData(false) // Background refresh
    } else {
      toast.error("Failed to save tags")
      setData(previousData) // Revert on failure
    }
    setIsSaving(false)
  }

  const handleBulkSave = async () => {
    if (selectedRows.length === 0 || !bulkCategory) return
    setIsSaving(true)
    
    const updates = selectedRows.map(row => ({
      transactionHash: row.rowHash,
      category: bulkCategory
    }))

    const success = await saveBulkCategories(updates)
    if (success) {
      toast.success(`Updated ${selectedRows.length} transactions`)
      setIsBulkEditDialogOpen(false)
      setBulkCategory("")
      loadData(false)
    } else {
      toast.error("Failed to update some transactions")
    }
    setIsSaving(false)
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

  const resetFilters = () => {
    setGlobalSearch("")
    setOwnerFilter("all")
    setCategoryFilter("all")
    setTagFilter("all")
    setDayFilter(null)
  }

  const handleMonthChange = (offsetUpdate: number | ((prev: number) => number)) => {
    if (typeof offsetUpdate === 'function') {
      setFilterOffset(offsetUpdate)
    } else {
      setFilterOffset(offsetUpdate)
    }
    setDayFilter(null)
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

            <div className="flex items-center space-x-2 border rounded-md p-1 bg-background shadow-sm">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8"
                onClick={() => handleMonthChange(prev => prev - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={cn(
                  "text-xs font-mono font-bold min-w-[120px] text-center uppercase tracking-tighter cursor-pointer transition-all duration-200 rounded px-2 py-1",
                  isMonthHovered ? "bg-indigo-600 text-white scale-105" : "text-foreground"
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
                className="h-8 w-8"
                onClick={() => handleMonthChange(prev => prev + 1)}
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
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="max-w-xs h-8 text-xs font-mono"
          />
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag} className="text-xs">{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map((owner) => (
                <SelectItem key={owner} value={owner} className="text-xs">{owner}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {dayFilter && (
            <div className="flex items-center bg-primary/10 border border-primary/20 rounded-md px-2 py-1 h-8">
              <span className="text-[10px] font-bold text-primary mr-2 uppercase">Day: {format(parseISO(dayFilter), "dd/MM")}</span>
              <button onClick={() => setDayFilter(null)} className="hover:text-primary"><Trash2 className="h-3 w-3" /></button>
            </div>
          )}

          {(globalSearch || ownerFilter !== "all" || categoryFilter !== "all" || tagFilter !== "all" || dayFilter) && (
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

      <DataTable 
        columns={columns} 
        data={filteredData} 
        onSelectionChange={setSelectedRows}
        paginated={false}
        stickyHeader
        headerOffset={121}
        loading={loading}
        meta={{
          onEditTags: handleEditTags,
          onEditCategory: handleRowClick
        }}
      />

      {/* Individual Category Edit Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Category</DialogTitle>
            <DialogDescription className="text-xs">
              Update the category for this specific transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-4 items-start gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase pt-1">Description</span>
              <span className="col-span-3 text-sm font-medium">{selectedTransaction?.description}</span>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Amount</span>
              <span className={`col-span-3 text-sm font-mono font-bold ${selectedTransaction && selectedTransaction.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
                {selectedTransaction && new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedTransaction.amount)}
              </span>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Category</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[300px] p-3">
                    <div className="space-y-2 text-[10px]">
                      <p><strong>INCOME</strong> (TRANSAÇÕES POSITIVAS)</p>
                      <p><strong>HOUSE</strong> (ALUGUEL, CONDOMÍNIO, IPTU, INTERNET, LUZ, GÁS)</p>
                      <p><strong>ONLINE_SERVICES</strong> (NETFLIX, SPOTIFY, OUTROS)</p>
                      <p><strong>HEALTH</strong> (PLANO DE SAÚDE, FARMÁCIA, MÉDICO, ACADEMIA, NATAÇÃO)</p>
                      <p><strong>SUPERMARKET</strong> (SUPERMERCADO, HORTFRUTI, AÇOUGUE)</p>
                      <p><strong>FOOD</strong> (DELIVERY, RESTAURANTE, BAR, BALADA)</p>
                      <p><strong>TRANSPORTATION</strong> (UBER, BILHETE ÚNICO, COMBUSTÍVEL)</p>
                      <p><strong>INVESTMENTS</strong> (INVESTIMENTOS)</p>
                      <p><strong>OTHERS</strong> (OUTROS)</p>
                      <p><strong>chain-transaction</strong> (SYSTEM RESERVED)</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="col-span-3">
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedTransaction(null)} disabled={isSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveCategory} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual Tags Edit Dialog */}
      <Dialog open={!!selectedTagsTransaction} onOpenChange={(open) => !open && setSelectedTagsTransaction(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <TagsIcon className="h-5 w-5 text-indigo-600" />
              Edit Tags
            </DialogTitle>
            <DialogDescription className="text-xs">
              Manage tags for this transaction. Separate multiple tags with commas.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-4 items-start gap-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase pt-1">Description</span>
              <span className="col-span-3 text-sm font-medium">{selectedTagsTransaction?.description}</span>
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Tags (comma separated)</span>
              <Input 
                value={newTags} 
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="e.g. travel, urgent, recurring"
                className="h-10 text-sm font-mono"
                autoFocus
              />
            </div>
            {newTags && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {newTags.split(',').map((t, i) => {
                  const tag = t.trim()
                  if (!tag) return null
                  return (
                    <div key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold uppercase tracking-wider">
                      {tag}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedTagsTransaction(null)} disabled={isSaving}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" size="sm" onClick={handleSaveTags} disabled={isSaving}>
              {isSaving ? "Saving..." : "Update Tags"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={isBulkEditDialogOpen} onOpenChange={setIsBulkEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-indigo-600">Bulk Edit Categories</DialogTitle>
            <DialogDescription className="text-xs">
              Changing category for <strong>{selectedRows.length}</strong> selected transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">New Category</p>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select category for all..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsBulkEditDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" size="sm" onClick={handleBulkSave} disabled={isSaving || !bulkCategory}>
              {isSaving ? "Updating..." : `Update ${selectedRows.length} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
