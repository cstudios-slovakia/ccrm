// AudioWorklet for the Soniox live transcript: device-rate mic audio in, 100 ms frames of
// 16 kHz mono signed 16-bit PCM out (posted to the main thread as transferable ArrayBuffers).
//
// Loaded from a same-origin file (`import url from "./pcmCaptureWorklet.js?url"`): the CSP
// `script-src` has no `blob:`, so a blob-URL worklet would fail in production.
//
// KEEP IN SYNC with src/utils/pcmResample.ts: `resampleChunk` and `floatToPcm16` below are a
// copy of the TypeScript originals (a worklet cannot import app modules).

const OUT_RATE = 16000;
const FRAME_SAMPLES = 1600;

const resampleChunk = (state, input) => {
  const n = input.length;
  if (n === 0) return new Float32Array(0);
  const at = (i) => (i === 0 ? state.prev : input[i - 1]);
  const lastIndex = n;
  const out = [];
  let p = state.pos;
  while (p < lastIndex) {
    const i = Math.floor(p);
    const f = p - i;
    const a = at(i);
    const b = at(i + 1);
    out.push(a + f * (b - a));
    p += state.ratio;
  }
  state.pos = p - lastIndex;
  state.prev = input[n - 1];
  return Float32Array.from(out);
};

const floatToPcm16 = (input) => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
};

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is the AudioContext rate (a global in the worklet scope).
    this.state = { ratio: sampleRate / OUT_RATE, pos: 0, prev: 0 };
    this.buf = new Int16Array(FRAME_SAMPLES * 2);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true;
    const pcm = floatToPcm16(resampleChunk(this.state, channel));
    let offset = 0;
    while (offset < pcm.length) {
      const take = Math.min(FRAME_SAMPLES - this.filled, pcm.length - offset);
      this.buf.set(pcm.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === FRAME_SAMPLES) {
        const frame = this.buf.slice(0, FRAME_SAMPLES);
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
