import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ScrollText } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { StatsCards } from '@/components/stats-cards'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTpm } from '@/contexts/tpm-context'
import type { DataTableFeatures } from '@/lib/data-table'
import type { AuditEntry } from '@/lib/types'

export function AuditPage() {
  const { auditLog } = useTpm()

  const columns = useMemo<ColumnDef<DataTableFeatures, AuditEntry>[]>(
    () => [
      {
        accessorKey: 'at',
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap">
            {new Date(row.original.at).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'actor',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Actor" />,
      },
      {
        accessorKey: 'action',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
      },
      {
        accessorKey: 'entity',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Entity" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.entity}
            {row.original.entity_id ? `/${row.original.entity_id.slice(0, 8)}` : ''}
          </span>
        ),
      },
      {
        accessorKey: 'summary',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Summary" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">{row.original.summary}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Entries', value: auditLog.length, icon: ScrollText },
          {
            label: 'Creates',
            value: auditLog.filter((a) => a.action === 'create').length,
            icon: ScrollText,
          },
          {
            label: 'Deletes',
            value: auditLog.filter((a) => a.action === 'delete').length,
            icon: ScrollText,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Admin mutations (latest 200). Login/logout are not recorded.</CardDescription>
        </CardHeader>
        <CardContent>
          <CrudDataTable columns={columns} data={auditLog} searchKey="summary" />
        </CardContent>
      </Card>
    </div>
  )
}
