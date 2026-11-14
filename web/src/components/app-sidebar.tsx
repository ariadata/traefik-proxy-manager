import type { ComponentProps } from 'react'
import {
  Activity,
  Archive,
  ArrowRightLeft,
  Cable,
  Gauge,
  Heading,
  Network,
  ParkingCircle,
  ScrollText,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldHalf,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { NavMain } from '@/components/nav-main'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useTpm } from '@/contexts/tpm-context'

const nav = [
  {
    label: 'Control plane',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: Gauge },
      { title: 'Hosts', url: '/hosts', icon: Server },
      { title: 'Redirections', url: '/redirections', icon: ArrowRightLeft },
      { title: 'Parked hosts', url: '/parked-hosts', icon: ParkingCircle },
      { title: 'Access lists', url: '/access-lists', icon: Shield },
      { title: 'Streams', url: '/streams', icon: Cable },
      { title: 'SSL', url: '/ssl', icon: ShieldHalf },
      { title: 'Headers', url: '/headers', icon: Heading },
      { title: 'WAF', url: '/waf', icon: ShieldAlert },
      { title: 'Access log', url: '/access-log', icon: Activity },
      { title: 'Backups', url: '/backups', icon: Archive },
      { title: 'Audit', url: '/audit', icon: ScrollText },
      { title: 'Settings', url: '/settings', icon: Settings2 },
    ],
  },
]

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { status } = useTpm()

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="gap-2.5"
              aria-label="Traefik Proxy Manager"
              render={<Link to="/dashboard" />}
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Network className="size-4" aria-hidden />
              </div>
              <div className="grid min-w-0 flex-1 text-left leading-none">
                <span className="truncate text-sm font-semibold tracking-tight">Traefik</span>
                <span className="-mt-px truncate text-[11px] font-medium tracking-tight opacity-70">
                  Proxy Manager
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {nav.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t">
        <div className="text-muted-foreground truncate px-2 py-1.5 text-[10px] leading-none tracking-wide">
          TPM v{status?.version ?? '1.0.0'}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
