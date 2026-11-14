import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { ProtectedLayout } from '@/components/protected-layout'
import { TpmProvider } from '@/contexts/tpm-context'
import { AccessListsPage } from '@/pages/access-lists'
import { AccessLogPage } from '@/pages/access-log'
import { AuditPage } from '@/pages/audit'
import { AuthPage } from '@/pages/auth'
import { BackupsPage } from '@/pages/backups'
import { DashboardPage } from '@/pages/dashboard'
import { DeadHostsPage } from '@/pages/dead-hosts'
import { HeadersPage } from '@/pages/headers'
import { HostsPage } from '@/pages/hosts'
import { RedirectionsPage } from '@/pages/redirections'
import { SettingsPage } from '@/pages/settings'
import { SslPage } from '@/pages/ssl'
import { StreamsPage } from '@/pages/streams'
import { WafPage } from '@/pages/waf'

const router = createBrowserRouter([
  { path: '/auth', element: <AuthPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/hosts', element: <HostsPage /> },
      { path: '/redirections', element: <RedirectionsPage /> },
      { path: '/parked-hosts', element: <DeadHostsPage /> },
      { path: '/access-lists', element: <AccessListsPage /> },
      { path: '/streams', element: <StreamsPage /> },
      { path: '/ssl', element: <SslPage /> },
      { path: '/headers', element: <HeadersPage /> },
      { path: '/waf', element: <WafPage /> },
      { path: '/access-log', element: <AccessLogPage /> },
      { path: '/backups', element: <BackupsPage /> },
      { path: '/audit', element: <AuditPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="tpm-ui-theme">
      <TpmProvider>
        <Toaster>
          <RouterProvider router={router} />
        </Toaster>
      </TpmProvider>
    </ThemeProvider>
  )
}
