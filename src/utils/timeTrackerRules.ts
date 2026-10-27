/**
 * Pure rules for the Chrome time tracker (phase 5).
 *
 * The PHP endpoint is the authority (`public/api/time_tracker_lib.php`) and
 * must keep the same numbers: pairing TTL 10 minutes, offline window 24 hours,
 * activity merge gap 60 seconds, minimum block 5 minutes.
 * No fetching and no DOM.
 */

export const EXTENSION_VERSION = "1.0.0";

/** How long a pairing code stays valid. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** A queued start/stop may be this old, and never in the future. */
export const OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Consecutive blocks on the same site merge when the gap is at most this. */
export const ACTIVITY_MERGE_GAP_MS = 60 * 1000;

export const DEFAULT_ACTIVITY_MIN_MINUTES = 5;

/** Unambiguous alphabet: no I, O, 0 or 1. The shown form is XXXX-XXXX. */
export const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface ActivityBlock {
  domain: string;
  pageTitle: string;
  /** Unix milliseconds. */
  startedAt: number;
  endedAt: number;
}

export interface WatchedSite {
  pattern: string;
  projectId: string | null;
}

export type PairingState = "valid" | "expired" | "used";

/** `K7Q4-9MZT`, or null when the code is the wrong length or uses a dropped character. */
export function normalizePairingCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8) return null;
  if ([...compact].some((c) => !PAIRING_ALPHABET.includes(c))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/** The 8 characters that are hashed. The dash is display only. */
export function pairingCodeMaterial(displayed: string): string | null {
  const normalized = normalizePairingCode(displayed);
  return normalized ? normalized.replace("-", "") : null;
}

/**
 * Single use wins over the clock: a consumed code stays used after it would
 * have expired. `expiresAtMs` is exclusive (`now >= expires` is expired).
 */
export function pairingCodeState(row: { expiresAtMs: number; usedAtMs: number | null }, nowMs: number): PairingState {
  if (row.usedAtMs !== null) return "used";
  if (!(nowMs < row.expiresAtMs)) return "expired";
  return "valid";
}

export function pairingCodeAccepted(row: { expiresAtMs: number; usedAtMs: number | null }, nowMs: number): boolean {
  return pairingCodeState(row, nowMs) === "valid";
}

/** True when a client timestamp is not in the future and not older than 24 hours. */
export function acceptClientTimestamp(clientMs: number, nowMs: number): boolean {
  if (!Number.isFinite(clientMs) || !Number.isFinite(nowMs)) return false;
  if (clientMs > nowMs) return false;
  return nowMs - clientMs <= OFFLINE_WINDOW_MS;
}

/** A stop must sit inside the 24h window and not before its start. */
export function acceptStoppedAt(startMs: number, stoppedMs: number, nowMs: number): boolean {
  return acceptClientTimestamp(stoppedMs, nowMs) && Number.isFinite(startMs) && stoppedMs >= startMs;
}

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Hostname only. Protocol, userinfo, port, path, query and hash are removed.
 * A leading `www.` is removed so it merges with the bare domain. Anything that
 * is not a hostname becomes null — the path is never returned.
 */
export function hostOnly(input: string): string | null {
  let raw = input.trim();
  if (!raw || raw.length > 2000) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).hostname;
    } catch {
      return null;
    }
  }
  raw = (raw.split(/[/?#\s]/)[0] ?? "").replace(/^.*@/, "").replace(/:\d+$/, "");
  raw = raw.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!HOST.test(raw)) return null;
  return raw;
}

/** `github.com` or `*.github.com`. Paths and schemes are stripped. */
export function normalizeSitePattern(raw: string): string | null {
  let body = raw.trim().toLowerCase();
  const wild = body.startsWith("*.");
  if (wild) body = body.slice(2);
  const host = hostOnly(body);
  if (!host) return null;
  return wild ? `*.${host}` : host;
}

/** Exact host or a subdomain. `notgithub.com` does not match `github.com`. */
export function siteMatches(host: string, pattern: string): boolean {
  const left = hostOnly(host);
  const domain = hostOnly(pattern.trim().toLowerCase().replace(/^\*\./, ""));
  if (!left || !domain) return false;
  return left === domain || left.endsWith(`.${domain}`);
}

export function matchingSite(host: string, sites: readonly WatchedSite[]): WatchedSite | null {
  for (const site of sites) {
    if (siteMatches(host, site.pattern)) return site;
  }
  return null;
}

/**
 * Sort by start, merge consecutive same-domain blocks (gap ≤ 60s, overlap counts),
 * then drop whatever is still shorter than `minMinutes`. The page title kept is
 * the later block's title. The result has only domain, title and times.
 */
export function mergeActivityBlocks(blocks: readonly ActivityBlock[], minMinutes = DEFAULT_ACTIVITY_MIN_MINUTES): ActivityBlock[] {
  const minMs = Math.max(0, minMinutes) * 60 * 1000;
  const cleaned: ActivityBlock[] = [];
  for (const block of blocks) {
    const domain = hostOnly(block.domain);
    if (!domain) continue;
    if (!Number.isFinite(block.startedAt) || !Number.isFinite(block.endedAt) || block.endedAt < block.startedAt) continue;
    const pageTitle = (block.pageTitle ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 300);
    cleaned.push({ domain, pageTitle, startedAt: block.startedAt, endedAt: block.endedAt });
  }
  cleaned.sort((a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt);
  const runs: ActivityBlock[] = [];
  for (const block of cleaned) {
    const prev = runs[runs.length - 1];
    const consecutive = !!prev && prev.domain === block.domain && block.startedAt - prev.endedAt <= ACTIVITY_MERGE_GAP_MS;
    if (prev && consecutive) {
      prev.endedAt = Math.max(prev.endedAt, block.endedAt);
      if (block.pageTitle) prev.pageTitle = block.pageTitle;
    } else {
      runs.push({ ...block });
    }
  }
  return runs.filter((block) => block.endedAt - block.startedAt >= minMs);
}

/** Toolbar badge while a timer runs. Empty string when idle — the caller clears the badge. */
export function badgeLabel(elapsedSec: number): string {
  const total = Math.max(0, Math.floor(elapsedSec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function isOlderExtensionVersion(device: string | null | undefined, current = EXTENSION_VERSION): boolean {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const found = parse(device || "0");
  const want = parse(current);
  for (let i = 0; i < 3; i++) {
    const delta = (found[i] ?? 0) - (want[i] ?? 0);
    if (delta < 0) return true;
    if (delta > 0) return false;
  }
  return false;
}
