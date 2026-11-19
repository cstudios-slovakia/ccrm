import type { Page } from '@playwright/test';
import { buildAccess } from '../../../src/utils/permissions';
import { builtinHolidays, builtinWorkingDays, resolveWorkCountry, type HolidayCountry } from '../../../src/utils/holidays';
import { allocateWorkedMs, workedMsForHoursOnly, type AllocationEntry } from '../../../src/utils/timeAllocation';
import { computeCostRate, computeWorkedCost, DEFAULT_COST_SETTINGS } from '../../../src/utils/timeCost';
import { DEFAULT_TIME_TRACKING_SETTINGS, type TimeTrackingSettings } from '../../../src/utils/timeTracking';

/**
 * A stateful stand-in for `/api/time_entries.php` and `/api/holidays.php`.
 *
 * It follows the real server's rules where the UI depends on them: the running set (D5.3: a start
 * with `mode: 'switch'` stops every running entry, `'parallel'` runs beside them within
 * `settings.parallel`), the identical-target refusal, `stop {id | all}` and the `undo_start` of
 * several stopped entries, the title of a linked entry is the task's (joined live), the frozen cost rate is computed from the
 * employee's pay and THAT month's working days, cost fields are stripped for people who may not
 * see them, and a task the caller cannot edit is still linkable. The cost maths is the app's own
 * `timeCost.ts` / `holidays.ts`, so a rate in a screenshot is the rate the product would charge.
 *
 * The real server is exercised separately by `npm run test:time-tracking`.
 */

type Json = Record<string, any>;

interface MockContext {
  user: { id: string; name: string; email: string; role: string };
  users: { id: string; name: string }[];
  roles: any[];
  tasks: Json[];
  tickets?: Json[];
  projects: Json[];
  /** user id -> the employee record pay is taken from (absent = no employee linked). */
  employees: Record<string, { id: string; kind: string; salaryType: string; salaryAmount: number; workCountry?: HolidayCountry | null }>;
  /** Entries to start with. */
  seed: Json[];
  /** Observed by specs. */
  tasksRenamed?: Map<string, string>;
  ticketsRenamed?: Map<string, string>;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function timeTrackingSeed(users: { erik: string; maria: string; free: string }): Json[] {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const at = (base: Date, h: number, m = 0) => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const base = { recordedByUserId: users.erik, employeeId: null, ticketId: null, tags: [], approvalStatus: null, legacyNote: null, note: null, originType: null, originId: null, createdAt: ymd(today) + ' 08:00:00', titleDeleted: false, running: false };
  return [
    { ...base, id: 'te-seed-1', userId: users.erik, projectId: 'project-1', taskId: null, description: 'Návrh cenovej ponuky', entryDate: ymd(today), startAt: at(today, 8), endAt: at(today, 9, 30), durationSec: 5400, billable: true, source: 'timer' },
    { ...base, id: 'te-seed-2', userId: users.erik, projectId: 'project-1', taskId: 'task-3', description: null, entryDate: ymd(today), startAt: at(today, 10), endAt: at(today, 10, 45), durationSec: 2700, billable: true, source: 'timer' },
    { ...base, id: 'te-seed-3', userId: users.erik, projectId: 'project-1', taskId: null, description: 'Porada s klientom', entryDate: ymd(yesterday), startAt: null, endAt: null, durationSec: 7200, billable: false, source: 'day' },
    { ...base, id: 'te-seed-5', userId: users.free, recordedByUserId: users.free, projectId: 'project-1', taskId: null, description: 'Externá práca', entryDate: ymd(today), startAt: at(today, 13), endAt: at(today, 14), durationSec: 3600, billable: true, source: 'timer' },
    { ...base, id: 'te-seed-4', userId: users.maria, recordedByUserId: users.maria, projectId: 'project-1', taskId: null, description: 'Fakturácia', entryDate: ymd(today), startAt: at(today, 9), endAt: at(today, 10), durationSec: 3600, billable: true, source: 'timer' },
  ];
}

export async function installTimeTrackingMock(page: Page, ctx: MockContext) {
  const entries: Json[] = ctx.seed.map((e) => ({ ...e }));
  let settings: TimeTrackingSettings = JSON.parse(JSON.stringify(DEFAULT_TIME_TRACKING_SETTINGS));
  let idSeq = 100;
  let startWhileRunning: 'ask' | 'switch' | 'parallel' = 'ask';
  const access = buildAccess(ctx.user as any, ctx.roles);
  const canEdit = access.canEdit('time_tracking');
  const canTeam = access.can('time_tracking_team');
  const canCosts = access.can('time_tracking_costs');
  const caller = ctx.user.id;

  const country = (userId: string): HolidayCountry => resolveWorkCountry(ctx.employees[userId]?.workCountry ?? null, 'Slovakia');
  const overridesOf = (c: HolidayCountry) => Object.values(settings.holidayOverrides?.[c] ?? {}).flat();

  const price = (userId: string, entryDate: string, durationSec: number | null) => {
    const emp = ctx.employees[userId];
    if (!emp) return { employeeId: null, costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null };
    const c = country(userId);
    const days = builtinWorkingDays(c, Number(entryDate.slice(0, 4)), Number(entryDate.slice(5, 7)), overridesOf(c));
    const r = computeCostRate({ kind: emp.kind, salaryType: emp.salaryType, salaryAmount: emp.salaryAmount }, days, { ...DEFAULT_COST_SETTINGS, ...settings });
    return { employeeId: emp.id, costRate: r.rate, costRateSource: r.source, costRateBasisDays: r.basisDays, cost: durationSec === null ? null : computeWorkedCost(durationSec * 1000, r.rate) };
  };

  // The seeded entries are priced like any saved entry (the frozen rate of their own month).
  for (const e of entries) if (e.endAt || !e.startAt) Object.assign(e, price(e.userId, e.entryDate, e.durationSec));

  // Like the server's settle: closed timed entries share their person's clock time (allocateWorkedMs),
  // hours-only entries are worked for their duration, a running entry has no worked time yet.
  const settleWorked = () => {
    const byUser = new Map<string, AllocationEntry[]>();
    for (const e of entries) {
      if (e.deletedAt) continue;
      if (!e.startAt) { e.workedMs = workedMsForHoursOnly(e.durationSec ?? 0); continue; }
      if (!e.endAt) { e.workedMs = null; continue; }
      const list = byUser.get(e.userId) ?? [];
      list.push({ id: e.id, startMs: Date.parse(e.startAt), endMs: Date.parse(e.endAt) });
      byUser.set(e.userId, list);
    }
    for (const list of byUser.values()) {
      const shares = allocateWorkedMs(list);
      for (const e of list) entries.find((x) => x.id === e.id)!.workedMs = shares.get(e.id) ?? 0;
    }
  };
  settleWorked();

  // The server trims the Description and stores an empty one as NULL.
  const cleanNote = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : null);

  const view = (e: Json): Json => {
    const task = e.taskId ? ctx.tasks.find((t) => t.id === e.taskId) : null;
    const renamed = task ? ctx.tasksRenamed?.get(task.id) ?? task.title : null;
    const ticket = !e.taskId && e.ticketId ? (ctx.tickets ?? []).find((t) => t.id === e.ticketId) : null;
    const ticketTitle = ticket ? ctx.ticketsRenamed?.get(ticket.id) ?? ticket.title ?? ticket.subject : null;
    const title = e.taskId ? (task ? renamed : e.titleSnapshot ?? '') : e.ticketId ? (ticket ? ticketTitle : e.titleSnapshot ?? '') : e.description ?? '';
    const out: Json = {
      ...e,
      title,
      titleSource: e.taskId ? 'task' : e.ticketId ? 'ticket' : 'entry',
      titleDeleted: e.taskId ? !task : e.ticketId ? !ticket : false,
      projectName: ctx.projects.find((p) => p.id === e.projectId)?.name ?? null,
      running: !!e.startAt && !e.endAt,
      // D6: the three states; a paused item is a closed entry with a marker.
      state: e.startAt && !e.endAt ? 'ongoing' : e.pausedAt ? 'paused' : 'stopped',
      pausedAt: e.pausedAt ?? null,
      pauseReason: e.pauseReason ?? null,
      resumeUntil: e.resumeUntil ?? null,
      continuesId: e.continuesId ?? null,
      endReason: e.endReason ?? null,
    };
    delete out.titleSnapshot;
    delete out.costRate; delete out.costRateSource; delete out.costRateBasisDays; delete out.cost; delete out.billableRate;
    if (e.userId === caller || canCosts) {
      out.costRate = e.costRate ?? null; out.costRateSource = e.costRateSource ?? 'none'; out.costRateBasisDays = e.costRateBasisDays ?? null; out.cost = e.cost ?? null;
    }
    if (canCosts) out.billableRate = e.billableRate ?? null;
    return out;
  };

  const resolveLinks = (input: Json, existing?: Json) => {
    const taskId = 'taskId' in input ? input.taskId : existing?.taskId ?? null;
    const task = taskId ? ctx.tasks.find((t) => t.id === taskId) : null;
    if (taskId && !task) return { error: 'task_not_found' };
    const ticketId = taskId ? null : ('ticketId' in input ? input.ticketId : existing?.ticketId ?? null);
    const ticket = ticketId ? (ctx.tickets ?? []).find((t) => t.id === ticketId) : null;
    if (ticketId && !ticket && ctx.tickets) return { error: 'ticket_not_found' };
    const projectId = 'projectId' in input && input.projectId ? input.projectId : task?.relatedProjectId ?? ticket?.projectId ?? (taskId === existing?.taskId ? existing?.projectId : null) ?? null;
    const description = taskId || ticketId ? null : ('description' in input ? input.description : existing?.description) ?? null;
    const titleSnapshot = task ? (ctx.tasksRenamed?.get(task.id) ?? task.title) : ticket ? (ctx.ticketsRenamed?.get(ticket.id) ?? ticket.title ?? ticket.subject) : description;
    return { taskId: taskId ?? null, ticketId: ticketId ?? null, projectId, description, titleSnapshot };
  };

  const finish = (e: Json, endIso: string) => {
    e.endAt = endIso;
    e.durationSec = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(e.startAt)) / 1000));
    Object.assign(e, price(e.userId, e.entryDate, e.durationSec));
  };
  /** The caller's running set, oldest start first (like the server). */
  const runningSet = () =>
    entries
      .filter((e) => e.userId === caller && e.startAt && !e.endAt && !e.deletedAt)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  // TT2 D7.1: the mock never asks the presence question: a running set is always in the tracking phase,
  // anchored at the last confirm (or now). No timers: idle.
  let presenceAnchor: string | null = null;
  const presence = () => {
    if (!runningSet().length) return { enabled: true, anchorAt: null, promptAt: null, deadlineAt: null, phase: 'idle', autoPausedAt: null, resumeUntil: null };
    const anchor = Date.parse(presenceAnchor ?? new Date().toISOString());
    const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return { enabled: true, anchorAt: iso(anchor), promptAt: iso(anchor + 50 * 60000), deadlineAt: iso(anchor + 60 * 60000), phase: 'tracking', autoPausedAt: null, resumeUntil: null };
  };
  const norm = (v: unknown) => String(v ?? '').trim();
  // The server's identical target (ccrm_tt_same_target): same task; else same ticket; else free text on the same project with the same title.
  const sameTarget = (row: Json, links: Json) => {
    if (norm(links.taskId)) return norm(row.taskId) === norm(links.taskId);
    if (norm(links.ticketId)) return !norm(row.taskId) && norm(row.ticketId) === norm(links.ticketId);
    return !norm(row.taskId) && !norm(row.ticketId) && norm(row.projectId) === norm(links.projectId) && norm(row.description) === norm(links.description);
  };
  // ccrm_tt_parallel_refusal, in the order of D5.3. The mock grants `time_tracking_parallel` to anyone who may edit time.
  const parallelRefusal = (rows: Json[], links: Json): { code: string; entry?: Json; maxParallel?: number } | null => {
    if (!rows.length) return null;
    const p = settings.parallel ?? DEFAULT_TIME_TRACKING_SETTINGS.parallel;
    if (!p.enabled) return { code: 'parallel_disabled' };
    if (rows.length >= p.maxParallel) return { code: 'parallel_limit', maxParallel: p.maxParallel };
    const project = norm(links.projectId);
    if (project && p.sameProject !== 'always') {
      const newLinked = !!(norm(links.taskId) || norm(links.ticketId));
      for (const row of rows) {
        if (norm(row.projectId) !== project || sameTarget(row, links)) continue;
        const rowLinked = !!(norm(row.taskId) || norm(row.ticketId));
        if (p.sameProject === 'never' || !newLinked || !rowLinked) return { code: 'same_project', entry: row };
      }
    }
    const hit = rows.find((row) => sameTarget(row, links));
    return hit ? { code: 'already_running', entry: hit } : null;
  };
  const ok = (body: Json, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: true, ...body }) });
  const fail = (code: string, status = 400, extra: Json = {}) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: false, code, ...extra }) });

  await page.route('**/api/holidays.php**', (route) => {
    const u = new URL(route.request().url());
    const c = (u.searchParams.get('country') ?? 'SK') as HolidayCountry;
    const year = Number(u.searchParams.get('year'));
    return route.fulfill(ok({ country: c, year, days: builtinHolidays(c, year), fallback: false }));
  });

  await page.route('**/api/time_entries.php**', async (route) => {
    const req = route.request();
    if (!access.can('time_tracking')) return route.fulfill(fail('forbidden', 403));
    const url = new URL(req.url());

    if (req.method() === 'GET') {
      settleWorked();
      if (url.searchParams.get('action') === 'settings') {
        return route.fulfill(ok({ settings, defaultCountry: 'SK', me: { userId: caller, employeeId: ctx.employees[caller]?.id ?? null, workCountry: country(caller), startWhileRunning }, viewer: { canEdit, canTeam, canCosts }, ...(canEdit ? { cron: { lastRunAt: new Date().toISOString(), stale: false } } : {}) }));
      }
      if (url.searchParams.get('action') === 'prefs') return route.fulfill(ok({ startWhileRunning }));
      if (url.searchParams.has('running')) {
        const set = runningSet().map(view);
        const paused = entries.filter((e) => e.userId === caller && e.pausedAt && !e.deletedAt).map(view);
        return route.fulfill(ok({ running: set, paused, presence: presence(), serverNow: new Date().toISOString(), entry: set[0] ?? null }));
      }
      if (url.searchParams.get('action') === 'totals') {
        const byTask: Record<string, number> = {};
        const byTicket: Record<string, number> = {};
        const byProject: Record<string, { seconds: number; workedMs: number; cost: number | null; billableValue: number | null; billableComplete: boolean }> = {};
        for (const e of entries) {
          if (e.deletedAt || !e.durationSec) continue;
          if (e.taskId) byTask[e.taskId] = (byTask[e.taskId] ?? 0) + e.durationSec;
          if (e.ticketId) byTicket[e.ticketId] = (byTicket[e.ticketId] ?? 0) + e.durationSec;
          if (e.projectId) {
            const row = byProject[e.projectId] ?? { seconds: 0, workedMs: 0, cost: 0, billableValue: canCosts ? 0 : null, billableComplete: canCosts };
            row.seconds += e.durationSec;
            row.workedMs += e.workedMs ?? e.durationSec * 1000;
            if (e.userId === caller || canCosts) row.cost = (row.cost ?? 0) + (e.cost ?? 0);
            else row.cost = null;
            if (canCosts && e.billable) {
              const rate = (e as { billableRate?: number | null }).billableRate;
              if (rate == null) row.billableComplete = false;
              else row.billableValue = Math.round(((row.billableValue ?? 0) + (e.durationSec / 3600) * rate) * 100) / 100;
            }
            byProject[e.projectId] = row;
          }
        }
        return route.fulfill(ok({ byTask, byTicket, byProject, workedByUserDay: {} }));
      }
      if (url.searchParams.get('action') === 'rateCard') {
        const employeeId = url.searchParams.get('employeeId') ?? '';
        const month = url.searchParams.get('month') ?? '';
        const owner = Object.entries(ctx.employees).find(([, e]) => e.id === employeeId);
        if (!owner || (!canCosts && owner[0] !== caller)) return route.fulfill(fail('forbidden', 403));
        const c = country(owner[0]);
        const days = builtinWorkingDays(c, Number(month.slice(0, 4)), Number(month.slice(5, 7)), overridesOf(c));
        const emp = owner[1];
        const r = computeCostRate({ kind: emp.kind, salaryType: emp.salaryType, salaryAmount: emp.salaryAmount }, days, { ...DEFAULT_COST_SETTINGS, ...settings });
        return route.fulfill(ok({ rateCard: { employeeId, month, rate: r.rate, source: r.source, basisDays: r.basisDays, workingDays: days, country: c, paidLeaveDays: 0, unpaidLeaveDays: 0, hoursPerDay: r.hoursPerDay ?? settings.hoursPerDay, multiplier: r.multiplier, fallback: false, salaryType: emp.salaryType, salaryAmount: emp.salaryAmount, frozen: false, stored: false, hoursBasis: settings.hoursBasis } }));
      }
      if (url.searchParams.get('action') === 'overlaps') {
        return route.fulfill(ok({ months: [] }));
      }
      if (url.searchParams.get('action') === 'usage') {
        if (!access.can('tickets.time')) return route.fulfill(fail('forbidden', 403));
        const projectId = url.searchParams.get('projectId');
        const rows = entries.filter((e) => !e.deletedAt && e.durationSec && (e.projectId === projectId || (ctx.tickets ?? []).some((t) => t.id === e.ticketId && t.projectId === projectId)));
        return route.fulfill(ok({ entries: rows.map((e) => ({ id: e.id, projectId: e.projectId, ticketId: e.ticketId, taskId: e.taskId, billable: e.billable, entryDate: e.entryDate, durationSec: e.durationSec })) }));
      }
      const ticketFilter = url.searchParams.get('ticketId');
      if (ticketFilter && !access.can('tickets.time')) return route.fulfill(fail('forbidden', 403));
      const from = url.searchParams.get('from') ?? '0000-00-00';
      const to = url.searchParams.get('to') ?? '9999-99-99';
      const who = url.searchParams.get('userId');
      const list = entries
        .filter((e) => !e.deletedAt && e.entryDate >= from && e.entryDate <= to && (!ticketFilter || e.ticketId === ticketFilter))
        .filter((e) => (ticketFilter ? true : (!who || who === caller || !canTeam ? e.userId === caller : who === 'all' ? true : e.userId === who)));
      return route.fulfill(ok({ entries: list.map(view), viewer: { userId: caller, canEdit, canTeam, canCosts } }));
    }

    if (!canEdit) return route.fulfill(fail('forbidden', 403));
    const body = (req.postDataJSON() ?? {}) as Json;
    const action = body.action as string;

    if (action === 'prefs') {
      if (!['ask', 'switch', 'parallel'].includes(body.startWhileRunning as string)) return route.fulfill(fail('invalid_start_while_running', 422));
      startWhileRunning = body.startWhileRunning as typeof startWhileRunning;
      return route.fulfill(ok({ startWhileRunning }));
    }

    if (action === 'settings') {
      if (access.value('general_config') !== 'edit') return route.fulfill(fail('forbidden', 403));
      settings = { ...settings, ...body.settings };
      return route.fulfill(ok({ settings }));
    }

    if (action === 'confirm') {
      // D7.4: the answer restarts the cycle now; with nothing running there is nothing to confirm.
      if (!runningSet().length) return route.fulfill(fail('not_running', 409, { presence: presence() }));
      presenceAnchor = new Date().toISOString();
      return route.fulfill(ok({ presence: presence() }));
    }

    if (action === 'start') {
      const links = resolveLinks(body);
      if ('error' in links) return route.fulfill(fail(links.error as string, 422));
      const now = new Date().toISOString();
      const mode = body.mode == null || body.mode === '' ? 'switch' : body.mode;
      if (mode !== 'switch' && mode !== 'parallel') return route.fulfill(fail('bad_mode', 400));
      const rows = runningSet();
      const stopped: Json[] = [];
      if (mode === 'parallel') {
        const refusal = parallelRefusal(rows, links);
        if (refusal) {
          return route.fulfill(fail(refusal.code, 409, { ...(refusal.entry ? { entry: view(refusal.entry) } : {}), ...(refusal.maxParallel ? { maxParallel: refusal.maxParallel } : {}) }));
        }
      } else {
        // Like the server: starting what already runs (a stale tab) is refused, never a restart.
        const same = rows.find((row) => sameTarget(row, links));
        if (same) return route.fulfill(fail('already_running', 409, { entry: view(same) }));
        for (const row of rows) {
          finish(row, now);
          row.endReason = 'switch';
          stopped.push(row);
        }
      }
      const entry: Json = {
        id: `te-mock-${++idSeq}`, userId: caller, recordedByUserId: caller, employeeId: ctx.employees[caller]?.id ?? null, ticketId: links.ticketId,
        projectId: links.projectId, taskId: links.taskId, description: links.description, titleSnapshot: links.titleSnapshot, legacyNote: null, note: cleanNote(body.note),
        entryDate: ymd(new Date()), startAt: now, endAt: null, durationSec: null, billable: body.billable ?? settings.billableByDefault, tags: body.tags ?? [],
        source: body.source ?? 'timer', originType: body.originType ?? null, originId: body.originId ?? null, approvalStatus: null, createdAt: now.replace('T', ' ').slice(0, 19),
        costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null,
      };
      entries.push(entry);
      settleWorked();
      const stoppedAll = stopped.map(view);
      return route.fulfill(ok({ entry: view(entry), stopped: stoppedAll[0] ?? null, stoppedAll, mode }, 201));
    }

    if (action === 'stop') {
      const needsProject = (x: Json) => settings.requireProjectToStop && !x.projectId && access.can('projects');
      if (body.all) {
        const rows = runningSet();
        const ids = rows.filter(needsProject).map((x) => x.id);
        if (ids.length) return route.fulfill(fail('project_required', 422, { ids }));
        const now = new Date().toISOString();
        for (const row of rows) finish(row, now);
        settleWorked();
        const stoppedAll = rows.map(view);
        return route.fulfill(ok({ entry: stoppedAll[0] ?? null, stoppedAll }));
      }
      let e: Json | undefined;
      if (body.id) e = entries.find((x) => x.id === body.id && !x.deletedAt);
      else {
        const rows = runningSet();
        if (rows.length > 1) return route.fulfill(fail('ambiguous', 409, { running: rows.map(view) }));
        e = rows[0];
      }
      if (!e) return route.fulfill(fail('not_found', 404));
      if (e.endAt) {
        // A paused item: the stop clears its marker, no new time (D6).
        if (e.pausedAt) Object.assign(e, { pausedAt: null, endReason: e.endReason ?? 'user' });
        return route.fulfill(ok({ entry: view(e) }));
      }
      if (body.projectId) e.projectId = body.projectId;
      if (needsProject(e)) return route.fulfill(fail('project_required', 422));
      finish(e, new Date().toISOString());
      e.endReason = 'user';
      settleWorked();
      return route.fulfill(ok({ entry: view(e) }));
    }

    if (action === 'pause') {
      // D6: the running item ends now and keeps a resumable marker; "require a project" does not apply.
      const e = body.id ? entries.find((x) => x.id === body.id && !x.deletedAt) : runningSet()[0];
      if (body.id && !e) return route.fulfill(fail('not_found', 404));
      if (!e) return route.fulfill(ok({ entry: null, paused: [] }));
      if (e.endAt && !e.pausedAt) return route.fulfill(fail('not_running', 409, { entry: view(e) }));
      if (!e.endAt) {
        const now = new Date().toISOString();
        finish(e, now);
        Object.assign(e, { pausedAt: now, pauseReason: 'manual', resumeUntil: null, endReason: null });
        settleWorked();
      }
      return route.fulfill(ok({ entry: view(e), paused: [view(e)] }));
    }

    if (action === 'resume') {
      // D6, C8: a new running entry continues the paused one; the mock is single-timer, so a resume switches.
      const old = body.id ? entries.find((x) => x.id === body.id && !x.deletedAt) : entries.find((x) => x.userId === caller && x.pausedAt && !x.deletedAt);
      if (!old) return route.fulfill(body.id ? fail('not_found', 404) : ok({ entry: null, entries: [], resumed: [], stoppedAll: [], skipped: [], expired: [] }));
      if (!old.pausedAt) return route.fulfill(fail(old.endAt ? 'not_paused' : 'already_running', 409, { entry: view(old) }));
      if (old.resumeUntil && Date.parse(old.resumeUntil) < Date.now()) {
        Object.assign(old, { pausedAt: null, endReason: old.endReason ?? 'user' });
        return route.fulfill(fail('pause_expired', 409, { entry: view(old), expired: [old.id] }));
      }
      const now = new Date().toISOString();
      const prevs = runningSet();
      for (const prev of prevs) {
        finish(prev, now);
        prev.endReason = 'switch';
      }
      old.pausedAt = null;
      const entry: Json = {
        ...old, id: `te-mock-${++idSeq}`, recordedByUserId: caller, entryDate: ymd(new Date()), startAt: now, endAt: null, durationSec: null, workedMs: null,
        source: 'timer', continuesId: old.id, pausedAt: null, pauseReason: null, resumeUntil: null, endReason: null, approvalStatus: null,
        createdAt: now.replace('T', ' ').slice(0, 19), costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null,
      };
      entries.push(entry);
      settleWorked();
      return route.fulfill(ok({ entry: view(entry), entries: [view(entry)], resumed: [old.id], stoppedAll: prevs.map(view), skipped: [], alreadyRunning: [], expired: [] }, 201));
    }

    if (action === 'undo_start') {
      const i = entries.findIndex((e) => e.id === body.newId);
      if (i >= 0) entries.splice(i, 1);
      const ids = new Set<string>([...(Array.isArray(body.stoppedIds) ? body.stoppedIds : []), body.stoppedId].filter((x): x is string => typeof x === 'string' && x !== ''));
      const reopened: Json[] = [];
      for (const id of ids) {
        const old = entries.find((e) => e.id === id && e.userId === caller && !e.deletedAt && e.startAt);
        if (!old) continue;
        Object.assign(old, { endAt: null, durationSec: null, costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null });
        reopened.push(old);
      }
      settleWorked();
      const views = reopened.map(view);
      return route.fulfill(ok({ entry: views[0] ?? null, reopened: views }));
    }

    if (action === 'create' || action === 'update') {
      const existing = action === 'update' ? entries.find((e) => e.id === body.id && !e.deletedAt) : undefined;
      if (action === 'update' && !existing) return route.fulfill(fail('not_found', 404));
      const owner = body.userId && canTeam ? body.userId : existing?.userId ?? caller;
      if (existing && existing.userId !== caller && !canTeam) return route.fulfill(fail('forbidden', 403));
      if (body.userId && body.userId !== caller && !canTeam) return route.fulfill(fail('forbidden', 403));
      const links = resolveLinks(body, existing);
      if ('error' in links) return route.fulfill(fail(links.error as string, 422));
      // Unlinking: the entry's own title starts as the task's current title.
      let description = links.description;
      if (existing?.taskId && !links.taskId && !('description' in body)) {
        const t = ctx.tasks.find((x) => x.id === existing.taskId);
        description = t ? ctx.tasksRenamed?.get(t.id) ?? t.title : existing.titleSnapshot ?? null;
      }
      let { startAt, endAt, durationSec, entryDate } = existing ?? { startAt: null, endAt: null, durationSec: null, entryDate: body.entryDate };
      if ('startAt' in body) startAt = body.startAt;
      if ('endAt' in body) endAt = body.endAt;
      if ('durationSec' in body) durationSec = body.durationSec;
      if (startAt && endAt) {
        if (Date.parse(endAt) < Date.parse(startAt)) return route.fulfill(fail('end_before_start', 422));
        durationSec = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 1000);
      } else if (startAt && !endAt && durationSec) {
        endAt = new Date(Date.parse(startAt) + durationSec * 1000).toISOString();
      }
      if (!startAt && durationSec == null) return route.fulfill(fail('duration_required', 422));
      if (durationSec != null && (durationSec < 0 || durationSec > 86_400)) return route.fulfill(fail('duration_out_of_range', 422));
      if ('entryDate' in body && body.entryDate) entryDate = body.entryDate;
      else if (startAt && !existing) entryDate = ymd(new Date(startAt));
      const next: Json = {
        ...(existing ?? { id: `te-mock-${++idSeq}`, recordedByUserId: caller, ticketId: null, legacyNote: null, originType: null, originId: null, approvalStatus: null, createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19) }),
        userId: owner, projectId: links.projectId, taskId: links.taskId, ticketId: links.ticketId, description, titleSnapshot: links.titleSnapshot,
        note: 'note' in body ? cleanNote(body.note) : existing?.note ?? null,
        entryDate, startAt, endAt, durationSec, billable: 'billable' in body ? !!body.billable : existing?.billable ?? settings.billableByDefault,
        tags: 'tags' in body ? body.tags : existing?.tags ?? [], source: body.source ?? existing?.source ?? 'manual',
      };
      if (!startAt || endAt) {
        const monthChanged = !existing || existing.entryDate?.slice(0, 7) !== next.entryDate.slice(0, 7) || existing.userId !== owner || !existing.endAt && !!endAt;
        if (monthChanged) Object.assign(next, price(owner, next.entryDate, durationSec));
        else next.cost = durationSec == null ? null : computeWorkedCost(durationSec * 1000, next.costRate); // the mock models no overlaps: worked = duration
      }
      if (existing) Object.assign(existing, next);
      else entries.push(next);
      settleWorked();
      return route.fulfill(ok({ entry: view(existing ?? next) }, existing ? 200 : 201));
    }

    if (action === 'delete' || action === 'restore') {
      const e = entries.find((x) => x.id === body.id);
      if (!e) return route.fulfill(fail('not_found', 404));
      if (e.userId !== caller && !canTeam) return route.fulfill(fail('forbidden', 403));
      e.deletedAt = action === 'delete' ? new Date().toISOString() : undefined;
      settleWorked();
      return route.fulfill(ok(action === 'delete' ? { id: e.id } : { entry: view(e) }));
    }

    if (action === 'reprice') {
      let n = 0;
      for (const e of entries) if (!e.deletedAt && e.endAt !== null && e.entryDate >= body.from && e.entryDate <= body.to) { Object.assign(e, price(e.userId, e.entryDate, e.durationSec)); n++; }
      return route.fulfill(ok({ repriced: n }));
    }

    return route.fulfill(fail('unknown_action', 400));
  });
}
