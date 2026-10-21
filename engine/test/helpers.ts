import { createEngine } from '../src/engine.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { DEMO_ORG, demoData } from '../src/seed.ts'
import { memoryStore } from '../src/store.ts'

// Hashing the demo passwords is deliberately slow, so do it once.
const base = demoData(nodePlatform)
export const freshDemoData = () => structuredClone(base)

/** A fresh engine on the demo firm, and a way to act as any of its people. */
export function demo() {
  const engine = createEngine(memoryStore(freshDemoData()), nodePlatform)
  const as = (who: 'dan' | 'jo' | 'kofi' | 'ryan' | 'tom' | 'sam', orgId = DEMO_ORG) => engine.as({ userId: `usr_${who}`, orgId })
  return { engine, as }
}

export const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id).sort()
