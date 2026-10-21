// Job requests: asking the crew who can take a job, Uber style.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEngine } from '../src/engine.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { DEMO_ORG } from '../src/seed.ts'
import { memoryStore } from '../src/store.ts'
import { demo, freshDemoData } from './helpers.ts'

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString()

/** A gas emergency at the Castlefield flat (sit_03), with nobody on it yet. */
async function emergency(jo: ReturnType<ReturnType<typeof demo>['as']>['client'], trade: 'gas' | 'heating' = 'gas') {
  return jo.jobs.create({
    title: 'No heating, smell of gas', trade, status: 'booked', priority: 'emergency', customerId: 'cus_03', siteId: 'sit_03',
    operatorIds: [], start: inHours(0.5), end: inHours(2.5), lines: [], checks: [],
  })
}

/** Time passes for one request: every live offer runs out. */
function runOut(engine: ReturnType<typeof demo>['engine'], requestId: string) {
  for (const o of engine.data.jobRequests.find((r) => r.id === requestId)!.offers) if (o.status === 'offered') o.expiresAt = ago(0.1)
}

test('only engineers with the trade, in-date papers and free time are asked, and the office sees why the rest are not', async () => {
  const { as } = demo()
  const jo = as('jo').client
  await as('sam').client.operators.setStandby('opr_05', { until: inHours(4), radius: 10 })
  const job = await emergency(jo)
  const req = await jo.requests.create(job.id)
  assert.equal(req.status, 'open')
  assert.deepEqual(req.offers.map((o) => o.operatorId), ['opr_05'], 'Sam is the only free gas engineer')
  assert.equal(req.offers[0].status, 'offered')
  assert.ok(req.offers[0].miles! < 10)
  const why = Object.fromEntries(req.skipped.map((s) => [s.operatorId, s.why]))
  assert.equal(why.opr_01, 'On J-1042', 'Dan is busy on the boiler swap')
  assert.equal(why.opr_02, 'Not a gas engineer')
  assert.equal(why.opr_04, 'Not a gas engineer')
  assert.equal(req.brief.area, 'Castlefield, M3')
  assert.ok(!JSON.stringify(req.brief).includes('Quay Street'), 'no door number before they say yes')
  await assert.rejects(jo.requests.create(job.id), { code: 'invalid' }, 'one open request per job')
  await assert.rejects(as('kofi').client.requests.create(job.id), { code: 'forbidden' }, "field can't send them")
})

test('papers are checked: no Gas Safe card, a lapsed one, or no insurance for a freelancer', async () => {
  const data = freshDemoData()
  const sam = data.operators.find((o) => o.id === 'opr_05')!
  const ryan = data.operators.find((o) => o.id === 'opr_03')!
  ryan.trades.push('gas')
  ryan.state = 'on_call'
  sam.registrations = sam.registrations.filter((r) => r.body !== 'Public liability')
  const engine = createEngine(memoryStore(data), nodePlatform)
  const as = (u: string) => engine.as({ userId: `usr_${u}`, orgId: DEMO_ORG }).client
  await as('sam').operators.setStandby('opr_05', { until: inHours(2), radius: 20 })
  const jo = as('jo')
  const req = await jo.requests.create((await emergency(jo)).id)
  const why = Object.fromEntries(req.skipped.map((s) => [s.operatorId, s.why]))
  assert.equal(why.opr_03, 'No Gas Safe card')
  assert.equal(why.opr_05, 'No insurance on file')
  assert.equal(req.status, 'unfilled', 'nobody left to ask')

  data.operators.find((o) => o.id === 'opr_03')!.registrations.push({ body: 'Gas Safe', number: '1', expires: '2020-01-01' })
  await jo.requests.withdraw(req.id)
  const again = await jo.requests.create(req.jobId)
  assert.equal(again.skipped.find((s) => s.operatorId === 'opr_03')?.why, 'Gas Safe lapsed')
})

test('one at a time: staff first, nearest first; a decline or a missed offer moves it on', async () => {
  const { engine, as } = demo()
  const jo = as('jo').client
  await as('sam').client.operators.setStandby('opr_05', { until: inHours(4), radius: 10 })
  // Ryan finishes up and is free, a fair way off; Sam is nearer but freelance.
  await as('ryan').client.operators.setState('opr_03', 'on_call')
  await as('ryan').client.operators.setLocation('opr_03', { lat: 53.48, lng: -2.24, at: ago(1) })
  const job = await emergency(jo, 'heating')
  const req = await jo.requests.create(job.id)
  assert.deepEqual(req.offers.map((o) => [o.operatorId, o.status]), [['opr_03', 'offered'], ['opr_05', 'waiting']], 'staff before freelancers')

  assert.deepEqual(await as('sam').client.requests.list(), [], "Sam's phone shows nothing while it's with Ryan")
  const [mine] = await as('ryan').client.requests.list()
  assert.equal(mine.offers.length, 1, 'Ryan only sees his own offer')
  assert.deepEqual(mine.skipped, [])

  await as('ryan').client.requests.respond(req.id, 'decline', 'too_far')
  const [samSees] = await as('sam').client.requests.list()
  assert.equal(samSees.id, req.id, 'straight on to Sam')
  assert.ok(Date.parse(samSees.offers[0].expiresAt!) - Date.parse(samSees.offers[0].offeredAt!) === 45_000)

  runOut(engine, req.id)
  const [after] = await jo.requests.list({ jobId: job.id, open: false })
  assert.equal(after.status, 'unfilled', 'Sam let it run out, and no one is left')
  assert.deepEqual(after.offers.map((o) => [o.status, o.reason]), [['declined', 'too_far'], ['expired', undefined]])
  await assert.rejects(as('sam').client.requests.respond(req.id, 'accept'), { code: 'invalid' }, 'too late')
  assert.ok((await jo.attention.list()).some((a) => a.rule === 'No one took it' && a.who === job.ref))
})

test('accepting puts the engineer on the job, and they can then open it', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const sam = as('sam').client
  await sam.operators.setStandby('opr_05', { until: inHours(4), radius: 10 })
  const job = await emergency(jo)
  await assert.rejects(sam.jobs.get(job.id).then((j) => j ?? Promise.reject(new Error('hidden'))), /hidden/, "Sam can't open it before saying yes")
  const req = await jo.requests.create(job.id)
  await assert.rejects(as('kofi').client.requests.respond(req.id, 'accept'), { code: 'not_found' }, "it wasn't offered to Kofi")
  const answer = await sam.requests.respond(req.id, 'accept')
  assert.equal(answer.status, 'filled')
  assert.equal(answer.filledBy, 'opr_05')
  assert.deepEqual((await jo.jobs.get(job.id))?.operatorIds, ['opr_05'])
  assert.equal((await sam.jobs.get(job.id))?.title, job.title, 'now Sam sees the whole job')
  assert.deepEqual(await jo.requests.list(), [], 'nothing open')
  await assert.rejects(sam.requests.respond(req.id, 'decline'), { code: 'invalid' })
})

test('everyone at once: first to accept gets it and the others are closed', async () => {
  const { as } = demo()
  const jo = as('jo').client
  await as('sam').client.operators.setStandby('opr_05', { until: inHours(4), radius: 10 })
  await as('ryan').client.operators.setState('opr_03', 'on_call')
  const job = await emergency(jo, 'heating')
  const req = await jo.requests.create(job.id, { mode: 'all', wait: 60 })
  assert.ok(req.offers.every((o) => o.status === 'offered'))
  assert.deepEqual(req.offers.map((o) => o.operatorId), ['opr_03', 'opr_05'])
  await as('ryan').client.requests.respond(req.id, 'accept')
  await assert.rejects(as('sam').client.requests.respond(req.id, 'accept'), /someone else has taken it/)
  const [done] = await jo.requests.list({ jobId: job.id, open: false })
  assert.deepEqual(done.offers.map((o) => o.status).sort(), ['accepted', 'closed'])
})

test('standby: a freelancer is only asked while on standby and within their miles', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const sam = as('sam').client
  const job = await emergency(jo)
  // The demo's standby ran out on the demo day.
  let req = await jo.requests.create(job.id)
  assert.equal(req.skipped.find((s) => s.operatorId === 'opr_05')?.why, 'Not on standby')
  await jo.requests.withdraw(req.id)

  await sam.operators.setStandby('opr_05', { until: inHours(3), radius: 1, base: { lat: 53.4328, lng: -2.2051 } })
  req = await jo.requests.create(job.id)
  assert.equal(req.skipped.find((s) => s.operatorId === 'opr_05')?.why, 'Outside their 1 miles')
  await jo.requests.withdraw(req.id)

  await assert.rejects(sam.operators.setStandby('opr_05', { until: ago(1), radius: 5 }), { code: 'invalid' })
  await assert.rejects(sam.operators.setStandby('opr_05', { until: inHours(30), radius: 5 }), { code: 'invalid' })
  await assert.rejects(as('kofi').client.operators.setStandby('opr_05', { until: inHours(1), radius: 5 }), { code: 'forbidden' })
  await assert.rejects(jo.operators.setStandby('opr_05', { until: inHours(1), radius: 5 }), { code: 'forbidden' }, 'the office can stand them down, not put them on')

  await sam.operators.setStandby('opr_05', { until: inHours(3), radius: 10 })
  assert.equal((await sam.operators.me()).state, 'on_call')
  await jo.operators.setStandby('opr_05', null)
  const me = await sam.operators.me()
  assert.equal(me.standby, undefined)
  assert.equal(me.state, 'off_shift', 'a freelancer stood down goes off shift')
})

test('withdrawing calls it off; a cancelled job withdraws its request', async () => {
  const { as } = demo()
  const jo = as('jo').client
  await as('sam').client.operators.setStandby('opr_05', { until: inHours(4), radius: 10 })
  const job = await emergency(jo)
  const req = await jo.requests.create(job.id)
  const off = await jo.requests.withdraw(req.id)
  assert.equal(off.status, 'withdrawn')
  assert.deepEqual(await as('sam').client.requests.list(), [])
  await assert.rejects(as('sam').client.requests.respond(req.id, 'accept'), /called it off/)

  const again = await jo.requests.create(job.id)
  await jo.jobs.setStatus(job.id, 'cancelled')
  const [gone] = await jo.requests.list({ jobId: job.id, open: false }).then((rs) => rs.filter((r) => r.id === again.id))
  assert.equal(gone.status, 'withdrawn')
  await assert.rejects(jo.requests.create(job.id), { code: 'invalid' }, "can't ask about a cancelled job")
})
