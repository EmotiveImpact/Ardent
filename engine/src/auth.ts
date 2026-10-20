/**
 * Sign-in: passwords and session tokens.
 *
 * Passwords are stored as scrypt hashes with a per-user salt. Session tokens
 * are 32 random bytes handed to the app once; the engine keeps only their
 * SHA-256, so a copy of the data file can't be used to sign in as anyone.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 32

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  const [scheme, salt, hash] = (stored ?? '').split('$')
  if (scheme !== 'scrypt' || !salt || !hash) {
    // Spend the same effort so a missing user can't be told apart by timing.
    scryptSync(password, 'no-user', KEY_LENGTH)
    return false
  }
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

