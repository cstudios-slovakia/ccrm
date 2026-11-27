import test from "node:test";
import assert from "node:assert/strict";
import { applyMarkdownFormat, renderBasicMarkdown, stripBasicMarkdown } from "./basicMarkdown.ts";

test("renderBasicMarkdown renders headings, lists, bold, italic, and inline code", () => {
  const md = [
    "## Summary",
    "- Fixed **login** bug in `auth.php`",
    "- Verified *edge* case",
    "",
    "1. Deployed locally",
    "2. Tested",
  ].join("\n");
  const html = renderBasicMarkdown(md);
  assert.match(html, /<h4>Summary<\/h4>/);
  assert.match(html, /<ul><li>Fixed <strong>login<\/strong> bug in <code>auth\.php<\/code><\/li><li>Verified <em>edge<\/em> case<\/li><\/ul>/);
  assert.match(html, /<ol><li>Deployed locally<\/li><li>Tested<\/li><\/ol>/);
});

test("renderBasicMarkdown escapes raw HTML to prevent XSS", () => {
  const html = renderBasicMarkdown("<script>alert(1)</script> **safe** `<b>x</b>`");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<strong>safe<\/strong>/);
  assert.match(html, /<code>&lt;b&gt;x&lt;\/b&gt;<\/code>/);
});

test("stripBasicMarkdown produces a clean single-line summary", () => {
  const out = stripBasicMarkdown("## Report\n- **Done** `api.php`\n- *Next* step");
  assert.equal(out, "Report · • Done api.php · • Next step");
});

test("applyMarkdownFormat wraps selection or inserts bullet", () => {
  const bolded = applyMarkdownFormat("Fixed bug", 6, 9, "bold");
  assert.equal(bolded.value, "Fixed **bug**");
  const bullet = applyMarkdownFormat("Item 1", 6, 6, "bullet");
  assert.equal(bullet.value, "Item 1\n- ");
});
