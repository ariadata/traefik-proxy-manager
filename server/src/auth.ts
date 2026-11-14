import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { getDb } from './db.js'

const SESSION_COOKIE = 'tpm_session'
/** Default signed-in window when “Remember me” is off. */
export const SESSION_TTL_DEFAULT_MS = 12 * 60 * 60 * 1000
/** Extended window when “Remember me” is on. */
export const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000

export type AdminRow = {
  id: number
  username: string
  password_hash: string
}

export function countAdmins(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM admins`).get() as { n: number }
  return row.n
}

export async function createAdmin(username: string, password: string): Promise<AdminRow> {
  if (countAdmins() > 0) throw new Error('admin already exists')
  const now = new Date().toISOString()
  const hash = await bcrypt.hash(password, 12)
  const info = getDb()
    .prepare(
      `INSERT INTO admins (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    )
    .run(username, hash, now, now)
  return { id: Number(info.lastInsertRowid), username, password_hash: hash }
}

export async function verifyLogin(username: string, password: string): Promise<AdminRow | null> {
  const row = getDb()
    .prepare(`SELECT id, username, password_hash FROM admins WHERE username = ?`)
    .get(username) as AdminRow | undefined
  if (!row) {
    // Constant-ish work even on miss
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinuuO')
    return null
  }
  if (!(await bcrypt.compare(password, row.password_hash))) return null
  return row
}

export async function changePassword(
  adminId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) throw new Error('password must be at least 8 characters')
  const row = getDb()
    .prepare(`SELECT id, username, password_hash FROM admins WHERE id = ?`)
    .get(adminId) as AdminRow | undefined
  if (!row) throw new Error('admin not found')
  if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
    throw new Error('current password is incorrect')
  }
  const now = new Date().toISOString()
  const hash = await bcrypt.hash(newPassword, 12)
  getDb()
    .prepare(`UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hash, now, adminId)
  // Revoke all sessions so password rotation actually logs other clients out
  getDb().prepare(`DELETE FROM sessions WHERE admin_id = ?`).run(adminId)
}

export function createSession(
  adminId: number,
  ttlMs: number = SESSION_TTL_DEFAULT_MS,
): string {
  const id = randomUUID()
  const now = new Date()
  getDb()
    .prepare(`INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, adminId, new Date(now.getTime() + ttlMs).toISOString(), now.toISOString())
  return id
}

export function deleteSession(id: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
}

export function pruneExpiredSessions(): void {
  getDb().prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString())
}

export function adminFromSession(sessionId: string | undefined): AdminRow | null {
  if (!sessionId) return null
  const sess = getDb()
    .prepare(`SELECT id, admin_id, expires_at FROM sessions WHERE id = ?`)
    .get(sessionId) as { id: string; admin_id: number; expires_at: string } | undefined
  if (!sess) return null
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    deleteSession(sess.id)
    return null
  }
  const admin = getDb()
    .prepare(`SELECT id, username, password_hash FROM admins WHERE id = ?`)
    .get(sess.admin_id) as AdminRow | undefined
  return admin ?? null
}

/** True when the client reached us over HTTPS (direct or via Traefik `X-Forwarded-Proto`). */
export function isHttpsRequest(req: FastifyRequest): boolean {
  const xf = req.headers['x-forwarded-proto']
  const raw = Array.isArray(xf) ? xf[0] : xf
  if (typeof raw === 'string' && raw.length > 0) {
    return raw.split(',')[0]!.trim().toLowerCase() === 'https'
  }
  return req.protocol === 'https'
}

export function setSessionCookie(
  reply: FastifyReply,
  req: FastifyRequest,
  sessionId: string,
  /** Omit for a browser-session cookie; otherwise max-age in seconds. */
  maxAgeSec?: number,
): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    ...(maxAgeSec != null ? { maxAge: maxAgeSec } : {}),
  })
}

/** Clear both Secure and non-Secure variants so logout works after HTTP↔HTTPS switches. */
export function clearSessionCookie(reply: FastifyReply): void {
  const base = { path: '/', httpOnly: true, sameSite: 'lax' as const }
  reply.clearCookie(SESSION_COOKIE, { ...base, secure: false })
  reply.clearCookie(SESSION_COOKIE, { ...base, secure: true })
}

export function readSessionId(req: FastifyRequest): string | undefined {
  return req.cookies?.[SESSION_COOKIE]
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<AdminRow | null> {
  const admin = adminFromSession(readSessionId(req))
  if (!admin) {
    reply.code(401).send({ error: 'unauthorized' })
    return null
  }
  return admin
}

/** Simple in-memory login throttle (per IP) — counts failed attempts only. */
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

/** Returns false when this IP is currently locked out. Does not increment. */
export function checkLoginRateLimit(ip: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now()
  const cur = loginAttempts.get(ip)
  if (!cur || cur.resetAt < now) {
    loginAttempts.delete(ip)
    return true
  }
  return cur.count < max
}

/** Record a failed login (call only after invalid credentials). */
export function recordLoginFailure(ip: string, max = 8, windowMs = 60_000): void {
  const now = Date.now()
  const cur = loginAttempts.get(ip)
  if (!cur || cur.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs })
    return
  }
  cur.count += 1
  void max
}

export function clearLoginRateLimit(ip: string): void {
  loginAttempts.delete(ip)
}
