import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useState } from "react";
import { Command, FolderCog } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SettingsDialog } from "./SettingsDialog";
import { fetchSettings } from "@/lib/api";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [forceSettingsOpen, setForceSettingsOpen] = useState(false);

  // Scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check if first start
  useEffect(() => {
    async function checkFirstStart() {
      const settings = await fetchSettings();
      if (!settings.coreDirPath) {
        setForceSettingsOpen(true);
      }
    }
    checkFirstStart();
  }, []);

  // Global drag/drop prevention for Electron to prevent navigation
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      // If we are on the import page, we want to let the specific drop zone handle it
      // but if the drop happens elsewhere on the window, we prevent it.
      e.preventDefault();
    };

    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const navItems = [
    { name: "Transactions", path: "." },
    { name: "Investments", path: "investments" },
    { name: "Import", path: "import" },
  ];

  const isPathActive = (itemPath: string) => {
    if (itemPath === "." || itemPath === "/") {
      return currentPath === "/";
    }
    const normalizedItemPath = itemPath.startsWith("/") ? itemPath : `/${itemPath}`;
    return currentPath === normalizedItemPath || currentPath.startsWith(normalizedItemPath);
  };

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6 md:gap-10">
            <Link to="." className="flex items-center space-x-2">
              <span className="inline-block font-bold text-xl">Monday Money</span>
            </Link>
            <nav className="flex gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-primary",
                    isPathActive(item.path) && "text-primary border-b-2 border-primary h-14"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
                >
                  <FolderCog className="h-4 w-4 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Configure Data Folder</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted cursor-help transition-colors">
                  <Command className="h-4 w-4 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="p-3">
                <div className="space-y-2">
                  <p className="text-xs font-bold border-b pb-1 mb-1">Keyboard Shortcuts</p>
                  <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1.5 text-[10px]">
                    <kbd className="px-1.5 py-0.5 bg-background text-foreground rounded border border-input text-center font-sans font-bold shadow-sm">ESC</kbd>
                    <span className="text-muted-foreground self-center">Unselect all & clear filters</span>
                    
                    <kbd className="px-1.5 py-0.5 bg-background text-foreground rounded border border-input text-center font-sans font-bold shadow-sm">A</kbd>
                    <span className="text-muted-foreground self-center">Select all transactions</span>
                    
                    <kbd className="px-1.5 py-0.5 bg-background text-foreground rounded border border-input text-center font-sans font-bold shadow-sm">B</kbd>
                    <span className="text-muted-foreground self-center">Open bulk edit dialog</span>
                    
                    <kbd className="px-1.5 py-0.5 bg-background text-foreground rounded border border-input text-center font-sans font-bold shadow-sm">ESC</kbd>
                    <span className="text-muted-foreground self-center">Close dialog (when open)</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="container mx-auto py-6 px-4">
        {children}
      </main>
      <SettingsDialog 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen} 
        forceOpen={forceSettingsOpen} 
      />
      <div style={{ height: '500px' }} />
    </div>
  );
}
