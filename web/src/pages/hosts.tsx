import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Gauge, Globe2, Lock, Pencil, Plus, Server } from 'lucide-react'

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
import type { PathRewriteRule, ProxyHost } from '@/lib/types'

type HostFormState = {
  domains: string[]
  forwardHost: string
  forwardPort: number
  scheme: 'http' | 'https'
  sslForced: boolean
  certResolver: string
  selectedWaf: string[]
  selectedHeaders: string[]
  accessListId: string
  rateLimitEnabled: boolean
  rateAverage: number
  rateBurst: number
  ratePeriod: string
  pathRewrites: PathRewriteRule[]
  advancedYaml: string
  enabled: boolean
}

const emptyRewrite = (): PathRewriteRule => ({ regex: '', replacement: '' })

const emptyForm = (): HostFormState => ({
  domains: [],
  forwardHost: '127.0.0.1',
  forwardPort: 3000,
  scheme: 'http',
  sslForced: true,
  certResolver: '',
  selectedWaf: [],
  selectedHeaders: [],
  accessListId: '',
  rateLimitEnabled: false,
  rateAverage: 100,
  rateBurst: 50,
  ratePeriod: '1m',
  pathRewrites: [],
  advancedYaml: '',
  enabled: true,
})

function formFromHost(host: ProxyHost): HostFormState {
  return {
    domains: [...host.domain_names],
    forwardHost: host.forward_host,
    forwardPort: host.forward_port,
    scheme: host.forward_scheme,
    sslForced: host.ssl_forced,
    certResolver: host.cert_resolver || '',
    selectedWaf: [...host.waf_profile_ids],
    selectedHeaders: [...host.header_rule_ids],
    accessListId: host.access_list_id || '',
    rateLimitEnabled: !!host.rate_limit_enabled,
    rateAverage: host.rate_limit_average ?? 100,
    rateBurst: host.rate_limit_burst ?? 50,
    ratePeriod: host.rate_limit_period || '1m',
    pathRewrites: (host.path_rewrites || []).map((r) => ({ ...r })),
    advancedYaml: host.advanced_yaml || '',
    enabled: host.enabled,
  }
}

function HostFormFields({
  idPrefix,
  form,
  setForm,
  domainInvalid,
  setDomainInvalid,
}: {
  idPrefix: string
  form: HostFormState
  setForm: Dispatch<SetStateAction<HostFormState>>
  domainInvalid: boolean
  setDomainInvalid: (v: boolean) => void
}) {
  const { resolvers, wafProfiles, headerRules, accessLists } = useTpm()
  const attachableWaf = wafProfiles.filter((w) => w.kind !== 'rate_limit')

  return (
    <FieldGroup>
      <Field data-invalid={domainInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-domains`}>Domains *</FieldLabel>
        <DomainTagsInput
          id={`${idPrefix}-domains`}
          value={form.domains}
          invalid={domainInvalid}
          placeholder="Type a domain, press Enter"
          onChange={(next) => {
            setForm((f) => ({ ...f, domains: next }))
            setDomainInvalid(next.length === 0)
          }}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-forward-host`}>Upstream host *</FieldLabel>
          <Input
            id={`${idPrefix}-forward-host`}
            value={form.forwardHost}
            onChange={(e) => setForm((f) => ({ ...f, forwardHost: e.target.value }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-forward-port`}>Port *</FieldLabel>
          <Input
            id={`${idPrefix}-forward-port`}
            type="number"
            value={form.forwardPort}
            onChange={(e) => setForm((f) => ({ ...f, forwardPort: Number(e.target.value) }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-scheme`}>Scheme</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-scheme`}
            value={form.scheme}
            onChange={(e) => setForm((f) => ({ ...f, scheme: e.target.value as 'http' | 'https' }))}
          >
            <option value="http">http</option>
            <option value="https">https</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-resolver`}>Cert resolver</FieldLabel>
          <NativeSelect
            id={`${idPrefix}-resolver`}
            value={form.certResolver}
            onChange={(e) => setForm((f) => ({ ...f, certResolver: e.target.value }))}
          >
            <option value="">none</option>
            {resolvers.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name} ({r.provider})
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.sslForced}
            onCheckedChange={(v) => setForm((f) => ({ ...f, sslForced: v === true }))}
          />
          Force HTTPS redirect
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v === true }))}
          />
          Enabled
        </label>
      </div>

      <div className="border-border space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <FieldLabel>Rate limit (this host only)</FieldLabel>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Separate Traefik rateLimit middleware per site
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.rateLimitEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, rateLimitEnabled: v === true }))}
            />
            Enable
          </label>
        </div>
        {form.rateLimitEnabled && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-rl-avg`}>Average</FieldLabel>
              <Input
                id={`${idPrefix}-rl-avg`}
                type="number"
                min={1}
                value={form.rateAverage}
                onChange={(e) => setForm((f) => ({ ...f, rateAverage: Number(e.target.value) }))}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-rl-burst`}>Burst</FieldLabel>
              <Input
                id={`${idPrefix}-rl-burst`}
                type="number"
                min={1}
                value={form.rateBurst}
                onChange={(e) => setForm((f) => ({ ...f, rateBurst: Number(e.target.value) }))}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-rl-period`}>Period</FieldLabel>
              <NativeSelect
                id={`${idPrefix}-rl-period`}
                value={form.ratePeriod}
                onChange={(e) => setForm((f) => ({ ...f, ratePeriod: e.target.value }))}
              >
                <option value="1s">1s</option>
                <option value="10s">10s</option>
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="1h">1h</option>
              </NativeSelect>
            </Field>
          </div>
        )}
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

      <div className="border-border space-y-3 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <FieldLabel id={`${idPrefix}-rewrites-label`}>Path rewrites</FieldLabel>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Traefik <code className="font-mono">replacePathRegex</code> — capture groups with{' '}
              <code className="font-mono">$1</code>, <code className="font-mono">$2</code>…
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-labelledby={`${idPrefix}-rewrites-label`}
            onClick={() =>
              setForm((f) => ({
                ...f,
                pathRewrites: [...f.pathRewrites, emptyRewrite()],
              }))
            }
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add rule
          </Button>
        </div>
        {form.pathRewrites.length === 0 ? (
          <p className="text-muted-foreground text-xs" role="status">
            No rewrites. Example: regex{' '}
            <code className="font-mono">^/go/([^/]+)/([^/]+)$</code> →{' '}
            <code className="font-mono">/redirected/$1/user/$2</code>
          </p>
        ) : (
          <ul className="space-y-3" aria-labelledby={`${idPrefix}-rewrites-label`}>
            {form.pathRewrites.map((rule, index) => (
              <li
                key={index}
                className="border-border bg-muted/30 space-y-2 rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">Rule {index + 1}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove path rewrite rule ${index + 1}`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        pathRewrites: f.pathRewrites.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-rewrite-regex-${index}`}>Regex *</FieldLabel>
                  <Input
                    id={`${idPrefix}-rewrite-regex-${index}`}
                    className="font-mono text-xs"
                    value={rule.regex}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pathRewrites: f.pathRewrites.map((r, i) =>
                          i === index ? { ...r, regex: e.target.value } : r,
                        ),
                      }))
                    }
                    placeholder="^/go/([^/]+)/([^/]+)$"
                    required
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-rewrite-repl-${index}`}>
                    Replacement *
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-rewrite-repl-${index}`}
                    className="font-mono text-xs"
                    value={rule.replacement}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pathRewrites: f.pathRewrites.map((r, i) =>
                          i === index ? { ...r, replacement: e.target.value } : r,
                        ),
                      }))
                    }
                    placeholder="/redirected/$1/user/$2"
                    required
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(attachableWaf.length > 0 || headerRules.length > 0) && (
        <div className="border-border space-y-3 rounded-lg border p-3">
          {attachableWaf.length > 0 && (
            <div>
              <FieldLabel>Attach WAF</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-3">
                {attachableWaf.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.selectedWaf.includes(w.id)}
                      onCheckedChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          selectedWaf:
                            v === true
                              ? [...f.selectedWaf, w.id]
                              : f.selectedWaf.filter((x) => x !== w.id),
                        }))
                      }
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {headerRules.length > 0 && (
            <div>
              <FieldLabel>Attach headers</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-3">
                {headerRules.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.selectedHeaders.includes(h.id)}
                      onCheckedChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          selectedHeaders:
                            v === true
                              ? [...f.selectedHeaders, h.id]
                              : f.selectedHeaders.filter((x) => x !== h.id),
                        }))
                      }
                    />
                    {h.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-adv`}>Advanced Traefik YAML</FieldLabel>
        <textarea
          id={`${idPrefix}-adv`}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-28 w-full rounded-lg border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          value={form.advancedYaml}
          onChange={(e) => setForm((f) => ({ ...f, advancedYaml: e.target.value }))}
          placeholder={"# deep-merged into generated file, e.g.\n# http:\n#   middlewares:\n#     custom-mw:\n#       headers:\n#         customResponseHeaders:\n#           X-Powered-By: \"\""}
          spellCheck={false}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Optional YAML fragment deep-merged into the host file (power users).
        </p>
      </Field>
    </FieldGroup>
  )
}

function payloadFromForm(form: HostFormState) {
  return {
    domain_names: form.domains,
    forward_scheme: form.scheme,
    forward_host: form.forwardHost,
    forward_port: Number(form.forwardPort),
    ssl_forced: form.sslForced,
    cert_resolver: form.certResolver,
    waf_profile_ids: form.selectedWaf,
    header_rule_ids: form.selectedHeaders,
    access_list_id: form.accessListId || null,
    rate_limit_enabled: form.rateLimitEnabled,
    rate_limit_average: form.rateAverage,
    rate_limit_burst: form.rateBurst,
    rate_limit_period: form.ratePeriod,
    path_rewrites: form.pathRewrites
      .map((r) => ({ regex: r.regex.trim(), replacement: r.replacement.trim() }))
      .filter((r) => r.regex && r.replacement),
    advanced_yaml: form.advancedYaml,
    enabled: form.enabled,
  }
}

function AddHostDialog({ onSaved }: { onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<HostFormState>(emptyForm)
  const [domainInvalid, setDomainInvalid] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.domains.length === 0) {
      setDomainInvalid(true)
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/hosts', {
        method: 'POST',
        body: JSON.stringify(payloadFromForm(form)),
      })
      setForm(emptyForm())
      setDomainInvalid(false)
      setOpen(false)
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setForm(emptyForm())
          setDomainInvalid(false)
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Add host
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add proxy host</DialogTitle>
          <DialogDescription>
            Creates Traefik routers/services under the file provider.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <HostFormFields
            idPrefix="add"
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
              <Plus data-icon="inline-start" />
              Create host
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditHostDialog({
  host,
  open,
  onOpenChange,
  onSaved,
}: {
  host: ProxyHost | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<HostFormState>(emptyForm)
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
      await api(`/api/v1/hosts/${host.id}`, {
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
          <DialogTitle>Edit proxy host</DialogTitle>
          <DialogDescription>
            Updates SQLite and regenerates this host’s Traefik YAML.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <HostFormFields
            idPrefix="edit"
            form={form}
            setForm={setForm}
            domainInvalid={domainInvalid}
            setDomainInvalid={setDomainInvalid}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !host}>
              <Pencil data-icon="inline-start" />
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function HostsPage() {
  const { hosts, refreshAll } = useTpm()
  const [editing, setEditing] = useState<ProxyHost | null>(null)

  const columns = useMemo<ColumnDef<DataTableFeatures, ProxyHost>[]>(
    () => [
      {
        accessorFn: (row) => row.domain_names.join(', '),
        id: 'domains',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Domains" />,
        cell: ({ row }) => (
          <div className="max-w-[280px] truncate font-medium">{row.original.domain_names.join(', ')}</div>
        ),
      },
      {
        id: 'upstream',
        accessorFn: (row) => `${row.forward_scheme}://${row.forward_host}:${row.forward_port}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Upstream" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.forward_scheme}://{row.original.forward_host}:{row.original.forward_port}
          </span>
        ),
      },
      {
        accessorKey: 'cert_resolver',
        header: ({ column }) => <DataTableColumnHeader column={column} title="SSL" />,
        cell: ({ row }) =>
          row.original.cert_resolver ? (
            <Badge variant="outline">{row.original.cert_resolver}</Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        id: 'rate',
        accessorFn: (row) =>
          row.rate_limit_enabled ? `${row.rate_limit_average}/${row.rate_limit_period}` : '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Rate limit" />,
        cell: ({ row }) =>
          row.original.rate_limit_enabled ? (
            <Badge variant="outline" className="font-mono text-[11px]">
              {row.original.rate_limit_average}/{row.original.rate_limit_period} · burst{' '}
              {row.original.rate_limit_burst}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">off</span>
          ),
      },
      {
        id: 'attach',
        header: 'Profiles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {!row.original.enabled && <Badge variant="destructive">disabled</Badge>}
            {row.original.ssl_forced && <Badge variant="secondary">HTTPS</Badge>}
            {row.original.access_list_id && <Badge variant="outline">ACL</Badge>}
            {(row.original.path_rewrites?.length ?? 0) > 0 && (
              <Badge variant="outline">Rewrite ×{row.original.path_rewrites.length}</Badge>
            )}
            {row.original.waf_profile_ids.length > 0 && (
              <Badge variant="outline">WAF ×{row.original.waf_profile_ids.length}</Badge>
            )}
            {row.original.header_rule_ids.length > 0 && (
              <Badge variant="outline">HDR ×{row.original.header_rule_ids.length}</Badge>
            )}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <RowActions
            label={row.original.domain_names[0] || 'host'}
            id={row.original.id}
            extra={[
              {
                label: 'Edit',
                onSelect: () => setEditing(row.original),
              },
            ]}
            onDelete={async () => {
              await api(`/api/v1/hosts/${row.original.id}`, { method: 'DELETE' })
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

  const withSsl = hosts.filter((h) => h.cert_resolver || h.ssl_forced).length
  const withRate = hosts.filter((h) => h.rate_limit_enabled).length
  const withWaf = hosts.filter((h) => h.waf_profile_ids.length > 0).length

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Hosts', value: hosts.length, icon: Server },
          { label: 'With SSL', value: withSsl, icon: Lock, tone: withSsl ? 'success' : 'default' },
          {
            label: 'Rate limited',
            value: withRate,
            icon: Gauge,
            tone: withRate ? 'warning' : 'default',
          },
          { label: 'With WAF', value: withWaf, icon: Globe2 },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Host management</CardTitle>
          <CardDescription>Search, filter, create, and edit Traefik proxy hosts</CardDescription>
        </CardHeader>
        <CardContent>
          <CrudDataTable
            data={hosts}
            columns={columns}
            searchKey="domains"
            searchPlaceholder="Search domains…"
            toolbarRight={<AddHostDialog onSaved={refreshAll} />}
          />
        </CardContent>
      </Card>

      <EditHostDialog
        host={editing}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={refreshAll}
      />
    </div>
  )
}
