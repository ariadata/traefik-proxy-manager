import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Pause, Play, RefreshCw } from 'lucide-react'

import { StatsCards } from '@/components/stats-cards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

type AccessLogEntry = {
  raw: string
  time: string | null
  client: string | null
  method: string | null
  host: string | null
  path: string | null
  status: number | null
  duration_ms: number | null
}

type AccessLogResponse = {
  path: string
  exists: boolean
  size: number
  mtime: string | null
  lines: AccessLogEntry[]
}

function statusTone(status: number | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status == null) return 'outline'
  if (status >= 500) return 'destructive'
  if (status >= 400) return 'secondary'
  return 'default'
}

export function AccessLogPage() {
  const [data, setData] = useState<AccessLogResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [live, setLive] = useState(true)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await api<AccessLogResponse>('/api/v1/access-log?lines=300')
      setData(res)
      setErr(null)
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      void load()
    }, 2500)
    return () => window.clearInterval(id)
  }, [live, load])

  const filtered = useMemo(() => {
    const lines = data?.lines ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return [...lines].reverse()
    return [...lines]
      .reverse()
      .filter((l) =>
        [l.host, l.path, l.client, l.method, l.status?.toString(), l.raw]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
  }, [data, filter])

  const status5xx = (data?.lines ?? []).filter((l) => (l.status ?? 0) >= 500).length
  const status4xx = (data?.lines ?? []).filter((l) => {
    const s = l.status ?? 0
    return s >= 400 && s < 500
  }).length

  return (
    <div className="flex flex-col gap-6">
      <StatsCards
        items={[
          { label: 'Lines', value: data?.lines.length ?? 0, icon: Activity },
          { label: '4xx', value: status4xx, icon: Activity, tone: status4xx ? 'warning' : 'default' },
          { label: '5xx', value: status5xx, icon: Activity, tone: status5xx ? 'warning' : 'default' },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Access log</CardTitle>
            <CardDescription>
              Live tail of Traefik JSON access log
              {data?.path ? (
                <span className="mt-1 block font-mono text-xs">{data.path}</span>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form
              role="search"
              className="contents"
              onSubmit={(e) => {
                e.preventDefault()
              }}
            >
              <label htmlFor="access-log-filter" className="sr-only">
                Filter host / path / IP
              </label>
              <Input
                id="access-log-filter"
                name="filter"
                type="search"
                className="w-48"
                placeholder="Filter host / path / IP…"
                aria-label="Filter host / path / IP"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </form>
            <Button type="button" variant="outline" size="sm" onClick={() => setLive((v) => !v)}>
              {live ? (
                <>
                  <Pause data-icon="inline-start" aria-hidden="true" /> Pause
                </>
              ) : (
                <>
                  <Play data-icon="inline-start" aria-hidden="true" /> Live
                </>
              )}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw data-icon="inline-start" aria-hidden="true" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {err && <p className="text-destructive mb-3 text-sm">{err}</p>}
          {!data?.exists && !err && (
            <p className="text-muted-foreground text-sm">
              Log file not found yet. Traefik writes it under <code>logs/traefik/access.log</code> after
              traffic.
            </p>
          )}
          {data?.exists && (
            <div className="border-border max-h-[60vh] overflow-auto rounded-lg border font-mono text-xs">
              <table className="w-full border-collapse">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">Time</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="px-2 py-1.5 font-medium">Method</th>
                    <th className="px-2 py-1.5 font-medium">Host</th>
                    <th className="px-2 py-1.5 font-medium">Path</th>
                    <th className="px-2 py-1.5 font-medium">Client</th>
                    <th className="px-2 py-1.5 font-medium">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={`${row.raw}-${i}`} className="border-border border-t">
                      <td className="text-muted-foreground px-2 py-1 whitespace-nowrap">
                        {row.time ? new Date(row.time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-2 py-1">
                        <Badge variant={statusTone(row.status)}>{row.status ?? '—'}</Badge>
                      </td>
                      <td className="px-2 py-1">{row.method ?? '—'}</td>
                      <td className="max-w-[12rem] truncate px-2 py-1">{row.host ?? '—'}</td>
                      <td className="max-w-[16rem] truncate px-2 py-1">{row.path ?? '—'}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{row.client ?? '—'}</td>
                      <td className="px-2 py-1">{row.duration_ms ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
