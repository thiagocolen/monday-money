import { useState, useEffect, useCallback, useMemo } from "react"
import { fetchOwners, fetchImportHistory, deleteImport, fetchRawCsvFolderPath, setRawCsvFolderPath, scanFolder, selectDirectory } from "../lib/api"
import type { ImportHistory } from "../lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, CheckCircle2, AlertCircle, Loader2, Trash2, FolderOpen, RefreshCw, Search, ArrowUpDown } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

type SortField = 'fileName' | 'owner' | 'processedDate' | 'totalTransactions';
type SortOrder = 'asc' | 'desc';

export function ImportPage() {
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [rawFolderPath, setRawFolderPath] = useState<string>("")
  const [isScanning, setIsScanning] = useState(false)
  const [deletingFile, setDeletingFile] = useState<ImportHistory | null>(null)
  const [isDeleteDialogOpen, setIsDeleteOpen] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [reprocessingLogs, setReprocessingLogs] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Filters and Sorting
  const [searchQuery, setSearchQuery] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [sortField, setSortField] = useState<SortField>('processedDate')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [historyData, path] = await Promise.all([
        fetchImportHistory(),
        fetchRawCsvFolderPath()
      ])
      setHistory(historyData)
      setRawFolderPath(path)
    } catch (error) {
      toast.error("Failed to load data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const owners = useMemo(() => {
    const uniqueOwners = new Set(history.map(h => h.owner))
    return Array.from(uniqueOwners).sort()
  }, [history])

  const filteredHistory = useMemo(() => {
    let result = history.filter(item => {
      const matchesSearch = item.fileName.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesOwner = ownerFilter === "all" || item.owner === ownerFilter
      return matchesSearch && matchesOwner
    })

    result.sort((a, b) => {
      let valA: any = a[sortField]
      let valB: any = b[sortField]

      if (sortField === 'processedDate') {
        valA = new Date(valA).getTime()
        valB = new Date(valB).getTime()
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = valB.toLowerCase()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [history, searchQuery, ownerFilter, sortField, sortOrder])

  const totals = useMemo(() => {
    return history.reduce((acc, curr) => ({
      total: acc.total + curr.totalTransactions,
      imported: acc.imported + curr.importedTransactions,
      skipped: acc.skipped + curr.notImportedTransactions
    }), { total: 0, imported: 0, skipped: 0 })
  }, [history])

  const handleBrowseFolder = async () => {
    try {
      const path = await selectDirectory("Select Raw CSV Folder")
      if (path) {
        const result = await setRawCsvFolderPath(path)
        if (result.success) {
          setRawFolderPath(path)
          toast.success("Folder path updated")
        } else {
          toast.error(result.error || "Failed to update path")
        }
      }
    } catch (error) {
      toast.error("Error selecting folder")
    }
  }

  const handleScanFolder = async () => {
    if (!rawFolderPath) {
      toast.error("Please configure the folder path first")
      return
    }

    setIsScanning(true)
    setReprocessingLogs("Scanning folder and initiating processing...\n")
    setIsLogsModalOpen(true)
    
    try {
      const result = await scanFolder()
      if (result.success) {
        setReprocessingLogs(prev => prev + "Scan and processing completed successfully.\nDone.")
        toast.success("Folder scanned and transactions processed.")
        loadData()
      } else {
        setReprocessingLogs(prev => prev + `\nERROR: ${result.error}`)
        toast.error(`Scan failed: ${result.error}`)
      }
    } catch (error) {
      setReprocessingLogs(prev => prev + `\nFATAL ERROR: ${String(error)}`)
      toast.error("An error occurred during scan.")
    } finally {
      setIsScanning(false)
    }
  }

  const handleDeleteClick = (item: ImportHistory) => {
    setDeletingFile(item)
    setIsDeleteOpen(true)
  }

  const handleCancelDelete = () => {
    setIsDeleteOpen(false)
    if (!isDeleting) {
      setDeletingFile(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingFile) return

    const { owner, fileName } = deletingFile
    setIsDeleting(true)
    setIsDeleteOpen(false)
    setReprocessingLogs("Initiating reprocessing...\n")
    setIsLogsModalOpen(true)
    
    try {
      const result = await deleteImport(owner, fileName)
      if (result.success) {
        setReprocessingLogs(prev => prev + (result.logs || "Done."))
        toast.success(`Successfully removed ${fileName} and refreshed data.`)
        loadData()
      } else {
        setReprocessingLogs(prev => prev + `\nERROR: ${result.error}`)
        toast.error(`Failed to delete file: ${result.error}`)
      }
    } catch (error) {
      setReprocessingLogs(prev => prev + `\nFATAL ERROR: ${String(error)}`)
      toast.error("An error occurred during deletion.")
    } finally {
      setIsDeleting(false)
      setDeletingFile(null)
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import Statement Files</h2>
        <p className="text-muted-foreground">
          Automate transaction imports by configuring a local folder with your bank statements.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Folder Configuration
            </CardTitle>
            <CardDescription>Path where statement files are stored</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Folder Path</label>
              <div className="flex gap-2">
                <Input 
                  value={rawFolderPath}
                  readOnly
                  placeholder="No path configured"
                  className="h-9 text-[10px] font-mono bg-muted/30"
                />
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBrowseFolder}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700 h-9 text-xs gap-2" 
              onClick={handleScanFolder}
              disabled={isScanning || !rawFolderPath}
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Scan and Process Folder
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3 text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Place your CSV files in subfolders named after the transaction <strong>owner</strong> (e.g., <code>.../MyFolder/John-Doe/statement.csv</code>).</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Scanning will detect new files and process them automatically using the appropriate bank parser.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Files already imported are tracked by content hash and will be skipped to avoid duplicates.</p>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />
              <p>A full data reset and reload is performed during each scan to maintain ledger integrity.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6">
          <div className="space-y-1">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600">Import History</CardTitle>
            <CardDescription>Manage and filter processed statement files</CardDescription>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search file..."
                className="pl-8 h-9 text-xs w-[200px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-9 text-xs w-[140px]">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Owners</SelectItem>
                {owners.map(owner => (
                  <SelectItem key={owner} value={owner} className="text-xs capitalize">
                    {owner}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2 border-l pl-3">
              <div className="text-right">
                <p className="text-[9px] font-bold text-muted-foreground uppercase leading-none">Total Rows</p>
                <p className="text-sm font-mono font-bold">{totals.total}</p>
              </div>
              <div className="text-right border-l pl-3">
                <p className="text-[9px] font-bold text-emerald-600 uppercase leading-none">Imported</p>
                <p className="text-sm font-mono font-bold text-emerald-600">{totals.imported}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No import history found.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] font-bold uppercase cursor-pointer hover:text-indigo-600" onClick={() => toggleSort('fileName')}>
                      <div className="flex items-center gap-1">
                        File Name
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase cursor-pointer hover:text-indigo-600" onClick={() => toggleSort('owner')}>
                      <div className="flex items-center gap-1">
                        Owner
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase cursor-pointer hover:text-indigo-600" onClick={() => toggleSort('processedDate')}>
                      <div className="flex items-center gap-1">
                        Processed Date
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-right cursor-pointer hover:text-indigo-600" onClick={() => toggleSort('totalTransactions')}>
                      <div className="flex items-center justify-end gap-1">
                        Total Rows
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-right">Imported</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-right">Skipped</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                        No files match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((item, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-medium max-w-[200px] truncate" title={item.fileName}>
                          {item.fileName}
                        </TableCell>
                        <TableCell className="text-[10px] capitalize font-semibold text-indigo-600">
                          {item.owner}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono">
                          {format(parseISO(item.processedDate), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right">
                          {item.totalTransactions}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right text-emerald-600 font-bold">
                          {item.importedTransactions}
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right text-amber-600 font-bold">
                          {item.notImportedTransactions}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteClick(item)}
                            disabled={isDeleting || (isDeleteDialogOpen && deletingFile?.fileName !== item.fileName)}
                          >
                            {deletingFile?.fileName === item.fileName && isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        if (!open) handleCancelDelete();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Statement File</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-bold text-foreground">{deletingFile?.fileName}</span>? 
              This action will trigger a full data reset and re-process all remaining files to maintain ledger integrity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDelete}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Remove and Reprocess</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isLogsModalOpen} onOpenChange={setIsLogsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{isScanning ? "Scanning Folder" : "Reprocessing Ledger"}</DialogTitle>
            <DialogDescription>
              {isScanning 
                ? "Searching for new CSV files and importing them." 
                : "Processing all statement files to ensure data consistency and integrity."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex-1 overflow-auto bg-slate-950 rounded-md p-4">
            <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap">
              {reprocessingLogs}
              {!reprocessingLogs.includes("Done.") && !reprocessingLogs.includes("ERROR:") && (
                <span className="animate-pulse">...</span>
              )}
            </pre>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="secondary" onClick={() => setIsLogsModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
