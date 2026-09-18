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
