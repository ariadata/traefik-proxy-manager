import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatItem = {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

export function StatsCards({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    title={String(item.value)}
                    className={cn(
                      'truncate text-2xl font-bold tracking-tight',
                      item.tone === 'danger' && 'text-destructive',
                      item.tone === 'success' && 'text-success',
                      item.tone === 'warning' && 'text-warning',
                    )}
                  >
                    {item.value}
                  </span>
                  {item.hint && (
                    <span className="text-muted-foreground truncate text-xs">{item.hint}</span>
                  )}
                </div>
              </div>
              <div className="bg-secondary text-secondary-foreground rounded-lg p-3">
                <item.icon className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
