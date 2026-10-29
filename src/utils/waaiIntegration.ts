// Helpers for Settings → Integrations → WhatsApp (WAAI): the checks the form runs before it
// asks the server (the server repeats them — api/integration_admin.php), and the text an
// administrator copies into WAAI's environment. docs/WAAI-INTEGRATION.md §4.1 and §4.7.

/** Every scope the machine API knows (api/integration_lib.php ccrm_int_scopes), in the server's order. */
export const WAAI_SCOPES = ["users:read", "directory:read", "tasks:push", "tasks:pull", "whatsapp:links", "timeline:push"] as const;
export type WaaiScope = (typeof WAAI_SCOPES)[number];

const isIpv4 = (v: string): boolean => {
  const parts = v.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
};

const isIpv6 = (v: string): boolean => {
  if (!v.includes(":") || /[^0-9a-fA-F:.]/.test(v)) return false;
  try {
    return new URL(`http://[${v}]/`).hostname !== "";
  } catch {
    return false;
  }
};

/** An IPv4 or IPv6 address, or a CIDR block of either. */
export function isIpOrCidr(value: string): boolean {
  const [addr, prefix, ...extra] = value.trim().split("/");
  if (extra.length || !addr) return false;
  const v4 = isIpv4(addr);
  if (!v4 && !isIpv6(addr)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (v4 ? 32 : 128);
}

/** The "allowed addresses" textarea → a clean list. Commas, spaces and new lines all separate. */
export function parseIpList(text: string): { ips: string[]; invalid: string[] } {
  const items = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const ips: string[] = [];
  const invalid: string[] = [];
  for (const item of items) {
    if (!isIpOrCidr(item)) invalid.push(item);
    else if (!ips.includes(item)) ips.push(item);
  }
  return { ips, invalid };
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|(^|\.)localtest\.me$/;

/**
 * WAAI's address as an origin (`https://wa.example.sk`), the way the server stores it. "" stays "" (not set).
 * Returns null for anything else that is not an origin: a path, credentials, a query, plain http outside a
 * local development host.
 */
export function normalizeEmbedOrigin(input: string): string | null {
  const text = input.trim();
  if (text === "") return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;
  const local = LOCAL_HOST.test(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url.origin;
}

/**
 * The lines for single sign-on in WAAI's `.env` (the `web` container for the first two, `caddy` for the third):
 * who the CRM is, the secret it signs with, and which origin may frame WAAI. While a secret is being swapped,
 * WAAI takes two separated by a comma: the new one first, the old one until nobody needs it.
 */
export function waaiSsoEnvSnippet(crmOrigin: string, secret: string, previousSecret?: string | null): string {
  const origin = crmOrigin.replace(/\/+$/, "");
  return [
    `CCRM_ORIGIN=${origin}`,
    `CCRM_SSO_SECRET=${previousSecret ? `${secret},${previousSecret}` : secret}`,
    `WAAI_EMBED_ORIGINS=${origin}`,
  ].join("\n");
}

/**
 * The lines to put in WAAI's `.env` (the `ai-worker` container only). `CRM_DRY_RUN=1` is the first rollout step:
 * WAAI logs what it would send and sends nothing.
 */
export function waaiEnvSnippet(crmOrigin: string, token?: string | null): string {
  return [
    `CRM_BASE_URL=${crmOrigin.replace(/\/+$/, "")}`,
    `CRM_API_TOKEN=${token || "<token>"}`,
    "CRM_DRY_RUN=1",
  ].join("\n");
}
