import assert from "node:assert/strict";
import test from "node:test";
import { applyClientProfile, clientProfileGroups, contactDetailsFor, isLinkedById, profileRoleFor, resolveLinkedClient, type LeadLike } from "./leadClient.ts";
import { isClientRecord } from "./clientRecord.ts";

const client = (id: string, name: string, extra: Partial<LeadLike> = {}): LeadLike => ({ id, name, ...extra });

test("a lead resolves to the client it is linked to by id, even under another name", () => {
  const c = client("client-1", "Novák s.r.o.");
  const lead = { id: "lead-1", name: "Peter N.", clientId: "client-1" };
  assert.equal(resolveLinkedClient(lead, [c, lead]), c);
  assert.equal(isLinkedById(lead, [c, lead]), true);
});

test("the id link beats a same-name client that is a different person", () => {
  const other = client("client-2", "Peter Novák");
  const mine = client("client-1", "Peter Novák");
  const lead = { id: "lead-1", name: "Peter Novák", clientId: "client-1" };
  assert.equal(resolveLinkedClient(lead, [other, mine, lead]), mine);
});

test("without a clientId the name match is still the fallback", () => {
  const c = client("client-1", "  Peter Novák ");
  const lead = { id: "lead-1", name: "peter novák" };
  assert.equal(resolveLinkedClient(lead, [c, lead]), c);
  assert.equal(isLinkedById(lead, [c, lead]), false);
});

test("a clientId pointing at a deleted row falls back to the name match", () => {
  const c = client("client-9", "Peter Novák");
  const lead = { id: "lead-1", name: "Peter Novák", clientId: "client-gone" };
  assert.equal(resolveLinkedClient(lead, [c, lead]), c);
  assert.equal(isLinkedById(lead, [c, lead]), false);
});

test("a lead with no client and no client of that name resolves to null", () => {
  const lead = { id: "lead-1", name: "Peter Novák" };
  assert.equal(resolveLinkedClient(lead, [lead, { id: "lead-2", name: "Peter Novák" }]), null);
  assert.equal(resolveLinkedClient({ id: "lead-3", name: "  " }, [lead]), null);
});

test("a same-name lead with a positive adjustment counts as the client", () => {
  const won = { id: "lead-2", name: "Peter Novák", adjustment: 100 };
  const lead = { id: "lead-1", name: "Peter Novák" };
  assert.equal(resolveLinkedClient(lead, [lead, won]), won);
});

test("a lead linked by id never borrows contact details from a same-name sibling", () => {
  const c = client("client-1", "Peter Novák", { email: "right@example.com" });
  const sibling = { id: "lead-2", name: "Peter Novák", email: "wrong@example.com", phone: "+421 900 000 000" };
  const lead = { id: "lead-1", name: "Peter Novák", clientId: "client-1" };
  const all = [c, sibling, lead];
  assert.deepEqual(contactDetailsFor(lead, all, c), { phone: "", email: "right@example.com", contactPerson: "" });
});

test("the lead's own contact details win over the client's", () => {
  const c = client("client-1", "Novák", { email: "office@example.com", contactPerson: "Office" });
  const lead = { id: "lead-1", name: "Novák", clientId: "client-1", email: "peter@example.com", contactPerson: "Peter" };
  assert.deepEqual(contactDetailsFor(lead, [c, lead], c), {
    phone: "",
    email: "peter@example.com",
    contactPerson: "Peter",
  });
});

test("an unlinked lead keeps borrowing from same-name siblings", () => {
  const c = client("client-1", "Peter Novák");
  const sibling = { id: "lead-2", name: "Peter Novák", phone: "+421 900 111 222" };
  const lead = { id: "lead-1", name: "Peter Novák" };
  assert.equal(contactDetailsFor(lead, [c, sibling, lead], c).phone, "+421 900 111 222");
});

const profile = { name: "Novák", phone: "+421 111", email: "new@example.com", contactPerson: "Jana", city: "Nitra" };

test("a profile save reaches the client row and unlinked same-name leads", () => {
  const c = client("client-1", "Novák");
  const sib = { id: "lead-1", name: "novák ", phone: "old" };
  const out = applyClientProfile([c, sib], "Novák", profile);
  assert.equal(out[0].phone, "+421 111");
  assert.equal(out[1].phone, "+421 111");
  assert.equal(out[1].city, "Nitra");
});

test("a profile save leaves a same-name lead linked to a different client alone", () => {
  const mine = client("client-1", "Novák");
  const elsewhere = client("client-3", "Kováč");
  const lead = { id: "lead-2", name: "Novák", clientId: "client-3", phone: "+421 999" };
  const out = applyClientProfile([mine, elsewhere, lead], "Novák", profile);
  assert.equal(out[2], lead);
  assert.equal(out[1], elsewhere);
  assert.equal(out[0].phone, "+421 111");
});

test("a lead linked by id keeps its own contact details and name", () => {
  const c = client("client-1", "Novák");
  const lead = { id: "lead-1", name: "Peter N.", clientId: "client-1", phone: "+421 222", email: "peter@example.com" };
  const out = applyClientProfile([c, lead], "Novák", profile);
  assert.equal(out[1].phone, "+421 222");
  assert.equal(out[1].email, "peter@example.com");
  assert.equal(out[1].name, "Peter N.");
  assert.equal((out[1] as typeof profile & LeadLike).city, "Nitra");
});

test("renaming the client renames a linked lead that carried the client's name", () => {
  const c = client("client-1", "Novák");
  const lead = { id: "lead-1", name: "Novák", clientId: "client-1" };
  const out = applyClientProfile([c, lead], "Novák", { ...profile, name: "Novák s.r.o." });
  assert.equal(out[0].name, "Novák s.r.o.");
  assert.equal(out[1].name, "Novák s.r.o.");
});

test("a lead with a dangling clientId and the same name still receives the profile", () => {
  const c = client("client-1", "Novák");
  const lead = { id: "lead-1", name: "Novák", clientId: "client-gone", phone: "old" };
  assert.equal(applyClientProfile([c, lead], "Novák", profile)[1].phone, "+421 111");
});

test("an adjustment-only client counts as the client row", () => {
  const won = { id: "lead-1", name: "Novák", adjustment: 100, phone: "old" };
  assert.equal(profileRoleFor(won, [won], "Novák"), "client");
  assert.equal(applyClientProfile([won], "Novák", profile)[0].phone, "+421 111");
});

// --- The client value adjustment lives on the client row only (S5-2) ---------

test("a profile save never copies the adjustment onto a lead linked by id", () => {
  const c = client("client-1", "Novák s.r.o.");
  const lead = { id: "lead-1", name: "Kuchyňa Novák", clientId: "client-1" };
  const out = applyClientProfile([c, lead], "Novák s.r.o.", { name: "Novák s.r.o.", adjustment: 5000 });
  assert.equal(out[0].adjustment, 5000);
  assert.equal(out[1].adjustment, undefined);
  // The linked lead does not turn into a client of its own.
  assert.deepEqual(out.map(isClientRecord), [true, false]);
});

test("a same-name sibling does not get the adjustment when the profile has a client row", () => {
  const c = client("client-1", "Novák");
  const sib = { id: "lead-1", name: "Novák", city: "Old" };
  const out = applyClientProfile([c, sib], "Novák", { name: "Novák", adjustment: 300, city: "Nitra" } as LeadLike & { name: string; city: string });
  assert.equal(out[0].adjustment, 300);
  assert.equal(out[1].adjustment, undefined);
  assert.equal((out[1] as LeadLike & { city?: string }).city, "Nitra");
});

test("a copy an earlier save left on a linked lead is reset, other values are left alone", () => {
  const c = client("client-1", "Novák s.r.o.", { adjustment: 5000 });
  const copied = { id: "lead-1", name: "Kuchyňa Novák", clientId: "client-1", adjustment: 5000 };
  const own = { id: "lead-2", name: "Dvere Novák", clientId: "client-1", adjustment: -40 };
  const out = applyClientProfile([c, copied, own], "Novák s.r.o.", { name: "Novák s.r.o.", adjustment: 3000 });
  assert.equal(out[0].adjustment, 3000);
  assert.equal(out[1].adjustment, 0);
  assert.equal(out[2].adjustment, -40);
  // Idempotent: a second save changes nothing more.
  const again = applyClientProfile(out, "Novák s.r.o.", { name: "Novák s.r.o.", adjustment: 3000 });
  assert.deepEqual(again.map((l) => l.adjustment), [3000, 0, -40]);
});

test("a profile save without an adjustment leaves every adjustment as it is", () => {
  const c = client("client-1", "Novák", { adjustment: 100 });
  const lead = { id: "lead-1", name: "Peter N.", clientId: "client-1", adjustment: 100 };
  const out = applyClientProfile([c, lead], "Novák", profile);
  assert.equal(out[0].adjustment, 100);
  assert.equal(out[1].adjustment, 100);
});

test("a profile with no client row still stores the adjustment on its same-name leads", () => {
  const a = { id: "lead-1", name: "Novák" };
  const out = applyClientProfile([a], "Novák", { name: "Novák", adjustment: 250 });
  assert.equal(out[0].adjustment, 250);
});

// --- Clients-page grouping follows the stored link (S5-1) --------------------

const keyOf = (all: LeadLike[], id: string) => {
  const lead = all.find((l) => l.id === id)!;
  return clientProfileGroups(all).get(lead)!;
};

test("a lead linked by id under another name joins its client's profile", () => {
  const c = client("client-1", "Novák s.r.o.");
  const lead = { id: "lead-1", name: "Kuchyňa Novák", clientId: "client-1" };
  const all = [lead, c];
  assert.equal(keyOf(all, "lead-1").key, keyOf(all, "client-1").key);
  assert.equal(keyOf(all, "lead-1").anchorId, "client-1");
});

test("renaming a linked lead does not move it to another client", () => {
  const c = client("client-1", "Novák s.r.o.");
  const other = client("client-2", "Kováč");
  const renamed = { id: "lead-1", name: "Kováč", clientId: "client-1" };
  const all = [c, other, renamed];
  assert.equal(keyOf(all, "lead-1").key, keyOf(all, "client-1").key);
  assert.notEqual(keyOf(all, "lead-1").key, keyOf(all, "client-2").key);
});

test("a same-name lead linked to another client does not count in this profile", () => {
  const mine = client("client-1", "Novák");
  const elsewhere = client("client-3", "Kováč");
  const lead = { id: "lead-2", name: "Novák", clientId: "client-3" };
  const all = [mine, elsewhere, lead];
  assert.equal(keyOf(all, "lead-2").key, keyOf(all, "client-3").key);
  assert.notEqual(keyOf(all, "lead-2").key, keyOf(all, "client-1").key);
});

test("unlinked leads still group by name, with or without a client record", () => {
  const c = client("client-1", "Novák");
  const sib = { id: "lead-1", name: " novák " };
  const loner = { id: "lead-2", name: "Peter" };
  const loner2 = { id: "lead-3", name: "peter" };
  const all = [sib, c, loner, loner2];
  assert.equal(keyOf(all, "lead-1").key, keyOf(all, "client-1").key);
  assert.equal(keyOf(all, "lead-2").key, keyOf(all, "lead-3").key);
  assert.equal(keyOf(all, "lead-2").anchorId, undefined);
});

test("same-name client records still share one profile, and so do leads linked to either", () => {
  const a = client("client-1", "Novák");
  const b = client("client-2", "Novák");
  const toB = { id: "lead-1", name: "Peter", clientId: "client-2" };
  const all = [a, b, toB];
  const k = keyOf(all, "client-1").key;
  assert.equal(keyOf(all, "client-2").key, k);
  assert.equal(keyOf(all, "lead-1").key, k);
});

test("a dangling clientId falls back to the name, as resolveLinkedClient does", () => {
  const c = client("client-1", "Novák");
  const lead = { id: "lead-1", name: "Novák", clientId: "client-gone" };
  const all = [c, lead];
  assert.equal(keyOf(all, "lead-1").key, keyOf(all, "client-1").key);
});
