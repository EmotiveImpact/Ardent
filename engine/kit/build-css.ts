// Writes kit/ardent.css, the CSS variables Ardent Core reads, from the kit tokens.
// Run with `npm run kit` after changing tokens.ts; CI checks the file is current.
import { writeFileSync, readFileSync } from 'node:fs'
import { bloom, color, motion, radius } from './tokens.ts'

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const name = (k: string) => (k.startsWith('fg') && k !== 'fg' ? `fg-${kebab(k.slice(2)).slice(1)}` : kebab(k))

const lines = [
  ...Object.entries(color).map(([k, v]) => `  --${name(k)}: ${v};`),
  '',
  `  --radius: ${radius.lg / 16}rem;`,
  ...Object.entries(radius).map(([k, v]) => `  --kit-radius-${k}: ${v}px;`),
  '',
  `  --motion-enter: ${motion.enter}ms;`,
  `  --motion-light: ${motion.light}ms;`,
  `  --motion-stagger: ${motion.stagger}ms;`,
  `  --motion-hold: ${motion.hold}ms;`,
  `  --ease: ${motion.ease};`,
  '',
  ...Object.entries(bloom).map(([k, v]) => `  --bloom-${kebab(k).replace(/_/g, '-')}: ${v.color};`),
]

const css = `/* Generated from engine/kit/tokens.ts by \`npm run kit\`. Do not edit by hand. */
:root {
  color-scheme: dark;
${lines.join('\n')}
}
`
const out = new URL('./ardent.css', import.meta.url)
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== css) {
    console.error('kit/ardent.css is out of date: run `npm run kit` in engine/')
    process.exit(1)
  }
} else writeFileSync(out, css)
