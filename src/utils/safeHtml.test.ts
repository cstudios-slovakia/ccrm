import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  filterStyleAttribute,
  htmlToText,
  safeAttachmentHref,
  sanitizeRichHtml,
} from "./safeHtml.ts";

// ---- no DOM (node): sanitising fails SAFE, never passes markup through ----------

test("sanitizeRichHtml escapes everything when there is no DOM to sanitise with", () => {
  const out = sanitizeRichHtml('<img src=x onerror="alert(1)"><b>hi</b>', "ticket");
  assert.ok(!out.includes("<"), out);
  assert.ok(out.includes("&lt;img"), out);
});

test("sanitizeRichHtml of an empty value is empty", () => {
  assert.equal(sanitizeRichHtml("", "ticket"), "");
  assert.equal(sanitizeRichHtml("", "block"), "");
});

test("escapeHtml escapes quotes as well, so the result is safe inside an attribute", () => {
  assert.equal(escapeHtml(`a<b>&"c"'d'`), "a&lt;b&gt;&amp;&quot;c&quot;&#39;d&#39;");
});

test("htmlToText strips tags without needing a DOM", () => {
  assert.equal(htmlToText("<b>bold</b> text"), "bold text");
  assert.equal(htmlToText(""), "");
});

// ---- attachment links -------------------------------------------------------------

test("safeAttachmentHref keeps same-origin paths, http(s) and base64 raster images", () => {
  assert.equal(safeAttachmentHref("/uploads/a.pdf"), "/uploads/a.pdf");
  assert.equal(safeAttachmentHref("uploads/a.pdf"), "uploads/a.pdf");
  assert.equal(safeAttachmentHref("https://example.com/x.png"), "https://example.com/x.png");
  assert.equal(safeAttachmentHref("http://example.com/x.png"), "http://example.com/x.png");
  assert.equal(safeAttachmentHref("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
});

test("safeAttachmentHref refuses script-capable and unknown schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "//evil.example/x",
    "file:///etc/passwd",
  ]) {
    assert.equal(safeAttachmentHref(bad), "#", JSON.stringify(bad));
  }
});

test("safeAttachmentHref falls back to # for empty input", () => {
  assert.equal(safeAttachmentHref(""), "#");
  assert.equal(safeAttachmentHref(undefined), "#");
  assert.equal(safeAttachmentHref(null), "#");
});

// ---- style attribute filter ---------------------------------------------------------

test("filterStyleAttribute keeps plain presentation properties", () => {
  assert.equal(filterStyleAttribute("color: red; background-color: #ff0"), "color: red; background-color: #ff0");
  assert.equal(filterStyleAttribute("color: rgb(10, 20, 30)"), "color: rgb(10, 20, 30)");
});

test("filterStyleAttribute drops overlays, remote loads and anything unknown", () => {
  assert.equal(filterStyleAttribute("position: fixed; inset: 0; z-index: 9999"), "");
  assert.equal(filterStyleAttribute("background-color: url(https://evil.example/x)"), "");
  assert.equal(filterStyleAttribute("color: red; position: absolute"), "color: red");
  assert.equal(filterStyleAttribute("color: expression(alert(1))"), "");
  assert.equal(filterStyleAttribute("not a declaration"), "");
});
