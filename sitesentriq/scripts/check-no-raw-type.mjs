#!/usr/bin/env node
// Raw-type baseline gate.
//
// Scans apps/web/src for hardcoded `text-[<number>px]` Tailwind classes and
// compares the total to a frozen baseline. The typography codemod migrated the
// bulk of these to --text-* tokens; a tail of genuinely-custom sizes remains.
// This gate PREVENTS REGROWTH: count may shrink (cleanup), never grow.
//
// Exit 0 when count <= BASELINE, exit 1 when count > BASELINE.
//
// Pure Node ESM, no dependencies.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Baseline measured at 2026-05-29. Lower this as the tail is cleaned up.
const BASELINE = 120

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCAN_DIR = join(ROOT, 'apps/web/src')
const PATTERN = /text-\[[0-9]+px\]/g
const EXTENSIONS = ['.ts', '.tsx']

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      files.push(...walk(path))
    } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      files.push(path)
    }
  }
  return files
}

function main() {
  let total = 0
  const perFile = []

  for (const file of walk(SCAN_DIR)) {
    const matches = readFileSync(file, 'utf8').match(PATTERN)
    if (matches && matches.length > 0) {
      total += matches.length
      perFile.push({ file: relative(ROOT, file), count: matches.length })
    }
  }

  perFile.sort((a, b) => b.count - a.count)

  if (total > BASELINE) {
    const delta = total - BASELINE
    console.error('\n✖ check:no-raw-type FAILED — raw text-[Npx] sizes grew above baseline.\n')
    console.error(`  baseline: ${BASELINE}`)
    console.error(`  current:  ${total}`)
    console.error(`  delta:    +${delta} new occurrence(s)\n`)
    console.error('  Use the --text-* design tokens instead of hardcoded pixel sizes.')
    console.error('  Offending files (descending count):\n')
    for (const { file, count } of perFile) {
      console.error(`    ${String(count).padStart(4)}  ${file}`)
    }
    console.error('')
    process.exit(1)
  }

  const delta = BASELINE - total
  console.log(
    `✔ check:no-raw-type OK — ${total} raw text-[Npx] occurrence(s) across ${perFile.length} file(s) ` +
      `(baseline ${BASELINE}, ${delta} under).`,
  )
  process.exit(0)
}

main()
