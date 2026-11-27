/**
 * Server-sent events over `fetch`. `EventSource` cannot send an `Authorization` header, and the module API
 * is bearer-only, so the QR / link-status stream (docs/WAAI-NATIVE-MODULE.md §4.3) is read from a
 * `ReadableStream` instead. Pure parsing, so it is tested on chunk boundaries.
 */

export interface SseEvent {
  /** `message` when the stream did not name one. */
  event: string;
  data: string;
  id: string | null;
}

/**
 * Incremental parser for the `text/event-stream` format. Feed it decoded text as it arrives; it returns
 * the events that completed. A line may end in LF, CRLF or CR, and a chunk may end anywhere - in the
 * middle of a field name, between the CR and the LF of one line break.
 */
export class SseParser {
  private pending = "";
  private started = false;
  private event = "";
  private data: string[] = [];
  private id: string | null = null;

  push(chunk: string): SseEvent[] {
    let text = this.pending + chunk;
    this.pending = "";
    if (!this.started && text.length > 0) {
      // A byte order mark at the very start is not part of the first line.
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      this.started = true;
    }
    const out: SseEvent[] = [];
    let from = 0;
    while (from < text.length) {
      let end = -1;
      for (let i = from; i < text.length; i++) {
        const c = text[i];
        if (c === "\n" || c === "\r") {
          end = i;
          break;
        }
      }
      if (end === -1) break;
      // A lone CR at the end of the chunk may be the first half of a CRLF: wait for the next chunk.
      if (text[end] === "\r" && end === text.length - 1) break;
      const line = text.slice(from, end);
      from = end + (text[end] === "\r" && text[end + 1] === "\n" ? 2 : 1);
      const done = this.line(line);
      if (done) out.push(done);
    }
    this.pending = text.slice(from);
    return out;
  }

  private line(line: string): SseEvent | null {
    if (line === "") {
      // A blank line dispatches the event, if it carried data.
      const event = this.data.length > 0 ? { event: this.event || "message", data: this.data.join("\n"), id: this.id } : null;
      this.event = "";
      this.data = [];
      return event;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
    else if (field === "id" && !value.includes("\u0000")) this.id = value;
    return null;
  }
}

/**
 * Read a response body as events until it ends, `signal` aborts or `onEvent` throws. An event the stream
 * ended in the middle of is dropped, as the format says.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = new SseParser();
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) onEvent(event);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
