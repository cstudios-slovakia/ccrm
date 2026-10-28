import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_TEMPLATE_SECTIONS,
  DEFAULT_LAYOUT,
  HEADING_MAX_LENGTH,
  luminance,
  normalizeLayout,
  normalizeSectionsOrder,
  readableTextOn,
  resolveAiTemplate,
  safeColor,
  safeHeading,
} from "./aiTemplateBlueprint.ts";

const colors = { primary: "#1e3a8a", secondary: "#2563eb", background: "#ffffff", accent: "#f97316", text: "#111827" };
const stored = (extra: Record<string, unknown> = {}) =>
  ({ id: "t", name: "T", colors, typography: { fontFamily: "sans", headingStyle: "bold" }, sectionsOrder: [], createdAt: "", ...extra }) as never;

test("safeColor keeps hex, expands shorthand and drops everything else", () => {
  assert.equal(safeColor("#ABC", "#000000"), "#aabbcc");
  assert.equal(safeColor(" #F97316 ", "#000000"), "#f97316");
  for (const bad of ["red", "url(javascript:alert(1))", "#12", "#12345g", "expression(1)", null, 12, {}]) {
    assert.equal(safeColor(bad, "#123456"), "#123456");
  }
});

test("luminance and readableTextOn pick a legible text colour", () => {
  assert.ok(luminance("#000000") < 0.01);
  assert.ok(luminance("#ffffff") > 0.99);
  assert.equal(readableTextOn("#0f172a"), "#ffffff");
  assert.equal(readableTextOn("#fde68a"), "#0f172a");
});

test("normalizeSectionsOrder reorders, drops unknown ids and duplicates, appends the missing ones", () => {
  const order = normalizeSectionsOrder(["footer", "bogus", "header", "footer", 7, "items_table"]);
  assert.deepEqual(order.slice(0, 3), ["footer", "header", "items_table"]);
  assert.equal(order.length, AI_TEMPLATE_SECTIONS.length);
  assert.deepEqual([...order].sort(), [...AI_TEMPLATE_SECTIONS].sort());
  // The missing blocks keep their Standard relative order.
  assert.deepEqual(order.slice(3), AI_TEMPLATE_SECTIONS.filter(s => !["footer", "header", "items_table"].includes(s)));
});

test("normalizeSectionsOrder falls back to the Standard order for anything that is not a list", () => {
  for (const bad of [undefined, null, "header", {}, 3]) {
    assert.deepEqual(normalizeSectionsOrder(bad), [...AI_TEMPLATE_SECTIONS]);
  }
  assert.deepEqual(normalizeSectionsOrder([]), [...AI_TEMPLATE_SECTIONS]);
});

test("normalizeLayout accepts allow-listed values and replaces the rest with the defaults", () => {
  const layout = normalizeLayout({
    headerStyle: "dark-band",
    tableHeaderStyle: "<script>",
    uspCardStyle: "left-border",
    totalBannerStyle: "solid-dark",
    fontFamily: "Comic Sans MS",
    headings: { usp: "  Prečo   strechu\nzveriť nám?  ", items: 5, nextStep: "x".repeat(500) },
  });
  assert.equal(layout.headerStyle, "dark-band");
  assert.equal(layout.tableHeaderStyle, DEFAULT_LAYOUT.tableHeaderStyle);
  assert.equal(layout.uspCardStyle, "left-border");
  assert.equal(layout.totalBannerStyle, "solid-dark");
  assert.equal(layout.fontFamily, "sans");
  assert.equal(layout.headings.usp, "Prečo strechu zveriť nám?");
  assert.equal(layout.headings.items, "");
  assert.equal(layout.headings.nextStep.length, HEADING_MAX_LENGTH);
});

test("normalizeLayout survives garbage", () => {
  for (const bad of [undefined, null, "x", 4, []]) {
    assert.deepEqual(normalizeLayout(bad), DEFAULT_LAYOUT);
  }
});

test("safeHeading strips control characters and collapses whitespace", () => {
  assert.equal(safeHeading("a\u0000b\tc\n\nd"), "a b c d");
  assert.equal(safeHeading(null), "");
});

test("a template stored before the variants existed renders exactly as it did", () => {
  const resolved = resolveAiTemplate(stored({ sectionsOrder: ["footer", "header"], badgeStyle: "pill", customBannerText: " Cena " }));
  assert.equal(resolved.legacy, true);
  assert.deepEqual(resolved.layout, DEFAULT_LAYOUT);
  // The order it stored is ignored: it always printed the Standard order.
  assert.deepEqual(resolved.sections, [...AI_TEMPLATE_SECTIONS]);
  // Page and text colours were never applied, and still are not.
  assert.equal(resolved.colors.background, null);
  assert.equal(resolved.colors.text, null);
  assert.equal(resolved.colors.primary, "#1e3a8a");
  assert.equal(resolved.badgeStyle, "pill");
  assert.equal(resolved.bannerText, "Cena");
});

test("a missing template resolves to the built-in defaults", () => {
  const resolved = resolveAiTemplate(null);
  assert.equal(resolved.legacy, true);
  assert.equal(resolved.colors.primary, "#1e1b4b");
  assert.equal(resolved.colors.accent, "#6366f1");
  assert.equal(resolved.badgeStyle, "rounded");
  assert.equal(resolved.bannerText, "");
});

test("a template with a layout applies its variants, order and colours", () => {
  const resolved = resolveAiTemplate(
    stored({
      layout: { headerStyle: "dark-band", uspCardStyle: "left-border", fontFamily: "serif", headings: { nextStep: "Ďalší krok" } },
      sectionsOrder: ["header", "client_metadata", "items_table"],
    })
  );
  assert.equal(resolved.legacy, false);
  assert.equal(resolved.layout.headerStyle, "dark-band");
  assert.equal(resolved.layout.fontFamily, "serif");
  assert.equal(resolved.layout.headings.nextStep, "Ďalší krok");
  assert.deepEqual(resolved.sections.slice(0, 3), ["header", "client_metadata", "items_table"]);
  assert.equal(resolved.sections.length, AI_TEMPLATE_SECTIONS.length);
  assert.equal(resolved.colors.text, "#111827");
  assert.equal(resolved.colors.dark, "#111827");
  assert.equal(resolved.colors.background, "#ffffff");
});

test("page and text colours that would make the document unreadable are ignored", () => {
  const resolved = resolveAiTemplate(
    stored({ layout: {}, colors: { ...colors, background: "#111111", text: "#f5f5f5" } })
  );
  assert.equal(resolved.colors.background, null);
  assert.equal(resolved.colors.text, null);
  assert.equal(resolved.colors.dark, "#0f172a");
});
