import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { cn } from "@/lib/utils"

export function ImportPage() {
  const [owners, setOwners] = useState<string[]>([])
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [selectedOwner, setSelectedOwner] = useState<string>("")
  const [isNewOwner, setIsNewOwner] = useState(false)
  const [newOwnerName, setNewOwnerName] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [deletingFile, setDeletingFile] = useState<ImportHistory | null>(null)
  const [isDeleteDialogOpen, setIsDeleteOpen] = useState(false)
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [reprocessingLogs, setReprocessingLogs] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const dragCounter = useRef(0)

  const hasOwner = useMemo(() => {
    return isNewOwner ? newOwnerName.trim() !== "" : selectedOwner !== ""
  }, [isNewOwner, newOwnerName, selectedOwner])

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
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    
    // In Electron/Chrome, items/files might be empty during dragenter from OS
    // but types will contain 'Files'. We check for both cases for maximum compatibility.
    const types = e.dataTransfer.types
    const hasFiles = types && Array.from(types).some(type => 
      type === 'Files' || type === 'files' || type === 'application/x-moz-file'
    )
    
    if (hasFiles) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Always set dropEffect to copy to enable drop
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy"
    }
    
    if (!isDragging) {
      const types = e.dataTransfer.types
      const hasFiles = types && Array.from(types).some(type => 
        type === 'Files' || type === 'files' || type === 'application/x-moz-file'
      )
      if (hasFiles) setIsDragging(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0
    
    if (!hasOwner) {
      toast.error("Please select or create an owner first")
      return
    }

    // Extract files from dataTransfer
    let files: File[] = []
    
    if (e.dataTransfer.items) {
      // Use DataTransferItemList interface to access the file(s)
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          const file = e.dataTransfer.items[i].getAsFile()
          if (file) files.push(file)
        }
      }
    } else if (e.dataTransfer.files) {
      // Fallback to DataTransfer.files
      files = Array.from(e.dataTransfer.files)
    }

    if (files.length > 0) {
      const csvFiles = files.filter(file => file.name.toLowerCase().endsWith('.csv'))
      
      if (csvFiles.length === 0) {
        toast.error("Please drop only CSV files")
        return
      }
      
      if (csvFiles.length !== files.length) {
        toast.warning(`Only ${csvFiles.length} of ${files.length} files were CSV and will be imported`)
      }

      // Set the selected files
      setSelectedFiles(csvFiles)
      
      // Update the input element for consistency using DataTransfer
      const fileInput = document.getElementById('file-upload') as HTMLInputElement
      if (fileInput) {
        try {
          const dt = new DataTransfer()
          csvFiles.forEach(file => dt.items.add(file))
          fileInput.files = dt.files
        } catch (err) {
          // This can fail in some restricted environments but we already have files in state
          console.error("Could not set files on input", err)
        }
      }
    } else {
      toast.error("No files detected in drop event")
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
        setSelectedFiles([])
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
              <div 
                className={cn(
                  "border-2 border-dashed rounded-md p-4 transition-all text-center flex flex-col items-center gap-2",
                  !hasOwner ? "opacity-50 border-muted-foreground/20" : "cursor-pointer border-muted-foreground/20 hover:border-indigo-600/50 hover:bg-muted/30",
                  hasOwner && isDragging && "border-indigo-600 bg-indigo-50/50 scale-[1.02]",
                  !hasOwner && isDragging && "border-amber-500 bg-amber-50/50 scale-[1.02]"
                )}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (hasOwner) {
                    document.getElementById('file-upload')?.click()
                  } else {
                    toast.error("Please select or create an owner first")
                  }
                }}
              >
                <Input 
                  id="file-upload"
                  type="file" 
                  accept=".csv" 
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={!hasOwner}
                />
                <Upload className={cn(
                  "h-8 w-8 transition-colors", 
                  isDragging ? (hasOwner ? "text-indigo-600" : "text-amber-500") : "text-muted-foreground/60"
                )} />
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase">
                    {!hasOwner 
                      ? (isDragging ? "Select owner first!" : "Select owner to enable upload") 
                      : (isDragging ? "Drop to upload" : "Click or drag CSV files here")}
                  </p>
                  {selectedFiles && selectedFiles.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-[9px] text-indigo-600 font-mono font-bold">
                        {selectedFiles.length} file(s) selected
                      </p>
                      <div className="max-h-[60px] overflow-y-auto px-2">
                        {Array.from(selectedFiles).slice(0, 3).map((f, idx) => (
                          <p key={idx} className="text-[8px] text-muted-foreground truncate max-w-[150px]">
                            {f.name}
                          </p>
                        ))}
                        {selectedFiles.length > 3 && (
                          <p className="text-[8px] text-muted-foreground italic">
                            + {selectedFiles.length - 3} more...
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground">
                      Only .csv files are supported
                    </p>
                  )}
                </div>
              </div>
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
                ))}
              </TableBody>
            </Table>
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
