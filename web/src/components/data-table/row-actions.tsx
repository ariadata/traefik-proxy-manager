import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type RowActionsProps = {
  label: string
  /** Disambiguates duplicate labels (e.g. same domain on multiple rows). */
  id?: string
  onDelete: () => void | Promise<void>
  extra?: { label: string; onSelect: () => void }[]
}

export function RowActions({ label, id, onDelete, extra }: RowActionsProps) {
  const menuLabel = id ? `${label} (${id.slice(0, 8)})` : label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="data-popup-open:bg-muted"
            aria-label={`Open menu for ${menuLabel}`}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {extra && extra.length > 0 && (
          <>
            <DropdownMenuGroup>
              {extra.map((item) => (
                <DropdownMenuItem key={item.label} className="cursor-pointer" onClick={item.onSelect}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={() => void onDelete()}
          >
            <Trash2 aria-hidden="true" />
            Delete {menuLabel}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
