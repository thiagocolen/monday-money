import { useState, useEffect } from "react";
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
import { FolderOpen, Settings } from "lucide-react";
import { fetchSettings, selectDirectory, setCoreDir } from "@/lib/api";
import { toast } from "sonner";

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  forceOpen?: boolean;
}

export function SettingsDialog({ open, onOpenChange, forceOpen }: SettingsDialogProps) {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      const settings = await fetchSettings();
      if (settings.coreDirPath) {
        setPath(settings.coreDirPath);
      }
      setLoading(false);
    }
    if (open || forceOpen) {
      loadSettings();
    }
  }, [open, forceOpen]);

  const handleBrowse = async () => {
    try {
      console.log("SettingsDialog: handleBrowse started");
      const selectedPath = await selectDirectory();
      console.log("SettingsDialog: selectedPath", selectedPath);
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (error) {
      console.error("SettingsDialog: Error in handleBrowse", error);
      toast.error("Failed to open folder picker");
    }
  };

  const handleSave = async () => {
    if (!path) {
      toast.error("Please select a folder path");
      return;
    }
    console.log("SettingsDialog: handleSave started", path);
    setSaving(true);
    const result = await setCoreDir(path);
    console.log("SettingsDialog: setCoreDir result", result);
    setSaving(false);
    if (result.success) {
      toast.success("Settings saved successfully");
      if (onOpenChange) onOpenChange(false);
      // Reload the app to re-initialize with new path
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toast.error(result.error || "Failed to save settings");
    }
  };

  return (
    <Dialog open={open || forceOpen} onOpenChange={forceOpen ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={forceOpen ? (e) => e.preventDefault() : undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Local Folder Configuration
          </DialogTitle>
          <DialogDescription>
            Specify the path for your <code>monday-money-core</code> data folder. 
            All your transactions and metadata will be stored here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="path" className="text-sm font-medium">
              Core Folder Path
            </label>
            <div className="flex gap-2">
              <Input
                id="path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\...\monday-money-core"
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse} disabled={saving}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              If the folder doesn't exist, it will be created with the initial data structure.
            </p>
          </div>
        </div>

        <DialogFooter>
          {!forceOpen && (
            <Button variant="ghost" onClick={() => onOpenChange?.(false)} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !path || loading}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
