import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSegment } from "../utils/liveTranscript";
import {
  ERROR_AFTER_FAILURES,
  applyFailure,
  applySuccess,
  beginRequest,
  buildRequest,
  createLiveDocState,
  decideUpdate,
  deriveStatus,
  isPristine,
  parseResponseSections,
  pendingIdsOf,
  shouldResetDocument,
} from "../utils/liveDocument";
import type { LiveDocRecordingState, LiveDocSection, LiveDocState, LiveDocStatus } from "../utils/liveDocument";

export type { LiveDocSection, LiveDocStatus } from "../utils/liveDocument";

/** The live meeting document (docs/LIVE-MEETING-DOCUMENT.md, C1.3). */
export interface LiveDocument {
  /** Closed ones first, then at most one open section. */
  sections: LiveDocSection[];
  /** Ids of FINAL segments that are not in the document yet (the panel shows them as the live tail). */
  pendingIds: Set<string>;
  /** "error" only after 3 consecutive failures; it keeps retrying. */
  status: LiveDocStatus;
  /** Raw server text, for a tooltip. */
  errorDetail?: string;
  clear: () => void;
}

export interface UseLiveDocumentOptions {
  /** Focus helper on and available. */
  enabled: boolean;
  /** From useLiveTranscription. */
  segments: LiveSegment[];
  recordingState: LiveDocRecordingState;
  /** UI language; the meeting language wins in the prompt. */
  language: "en" | "sk" | "hu";
}

/** How often the driver looks at the state machine. */
const TICK_MS = 2000;

/**
 * A thin driver around the pure state machine in utils/liveDocument.ts: a 2 s tick asks
 * `decideUpdate`, posts the request (one in flight at a time) and merges the answer. A response
 * that arrives after `clear()` or a reset is ignored (generation counter).
 */
export function useLiveDocument({ enabled, segments, recordingState, language }: UseLiveDocumentOptions): LiveDocument {
  const [state, setState] = useState<LiveDocState>(createLiveDocState);
  const stateRef = useRef(state);

  // The tick reads the latest props from refs, so the interval is not torn down on every render.
  const segmentsRef = useRef(segments);
  const recordingRef = useRef(recordingState);
  const languageRef = useRef(language);
  segmentsRef.current = segments;
  recordingRef.current = recordingState;
  languageRef.current = language;

  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: LiveDocState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clear = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!isPristine(stateRef.current)) commit(createLiveDocState());
  }, [commit]);

  // A recording that is gone, or a new one (the segments emptied), starts the document over.
  const previousCountRef = useRef(segments.length);
  useEffect(() => {
    if (shouldResetDocument(previousCountRef.current, segments.length, recordingState)) clear();
    previousCountRef.current = segments.length;
  }, [segments.length, recordingState, clear]);

  const active = enabled && recordingState !== "none";
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const current = stateRef.current;
      const now = Date.now();
      const decision = decideUpdate(current, segmentsRef.current, recordingRef.current, now);
      if (!decision) return;
      const built = buildRequest(current, segmentsRef.current, languageRef.current, decision.final);
      if (!built) return;

      const generation = generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      commit(beginRequest(current, now));

      void (async () => {
        try {
          const res = await fetch("/api/live_meeting_document.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(built.request),
            signal: controller.signal,
          });
          const data = await res.json().catch(() => ({}));
          const sections = res.ok && data?.success ? parseResponseSections(data) : null;
          if (generation !== generationRef.current) return;
          if (!sections) throw new Error(data?.message || `HTTP ${res.status}`);
          commit(applySuccess(stateRef.current, built, sections));
        } catch (e: unknown) {
          if (generation !== generationRef.current) return;
          commit(applyFailure(stateRef.current, Date.now(), e instanceof Error ? e.message : String(e)));
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      })();
    };
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, commit]);

  // Unmount: nothing may touch state afterwards.
  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const pendingIds = useMemo(() => pendingIdsOf(segments, state), [segments, state]);
  const status = deriveStatus(state, segments);

  return {
    sections: state.sections,
    pendingIds,
    status,
    errorDetail: state.failures >= ERROR_AFTER_FAILURES ? state.errorDetail : undefined,
    clear,
  };
}
