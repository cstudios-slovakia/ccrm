import { categoryKey, sectionKey } from "./settingsRegistry.ts";
import type { VisibleCategory } from "./settingsRegistry.ts";

// Search over the settings registry. Pure, so it is unit-tested without a browser.
//
// Everything is compared accent-insensitively and case-insensitively: "ico" finds
// "IČO", "cim" finds "cím", "siet" finds "sieť". Several words narrow the result —
// every word has to match somewhere in the entry.

/** Lower-cased with combining marks removed (Slovak č š ž ľ ô, Hungarian ő ű á é…). */
export const foldText = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export interface SearchEntry {
  ref: string;
  categoryId: string;
  sectionId: string;
  categoryTitle: string;
  title: string;
  hint: string;
  keywords: string;
  /** Position in registry order, the tie-breaker. */
  order: number;
}

export interface SearchGroup {
  categoryId: string;
  hits: SearchEntry[];
}

export const buildSearchIndex = (cats: VisibleCategory[], t: (key: string) => string): SearchEntry[] => {
  const out: SearchEntry[] = [];
  let order = 0;
  for (const { def, sections } of cats) {
    const categoryTitle = t(categoryKey(def.id, "title"));
    for (const s of sections) {
      out.push({
        ref: `${def.id}/${s.id}`,
        categoryId: def.id,
        sectionId: s.id,
        categoryTitle,
        title: t(sectionKey(def.id, s.id, "title")),
        hint: t(sectionKey(def.id, s.id, "hint")),
        keywords: t(sectionKey(def.id, s.id, "kw")),
        order: order++,
      });
    }
  }
  return out;
};

export const queryTokens = (query: string): string[] => foldText(query).split(/\s+/).filter(Boolean);

const scoreToken = (e: SearchEntry, token: string): number => {
  const title = foldText(e.title);
  if (title.startsWith(token)) return 6;
  if (title.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(token))) return 5;
  if (title.includes(token)) return 4;
  if (foldText(e.keywords).includes(token)) return 3;
  if (foldText(e.hint).includes(token)) return 2;
  if (foldText(e.categoryTitle).includes(token)) return 1;
  return 0;
};

/** Hits grouped by category: the category with the best hit first, ties in registry order. */
export const searchSettings = (index: SearchEntry[], query: string): SearchGroup[] => {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];

  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of index) {
    let total = 0;
    let ok = true;
    for (const tok of tokens) {
      const sc = scoreToken(e, tok);
      if (sc === 0) { ok = false; break; }
      total += sc;
    }
    if (ok) scored.push({ e, score: total });
  }

  const byCategory = new Map<string, { best: number; first: number; hits: { e: SearchEntry; score: number }[] }>();
  for (const s of scored) {
    const g = byCategory.get(s.e.categoryId) ?? { best: 0, first: s.e.order, hits: [] };
    g.best = Math.max(g.best, s.score);
    g.first = Math.min(g.first, s.e.order);
    g.hits.push(s);
    byCategory.set(s.e.categoryId, g);
  }

  return [...byCategory.entries()]
    .sort(([, a], [, b]) => b.best - a.best || a.first - b.first)
    .map(([categoryId, g]) => ({
      categoryId,
      hits: g.hits.sort((a, b) => b.score - a.score || a.e.order - b.e.order).map((h) => h.e),
    }));
};

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits `text` so the parts matching any query word can be wrapped in <mark>.
 * Matching is on the folded text but the original characters are returned, so
 * "IČO" stays "IČO" while a search for "ico" lights it up.
 */
export const highlightSegments = (text: string, query: string): HighlightSegment[] => {
  const tokens = queryTokens(query);
  if (tokens.length === 0 || !text) return [{ text, match: false }];

  // Fold one original character at a time so folded offsets map back to original ones.
  let folded = "";
  const toOriginal: number[] = [];
  const chars = [...text];
  let offset = 0;
  for (const ch of chars) {
    const f = foldText(ch);
    for (let i = 0; i < f.length; i++) toOriginal.push(offset);
    folded += f;
    offset += ch.length;
  }

  const marked = new Array<boolean>(text.length).fill(false);
  for (const tok of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(tok, from);
      if (at === -1) break;
      const start = toOriginal[at];
      const endFolded = at + tok.length;
      const end = endFolded < toOriginal.length ? toOriginal[endFolded] : text.length;
      for (let i = start; i < end; i++) marked[i] = true;
      from = at + Math.max(tok.length, 1);
    }
  }

  const out: HighlightSegment[] = [];
  let cur = "";
  let curMatch = marked[0] ?? false;
  for (let i = 0; i < text.length; i++) {
    if (marked[i] !== curMatch) {
      out.push({ text: cur, match: curMatch });
      cur = "";
      curMatch = marked[i];
    }
    cur += text[i];
  }
  if (cur) out.push({ text: cur, match: curMatch });
  return out;
};
