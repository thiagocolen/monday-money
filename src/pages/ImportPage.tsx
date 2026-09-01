import { useState, useEffect, useCallback, useMemo } from "react"
import { fetchImportHistory, fetchRawCsvFolderPath, setRawCsvFolderPath, scanFolder, selectDirectory, fetchSettings, setExportPath, fullBackup, resetApplication } from "../lib/api"
import type { ImportHistory } from "../lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileText, CheckCircle2, AlertCircle, Loader2, Trash2, FolderOpen, RefreshCw, Search, ArrowUpDown, Download, AlertTriangle, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
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
} from "@/components/ui/alert-dialog";

type SortField = 'fileName' | 'owner' | 'processedDate' | 'totalTransactions';
type SortOrder = 'asc' | 'desc';

export function ImportPage() {
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [rawFolderPath, setRawFolderPath] = useState<string>("")
  const [isScanning, setIsScanning] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [reprocessingLogs, setReprocessingLogs] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  
  const [exportPathVal, setExportPathVal] = useState("");
  const [savingExport, setSavingExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Filters and Sorting
  const [searchQuery, setSearchQuery] = useState("")
  const [ownerFilter, setOwnerFilter] = useState("all")
  const [sortField, setSortField] = useState<SortField>('processedDate')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [historyData, path, settings] = await Promise.all([
        fetchImportHistory(),
        fetchRawCsvFolderPath(),
        fetchSettings()
      ])
      setHistory(historyData)
      setRawFolderPath(path)
      if (settings.exportPath) {
        setExportPathVal(settings.exportPath)
      }
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



  const handleBrowseExport = async () => {
    try {
      const selectedPath = await selectDirectory();
      if (selectedPath) {
        setExportPathVal(selectedPath);
      }
    } catch (error) {
      toast.error("Failed to open folder picker");
    }
  };

  const handleSaveExportPath = async () => {
    if (!exportPathVal) {
      toast.error("Please select a folder path");
      return;
    }
    setSavingExport(true);
    const result = await setExportPath(exportPathVal);
    setSavingExport(false);
    if (result.success) {
      toast.success("Export path updated successfully");
    } else {
      toast.error(result.error || "Failed to save settings");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const result = await fullBackup();
    setExporting(false);
    if (result.success) {
      toast.success(`Backup created: ${result.fileName}`);
    } else {
      toast.error(result.error || "Failed to create backup");
    }
  };

  const handleReset = async () => {
    const result = await resetApplication();
    if (result.success) {
      toast.success("Application data reset successfully");
      window.location.reload();
    } else {
      toast.error(result.error || "Failed to reset application");
    }
  };

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
        <h2 className="text-2xl font-bold tracking-tight">Import Export</h2>
        <p className="text-muted-foreground">
          Automate transaction imports and manage your data backups.
        </p>
      </div>

      {/* Row 1: How it works (1 col) */}
      <Card>
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

      {/* Row 2: Import Folder | Export Folder (2 cols) */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Import Folder
            </CardTitle>
            <CardDescription>Path where statement files are stored</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
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
          </CardContent>
          <CardFooter className="bg-muted/30 border-t py-3 mt-auto">
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
          </CardFooter>
        </Card>

        <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-indigo-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-600">
              <FolderOpen className="h-5 w-5 text-indigo-600" />
              Export Folder
            </CardTitle>
            <CardDescription>
              Choose where your .zip backups will be stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="flex flex-col gap-2">
              <label htmlFor="path" className="text-[10px] font-bold text-muted-foreground uppercase">
                Backup Folder Path
              </label>
              <div className="flex gap-2">
                <Input
                  id="path"
                  value={exportPathVal}
                  onChange={(e) => setExportPathVal(e.target.value)}
                  placeholder="C:\Backups\MondayMoney"
                  className="flex-1 font-mono text-[11px]"
                />
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleBrowseExport} disabled={savingExport}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 border-t py-3 mt-auto">
            <Button 
              onClick={handleSaveExportPath} 
              disabled={savingExport || !exportPathVal} 
              className="ml-auto bg-indigo-600 hover:bg-indigo-700 h-9 px-4 text-xs"
            >
              {savingExport ? "Saving..." : "Update Path"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Row 3: Danger Zone | Full System Export */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-red-100 dark:border-red-900/40 bg-red-50/10 dark:bg-red-950/5 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-red-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your entire application data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex flex-col items-start justify-between gap-4 p-4 border border-red-200 dark:border-red-900/50 rounded-lg bg-red-50/50 dark:bg-red-900/10 h-full">
              <div className="space-y-1">
                <h4 className="font-bold text-red-900 dark:text-red-200">Reset Application Data</h4>
                <p className="text-xs text-red-700/70 dark:text-red-400/70">
                  This will permanently delete all transactions, categories, and configuration. 
                  Make sure you have a backup before proceeding.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="font-bold gap-2 mt-auto w-full">
                    <Trash2 className="h-4 w-4" />
                    Reset App
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-red-200 dark:border-red-900">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Total Data Destruction
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-foreground">
                      This action <strong>cannot be undone</strong>. All your imported files, 
                      transaction history, and custom categories will be permanently deleted.
                      <br /><br />
                      Are you absolutely sure you want to reset MondayMoney?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleReset}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold"
                    >
                      Yes, Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 dark:border-emerald-900/40 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-emerald-500" />
          <CardContent className="pt-6 flex flex-col flex-1">
            <div className="flex flex-col space-y-4 h-full">
              <div className="space-y-1">
                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-emerald-600">
                  <Download className="h-5 w-5 text-emerald-600" />
                  Full System Export
                </h3>
                <p className="text-sm text-muted-foreground">
                  Create a complete .zip archive of all your transactions, categories, and settings. 
                  This file can be used to restore your data on another machine or after a reset.
                </p>
              </div>
              <Button 
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full h-14 text-md font-bold gap-3 shadow-md mt-auto"
                onClick={handleExport}
                disabled={exporting || !exportPathVal}
              >
                {exporting ? "Creating Zip..." : (
                  <>
                    Export All Data
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Import History */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
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
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


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
