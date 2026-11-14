import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldAlert } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { RowActions } from '@/components/data-table/row-actions'
import { StatsCards } from '@/components/stats-cards'
import { StatusPill } from '@/components/status-pill'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'
import type { DataTableFeatures } from '@/lib/data-table'
import type { WafProfile } from '@/lib/types'

export function WafPage() {
  const { wafProfiles, refreshAll } = useTpm()

  const columns = useMemo<ColumnDef<DataTableFeatures, WafProfile>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'kind',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.kind}</Badge>,
      },
      {
        id: 'enabled',
        accessorFn: (row) => (row.enabled ? 'enabled' : 'disabled'),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <StatusPill status={row.original.enabled ? 'enabled' : 'disabled'} />
        ),
      },
      {
        id: 'config',
        header: 'Config',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono line-clamp-1 max-w-[360px] text-xs">
            {JSON.stringify(row.original.config)}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            id={row.original.id}
            onDelete={async () => {
              await api(`/api/v1/waf/${row.original.id}`, { method: 'DELETE' })
              await refreshAll()
            }}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [refreshAll],
  )

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Profiles', value: wafProfiles.length, icon: ShieldAlert },
          {
            label: 'Enabled',
            value: wafProfiles.filter((w) => w.enabled).length,
            icon: ShieldAlert,
            tone: 'success',
          },
          {
            label: 'Kinds',
            value: new Set(wafProfiles.map((w) => w.kind)).size,
            icon: ShieldAlert,
          },
          {
            label: 'Disabled',
            value: wafProfiles.filter((w) => !w.enabled).length,
            icon: ShieldAlert,
            tone: wafProfiles.some((w) => !w.enabled) ? 'warning' : 'default',
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>WAF profiles</CardTitle>
          <CardDescription>Lean 5-pack seeded on first boot — attach on hosts</CardDescription>
        </CardHeader>
        <CardContent>
          <CrudDataTable
            data={wafProfiles}
            columns={columns}
            searchKey="name"
            searchPlaceholder="Search profiles…"
          />
        </CardContent>
      </Card>
    </div>
  )
}
