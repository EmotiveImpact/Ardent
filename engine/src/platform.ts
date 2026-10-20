/**
 * The few things the engine needs from where it runs: password hashing,
 * session tokens and link signing. The engine itself imports nothing from
 * Node, so the same records and rules can also run inside a browser for the
 * published demos (see kit/demo in the apps).
 */
export interface Platform {
  hashPassword(password: string): string
  verifyPassword(password: string, stored: string | undefined): boolean
  newToken(): string
  hashToken(token: string): string
  /** HMAC-SHA256, base64url. */
  sign(secret: string, text: string): string
  /** Constant-time string comparison. */
  same(a: string, b: string): boolean
  randomSecret(): string
}
