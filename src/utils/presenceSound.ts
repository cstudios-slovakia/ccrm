// TT2 D8.3 / C18: the presence-question sound. A tiny Web Audio synth with three candidate chimes,
// one shared AudioContext (unlocked from a click), and the repeat schedule.

export type PresenceSoundId = "chimeA" | "chimeB" | "chimeC";

export interface PresenceSoundPrefs {
  /** 0..1 */
  volume: number;
  muted: boolean;
  sound: PresenceSoundId;
}

export const PRESENCE_SOUND_IDS: PresenceSoundId[] = ["chimeA", "chimeB", "chimeC"];

export const DEFAULT_PRESENCE_SOUND: PresenceSoundPrefs = { volume: 0.6, muted: false, sound: "chimeA" };

export const sanitizePresenceSound = (raw: unknown): PresenceSoundPrefs => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PresenceSoundPrefs>;
  const v = typeof r.volume === "number" && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : DEFAULT_PRESENCE_SOUND.volume;
  return {
    volume: v,
    muted: r.muted === true,
    sound: PRESENCE_SOUND_IDS.includes(r.sound as PresenceSoundId) ? (r.sound as PresenceSoundId) : DEFAULT_PRESENCE_SOUND.sound,
  };
};

/**
 * Delay until the next chime. 20 s while the first half of the confirm window runs (the first five
 * minutes of the default ten), 8 s in the second half; null when there is no question.
 */
export const nextChimeDelayMs = (secondsToPause: number | null, confirmWindowSec: number): number | null => {
  if (secondsToPause === null || !Number.isFinite(secondsToPause) || secondsToPause <= 0 || confirmWindowSec <= 0) return null;
  return secondsToPause > confirmWindowSec / 2 ? 20_000 : 8_000;
};

let sharedCtx: AudioContext | null = null;

const audioCtor = (): typeof AudioContext | null => {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
};

/** Creates or resumes the shared AudioContext. Call it inside a click handler so later sounds are allowed. */
export const unlockPresenceAudio = (): AudioContext | null => {
  try {
    if (!sharedCtx) {
      const Ctor = audioCtor();
      if (!Ctor) return null;
      sharedCtx = new Ctor();
    }
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
};

interface Note {
  freq: number;
  at: number;
  dur: number;
  type: OscillatorType;
  peak: number;
  /** Optional soft overtone, as a multiple of freq. */
  overtone?: number;
}

const SOUNDS: Record<PresenceSoundId, Note[]> = {
  // The existing notification chime: D5 then A5, pure sines.
  chimeA: [
    { freq: 587.33, at: 0, dur: 0.15, type: "sine", peak: 0.3 },
    { freq: 880, at: 0.09, dur: 0.4, type: "sine", peak: 0.38 },
  ],
  // Softer marimba-like pair: G4 then C5 with a short woody 4x overtone.
  chimeB: [
    { freq: 392, at: 0, dur: 0.3, type: "triangle", peak: 0.34, overtone: 4 },
    { freq: 523.25, at: 0.18, dur: 0.45, type: "triangle", peak: 0.34, overtone: 4 },
  ],
  // Clear bell: E6 with a long ring, inharmonic 2.76x partial, then a lower B5.
  chimeC: [
    { freq: 1318.5, at: 0, dur: 0.9, type: "sine", peak: 0.26, overtone: 2.76 },
    { freq: 987.77, at: 0.22, dur: 1.1, type: "sine", peak: 0.22, overtone: 2.76 },
  ],
};

/** Plays one chime at `volume` (0..1). Silent when audio is unavailable or still locked. */
export const playPresenceSound = (sound: PresenceSoundId, volume: number): void => {
  try {
    const ctx = unlockPresenceAudio();
    const vol = Math.min(1, Math.max(0, volume));
    if (!ctx || ctx.state === "closed" || vol <= 0) return;
    const now = ctx.currentTime;
    for (const n of SOUNDS[sound] ?? SOUNDS.chimeA) {
      const partials: [number, number][] = [[n.freq, 1]];
      if (n.overtone) partials.push([n.freq * n.overtone, 0.18]);
      for (const [f, share] of partials) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + n.at;
        const peak = Math.max(0.0002, n.peak * share * vol);
        osc.type = n.type;
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur * (share < 1 ? 0.5 : 1));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + n.dur + 0.05);
      }
    }
  } catch {
    /* sound is a courtesy; the dialog and notification carry the question */
  }
};
