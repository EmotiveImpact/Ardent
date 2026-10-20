// The engine (src/engine) runs inside the app in demo mode and expects two
// things a browser has but a phone's JavaScript engine may not.
import { randomUUID } from 'expo-crypto';

const g = globalThis as { crypto?: { randomUUID?: () => string }; structuredClone?: <T>(v: T) => T };

if (!g.crypto) g.crypto = {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = randomUUID;
// Every record is plain JSON, so a JSON round trip is a faithful copy.
if (!g.structuredClone) g.structuredClone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
