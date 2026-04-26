import { useEffect, useState, useMemo, useCallback } from 'react'
import { 
  fetchTransactions, 
  saveCategory, 
  saveTags, 
  saveBulkCategories, 
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
import { addMonths, startOfMonth, endOfMonth, isWithinInterval, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Edit3, Trash2, Database, Info, Tags as TagsIcon, History, Plus, X, Check, Search } from 'lucide-react'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

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
      const matchOwner = ownerFilter === "all" || (item.owner || "No owner") === ownerFilter
      const matchCat = categoryFilter === "all" || (item.category || "Uncategorized") === categoryFilter
      const matchTag = tagFilter === "all" || (item.tags || "").split(',').some(t => t.trim() === tagFilter)
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

      {/* <TransactionChart 
        data={filteredData} 
        filterOffset={filterOffset} 
        onDayClick={(day) => setDayFilter(day === dayFilter ? null : day)}
        loading={loading}
      /> */}

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
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id}
        paginated={false}
        stickyHeader
        headerOffset={121}
        loading={loading}
        meta={{
          onEditTags: handleEditTags,
          onEditCategory: handleEditCategory,
          tagsMeta: metaTags,
          categoriesMeta: metaCategories
        }}
      />

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
                <TabsTrigger value="categories" className="text-xs">Categories</TabsTrigger>
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
                  .map(item => (
                    <div key={item.name} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors group">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs font-medium">{item.name}</span>
                        {item.isDefault && <Badge variant="outline" className="text-[8px] h-3.5 px-1 py-0 uppercase tracking-tighter opacity-50">Default</Badge>}
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {bulkActiveTab === 'categories' ? (
                          <>
                            {selectedRows.length === 1 && selectedRows[0].category === item.name ? (
                              <Badge variant="secondary" className="h-7 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Selected</Badge>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2"
                                onClick={() => handleBulkApply('categories', item.name, 'set')}
                              >
                                Set
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            {selectedRows.length === 1 && selectedRows[0].tags?.split(',').map(t => t.trim()).includes(item.name) ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2"
                                onClick={() => handleBulkApply('tags', item.name, 'remove')}
                              >
                                Rem
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2"
                                onClick={() => handleBulkApply('tags', item.name, 'add')}
                              >
                                Add
                              </Button>
                            )}
                          </>
                        )}
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
                  ))}
              </div>
            </div>
          </Tabs>

          <DialogFooter className="bg-muted/20 p-6 border-t mt-0">
            <Button variant="outline" size="sm" onClick={() => setIsBulkEditDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
