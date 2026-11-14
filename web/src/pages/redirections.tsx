import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRightLeft, Plus } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'
import type { DataTableFeatures } from '@/lib/data-table'
import type { RedirectionHost } from '@/lib/types'

type FormState = {
  domains: string[]
  scheme: 'http' | 'https'
  forwardHost: string
  forwardPath: string
  preservePath: boolean
  statusCode: 301 | 302
  certResolver: string
  sslForced: boolean
  accessListId: string
  enabled: boolean
}

const emptyForm = (): FormState => ({
  domains: [],
  scheme: 'https',
  forwardHost: '',
  forwardPath: '/',
  preservePath: true,
  statusCode: 301,
  certResolver: '',
  sslForced: false,
  accessListId: '',
  enabled: true,
})

function formFromHost(host: RedirectionHost): FormState {
  return {
    domains: [...host.domain_names],
    scheme: host.forward_scheme,
    forwardHost: host.forward_host,
    forwardPath: host.forward_path || '/',
    preservePath: host.preserve_path,
    statusCode: host.status_code,
    certResolver: host.cert_resolver || '',
    sslForced: host.ssl_forced,
    accessListId: host.access_list_id || '',
    enabled: host.enabled,
  }
}

function payloadFromForm(form: FormState) {
  return {
    domain_names: form.domains,
    forward_scheme: form.scheme,
    forward_host: form.forwardHost,
    forward_path: form.forwardPath || '/',
    preserve_path: form.preservePath,
    status_code: form.statusCode,
    cert_resolver: form.certResolver,
    ssl_forced: form.sslForced,
    access_list_id: form.accessListId || null,
    enabled: form.enabled,
  }
}

function RedirFormFields({
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
        <FieldLabel htmlFor={`${idPrefix}-domains`}>Source domains *</FieldLabel>
        <DomainTagsInput
          id={`${idPrefix}-domains`}
          value={form.domains}
          invalid={domainInvalid}
          placeholder="old.example.com"
          onChange={(next) => {
            setForm((f) => ({ ...f, domains: next }))
            setDomainInvalid(next.length === 0)
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-scheme`}>Target scheme</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-scheme`}
            value={form.scheme}
            onChange={(e) => setForm((f) => ({ ...f, scheme: e.target.value as 'http' | 'https' }))}
          >
            <option value="https">https</option>
            <option value="http">http</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-host`}>Target host *</FieldLabel>
          <Input
            id={`${idPrefix}-host`}
            value={form.forwardHost}
            onChange={(e) => setForm((f) => ({ ...f, forwardHost: e.target.value }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-path`}>Target path</FieldLabel>
          <Input
            id={`${idPrefix}-path`}
            value={form.forwardPath}
            onChange={(e) => setForm((f) => ({ ...f, forwardPath: e.target.value }))}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-code`}>Status</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-code`}
            value={String(form.statusCode)}
            onChange={(e) =>
              setForm((f) => ({ ...f, statusCode: Number(e.target.value) as 301 | 302 }))
            }
          >
            <option value="301">301 permanent</option>
            <option value="302">302 temporary</option>
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
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.preservePath}
          onCheckedChange={(v) => setForm((f) => ({ ...f, preservePath: v === true }))}
        />
        Preserve request path
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.sslForced}
          onCheckedChange={(v) => setForm((f) => ({ ...f, sslForced: v === true }))}
        />
        Force HTTPS on source (before external redirect)
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

function AddRedirDialog({ onSaved }: { onSaved: () => Promise<void> }) {
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
      await api('/api/v1/redirections', {
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
        Add redirect
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add redirection host</DialogTitle>
          <DialogDescription>Traefik redirectRegex — no upstream service.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <RedirFormFields
            idPrefix="add-redir"
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

function EditRedirDialog({
  host,
  open,
  onOpenChange,
  onSaved,
}: {
  host: RedirectionHost | null
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
      await api(`/api/v1/redirections/${host.id}`, {
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
          <DialogTitle>Edit redirection</DialogTitle>
          <DialogDescription>Updates the generated Traefik YAML file.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <RedirFormFields
            idPrefix="edit-redir"
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

export function RedirectionsPage() {
  const { redirections, refreshAll } = useTpm()
  const [edit, setEdit] = useState<RedirectionHost | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, RedirectionHost>[]>(
    () => [
      {
        accessorKey: 'domain_names',
        header: ({ column }) => <DataTableColumnHeader column={column} title="From" />,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.domain_names.join(', ')}</span>
        ),
      },
      {
        id: 'to',
        header: ({ column }) => <DataTableColumnHeader column={column} title="To" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.forward_scheme}://{row.original.forward_host}
            {row.original.forward_path}
          </span>
        ),
      },
      {
        accessorKey: 'status_code',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.status_code}</Badge>,
      },
      {
        accessorKey: 'enabled',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
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
            label={row.original.domain_names[0] || 'redirect'}
            id={row.original.id}
            extra={[{ label: 'Edit', onSelect: () => setEdit(row.original) }]}
            onDelete={async () => {
              await api(`/api/v1/redirections/${row.original.id}`, { method: 'DELETE' })
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
          { label: 'Redirects', value: redirections.length, icon: ArrowRightLeft },
          {
            label: 'Enabled',
            value: redirections.filter((r) => r.enabled).length,
            icon: ArrowRightLeft,
          },
          {
            label: '301',
            value: redirections.filter((r) => r.status_code === 301).length,
            icon: ArrowRightLeft,
          },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Redirection hosts</CardTitle>
            <CardDescription>Domain → target URL via Traefik redirectRegex.</CardDescription>
          </div>
          <AddRedirDialog onSaved={refreshAll} />
        </CardHeader>
        <CardContent>
          <CrudDataTable columns={columns} data={redirections} searchKey="domain_names" />
        </CardContent>
      </Card>
      <EditRedirDialog
        host={edit}
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
