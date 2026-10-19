import assert from "node:assert/strict";
import test from "node:test";
import { applyClientProfile, contactDetailsFor, isLinkedById, profileRoleFor, resolveLinkedClient, type LeadLike } from "./leadClient.ts";

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
