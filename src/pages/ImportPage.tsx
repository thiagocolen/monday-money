import { useState, useEffect, useCallback, useMemo } from "react"
import { fetchOwners, importFile, fetchImportHistory, deleteImport } from "../lib/api"
import type { ImportHistory } from "../lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"

export function ImportPage() {
  const [owners, setOwners] = useState<string[]>([])
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [selectedOwner, setSelectedOwner] = useState<string>("")
  const [isNewOwner, setIsNewOwner] = useState(false)
  const [newOwnerName, setNewOwnerName] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [deletingFile, setDeletingFile] = useState<ImportHistory | null>(null)
  const [isDeleteDialogOpen, setIsDeleteOpen] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [reprocessingLogs, setReprocessingLogs] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [ownersData, historyData] = await Promise.all([
        fetchOwners(),
        fetchImportHistory()
      ])
      setOwners(ownersData)
      setHistory(historyData)
    } catch (error) {
      toast.error("Failed to load data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totals = useMemo(() => {
    return history.reduce((acc, curr) => ({
      total: acc.total + curr.totalTransactions,
      imported: acc.imported + curr.importedTransactions,
      skipped: acc.skipped + curr.notImportedTransactions
    }), { total: 0, imported: 0, skipped: 0 })
  }, [history])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(e.target.files)
    }
  }

  const handleDeleteClick = (item: ImportHistory) => {
    setDeletingFile(item)
    setIsDeleteOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingFile) return

    const { owner, fileName } = deletingFile
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
      setDeletingFile(null)
    }
  }

  const handleImport = async () => {
    const ownerToUse = isNewOwner ? newOwnerName.trim() : selectedOwner
    
    if (!ownerToUse || !selectedFiles || selectedFiles.length === 0) {
      toast.error("Please select an owner and at least one file")
      return
    }

    setIsImporting(true)
    let successCount = 0
    let failCount = 0

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        
        // Security check: validate extension
        if (!file.name.toLowerCase().endsWith('.csv')) {
          toast.error(`File ${file.name} is not a CSV. Skipping.`)
          failCount++
          continue
        }

        // Security check: limit file size (e.g., 10MB)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large (>10MB). Skipping.`)
          failCount++
          continue
        }

        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.onerror = reject
          reader.readAsText(file)
        })

        const result = await importFile(ownerToUse, file.name, content)
        
        if (result.success) {
          successCount++
        } else {
          toast.error(`Failed to import ${file.name}: ${result.error}`)
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully imported and processed ${successCount} files.`)
        setSelectedFiles(null)
        setNewOwnerName("")
        setIsNewOwner(false)
        const fileInput = document.getElementById('file-upload') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        loadData()
      }
    } catch (error) {
      toast.error("An error occurred during import.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import Statement Files</h2>
        <p className="text-muted-foreground">
          Upload raw CSV statement files to be processed and added to your ledger.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import New File
            </CardTitle>
            <CardDescription>Select owner and file to upload</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Owner</label>
                <button 
                  onClick={() => setIsNewOwner(!isNewOwner)}
                  className="text-[9px] font-bold text-indigo-600 uppercase hover:underline"
                >
                  {isNewOwner ? "Choose Existing" : "Create New"}
                </button>
              </div>
              
              {isNewOwner ? (
                <Input 
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="e.g. jessica-account"
                  className="h-9 text-xs font-mono"
                  autoFocus
                />
              ) : (
                <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map(owner => (
                      <SelectItem key={owner} value={owner} className="text-xs capitalize">
                        {owner}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">CSV Files</label>
              <Input 
                id="file-upload"
                type="file" 
                accept=".csv" 
                multiple
                onChange={handleFileChange}
                className="h-9 text-xs cursor-pointer file:text-xs file:font-medium"
              />
              {selectedFiles && selectedFiles.length > 0 && (
                <div className="text-[9px] text-muted-foreground font-mono mt-1">
                  {selectedFiles.length} file(s) selected
                </div>
              )}
            </div>

            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700 h-9 text-xs" 
              onClick={handleImport}
              disabled={isImporting || !(isNewOwner ? newOwnerName.trim() : selectedOwner) || !selectedFiles || selectedFiles.length === 0}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Import ${selectedFiles?.length || ''} File(s)`
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Import Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3 text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Files must be in CSV format and match known bank statement patterns.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Duplicate files (same name in protected storage) will be rejected.</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
              <p>Content already present in the ledger (matched by hash) will not be uploaded.</p>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />
              <p>Importing will trigger a full data reset and reload process to maintain integrity.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-600">Import History</CardTitle>
            <CardDescription>Recently processed statement files</CardDescription>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-none">Total Rows</p>
              <p className="text-lg font-mono font-bold">{totals.total}</p>
            </div>
            <div className="text-right border-l pl-4">
              <p className="text-[10px] font-bold text-emerald-600 uppercase leading-none">Imported</p>
              <p className="text-lg font-mono font-bold text-emerald-600">{totals.imported}</p>
            </div>
            <div className="text-right border-l pl-4">
              <p className="text-[10px] font-bold text-amber-600 uppercase leading-none">Skipped</p>
              <p className="text-lg font-mono font-bold text-amber-600">{totals.skipped}</p>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[10px] font-bold uppercase">File Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Owner</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase">Processed Date</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase text-right">Total Rows</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase text-right">Imported</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase text-right">Skipped</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item, i) => (
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
                        disabled={!!deletingFile}
                      >
                        {deletingFile?.fileName === item.fileName ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Statement File</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-bold text-foreground">{deletingFile?.fileName}</span>? 
              This action will trigger a full data reset and re-process all remaining files to maintain ledger integrity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Remove and Reprocess</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isLogsModalOpen} onOpenChange={setIsLogsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Reprocessing Ledger</DialogTitle>
            <DialogDescription>
              Processing all statement files to ensure data consistency and integrity.
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
