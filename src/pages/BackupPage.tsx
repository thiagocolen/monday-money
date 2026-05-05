import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { 
  FolderOpen, 
  Download, 
  Trash2, 
  AlertTriangle, 
  Clock, 
  FileArchive,
  ArrowRight
} from "lucide-react";
import { 
  fetchSettings, 
  selectDirectory, 
  setExportPath, 
  fullBackup, 
  resetApplication, 
  fetchBackupInfo 
} from "@/lib/api";
import { toast } from "sonner";
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
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function BackupPage() {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ count: number; latestDate: string | null }>({ count: 0, latestDate: null });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [settings, info] = await Promise.all([fetchSettings(), fetchBackupInfo()]);
      if (settings.exportPath) {
        setPath(settings.exportPath);
      }
      setBackupInfo(info);
      setLoading(false);
    }
    loadData();
  }, []);

  const handleBrowse = async () => {
    try {
      const selectedPath = await selectDirectory();
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (error) {
      toast.error("Failed to open folder picker");
    }
  };

  const handleSavePath = async () => {
    if (!path) {
      toast.error("Please select a folder path");
      return;
    }
    setSaving(true);
    const result = await setExportPath(path);
    setSaving(false);
    if (result.success) {
      toast.success("Export path updated successfully");
      const info = await fetchBackupInfo();
      setBackupInfo(info);
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
      const info = await fetchBackupInfo();
      setBackupInfo(info);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-lg font-medium animate-pulse">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto space-y-8 py-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Data Management</h2>
        <p className="text-muted-foreground">
          Configure your backup settings and manage your application data.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Path Configuration */}
        <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-indigo-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-indigo-600" />
              Export Location
            </CardTitle>
            <CardDescription>
              Choose where your .zip backups will be stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="flex flex-col gap-2">
              <label htmlFor="path" className="text-sm font-medium">
                Backup Folder Path
              </label>
              <div className="flex gap-2">
                <Input
                  id="path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="C:\Backups\MondayMoney"
                  className="flex-1 font-mono text-[11px]"
                />
                <Button variant="outline" size="icon" onClick={handleBrowse} disabled={saving}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 border-t py-3">
            <Button 
              onClick={handleSavePath} 
              disabled={saving || !path} 
              className="ml-auto bg-indigo-600 hover:bg-indigo-700 h-9 px-4"
            >
              {saving ? "Saving..." : "Update Path"}
            </Button>
          </CardFooter>
        </Card>

        {/* Backup Stats */}
        <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1 bg-indigo-400" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500" />
              Backup Status
            </CardTitle>
            <CardDescription>
              Overview of your exported data files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-dashed">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Backups</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono">{backupInfo.count}</span>
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-none">
                    Files found
                  </Badge>
                </div>
              </div>
              <FileArchive className="h-8 w-8 text-indigo-200 dark:text-indigo-800" />
            </div>

            {backupInfo.latestDate ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Exported</p>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">
                      {format(parseISO(backupInfo.latestDate), "PPPP")}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {format(parseISO(backupInfo.latestDate), "pp")}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground italic">No backups found in the export path.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full Export Action */}
        <Card className="border-emerald-100 dark:border-emerald-900/40 shadow-sm overflow-hidden md:col-span-2">
          <div className="h-1 bg-emerald-500" />
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1 flex-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Download className="h-5 w-5 text-emerald-600" />
                  Full System Export
                </h3>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Create a complete .zip archive of all your transactions, categories, and settings. 
                  This file can be used to restore your data on another machine or after a reset.
                </p>
              </div>
              <Button 
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[200px] h-14 text-md font-bold gap-3 shadow-md"
                onClick={handleExport}
                disabled={exporting || !path}
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

        {/* Danger Zone */}
        <Card className="border-red-100 dark:border-red-900/40 bg-red-50/10 dark:bg-red-950/5 shadow-sm overflow-hidden md:col-span-2">
          <div className="h-1 bg-red-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions that affect your entire application data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-4 border border-red-200 dark:border-red-900/50 rounded-lg bg-red-50/50 dark:bg-red-900/10">
              <div className="space-y-1">
                <h4 className="font-bold text-red-900 dark:text-red-200">Reset Application Data</h4>
                <p className="text-xs text-red-700/70 dark:text-red-400/70">
                  This will permanently delete all transactions, categories, and configuration. 
                  Make sure you have a backup before proceeding.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="font-bold gap-2">
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
      </div>
    </div>
  );
}
