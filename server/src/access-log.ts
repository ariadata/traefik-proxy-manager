import { existsSync, openSync, readSync, fstatSync, closeSync, statSync } from 'node:fs'
import { cfg } from './config.js'

export type AccessLogEntry = {
  raw: string
  json: Record<string, unknown> | null
  time: string | null
  client: string | null
  method: string | null
  host: string | null
  path: string | null
  status: number | null
  duration_ms: number | null
}

function parseLine(line: string): AccessLogEntry {
  const trimmed = line.trim()
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    json = null
  }

  if (!json) {
    return {
      raw: trimmed,
      json: null,
      time: null,
      client: null,
      method: null,
      host: null,
      path: null,
      status: null,
      duration_ms: null,
    }
  }

  const durationNs = Number(json.Duration ?? json.duration ?? 0)
  const durationMs = Number.isFinite(durationNs) ? Math.round(durationNs / 1e6) : null

  return {
    raw: trimmed,
    json,
    time: String(json.StartUTC ?? json.time ?? json.StartLocal ?? '') || null,
    client: String(json.ClientHost ?? json.ClientAddr ?? json.ClientUsername ?? '') || null,
    method: String(json.RequestMethod ?? json.method ?? '') || null,
    host: String(json.RequestHost ?? json.RouterName ?? '') || null,
    path: String(json.RequestPath ?? json.RequestURI ?? '') || null,
    status: Number(json.DownstreamStatus ?? json.OriginStatus ?? json.status ?? NaN) || null,
    duration_ms: durationMs,
  }
}

/** Read last `maxLines` from the Traefik access log (JSON lines preferred). */
export function tailAccessLog(maxLines = 200, maxBytes = 512_000): {
  path: string
  exists: boolean
  size: number
  mtime: string | null
  lines: AccessLogEntry[]
} {
  const filePath = cfg.accessLogPath
  if (!existsSync(filePath)) {
    return { path: filePath, exists: false, size: 0, mtime: null, lines: [] }
  }

  const st = statSync(filePath)
  const fd = openSync(filePath, 'r')
  try {
    const size = fstatSync(fd).size
    const readLen = Math.min(size, maxBytes)
    const start = size - readLen
    const buf = Buffer.alloc(readLen)
    readSync(fd, buf, 0, readLen, start)
    let text = buf.toString('utf8')
    if (start > 0) {
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    const parts = text.split('\n').filter((l) => l.trim().length > 0)
    const sliced = parts.slice(-Math.max(1, Math.min(maxLines, 2000)))
    return {
      path: filePath,
      exists: true,
      size: st.size,
      mtime: st.mtime.toISOString(),
      lines: sliced.map(parseLine),
    }
  } finally {
    closeSync(fd)
  }
}
