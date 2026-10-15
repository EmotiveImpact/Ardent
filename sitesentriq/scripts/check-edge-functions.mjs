#!/usr/bin/env node
// Edge-function type checking.
//
// Supabase edge functions are Deno + TypeScript and are otherwise never
// type-checked. This script runs `deno check` on every
// supabase/functions/*/index.ts entrypoint (skipping a _shared dir if present)
// and exits non-zero if any fail.
//
// Deno is not required locally: if `deno --version` fails the script prints a
// notice and exits 0 so it never blocks local runs. CI installs Deno.
//
// Pure Node ESM, no dependencies.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions')

function denoAvailable() {
  const result = spawnSync('deno', ['--version'], { encoding: 'utf8' })
  return result.status === 0
}

function collectEntrypoints() {
  if (!existsSync(FUNCTIONS_DIR)) return []
  const entrypoints = []
  for (const entry of readdirSync(FUNCTIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === '_shared') continue
    const indexPath = join(FUNCTIONS_DIR, entry.name, 'index.ts')
    if (existsSync(indexPath)) entrypoints.push(indexPath)
  }
  return entrypoints.sort()
}

function main() {
  if (!denoAvailable()) {
    console.log('• check:edge — deno not installed, skipping locally (CI installs it).')
    process.exit(0)
  }

  const entrypoints = collectEntrypoints()
  if (entrypoints.length === 0) {
    console.log('• check:edge — no supabase/functions/*/index.ts found, nothing to check.')
    process.exit(0)
  }

  console.log(`• check:edge — running \`deno check\` on ${entrypoints.length} edge function(s)...\n`)

  const failures = []
  for (const file of entrypoints) {
    const rel = relative(ROOT, file)
    const result = spawnSync('deno', ['check', file], { encoding: 'utf8', stdio: 'inherit' })
    if (result.status !== 0) {
      failures.push(rel)
      console.error(`  ✖ ${rel}`)
    } else {
      console.log(`  ✔ ${rel}`)
    }
  }

  if (failures.length > 0) {
    console.error(`\n✖ check:edge FAILED — ${failures.length} edge function(s) did not type-check:\n`)
    for (const file of failures) console.error(`    ${file}`)
    console.error('')
    process.exit(1)
  }

  console.log(`\n✔ check:edge OK — all ${entrypoints.length} edge function(s) type-checked.`)
  process.exit(0)
}

main()
