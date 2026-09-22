import assert from "node:assert/strict";
import test from "node:test";
import { isSystemMailConfigured, taskReminderSendAt, withTaskReminder } from "./taskReminders.ts";

const stamp = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : null;

// Same cases as the PHP side (api/task_reminders.php) — the drawer promises
// the time the server will actually send at.
test("taskReminderSendAt: matches the server schedule", () => {
  const cases: [string, string | undefined, "morning" | "1h" | "1d", string][] = [
    ["2026-09-22", "14:00", "morning", "2026-09-22 08:00"],
    ["2026-09-22", "14:00", "1h", "2026-09-22 13:00"],
    ["2026-09-22", "14:00", "1d", "2026-09-21 14:00"],
    ["2026-09-22", undefined, "1h", "2026-09-22 08:00"],
    ["2026-09-22", undefined, "1d", "2026-09-21 08:00"],
    ["2026-09-22", "07:30", "morning", "2026-09-22 06:30"],
    ["2026-09-22", "", "morning", "2026-09-22 08:00"],
    ["2026-10-01", "00:30", "1d", "2026-09-30 00:30"],
  ];
  for (const [deadline, deadlineTime, when, expected] of cases) {
    assert.equal(stamp(taskReminderSendAt({ deadline, deadlineTime }, when)), expected, `${deadline} ${deadlineTime} ${when}`);
  }
});

test("taskReminderSendAt: no date, no reminder", () => {
  assert.equal(taskReminderSendAt({ deadline: "" }, "morning"), null);
});

test("withTaskReminder: sets and clears one user's choice, leaves others alone", () => {
  const both = withTaskReminder({ Jana: "1d" }, "Peter", "1h");
  assert.deepEqual(both, { Jana: "1d", Peter: "1h" });
  assert.deepEqual(withTaskReminder(both, "Peter", null), { Jana: "1d" });
  assert.equal(withTaskReminder({ Peter: "1h" }, "Peter", null), undefined);
});

// Mirrors ccrm_system_mail_configured(): without a mail server the server skips
// every reminder, so the drawer must not promise one.
test("isSystemMailConfigured: needs a host and port, or an Exchange mailbox", () => {
  assert.equal(isSystemMailConfigured(null), false);
  assert.equal(isSystemMailConfigured({ emailProvider: "smtp", smtpHost: "", smtpPort: "465" }), false);
  assert.equal(isSystemMailConfigured({ emailProvider: "smtp", smtpHost: "smtp.example.com", smtpPort: "465" }), true);
  assert.equal(isSystemMailConfigured({ emailProvider: "exchange", exchMailbox: "a@b.sk", exchPassword: "" }), false);
  assert.equal(isSystemMailConfigured({ emailProvider: "exchange", exchMailbox: "a@b.sk", exchPassword: "********" }), true);
});
