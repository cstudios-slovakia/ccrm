import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SEND_FILE_BYTES } from "../../api/contract.ts";
import {
  audioExtension,
  AUDIO_MIME_CANDIDATES,
  cleanPastedFile,
  formatBytes,
  formatDuration,
  micFailure,
  pickAudioMime,
  withinSizeLimit,
} from "./attachments.ts";

test("cleanPastedFile leaves non-image files alone", () => {
  const file = new File(["dummy content"], "report.pdf", { type: "application/pdf" });
  const cleaned = cleanPastedFile(file);
  assert.equal(cleaned.name, "report.pdf");
});

test("cleanPastedFile renames generic clipboard images to pasted-image timestamp names", () => {
  const genericNames = ["image.png", "blob", "unknown", "picture.png", ""];
  const now = 1730000000000;

  for (const name of genericNames) {
    const file = new File(["img"], name, { type: "image/png" });
    const cleaned = cleanPastedFile(file, now);
    assert.equal(cleaned.name, `pasted-image-${now}.png`);
  }

  // jpeg maps to jpg extension
  const jpegFile = new File(["img"], "image.png", { type: "image/jpeg" });
  const cleanedJpeg = cleanPastedFile(jpegFile, now);
  assert.equal(cleanedJpeg.name, `pasted-image-${now}.jpg`);
});

test("cleanPastedFile preserves meaningful custom image names", () => {
  const file = new File(["img"], "dashboard-screenshot.png", { type: "image/png" });
  const cleaned = cleanPastedFile(file);
  assert.equal(cleaned.name, "dashboard-screenshot.png");
});

test("withinSizeLimit checks attachment size against MAX_SEND_FILE_BYTES", () => {
  assert.equal(withinSizeLimit({ size: 1024 }), true);
  assert.equal(withinSizeLimit({ size: MAX_SEND_FILE_BYTES }), true);
  assert.equal(withinSizeLimit({ size: MAX_SEND_FILE_BYTES + 1 }), false);
});

test("formatBytes formats bytes, kilobytes and megabytes clearly", () => {
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(820 * 1024), "820 KB");
  assert.equal(formatBytes(1.4 * 1024 * 1024), "1.4 MB");
  assert.equal(formatBytes(32 * 1024 * 1024), "32.0 MB");
});

test("pickAudioMime picks the first supported container", () => {
  assert.equal(pickAudioMime(undefined), undefined);

  // prefers webm with opus if available
  const supportsWebmOpus = (m: string) => m === "audio/webm;codecs=opus";
  assert.equal(pickAudioMime(supportsWebmOpus), "audio/webm;codecs=opus");

  // falls back to ogg if webm opus is unsupported
  const supportsOgg = (m: string) => m.includes("ogg");
  assert.equal(pickAudioMime(supportsOgg), "audio/ogg;codecs=opus");

  // falls back to mp4
  const supportsMp4 = (m: string) => m === "audio/mp4";
  assert.equal(pickAudioMime(supportsMp4), "audio/mp4");
});

test("audioExtension extracts correct extension from mime", () => {
  assert.equal(audioExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(audioExtension("audio/mp4"), "m4a");
  assert.equal(audioExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(audioExtension("audio/webm"), "webm");
});

test("formatDuration formats seconds into mm:ss strings", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(7), "0:07");
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(-5), "0:00");
});

test("micFailure categorizes permission vs device errors", () => {
  const denied1 = new DOMException("Permission denied", "NotAllowedError");
  assert.equal(micFailure(denied1), "denied");

  const denied2 = new DOMException("Blocked", "SecurityError");
  assert.equal(micFailure(denied2), "denied");

  const unavailable1 = new DOMException("No mic", "NotFoundError");
  assert.equal(micFailure(unavailable1), "unavailable");

  const unavailable2 = new Error("General error");
  assert.equal(micFailure(unavailable2), "unavailable");

  assert.equal(micFailure("not an object"), "unavailable");
});
