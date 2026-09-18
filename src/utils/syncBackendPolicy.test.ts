import assert from "node:assert/strict";
import test from "node:test";
import { rootFileIsNewer } from "../../scripts/sync-backend-policy.mjs";

test("a root-only uncommitted edit is refused", () => {
  assert.equal(
    rootFileIsNewer({ rootDirty: true, publicDirty: false, rootOnlyCommit: false }),
    true
  );
});

test("a commit that touched only the root copy is refused", () => {
  assert.equal(
    rootFileIsNewer({ rootDirty: false, publicDirty: false, rootOnlyCommit: true }),
    true
  );
});

test("a public-only edit is not refused — public/ is the normal source of truth", () => {
  assert.equal(
    rootFileIsNewer({ rootDirty: false, publicDirty: true, rootOnlyCommit: false }),
    false
  );
});

test("both copies in sync (no dirty root, no root-only commit) is not refused", () => {
  assert.equal(
    rootFileIsNewer({ rootDirty: false, publicDirty: false, rootOnlyCommit: false }),
    false
  );
});
