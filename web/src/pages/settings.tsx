import { useState } from 'react'
import type { FormEvent } from 'react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useTpm } from '@/contexts/tpm-context'
import { useTheme } from '@/hooks/use-theme'
import { api } from '@/lib/api'

export function SettingsPage() {
  const { status } = useTpm()
  const { theme } = useTheme()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    if (newPassword !== confirm) {
      setErr('New passwords do not match')
      return
    }
    setBusy(true)
    try {
      await api('/api/v1/me/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      setMsg('Password updated')
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runtime</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <div className="font-mono">sqlite: {status?.paths.sqlite}</div>
          <div className="font-mono">vhosts: {status?.paths.vhosts}</div>
          <div className="flex items-center gap-2 pt-2">
            Theme: <span className="text-foreground font-medium">{theme}</span>
            <ModeToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            Updates the local admin password for {status?.username ?? 'admin'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="flex max-w-md flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cur-pw">Current password</FieldLabel>
                <Input
                  id="cur-pw"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-pw">New password</FieldLabel>
                <Input
                  id="new-pw"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-pw">Confirm new password</FieldLabel>
                <Input
                  id="confirm-pw"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </Field>
            </FieldGroup>
            {err && <p className="text-destructive text-sm">{err}</p>}
            {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
