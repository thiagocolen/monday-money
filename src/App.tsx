import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Layout } from './components/Layout'
import { TransactionsPage } from './pages/TransactionsPage'
import { InvestmentsPage } from './pages/InvestmentsPage'
import { ImportPage } from './pages/ImportPage'
import BackupPage from './pages/BackupPage'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { useEffect, useState } from 'react'
import { fetchSettings } from './lib/api'
import { StartupDialog } from './components/StartupDialog'

const router = createMemoryRouter([
  {
    path: '/',
    element: (
      <Layout>
        <Outlet />
      </Layout>
    ),
    children: [
      {
        index: true,
        element: <TransactionsPage />,
      },
      {
        path: 'investments',
        element: <InvestmentsPage />,
      },
      {
        path: 'import',
        element: <ImportPage />,
      },
      {
        path: 'backup',
        element: <BackupPage />,
      },
    ],
  },
], {
  initialEntries: ['/'],
  initialIndex: 0,
})

function App() {
  const [showStartup, setShowStartup] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      const settings = await fetchSettings();
      if (!settings.exportPath) {
        setShowStartup(true);
      }
      setIsReady(true);
    }
    checkSetup();
  }, []);

  if (!isReady) return null;

  return (
    <ThemeProvider defaultTheme="system" storageKey="monday-money-theme">
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
        <StartupDialog 
          open={showStartup} 
          onConfigured={() => {
            setShowStartup(false);
            window.location.reload();
          }} 
        />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
