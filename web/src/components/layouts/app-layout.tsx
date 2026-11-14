import type { CSSProperties, ReactNode } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useTpm } from '@/contexts/tpm-context'

export function AppLayout({
  children,
  title,
  description,
}: {
  children: ReactNode
  title?: string
  description?: string
}) {
  const { banner, setBanner } = useTpm()

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '13rem',
          '--sidebar-width-icon': '3rem',
          '--header-height': 'calc(var(--spacing) * 14)',
        } as CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        <SiteHeader title={title} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
              {banner && (
                <Alert className="flex items-start justify-between gap-3">
                  <AlertDescription className="flex-1">{banner}</AlertDescription>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setBanner(null)}>
                    Dismiss
                  </Button>
                </Alert>
              )}
              {(title || description) && (
                <div className="flex flex-col gap-1">
                  {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
                  {description && <p className="text-muted-foreground text-sm">{description}</p>}
                </div>
              )}
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
