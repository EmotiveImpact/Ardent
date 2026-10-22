/**
 * Ardent's own downloadable speech model, for phones that can't hear English
 * (UK) without signal on their own. None is fitted yet: which model goes here
 * is settled by the comparison in plans/voice-offline-models.md, and it needs
 * a native module, so it arrives with a new app build. Until then the phone's
 * own speech and kept recordings carry everything.
 */

export interface SpeechModel {
  /** Shown to the office and in support, such as "Moonshine Small Streaming". */
  name: string;
  /** Downloaded, checked and loaded, so it can hear with no signal. */
  ready(): Promise<boolean>;
  /** The words in a kept 16 kHz mono WAV recording, primed with the firm's trade words where the model takes them. */
  hearFile(uri: string, o: { rate: number; words: string[] }): Promise<string>;
}

export const speechModel: SpeechModel | undefined = undefined;
