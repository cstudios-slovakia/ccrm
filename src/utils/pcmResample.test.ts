import assert from "node:assert/strict";
import test from "node:test";
import { createFrameBuffer, createResampler, floatToPcm16, resampleChunk } from "./pcmResample.ts";

const sine = (n: number, rate: number, hz: number): Float32Array =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));

test("48 kHz to 16 kHz yields a third of the samples", () => {
  const out = resampleChunk(createResampler(48000, 16000), sine(4800, 48000, 440));
  assert.ok(Math.abs(out.length - 1600) <= 1, String(out.length));
});

test("44.1 kHz to 16 kHz keeps the right sample count over many chunks", () => {
  const st = createResampler(44100, 16000);
  let total = 0;
  for (let i = 0; i < 100; i++) total += resampleChunk(st, sine(441, 44100, 300)).length; // 1 s
  assert.ok(Math.abs(total - 16000) <= 2, String(total));
});

test("chunking does not change the result", () => {
  const input = sine(2400, 48000, 523);
  const whole = resampleChunk(createResampler(48000, 16000), input);
  const st = createResampler(48000, 16000);
  const parts: number[] = [];
  for (let at = 0; at < input.length; at += 128) parts.push(...resampleChunk(st, input.slice(at, at + 128)));
  assert.equal(parts.length, whole.length);
  for (let i = 0; i < whole.length; i++) assert.ok(Math.abs(parts[i] - whole[i]) < 1e-6, `sample ${i}`);
});

test("a sine keeps its shape: samples follow the source waveform", () => {
  const out = resampleChunk(createResampler(48000, 16000), sine(4800, 48000, 200));
  // Output sample k sits at input position 3k - 1 (one sample of carried history).
  for (let k = 5; k < out.length - 5; k += 37) {
    const expected = Math.sin((2 * Math.PI * 200 * (3 * k - 1)) / 48000);
    assert.ok(Math.abs(out[k] - expected) < 0.02, `k=${k}`);
  }
});

test("equal rates pass the samples through, one sample late", () => {
  const out = resampleChunk(createResampler(16000, 16000), Float32Array.from([0.1, 0.2, 0.3]));
  assert.deepEqual([...out].map((v) => Math.round(v * 10) / 10), [0, 0.1, 0.2]);
});

test("an empty chunk gives nothing and keeps the state", () => {
  const st = createResampler(48000, 16000);
  assert.equal(resampleChunk(st, new Float32Array(0)).length, 0);
  assert.equal(st.pos, 0);
});

test("floatToPcm16 scales to int16 and clips", () => {
  assert.deepEqual([...floatToPcm16([0, 1, -1, 0.5, -0.5, 2, -3])], [0, 32767, -32768, 16384, -16384, 32767, -32768]);
});

test("floatToPcm16 is little-endian once viewed as bytes", () => {
  const bytes = new Uint8Array(floatToPcm16([1]).buffer);
  assert.deepEqual([...bytes], [0xff, 0x7f]);
});

test("the frame buffer emits 100 ms frames and keeps the remainder", () => {
  const fb = createFrameBuffer(1600);
  assert.equal(fb.push(new Int16Array(1000)).length, 0);
  const frames = fb.push(new Int16Array(2300));
  assert.equal(frames.length, 2);
  assert.ok(frames.every((f) => f.length === 1600));
  assert.equal(fb.pending(), 100);
});
