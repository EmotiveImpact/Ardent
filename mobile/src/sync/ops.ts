/**
 * A change waiting to reach the engine. Every change the engineer makes is
 * saved on the phone as one of these first, then sent in order when there's
 * signal. Adapted from Haumea's save queue.
 */
export interface CallOp {
  kind: 'call';
  /** Ours, for lists and keys. */
  id: string;
  /** Made once and kept, so a replay after lost signal is applied once by the engine. */
  requestId: string;
  /** An ArdentClient method, e.g. "jobs.setStatus". */
  method: string;
  args: unknown[];
  /** For changes that create a record: the id the phone uses until the engine gives the real one. */
  localId?: string;
  /** What the engineer did, in their words, for the sync list. */
  label: string;
  /** When the engineer did it. */
  at: string;
  attempts: number;
  /** Not before this time (ms), after a failed try. */
  nextAt?: number;
  lastError?: string;
}

/** The image for a photo record, sent once the record exists. */
export interface UploadOp {
  kind: 'upload';
  id: string;
  /** The photo record's id: a local id until photos.add has gone. */
  photoId: string;
  /** Where the shrunk JPEG sits on the phone. */
  file: string;
  contentType: string;
  label: string;
  at: string;
  attempts: number;
  nextAt?: number;
  lastError?: string;
}

export type Op = CallOp | UploadOp;

/** A change the engine refused. Kept where the engineer can see it, never retried on its own. */
export interface SetAside {
  op: Op;
  reason: string;
  at: string;
}

const uuid = () => globalThis.crypto.randomUUID().replace(/-/g, '');

/** Local ids carry this prefix until the engine hands back the real one. */
export const LOCAL = 'local_';
export const localId = (prefix: string) => `${LOCAL}${prefix}_${uuid().slice(0, 16)}`;
export const isLocal = (id: string | undefined) => !!id?.startsWith(LOCAL);

export function callOp(method: string, args: unknown[], label: string, opts: { localId?: string; at?: string } = {}): CallOp {
  return { kind: 'call', id: uuid(), requestId: uuid(), method, args, localId: opts.localId, label, at: opts.at ?? new Date().toISOString(), attempts: 0 };
}

export function uploadOp(photoId: string, file: string, label: string): UploadOp {
  return { kind: 'upload', id: uuid(), photoId, file, contentType: 'image/jpeg', label, at: new Date().toISOString(), attempts: 0 };
}

/** Swap every local id the engine has now answered for its real id. */
export function resolveIds<T>(value: T, ids: Record<string, string>): T {
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return ids[v] ?? v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  return swap(value) as T;
}

/** Wait before the next try: 2s, 4s, 8s ... up to two minutes, with a little jitter. */
export const backoff = (attempts: number) => Math.min(120_000, 1000 * 2 ** Math.min(attempts, 7)) * (0.8 + Math.random() * 0.4);

type Coded = { code?: string; message?: string };

/**
 * What to do when a send fails. No signal, a timeout or the engine falling
 * over: try again later. The engine saying no (forbidden, invalid, not
 * found): set it aside. A session that ran out: wait for sign-in.
 */
export function classify(e: unknown): 'retry' | 'set_aside' | 'sign_in' {
  const { code, message = '' } = (e ?? {}) as Coded;
  if (code === 'unauthenticated') return 'sign_in';
  // A bare "HTTP 502" came from something in the way, not the engine.
  if ((code === 'forbidden' || code === 'invalid' || code === 'not_found') && !/^HTTP \d+$/.test(message)) return 'set_aside';
  return 'retry';
}

/** The engine's reason, as a sentence. */
export function reason(e: unknown) {
  const m = String((e as Coded)?.message ?? e ?? 'Something went wrong');
  return m.charAt(0).toUpperCase() + m.slice(1);
}
