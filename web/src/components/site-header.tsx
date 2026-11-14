import { LogOut } from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useTpm } from '@/contexts/tpm-context'

export function SiteHeader({ title }: { title?: string }) {
  const { status, logout } = useTpm()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 py-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 data-vertical:h-4" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {title ?? 'Traefik Proxy Manager'}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {status?.username ? (
            <span className="text-muted-foreground hidden max-w-32 truncate text-sm sm:inline">
              {status.username}
            </span>
          ) : null}
          <ModeToggle />
          <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut aria-hidden />
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
