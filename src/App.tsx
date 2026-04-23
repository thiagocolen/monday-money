import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Layout } from './components/Layout'
import { TransactionsPage } from './pages/TransactionsPage'
import { InvestmentsPage } from './pages/InvestmentsPage'
import { ImportPage } from './pages/ImportPage'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'

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
    ],
  },
], {
  initialEntries: ['/'],
  initialIndex: 0,
})

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="monday-money-theme">
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
