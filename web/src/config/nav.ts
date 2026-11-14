export const pageMeta = {
  dashboard: {
    title: 'Dashboard',
    description: 'Control plane health, hosts, and certificate posture.',
  },
  hosts: {
    title: 'Proxy hosts',
    description: 'Writes Traefik file-provider YAML under vhosts/.',
  },
  redirections: {
    title: 'Redirections',
    description: 'Domain → target URL via Traefik redirectRegex.',
  },
  deadHosts: {
    title: 'Parked hosts',
    description: 'Reserve domains on a static or custom page.',
  },
  accessLists: {
    title: 'Access lists',
    description: 'Reusable IP allow/deny + BasicAuth packs.',
  },
  streams: {
    title: 'Streams',
    description: 'TCP/UDP port forwards (Traefik restart for entryPoints).',
  },
  audit: {
    title: 'Audit log',
    description: 'Admin mutation history.',
  },
  ssl: {
    title: 'SSL & resolvers',
    description: 'DNS ACME resolvers, custom PEMs, and certificate checker.',
  },
  headers: {
    title: 'Header rules',
    description: 'Shared Traefik header middlewares — attach on hosts.',
  },
  waf: {
    title: 'WAF profiles',
    description: 'Lean 5-pack seeded on first boot — attach on hosts.',
  },
  accessLog: {
    title: 'Access log',
    description: 'Live tail of Traefik JSON access log.',
  },
  backups: {
    title: 'Backups',
    description: 'SQLite + certs archive create / restore.',
  },
  settings: {
    title: 'Settings',
    description: 'Paths, theme, and runtime info.',
  },
} as const
