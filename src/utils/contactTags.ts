// ponytail: stored as JSON array in leads.contact_tags; also mirrored into
// leads.contact_role (VARCHAR 120) so legacy readers keep working.

/** Normalize raw tags (array or comma-separated string), trimming, dropping blanks, deduplicating case-insensitively. */
export function normalizeContactTags(raw?: string[] | string | null): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of parts) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Prefer `contactTags` when non-empty, otherwise fall back to legacy `contactRole`. */
export function resolveContactTags(
  contactTags?: string[] | null,
  contactRole?: string | null
): string[] {
  const fromArray = normalizeContactTags(contactTags);
  return fromArray.length > 0 ? fromArray : normalizeContactTags(contactRole);
}

/** Summary string kept in `contactRole` (VARCHAR 120) for backward compatibility. */
export function contactTagsSummary(tags: string[]): string | null {
  const clean = normalizeContactTags(tags);
  if (clean.length === 0) return null;
  return clean.join(", ").slice(0, 120);
}

/** Sorted unique tags across all leads/contacts for datalist autocomplete. */
export function collectAllContactTags(
  leads: Array<{ contactTags?: string[] | null; contactRole?: string | null }>
): string[] {
  const seen = new Map<string, string>();
  for (const lead of leads) {
    for (const tag of resolveContactTags(lead.contactTags, lead.contactRole)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}
