import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, Plus, Shield } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { RowActions } from '@/components/data-table/row-actions'
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
import type { AccessList, AccessListClient } from '@/lib/types'

type AuthRow = { username: string; password: string }

type FormState = {
  name: string
  passAuth: boolean
  clients: AccessListClient[]
  authUsers: AuthRow[]
  enabled: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  passAuth: false,
  clients: [],
  authUsers: [],
  enabled: true,
})

function formFromList(list: AccessList): FormState {
  return {
    name: list.name,
    passAuth: list.pass_auth,
    clients: list.clients.map((c) => ({ ...c })),
    authUsers: list.auth_users.map((u) => ({ username: u.username, password: '' })),
    enabled: list.enabled,
  }
}

function AccessListFormFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="acl-name">Name *</FieldLabel>
        <Input
          id="acl-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.passAuth}
          onCheckedChange={(v) => setForm((f) => ({ ...f, passAuth: v === true }))}
        />
        Pass Authorization header upstream
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.enabled}
          onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v === true }))}
        />
        Enabled
      </label>

      <div className="border-border space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <FieldLabel>IP clients</FieldLabel>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() =>
              setForm((f) => ({
                ...f,
                clients: [...f.clients, { address: '', directive: 'allow' }],
              }))
            }
          >
            <Plus data-icon="inline-start" />
            Add CIDR
          </Button>
        </div>
        {form.clients.length === 0 && (
          <p className="text-muted-foreground text-xs">No IP rules — BasicAuth only is fine.</p>
        )}
        {form.clients.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
            <Input
              placeholder="10.0.0.0/8"
              value={c.address}
              onChange={(e) =>
                setForm((f) => {
                  const clients = [...f.clients]
                  clients[i] = { ...clients[i], address: e.target.value }
                  return { ...f, clients }
                })
              }
              required
            />
            <NativeSelect
              value={c.directive}
              onChange={(e) =>
                setForm((f) => {
                  const clients = [...f.clients]
                  clients[i] = {
                    ...clients[i],
                    directive: e.target.value as 'allow' | 'deny',
                  }
                  return { ...f, clients }
                })
              }
            >
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, clients: f.clients.filter((_, j) => j !== i) }))
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="border-border space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <FieldLabel>BasicAuth users</FieldLabel>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() =>
              setForm((f) => ({
                ...f,
                authUsers: [...f.authUsers, { username: '', password: '' }],
              }))
            }
          >
            <Plus data-icon="inline-start" />
            Add user
          </Button>
        </div>
        {form.authUsers.length === 0 && (
          <p className="text-muted-foreground text-xs">Optional. Requires TPM_SECRETS_KEY.</p>
        )}
        {form.authUsers.map((u, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="username"
              value={u.username}
              onChange={(e) =>
                setForm((f) => {
                  const authUsers = [...f.authUsers]
                  authUsers[i] = { ...authUsers[i], username: e.target.value }
                  return { ...f, authUsers }
                })
              }
              required
            />
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="password (blank = keep)"
                value={u.password}
                onChange={(e) =>
                  setForm((f) => {
                    const authUsers = [...f.authUsers]
                    authUsers[i] = { ...authUsers[i], password: e.target.value }
                    return { ...f, authUsers }
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, authUsers: f.authUsers.filter((_, j) => j !== i) }))
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </FieldGroup>
  )
}

function payloadFromForm(form: FormState) {
  return {
    name: form.name,
    satisfy: 'all' as const,
    pass_auth: form.passAuth,
    clients: form.clients.filter((c) => c.address.trim()),
    auth_users: form.authUsers
      .filter((u) => u.username.trim())
      .map((u) => {
        const row: { username: string; password?: string } = { username: u.username.trim() }
        if (u.password) row.password = u.password
        return row
      }),
    enabled: form.enabled,
  }
}

function AddAccessListDialog({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const body = payloadFromForm(form)
      for (const u of body.auth_users) {
        if (!u.password) throw new Error(`password required for ${u.username}`)
      }
      await api('/api/v1/access-lists', { method: 'POST', body: JSON.stringify(body) })
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
        Add access list
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add access list</DialogTitle>
          <DialogDescription>Reusable IP allow/deny + BasicAuth — attach on hosts.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <AccessListFormFields form={form} setForm={setForm} />
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

function EditAccessListDialog({
  list,
  open,
  onOpenChange,
  onSaved,
}: {
  list: AccessList | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (list && open) setForm(formFromList(list))
  }, [list, open])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!list) return
    setBusy(true)
    setErr(null)
    try {
      await api(`/api/v1/access-lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify(payloadFromForm(form)),
      })
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
          <DialogTitle>Edit access list</DialogTitle>
          <DialogDescription>Leave passwords blank to keep existing hashes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <AccessListFormFields form={form} setForm={setForm} />
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

export function AccessListsPage() {
  const { accessLists, refreshAll } = useTpm()
  const [edit, setEdit] = useState<AccessList | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, AccessList>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'clients',
        header: ({ column }) => <DataTableColumnHeader column={column} title="IP rules" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.clients.length}</Badge>,
      },
      {
        id: 'auth',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.auth_users.length}</Badge>,
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
            label={row.original.name}
            id={row.original.id}
            extra={[{ label: 'Edit', onSelect: () => setEdit(row.original) }]}
            onDelete={async () => {
              await api(`/api/v1/access-lists/${row.original.id}`, { method: 'DELETE' })
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
          { label: 'Lists', value: accessLists.length, icon: Shield },
          {
            label: 'With auth',
            value: accessLists.filter((a) => a.auth_users.length > 0).length,
            icon: KeyRound,
          },
          {
            label: 'Enabled',
            value: accessLists.filter((a) => a.enabled).length,
            icon: Shield,
          },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Access lists</CardTitle>
            <CardDescription>IP allow/deny + BasicAuth packs for hosts and redirects.</CardDescription>
          </div>
          <AddAccessListDialog onSaved={refreshAll} />
        </CardHeader>
        <CardContent>
          <CrudDataTable columns={columns} data={accessLists} searchKey="name" />
        </CardContent>
      </Card>
      <EditAccessListDialog
        list={edit}
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
