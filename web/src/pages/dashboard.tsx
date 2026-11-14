import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Clock, KeyRound, Server, ShieldHalf } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { StatsCards } from '@/components/stats-cards'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTpm } from '@/contexts/tpm-context'
import type { DataTableFeatures } from '@/lib/data-table'
import type { SslCheck } from '@/lib/types'

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

export function DashboardPage() {
  const { status, hosts, resolvers, sslChecks, certs, error } = useTpm()

  const columns = useMemo<ColumnDef<DataTableFeatures, SslCheck>[]>(
    () => [
      {
        accessorKey: 'domain',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Domain" />,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.domain}</span>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        accessorKey: 'expires_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.expires_at
              ? new Date(row.original.expires_at).toLocaleString()
              : row.original.error || '—'}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Hosts', value: hosts.length, icon: Server },
          { label: 'Resolvers', value: resolvers.length, icon: KeyRound },
          {
            label: 'Secrets key',
            value: status?.secrets_configured ? 'set' : 'missing',
            icon: ShieldHalf,
            tone: status?.secrets_configured ? 'success' : 'danger',
          },
          {
            label: 'Uptime',
            value: formatUptime(status?.uptime_seconds ?? 0),
            icon: Clock,
            hint: `${certs.length} certs`,
          },
        ]}
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Domain SSL</CardTitle>
          <CardDescription>Latest certificate posture from the SSL checker</CardDescription>
        </CardHeader>
        <CardContent>
          <CrudDataTable
            data={sslChecks}
            columns={columns}
            searchKey="domain"
            searchPlaceholder="Search domains…"
          />
        </CardContent>
      </Card>
    </div>
  )
}
