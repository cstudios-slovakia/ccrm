import assert from "node:assert/strict";
import test from "node:test";
import { leadClientLabels } from "./leadClientLabel.ts";
import { resolveLinkedClient, type LeadLike } from "./leadClient.ts";

const client = (id: string, name: string): LeadLike => ({ id, name });

test("a lead named like its only client gets no label", () => {
  const all = [client("client-1", "Novák s.r.o."), { id: "lead-1", name: "Novák s.r.o.", clientId: "client-1" }];
  assert.equal(leadClientLabels(all).size, 0);
});

test("a lead filed under a person shows the client company it is linked to", () => {
  const all = [client("client-1", "Novák s.r.o."), { id: "lead-1", name: "Ján Novák", clientId: "client-1" }];
  assert.equal(leadClientLabels(all).get("lead-1"), "Novák s.r.o.");
});

test("same-name leads of different clients are all labelled, even the one named like its client", () => {
  const all = [
    client("client-1", "Ján Novák"),
    client("client-2", "Stavby Plus s.r.o."),
    { id: "lead-1", name: "Ján Novák", clientId: "client-1" },
    { id: "lead-2", name: "ján novák ", clientId: "client-2" },
  ];
  const labels = leadClientLabels(all);
  assert.equal(labels.get("lead-1"), "Ján Novák");
  assert.equal(labels.get("lead-2"), "Stavby Plus s.r.o.");
});

test("same-name leads of the same client stay unlabelled", () => {
  const all = [
    client("client-1", "Ján Novák"),
    { id: "lead-1", name: "Ján Novák", clientId: "client-1" },
    { id: "lead-2", name: "Ján Novák" },
  ];
  assert.equal(leadClientLabels(all).size, 0);
});

test("leads without a client and client records get no label", () => {
  const all = [client("client-1", "Novák s.r.o."), { id: "lead-1", name: "Peter Malý" }];
  assert.equal(leadClientLabels(all).size, 0);
});

test("a link to a deleted client falls back to the same-name client, like resolveLinkedClient", () => {
  const all = [client("client-1", "Ján Novák"), { id: "lead-1", name: "Ján Novák", clientId: "client-gone" }];
  assert.equal(resolveLinkedClient(all[1], all)?.id, "client-1");
  assert.equal(leadClientLabels(all).size, 0);
});
