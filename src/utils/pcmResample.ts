/**
 * Streaming resampler + float -> 16-bit PCM conversion for the Soniox live transcript.
 *
 * The microphone runs at the device rate (44.1 / 48 kHz); Soniox is fed 16 kHz mono
 * little-endian signed 16-bit. Linear interpolation is plenty for speech.
 *
 * KEEP IN SYNC: `src/utils/pcmCaptureWorklet.js` carries its own copy of `resampleChunk` and
 * `floatToPcm16`, because an AudioWorklet cannot import app modules. If you change the maths here,
 * change it there too; `pcmResample.test.ts` documents the expected behaviour.
 */

export interface ResamplerState {
  /** Input samples per output sample (inRate / outRate). */
  ratio: number;
  /** Read position inside the next virtual buffer [prev, ...chunk]. */
  pos: number;
  /** Last sample of the previous chunk, so interpolation is continuous across chunks. */
  prev: number;
}

export const createResampler = (inRate: number, outRate: number): ResamplerState => ({
  ratio: inRate / outRate,
  pos: 0,
  prev: 0,
});

/**
 * Resample one chunk. Mutates `state` (position and carried sample) and returns the output
 * samples. Chunk sizes may vary freely; the result is the same as resampling the concatenation.
 */
export const resampleChunk = (state: ResamplerState, input: ArrayLike<number>): Float32Array => {
  const n = input.length;
  if (n === 0) return new Float32Array(0);
  // Virtual buffer v: index 0 is the carried sample, 1..n the chunk.
  const at = (i: number): number => (i === 0 ? state.prev : input[i - 1]);
  const lastIndex = n; // v.length - 1
  const out: number[] = [];
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

/** Float samples in [-1, 1] to signed 16-bit (clipped). */
export const floatToPcm16 = (input: ArrayLike<number>): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]));
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return out;
};

/** Frame size sent to Soniox: 100 ms of 16 kHz audio. */
export const PCM_FRAME_SAMPLES = 1600;

/** Collects Int16 samples and hands out fixed-size frames. */
export const createFrameBuffer = (frameSamples = PCM_FRAME_SAMPLES) => {
  let buf = new Int16Array(0);
  return {
    push(samples: Int16Array): Int16Array[] {
      const merged = new Int16Array(buf.length + samples.length);
      merged.set(buf, 0);
      merged.set(samples, buf.length);
      const frames: Int16Array[] = [];
      let offset = 0;
      while (merged.length - offset >= frameSamples) {
        frames.push(merged.slice(offset, offset + frameSamples));
        offset += frameSamples;
      }
      buf = merged.slice(offset);
      return frames;
    },
    /** What is left over (less than one frame). */
    pending: () => buf.length,
  };
};
