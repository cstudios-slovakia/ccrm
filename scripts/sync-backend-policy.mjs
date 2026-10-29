/**
 * Whether a root backend file must NOT be overwritten by its `public/`
 * source because the root copy looks like the newer one — see
 * `sync-backend.mjs`'s header for why the two trees can drift and why
 * `public/` is normally the source of truth.
 *
 * "Newer" is either kind of local lead the git history can show, checked
 * independently because either alone is enough proof the root file was
 * edited on purpose after the public copy:
 *
 *  - an uncommitted edit sitting only in the root file (`rootDirty` and not
 *    `publicDirty`), or
 *  - the most recent commit that touched either copy touched only the root
 *    one (`rootOnlyCommit`).
 *
 * A plain JS module (not TypeScript) so `sync-backend.mjs` can import it
 * with no build step, the same way it runs itself — see
 * `src/utils/syncBackendPolicy.test.ts` for the unit tests, which import it
 * straight from here.
 */
export function rootFileIsNewer({ rootDirty, publicDirty, rootOnlyCommit }) {
  if (rootDirty && !publicDirty) return true;
  if (rootOnlyCommit) return true;
  return false;
}

// `require` / `include` of a php path built from `__DIR__`. Anything else
// (a variable, a dirname() call) is invisible to this check on purpose.
const REQUIRE_SIBLING =
  /(?:require|include)(?:_once)?\s*(?:\(\s*)?__DIR__\s*\.\s*(['"])([^'"]+\.php)\1/g;

/** Relative php paths a file loads via `__DIR__ . '…'`. */
export function requiredSiblings(source) {
  return [...source.matchAll(REQUIRE_SIBLING)].map((match) => match[2]);
}

/**
 * Resolve `__DIR__ . $relReq` from a public/-relative php path.
 * Returns null when the result would leave `public/`.
 */
export function resolvePublicRelative(fromFile, relReq) {
  const dir = fromFile.split("/").slice(0, -1);
  for (const part of relReq.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (dir.length === 0) return null;
      dir.pop();
      continue;
    }
    dir.push(part);
  }
  if (dir.length === 0 || !dir[dir.length - 1].endsWith(".php")) return null;
  return dir.join("/");
}

/**
 * Php files that exist in the public/ set, are loaded (directly or through
 * another pulled file) by a file that already has a root copy, and themselves
 * have no root copy.
 *
 * `files` is `{ path, hasRoot, source }[]` with `path` relative to `public/`
 * using forward slashes. A public-only file that nothing mirrored loads is
 * left out — that is how screenshots and one-off scripts stay unmirrored.
 */
export function missingRequiredMirrors(files) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const present = new Set(files.filter((file) => file.hasRoot).map((file) => file.path));
  const queued = new Set();
  const queue = [];
  const enqueue = (path) => {
    if (queued.has(path)) return;
    queued.add(path);
    queue.push(path);
  };
  for (const path of present) {
    if (path.endsWith(".php")) enqueue(path);
  }

  const missing = [];
  while (queue.length > 0) {
    const path = queue.shift();
    const file = byPath.get(path);
    if (!file) continue;
    for (const relReq of requiredSiblings(file.source)) {
      const target = resolvePublicRelative(path, relReq);
      if (!target || !byPath.has(target)) continue;
      if (!present.has(target)) {
        missing.push({ path: target, requiredBy: path });
        present.add(target);
      }
      if (target.endsWith(".php")) enqueue(target);
    }
  }
  return missing;
}
