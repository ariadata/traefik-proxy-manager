import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ParkingCircle, Plus } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { RowActions } from '@/components/data-table/row-actions'
import { DomainTagsInput } from '@/components/domain-tags-input'
import { NativeSelect } from '@/components/native-select'
import { StatsCards } from '@/components/stats-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'
import type { DataTableFeatures } from '@/lib/data-table'
import type { DeadHost } from '@/lib/types'

type FormState = {
  domains: string[]
  statusCode: number
  bodyHtml: string
  certResolver: string
  sslForced: boolean
  accessListId: string
  enabled: boolean
}

const emptyForm = (): FormState => ({
  domains: [],
  statusCode: 404,
  bodyHtml: '',
  certResolver: '',
  sslForced: false,
  accessListId: '',
  enabled: true,
})

function formFromHost(host: DeadHost): FormState {
  return {
    domains: [...host.domain_names],
    statusCode: host.status_code,
    bodyHtml: host.body_html || '',
    certResolver: host.cert_resolver || '',
    sslForced: host.ssl_forced,
    accessListId: host.access_list_id || '',
    enabled: host.enabled,
  }
}

function payloadFromForm(form: FormState) {
  return {
    domain_names: form.domains,
    status_code: form.statusCode,
    body_html: form.bodyHtml,
    cert_resolver: form.certResolver,
    ssl_forced: form.sslForced,
    access_list_id: form.accessListId || null,
    enabled: form.enabled,
  }
}

function DeadFormFields({
  idPrefix,
  form,
  setForm,
  domainInvalid,
  setDomainInvalid,
}: {
  idPrefix: string
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  domainInvalid: boolean
  setDomainInvalid: (v: boolean) => void
}) {
  const { resolvers, accessLists } = useTpm()

  return (
    <FieldGroup>
      <Field data-invalid={domainInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-domains`}>Domains *</FieldLabel>
        <DomainTagsInput
          id={`${idPrefix}-domains`}
          value={form.domains}
          invalid={domainInvalid}
          placeholder="parked.example.com"
          onChange={(next) => {
            setForm((f) => ({ ...f, domains: next }))
            setDomainInvalid(next.length === 0)
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-code`}>HTTP status</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-code`}
            value={String(form.statusCode)}
            onChange={(e) => setForm((f) => ({ ...f, statusCode: Number(e.target.value) }))}
          >
            <option value="404">404</option>
            <option value="200">200</option>
            <option value="403">403</option>
            <option value="410">410</option>
            <option value="503">503</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-resolver`}>Cert resolver</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-resolver`}
            value={form.certResolver}
            onChange={(e) => setForm((f) => ({ ...f, certResolver: e.target.value }))}
          >
            <option value="">— none —</option>
            {resolvers.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-acl`}>Access list</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-acl`}
          value={form.accessListId}
          onChange={(e) => setForm((f) => ({ ...f, accessListId: e.target.value }))}
        >
          <option value="">— none —</option>
          {accessLists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-html`}>Custom HTML (optional)</FieldLabel>
        <textarea
          id={`${idPrefix}-html`}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-28 w-full rounded-lg border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          value={form.bodyHtml}
          onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
          placeholder="Leave empty for the default parked page"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.sslForced}
          onCheckedChange={(v) => setForm((f) => ({ ...f, sslForced: v === true }))}
        />
        Force HTTPS
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.enabled}
          onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v === true }))}
        />
        Enabled
      </label>
    </FieldGroup>
  )
}

function AddDeadDialog({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [domainInvalid, setDomainInvalid] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.domains.length === 0) {
      setDomainInvalid(true)
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/dead-hosts', {
        method: 'POST',
        body: JSON.stringify(payloadFromForm(form)),
      })
      setForm(emptyForm())
      setOpen(false)
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add parked host
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add parked host</DialogTitle>
          <DialogDescription>
            Reserve domains on a static page served by TPM (via Traefik).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DeadFormFields
            idPrefix="add-dead"
            form={form}
            setForm={setForm}
            domainInvalid={domainInvalid}
            setDomainInvalid={setDomainInvalid}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditDeadDialog({
  host,
  open,
  onOpenChange,
  onSaved,
}: {
  host: DeadHost | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [domainInvalid, setDomainInvalid] = useState(false)

  useEffect(() => {
    if (host && open) {
      setForm(formFromHost(host))
      setDomainInvalid(false)
    }
  }, [host, open])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!host) return
    if (form.domains.length === 0) {
      setDomainInvalid(true)
      return
    }
    setBusy(true)
    try {
      await api(`/api/v1/dead-hosts/${host.id}`, {
        method: 'PUT',
        body: JSON.stringify(payloadFromForm(form)),
      })
      onOpenChange(false)
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit parked host</DialogTitle>
          <DialogDescription>Updates Traefik YAML and the parked page body.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DeadFormFields
            idPrefix="edit-dead"
            form={form}
            setForm={setForm}
            domainInvalid={domainInvalid}
            setDomainInvalid={setDomainInvalid}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeadHostsPage() {
  const { deadHosts, refreshAll } = useTpm()
  const [edit, setEdit] = useState<DeadHost | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, DeadHost>[]>(
    () => [
      {
        accessorKey: 'domain_names',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Domains" />,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.domain_names.join(', ')}</span>
        ),
      },
      {
        accessorKey: 'status_code',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.status_code}</Badge>,
      },
      {
        id: 'html',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Page" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.body_html.trim() ? 'custom' : 'default'}
          </span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: ({ column }) => <DataTableColumnHeader column={column} title="On" />,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? 'default' : 'secondary'}>
            {row.original.enabled ? 'on' : 'off'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.domain_names[0] || 'parked host'}
            id={row.original.id}
            extra={[{ label: 'Edit', onSelect: () => setEdit(row.original) }]}
            onDelete={async () => {
              await api(`/api/v1/dead-hosts/${row.original.id}`, { method: 'DELETE' })
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
          { label: 'Parked', value: deadHosts.length, icon: ParkingCircle },
          {
            label: 'Enabled',
            value: deadHosts.filter((d) => d.enabled).length,
            icon: ParkingCircle,
          },
          {
            label: 'Custom HTML',
            value: deadHosts.filter((d) => d.body_html.trim()).length,
            icon: ParkingCircle,
          },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Parked hosts</CardTitle>
            <CardDescription>Reserve domains on a static page without an upstream app.</CardDescription>
          </div>
          <AddDeadDialog onSaved={refreshAll} />
        </CardHeader>
        <CardContent>
          <CrudDataTable columns={columns} data={deadHosts} searchKey="domain_names" />
        </CardContent>
      </Card>
      <EditDeadDialog
        host={edit}
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
