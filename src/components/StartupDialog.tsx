import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Upload, Database, CheckCircle2 } from "lucide-react";
import { selectDirectory, selectZipFile, setExportPath, restoreBackup } from "@/lib/api";
import { toast } from "sonner";

interface StartupDialogProps {
  open: boolean;
  onConfigured: () => void;
}

export function StartupDialog({ open, onConfigured }: StartupDialogProps) {
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  const handleSave = async () => {
    if (!path) {
      toast.error("Please select an export folder");
      return;
    }
    setSaving(true);
    const result = await setExportPath(path);
    setSaving(false);
    if (result.success) {
      toast.success("Configuration saved");
      onConfigured();
    } else {
      toast.error(result.error || "Failed to save configuration");
    }
  };

  const handleImportBackup = async () => {
    try {
      const zipPath = await selectZipFile();
      if (!zipPath) return;

      setRestoring(true);
      const result = await restoreBackup(zipPath);
      setRestoring(false);

      if (result.success) {
        toast.success("Backup restored successfully. Please configure your export folder to continue.");
      } else {
        toast.error(result.error || "Failed to restore backup");
      }
    } catch (error) {
      setRestoring(false);
      toast.error("An error occurred during restoration");
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent 
        className="sm:max-w-[500px]" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Database className="h-6 w-6 text-indigo-600" />
            Welcome to MondayMoney
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            To get started, we need to configure where your backups will be stored.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-6">
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Upload className="h-4 w-4 text-indigo-600" />
              Have an existing backup?
            </h4>
            <p className="text-xs text-muted-foreground mb-4">
              If you have previously exported your data as a .zip file, you can restore it now.
            </p>
            <Button 
              variant="outline" 
              className="w-full border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              onClick={handleImportBackup}
              disabled={restoring || saving}
            >
              {restoring ? "Restoring..." : "Import .zip Backup"}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="path" className="text-sm font-medium">
              Export Folder Path
            </label>
            <div className="flex gap-2">
              <Input
                id="path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Backups\MondayMoney"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse} disabled={saving || restoring}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded border border-dashed">
              <strong>Note:</strong> Your transaction data is stored safely within the application. 
              This folder is only used for exporting .zip backups.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleSave} 
            disabled={saving || !path || restoring}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 h-11"
          >
            {saving ? "Saving..." : (
              <>
                Get Started
                <CheckCircle2 className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
