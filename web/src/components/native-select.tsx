import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input bg-background text-foreground h-9 w-full rounded-lg border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-card',
        className,
      )}
      {...props}
    />
  )
}
