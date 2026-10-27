import type { Page } from '@playwright/test';
import { buildAccess } from '../../../src/utils/permissions';
import { builtinHolidays, builtinWorkingDays, resolveWorkCountry, type HolidayCountry } from '../../../src/utils/holidays';
import { computeCostRate, computeEntryCost, DEFAULT_COST_SETTINGS } from '../../../src/utils/timeCost';
import { DEFAULT_TIME_TRACKING_SETTINGS, type TimeTrackingSettings } from '../../../src/utils/timeTracking';

/**
 * A stateful stand-in for `/api/time_entries.php` and `/api/holidays.php`.
 *
 * It follows the real server's rules where the UI depends on them: one running timer per user, the
 * title of a linked entry is the task's (joined live), the frozen cost rate is computed from the
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
  projects: Json[];
  /** user id -> the employee record pay is taken from (absent = no employee linked). */
  employees: Record<string, { id: string; kind: string; salaryType: string; salaryAmount: number; workCountry?: HolidayCountry | null }>;
  /** Entries to start with. */
  seed: Json[];
  /** Observed by specs. */
  tasksRenamed?: Map<string, string>;
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
  const base = { recordedByUserId: users.erik, employeeId: null, ticketId: null, tags: [], approvalStatus: null, legacyNote: null, originType: null, originId: null, createdAt: ymd(today) + ' 08:00:00', titleDeleted: false, running: false };
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
    return { employeeId: emp.id, costRate: r.rate, costRateSource: r.source, costRateBasisDays: r.basisDays, cost: computeEntryCost(durationSec, r.rate) };
  };

  // The seeded entries are priced like any saved entry (the frozen rate of their own month).
  for (const e of entries) if (e.endAt || !e.startAt) Object.assign(e, price(e.userId, e.entryDate, e.durationSec));

  const view = (e: Json): Json => {
    const task = e.taskId ? ctx.tasks.find((t) => t.id === e.taskId) : null;
    const renamed = task ? ctx.tasksRenamed?.get(task.id) ?? task.title : null;
    const linked = !!e.taskId;
    const title = linked ? (task ? renamed : e.titleSnapshot ?? '') : e.description ?? '';
    const out: Json = {
      ...e,
      title,
      titleSource: linked ? 'task' : 'entry',
      titleDeleted: linked && !task,
      projectName: ctx.projects.find((p) => p.id === e.projectId)?.name ?? null,
      running: !!e.startAt && !e.endAt,
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
    const projectId = 'projectId' in input && input.projectId ? input.projectId : task?.relatedProjectId ?? (taskId === existing?.taskId ? existing?.projectId : null) ?? null;
    const description = taskId ? null : ('description' in input ? input.description : existing?.description) ?? null;
    return { taskId: taskId ?? null, projectId, description, titleSnapshot: task ? task.title : description };
  };

  const finish = (e: Json, endIso: string) => {
    e.endAt = endIso;
    e.durationSec = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(e.startAt)) / 1000));
    Object.assign(e, price(e.userId, e.entryDate, e.durationSec));
  };
  const running = () => entries.find((e) => e.userId === caller && e.startAt && !e.endAt && !e.deletedAt);
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
      if (url.searchParams.get('action') === 'settings') {
        return route.fulfill(ok({ settings, defaultCountry: 'SK', me: { userId: caller, employeeId: ctx.employees[caller]?.id ?? null, workCountry: country(caller) }, viewer: { canEdit, canTeam, canCosts } }));
      }
      if (url.searchParams.has('running')) {
        const r = running();
        return route.fulfill(ok({ entry: r ? view(r) : null }));
      }
      const from = url.searchParams.get('from') ?? '0000-00-00';
      const to = url.searchParams.get('to') ?? '9999-99-99';
      const who = url.searchParams.get('userId');
      const list = entries.filter((e) => !e.deletedAt && e.entryDate >= from && e.entryDate <= to).filter((e) => (!who || who === caller || !canTeam ? e.userId === caller : who === 'all' ? true : e.userId === who));
      return route.fulfill(ok({ entries: list.map(view), viewer: { userId: caller, canEdit, canTeam, canCosts } }));
    }

    if (!canEdit) return route.fulfill(fail('forbidden', 403));
    const body = (req.postDataJSON() ?? {}) as Json;
    const action = body.action as string;

    if (action === 'settings') {
      if (access.value('general_config') !== 'edit') return route.fulfill(fail('forbidden', 403));
      settings = { ...settings, ...body.settings };
      return route.fulfill(ok({ settings }));
    }

    if (action === 'start') {
      const links = resolveLinks(body);
      if ('error' in links) return route.fulfill(fail(links.error as string, 422));
      const now = new Date().toISOString();
      const prev = running();
      if (prev) finish(prev, now);
      const entry: Json = {
        id: `te-mock-${++idSeq}`, userId: caller, recordedByUserId: caller, employeeId: ctx.employees[caller]?.id ?? null, ticketId: null,
        projectId: links.projectId, taskId: links.taskId, description: links.description, titleSnapshot: links.titleSnapshot, legacyNote: null,
        entryDate: ymd(new Date()), startAt: now, endAt: null, durationSec: null, billable: body.billable ?? settings.billableByDefault, tags: body.tags ?? [],
        source: body.source ?? 'timer', originType: body.originType ?? null, originId: body.originId ?? null, approvalStatus: null, createdAt: now.replace('T', ' ').slice(0, 19),
        costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null,
      };
      entries.push(entry);
      return route.fulfill(ok({ entry: view(entry), stopped: prev ? view(prev) : null }, 201));
    }

    if (action === 'stop') {
      const e = body.id ? entries.find((x) => x.id === body.id) : running();
      if (!e) return route.fulfill(fail('not_found', 404));
      if (e.endAt) return route.fulfill(ok({ entry: view(e) }));
      if (body.projectId) e.projectId = body.projectId;
      if (settings.requireProjectToStop && !e.projectId && access.can('projects')) return route.fulfill(fail('project_required', 422));
      finish(e, new Date().toISOString());
      return route.fulfill(ok({ entry: view(e) }));
    }

    if (action === 'undo_start') {
      const i = entries.findIndex((e) => e.id === body.newId);
      if (i >= 0) entries.splice(i, 1);
      const old = entries.find((e) => e.id === body.stoppedId);
      if (old) Object.assign(old, { endAt: null, durationSec: null, costRate: null, costRateSource: 'none', costRateBasisDays: null, cost: null });
      return route.fulfill(ok({ entry: old ? view(old) : null }));
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
        userId: owner, projectId: links.projectId, taskId: links.taskId, description, titleSnapshot: links.titleSnapshot,
        entryDate, startAt, endAt, durationSec, billable: 'billable' in body ? !!body.billable : existing?.billable ?? settings.billableByDefault,
        tags: 'tags' in body ? body.tags : existing?.tags ?? [], source: body.source ?? existing?.source ?? 'manual',
      };
      if (!startAt || endAt) {
        const monthChanged = !existing || existing.entryDate?.slice(0, 7) !== next.entryDate.slice(0, 7) || existing.userId !== owner || !existing.endAt && !!endAt;
        if (monthChanged) Object.assign(next, price(owner, next.entryDate, durationSec));
        else next.cost = computeEntryCost(durationSec, next.costRate);
      }
      if (existing) Object.assign(existing, next);
      else entries.push(next);
      return route.fulfill(ok({ entry: view(existing ?? next) }, existing ? 200 : 201));
    }

    if (action === 'delete' || action === 'restore') {
      const e = entries.find((x) => x.id === body.id);
      if (!e) return route.fulfill(fail('not_found', 404));
      if (e.userId !== caller && !canTeam) return route.fulfill(fail('forbidden', 403));
      e.deletedAt = action === 'delete' ? new Date().toISOString() : undefined;
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
