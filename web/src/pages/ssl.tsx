import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { KeyRound, Plus, ShieldHalf, Stethoscope, Upload } from 'lucide-react'

import { CrudDataTable } from '@/components/data-table/data-table'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { RowActions } from '@/components/data-table/row-actions'
import { NativeSelect } from '@/components/native-select'
import { StatsCards } from '@/components/stats-cards'
import { StatusPill } from '@/components/status-pill'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { DomainTagsInput } from '@/components/domain-tags-input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'
import type { DataTableFeatures } from '@/lib/data-table'
import type { Certificate, DnsResolver, SslCheck } from '@/lib/types'

function AddResolverDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const { providers, setBanner } = useTpm()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resName, setResName] = useState('cloudflare')
  const [resProvider, setResProvider] = useState('cloudflare')
  const [resEmail, setResEmail] = useState('')
  const [resDefault, setResDefault] = useState(true)
  const [resCreds, setResCreds] = useState<Record<string, string>>({})

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === resProvider),
    [providers, resProvider],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setBanner(null)
      const result = await api<{ resolver: DnsResolver; restart_required: boolean }>(
        '/api/v1/resolvers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: resName,
            provider: resProvider,
            acme_email: resEmail,
            credentials: resCreds,
            is_default: resDefault,
          }),
        },
      )
      if (result.restart_required) {
        setBanner('Resolver applied to traefik.yml — restart Traefik to load ACME env/resolvers.')
      }
      setResCreds({})
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
        Add resolver
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add DNS resolver</DialogTitle>
          <DialogDescription>
            Credentials are encrypted with TPM_SECRETS_KEY. Traefik restart required after changes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="res-name">Name *</FieldLabel>
                <Input id="res-name" value={resName} onChange={(e) => setResName(e.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="res-provider">Provider</FieldLabel>
                <NativeSelect
                  id="res-provider"
                  value={resProvider}
                  onChange={(e) => {
                    setResProvider(e.target.value)
                    setResCreds({})
                  }}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="res-email">ACME email *</FieldLabel>
              <Input
                id="res-email"
                type="email"
                value={resEmail}
                onChange={(e) => setResEmail(e.target.value)}
                required
              />
            </Field>
            {selectedProvider?.fields.map((f) => (
              <Field key={f.key}>
                <FieldLabel htmlFor={`cred-${f.key}`}>{f.label}</FieldLabel>
                <Input
                  id={`cred-${f.key}`}
                  type={f.secret ? 'password' : 'text'}
                  placeholder={f.placeholder || f.label}
                  value={resCreds[f.key] || ''}
                  onChange={(e) => setResCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={resDefault} onCheckedChange={(v) => setResDefault(v === true)} />
              Default resolver
            </label>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Plus data-icon="inline-start" />
              Save resolver
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UploadCertDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [certDomains, setCertDomains] = useState<string[]>([])
  const [certPem, setCertPem] = useState('')
  const [keyPem, setKeyPem] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (certDomains.length === 0) return
    setBusy(true)
    try {
      await api('/api/v1/certificates', {
        method: 'POST',
        body: JSON.stringify({ domain_names: certDomains, cert_pem: certPem, key_pem: keyPem }),
      })
      setCertDomains([])
      setCertPem('')
      setKeyPem('')
      setOpen(false)
      await onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload data-icon="inline-start" />
        Upload PEM
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload custom certificate</DialogTitle>
          <DialogDescription>PEM cert + key written to Traefik tls.certificates.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cert-domains">Domains *</FieldLabel>
              <DomainTagsInput
                id="cert-domains"
                value={certDomains}
                placeholder="Type a domain, press Enter"
                onChange={setCertDomains}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cert-pem">Certificate PEM *</FieldLabel>
              <Textarea
                id="cert-pem"
                className="font-mono min-h-28"
                value={certPem}
                onChange={(e) => setCertPem(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="key-pem">Private key PEM *</FieldLabel>
              <Textarea
                id="key-pem"
                className="font-mono min-h-28"
                value={keyPem}
                onChange={(e) => setKeyPem(e.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Upload data-icon="inline-start" />
              Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SslPage() {
  const { status, resolvers, certs, sslChecks, banner, setBanner, refreshAll } = useTpm()

  const resolverColumns = useMemo<ColumnDef<DataTableFeatures, DnsResolver>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.is_default && <Badge variant="secondary">default</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'provider',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Provider" />,
      },
      {
        accessorKey: 'challenge',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Challenge" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.challenge}</Badge>,
      },
      {
        accessorKey: 'acme_email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.acme_email}</span>,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            id={row.original.id}
            onDelete={async () => {
              const result = await api<{ restart_required: boolean }>(
                `/api/v1/resolvers/${row.original.id}`,
                { method: 'DELETE' },
              )
              if (result.restart_required) setBanner('Resolver removed — restart Traefik to apply.')
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

  const certColumns = useMemo<ColumnDef<DataTableFeatures, Certificate>[]>(
    () => [
      {
        accessorFn: (row) => row.domain_names.join(', '),
        id: 'domains',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Domains" />,
        cell: ({ row }) => <span className="font-medium">{row.original.domain_names.join(', ')}</span>,
      },
      {
        accessorKey: 'kind',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
        cell: ({ row }) => <Badge variant="outline">{row.original.kind}</Badge>,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.domain_names[0] || 'certificate'}
            id={row.original.id}
            onDelete={async () => {
              await api(`/api/v1/certificates/${row.original.id}`, { method: 'DELETE' })
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

  const checkColumns = useMemo<ColumnDef<DataTableFeatures, SslCheck>[]>(
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
      {
        accessorKey: 'checked_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Checked" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {new Date(row.original.checked_at).toLocaleString()}
          </span>
        ),
      },
    ],
    [],
  )

  async function onRunSslCheck() {
    await api('/api/v1/ssl/checks/run', { method: 'POST' })
    await refreshAll()
  }

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Resolvers', value: resolvers.length, icon: KeyRound },
          { label: 'Custom certs', value: certs.length, icon: ShieldHalf },
          {
            label: 'Valid checks',
            value: sslChecks.filter((c) => c.status === 'valid').length,
            icon: ShieldHalf,
            tone: 'success',
          },
          {
            label: 'Problems',
            value: sslChecks.filter((c) => c.status === 'expired' || c.status === 'error').length,
            icon: ShieldHalf,
            tone: sslChecks.some((c) => c.status === 'expired' || c.status === 'error')
              ? 'danger'
              : 'default',
          },
        ]}
      />

      {banner && (
        <Alert>
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      )}
      {!status?.secrets_configured && (
        <Alert>
          <AlertDescription>
            Set <code className="font-mono">TPM_SECRETS_KEY</code> in `.env` before saving DNS tokens.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="resolvers">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="resolvers">Resolvers</TabsTrigger>
            <TabsTrigger value="certs">Custom certs</TabsTrigger>
            <TabsTrigger value="checks">SSL checks</TabsTrigger>
          </TabsList>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRunSslCheck()}>
            <Stethoscope data-icon="inline-start" />
            Run SSL check
          </Button>
        </div>

        <TabsContent value="resolvers">
          <Card>
            <CardHeader>
              <CardTitle>DNS resolvers</CardTitle>
              <CardDescription>Named ACME DNS providers rendered into Traefik static config</CardDescription>
            </CardHeader>
            <CardContent>
              <CrudDataTable
                data={resolvers}
                columns={resolverColumns}
                searchKey="name"
                searchPlaceholder="Search resolvers…"
                toolbarRight={<AddResolverDialog onCreated={refreshAll} />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certs">
          <Card>
            <CardHeader>
              <CardTitle>Custom certificates</CardTitle>
              <CardDescription>Uploaded PEMs exposed via Traefik tls.certificates</CardDescription>
            </CardHeader>
            <CardContent>
              <CrudDataTable
                data={certs}
                columns={certColumns}
                searchKey="domains"
                searchPlaceholder="Search cert domains…"
                toolbarRight={<UploadCertDialog onCreated={refreshAll} />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checks">
          <Card>
            <CardHeader>
              <CardTitle>Certificate checks</CardTitle>
              <CardDescription>Background TLS/expiry posture from the control plane checker</CardDescription>
            </CardHeader>
            <CardContent>
              <CrudDataTable
                data={sslChecks}
                columns={checkColumns}
                searchKey="domain"
                searchPlaceholder="Search domains…"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
