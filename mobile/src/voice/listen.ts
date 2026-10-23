// Hold to talk. The phone's own speech recogniser writes the words, on the
// phone whenever it can, set to English (UK) and primed with the firm's own
// trade words. When it needs signal, Ardent keeps the recording too: if the
// signal goes mid-sentence, or there was none to start with, the sound is
// kept on the phone and written into the report once the phone can hear it.
// The rules for which way to hear are in kit/hearing.ts, tested without a phone.
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { File } from 'expo-file-system';
import { AudioEncodingAndroid, ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { afterListening, canHearLater, chooseHearing, type EndedBy, fixTradeWords, type HearingCaps, type HowToHear, type Recording } from '@/kit/hearing';

import { speechModel } from './model';
import { clearSound, newRecordingId, voiceFolder } from './recordings';

const LANG = 'en-GB';
/** Recordings are 16 kHz mono 16-bit WAV: what both phones' recognisers read back, and what speech models take. */
const RATE = 16_000;
/** Shorter than this and there's nothing to write up. */
const MIN_SECONDS = 0.6;

export type Hearing =
  /** Ready to listen. */
  | 'ready'
  | 'listening'
  /** No way to listen on this phone or browser: they type instead. */
  | 'type'
  /** They said no to the microphone. */
  | 'refused';

const ERRORS: Record<string, string> = {
  'audio-capture': "The microphone isn't free. Close anything else using it and try again.",
  interrupted: 'A call or alarm stopped the listening. Hold to carry on.',
  'language-not-supported': "This phone can't do English (UK) speech. You can type instead.",
  network: 'The signal went and the phone stopped writing. What it heard so far is kept.',
  'service-not-allowed': "This phone's speech service is switched off. You can type instead.",
  busy: 'The phone is still listening from before. Try again.',
};

function available() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Keeping a recording, and reading one back, needs Android 13 or an iPhone. */
function recordable() {
  try {
    return Platform.OS !== 'web' && ExpoSpeechRecognitionModule.supportsRecording();
  } catch {
    return false;
  }
}

/** Whether this phone hears without signal. On Android that needs the English (UK) pack downloaded. */
async function offline(): Promise<boolean> {
  try {
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
    if (Platform.OS !== 'android') return true;
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' });
    return installedLocales.some((l) => l.toLowerCase().replace('_', '-') === LANG.toLowerCase());
  } catch {
    return false;
  }
}

/** What one hold of the button gave. */
export interface Heard {
  /** Words heard now, with trade words put right. */
  text: string;
  /** What the phone wrote, when a trade word was put right. */
  heard?: string;
  /** The recording behind `text` when the signal went, which may hold more words than came back. */
  linked?: Recording;
  /** Recordings with no words yet, to write in later. */
  later: Recording[];
}

/** Where the words of a hold belong, so a recording written up later lands in the same place. */
export type HoldFor = Pick<Recording, 'jobId' | 'topic' | 'followUp'>;

type Mode = 'idle' | 'mic' | 'stream' | 'file';

/**
 * Press to start, release to stop. `stop` hands back everything heard since
 * `start`, and any recording kept to write up later. `words` are the trade
 * words to listen out for (iPhone takes 100). `online` is whether the phone
 * has signal, when known.
 */
export function useListen(words: string[], o: { online?: boolean } = {}) {
  const [recogniser] = useState(available);
  const [canRecord] = useState(recordable);
  /** Undefined until the phone has said. */
  const [onDevice, setOnDevice] = useState<boolean>();
  const [modelReady, setModelReady] = useState(false);
  const [refused, setRefused] = useState(false);
  const [choseType, setChoseType] = useState(false);
  const [listening, setListening] = useState(false);
  /** Ardent is recording the sound itself, with no words coming back live. */
  const [keeping, setKeeping] = useState(false);
  /** The recording being written up now, if any. */
  const [writing, setWriting] = useState<string>();
  const [live, setLive] = useState('');
  const [problem, setProblem] = useState('');
  /** How loud they are right now, 0 to 1, for the waveform. */
  const [level, setLevel] = useState(0);

  useEffect(() => {
    void offline().then(setOnDevice);
    void speechModel
      ?.ready()
      .then(setModelReady)
      .catch(() => setModelReady(false));
  }, []);

  const caps: HearingCaps = { recogniser, onDevice: !!onDevice, canRecord, online: o.online, model: modelReady, refused };
  const chosen = chooseHearing(caps);
  // Nothing to tell them until the phone has said whether it hears without signal.
  const plan = onDevice === undefined && !refused ? { ...chosen, say: undefined } : chosen;
  const capsRef = useRef(caps);
  capsRef.current = caps;
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const mode = useRef<Mode>('idle');
  const finals = useRef<string[]>([]);
  const interim = useRef('');
  const endedBy = useRef<EndedBy>('done');
  /** The recogniser's own recording of this hold, once it has finished writing it. */
  const micFile = useRef<string | null>(null);
  const held = useRef(false);
  /** This hold: when, what for, how, and the id its recordings take. */
  const hold = useRef<{ id: string; at: string; for: HoldFor; how: HowToHear; persist?: boolean }>(undefined);
  /** What the recogniser gave, kept once it stops (even if it stops on its own while still held). */
  const micDone = useRef<{ text: string; endedBy: EndedBy } | undefined>(undefined);
  const micWait = useRef<(() => void) | undefined>(undefined);
  const fileWait = useRef<((r: { text: string; endedBy: EndedBy }) => void) | undefined>(undefined);
  const fileStopped = useRef(false);
  /** The rest of a hold, recorded by Ardent once the recogniser can't. */
  const streamRec = useRef<{ id: string; uri: string; at: string } | undefined>(undefined);
  const switching = useRef<Promise<void> | undefined>(undefined);

  const onBuffer = useCallback((b: AudioStreamBuffer) => {
    if (mode.current !== 'stream') return;
    const s = new Int16Array(b.data);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < s.length; i += 4, n++) sum += s[i] * s[i];
    setLevel(n ? Math.min(1, (Math.sqrt(sum / n) / 32768) * 6) : 0);
  }, []);
  // Null in the browser preview, which has no recorder.
  const stream = useAudioStream({ sampleRate: RATE, channels: 1, encoding: 'int16', onBuffer }).stream as ReturnType<typeof useAudioStream>['stream'] | null;

  const heard = () => [...finals.current, interim.current].map((t) => t.trim()).filter(Boolean).join(' ');

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      finals.current.push(t);
      interim.current = '';
    } else interim.current = t;
    if (mode.current === 'mic') setLive(heard());
  });
  // The phone reports -2 (silence) to 10 (loud).
  useSpeechRecognitionEvent('volumechange', (e) => {
    if (mode.current === 'mic') setLevel(Math.max(0, Math.min(1, e.value / 10)));
  });
  // The recogniser's recording is safe to use once this arrives, which can be just after it stops.
  useSpeechRecognitionEvent('audioend', (e) => {
    if (mode.current !== 'file' && e.uri) micFile.current = e.uri;
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'no-speech' || e.error === 'speech-timeout' || e.error === 'aborted') return;
    endedBy.current = e.error === 'network' ? 'network' : 'other';
    if (mode.current !== 'mic') return;
    if (e.error === 'not-allowed') setRefused(true);
    // Signal gone while they're still talking: Ardent carries on recording, so there's nothing to say yet.
    if (e.error === 'network' && held.current && canRecord) return;
    setProblem(ERRORS[e.error] ?? 'The phone stopped listening. Hold to try again.');
  });
  useSpeechRecognitionEvent('end', () => {
    const text = heard();
    finals.current = [];
    interim.current = '';
    if (mode.current === 'file') {
      fileWait.current?.({ text, endedBy: endedBy.current });
      fileWait.current = undefined;
      return;
    }
    if (mode.current !== 'mic') return;
    micDone.current = { text, endedBy: endedBy.current };
    setLive('');
    setLevel(0);
    if (held.current && endedBy.current === 'network' && canRecord) {
      // Keep recording the rest of what they say.
      switching.current = recordRest();
      return;
    }
    mode.current = 'idle';
    setListening(false);
    micWait.current?.();
    micWait.current = undefined;
  });

  /** Ardent records the sound itself: for the whole hold with no signal, or the rest of it once the signal goes. */
  async function recordRest() {
    mode.current = 'stream';
    const dir = voiceFolder();
    const id = newRecordingId();
    try {
      if (!dir || !stream) throw new Error('no recorder');
      await setAudioModeAsync({ allowsRecording: true }).catch(() => undefined);
      await stream.start();
      const { uri } = await stream.startFileRecordingAsync({ uri: new File(dir, `${id}.wav`).uri, format: 'wav' });
      streamRec.current = { id, uri, at: new Date().toISOString() };
      setKeeping(true);
      setListening(true);
    } catch {
      mode.current = 'idle';
      setListening(false);
      setProblem("The phone couldn't keep recording. Type the rest instead.");
    }
  }

  /** Stop Ardent's own recording, if one is running. */
  async function stopRest(): Promise<{ id: string; uri: string; at: string; rate?: number } | undefined> {
    if (mode.current !== 'stream') return undefined;
    mode.current = 'idle';
    setKeeping(false);
    const kept = streamRec.current;
    streamRec.current = undefined;
    if (!stream) return undefined;
    try {
      const r = kept ? await stream.stopFileRecordingAsync() : undefined;
      stream.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (!kept || !r) return undefined;
      if (r.duration < MIN_SECONDS) {
        clearSound(r.uri);
        return undefined;
      }
      return { ...kept, uri: r.uri || kept.uri, ...(r.sampleRate !== RATE ? { rate: r.sampleRate } : {}) };
    } catch {
      stream.stop();
      return kept;
    }
  }

  /** A file being written up gives way when they press to talk. */
  async function stopWriting() {
    if (mode.current !== 'file') return;
    fileStopped.current = true;
    const done = new Promise<void>((resolve) => {
      const was = fileWait.current;
      fileWait.current = (r) => {
        was?.(r);
        resolve();
      };
    });
    ExpoSpeechRecognitionModule.abort();
    await done;
  }

  const start = useCallback(
    async (holdFor: HoldFor) => {
      if (listening || held.current) return;
      held.current = true;
      setProblem('');
      await stopWriting();
      const perm = recogniser ? await ExpoSpeechRecognitionModule.requestPermissionsAsync() : await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        held.current = false;
        setRefused(true);
        return;
      }
      const local = await offline();
      setOnDevice(local);
      const now = chooseHearing({ ...capsRef.current, onDevice: local });
      if (now.how === 'type') {
        held.current = false;
        return;
      }
      // Released while the phone was getting ready: nothing to start.
      if (!held.current) return;
      const id = newRecordingId();
      hold.current = { id, at: new Date().toISOString(), for: holdFor, how: now.how };
      finals.current = [];
      interim.current = '';
      endedBy.current = 'done';
      micFile.current = null;
      micDone.current = undefined;
      if (now.how === 'record' || now.how === 'model') {
        // No live words: record now, write it up later (or, with Ardent's model, as soon as they let go).
        switching.current = recordRest();
        return;
      }
      const dir = now.keep ? voiceFolder() : undefined;
      hold.current.persist = !!dir;
      mode.current = 'mic';
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: LANG,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: now.how === 'phone',
        contextualStrings: wordsRef.current.slice(0, 100),
        iosTaskHint: 'dictation',
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
        // Long pauses are normal on site: give them 10 seconds before the phone gives up.
        androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10_000 },
        // Keep the sound, so words the signal swallowed can be written in later.
        ...(dir ? { recordingOptions: { persist: true, outputDirectory: dir.uri, outputFileName: `${id}.wav`, outputSampleRate: RATE, outputEncoding: 'pcmFormatInt16' as const } } : {}),
      });
    },
    [listening, recogniser],
  );

  /** Stop and get what was said, and any recording kept to write up later. */
  const stop = useCallback(async (): Promise<Heard> => {
    held.current = false;
    const h = hold.current;
    if (mode.current === 'mic') {
      await new Promise<void>((resolve) => {
        micWait.current = resolve;
        ExpoSpeechRecognitionModule.stop();
        // If the phone never says it has stopped, don't hang on to their words.
        setTimeout(resolve, 8000);
      });
      if (mode.current === 'mic') {
        mode.current = 'idle';
        micDone.current ??= { text: heard(), endedBy: endedBy.current };
      }
    }
    // A kept recording is only finished once the phone says so.
    for (let i = 0; h?.persist && !micFile.current && i < 10; i++) await new Promise((r) => setTimeout(r, 100));
    await switching.current;
    switching.current = undefined;
    const rest = await stopRest();
    setListening(false);
    setLive('');
    setLevel(0);
    hold.current = undefined;
    const out: Heard = { text: '', later: [] };
    if (!h) return out;
    const base = { jobId: h.for.jobId, ...(h.for.topic ? { topic: h.for.topic } : {}), ...(h.for.followUp ? { followUp: h.for.followUp } : {}) };
    const mic = micDone.current;
    micDone.current = undefined;
    if (mic) {
      const fixed = fixTradeWords(mic.text, wordsRef.current);
      const sound = micFile.current ? { ...base, id: h.id, uri: micFile.current, at: h.at } : undefined;
      const after = afterListening({ text: fixed.text, endedBy: mic.endedBy, recording: sound, how: h.how });
      if (after.text) Object.assign(out, { text: after.text }, fixed.heard ? { heard: fixed.heard } : {});
      if (after.waiting && after.text) out.linked = after.waiting;
      else if (after.waiting) out.later.push(after.waiting);
      else clearSound(micFile.current);
    }
    if (rest) {
      const r = { ...base, ...rest, state: 'waiting' as const, tries: 0 };
      if (h.how === 'model' && speechModel) {
        // Ardent's model hears it now, with no signal; if it can't, the recording waits like any other.
        try {
          const fixed = fixTradeWords(await speechModel.hearFile(r.uri, { rate: r.rate ?? RATE, words: wordsRef.current }), wordsRef.current);
          if (fixed.text.trim()) {
            clearSound(r.uri);
            return { text: fixed.text.trim(), ...(fixed.heard ? { heard: fixed.heard } : {}), later: [] };
          }
        } catch {
          // Waits below.
        }
      }
      out.later.push(r);
    }
    return out;
  }, []);

  /**
   * Write up a kept recording, if the phone can hear it now. Resolves with the
   * words, 'failed' if the phone couldn't, 'stopped' if they pressed to talk,
   * or undefined if it has to wait for signal or the speech pack.
   */
  const hearFile = useCallback(async (r: Recording): Promise<{ text: string; heard?: string } | 'failed' | 'stopped' | undefined> => {
    const how = canHearLater(r, capsRef.current);
    if (!how || mode.current !== 'idle' || held.current) return undefined;
    setWriting(r.id);
    try {
      let text: string;
      if (how === 'model') {
        if (!speechModel) return undefined;
        text = await speechModel.hearFile(r.uri, { rate: r.rate ?? RATE, words: wordsRef.current });
      } else {
        mode.current = 'file';
        fileStopped.current = false;
        finals.current = [];
        interim.current = '';
        endedBy.current = 'done';
        const ended = new Promise<{ text: string; endedBy: EndedBy }>((resolve) => (fileWait.current = resolve));
        // A recording should never take minutes to read; if the phone goes quiet, give up this try.
        const timer = setTimeout(() => ExpoSpeechRecognitionModule.abort(), 3 * 60_000);
        ExpoSpeechRecognitionModule.start({
          lang: LANG,
          interimResults: false,
          continuous: true,
          addsPunctuation: true,
          requiresOnDeviceRecognition: how === 'phone',
          contextualStrings: wordsRef.current.slice(0, 100),
          iosTaskHint: 'dictation',
          audioSource: { uri: r.uri, audioChannels: 1, audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT, sampleRate: r.rate ?? RATE },
        });
        const out = await ended;
        clearTimeout(timer);
        if (mode.current === 'file') mode.current = 'idle';
        if (fileStopped.current) return 'stopped';
        if (out.endedBy !== 'done') return 'failed';
        text = out.text;
      }
      return fixTradeWords(text, wordsRef.current);
    } catch {
      if (mode.current === 'file') mode.current = 'idle';
      return 'failed';
    } finally {
      setWriting(undefined);
    }
  }, []);

  /** Android: fetch the English (UK) pack so the phone hears with no signal. */
  const getPack = useCallback(async () => {
    try {
      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: LANG });
      if (r.status === 'download_success') setOnDevice(true);
      return r.status;
    } catch {
      return undefined;
    }
  }, []);

  const hearing: Hearing = listening ? 'listening' : refused ? 'refused' : chosenOrNeeded(choseType, plan.how) ? 'type' : 'ready';
  return {
    hearing,
    plan,
    caps,
    live,
    level,
    keeping,
    problem,
    /** False when the phone needs signal to write as they talk, so the screen can offer the download. */
    onPhone: onDevice,
    writing,
    start,
    stop,
    hearFile,
    getPack,
    typeInstead: () => setChoseType(true),
  };
}

const chosenOrNeeded = (chose: boolean, how: HowToHear) => chose || how === 'type';
