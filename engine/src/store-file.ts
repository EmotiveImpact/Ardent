// The engine's records in memory, written through to a JSON file after every change.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Data, emptyData, type Store } from './store.ts'

export function fileStore(path: string, fallback: () => Data = emptyData): Store {
  const data: Data = existsSync(path) ? { ...emptyData(), ...JSON.parse(readFileSync(path, 'utf8')) } : fallback()
  const store: Store = {
    data,
    commit() {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify(data))
      renameSync(`${path}.tmp`, path)
    },
  }
  if (!existsSync(path)) store.commit()
  return store
}
