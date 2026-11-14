import { useId, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { Globe, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

function splitRaw(raw: string): string[] {
  return raw
    .split(/[\n\r\t,; ]+/)
    .map(normalizeDomain)
    .filter(Boolean)
}

/** Loose hostname check — allows wildcards like *.example.com */
function isLikelyDomain(value: string): boolean {
  if (value === 'localhost') return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true
  return /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
}

type DomainTagsInputProps = {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}

export function DomainTagsInput({
  id,
  value,
  onChange,
  placeholder = 'example.com',
  disabled,
  invalid,
  className,
}: DomainTagsInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [armed, setArmed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [shake, setShake] = useState<string | null>(null)

  function flashHint(text: string) {
    setHint(text)
    window.setTimeout(() => setHint((h) => (h === text ? null : h)), 2200)
  }

  function flashShake(tag: string) {
    setShake(tag)
    window.setTimeout(() => setShake((s) => (s === tag ? null : s)), 420)
  }

  function addMany(raw: string) {
    const parts = splitRaw(raw)
    if (parts.length === 0) return false

    const next = [...value]
    let added = 0
    for (const part of parts) {
      if (!isLikelyDomain(part)) {
        flashHint(`“${part}” doesn’t look like a domain`)
        setDraft(part)
        return false
      }
      if (next.some((x) => x === part)) {
        flashShake(part)
        flashHint(`“${part}” is already added`)
        continue
      }
      next.push(part)
      added += 1
    }

    if (added > 0) {
      onChange(next)
      setDraft('')
      setArmed(false)
      flashHint(added === 1 ? `Added ${next[next.length - 1]}` : `Added ${added} domains`)
      return true
    }

    setDraft('')
    return false
  }

  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag))
    setArmed(false)
    flashHint(`Removed ${tag}`)
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (draft.trim()) addMany(draft)
      return
    }

    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      if (armed) {
        remove(value[value.length - 1]!)
        setArmed(false)
      } else {
        setArmed(true)
      }
      return
    }

    if (e.key === 'Escape') {
      setArmed(false)
      setDraft('')
      return
    }

    setArmed(false)
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    if (!text || (!/[\s,;]/.test(text) && !text.includes('\n'))) return
    e.preventDefault()
    addMany(`${draft} ${text}`)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="group"
        className={cn(
          'bg-background dark:bg-card flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 shadow-xs transition-[border-color,box-shadow]',
          'border-border focus-within:border-primary/50 focus-within:ring-ring/30 focus-within:ring-[3px]',
          invalid && 'border-destructive ring-destructive/20 ring-[3px]',
          disabled && 'pointer-events-none opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, index) => {
          const isArmed = armed && index === value.length - 1
          return (
            <span
              key={tag}
              className={cn(
                'inline-flex h-7 max-w-full items-center gap-1 rounded-md border pl-2 pr-1 text-[13px] font-medium transition-colors',
                isArmed
                  ? 'border-destructive/40 bg-destructive/15 text-destructive'
                  : 'border-border bg-secondary text-secondary-foreground',
                shake === tag && 'animate-[tag-shake_0.35s_ease-in-out]',
              )}
            >
              <Globe className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className="font-mono truncate text-[12px]">{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground grid size-5 shrink-0 place-items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(tag)
                }}
              >
                <X className="size-3.5" />
              </button>
            </span>
          )
        })}

        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-describedby={`${inputId}-hint`}
          className="placeholder:text-muted-foreground h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-sm outline-none"
          onChange={(e) => {
            setArmed(false)
            const next = e.target.value
            if (next.endsWith(',')) {
              addMany(next)
              return
            }
            setDraft(next)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            setArmed(false)
            if (draft.trim()) addMany(draft)
          }}
        />

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 px-2"
          disabled={disabled || !draft.trim()}
          onClick={(e) => {
            e.stopPropagation()
            addMany(draft)
            inputRef.current?.focus()
          }}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      <div
        id={`${inputId}-hint`}
        className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <p>
          <kbd className="bg-muted border-border rounded border px-1.5 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{' '}
          or{' '}
          <kbd className="bg-muted border-border rounded border px-1.5 py-0.5 font-mono text-[10px]">
            ,
          </kbd>{' '}
          to add ·{' '}
          <kbd className="bg-muted border-border rounded border px-1.5 py-0.5 font-mono text-[10px]">
            ⌫
          </kbd>{' '}
          twice to remove last
        </p>
        <p className={cn(hint?.startsWith('“') || hint?.includes('doesn’t') ? 'text-destructive' : '')}>
          {hint ?? `${value.length} domain${value.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <style>{`
        @keyframes tag-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  )
}
