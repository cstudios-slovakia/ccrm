import assert from "node:assert/strict";
import test from "node:test";
import { parseWhatsAppRoute, whatsAppRouteTarget } from "../lib/chatRoute.ts";

test("parseWhatsAppRoute parses open routes with phone and CRM entity", () => {
  const withLead = parseWhatsAppRoute(
    "whatsapp/open",
    new URLSearchParams("phone=421900123456&lead=lead-abc"),
  );
  assert.deepEqual(withLead, {
    view: "open",
    phone: "421900123456",
    leadId: "lead-abc",
    projectId: null,
  });

  const withProject = parseWhatsAppRoute(
    "whatsapp/open",
    new URLSearchParams("phone=421900123456&project=proj-xyz"),
  );
  assert.deepEqual(withProject, {
    view: "open",
    phone: "421900123456",
    leadId: null,
    projectId: "proj-xyz",
  });
});

test("parseWhatsAppRoute falls back to home when phone is malformed or missing", () => {
  const noPhone = parseWhatsAppRoute("whatsapp/open", new URLSearchParams(""));
  assert.equal(noPhone.view, "chats");

  const invalidPhone = parseWhatsAppRoute("whatsapp/open", new URLSearchParams("phone=abc"));
  assert.equal(invalidPhone.view, "chats");
});

test("whatsAppRouteTarget generates correct open route queries", () => {
  const targetLead = whatsAppRouteTarget({
    view: "open",
    phone: "421900123456",
    leadId: "lead-abc",
    projectId: null,
  });
  assert.equal(targetLead.route, "whatsapp/open");
  assert.equal(targetLead.query, "phone=421900123456&lead=lead-abc");

  const targetProject = whatsAppRouteTarget({
    view: "open",
    phone: "421900123456",
    leadId: null,
    projectId: "proj-xyz",
  });
  assert.equal(targetProject.route, "whatsapp/open");
  assert.equal(targetProject.query, "phone=421900123456&project=proj-xyz");
});
