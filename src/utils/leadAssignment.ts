import type { LeadAssignmentSettings } from "../types";

/** Auto-assignment off — the behaviour every installation had before the setting existed. */
export const DEFAULT_LEAD_ASSIGNMENT: LeadAssignmentSettings = {
  mode: "off",
  users: [],
  rotate: true,
};

/**
 * Coerce anything (a stored blob, a sync payload, `undefined`) to a usable
 * config. Mirrors ccrm_normalize_lead_assignment() in api/auth.php — both sides
 * have to agree on what a malformed value means, or the settings-sync signature
 * flip-flops and pushes forever.
 */
export function normalizeLeadAssignment(value: unknown): LeadAssignmentSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<LeadAssignmentSettings>;
  const mode =
    raw.mode === "selected" || raw.mode === "all" ? raw.mode : "off";
  const users: string[] = [];
  if (Array.isArray(raw.users)) {
    for (const u of raw.users) {
      const name = typeof u === "string" ? u.trim() : "";
      if (name && !users.includes(name)) users.push(name);
    }
  }
  return { mode, users, rotate: raw.rotate !== false };
}

/**
 * The users new leads would actually be handed to, in rotation order.
 *
 * Names that no longer match a registered user are dropped, so a colleague who
 * left stops receiving leads without anyone having to remember to edit the pool.
 * This is a preview for the UI — the authoritative pick happens on the server.
 */
export function resolveAssignmentPool(
  config: LeadAssignmentSettings,
  userNames: string[],
): string[] {
  if (config.mode === "off") return [];
  if (config.mode === "all") return [...userNames].sort((a, b) => a.localeCompare(b));
  const byLower = new Map(userNames.map((n) => [n.toLowerCase(), n]));
  return config.users
    .map((u) => byLower.get(u.toLowerCase()))
    .filter((n): n is string => Boolean(n));
}

/** True when a new lead left without an owner will actually get one. */
export function isAutoAssignActive(
  config: LeadAssignmentSettings,
  userNames: string[],
): boolean {
  return resolveAssignmentPool(config, userNames).length > 0;
}
