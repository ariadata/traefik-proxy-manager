import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, Download, RefreshCw, Trash2, Upload } from 'lucide-react'

import { StatsCards } from '@/components/stats-cards'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

type BackupInfo = {
  name: string
  size: number
  created_at: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function BackupsPage() {
  const [items, setItems] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api<{ items: BackupInfo[] }>('/api/v1/backups')
    setItems(res.items)
  }, [])

  useEffect(() => {
    void load().catch((ex) => setErr((ex as Error).message))
  }, [load])

  async function onCreate() {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const item = await api<BackupInfo>('/api/v1/backups', { method: 'POST' })
      setMsg(`Created ${item.name}`)
      await load()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onRestore(name: string) {
    if (
      !window.confirm(
        `Restore ${name}?\n\nThis replaces the live SQLite DB (and certs/acme if present in the archive). Sessions may drop.`,
      )
    ) {
      return
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await api<{ ok: boolean; restored: string[] }>('/api/v1/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setMsg(`Restored: ${res.restored.join(', ')}`)
      await load()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(name: string) {
    if (!window.confirm(`Delete backup ${name}?`)) return
    setBusy(true)
    setErr(null)
    try {
      await api(`/api/v1/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
      await load()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadBackup(name: string) {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/v1/backups/${encodeURIComponent(name)}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fileInput = form.elements.namedItem('file') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) return
    let name = file.name
    if (!name.endsWith('.tar.gz')) name = `tpm-upload-${Date.now()}.tar.gz`
    if (!/^tpm-[\w.-]+\.tar\.gz$/.test(name)) {
      name = `tpm-upload-${Date.now()}.tar.gz`
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      await api(`/api/v1/backups/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/gzip' },
        body: buf,
      })
      setMsg(`Uploaded ${name}`)
      form.reset()
      await load()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatsCards items={[{ label: 'Archives', value: items.length, icon: Archive }]} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Backup & restore</CardTitle>
            <CardDescription>
              Archives include SQLite snapshot, custom certs, and acme.json when present.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw data-icon="inline-start" /> Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => void onCreate()} disabled={busy}>
              <Archive data-icon="inline-start" /> Create backup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {err && <p className="text-destructive text-sm">{err}</p>}
          {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}

          <form onSubmit={onUpload} className="border-border flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="min-w-[14rem] flex-1">
              <label className="mb-1 block text-sm font-medium" htmlFor="backup-file">
                Upload archive
              </label>
              <Input
                id="backup-file"
                name="file"
                type="file"
                accept=".gz,.tar.gz,application/gzip"
                aria-label="Backup archive file"
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>
              <Upload data-icon="inline-start" /> Upload
            </Button>
          </form>

          <div className="border-border overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground px-3 py-6 text-center">
                      No backups yet.
                    </td>
                  </tr>
                )}
                {items.map((b) => (
                  <tr key={b.name} className="border-border border-t">
                    <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                    <td className="px-3 py-2">{formatBytes(b.size)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void downloadBackup(b.name)}
                        >
                          <Download data-icon="inline-start" /> Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void onRestore(b.name)}
                        >
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Delete backup ${b.name}`}
                          onClick={() => void onDelete(b.name)}
                        >
                          <Trash2 data-icon="inline-start" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
