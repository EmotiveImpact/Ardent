/**
 * Ardent's fee and the "Pay on your own phone" code, shared by the engine
 * and the phone. The code has to work for an invoice raised with no signal,
 * so the phone signs the invoice into the link itself and the engine checks
 * the signature when the customer opens it.
 */

/** Ardent's fee on each payment: 0.2%, never more than £5 (decided 21 October 2026). */
export const FEE = { rate: 0.002, cap: 500 }

/** Ardent's fee in pence on a payment of `amount` pence. */
export const ardentFee = (amount: number) => Math.min(Math.round(amount * FEE.rate), FEE.cap)

/**
 * Stripe's own fee, until Stripe says the real one: its published UK prices
 * on 21 October 2026 for a standard UK card. Pay by bank isn't published, so
 * this uses the price Xero's users pay. Only ever shown as an estimate.
 */
export function stripeFeeEstimate(method: 'card' | 'tap' | 'pay_by_bank' | 'direct_debit', amount: number) {
  if (method === 'tap') return Math.round(amount * 0.014) + 20
  if (method === 'pay_by_bank') return Math.min(Math.round(amount * 0.005) + 20, 500)
  if (method === 'direct_debit') return Math.min(Math.max(Math.round(amount * 0.01), 20), 400)
  return Math.round(amount * 0.015) + 20
}

/** Ardent's fee handed back when part of a payment is refunded, in proportion. */
export const feeBack = (fee: number, amount: number, refunded: number) => (amount > 0 ? Math.round((fee * refunded) / amount) : 0)

// SHA-256 and HMAC in plain code, so the phone signs exactly as the engine checks.
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const utf8 = (s: string) => new TextEncoder().encode(s)

function sha256(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const len = data.length
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6)
  padded.set(data)
  padded[len] = 0x80
  const bits = len * 8
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000))
  view.setUint32(padded.length - 4, bits >>> 0)
  const w = new Array<number>(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2]
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  h.forEach((x, i) => ov.setUint32(i * 4, x >>> 0))
  return out
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

/** HMAC-SHA256 as hex. */
export function hmacHex(key: string, message: string): string {
  let k: Uint8Array = utf8(key)
  if (k.length > 64) k = sha256(k)
  const block = new Uint8Array(64)
  block.set(k)
  const inner = new Uint8Array(64 + utf8(message).length)
  const outer = new Uint8Array(64 + 32)
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36
    outer[i] = block[i] ^ 0x5c
  }
  inner.set(utf8(message), 64)
  outer.set(sha256(inner), 64)
  return hex(sha256(outer))
}

/** SHA-256 as hex, for tests and checks. */
export const sha256Hex = (s: string) => hex(sha256(utf8(s)))

const toB64url = (s: string) => {
  const bytes = utf8(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** An invoice raised on the phone, carried inside the pay code. */
export interface OfflineInvoice {
  /** The phone's own id for the invoice until the engine numbers it. */
  offlineId: string
  orgId: string
  jobId: string
  operatorId: string
  /** VAT in basis points. */
  vatRate: number
  /** [description, quantity, unit price in pence, kind]. */
  lines: [string, number, number, 'labour' | 'material' | 'callout' | 'other'][]
  /** When the phone raised it. */
  at: string
}

/** The query string for an offline pay code: the invoice and the phone's signature. */
export function signOffline(inv: OfflineInvoice, key: string): string {
  const d = toB64url(JSON.stringify(inv))
  return `o=${d}&s=${hmacHex(key, d)}`
}

/** The invoice inside a pay code, if it was signed with `key`. */
export function readOffline(d: string, s: string, key: string): OfflineInvoice | undefined {
  if (!d || !s || hmacHex(key, d) !== s) return undefined
  try {
    const inv = JSON.parse(fromB64url(d)) as OfflineInvoice
    const ok =
      typeof inv.offlineId === 'string' &&
      typeof inv.jobId === 'string' &&
      Array.isArray(inv.lines) &&
      inv.lines.length > 0 &&
      inv.lines.length <= 40 &&
      inv.lines.every((l) => Array.isArray(l) && typeof l[0] === 'string' && Number.isFinite(l[1]) && l[1] > 0 && Number.isInteger(l[2]) && l[2] >= 0)
    return ok ? inv : undefined
  } catch {
    return undefined
  }
}
