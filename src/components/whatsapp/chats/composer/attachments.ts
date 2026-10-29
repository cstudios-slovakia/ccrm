/**
 * Helpers for the file the user attaches to a message and for voice notes. Pure, so they are tested
 * without a browser; the recorder hook and the composer only call them.
 */

import { MAX_SEND_FILE_BYTES } from "../../api/contract.ts";

/** A pasted screenshot arrives as "image.png" or "blob"; give it a name that tells the recipient when. */
export function cleanPastedFile(file: File, now: number = Date.now()): File {
  if (!file.type.startsWith("image/")) return file;
  const name = (file.name || "").toLowerCase().trim();
  const generic = !name || name === "image.png" || name === "blob" || name === "unknown" || name === "picture.png";
  if (!generic) return file;
  const sub = file.type.split("/")[1]?.split("+")[0]?.trim();
  const ext = sub === "jpeg" ? "jpg" : sub || "png";
  return new File([file], `pasted-image-${now}.${ext}`, { type: file.type });
}

/** Is the file within what WAAI accepts? */
export const withinSizeLimit = (file: { size: number }): boolean => file.size <= MAX_SEND_FILE_BYTES;

/** 1.4 MB, 820 KB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The best Opus container the browser's recorder can write, in the order WhatsApp likes them. */
export const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"] as const;

export function pickAudioMime(isSupported: ((mime: string) => boolean) | undefined): string | undefined {
  return isSupported ? AUDIO_MIME_CANDIDATES.find((m) => isSupported(m)) : undefined;
}

/** The file extension of a recording's container. */
export function audioExtension(mime: string): "ogg" | "m4a" | "webm" {
  return mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
}

/** 0:07, 1:05. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Why the microphone could not be used, as a key into the composer's strings. */
export function micFailure(err: unknown): "denied" | "unavailable" {
  const name = err instanceof Error || (typeof err === "object" && err !== null && "name" in err) ? String((err as { name: unknown }).name) : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable";
}
