import assert from "node:assert/strict";
import test from "node:test";
import { dayLabel, withDaySeparators } from "./messageDays.ts";

const labels = { today: "Today", yesterday: "Yesterday" };
// Local-time dates, so the test does not depend on the machine's time zone.
const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).toISOString();
const now = new Date(2026, 9, 29, 15);

test("today and yesterday are named, older days are dated", () => {
  assert.equal(dayLabel(at(2026, 10, 29, 0), labels, "en", now), "Today");
  assert.equal(dayLabel(at(2026, 10, 28, 23), labels, "en", now), "Yesterday");
  assert.match(dayLabel(at(2026, 10, 20), labels, "en", now), /Tuesday.*20.*October|October.*20/);
});

test("a separator comes before the first message of each day, not between messages of one day", () => {
  const msgs = [
    { id: "a", sent_at: at(2026, 10, 27, 9) },
    { id: "b", sent_at: at(2026, 10, 27, 18) },
    { id: "c", sent_at: at(2026, 10, 28, 8) },
    { id: "d", sent_at: at(2026, 10, 29, 8) },
  ];
  const items = withDaySeparators(msgs, labels, "en", now);
  assert.deepEqual(
    items.map((i) => (i.kind === "day" ? `day:${i.label.startsWith("Tue") ? "tuesday" : i.label}` : i.key)),
    ["day:tuesday", "a", "b", "day:Yesterday", "c", "day:Today", "d"],
  );
});

test("keys are unique, so a virtualised list can key on them", () => {
  const msgs = [
    { id: "a", sent_at: at(2026, 10, 1) },
    { id: "b", sent_at: at(2026, 10, 2) },
  ];
  const keys = withDaySeparators(msgs, labels, "en", now).map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("a message with an unreadable timestamp is kept and gets no separator", () => {
  const items = withDaySeparators([{ id: "x", sent_at: "not a date" }], labels, "en", now);
  assert.deepEqual(items.map((i) => i.kind), ["message"]);
});

test("an empty timeline has no separators", () => {
  assert.deepEqual(withDaySeparators([], labels), []);
});
