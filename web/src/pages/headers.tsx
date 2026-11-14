import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Heading, Plus } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { RowActions } from '@/components/data-table/row-actions'
import { NativeSelect } from '@/components/native-select'
import { StatsCards } from '@/components/stats-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'
import type { DataTableFeatures } from '@/lib/data-table'
import type { HeaderRule } from '@/lib/types'

function AddHeaderDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('response_add')
  const [headerName, setHeaderName] = useState('')
  const [headerValue, setHeaderValue] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/v1/headers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type,
          header_name: headerName,
          header_value: headerValue,
          enabled: true,
        }),
      })
      setName('')
      setHeaderName('')
      setHeaderValue('')
      setType('response_add')
      setOpen(false)
      await onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add rule
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add header rule</DialogTitle>
          <DialogDescription>Shared Traefik headers middleware — attach on hosts.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hdr-name">Name *</FieldLabel>
              <Input id="hdr-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="hdr-type">Type</FieldLabel>
                <NativeSelect id="hdr-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="request_add">request add</option>
                  <option value="request_remove">request remove</option>
                  <option value="response_add">response add</option>
                  <option value="response_remove">response remove</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="hdr-header">Header *</FieldLabel>
                <Input
                  id="hdr-header"
                  placeholder="X-Frame-Options"
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="hdr-value">Value</FieldLabel>
              <Input
                id="hdr-value"
                placeholder="empty for remove"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Plus data-icon="inline-start" />
              Create rule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function HeadersPage() {
  const { headerRules, refreshAll } = useTpm()

  const columns = useMemo<ColumnDef<DataTableFeatures, HeaderRule>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
      },
      {
        accessorKey: 'header_name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Header" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.header_name}
            {row.original.header_value ? `=${row.original.header_value}` : ''}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            id={row.original.id}
            onDelete={async () => {
              await api(`/api/v1/headers/${row.original.id}`, { method: 'DELETE' })
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
          { label: 'Rules', value: headerRules.length, icon: Heading },
          {
            label: 'Request',
            value: headerRules.filter((h) => h.type.startsWith('request_')).length,
            icon: Heading,
          },
          {
            label: 'Response',
            value: headerRules.filter((h) => h.type.startsWith('response_')).length,
            icon: Heading,
          },
          {
            label: 'Enabled',
            value: headerRules.filter((h) => h.enabled).length,
            icon: Heading,
            tone: 'success',
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Header rules</CardTitle>
          <CardDescription>View and manage shared header middlewares</CardDescription>
        </CardHeader>
        <CardContent>
          <CrudDataTable
            data={headerRules}
            columns={columns}
            searchKey="name"
            searchPlaceholder="Search rules…"
            toolbarRight={<AddHeaderDialog onCreated={refreshAll} />}
          />
        </CardContent>
      </Card>
    </div>
  )
}
