/**
 * Recordings kept on the phone until their words are in the report: when the
 * signal went mid-sentence, or the phone couldn't write anything without
 * signal. The list is kept in device storage and the sound in the app's own
 * documents, so both survive the app being closed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { Recording } from '@/kit/hearing';

const KEY = 'ardent-voice-waiting';
const FOLDER = 'ardent-voice';

let list: Recording[] = [];
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: Recording[]) {
  list = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

/** Read the list from storage once. */
export function loadRecordings() {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const kept = raw ? (JSON.parse(raw) as Recording[]) : [];
      // Anything added since the app opened stays too.
      list = [...kept.filter((r) => !list.some((x) => x.id === r.id)), ...list];
      listeners.forEach((l) => l());
      sweep();
    })
    .catch(() => undefined);
  return loaded;
}

/** Clear sound files left behind when the app was closed mid-hold: anything not on the list. */
function sweep() {
  const dir = voiceFolder();
  if (!dir) return;
  try {
    // By name, as phones write the same path more than one way.
    const mine = new Set(list.map((r) => r.uri.split('/').pop()));
    for (const f of dir.list()) if (f instanceof File && !mine.has(f.name)) f.delete();
  } catch {
    // Left for next time.
  }
}

/** The app's folder for recordings, made on first use. Undefined in the browser preview. */
export function voiceFolder(): Directory | undefined {
  if (Platform.OS === 'web') return undefined;
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const newRecordingId = () => `voice_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function keepRecording(r: Recording) {
  set([...list.filter((x) => x.id !== r.id), r]);
}

export function updateRecording(id: string, change: Partial<Recording>) {
  set(list.map((r) => (r.id === id ? { ...r, ...change } : r)));
}

/** Done with a recording: off the list and off the phone. */
export function dropRecording(id: string) {
  const r = list.find((x) => x.id === id);
  if (r) clearSound(r.uri);
  set(list.filter((x) => x.id !== id));
}

/** Clear a sound file that was kept but isn't needed, such as one recorded while the phone wrote every word. */
export function clearSound(uri: string | undefined | null) {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** Clear everything, for signing out or a demo reset. */
export function clearAllRecordings() {
  set([]);
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, FOLDER);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing kept.
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void loadRecordings();
  return () => listeners.delete(l);
};
const snapshot = () => list;

/** Every kept recording, updating as they're written up. */
export function useRecordings(): Recording[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
