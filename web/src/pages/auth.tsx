import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, Lock, Network } from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useTpm } from '@/contexts/tpm-context'
import { api } from '@/lib/api'

const REMEMBER_KEY = 'tpm_remember_me'

function readRememberPref(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== '0'
  } catch {
    return true
  }
}

function writeRememberPref(value: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function AuthPage() {
  const { status, refreshStatus, refreshAll, loading } = useTpm()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(readRememberPref)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (loading || !status) {
    return (
      <div
        className="bg-muted text-muted-foreground grid min-h-svh place-items-center text-sm"
        role="status"
        aria-live="polite"
      >
        Loading…
      </div>
    )
  }

  if (status.authenticated) return <Navigate to="/dashboard" replace />

  const isSetup = status.setup_required

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setPending(true)
    writeRememberPref(remember)
    try {
      await api(isSetup ? '/api/v1/setup' : '/api/v1/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, remember }),
      })
      await refreshStatus()
      await refreshAll()
      setPassword('')
    } catch (err) {
      const raw = (err as Error).message || 'Something went wrong.'
      setMsg(raw.charAt(0).toUpperCase() + raw.slice(1))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden p-6 md:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-muted"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_100%,color-mix(in_oklch,var(--accent)_55%,transparent),transparent_50%),radial-gradient(ellipse_40%_30%_at_0%_100%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_45%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,color-mix(in_oklch,var(--border)_70%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--border)_70%,transparent)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
      />

      <div className="absolute top-4 right-4 z-10">
        <ModeToggle />
      </div>

      <div className="relative z-10 flex w-full max-w-[22rem] flex-col gap-8">
        <div
          className="flex items-center justify-center gap-3.5"
          aria-label="Traefik Proxy Manager"
        >
          <div className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-xl shadow-sm">
            <Network className="size-7" aria-hidden="true" />
          </div>
          <div className="grid min-w-0 text-left leading-none">
            <span className="text-2xl font-semibold tracking-tight">Traefik</span>
            <span className="mt-1 text-base font-medium tracking-tight opacity-70">
              Proxy Manager
            </span>
          </div>
        </div>

        <Card className="border-border/80 shadow-md ring-1 ring-black/3 dark:ring-white/5">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-xl">
              <h1 className="text-xl leading-tight font-semibold tracking-tight">
                {isSetup ? 'Create admin' : 'Sign in'}
              </h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} aria-busy={pending}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <Input
                    id="username"
                    name="username"
                    className="h-10"
                    placeholder="admin"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={pending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    className="h-10"
                    type="password"
                    placeholder="••••••••"
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={isSetup ? 8 : 1}
                    required
                    disabled={pending}
                  />
                  {isSetup && (
                    <FieldDescription>At least 8 characters.</FieldDescription>
                  )}
                </Field>
                {!isSetup && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                      disabled={pending}
                      aria-label="Keep me signed in"
                    />
                    Keep me signed in
                  </label>
                )}
                {msg && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{msg}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="h-10 w-full" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      {isSetup ? 'Creating…' : 'Signing in…'}
                    </>
                  ) : isSetup ? (
                    'Create admin'
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <Lock className="size-3 opacity-70" aria-hidden="true" />
          Locally secured
        </p>
      </div>
    </div>
  )
}
