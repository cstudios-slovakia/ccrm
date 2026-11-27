import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeRecurrenceWithEnd } from './recurringTasks.ts';
import type { TaskRecurrence } from '../types/index.ts';

const weeklyMonday: TaskRecurrence = {
  mode: 'schedule',
  frequency: 'weekly',
  interval: 1,
  config: { dayOfWeek: 1 },
  weekendRule: 'keep',
  leadDays: 0,
  startsOn: '2026-11-02',
  endsOn: null,
};

describe('describeRecurrenceWithEnd: card tooltip for a recurring series', () => {
  it('says "no end" when the series has no end date', () => {
    assert.equal(describeRecurrenceWithEnd(weeklyMonday, 'sk'), 'Každý týždeň v pondelok, bez konca');
    assert.equal(describeRecurrenceWithEnd(weeklyMonday, 'en'), 'Every week on Monday, no end');
    assert.equal(describeRecurrenceWithEnd(weeklyMonday, 'hu'), 'Minden héten hétfőn, vég nélkül');
  });

  it('names the end date in each language', () => {
    const rec = { ...weeklyMonday, endsOn: '2027-02-05' };
    assert.equal(describeRecurrenceWithEnd(rec, 'sk'), 'Každý týždeň v pondelok, do 5. 2. 2027');
    assert.equal(describeRecurrenceWithEnd(rec, 'en'), 'Every week on Monday, until 5 Feb 2027');
    assert.equal(describeRecurrenceWithEnd(rec, 'hu'), 'Minden héten hétfőn, 2027. 02. 05-ig');
  });

  it('ignores an end date that is not YYYY-MM-DD', () => {
    assert.equal(describeRecurrenceWithEnd({ ...weeklyMonday, endsOn: '' }, 'en'), 'Every week on Monday, no end');
  });

  it('marks a paused series', () => {
    assert.equal(describeRecurrenceWithEnd({ ...weeklyMonday, paused: true }, 'en'), 'Every week on Monday, no end (paused)');
  });

  it('keeps the after-completion wording', () => {
    const rec: TaskRecurrence = { ...weeklyMonday, mode: 'after_completion', frequency: 'monthly', interval: 3 };
    assert.equal(describeRecurrenceWithEnd(rec, 'sk'), '3 mesiace po dokončení, bez konca');
  });
});
