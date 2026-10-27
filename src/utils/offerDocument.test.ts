import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  diffTemplateFields,
  normalizeCustomFieldValues,
  normalizeOfferDocument,
  type OfferBlock
} from "./offerDocument.ts";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../scripts/fixtures/offer-document-sample.json"), "utf8")
) as { realistic: unknown; hostile: unknown };

const idsOf = (blocks: OfferBlock[]): string[] => {
  const ids: string[] = [];
  const walk = (list: OfferBlock[]) => {
    for (const block of list) {
      ids.push(block.id);
      if (block.type === "stack") walk(block.children);
      else if (block.type === "columns") for (const col of block.columns) walk(col);
    }
  };
  walk(blocks);
  return ids;
};

test("a realistic reconstruction normalises to stable ids", () => {
  const doc = normalizeOfferDocument(fixture.realistic);
  assert.ok(doc);
  assert.deepEqual(idsOf(doc.blocks), ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
  assert.equal(doc.blocks[0].type, "columns");
  const name = doc.blocks[0].type === "columns" ? doc.blocks[0].columns[0][0] : null;
  assert.equal(name?.type, "field");
  if (name?.type === "field") {
    assert.equal(name.fieldId, "company.name");
    assert.equal(name.label, "Firma");
    assert.deepEqual(name.style, { weight: "bold", fontSize: "lg", color: "#aabbcc" });
  }
  const table = doc.blocks[1];
  assert.equal(table.type, "itemsTable");
  if (table.type === "itemsTable") {
    assert.deepEqual(table.columns, ["name", "quantity", "unit", "unitPrice", "totalPrice"]);
  }
  const diff = diffTemplateFields(doc);
  assert.ok(diff.missing.includes("company.iban"));
  assert.equal(diff.missing.includes("offer.clientName"), false);
  assert.deepEqual(diff.extracted, [{ key: "site_code", label: "Kód stavby" }]);
});

test("html, a style string, an unknown type, a nested column and a foreign field are dropped", () => {
  const doc = normalizeOfferDocument(fixture.hostile);
  assert.ok(doc);
  assert.deepEqual(idsOf(doc.blocks), ["b1", "b2", "b3", "b4"]);
  const text = doc.blocks[0];
  assert.equal(text.type, "text");
  if (text.type === "text") {
    assert.equal(text.text, "Hello there");
    assert.equal(text.style, undefined);
  }
  const columns = doc.blocks[1];
  assert.equal(columns.type, "columns");
  if (columns.type === "columns") assert.equal(columns.columns.length, 2);
});

test("more than 80 blocks, or nothing left, is unusable", () => {
  const many = { blocks: Array.from({ length: 81 }, () => ({ type: "text", text: "x" })) };
  assert.equal(normalizeOfferDocument(many), null);
  assert.equal(normalizeOfferDocument({ blocks: [{ type: "mystery" }] }), null);
  assert.equal(normalizeOfferDocument({ blocks: [] }), null);
  assert.equal(normalizeOfferDocument({ layout: { headerStyle: "dark-band" } }), null);
});

test("an items table with no columns gets the default set", () => {
  const doc = normalizeOfferDocument({ blocks: [{ type: "itemsTable" }] });
  assert.ok(doc);
  const table = doc.blocks[0];
  assert.equal(table.type, "itemsTable");
  if (table.type === "itemsTable") {
    assert.deepEqual(table.columns, ["name", "quantity", "unit", "unitPrice", "totalPrice"]);
  }
});

test("custom-field values keep 24 strings and drop the rest", () => {
  const raw: Record<string, unknown> = {};
  for (let i = 0; i < 24; i++) raw[`k${i}`] = `v${i}`;
  raw.extra = "nope";
  raw.notString = 12;
  raw.Bad = "no";
  raw.long = "x".repeat(600);
  const values = normalizeCustomFieldValues(raw);
  assert.equal(Object.keys(values).length, 24);
  assert.equal(values.k0, "v0");
  assert.equal(values.k23, "v23");
  assert.equal("extra" in values, false);
  assert.equal("notString" in values, false);
  assert.equal("Bad" in values, false);
  const capped = normalizeCustomFieldValues({ note: "x".repeat(600) });
  assert.equal(capped.note.length, 500);
});
