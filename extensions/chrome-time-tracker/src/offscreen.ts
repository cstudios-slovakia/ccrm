/**
 * MV3 Offscreen Document: drives smooth 550ms visual pulse frames and synthesized
 * two-tone Web Audio chimes while `phase === "question"` (never calls chrome.* UI APIs directly).
 */
declare const chrome: any;

let pulseTimer: number | null = null;
let chimeTimer: number | null = null;
let audioCtx: AudioContext | null = null;
let frame = 0;
let tickCount = 0;
let config = {
  deadlineAtMs: 0,
  soundEnabled: true,
  soundVolume: 0.7,
};

function stopTimers(): void {
  if (pulseTimer !== null) {
    window.clearInterval(pulseTimer);
    pulseTimer = null;
  }
  if (chimeTimer !== null) {
    window.clearTimeout(chimeTimer);
    chimeTimer = null;
  }
}

function playTwoToneChime(volume: number): void {
  const clamped = Math.max(0.05, Math.min(1, volume));
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const notes = [880, 1174.66]; // A5 -> D6 gentle chime
    notes.forEach((freq, i) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(clamped * 0.25, now + i * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.42);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.45);
    });
  } catch {
    // Web Audio blocked or unavailable
  }
}

function scheduleNextChime(): void {
  if (chimeTimer !== null) {
    window.clearTimeout(chimeTimer);
    chimeTimer = null;
  }
  if (!config.soundEnabled) return;
  const remainingMs = config.deadlineAtMs > 0 ? config.deadlineAtMs - Date.now() : 600_000;
  // Every 20s in the first 5 min, every 8s in the last 5 min (matches TT2 C18).
  const delayMs = remainingMs <= 5 * 60_000 ? 8_000 : 20_000;
  chimeTimer = window.setTimeout(() => {
    if (config.soundEnabled) {
      playTwoToneChime(config.soundVolume);
      scheduleNextChime();
    }
  }, delayMs);
}

function startAlert(payload: { deadlineAtMs?: number; soundEnabled?: boolean; soundVolume?: number }, playNow: boolean): void {
  stopTimers();
  config = {
    deadlineAtMs: Number(payload.deadlineAtMs) || 0,
    soundEnabled: payload.soundEnabled !== false,
    soundVolume: typeof payload.soundVolume === "number" ? payload.soundVolume : 0.7,
  };
  frame = 0;
  tickCount = 0;
  if (playNow && config.soundEnabled) {
    playTwoToneChime(config.soundVolume);
  }
  scheduleNextChime();
  void chrome.runtime.sendMessage({ type: "pulse-frame", frame: 0, reAttention: true });
  pulseTimer = window.setInterval(() => {
    frame = (frame + 1) % 4;
    tickCount += 1;
    // Re-trigger taskbar/dock drawAttention pulse every ~5.5 seconds (10 frames)
    const reAttention = tickCount % 10 === 0;
    void chrome.runtime.sendMessage({ type: "pulse-frame", frame, reAttention }).catch(() => {});
  }, 550);
}

chrome.runtime.onMessage.addListener((message: any, _sender: unknown, sendResponse: (res: unknown) => void) => {
  if (message?.type === "offscreen-alert-start") {
    startAlert(message, message.playNow !== false);
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "offscreen-alert-stop") {
    stopTimers();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
