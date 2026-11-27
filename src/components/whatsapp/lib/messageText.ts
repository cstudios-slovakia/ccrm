/**
 * Turning a message body into what a bubble draws. Ported from WAAI (`link-preview.tsx`,
 * `lib/utils.ts`); pure functions, no I/O. A bubble renders text as text: the only thing it ever turns
 * into a link is an http(s) address found by `splitLinks`, and the caller adds `rel="noreferrer"`.
 */

export type TextSegment = { type: "text" | "url"; value: string };

/** Splits plain text into text and http(s) URL runs. Trailing sentence punctuation is not part of a URL. */
export function splitLinks(text: string): TextSegment[] {
  const re = /https?:\/\/[^\s<>"')\]]+/g;
  const out: TextSegment[] = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    const url = m[0].replace(/[.,;:!?'")\]]+$/, "");
    out.push({ type: "url", value: url });
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** The first link of a message, the one that gets a preview card. */
export function firstUrl(text: string): string | null {
  return splitLinks(text).find((s) => s.type === "url")?.value ?? null;
}

/**
 * Raw WhatsApp @-mention tokens (`@<8–15 digits>`) become `@+<digits>`, so messages stored before
 * mentions were resolved show a phone number rather than a bare id. Resolved mentions do not match.
 */
export function prettifyMentions(text: string): string {
  return text.replace(/(?<![\w+])@(\d{8,15})(?!\d)/g, "@+$1");
}

/** The text of a bubble as segments, mentions tidied. */
export function bubbleSegments(text: string): TextSegment[] {
  return splitLinks(prettifyMentions(text));
}

/** One or two capital letters for an avatar without a picture. */
export function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
