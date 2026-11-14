/** Known ACME DNS providers (lego codes) + typical credential fields for the UI. */
export type ProviderField = {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
}

export type ProviderDef = {
  id: string
  label: string
  challenge: 'dns01' | 'http01' | 'tlsalpn01'
  fields: ProviderField[]
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    challenge: 'dns01',
    fields: [
      {
        key: 'CLOUDFLARE_DNS_API_TOKEN',
        label: 'API Token',
        secret: true,
        placeholder: 'Zone:DNS:Edit + Zone:Zone:Read',
      },
    ],
  },
  {
    id: 'arvancloud',
    label: 'ArvanCloud',
    challenge: 'dns01',
    fields: [{ key: 'ARVANCLOUD_API_KEY', label: 'API Key', secret: true }],
  },
  {
    id: 'route53',
    label: 'AWS Route53',
    challenge: 'dns01',
    fields: [
      { key: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID', secret: true },
      { key: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Access Key', secret: true },
      { key: 'AWS_REGION', label: 'Region', placeholder: 'eu-central-1' },
      { key: 'AWS_HOSTED_ZONE_ID', label: 'Hosted Zone ID (optional)' },
    ],
  },
  {
    id: 'gandi',
    label: 'Gandi',
    challenge: 'dns01',
    fields: [{ key: 'GANDIV5_PERSONAL_ACCESS_TOKEN', label: 'Personal Access Token', secret: true }],
  },
  {
    id: 'digitalocean',
    label: 'DigitalOcean',
    challenge: 'dns01',
    fields: [{ key: 'DO_AUTH_TOKEN', label: 'API Token', secret: true }],
  },
  {
    id: 'http',
    label: 'HTTP-01 (no DNS API)',
    challenge: 'http01',
    fields: [],
  },
]

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}
