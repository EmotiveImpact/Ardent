// Where the vans are, and how far each is from a job.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEngine } from '../src/engine.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { DEMO_ORG } from '../src/seed.ts'
import { memoryStore } from '../src/store.ts'
import { tomtomDriveMinutes } from '../src/tomtom.ts'
import { demo, freshDemoData } from './helpers.ts'

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()

test("an engineer shares their own van's whereabouts while on shift, and only the office sees it", async () => {
  const { as } = demo()
  const kofi = as('kofi').client
  await kofi.operators.setLocation('opr_02', { lat: 53.47, lng: -2.24, accuracy: 12.4, at: ago(2) })
  await assert.rejects(kofi.operators.setLocation('opr_03', { lat: 53.47, lng: -2.24, at: ago(1) }), { code: 'forbidden' })
  await assert.rejects(as('jo').client.operators.setLocation('opr_02', { lat: 53.47, lng: -2.24, at: ago(1) }), { code: 'forbidden' }, 'the office reads it, never sets it')
  await assert.rejects(kofi.operators.setLocation('opr_02', { lat: 91, lng: 0, at: ago(1) }), { code: 'invalid' })

  const seen = (await as('jo').client.operators.list()).find((o) => o.id === 'opr_02')?.location
  assert.deepEqual({ ...seen, at: undefined }, { lat: 53.47, lng: -2.24, accuracy: 12, at: undefined })
  assert.equal((await as('ryan').client.operators.list()).find((o) => o.id === 'opr_02')?.location, undefined, "other engineers don't see it")
  assert.ok((await kofi.operators.me()).location, 'the engineer sees their own')

  await kofi.operators.setLocation('opr_02', { lat: 50, lng: -1, at: ago(10) })
  assert.equal((await kofi.operators.me()).location?.lat, 53.47, 'a late reading from lost signal changes nothing')

  await kofi.operators.setState('opr_02', 'off_shift')
  assert.equal((await kofi.operators.me()).location, undefined, 'cleared at the end of the shift')
  await kofi.operators.setLocation('opr_02', { lat: 53.47, lng: -2.24, at: ago(0) })
  assert.equal((await kofi.operators.me()).location, undefined, 'and not taken off shift')
})

test('the office sees how far each van on shift is from a site, nearest first', async () => {
  const { as } = demo()
  const jo = as('jo').client
  await as('kofi').client.operators.setLocation('opr_02', { lat: 53.4779, lng: -2.2529, at: ago(1) })
  await as('ryan').client.operators.setLocation('opr_03', { lat: 53.48, lng: -2.25, at: ago(45) })
  const rows = await jo.travel.list({ siteId: 'sit_03' })
  assert.equal(rows[0].operatorId, 'opr_02', 'Kofi is parked outside')
  assert.equal(rows[0].from, 'van')
  assert.ok(rows[0].miles < 0.1)
  assert.equal(rows.find((r) => r.operatorId === 'opr_03')?.from === 'van', false, 'a reading from 45 minutes ago is too old to use')
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].miles <= r.miles))
  assert.ok(rows.every((r) => r.by === 'straight_line' && r.minutes === undefined), 'no road times without a key')
  assert.deepEqual(await jo.travel.get(), { roadTimes: false })
  await assert.rejects(as('kofi').client.travel.list({ siteId: 'sit_03' }), { code: 'forbidden' })
})

test('with a TomTom key the nearest vans are timed by road, and answers are kept a few minutes', async () => {
  let calls = 0
  const engine = createEngine(memoryStore(freshDemoData()), {
    ...nodePlatform,
    driveMinutes: async (from) => {
      calls += from.length
      return from.map((_, i) => [25, 9, undefined, 14, 40][i])
    },
  })
  const jo = engine.as({ userId: 'usr_jo', orgId: DEMO_ORG }).client
  const rows = await jo.travel.list({ siteId: 'sit_03' })
  const timed = rows.filter((r) => r.by === 'road')
  assert.ok(timed.length > 0 && timed.length <= 5)
  assert.ok(timed.every((r, i) => i === 0 || timed[i - 1].minutes! <= r.minutes!), 'quickest by road first')
  assert.equal(rows[0].minutes, 9)
  const first = calls
  await jo.travel.list({ siteId: 'sit_03' })
  assert.equal(calls, first, 'the second look uses the kept answers')
  assert.deepEqual(await jo.travel.get(), { roadTimes: true })
})

test('the TomTom route reading turns seconds into minutes and shrugs off failures', async () => {
  const urls: string[] = []
  const fake = (async (url: string) => {
    urls.push(url)
    if (url.includes('51,')) return new Response('nope', { status: 403 })
    return Response.json({ routes: [{ summary: { travelTimeInSeconds: 750 } }] })
  }) as typeof fetch
  const minutes = await tomtomDriveMinutes('k&y', fake)([{ lat: 53.4, lng: -2.2 }, { lat: 51, lng: 0 }], { lat: 53.48, lng: -2.25 })
  assert.deepEqual(minutes, [12.5, undefined])
  assert.match(urls[0], /calculateRoute\/53\.4,-2\.2:53\.48,-2\.25\/json\?travelMode=van&traffic=true/)
  assert.match(urls[0], /key=k%26y$/)
})
