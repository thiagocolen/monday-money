import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentPath = location.pathname;

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
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="container mx-auto py-6 px-4">
        {children}
      </main>
      <div style={{ height: '500px' }} />
    </div>
  );
}
