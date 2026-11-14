import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Cable, Plus } from 'lucide-react'

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
import type { Stream } from '@/lib/types'

type FormState = {
  name: string
  protocol: 'tcp' | 'udp'
  entryPort: number
  forwardHost: string
  forwardPort: number
  sniHosts: string[]
  tlsMode: 'off' | 'terminate' | 'passthrough'
  certResolver: string
  enabled: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  protocol: 'tcp',
  entryPort: 10000,
  forwardHost: '127.0.0.1',
  forwardPort: 3306,
  sniHosts: [],
  tlsMode: 'off',
  certResolver: '',
  enabled: true,
})

function formFromStream(s: Stream): FormState {
  return {
    name: s.name,
    protocol: s.protocol,
    entryPort: s.entry_port,
    forwardHost: s.forward_host,
    forwardPort: s.forward_port,
    sniHosts: [...s.sni_hosts],
    tlsMode: s.tls_mode,
    certResolver: s.cert_resolver || '',
    enabled: s.enabled,
  }
}

function payloadFromForm(form: FormState) {
  return {
    name: form.name,
    protocol: form.protocol,
    entry_port: Number(form.entryPort),
    forward_host: form.forwardHost,
    forward_port: Number(form.forwardPort),
    sni_hosts: form.sniHosts,
    tls_mode: form.protocol === 'udp' ? 'off' : form.tlsMode,
    cert_resolver: form.certResolver,
    enabled: form.enabled,
  }
}

function StreamFormFields({
  idPrefix,
  form,
  setForm,
}: {
  idPrefix: string
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  const { resolvers, setBanner } = useTpm()

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name *</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-proto`}>Protocol</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-proto`}
            value={form.protocol}
            onChange={(e) => {
              const protocol = e.target.value as 'tcp' | 'udp'
              setForm((f) => ({
                ...f,
                protocol,
                tlsMode: protocol === 'udp' ? 'off' : f.tlsMode,
              }))
            }}
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-entry`}>Listen port *</FieldLabel>
          <Input
            id={`${idPrefix}-entry`}
            type="number"
            min={1}
            max={65535}
            value={form.entryPort}
            onChange={(e) => setForm((f) => ({ ...f, entryPort: Number(e.target.value) }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-tls`}>TLS</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-tls`}
            value={form.tlsMode}
            disabled={form.protocol === 'udp'}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                tlsMode: e.target.value as FormState['tlsMode'],
              }))
            }
          >
            <option value="off">off</option>
            <option value="terminate">terminate</option>
            <option value="passthrough">passthrough</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-fwd-host`}>Upstream host *</FieldLabel>
          <Input
            id={`${idPrefix}-fwd-host`}
            value={form.forwardHost}
            onChange={(e) => setForm((f) => ({ ...f, forwardHost: e.target.value }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-fwd-port`}>Upstream port *</FieldLabel>
          <Input
            id={`${idPrefix}-fwd-port`}
            type="number"
            min={1}
            max={65535}
            value={form.forwardPort}
            onChange={(e) => setForm((f) => ({ ...f, forwardPort: Number(e.target.value) }))}
            required
          />
        </Field>
      </div>
      {form.protocol === 'tcp' && (
        <>
          <Field>
            <FieldLabel>SNI hosts</FieldLabel>
            <DomainTagsInput
              id={`${idPrefix}-sni`}
              value={form.sniHosts}
              placeholder="HostSNI names (empty = *)"
              onChange={(next) => setForm((f) => ({ ...f, sniHosts: next }))}
            />
          </Field>
          {form.tlsMode === 'terminate' && (
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
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.enabled}
          onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v === true }))}
        />
        Enabled
      </label>
      <p className="text-muted-foreground text-xs">
        Saving updates Traefik static entryPoints — recreate Traefik after changes
        (<code className="font-mono">docker compose up -d traefik</code>). Publish the listen port
        via <code className="font-mono">DC_TRAEFIK_STREAM_*</code>.
        <button
          type="button"
          className="text-foreground ml-1 underline"
          onClick={() => setBanner('Restart Traefik to apply stream entryPoints.')}
        >
          Remind me
        </button>
      </p>
    </FieldGroup>
  )
}

function AddStreamDialog({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [err, setErr] = useState<string | null>(null)
  const { setBanner } = useTpm()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await api<{ stream: Stream; restart_required: boolean }>('/api/v1/streams', {
        method: 'POST',
        body: JSON.stringify(payloadFromForm(form)),
      })
      if (res.restart_required) setBanner('Stream saved — recreate Traefik to load entryPoints.')
      setForm(emptyForm())
      setOpen(false)
      await onSaved()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add stream
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add TCP/UDP stream</DialogTitle>
          <DialogDescription>Port forward via Traefik TCP/UDP routers.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <StreamFormFields idPrefix="add-stream" form={form} setForm={setForm} />
          {err && <p className="text-destructive text-sm">{err}</p>}
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

function EditStreamDialog({
  stream,
  open,
  onOpenChange,
  onSaved,
}: {
  stream: Stream | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [err, setErr] = useState<string | null>(null)
  const { setBanner } = useTpm()

  useEffect(() => {
    if (stream && open) setForm(formFromStream(stream))
  }, [stream, open])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!stream) return
    setBusy(true)
    setErr(null)
    try {
      const res = await api<{ stream: Stream; restart_required: boolean }>(
        `/api/v1/streams/${stream.id}`,
        { method: 'PUT', body: JSON.stringify(payloadFromForm(form)) },
      )
      if (res.restart_required) setBanner('Stream updated — recreate Traefik to load entryPoints.')
      onOpenChange(false)
      await onSaved()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit stream</DialogTitle>
          <DialogDescription>Updates dynamic YAML and static entryPoints.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <StreamFormFields idPrefix="edit-stream" form={form} setForm={setForm} />
          {err && <p className="text-destructive text-sm">{err}</p>}
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

export function StreamsPage() {
  const { streams, refreshAll, setBanner } = useTpm()
  const [edit, setEdit] = useState<Stream | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, Stream>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'protocol',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Proto" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.protocol.toUpperCase()}</Badge>,
      },
      {
        id: 'listen',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Listen" />,
        cell: ({ row }) => <span className="font-mono text-xs">:{row.original.entry_port}</span>,
      },
      {
        id: 'up',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Upstream" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.forward_host}:{row.original.forward_port}
          </span>
        ),
      },
      {
        accessorKey: 'tls_mode',
        header: ({ column }) => <DataTableColumnHeader column={column} title="TLS" />,
        cell: ({ row }) => <Badge variant="secondary">{row.original.tls_mode}</Badge>,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            id={row.original.id}
            extra={[{ label: 'Edit', onSelect: () => setEdit(row.original) }]}
            onDelete={async () => {
              const res = await api<{ ok: boolean; restart_required: boolean }>(
                `/api/v1/streams/${row.original.id}`,
                { method: 'DELETE' },
              )
              if (res.restart_required) setBanner('Stream deleted — recreate Traefik.')
              await refreshAll()
            }}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [refreshAll, setBanner],
  )

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Streams', value: streams.length, icon: Cable },
          {
            label: 'TCP',
            value: streams.filter((s) => s.protocol === 'tcp').length,
            icon: Cable,
          },
          {
            label: 'UDP',
            value: streams.filter((s) => s.protocol === 'udp').length,
            icon: Cable,
          },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>TCP / UDP streams</CardTitle>
            <CardDescription>
              Port forwards. Prefer listen ports in 10000–11000 (Compose publish range).
            </CardDescription>
          </div>
          <AddStreamDialog onSaved={refreshAll} />
        </CardHeader>
        <CardContent>
          <CrudDataTable columns={columns} data={streams} searchKey="name" />
        </CardContent>
      </Card>
      <EditStreamDialog
        stream={edit}
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
