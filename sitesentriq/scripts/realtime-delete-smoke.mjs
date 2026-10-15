import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = new URL('..', import.meta.url).pathname
const envPath = process.env.SITESENTRIQ_ENV_FILE ?? join(root, 'apps/web/.env')
const timeoutMs = Number(process.env.SITESENTRIQ_SMOKE_TIMEOUT_MS ?? 15_000)

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
  } catch (error) {
    throw new Error(`Unable to read env file at ${path}: ${error.message}`)
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function createSmokeClient(name, supabaseUrl, anonKey) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `sitesentriq-realtime-smoke-${name}`,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    global: {
      headers: { 'x-client-info': `sitesentriq-realtime-smoke-${name}` },
    },
  })
}

async function signIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed: ${error.message}`)
  if (!data.session?.access_token || !data.user) {
    throw new Error('Sign-in did not return a session')
  }
  client.realtime.setAuth(data.session.access_token)
  return data.user
}

async function getOrgAndProperty(client, userId) {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('organisation_id')
    .eq('id', userId)
    .single()
  if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`)
  if (!profile?.organisation_id) throw new Error('Signed-in user has no organisation_id')

  const { data: property, error: propertyError } = await client
    .from('properties')
    .select('id,name')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (propertyError) throw new Error(`Property lookup failed: ${propertyError.message}`)
  if (!property?.id) throw new Error('Organisation has no property to attach the smoke job to')

  return {
    organisationId: profile.organisation_id,
    property,
  }
}

function normalizeBroadcast(input) {
  const envelope = input && typeof input === 'object' ? input : {}
  const body =
    envelope.payload && typeof envelope.payload === 'object'
      ? envelope.payload
      : envelope
  const eventValue = body.eventType ?? body.event ?? body.operation ?? body.type
  const eventType = typeof eventValue === 'string' ? eventValue.toUpperCase() : ''
  return {
    table: typeof body.table === 'string' ? body.table : '',
    eventType,
    new:
      body.new && typeof body.new === 'object'
        ? body.new
        : body.record && typeof body.record === 'object'
          ? body.record
          : {},
    old:
      body.old && typeof body.old === 'object'
        ? body.old
        : body.old_record && typeof body.old_record === 'object'
          ? body.old_record
          : {},
  }
}

function waitForSubscribed(channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), timeoutMs)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer)
        reject(new Error(`Realtime subscription failed: ${status}${error ? ` ${error.message ?? error}` : ''}`))
      }
    })
  })
}

function waitForDeleteEvent(events, jobId) {
  return new Promise((resolve, reject) => {
    const existing = events.find((event) => event.table === 'jobs' && event.eventType === 'DELETE' && event.old.id === jobId)
    if (existing) {
      resolve(existing)
      return
    }

    const timer = setTimeout(() => {
      reject(new Error(`Did not receive jobs DELETE broadcast for ${jobId}`))
    }, timeoutMs)

    const interval = setInterval(() => {
      const event = events.find((entry) => entry.table === 'jobs' && entry.eventType === 'DELETE' && entry.old.id === jobId)
      if (!event) return
      clearInterval(interval)
      clearTimeout(timer)
      resolve(event)
    }, 100)
  })
}

loadEnvFile(envPath)

const supabaseUrl = required('VITE_SUPABASE_URL')
const anonKey = required('VITE_SUPABASE_ANON_KEY')
const email = required('SITESENTRIQ_SMOKE_EMAIL')
const password = required('SITESENTRIQ_SMOKE_PASSWORD')

const writer = createSmokeClient('writer', supabaseUrl, anonKey)
const listener = createSmokeClient('listener', supabaseUrl, anonKey)
let insertedJobId = null
let channel = null

try {
  const writerUser = await signIn(writer, email, password)
  await signIn(listener, email, password)

  const { organisationId, property } = await getOrgAndProperty(writer, writerUser.id)
  const topic = `org:${organisationId}:changes`
  const events = []

  channel = listener
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'DELETE' }, (payload) => {
      events.push(normalizeBroadcast(payload))
    })

  await waitForSubscribed(channel)

  const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const { data: job, error: insertError } = await writer
    .from('jobs')
    .insert({
      organisation_id: organisationId,
      property_id: property.id,
      title: `Realtime delete smoke ${runId}`,
      description: 'Temporary release smoke-test job. Safe to delete.',
      status: 'scheduled',
      priority: 'low',
      scheduled_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_callout: false,
      job_type: 'reactive',
      sla_priority: 'p3',
    })
    .select('id,title')
    .single()
  if (insertError) throw new Error(`Smoke job insert failed: ${insertError.message}`)
  insertedJobId = job.id

  const deletePromise = waitForDeleteEvent(events, insertedJobId)
  const { error: deleteError } = await writer.from('jobs').delete().eq('id', insertedJobId)
  if (deleteError) throw new Error(`Smoke job delete failed: ${deleteError.message}`)

  const deleteEvent = await deletePromise
  console.log(JSON.stringify({
    ok: true,
    topic,
    organisationId,
    propertyId: property.id,
    jobId: insertedJobId,
    eventType: deleteEvent.eventType,
    source: 'broadcast',
  }, null, 2))
  insertedJobId = null
} finally {
  if (insertedJobId) {
    await writer.from('jobs').delete().eq('id', insertedJobId)
  }
  if (channel) {
    await listener.removeChannel(channel).catch(() => undefined)
  }
  await writer.auth.signOut().catch(() => undefined)
  await listener.auth.signOut().catch(() => undefined)
  writer.realtime.disconnect()
  listener.realtime.disconnect()
}
