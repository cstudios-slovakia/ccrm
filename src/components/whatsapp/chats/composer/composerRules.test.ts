import assert from "node:assert/strict";
import test from "node:test";
import { composerMessages } from "./composerI18n.ts";

test("composerMessages returns localized strings for en, sk, hu", () => {
  const en = composerMessages("en");
  const sk = composerMessages("sk");
  const hu = composerMessages("hu");

  assert.equal(en.send, "Send");
  assert.equal(sk.send, "Odoslať");
  assert.equal(hu.send, "Küldés");

  assert.equal(en.placeholder, "Type a message…");
  assert.equal(sk.placeholder, "Napíšte správu…");
  assert.equal(hu.placeholder, "Írjon üzenetet…");

  assert.equal(en.fileTooLarge("32 MB"), "File exceeds the maximum limit of 32 MB.");
  assert.equal(sk.fileTooLarge("32 MB"), "Súbor presahuje maximálnu povolenú veľkosť 32 MB.");
  assert.equal(hu.fileTooLarge("32 MB"), "A fájl meghaladja a maximális méretet (32 MB).");
});

test("composerMessages en, sk, hu dictionaries have identical keys", () => {
  const en = composerMessages("en");
  const sk = composerMessages("sk");
  const hu = composerMessages("hu");

  const enKeys = Object.keys(en).sort();
  const skKeys = Object.keys(sk).sort();
  const huKeys = Object.keys(hu).sort();

  assert.deepEqual(skKeys, enKeys, "Slovak dictionary has different keys from English");
  assert.deepEqual(huKeys, enKeys, "Hungarian dictionary has different keys from English");

  const enCatKeys = Object.keys(en.categories).sort();
  const skCatKeys = Object.keys(sk.categories).sort();
  const huCatKeys = Object.keys(hu.categories).sort();

  assert.deepEqual(skCatKeys, enCatKeys);
  assert.deepEqual(huCatKeys, enCatKeys);
});
