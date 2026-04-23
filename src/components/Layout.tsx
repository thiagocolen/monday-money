import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentPath = location.pathname;

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
