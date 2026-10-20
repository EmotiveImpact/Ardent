#!/usr/bin/env node
// Generates every homepage image with OpenAI's GPT Image model.
//
//   OPENAI_API_KEY=sk-... node scripts/generate-images.mjs          # all missing images
//   OPENAI_API_KEY=sk-... node scripts/generate-images.mjs hero cta # just these ids
//   FORCE=1 ...                                                     # regenerate existing files
//
// Prompts live in images/prompts.json so they can be tuned without touching code.
// OPENAI_IMAGE_MODEL and OPENAI_IMAGE_QUALITY override the model and quality.

import { readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const imagesDir = join(root, 'images')
const config = JSON.parse(await readFile(join(imagesDir, 'prompts.json'), 'utf8'))

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set.')
  process.exit(1)
}

const model = process.env.OPENAI_IMAGE_MODEL || config.model
const quality = process.env.OPENAI_IMAGE_QUALITY || 'high'
const only = process.argv.slice(2)
const targets = config.images.filter((img) => only.length === 0 || only.includes(img.id))

const exists = (path) => access(path).then(() => true, () => false)

async function generate(img) {
  const out = join(imagesDir, img.file)
  if (!process.env.FORCE && (await exists(out))) {
    console.log(`skip  ${img.id} (already exists)`)
    return
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt: `${img.prompt}\n\n${config.style}`,
      size: img.size,
      quality,
      output_format: 'jpeg',
      n: 1,
    }),
  })

  if (!res.ok) {
    throw new Error(`${img.id}: ${res.status} ${await res.text()}`)
  }

  const { data } = await res.json()
  await writeFile(out, Buffer.from(data[0].b64_json, 'base64'))
  console.log(`saved ${img.id} -> images/${img.file}`)
}

let failed = 0
for (const img of targets) {
  try {
    await generate(img)
  } catch (err) {
    failed++
    console.error(`fail  ${err.message}`)
  }
}
process.exit(failed ? 1 : 0)
