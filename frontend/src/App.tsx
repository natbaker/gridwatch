import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SeasonProvider } from './hooks/useSeason'
import { Layout } from './components/layout/Layout'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const SessionPage = lazy(() => import('./pages/SessionPage').then(m => ({ default: m.SessionPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SeasonProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="max-w-[1280px] mx-auto px-5 py-12"><div className="h-64 bg-bg-elevated animate-pulse rounded-xl" /></div>}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/race/:round" element={<SessionPage />} />
              <Route path="/live" element={<SessionPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
      </SeasonProvider>
    </QueryClientProvider>
  )
}
