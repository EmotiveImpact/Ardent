/**
 * Ardent Field's hold on the engine: the one Connection, the engineer's day
 * kept on the phone, and the save queue that gets every change to the engine
 * when there's signal.
 *
 * - Everything the engineer does is saved on the phone first (as an Op in the
 *   outbox) and the screen moves straight away: the day on screen is the last
 *   copy from the engine with every waiting change applied on top.
 * - The outbox is sent in order. Each change carries a request id made once
 *   and kept, so if the signal drops mid-send and it goes again, the engine
 *   applies it once.
 * - No signal or a failed send: try again later, waiting longer each time.
 *   The engine saying no (forbidden, invalid, not found): the change is set
 *   aside where the engineer can see it, never retried forever.
 * - The outbox, the set-aside list and the day are kept in device storage, so
 *   jobs open with no signal and nothing is lost if the app is closed.
 *
 * Adapted from Haumea's save queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';

import type { Day } from '@/data/types';
import { connectDemo, connectLive, type Connection, type KeyValue, type Me } from '@/engine/connect';
import { ukDay } from '@/kit/format';

import { applyLocal, settle } from './apply';
import { backoff, type CallOp, classify, isLocal, type Op, reason, resolveIds, type SetAside } from './ops';
import { clearAllPhotos, clearPhoto, readPhoto } from './photos';
import { pullDay } from './pull';

const storage: KeyValue = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};

/** A running engine to talk to, set for a dev build. Without it the app runs the engine itself on the demo firm. */
export const ENGINE_URL = process.env.EXPO_PUBLIC_ARDENT_ENGINE?.trim() || undefined;

/** Kept by the Connection (src/engine/connect.ts). */
const SESSION_KEY = 'ardent.session';
/** Who was signed in last, so the phone opens their day with no signal. */
const ME_KEY = 'ardent.field.me';
const NO_SIGNAL_KEY = 'ardent.field.demo-no-signal';
const SHARE_KEY = 'ardent.field.share-location';
const dayKey = (userId: string) => `ardent.field.v1.${userId}`;

interface Kept {
  base?: Day;
  outbox: Op[];
  setAside: SetAside[];
  /** The UK day the engineer last started the day on the mode picker. */
  startedOn?: string;
}

export interface FieldState extends Kept {
  phase: 'starting' | 'signed_out' | 'signed_in';
  mode: 'live' | 'demo';
  me?: Me;
  /** Signal, as far as the phone can tell. */
  online: boolean;
  /** Demo only: hold every change on the phone as if there were no signal. */
  noSignal: boolean;
  /** The engineer said yes to sharing where the van is while on shift. Asked once, changeable on Me. */
  shareLocation?: boolean;
  sending: boolean;
  loading: boolean;
  /** Why the day couldn't be read, when there's no copy on the phone. */
  loadError?: string;
  /** The engine asked for sign-in again. Waiting changes are kept for when they do. */
  sessionEnded?: { email: string; waiting: number };
  lastSentAt?: string;
}

export interface Snapshot {
  state: FieldState;
  /** The day as the engineer sees it: the engine's copy with every waiting change on top. */
  day?: Day;
}

const initial: FieldState = { phase: 'starting', mode: ENGINE_URL ? 'live' : 'demo', outbox: [], setAside: [], online: true, noSignal: false, sending: false, loading: false };

/** Any local id still in the change means the record it needs was never saved. */
function needsUnsaved(op: Op): boolean {
  if (op.kind === 'upload') return isLocal(op.photoId);
  const scan = (v: unknown): boolean =>
    typeof v === 'string' ? isLocal(v) : Array.isArray(v) ? v.some(scan) : v && typeof v === 'object' ? Object.values(v).some(scan) : false;
  return scan(op.args);
}

class FieldStore {
  private snapshot: Snapshot = { state: initial };
  private listeners = new Set<() => void>();
  private connection?: Connection;
  /** The phone has some connection. Only no connection at all holds the queue back. */
  private netOnline = true;
  /** The engine looked reachable last time NetInfo checked. */
  private reachable = true;
  private flushing = false;
  private again = false;
  private wantPull = false;
  private needsRestore = false;
  private timer?: ReturnType<typeof setTimeout>;
  private saving: Promise<unknown> = Promise.resolve();
  private started?: Promise<void>;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  get state() {
    return this.snapshot.state;
  }
  get day() {
    return this.snapshot.day;
  }
  get conn() {
    if (!this.connection) throw new Error('not connected yet');
    return this.connection;
  }

  private set(patch: Partial<FieldState>) {
    const prev = this.snapshot;
    const state = { ...prev.state, ...patch };
    const day =
      state.base === prev.state.base && state.outbox === prev.state.outbox ? prev.day : state.base ? state.outbox.reduce(applyLocal, state.base) : undefined;
    this.snapshot = { state, day };
    for (const fn of this.listeners) fn();
  }

  private save() {
    const { me, base, outbox, setAside, startedOn } = this.state;
    if (!me) return this.saving;
    const kept: Kept = { base, outbox, setAside, startedOn };
    const json = JSON.stringify(kept);
    this.saving = this.saving.then(() => storage.set(dayKey(me.user.id), json)).catch(() => undefined);
    return this.saving;
  }

  private online() {
    return this.state.mode === 'demo' ? !this.state.noSignal : this.netOnline;
  }

  /** Open the connection and pick up where the phone left off. Safe to call more than once. */
  start() {
    this.started ??= this.boot();
    return this.started;
  }

  private async boot() {
    const noSignal = this.state.mode === 'demo' && (await storage.get(NO_SIGNAL_KEY)) === '1';
    const share = await storage.get(SHARE_KEY);
    this.set({ shareLocation: share === null ? undefined : share === '1' });
    this.connection = ENGINE_URL ? connectLive(ENGINE_URL, storage) : await connectDemo(storage);
    this.set({ noSignal, online: this.state.mode === 'demo' ? !noSignal : true });

    // Signal means the engine answers, not that some other site does.
    if (ENGINE_URL) {
      NetInfo.configure({
        reachabilityUrl: `${ENGINE_URL.replace(/\/+$/, '')}/health`,
        reachabilityMethod: 'GET',
        reachabilityTest: async (r) => r.status === 200,
      });
    }
    NetInfo.addEventListener((s) => {
      // A connection that can't reach the engine is found out by sending,
      // which backs off, so the check is a hint and never a lock.
      const was = this.reachable;
      this.netOnline = s.isConnected !== false;
      this.reachable = this.netOnline && s.isInternetReachable !== false;
      if (this.state.mode === 'live') this.set({ online: this.reachable });
      if (this.reachable && !was) this.kick();
    });
    if (Platform.OS === 'web') {
      // Browsers don't always tell NetInfo when the connection comes back.
      const seen = (on: boolean) => () => {
        this.netOnline = this.reachable = on;
        if (this.state.mode === 'live') this.set({ online: on });
        if (on) this.kick();
      };
      window.addEventListener('online', seen(true));
      window.addEventListener('offline', seen(false));
    }
    AppState.addEventListener('change', (s) => {
      if (s === 'active') void this.refresh();
    });

    let me = await this.connection.restore().catch(() => undefined);
    if (!me && this.state.mode === 'live') {
      // No signal at launch: the session may still be good. Open the day kept on the phone.
      const [token, cached] = await Promise.all([storage.get(SESSION_KEY), storage.get(ME_KEY)]);
      if (token && cached) {
        me = JSON.parse(cached) as Me;
        this.needsRestore = true;
      }
    }
    if (!me) {
      const cached = await storage.get(ME_KEY);
      const last = cached ? (JSON.parse(cached) as Me) : undefined;
      const kept = last ? await this.read(last.user.id) : undefined;
      const waiting = kept?.outbox.length ?? 0;
      this.set({ phase: 'signed_out', sessionEnded: last && waiting ? { email: last.user.email, waiting } : undefined });
      return;
    }
    await this.open(me);
  }

  private async read(userId: string): Promise<Kept | undefined> {
    const raw = await storage.get(dayKey(userId));
    try {
      const kept = raw ? (JSON.parse(raw) as Kept) : undefined;
      // A day kept before the price list, van stock and gas records came to the phone.
      if (kept?.base) kept.base = { ...kept.base, priceList: kept.base.priceList ?? [], stock: kept.base.stock ?? [], gasRecords: kept.base.gasRecords ?? [] };
      return kept;
    } catch {
      return undefined;
    }
  }

  private async open(me: Me) {
    await storage.set(ME_KEY, JSON.stringify(me));
    const kept = await this.read(me.user.id);
    this.set({ phase: 'signed_in', me, sessionEnded: undefined, loadError: undefined, base: kept?.base, outbox: kept?.outbox ?? [], setAside: kept?.setAside ?? [], startedOn: kept?.startedOn });
    this.wantPull = true;
    await this.flush();
  }

  async signIn(email: string, password: string) {
    await this.start();
    const me = await this.conn.signIn(email, password);
    // Field is for people on the tools: the sign-in has to be linked to a crew record.
    try {
      await this.conn.client.operators.me();
    } catch (e) {
      await this.conn.signOut();
      if ((e as { code?: string }).code === 'not_found') throw new Error("This sign-in isn't linked to anyone on the crew yet. Ask the office to link you.");
      throw e;
    }
    await this.open(me);
  }

  /** Sign out and clear the phone. Anything still waiting is lost, so the screen warns first. */
  async signOut() {
    const me = this.state.me;
    await this.conn.signOut().catch(() => undefined);
    if (me) await storage.remove(dayKey(me.user.id));
    await storage.remove(ME_KEY);
    clearAllPhotos();
    this.set({ phase: 'signed_out', me: undefined, base: undefined, outbox: [], setAside: [], startedOn: undefined, sessionEnded: undefined });
  }

  /** Demo only: put the demo firm back as it started. */
  async resetDemo() {
    if (!this.conn.reset) return;
    await this.conn.reset();
    clearAllPhotos();
    this.set({ base: undefined, outbox: [], setAside: [], startedOn: undefined });
    await this.save();
    await this.refresh();
  }

  /** Demo only: pretend there's no signal, so changes wait on the phone. */
  async setNoSignal(noSignal: boolean) {
    await storage.set(NO_SIGNAL_KEY, noSignal ? '1' : '0');
    this.set({ noSignal, online: !noSignal });
    if (!noSignal) await this.flush();
  }

  /** Share where the van is while on shift, or stop. */
  async setShareLocation(share: boolean) {
    await storage.set(SHARE_KEY, share ? '1' : '0');
    this.set({ shareLocation: share });
  }

  /**
   * Queue a change where only the newest matters (where the van is): any
   * older one still waiting goes. The one being sent right now is left alone.
   */
  async enqueueLatest(op: CallOp) {
    if (!this.state.base) return;
    const [head, ...rest] = this.state.outbox;
    const stale = (o: Op) => o.kind === 'call' && o.method === op.method;
    const kept = head ? [...(this.flushing || !stale(head) ? [head] : []), ...rest.filter((o) => !stale(o))] : [];
    this.set({ outbox: [...kept, op] });
    await this.save();
    void this.flush();
  }

  async startDay() {
    this.set({ startedOn: ukDay(new Date().toISOString()) });
    await this.save();
  }

  /** Save changes on the phone, show them, then send them when there's signal. */
  async enqueue(...ops: Op[]) {
    if (!this.state.base) throw new Error("Your day isn't on the phone yet");
    this.set({ outbox: [...this.state.outbox, ...ops] });
    await this.save();
    void this.flush();
  }

  /** Send what's waiting, then read the day fresh from the engine. */
  refresh() {
    this.wantPull = true;
    return this.flush();
  }

  /** Put a set-aside change back in the queue, at the end. */
  async retry(op: Op) {
    this.set({ setAside: this.state.setAside.filter((s) => s.op.id !== op.id), outbox: [...this.state.outbox, { ...op, attempts: 0, nextAt: undefined, lastError: undefined }] });
    await this.save();
    void this.flush();
  }

  /** Let a set-aside change go. */
  async dismiss(op: Op) {
    if (op.kind === 'upload') clearPhoto(op.file);
    this.set({ setAside: this.state.setAside.filter((s) => s.op.id !== op.id) });
    await this.save();
  }

  /** Signal is back: stop waiting out the backoff and send now. */
  private kick() {
    const [head, ...rest] = this.state.outbox;
    if (head?.nextAt) this.set({ outbox: [{ ...head, nextAt: undefined }, ...rest] });
    void this.flush();
  }

  /** Send the outbox in order, then read the day if asked. */
  async flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return;
    }
    if (this.state.phase !== 'signed_in' || !this.online()) return;
    this.flushing = true;
    clearTimeout(this.timer);
    try {
      if (this.needsRestore) {
        const me = await this.conn.restore().catch(() => undefined);
        if (me) this.needsRestore = false;
        else if (!(await storage.get(SESSION_KEY))) return this.endSession();
        else return;
      }
      if (this.state.outbox.length) this.set({ sending: true });
      while (this.state.outbox.length && this.online()) {
        const op = this.state.outbox[0];
        if (op.nextAt && op.nextAt > Date.now()) {
          this.timer = setTimeout(() => void this.flush(), op.nextAt - Date.now());
          break;
        }
        try {
          const result = await this.send(op);
          this.sent(op, result);
        } catch (e) {
          const what = classify(e);
          if (what === 'set_aside') this.putAside(op, reason(e));
          else if (what === 'sign_in') return this.endSession();
          else {
            this.failed(op, e);
            break;
          }
        }
        await this.save();
      }
      if (!this.state.outbox.length && this.wantPull && this.online()) await this.pull();
    } finally {
      this.flushing = false;
      if (this.state.sending) this.set({ sending: false });
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    }
  }

  private async send(op: Op): Promise<unknown> {
    if (needsUnsaved(op)) throw { code: 'not_found', message: "the record this needed wasn't saved" };
    if (op.kind === 'call') return this.conn.call(op.method, op.args, op.requestId);
    let bytes: Blob | Uint8Array;
    try {
      bytes = await readPhoto(op.file);
    } catch {
      throw { code: 'not_found', message: 'the photo is no longer on the phone' };
    }
    return this.conn.uploadPhoto(op.photoId, bytes, op.contentType);
  }

  private sent(op: Op, result: unknown) {
    // The engine answered, whatever the last signal check said.
    if (!this.state.online) this.set({ online: true });
    const { base, outbox } = this.state;
    const rest = outbox.slice(1);
    if (!base) return this.set({ outbox: rest });
    if (op.kind === 'upload') {
      const uri = (result as { uri?: string } | undefined)?.uri;
      // Demo mode has no file store: the image stays on the phone as the photo.
      if (!uri) return this.set({ outbox: rest, lastSentAt: new Date().toISOString() });
      clearPhoto(op.file);
      return this.set({ outbox: rest, base: { ...base, photos: base.photos.map((p) => (p.id === op.photoId ? { ...p, uri } : p)) }, lastSentAt: new Date().toISOString() });
    }
    const { day, ids } = settle(base, op, result);
    this.set({ base: day, outbox: Object.keys(ids).length ? rest.map((o) => resolveIds(o, ids)) : rest, lastSentAt: new Date().toISOString() });
  }

  private failed(op: Op, e: unknown) {
    const attempts = op.attempts + 1;
    const next = { ...op, attempts, nextAt: Date.now() + backoff(attempts), lastError: reason(e) };
    this.set({ outbox: [next, ...this.state.outbox.slice(1)] });
    void this.save();
    this.timer = setTimeout(() => void this.flush(), next.nextAt - Date.now());
  }

  private putAside(op: Op, why: string) {
    this.set({ outbox: this.state.outbox.slice(1), setAside: [...this.state.setAside, { op, reason: why, at: new Date().toISOString() }] });
  }

  private async endSession() {
    const me = this.state.me;
    await this.save();
    this.set({ phase: 'signed_out', sessionEnded: me ? { email: me.user.email, waiting: this.state.outbox.length } : undefined });
  }

  private async pull() {
    this.wantPull = false;
    this.set({ loading: true });
    try {
      const day = await pullDay(this.conn.client);
      // A change made while reading goes on top of the next read instead.
      if (this.state.outbox.length) this.wantPull = true;
      else this.set({ base: day, loadError: undefined });
      await this.save();
    } catch (e) {
      if (classify(e) === 'sign_in') return this.endSession();
      this.wantPull = true;
      this.set({ loadError: reason(e) });
    } finally {
      this.set({ loading: false });
    }
  }
}

export const field = new FieldStore();

// Lets the browser tests reach the queue (set EXPO_PUBLIC_ARDENT_TEST=1 when exporting). Off in every normal build.
if (process.env.EXPO_PUBLIC_ARDENT_TEST === '1') (globalThis as { __ardentField?: FieldStore }).__ardentField = field;
