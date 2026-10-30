import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskUpdateText, newRequestId } from "./taskUpdateMessage.ts";

test("newRequestId returns unique strings", () => {
  const id1 = newRequestId();
  const id2 = newRequestId();
  assert.notEqual(id1, id2);
  assert.ok(id1.length > 5);
});

test("buildTaskUpdateText single item formatting in English", () => {
  const text = buildTaskUpdateText({
    language: "en",
    senderName: "Peter",
    items: [
      {
        title: "Send offer *PDF*",
        notes: "Offer was sent via email.",
        attachmentNumbers: [1],
      },
    ],
    attachmentCount: 1,
  });

  assert.ok(text.includes("✅ *Task done*"));
  assert.ok(text.includes('"Send offer PDF" was marked as done by Peter.'));
  assert.ok(text.includes("> Notes: Offer was sent via email. (📎 1)"));
  assert.ok(text.includes("📎 1 attachment below"));
  assert.ok(text.includes("_Automatic update · CCRM_"));
});

test("buildTaskUpdateText batch items formatting in Slovak", () => {
  const text = buildTaskUpdateText({
    language: "sk",
    senderName: "Peter",
    items: [
      { title: "Kúpiť materiál", notes: null },
      { title: "Dokončiť faktúru", notes: "Čaká sa na schválenie." },
    ],
    attachmentCount: 0,
  });

  assert.ok(text.includes("✅ *Hotové úlohy: 2*"));
  assert.ok(text.includes("Tieto úlohy sú hotové · Peter:"));
  assert.ok(text.includes("• *Kúpiť materiál*"));
  assert.ok(text.includes("• *Dokončiť faktúru*"));
  assert.ok(text.includes("> Poznámka: Čaká sa na schválenie."));
  assert.ok(text.includes("_Automatická aktualizácia · CCRM_"));
});

test("buildTaskUpdateText in Hungarian", () => {
  const text = buildTaskUpdateText({
    language: "hu",
    senderName: "István",
    items: [
      { title: "Ajánlat küldése" },
    ],
  });

  assert.ok(text.includes("✅ *Feladat kész*"));
  assert.ok(text.includes("„Ajánlat küldése” feladat kész · István"));
  assert.ok(text.includes("_Automatikus frissítés · CCRM_"));
});
