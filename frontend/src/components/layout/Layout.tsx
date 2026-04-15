import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { useNextSession } from '../../hooks/useNextSession'

export function Layout() {
  const { data } = useNextSession()

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        trackTimezone={data?.race?.timezone}
        trackCity={data?.race?.city}
      />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
