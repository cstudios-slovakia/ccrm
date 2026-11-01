import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getNextOccurrence,
  applyWeekendRule,
  getStartDate,
  getNextAfterCompletion,
  shiftCursorOnResume,
  describeRecurrence,
  getNextDueDates,
} from './recurringTasks.ts';
import type { TaskRecurrence } from '../types/index.ts';

describe('Recurring Tasks: Pure TS Engine against shared fixture', () => {
  const fixturePath = path.resolve(process.cwd(), 'scripts/fixtures/recurring-tasks-cases.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  describe('Schedule Cases from worked-examples table', () => {
    for (const testCase of fixture.scheduleCases) {
      it(testCase.name, () => {
        const rec: TaskRecurrence = testCase.recurrence;

        if (testCase.expect) {
          const scheduledDate = getNextOccurrence(rec, testCase.cursor);
          assert.strictEqual(scheduledDate, testCase.expect.scheduledDate, `scheduledDate mismatch in ${testCase.name}`);

          const deadline = applyWeekendRule(scheduledDate!, rec.weekendRule, rec.frequency);
          assert.strictEqual(deadline, testCase.expect.deadline, `deadline mismatch in ${testCase.name}`);

          const startDate = getStartDate(deadline, rec.leadDays);
          assert.strictEqual(startDate, testCase.expect.startDate, `startDate mismatch in ${testCase.name}`);
        } else if (testCase.sequence) {
          for (let i = 0; i < testCase.sequence.length; i++) {
            const step = testCase.sequence[i];
            const scheduledDate = getNextOccurrence(rec, step.cursor);
            assert.strictEqual(scheduledDate, step.scheduledDate, `step ${i} mismatch in ${testCase.name}`);
          }
        }
      });
    }
  });

  describe('Pause / Resume Cases', () => {
    for (const testCase of fixture.pauseResumeCases) {
      it(testCase.name, () => {
        const rec: TaskRecurrence = testCase.recurrence;
        const newCursor = shiftCursorOnResume(rec, testCase.resumeDate);
        const nextDue = getNextOccurrence(rec, newCursor);
        assert.strictEqual(nextDue, testCase.expectNextDue);
      });
    }
  });

  describe('After Completion Cases', () => {
    for (const testCase of fixture.afterCompletionCases) {
      it(testCase.name, () => {
        const result = getNextAfterCompletion(
          testCase.frequency,
          testCase.interval,
          testCase.completedDate,
          testCase.weekendRule,
          testCase.leadDays
        );
        assert.ok(result !== null);
        assert.strictEqual(result.deadline, testCase.expectDeadline);
        assert.strictEqual(result.startDate, testCase.expectStartDate);
      });
    }
  });

  describe('Additional edge cases & preview generation', () => {
    it('generates next 5 due dates preview', () => {
      const rec: TaskRecurrence = {
        mode: 'schedule',
        frequency: 'monthly',
        interval: 1,
        config: { monthlyType: 'day_of_month', dayOfMonth: 15 },
        weekendRule: 'after',
        leadDays: 3,
        startsOn: '2026-11-01',
      };

      const dates = getNextDueDates(rec, 5);
      assert.strictEqual(dates.length, 5);
      assert.strictEqual(dates[0].scheduledDate, '2026-11-15'); // Sun
      assert.strictEqual(dates[0].deadline, '2026-11-16'); // Mon
      assert.strictEqual(dates[0].startDate, '2026-11-13'); // Mon - 3 days

      assert.strictEqual(dates[1].scheduledDate, '2026-12-15');
      assert.strictEqual(dates[1].deadline, '2026-12-15');
    });

    it('formats describeRecurrence in en, sk, hu', () => {
      const rec: TaskRecurrence = {
        mode: 'schedule',
        frequency: 'monthly',
        interval: 2,
        config: { monthlyType: 'day_of_month', dayOfMonth: 15 },
        weekendRule: 'after',
        leadDays: 3,
        startsOn: '2026-11-01',
      };

      const en = describeRecurrence(rec, 'en');
      assert.ok(en.includes('Every 2 months on the 15th'));
      assert.ok(en.includes('weekends → Monday'));
      assert.ok(en.includes('shows 3 days before'));

      const sk = describeRecurrence(rec, 'sk');
      assert.ok(sk.includes('Každé 2 mesiace 15. dňa'));
      assert.ok(sk.includes('víkend → pondelok'));

      const hu = describeRecurrence(rec, 'hu');
      assert.ok(hu.includes('Minden 2. hónap 15. napján'));
      assert.ok(hu.includes('hétvége → hétfő'));
    });

    it('formats after completion describeRecurrence', () => {
      const rec: TaskRecurrence = {
        mode: 'after_completion',
        frequency: 'monthly',
        interval: 3,
        weekendRule: 'keep',
        leadDays: 14,
        startsOn: '2026-11-01',
      };

      assert.strictEqual(describeRecurrence(rec, 'en'), '3 months after completion');
      assert.strictEqual(describeRecurrence(rec, 'sk'), '3 mesiace po dokončení');
      assert.strictEqual(describeRecurrence(rec, 'hu'), '3 hónap a befejezés után');
    });
  });
});
