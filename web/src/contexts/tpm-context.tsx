import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import type {
  AccessList,
  AuditEntry,
  Certificate,
  DeadHost,
  DnsResolver,
  HeaderRule,
  ProviderDef,
  ProxyHost,
  RedirectionHost,
  SslCheck,
  Status,
  Stream,
  WafProfile,
} from '@/lib/types'

type TpmContextValue = {
  status: Status | null
  error: string | null
  banner: string | null
  setBanner: (v: string | null) => void
  hosts: ProxyHost[]
  resolvers: DnsResolver[]
  providers: ProviderDef[]
  sslChecks: SslCheck[]
  certs: Certificate[]
  headerRules: HeaderRule[]
  wafProfiles: WafProfile[]
  accessLists: AccessList[]
  redirections: RedirectionHost[]
  deadHosts: DeadHost[]
  streams: Stream[]
  auditLog: AuditEntry[]
  refreshStatus: () => Promise<Status>
  refreshAll: () => Promise<void>
  logout: () => Promise<void>
  loading: boolean
}

const TpmContext = createContext<TpmContextValue | null>(null)

export function TpmProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [hosts, setHosts] = useState<ProxyHost[]>([])
  const [resolvers, setResolvers] = useState<DnsResolver[]>([])
  const [providers, setProviders] = useState<ProviderDef[]>([])
  const [sslChecks, setSslChecks] = useState<SslCheck[]>([])
  const [certs, setCerts] = useState<Certificate[]>([])
  const [headerRules, setHeaderRules] = useState<HeaderRule[]>([])
  const [wafProfiles, setWafProfiles] = useState<WafProfile[]>([])
  const [accessLists, setAccessLists] = useState<AccessList[]>([])
  const [redirections, setRedirections] = useState<RedirectionHost[]>([])
  const [deadHosts, setDeadHosts] = useState<DeadHost[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refreshStatus = useCallback(async () => {
    const data = await api<Status>('/api/v1/status')
    setStatus(data)
    return data
  }, [])

  const refreshAll = useCallback(async () => {
    const [h, r, p, s, c, hdr, waf, acl, redir, dead, st, aud] = await Promise.all([
      api<{ items: ProxyHost[] }>('/api/v1/hosts'),
      api<{ items: DnsResolver[] }>('/api/v1/resolvers'),
      api<{ items: ProviderDef[] }>('/api/v1/providers'),
      api<{ items: SslCheck[] }>('/api/v1/ssl/checks'),
      api<{ items: Certificate[] }>('/api/v1/certificates'),
      api<{ items: HeaderRule[] }>('/api/v1/headers'),
      api<{ items: WafProfile[] }>('/api/v1/waf'),
      api<{ items: AccessList[] }>('/api/v1/access-lists'),
      api<{ items: RedirectionHost[] }>('/api/v1/redirections'),
      api<{ items: DeadHost[] }>('/api/v1/dead-hosts'),
      api<{ items: Stream[] }>('/api/v1/streams'),
      api<{ items: AuditEntry[] }>('/api/v1/audit'),
    ])
    setHosts(h.items)
    setResolvers(r.items)
    setProviders(p.items)
    setSslChecks(s.items)
    setCerts(c.items)
    setHeaderRules(hdr.items)
    setWafProfiles(waf.items)
    setAccessLists(acl.items)
    setRedirections(redir.items)
    setDeadHosts(dead.items)
    setStreams(st.items)
    setAuditLog(aud.items)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/v1/logout', { method: 'POST' })
    } finally {
      setHosts([])
      setResolvers([])
      setProviders([])
      setSslChecks([])
      setCerts([])
      setHeaderRules([])
      setWafProfiles([])
      setAccessLists([])
      setRedirections([])
      setDeadHosts([])
      setStreams([])
      setAuditLog([])
      await refreshStatus()
    }
  }, [refreshStatus])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await refreshStatus()
        if (cancelled) return
        if (s.authenticated) await refreshAll()
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshAll, refreshStatus])

  const value = useMemo(
    () => ({
      status,
      error,
      banner,
      setBanner,
      hosts,
      resolvers,
      providers,
      sslChecks,
      certs,
      headerRules,
      wafProfiles,
      accessLists,
      redirections,
      deadHosts,
      streams,
      auditLog,
      refreshStatus,
      refreshAll,
      logout,
      loading,
    }),
    [
      status,
      error,
      banner,
      hosts,
      resolvers,
      providers,
      sslChecks,
      certs,
      headerRules,
      wafProfiles,
      accessLists,
      redirections,
      deadHosts,
      streams,
      auditLog,
      refreshStatus,
      refreshAll,
      logout,
      loading,
    ],
  )

  return <TpmContext.Provider value={value}>{children}</TpmContext.Provider>
}

export function useTpm() {
  const ctx = useContext(TpmContext)
  if (!ctx) throw new Error('useTpm must be used within TpmProvider')
  return ctx
}
