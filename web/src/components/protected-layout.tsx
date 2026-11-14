import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AppLayout } from '@/components/layouts/app-layout'
import { pageMeta } from '@/config/nav'
import { useTpm } from '@/contexts/tpm-context'

const titles: Record<string, { title: string; description: string }> = {
  '/dashboard': pageMeta.dashboard,
  '/hosts': pageMeta.hosts,
  '/redirections': pageMeta.redirections,
  '/parked-hosts': pageMeta.deadHosts,
  '/access-lists': pageMeta.accessLists,
  '/streams': pageMeta.streams,
  '/ssl': pageMeta.ssl,
  '/headers': pageMeta.headers,
  '/waf': pageMeta.waf,
  '/access-log': pageMeta.accessLog,
  '/backups': pageMeta.backups,
  '/audit': pageMeta.audit,
  '/settings': pageMeta.settings,
}

export function ProtectedLayout() {
  const { status, loading } = useTpm()
  const location = useLocation()

  if (loading || !status) {
    return (
      <div className="text-muted-foreground grid min-h-screen place-items-center text-sm">
        Booting control plane…
      </div>
    )
  }

  if (status.setup_required || !status.authenticated) {
    return <Navigate to="/auth" replace />
  }

  const meta = titles[location.pathname] ?? pageMeta.dashboard

  return (
    <AppLayout title={meta.title} description={meta.description}>
      <Outlet />
    </AppLayout>
  )
}
