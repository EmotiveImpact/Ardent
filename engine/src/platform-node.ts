// The engine's platform on a server: scrypt passwords, random tokens, HMAC links.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { hashPassword, verifyPassword } from './auth.ts'
import type { Platform } from './platform.ts'

export const nodePlatform: Platform = {
  hashPassword,
  verifyPassword,
  newToken: () => randomBytes(32).toString('base64url'),
  hashToken: (token) => createHash('sha256').update(token).digest('base64url'),
  sign: (secret, text) => createHmac('sha256', secret).update(text).digest('base64url'),
  same: (a, b) => {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && timingSafeEqual(x, y)
  },
  randomSecret: () => randomBytes(32).toString('base64url'),
}
