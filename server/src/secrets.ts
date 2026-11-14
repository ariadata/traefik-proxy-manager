import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { cfg } from './config.js'

const PREFIX = 'tpm1:'

function keyBytes(): Buffer {
  const raw = cfg.secretsKey.trim()
  if (!raw) {
    throw new Error('TPM_SECRETS_KEY is not set')
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

export function secretsConfigured(): boolean {
  return cfg.secretsKey.trim().length > 0
}

export function encryptJson(value: unknown): Buffer {
  const key = keyBytes()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([Buffer.from(PREFIX, 'utf8'), iv, tag, enc])
  return packed
}

export function decryptJson<T = unknown>(blob: Buffer | Uint8Array | null | undefined): T | null {
  if (!blob || blob.length === 0) return null
  const buf = Buffer.from(blob)
  const prefix = buf.subarray(0, PREFIX.length).toString('utf8')
  if (prefix !== PREFIX) {
    throw new Error('unsupported secret blob format')
  }
  const iv = buf.subarray(PREFIX.length, PREFIX.length + 12)
  const tag = buf.subarray(PREFIX.length + 12, PREFIX.length + 28)
  const data = buf.subarray(PREFIX.length + 28)
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as T
}
