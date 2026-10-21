// Hold to talk, using the phone's own speech recogniser. Words stay on the
// phone: on-device recognition is asked for whenever the phone has it, set to
// English (UK) and primed with the firm's own trade words.
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

const LANG = 'en-GB';

export type Hearing =
  /** Ready to listen. */
  | 'ready'
  | 'listening'
  /** No recogniser on this phone or browser: they type instead. */
  | 'type'
  /** They said no to the microphone. */
  | 'refused';

const ERRORS: Record<string, string> = {
  'audio-capture': "The microphone isn't free. Close anything else using it and try again.",
  interrupted: 'A call or alarm stopped the listening. Hold to carry on.',
  'language-not-supported': "This phone can't do English (UK) speech. You can type instead.",
  network: "This phone needs signal for speech until its English (UK) pack is downloaded. You can type instead.",
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

/**
 * Press to start, release to stop. `stop` hands back everything heard since
 * `start`, once the recogniser has finished. `words` are the trade words to
 * listen out for (iPhone takes 100).
 */
export function useListen(words: string[]) {
  const [hearing, setHearing] = useState<Hearing>(() => (available() ? 'ready' : 'type'));
  const [live, setLive] = useState('');
  const [problem, setProblem] = useState('');
  /** False when the phone needs signal to hear, so the screen can offer the download. */
  const [onPhone, setOnPhone] = useState<boolean>();
  /** How loud they are right now, 0 to 1, for the waveform. */
  const [level, setLevel] = useState(0);
  const finals = useRef<string[]>([]);
  const interim = useRef('');
  const done = useRef<((text: string) => void) | undefined>(undefined);

  const heard = () => [...finals.current, interim.current].map((t) => t.trim()).filter(Boolean).join(' ');

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      finals.current.push(t);
      interim.current = '';
    } else interim.current = t;
    setLive(heard());
  });
  // The phone reports -2 (silence) to 10 (loud).
  useSpeechRecognitionEvent('volumechange', (e) => setLevel(Math.max(0, Math.min(1, e.value / 10))));
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'no-speech' || e.error === 'speech-timeout' || e.error === 'aborted') return;
    if (e.error === 'not-allowed') setHearing('refused');
    setProblem(ERRORS[e.error] ?? 'The phone stopped listening. Hold to try again.');
  });
  useSpeechRecognitionEvent('end', () => {
    const text = heard();
    finals.current = [];
    interim.current = '';
    setLive('');
    setLevel(0);
    setHearing((h) => (h === 'listening' ? 'ready' : h));
    done.current?.(text);
    done.current = undefined;
  });

  const start = useCallback(async () => {
    if (hearing === 'listening' || hearing === 'type') return;
    setProblem('');
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setHearing('refused');
      return;
    }
    const local = await offline();
    setOnPhone(local);
    finals.current = [];
    interim.current = '';
    setHearing('listening');
    ExpoSpeechRecognitionModule.start({
      lang: LANG,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: local,
      contextualStrings: words.slice(0, 100),
      iosTaskHint: 'dictation',
      volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      // Long pauses are normal on site: give them 10 seconds before the phone gives up.
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10_000 },
    });
  }, [hearing, words]);

  /** Stop and get what was said. Resolves with '' if nothing was heard. */
  const stop = useCallback(
    () =>
      new Promise<string>((resolve) => {
        if (hearing !== 'listening') return resolve('');
        done.current = resolve;
        ExpoSpeechRecognitionModule.stop();
      }),
    [hearing],
  );

  /** Android: fetch the English (UK) pack so the phone hears with no signal. */
  const getPack = useCallback(async () => {
    try {
      const r = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: LANG });
      if (r.status === 'download_success') setOnPhone(true);
      return r.status;
    } catch {
      return undefined;
    }
  }, []);

  return { hearing, live, level, problem, onPhone, start, stop, getPack, typeInstead: () => setHearing('type') };
}
