/**
 * The pure mapping helpers of the notes migration (public/api/notes_migration.php): how an old lead or
 * project note entry becomes the text of a row in `notes`, and the one-line snippet its trace entry keeps.
 * Runs the PHP file itself, so it needs `php` on PATH; without it the tests are skipped (a bare dev
 * machine may not have PHP; the same checks were run through the `crm` docker container instead).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../../public/api/notes_migration.php", import.meta.url)).replaceAll("\\", "/");
const hasPhp = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;

/** Evaluates a PHP expression with the migration's helpers loaded and returns it as JSON-decoded data. */
const php = (expression) => {
  const code = `require ${JSON.stringify(FILE)}; echo json_encode(${expression}, JSON_UNESCAPED_UNICODE);`;
  const run = spawnSync("php", ["-r", code], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
};

const blocks = JSON.stringify([
  { id: "b-1", type: "paragraph", content: "Call <strong>back</strong> &amp; confirm" },
  { id: "b-2", type: "todo", content: "Send offer", checked: true },
  { id: "b-3", type: "todo", content: "Book site visit", checked: false },
  { id: "b-4", type: "bullet", content: "Marble" },
]);

test("plain text of an old rich lead note", { skip: !hasPhp }, () => {
  assert.equal(
    php(`ccrm_notes_plain_text(${JSON.stringify(blocks)})`),
    "Call back & confirm\n[x] Send offer\n[ ] Book site visit\n- Marble",
  );
});

test("text that is not block JSON is kept as typed", { skip: !hasPhp }, () => {
  assert.equal(php(`ccrm_notes_plain_text("  [urgent] ring me\\nthanks ")`), "[urgent] ring me\nthanks");
  assert.equal(php(`ccrm_notes_plain_text(null)`), "");
});

test("a transcript the blocks do not hold is appended, one they hold is not", { skip: !hasPhp }, () => {
  assert.equal(php(`ccrm_notes_lead_content("Hello", "Spoken words")`), "Hello\n\nSpoken words");
  assert.equal(php(`ccrm_notes_lead_content("Hello Spoken words", "Spoken words")`), "Hello Spoken words");
});

test("project note: the title goes on top unless it is the type's own label", { skip: !hasPhp }, () => {
  assert.equal(php(`ccrm_notes_project_content("Site survey", "Measured 3 rooms")`), "Site survey\nMeasured 3 rooms");
  assert.equal(php(`ccrm_notes_project_content("Site survey", "")`), "Site survey");
  assert.equal(php(`ccrm_notes_project_content("Internal Note", "Measured 3 rooms")`), "Measured 3 rooms");
  assert.equal(php(`ccrm_notes_project_content("Interná poznámka", "Zamerané")`), "Zamerané");
});

test("snippet is one line of at most 80 characters", { skip: !hasPhp }, () => {
  assert.equal(php(`ccrm_notes_snippet("a\\n  b\\tc")`), "a b c");
  const long = php(`ccrm_notes_snippet(str_repeat("word ", 40))`);
  assert.ok(long.length <= 80 && long.endsWith("…"), long);
});

test("trace titles follow the language of the entry they came from", { skip: !hasPhp }, () => {
  assert.equal(php(`ccrm_notes_activity_title("added", "sk")`), "Poznámka pridaná");
  assert.equal(php(`ccrm_notes_activity_title("deleted", "hu")`), "Jegyzet törölve");
  assert.equal(php(`ccrm_notes_activity_title("edited", "xx")`), "Note edited");
});
