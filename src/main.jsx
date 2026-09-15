import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import './styles/light-theme.css'
import ResultDialog from './components/ResultDialog.jsx'

// Configure QueryClient with defaults for "instant" feel
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes fresh time
      gcTime: 1000 * 60 * 30,    // 30 minutes cache time
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ResultDialog />
    </QueryClientProvider>
  </StrictMode>,
)
