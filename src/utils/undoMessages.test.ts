import assert from "node:assert/strict";
import test from "node:test";
import { bulkMessage, holdHint, singleMessage, trimTitle, undoLabel } from "./undoMessages.ts";

test("single messages name the entity and quote its title in each language", () => {
  assert.equal(singleMessage("sk", "task", "delete", "Kalkulácia"), "Úloha „Kalkulácia“ bola zmazaná");
  assert.equal(singleMessage("hu", "task", "delete", "Kalkuláció"), "A „Kalkuláció” feladat törölve");
  assert.equal(singleMessage("en", "task", "delete", "Calculation"), 'Task "Calculation" deleted');
});

test("gender agreement in Slovak", () => {
  assert.equal(singleMessage("sk", "project", "archive", "X"), "Projekt „X“ bol archivovaný");
  assert.equal(singleMessage("sk", "meeting", "delete", "X"), "Stretnutie „X“ bolo zmazané");
});

test("archive wording", () => {
  assert.equal(singleMessage("en", "lead", "archive", "Acme"), 'Lead "Acme" archived');
  assert.equal(singleMessage("hu", "lead", "archive", "Acme"), "A „Acme” lead archiválva");
});

test("a missing title still produces a sentence", () => {
  assert.equal(singleMessage("en", "task", "delete", ""), "Task deleted");
  assert.equal(singleMessage("sk", "task", "delete", null), "Úloha bola zmazaná");
});

test("bulk plurals in Slovak", () => {
  assert.equal(bulkMessage("sk", "task", "delete", 1), "1 úloha bola zmazaná");
  assert.equal(bulkMessage("sk", "task", "delete", 3), "3 úlohy zmazané");
  assert.equal(bulkMessage("sk", "task", "delete", 5), "5 úloh zmazaných");
  assert.equal(bulkMessage("sk", "client", "archive", 2), "2 klienti archivovaní");
});

test("bulk wording in Hungarian and English", () => {
  assert.equal(bulkMessage("hu", "task", "delete", 3), "3 feladat törölve");
  assert.equal(bulkMessage("en", "task", "delete", 3), "3 tasks deleted");
  assert.equal(bulkMessage("en", "task", "delete", 1), "1 task deleted");
});

test("titles are trimmed to about 40 characters", () => {
  const long = "a".repeat(80);
  const out = trimTitle(long);
  assert.equal(out.length, 40);
  assert.ok(out.endsWith("…"));
  assert.equal(trimTitle("  short   name "), "short name");
});

test("labels and hints", () => {
  assert.equal(undoLabel("sk"), "Krok späť");
  assert.equal(undoLabel("hu"), "Visszavonás");
  assert.equal(undoLabel("en"), "Undo");
  assert.equal(holdHint("sk", "delete"), "Podržte pre zmazanie");
  assert.equal(holdHint("hu", "archive"), "Tartsa lenyomva az archiváláshoz");
  assert.equal(holdHint("en", "archive"), "Hold to archive");
});
