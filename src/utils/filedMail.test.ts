import assert from "node:assert/strict";
import test from "node:test";
import { fetchFiledMail, isOwnMailbox, shouldReadStoredBody } from "./filedMail.ts";

test("an entry is the viewer's own when its owner is their login, ignoring case and spaces", () => {
  assert.equal(isOwnMailbox({ mailOwner: "Peter@Villatesta.sk" }, " peter@villatesta.sk "), true);
  assert.equal(isOwnMailbox({ mailOwner: "other@villatesta.sk" }, "peter@villatesta.sk"), false);
});

test("a company mailbox entry (no owner) is never the viewer's own", () => {
  assert.equal(isOwnMailbox({ mailOwner: null }, "peter@villatesta.sk"), false);
  assert.equal(isOwnMailbox({}, "peter@villatesta.sk"), false);
  assert.equal(isOwnMailbox({ mailOwner: "a@b.sk" }, undefined), false);
});

test("a stored body is read from the store unless the mail is in the viewer's own mailbox", () => {
  assert.equal(shouldReadStoredBody({ hasStoredBody: true, mailOwner: null }, "peter@villatesta.sk"), true);
  assert.equal(shouldReadStoredBody({ hasStoredBody: true, mailOwner: "colleague@villatesta.sk" }, "peter@villatesta.sk"), true);
  assert.equal(shouldReadStoredBody({ hasStoredBody: true, mailOwner: "peter@villatesta.sk" }, "peter@villatesta.sk"), false);
});

test("an entry without a stored body keeps reading live, as every entry did before mailboxes were recorded", () => {
  assert.equal(shouldReadStoredBody({}, "peter@villatesta.sk"), false);
  assert.equal(shouldReadStoredBody({ hasStoredBody: false, mailOwner: null }, "peter@villatesta.sk"), false);
});

const withFetch = async (response: { ok: boolean; status: number; body: unknown }, run: () => Promise<void>) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: response.ok, status: response.status, json: async () => response.body })) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
};

test("the stored body is read as text with its attachment names", async () => {
  await withFetch(
    { ok: true, status: 200, body: { success: true, email: { text: "Dobrý deň", attachments: [{ name: "ponuka.pdf", size: 2048 }, { size: 1 }], mail_account: "Info" } } },
    async () => {
      assert.deepEqual(await fetchFiledMail("email-inbox-abc-1"), {
        text: "Dobrý deň",
        attachments: [{ name: "ponuka.pdf", size: 2048 }],
        mailAccount: "Info",
      });
    },
  );
});

test("a refusal comes back as an error with the server's reason", async () => {
  await withFetch({ ok: false, status: 403, body: { success: false, error: "No access to e-mail." } }, async () => {
    await assert.rejects(() => fetchFiledMail("x"), /No access to e-mail/);
  });
  await withFetch({ ok: false, status: 404, body: null }, async () => {
    await assert.rejects(() => fetchFiledMail("x"), /HTTP 404/);
  });
});
