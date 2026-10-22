/**
 * How the phone hears the engineer, worked out in plain rules so it can be
 * tested without a phone. Talking must never lose words: when the phone can't
 * write as they speak (no signal and no speech pack), it keeps the recording
 * and writes it into the report once it can. Nothing here makes up words: a
 * recording only ever becomes the words the phone hears in it, and the
 * engineer's own edits always win.
 */
import type { ReportSegment, ReportTopic } from '../../core/src/data/model.ts'

/**
 * - `phone`: the phone's own speech, on the phone, no signal needed.
 * - `model`: Ardent's downloaded speech model, on the phone, no signal needed.
 * - `phone-online`: the phone's own speech, which needs signal on this phone.
 * - `record`: no way to write it now; keep the recording and write it up later.
 * - `type`: no microphone or recorder, so they type.
 */
export type HowToHear = 'phone' | 'model' | 'phone-online' | 'record' | 'type'

export interface HearingCaps {
  /** The phone has a speech recogniser at all. */
  recogniser: boolean
  /** It can hear English (UK) with no signal right now (iPhone on-device, or Android with the pack). */
  onDevice: boolean
  /** It can keep a recording of what was said (Android 13+, iPhone). */
  canRecord: boolean
  /** Signal right now. Unknown counts as maybe. */
  online?: boolean
  /** Ardent's own speech model is downloaded and ready. */
  model?: boolean
  /** They said no to the microphone. */
  refused?: boolean
}

export interface HearingPlan {
  how: HowToHear
  /** Words are written on the phone, so signal doesn't matter. */
  offline: boolean
  /** Keep the recording, so nothing is lost if the signal goes or the phone can't write it now. */
  keep: boolean
  /** One plain line for the engineer when the plan isn't the usual one. */
  say?: string
}

export const HEARING_WORDS = {
  online: "This phone needs signal to write as you talk. Ardent keeps the recording too, so nothing's lost if the signal goes.",
  record: "No signal, and this phone can't write without it. Talk anyway: Ardent keeps the recording and writes it into the report when it can. To sign off now, type the key points.",
  type: "This phone can't listen or record, so type it instead.",
  refused: 'The microphone is off for Ardent, so type it instead. You can switch it on in Settings.',
}

/** The best way to hear them now. On the phone first, then Ardent's model, then the phone with signal, then keep the recording. */
export function chooseHearing(c: HearingCaps): HearingPlan {
  if (c.refused) return { how: 'type', offline: true, keep: false, say: HEARING_WORDS.refused }
  // Written on the phone as they talk, so there's no signal to lose and nothing to keep.
  if (c.recogniser && c.onDevice) return { how: 'phone', offline: true, keep: false }
  // Ardent's model hears a recording, so there's always one.
  if (c.model) return { how: 'model', offline: true, keep: true }
  if (c.recogniser && c.online !== false) return { how: 'phone-online', offline: false, keep: c.canRecord, say: HEARING_WORDS.online }
  // Only worth keeping when the phone can write it up later.
  if (c.canRecord && c.recogniser) return { how: 'record', offline: true, keep: true, say: HEARING_WORDS.record }
  return { how: 'type', offline: true, keep: false, say: HEARING_WORDS.type }
}

/** A recording kept on the phone until it has been written into the report. */
export interface Recording {
  id: string
  jobId: string
  /** Where the sound is on the phone. */
  uri: string
  /** Samples a second, when the phone couldn't record at 16000. */
  rate?: number
  at: string
  /** The question it answered, and the follow-up that asked, so the words land in the same place. */
  topic?: ReportTopic
  followUp?: string
  state: 'waiting' | 'heard' | 'empty' | 'failed'
  tries: number
}

/** Tries before a recording is given up on and left for the engineer to play back. */
export const MAX_TRIES = 3

/**
 * Whether a waiting recording can be written up now: the phone hears files
 * with no signal when it can hear on-device, Ardent's model always can, and
 * the phone's online speech needs signal.
 */
export function canHearLater(r: Recording, c: Pick<HearingCaps, 'recogniser' | 'onDevice' | 'online' | 'model' | 'canRecord'>): 'phone' | 'model' | 'phone-online' | undefined {
  if (r.state !== 'waiting' || r.tries >= MAX_TRIES) return undefined
  // File transcription comes with recording: Android 13+ and iPhone.
  if (c.recogniser && c.canRecord && c.onDevice) return 'phone'
  if (c.model) return 'model'
  if (c.recogniser && c.canRecord && c.online === true) return 'phone-online'
  return undefined
}

/** Why listening stopped, as the phone reports it. */
export type EndedBy = 'done' | 'network' | 'other'

/**
 * What to do when listening ends. Words heard are added as said. When the
 * signal went and the phone kept the recording, the words so far are added
 * and marked as waiting, and the recording is kept to write in the rest.
 * With no words and no recording, nothing is added.
 */
export function afterListening(o: { text: string; endedBy: EndedBy; recording?: Omit<Recording, 'state' | 'tries'>; how: HowToHear }): { text?: string; waiting?: Recording } {
  const text = o.text.trim()
  const keep = o.recording && (o.how === 'record' || o.endedBy === 'network')
  const waiting = keep ? { ...o.recording!, state: 'waiting' as const, tries: 0 } : undefined
  return { ...(text ? { text } : {}), ...(waiting ? { waiting } : {}) }
}

export type HeardLater = 'replaced' | 'added' | 'kept-edit' | 'signed' | 'empty'

/**
 * Write a recording's words into the report. If a segment still holds the
 * words heard before the signal went, and the engineer hasn't changed them,
 * the full words replace them. If they changed them, theirs stay. A signed
 * report is never changed. Otherwise the words are added where the recording
 * was made, marked as written later so the engineer checks them.
 */
export function heardLater(segments: ReportSegment[], r: Recording, text: string, o: { signed?: boolean; heard?: string } = {}): { segments: ReportSegment[]; result: HeardLater } {
  const words = text.trim()
  if (o.signed) return { segments, result: 'signed' }
  const heard = o.heard && o.heard !== words ? { heard: o.heard } : {}
  const at = segments.findIndex((s) => s.audio === r.id)
  if (!words) {
    // Nothing more in the sound: what was heard before stays, no longer waiting.
    if (at < 0) return { segments, result: 'empty' }
    return { segments: segments.map((s, i) => (i === at ? clearWaiting(s) : s)), result: 'empty' }
  }
  if (at >= 0) {
    const s = segments[at]
    const edited = s.waiting !== true || s.text !== s.waitingText
    const { heard: _h, ...was } = clearWaiting(s)
    const next: ReportSegment = edited ? clearWaiting(s) : { ...was, text: words, later: true, ...heard }
    // A changed text loses sentences moved by an earlier follow-up, as they point at old words.
    if (!edited) delete next.moved
    return { segments: segments.map((x, i) => (i === at ? next : x)), result: edited ? 'kept-edit' : 'replaced' }
  }
  const seg: ReportSegment = { text: words, at: r.at, audio: r.id, later: true, ...heard, ...(r.topic ? { topic: r.topic } : {}), ...(r.followUp ? { followUp: r.followUp } : {}) }
  return { segments: [...segments, seg], result: 'added' }
}

function clearWaiting(s: ReportSegment): ReportSegment {
  const { waiting: _w, waitingText: _t, ...rest } = s
  return rest
}

/** A segment for words heard before the signal went, kept with its recording. */
export function waitingSegment(text: string, r: Pick<Recording, 'id' | 'at' | 'topic' | 'followUp'>, heard?: string): ReportSegment {
  return { text, at: r.at, audio: r.id, waiting: true, waitingText: text, ...(heard && heard !== text ? { heard } : {}), ...(r.topic ? { topic: r.topic } : {}), ...(r.followUp ? { followUp: r.followUp } : {}) }
}

// Trade words ------------------------------------------------------------------

/**
 * Letters said one at a time that make a trade term. Only joined when every
 * piece is a single letter or digit and the whole is on this list or the
 * firm's own words, so "a" and "I" in ordinary speech are left alone.
 */
const SPELT = ['RCBO', 'RCD', 'MCB', 'SWA', 'TRV', 'TRVs', 'PRV', 'CP12', 'EICR', 'PAT', 'LPG', 'GSR', 'PIR', 'AFDD', 'SPD', 'MCS', 'TPR', 'PEN', 'TN-C-S', 'NICEIC', 'HVAC', 'UFH', 'CO2']

/**
 * Words phones commonly mishear in trade talk, and what was meant. Brands only
 * change when the firm's own words name that brand, so "valiant" stays
 * "valiant" for a firm that never fits a Vaillant.
 */
const MISHEARD: { heard: RegExp; meant: string; brand?: string }[] = [
  { heard: /\bcomb(?:ie|ee|y)\b/gi, meant: 'combi' },
  { heard: /\bworst[ae]r(?=\s+bos(?:c?h|che)\b)/gi, meant: 'Worcester', brand: 'worcester' },
  { heard: /\bworcester\s+bos(?:h|che)\b/gi, meant: 'Worcester Bosch', brand: 'worcester' },
  { heard: /\bvaliant\b/gi, meant: 'Vaillant', brand: 'vaillant' },
  { heard: /\bback(?:si|sy|see)\b/gi, meant: 'Baxi', brand: 'baxi' },
  { heard: /\bflu(?=\s+(?:gas|pipe|terminal|liner|analyser|analyzer|kit|flow|check|seal|bend)\b)/gi, meant: 'flue' },
  { heard: /\bmeg(?:a\s?-?|\s|-)ohms?\b/gi, meant: 'megohms' },
  { heard: /\bzed\s?s\b/gi, meant: 'Zs' },
  { heard: /\b(?:see|sea|c)\s?(?:pea|p)\s?(?:12|twelve)\b/gi, meant: 'CP12' },
  { heard: /\btwin\s+(?:in|an|'n)\s+earth\b/gi, meant: 'twin and earth' },
  { heard: /\binhibiter\b/gi, meant: 'inhibitor' },
  { heard: /\btun\s+dish\b/gi, meant: 'tundish' },
  { heard: /\bg\s(?:3|three)\b/gi, meant: 'G3' },
]

export interface FixedWords {
  text: string
  /** What the phone wrote, when a trade word was put right. */
  heard?: string
}

/**
 * Put right trade words the phone commonly mishears, using a fixed list and
 * the firm's own words. Only words that were heard are changed, one for one:
 * nothing is added, and numbers are never touched.
 */
export function fixTradeWords(text: string, firmWords: string[] = []): FixedWords {
  const mine = firmWords.map((w) => w.toLowerCase())
  const has = (brand: string) => mine.some((w) => w.includes(brand))
  let out = text
  for (const m of MISHEARD) {
    if (m.brand && !has(m.brand)) continue
    out = out.replace(m.heard, (hit) => keepCase(hit, m.meant))
  }
  out = joinSpelt(out, firmWords)
  return out === text ? { text } : { text: out, heard: text }
}

/** "r c b o" or "R.C.D." to "RCBO" and "RCD", when the joined letters are a known term. */
function joinSpelt(text: string, firmWords: string[]): string {
  const known = new Map([...SPELT, ...firmWords.filter((w) => /^[A-Z0-9-]{2,8}s?$/.test(w))].map((t) => [t.replace(/-/g, '').toUpperCase(), t]))
  // Runs of single letters or digits, split by spaces or dots.
  return text.replace(/\b[A-Za-z0-9](?:(?:\.\s*|\s+)[A-Za-z0-9]\b)+\.?/g, (run, offset: number, all: string) => {
    const bits = run.split(/[\s.]+/).filter(Boolean)
    // Inside the run, the longest stretch of letters that makes a known term, so "a r c d" keeps its "a".
    for (let len = bits.length; len >= 2; len--) {
      for (let i = 0; i + len <= bits.length; i++) {
        const piece = bits.slice(i, i + len)
        if (piece.every((b) => /\d/.test(b))) continue
        const term = known.get(piece.join('').toUpperCase())
        if (!term) continue
        const before = bits.slice(0, i).join(' ')
        const after = bits.slice(i + len).join(' ')
        // A full stop that ended the sentence stays.
        const stop = /\.$/.test(run) && offset + run.length === all.length && !after ? '.' : ''
        return [before, term + stop, after].filter(Boolean).join(' ') + (/\s$/.test(run) ? ' ' : '')
      }
    }
    return run
  })
}

function keepCase(hit: string, meant: string) {
  // Brands and terms with capitals keep their own; a plain word follows the sentence start.
  if (meant !== meant.toLowerCase()) return meant
  return hit[0] === hit[0].toUpperCase() ? meant[0].toUpperCase() + meant.slice(1) : meant
}
