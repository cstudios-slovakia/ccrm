import assert from "node:assert/strict";
import test from "node:test";
import {
  missingRequiredMirrors,
  requiredSiblings,
  rootFileIsNewer,
} from "../../scripts/sync-backend-policy.mjs";

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

test("required siblings are the __DIR__ php loads only", () => {
  const source = `
    require_once __DIR__ . '/time_entries_lib.php';
    include __DIR__ . '/../api/auth.php';
    require $path;
    require_once dirname(__DIR__) . '/config.php';
  `;
  assert.deepEqual(requiredSiblings(source), [
    "/time_entries_lib.php",
    "/../api/auth.php",
  ]);
});

test("a required public-only sibling is missing, including what it loads", () => {
  const files = [
    {
      path: "api/ticket_time_migration.php",
      hasRoot: true,
      source: "require_once __DIR__ . '/time_entries_lib.php';",
    },
    {
      path: "api/time_entries_lib.php",
      hasRoot: false,
      source: "require_once __DIR__ . '/time_cost.php';",
    },
    {
      path: "api/time_cost.php",
      hasRoot: false,
      source: "<?php",
    },
    {
      path: "api/dump_schema.php",
      hasRoot: false,
      source: "<?php // nobody mirrored loads this",
    },
  ];
  assert.deepEqual(missingRequiredMirrors(files), [
    { path: "api/time_entries_lib.php", requiredBy: "api/ticket_time_migration.php" },
    { path: "api/time_cost.php", requiredBy: "api/time_entries_lib.php" },
  ]);
});

test("a sibling that already has a root copy is not reported", () => {
  const files = [
    {
      path: "api/schema.php",
      hasRoot: true,
      source: "require_once __DIR__ . '/employee_name.php';",
    },
    { path: "api/employee_name.php", hasRoot: true, source: "<?php" },
  ];
  assert.deepEqual(missingRequiredMirrors(files), []);
});

test("a require that leaves public/ is ignored", () => {
  const files = [
    {
      path: "api/auth.php",
      hasRoot: true,
      source: "require_once __DIR__ . '/../../secret.php';",
    },
    { path: "secret.php", hasRoot: false, source: "<?php" },
  ];
  assert.deepEqual(missingRequiredMirrors(files), []);
});
