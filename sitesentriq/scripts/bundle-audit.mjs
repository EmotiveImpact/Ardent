import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const kib = 1024

const budgets = [
  {
    name: 'web',
    dir: 'apps/web/dist/assets',
    maxJsGzipKiB: 1050,
    maxLargestJsRawKiB: 750,
    maxCssGzipKiB: 75,
  },
  {
    name: 'marketing',
    dir: 'apps/marketing/dist/assets',
    maxJsGzipKiB: 225,
    maxLargestJsRawKiB: 250,
    maxCssGzipKiB: 60,
  },
]

function sizeReport(dir, ext) {
  const files = readdirSync(dir).filter(file => file.endsWith(ext))
  const entries = files.map(file => {
    const path = join(dir, file)
    const raw = statSync(path).size
    const gzip = gzipSync(readFileSync(path)).length
    return { file, raw, gzip }
  })
  entries.sort((a, b) => b.gzip - a.gzip)
  return {
    entries,
    raw: entries.reduce((sum, entry) => sum + entry.raw, 0),
    gzip: entries.reduce((sum, entry) => sum + entry.gzip, 0),
    largestRaw: entries.reduce((largest, entry) => Math.max(largest, entry.raw), 0),
  }
}

function toKiB(bytes) {
  return bytes / kib
}

let failed = false

for (const budget of budgets) {
  if (!existsSync(budget.dir)) {
    console.error(`[bundle-audit] ${budget.name}: missing ${budget.dir}; run npm run build:all first.`)
    failed = true
    continue
  }

  const js = sizeReport(budget.dir, '.js')
  const css = sizeReport(budget.dir, '.css')
  const topJs = js.entries.slice(0, 5)

  console.log(
    `[bundle-audit] ${budget.name}: js gzip ${toKiB(js.gzip).toFixed(1)} KiB, ` +
      `largest js raw ${toKiB(js.largestRaw).toFixed(1)} KiB, ` +
      `css gzip ${toKiB(css.gzip).toFixed(1)} KiB`,
  )
  for (const entry of topJs) {
    console.log(
      `  - ${entry.file}: ${toKiB(entry.raw).toFixed(1)} KiB raw, ` +
        `${toKiB(entry.gzip).toFixed(1)} KiB gzip`,
    )
  }

  if (toKiB(js.gzip) > budget.maxJsGzipKiB) {
    console.error(
      `[bundle-audit] ${budget.name}: JS gzip exceeds budget ` +
        `(${toKiB(js.gzip).toFixed(1)} > ${budget.maxJsGzipKiB} KiB).`,
    )
    failed = true
  }
  if (toKiB(js.largestRaw) > budget.maxLargestJsRawKiB) {
    console.error(
      `[bundle-audit] ${budget.name}: largest JS chunk exceeds budget ` +
        `(${toKiB(js.largestRaw).toFixed(1)} > ${budget.maxLargestJsRawKiB} KiB).`,
    )
    failed = true
  }
  if (toKiB(css.gzip) > budget.maxCssGzipKiB) {
    console.error(
      `[bundle-audit] ${budget.name}: CSS gzip exceeds budget ` +
        `(${toKiB(css.gzip).toFixed(1)} > ${budget.maxCssGzipKiB} KiB).`,
    )
    failed = true
  }
}

if (failed) {
  process.exitCode = 1
}
