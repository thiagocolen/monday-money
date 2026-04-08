import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Layout } from './components/Layout'
import { TransactionsPage } from './pages/TransactionsPage'
import { InvestmentsPage } from './pages/InvestmentsPage'
import { ImportPage } from './pages/ImportPage'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="monday-money-theme">
      <TooltipProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<TransactionsPage />} />
              <Route path="/investments" element={<InvestmentsPage />} />
              <Route path="/import" element={<ImportPage />} />
            </Routes>
          </Layout>
        </Router>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
