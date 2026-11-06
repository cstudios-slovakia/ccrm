/**
 * Client-side end-of-speech detection for a `gpt-live-transcribe` session.
 *
 * That model supports neither `server_vad` nor `semantic_vad` (turn_detection must be null), so
 * the browser decides when a stretch of speech is over and sends `input_audio_buffer.commit`.
 * This is a plain energy gate with hysteresis: no model, no worklet, testable with numbers.
 *
 * Feed it one microphone level (RMS, 0..1) per tick; it says when to commit.
 */

export interface VadConfig {
  /** RMS above this counts as speech. */
  speechLevel: number;
  /** Silence this long after speech ends the turn. */
  silenceMs: number;
  /** Speech shorter than this is a click or a cough, not worth a commit. */
  minSpeechMs: number;
  /** Long unbroken speech is committed anyway, so text never lags minutes behind. */
  maxTurnMs: number;
}

export const DEFAULT_VAD: VadConfig = {
  speechLevel: 0.015,
  silenceMs: 700,
  minSpeechMs: 250,
  maxTurnMs: 20000,
};

export interface VadState {
  /** Speech heard since the last commit, in ms. */
  speechMs: number;
  /** Silence since speech last stopped, in ms. */
  silenceMs: number;
  /** Audio (speech or not) since the last commit once speech began, in ms. */
  turnMs: number;
  inSpeech: boolean;
}

export const initialVad = (): VadState => ({ speechMs: 0, silenceMs: 0, turnMs: 0, inSpeech: false });

export interface VadStep {
  state: VadState;
  commit: boolean;
}

export const stepVad = (state: VadState, level: number, dtMs: number, cfg: VadConfig = DEFAULT_VAD): VadStep => {
  const speaking = level >= cfg.speechLevel;
  let { speechMs, silenceMs, turnMs, inSpeech } = state;

  if (speaking) {
    speechMs += dtMs;
    silenceMs = 0;
    inSpeech = true;
    turnMs += dtMs;
  } else if (inSpeech) {
    silenceMs += dtMs;
    turnMs += dtMs;
  }
  // Silence before any speech is not part of a turn; it is never committed on its own.

  const ended = inSpeech && !speaking && silenceMs >= cfg.silenceMs;
  const tooLong = inSpeech && turnMs >= cfg.maxTurnMs;
  if (ended || tooLong) {
    const worthIt = speechMs >= cfg.minSpeechMs;
    return { state: initialVad(), commit: worthIt };
  }
  return { state: { speechMs, silenceMs, turnMs, inSpeech }, commit: false };
};

/** RMS of a time-domain byte buffer from `AnalyserNode.getByteTimeDomainData` (128 = zero). */
export const rmsFromBytes = (bytes: ArrayLike<number>): number => {
  if (!bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / bytes.length);
};
