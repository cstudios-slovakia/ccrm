import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTicketSlaDueDates,
  DEFAULT_TICKET_SETTINGS,
  DEFAULT_TICKET_STATUS_DEFS,
  evaluateTicketSla,
  formatDurationMinutes,
  getTicketStatusLabel,
  nextTicketNumber,
  normalizeTicketSettings,
  normalizeTicketStatuses,
  parseDurationColonInput,
  sanitizeColonTimeDraft,
} from "./tickets.ts";
import type { Ticket } from "../types/index.ts";

test("nextTicketNumber increments highest existing TCK-XXXX number", () => {
  assert.equal(nextTicketNumber([]), "TCK-0001");
  assert.equal(
    nextTicketNumber([
      { ticketNumber: "TCK-0020" } as Ticket,
      { ticketNumber: "TCK-0042" } as Ticket,
      { ticketNumber: "TCK-0005" } as Ticket,
    ]),
    "TCK-0043",
  );
});

test("normalizeTicketStatuses falls back to defaults and sorts by sortOrder", () => {
  assert.equal(normalizeTicketStatuses(null).length, DEFAULT_TICKET_STATUS_DEFS.length);
  const custom = normalizeTicketStatuses([
    { ...DEFAULT_TICKET_STATUS_DEFS[1], sortOrder: 10 },
    { ...DEFAULT_TICKET_STATUS_DEFS[0], sortOrder: 1 },
  ]);
  assert.equal(custom[0].id, "new");
  assert.equal(custom[1].id, "open");
});

test("normalizeTicketSettings merges partial config with defaults", () => {
  const merged = normalizeTicketSettings({ imapEnabled: true, imapHost: "imap.test.sk" });
  assert.equal(merged.imapEnabled, true);
  assert.equal(merged.imapHost, "imap.test.sk");
  assert.equal(merged.slaTargets.critical.firstResponseMins, 30);
});

test("getTicketStatusLabel resolves localized status labels", () => {
  const def = DEFAULT_TICKET_STATUS_DEFS.find((s) => s.id === "open");
  assert.ok(def);
  assert.equal(getTicketStatusLabel(def, "en"), "In Progress");
  assert.equal(getTicketStatusLabel(def, "sk"), "V riešení");
  assert.equal(getTicketStatusLabel(def, "hu"), "Folyamatban");
});

test("evaluateTicketSla handles terminal, paused, ok, warning, and breached states", () => {
  const now = Date.now();
  const fmt = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

  const baseTicket: Ticket = {
    id: "tck-1",
    ticketNumber: "TCK-0001",
    subject: "Test ticket",
    description: "Desc",
    status: "open",
    priority: "high",
    type: "bug",
    channel: "portal",
    createdAt: fmt(now - 60 * 60_000),
    slaResolutionDueAt: fmt(now + 120 * 60_000),
  };

  const okEval = evaluateTicketSla(baseTicket, DEFAULT_TICKET_STATUS_DEFS);
  assert.equal(okEval.status, "ok");

  const warnEval = evaluateTicketSla(
    { ...baseTicket, slaResolutionDueAt: fmt(now + 20 * 60_000) },
    DEFAULT_TICKET_STATUS_DEFS,
  );
  assert.equal(warnEval.status, "warning");

  const breachedEval = evaluateTicketSla(
    { ...baseTicket, slaResolutionDueAt: fmt(now - 30 * 60_000) },
    DEFAULT_TICKET_STATUS_DEFS,
  );
  assert.equal(breachedEval.status, "breached");

  const pausedEval = evaluateTicketSla(
    { ...baseTicket, status: "waiting" },
    DEFAULT_TICKET_STATUS_DEFS,
  );
  assert.equal(pausedEval.status, "paused");

  const metEval = evaluateTicketSla(
    { ...baseTicket, status: "resolved" },
    DEFAULT_TICKET_STATUS_DEFS,
  );
  assert.equal(metEval.status, "met");
});

test("computeTicketSlaDueDates returns future due timestamps", () => {
  const due = computeTicketSlaDueDates("critical", DEFAULT_TICKET_SETTINGS);
  assert.ok(due.firstResponseDueAt.length === 19);
  assert.ok(due.resolutionDueAt.length === 19);
});

test("formatDurationMinutes and parseDurationColonInput use H:MM colon format", () => {
  assert.equal(formatDurationMinutes(0), "0:00");
  assert.equal(formatDurationMinutes(30), "0:30");
  assert.equal(formatDurationMinutes(90), "1:30");
  assert.equal(formatDurationMinutes(125), "2:05");
  assert.equal(parseDurationColonInput("1:30"), 90);
  assert.equal(parseDurationColonInput("0:45"), 45);
  assert.equal(parseDurationColonInput(":15"), 15);
  assert.equal(parseDurationColonInput("2:"), 120);
  assert.equal(sanitizeColonTimeDraft(""), ":");
  assert.equal(sanitizeColonTimeDraft("1:30"), "1:30");
});


