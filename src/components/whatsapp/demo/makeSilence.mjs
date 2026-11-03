// Regenerates assets/silence.wav, the voice note of the WhatsApp demo (docs/WHATSAPP-DEMO-MODULE.md C5.5).
// Usage: node src/components/whatsapp/demo/makeSilence.mjs [seconds]   (default 8: the longest `audio` message)
//
// 8 kHz, 8-bit, mono: a 44-byte RIFF header and one byte per sample. 8-bit PCM is unsigned, so silence is 0x80.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const seconds = Number(process.argv[2] ?? 8);
const rate = 8000;
const samples = Math.round(seconds * rate);
const wav = Buffer.alloc(44 + samples, 0x80);
wav.write("RIFF", 0, "ascii");
wav.writeUInt32LE(36 + samples, 4);
wav.write("WAVE", 8, "ascii");
wav.write("fmt ", 12, "ascii");
wav.writeUInt32LE(16, 16); // fmt chunk size
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate, 28); // byte rate = rate * channels * bytes per sample
wav.writeUInt16LE(1, 32); // block align
wav.writeUInt16LE(8, 34); // bits per sample
wav.write("data", 36, "ascii");
wav.writeUInt32LE(samples, 40);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "assets", "silence.wav"), wav);
console.log(`silence.wav: ${seconds}s, ${wav.length} bytes`);
