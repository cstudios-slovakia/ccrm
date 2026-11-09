/**
 * Undo/redo history, pure. `present` is the current value. A push with a `coalesceKey`
 * equal to the key of the previous push replaces `present` without adding a step, so
 * typing in one text block is one undo step per editing session. Undo, redo and
 * `endCoalesce` end the session.
 */
export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  coalesceKey: string | null;
};

export const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], coalesceKey: null });

export const pushHistory = <T>(
  h: History<T>,
  next: T,
  options: { coalesceKey?: string; limit?: number } = {},
): History<T> => {
  if (next === h.present) return h;
  const limit = options.limit ?? HISTORY_LIMIT;
  const key = options.coalesceKey ?? null;
  if (key !== null && key === h.coalesceKey) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [], coalesceKey: key };
};

export const endCoalesce = <T>(h: History<T>): History<T> => (h.coalesceKey === null ? h : { ...h, coalesceKey: null });

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;

export const undo = <T>(h: History<T>): History<T> => {
  if (h.past.length === 0) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], coalesceKey: null };
};

export const redo = <T>(h: History<T>): History<T> => {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), coalesceKey: null };
};
