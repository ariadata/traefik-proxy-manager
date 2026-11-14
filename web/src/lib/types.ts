export type Status = {
  app: string
  version: string
  runtime: string
  uptime_seconds: number
  setup_required: boolean
  authenticated: boolean
  username: string | null
  secrets_configured: boolean
  paths: { sqlite: string; vhosts: string }
}

export type PathRewriteRule = {
  regex: string
  replacement: string
}

export type ProxyHost = {
  id: string
  domain_names: string[]
  forward_scheme: 'http' | 'https'
  forward_host: string
  forward_port: number
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: boolean
  enabled: boolean
  waf_profile_ids: string[]
  header_rule_ids: string[]
  access_list_id: string | null
  rate_limit_enabled: boolean
  rate_limit_average: number
  rate_limit_burst: number
  rate_limit_period: string
  path_rewrites: PathRewriteRule[]
  advanced_yaml: string
}

export type Stream = {
  id: string
  name: string
  protocol: 'tcp' | 'udp'
  entry_port: number
  forward_host: string
  forward_port: number
  sni_hosts: string[]
  tls_mode: 'off' | 'terminate' | 'passthrough'
  cert_resolver: string
  enabled: boolean
}

export type AuditEntry = {
  id: number
  at: string
  actor: string
  action: string
  entity: string
  entity_id: string
  summary: string
  detail: Record<string, unknown>
}

export type AccessListClient = {
  address: string
  directive: 'allow' | 'deny'
}

export type AccessList = {
  id: string
  name: string
  satisfy: string
  pass_auth: boolean
  clients: AccessListClient[]
  auth_users: { username: string }[]
  enabled: boolean
}

export type RedirectionHost = {
  id: string
  domain_names: string[]
  forward_scheme: 'http' | 'https'
  forward_host: string
  forward_path: string
  preserve_path: boolean
  status_code: 301 | 302
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: boolean
  enabled: boolean
  access_list_id: string | null
}

export type DeadHost = {
  id: string
  domain_names: string[]
  status_code: number
  body_html: string
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: boolean
  enabled: boolean
  access_list_id: string | null
}

export type Certificate = {
  id: string
  kind: string
  domain_names: string[]
  status: string
}

export type HeaderRule = {
  id: string
  name: string
  type: string
  header_name: string
  header_value: string
  enabled: boolean
}

export type WafProfile = {
  id: string
  name: string
  kind: string
  enabled: boolean
  config: Record<string, unknown>
}

export type ProviderDef = {
  id: string
  label: string
  challenge: string
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[]
}

export type DnsResolver = {
  id: string
  name: string
  provider: string
  acme_email: string
  challenge: string
  is_default: boolean
  credential_keys: string[]
}

export type SslCheck = {
  domain: string
  status: string
  expires_at: string | null
  checked_at: string
  error: string | null
}
