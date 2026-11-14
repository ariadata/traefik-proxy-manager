import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const tone: Record<string, string> = {
  valid: 'border-success/30 bg-success/15 text-success',
  expiring_soon: 'border-warning/30 bg-warning/15 text-warning',
  expired: 'border-destructive/30 bg-destructive/15 text-destructive',
  error: 'border-destructive/30 bg-destructive/15 text-destructive',
  unknown: 'border-border bg-muted text-muted-foreground',
  active: 'border-success/30 bg-success/15 text-success',
  enabled: 'border-success/30 bg-success/15 text-success',
  disabled: 'border-border bg-muted text-muted-foreground',
}

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium capitalize', tone[status] || tone.unknown)}
    >
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}
