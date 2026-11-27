/**
 * Which integration secrets did THIS client's user just clear?
 *
 * Every sync push carries the whole integrations config. The server cannot tell a blank
 * the user typed from a blank that a stale tab never refreshed, so it ignores blanks
 * unless the push lists the key in `clearSecrets` (sync.php). A key is listed only when an
 * update takes it from something (the real value or the server's mask) to empty; a stale
 * '' that merely stays '' is never listed.
 *
 * Keep the list in step with ccrm_integration_secret_keys() in api/auth.php
 * (secretClears.test.ts fails when they drift).
 */
export const INTEGRATION_SECRET_KEYS = [
  "openAiKey", "anthropicKey", "geminiKey",
  "smtpPassword", "exchClientSecret", "exchPassword",
  "metaAppSecret", "metaAccessToken", "googleClientSecret",
  "googleRefreshToken", "googleDevToken", "mariaDbPassword",
  "qdrantApiKey", "pineconeApiKey", "zernioApiKey", "sonioxApiKey",
] as const;

const isBlank = (v: unknown): boolean => v === undefined || v === null || v === "";

export const clearedSecretKeys = (prev: any, next: any): string[] =>
  INTEGRATION_SECRET_KEYS.filter((k) => !isBlank(prev?.[k]) && isBlank(next?.[k]));
