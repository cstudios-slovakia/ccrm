import { useCallback, useMemo, useRef } from "react";
import { useUserPrefs } from "../utils/userPrefs";
import { toSelectionArray } from "../utils/facetedFilters";

/**
 * Drop-in replacement for `useState` on a list screen's filter: the value is kept
 * in the user's DB row (UserPrefs.listFilters), so it survives opening a record
 * and coming back, a reload, and a switch to another device.
 *
 * `key` is "<screen>.<filter>". Pass only JSON-serialisable values (strings,
 * numbers, booleans, arrays) — a Date has to be stored as an ISO string.
 *
 * `isValid` guards a filter whose options are data: a stored status, manager or
 * category that has since been deleted would otherwise leave the list empty with
 * nothing on screen to explain why. An invalid stored value reads as the default.
 */
export function useListFilter<T>(
  key: string,
  fallback: T,
  isValid?: (value: T) => boolean
): [T, (value: T | ((prev: T) => T)) => void] {
  const { prefs, setListFilter } = useUserPrefs();
  const stored = prefs.listFilters?.[key] as T | undefined;
  const value = stored !== undefined && (!isValid || isValid(stored)) ? stored : fallback;

  // The setter is stable across renders, so it can sit in an effect dependency
  // list the way a useState setter can; it reads the current value through a ref.
  const valueRef = useRef(value);
  valueRef.current = value;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const setListFilterRef = useRef(setListFilter);
  setListFilterRef.current = setListFilter;

  const set = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(valueRef.current) : next;
    // Writing the value already stored would still push the user row to the server.
    if (JSON.stringify(resolved) === JSON.stringify(valueRef.current)) return;
    valueRef.current = resolved;
    // A filter back at its default is dropped rather than stored, so the blob
    // only ever holds what the user actually narrowed.
    const isDefault = JSON.stringify(resolved) === JSON.stringify(fallbackRef.current);
    setListFilterRef.current(key, isDefault ? undefined : resolved);
  }, [key]);

  return [value, set];
}

/** useListFilter for a date: stored as an ISO string, handed out as a Date. */
export function useListDateFilter(key: string): [Date | null, (value: Date | null) => void] {
  const [iso, setIso] = useListFilter<string | null>(key, null);
  const parsed = iso ? new Date(iso) : null;
  const value = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const set = useCallback((next: Date | null) => setIso(next ? next.toISOString() : null), [setIso]);
  return [value, set];
}

/**
 * useListFilter for a multi-select filter: a list of selected values, empty = no filter.
 * A value stored before the filter became multi-select ("all" or one string) reads as
 * the equivalent list, so nobody's remembered filter is lost.
 */
export function useListMultiFilter(key: string): [string[], (value: string[] | ((prev: string[]) => string[])) => void] {
  const [raw, setRaw] = useListFilter<unknown>(key, []);
  const stored = toSelectionArray(raw);
  const joined = stored.join("\u0000");
  // Stable identity while the contents are unchanged, so it can sit in dependency lists.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => stored, [joined]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const set = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    setRaw(typeof next === "function" ? next(valueRef.current) : next);
  }, [setRaw]);
  return [value, set];
}

const NO_PINS: string[] = [];

/** The options the user pinned for one filter (see UserPrefs.pinnedFilterOptions), and a toggle for one. */
export function usePinnedFilterOptions(key: string): [string[], (value: string) => void] {
  const { prefs, setPref } = useUserPrefs();
  const all = prefs.pinnedFilterOptions ?? {};
  const pinned = all[key] ?? NO_PINS;
  const toggle = useCallback((value: string) => {
    const next = pinned.includes(value) ? pinned.filter((v) => v !== value) : [...pinned, value];
    const map = { ...all };
    if (next.length) map[key] = next;
    else delete map[key];
    setPref("pinnedFilterOptions", map);
  }, [all, key, pinned, setPref]);
  return [pinned, toggle];
}
