/**
 * The GitHub pairing of a project: `githubRepo` ("owner/name") and `githubBranch` (empty = the
 * repository's default branch). Same rules as ccrm_github_normalize_repo() / _branch() in
 * public/api/github_pushes.php, which is what the server stores; the editor applies them on blur so
 * what is shown is what was saved.
 */

/** "owner/name" from what was typed or pasted, or null when it is not a repository. */
export const normalizeGithubRepo = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const match = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/.exec(value);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return value;
};

/** The server branch: trimmed, at most 200 characters, no whitespace or control characters; otherwise null. */
export const normalizeGithubBranch = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (value === "" || [...value].length > 200 || /[\s\u0000-\u001F\u007F]/u.test(value)) return null;
  return value;
};
