import type { Page } from '@playwright/test';
import {
  DEFAULT_AGENCY_SETTINGS,
  resolveLocalizedLabel,
  type AgencyCalculatedPayment,
  type AgencyPayment,
  type AgencyPlacement,
  type AgencySettings,
  type AgencyShift,
  type AgencyTimelineEvent,
  type AgencyTimelineEventType,
  type AgencyWorker,
  type AgencyWorkerChecklistItem,
  type AgencyWorkerFile,
  type AgencyWorkplace,
} from '../../../src/types/agency';
import { calculateShiftTotals, computePaymentTotals } from '../../../src/utils/agencyCalculations';

export interface AgencyMockOptions {
  canPersonal?: boolean;
  canPayments?: boolean;
  isAdmin?: boolean;
  initialSettings?: Partial<AgencySettings>;
  initialWorkers?: AgencyWorker[];
  initialWorkplaces?: AgencyWorkplace[];
  initialPlacements?: AgencyPlacement[];
  initialShifts?: AgencyShift[];
  initialPayments?: AgencyPayment[];
  initialChecklists?: AgencyWorkerChecklistItem[];
  initialTimelines?: Record<string, AgencyTimelineEvent[]>;
  initialFiles?: Record<string, AgencyWorkerFile[]>;
}

const SENSITIVE_SECTIONS = ['passport', 'permit', 'addresses', 'family'] as const;

export async function installAgencyMocks(page: Page, options: AgencyMockOptions = {}) {
  const canPersonal = options.canPersonal ?? true;
  const canPayments = options.canPayments ?? true;
  const isAdmin = options.isAdmin ?? true;

  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${seq++}`;

  let settings: AgencySettings = {
    ...DEFAULT_AGENCY_SETTINGS,
    ...(options.initialSettings || {}),
  };

  const workers: AgencyWorker[] = [...(options.initialWorkers || [])];
  const workplaces: AgencyWorkplace[] = [...(options.initialWorkplaces || [])];
  const placements: AgencyPlacement[] = [...(options.initialPlacements || [])];
  const shifts: AgencyShift[] = [...(options.initialShifts || [])];
  const payments: AgencyPayment[] = [...(options.initialPayments || [])];
  const checklists: AgencyWorkerChecklistItem[] = [...(options.initialChecklists || [])];
  const timelines: Record<string, AgencyTimelineEvent[]> = { ...(options.initialTimelines || {}) };
  const filesByWorker: Record<string, AgencyWorkerFile[]> = { ...(options.initialFiles || {}) };

  const projectWorker = (w: AgencyWorker): AgencyWorker => {
    const profileCopy: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(w.profile || {})) {
      if (!canPersonal && (SENSITIVE_SECTIONS as readonly string[]).includes(k)) continue;
      profileCopy[k] = { ...v };
    }
    return {
      ...w,
      dateOfBirth: canPersonal ? w.dateOfBirth : '',
      profile: profileCopy,
      defaultPayRate: canPayments ? w.defaultPayRate : null,
      defaultBillRate: canPayments ? w.defaultBillRate : null,
    };
  };

  const projectPlacement = (p: AgencyPlacement): AgencyPlacement => ({
    ...p,
    payRate: canPayments ? p.payRate : null,
    billRate: canPayments ? p.billRate : null,
  });

  const appendTimeline = (
    workerId: string,
    eventType: AgencyTimelineEventType,
    title: string,
    description = '',
    meta: Record<string, unknown> = {},
    occurredAt?: string,
  ): AgencyTimelineEvent => {
    const ts =
      occurredAt && /^\d{4}-\d{2}-\d{2}/.test(occurredAt)
        ? occurredAt.length === 10
          ? `${occurredAt} 09:00:00`
          : occurredAt.replace('T', ' ').slice(0, 19)
        : new Date().toISOString().replace('T', ' ').slice(0, 19);
    const ev: AgencyTimelineEvent = {
      id: nextId('agtl'),
      workerId,
      eventType,
      title,
      description,
      meta,
      occurredAt: ts,
      createdBy: 'Erik',
    };
    timelines[workerId] = [ev, ...(timelines[workerId] || [])];
    return ev;
  };

  const isPeriodPaid = (workerId: string, workDate: string): boolean => {
    const ym = workDate.slice(0, 7);
    return payments.some((p) => p.workerId === workerId && p.periodYm === ym && p.status === 'paid');
  };

  const calcPaymentData = (workerId: string, periodYm: string): AgencyCalculatedPayment => {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) throw new Error('Worker not found');
    const workerPlacements = placements.filter((p) => p.workerId === workerId);
    const primaryPlacement = workerPlacements.find((p) => p.status === 'active') || workerPlacements[0] || null;
    const monthShifts = shifts.filter(
      (s) => s.workerId === workerId && s.workDate.startsWith(periodYm),
    );
    const totals = calculateShiftTotals(monthShifts, worker, workerPlacements, settings);
    const existing = payments.find((p) => p.workerId === workerId && p.periodYm === periodYm) || null;
    const items = (existing?.items || []).filter((it) => it.id !== 'base-shifts');
    const comp = computePaymentTotals(totals.basePay, items, totals.billableTotal);
    return {
      workerId,
      placementId: existing?.placementId ?? primaryPlacement?.id ?? null,
      companyClientId: existing?.companyClientId ?? primaryPlacement?.companyClientId ?? null,
      periodYm,
      regularHours: totals.regularHours,
      overtimeHours: totals.overtimeHours,
      sickDays: totals.sickDays,
      basePay: totals.basePay,
      items,
      grossPay: comp.grossPay,
      deductionsTotal: comp.deductionsTotal,
      netPay: comp.netPay,
      paidAmount: existing?.paidAmount ?? 0,
      billableTotal: totals.billableTotal,
      currency: primaryPlacement?.currency || worker.currency || settings.defaultCurrency || 'EUR',
      status: existing?.status ?? 'draft',
      paidAt: existing?.paidAt ?? null,
      financialRecordId: existing?.financialRecordId ?? null,
      notes: existing?.notes ?? '',
    };
  };

  await page.route('**/api/holidays.php**', (route) => {
    const url = new URL(route.request().url());
    const country = (url.searchParams.get('country') || 'SK').toUpperCase();
    const year = Number(url.searchParams.get('year') || '2026');
    const days =
      country === 'HU'
        ? [
            { date: `${year}-01-01`, localName: 'Újév', name: "New Year's Day" },
            { date: `${year}-05-01`, localName: 'A munka ünnepe', name: 'Labour Day' },
          ]
        : [
            { date: `${year}-01-01`, localName: 'Deň vzniku Slovenskej republiky', name: 'Slovak Republic Day' },
            { date: `${year}-05-01`, localName: 'Sviatok práce', name: 'Labour Day' },
            { date: `${year}-05-08`, localName: 'Deň víťazstva nad fašizmom', name: 'Victory Day' },
          ];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ country, year, days }),
    });
  });

  await page.route('**/api/agency.php**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: Record<string, unknown> = {};
    if (request.method() === 'POST') {
      try {
        body = (request.postDataJSON() || {}) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    const action = String(url.searchParams.get('action') || body.action || 'bootstrap');

    if (action === 'bootstrap') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          settings,
          workers: workers.map(projectWorker),
          workplaces,
          placements: placements.map(projectPlacement),
          checklists,
          shifts,
          payments: canPayments ? payments : [],
        }),
      });
    }

    if (action === 'worker_detail') {
      const id = String(url.searchParams.get('id') || body.id || '');
      const w = workers.find((x) => x.id === id);
      if (!w) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Worker not found' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          worker: projectWorker(w),
          placements: placements.filter((p) => p.workerId === id).map(projectPlacement),
          checklist: checklists.filter((c) => c.workerId === id),
          files: (filesByWorker[id] || []).filter(
            (f) => canPersonal || !['passport', 'permit', 'id_doc', 'medical'].includes(f.category),
          ),
          timeline: timelines[id] || [],
          shifts: shifts.filter((s) => s.workerId === id),
          payments: canPayments ? payments.filter((p) => p.workerId === id) : [],
        }),
      });
    }

    if (action === 'save_worker') {
      const wIn = (body.worker || body) as Partial<AgencyWorker> & { fullName: string };
      const idx = wIn.id ? workers.findIndex((x) => x.id === wIn.id) : -1;
      const existing = idx >= 0 ? workers[idx] : null;
      const id = existing ? existing.id : wIn.id || nextId('agw');
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const saved: AgencyWorker = {
        id,
        workerCode: wIn.workerCode || existing?.workerCode || `AGW-00${seq}`,
        fullName: wIn.fullName,
        preferredName: wIn.preferredName ?? existing?.preferredName ?? '',
        email: wIn.email ?? existing?.email ?? '',
        phone: wIn.phone ?? existing?.phone ?? '',
        stageId: wIn.stageId || existing?.stageId || settings.stages[0]?.id || 'sourced',
        workerStatus: wIn.workerStatus || existing?.workerStatus || 'candidate',
        nationality: wIn.nationality ?? existing?.nationality ?? '',
        dateOfBirth: canPersonal ? wIn.dateOfBirth ?? existing?.dateOfBirth ?? '' : existing?.dateOfBirth ?? '',
        profile: wIn.profile ?? existing?.profile ?? {},
        skills: wIn.skills ?? existing?.skills ?? [],
        notes: wIn.notes ?? existing?.notes ?? '',
        defaultPayRate: canPayments ? (wIn.defaultPayRate ?? existing?.defaultPayRate ?? null) : existing?.defaultPayRate ?? null,
        defaultBillRate: canPayments ? (wIn.defaultBillRate ?? existing?.defaultBillRate ?? null) : existing?.defaultBillRate ?? null,
        currency: wIn.currency || existing?.currency || settings.defaultCurrency || 'EUR',
        assignedRecruiter: wIn.assignedRecruiter ?? existing?.assignedRecruiter ?? '',
        createdBy: existing?.createdBy || 'Erik',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (existing) {
        workers[idx] = saved;
        if (existing.stageId !== saved.stageId) {
          appendTimeline(id, 'stage_change', `Stage: ${existing.stageId} → ${saved.stageId}`);
        }
      } else {
        workers.unshift(saved);
        settings.checklistItems.forEach((tpl, order) => {
          checklists.push({
            id: nextId('agchk'),
            workerId: id,
            itemKey: tpl.key,
            label: resolveLocalizedLabel(tpl.label, 'en') || tpl.key,
            status: 'missing',
            expiresAt: null,
            note: '',
            fileId: null,
            sortOrder: order,
          });
        });
        appendTimeline(id, 'stage_change', 'Profile Created', `Initial stage: ${saved.stageId}`);
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, worker: projectWorker(saved) }),
      });
    }

    if (action === 'delete_worker') {
      const id = String(body.id || url.searchParams.get('id') || '');
      const idx = workers.findIndex((w) => w.id === id);
      if (idx >= 0) workers.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    if (action === 'save_checklist') {
      const workerId = String(body.workerId || '');
      const incoming = (body.items || []) as Array<Partial<AgencyWorkerChecklistItem> & { label: string }>;
      incoming.forEach((it, idx) => {
        const cid = it.id || nextId('agchk');
        const exIdx = checklists.findIndex((c) => c.id === cid);
        const row: AgencyWorkerChecklistItem = {
          id: cid,
          workerId,
          itemKey: it.itemKey || `item_${idx}`,
          label: it.label,
          status: it.status || 'missing',
          expiresAt: it.expiresAt ?? null,
          note: it.note ?? '',
          fileId: it.fileId ?? null,
          sortOrder: it.sortOrder ?? idx,
        };
        if (exIdx >= 0) checklists[exIdx] = row;
        else checklists.push(row);
      });
      appendTimeline(workerId, 'compliance', 'Checklist updated');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, checklist: checklists.filter((c) => c.workerId === workerId) }),
      });
    }

    if (action === 'save_timeline_event') {
      const ev = appendTimeline(
        String(body.workerId || ''),
        (body.eventType as AgencyTimelineEventType) || 'note',
        String(body.title || 'Event'),
        String(body.description || ''),
        (body.meta as Record<string, unknown>) || {},
        body.occurredAt ? String(body.occurredAt) : undefined,
      );
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, event: ev }) });
    }

    if (action === 'save_workplace') {
      const wpIn = (body.workplace || body) as AgencyWorkplace;
      const id = wpIn.id || nextId('agwp');
      const row: AgencyWorkplace = { ...wpIn, id, active: wpIn.active ?? true };
      const idx = workplaces.findIndex((w) => w.id === id);
      if (idx >= 0) workplaces[idx] = row;
      else workplaces.push(row);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, workplace: row }) });
    }

    if (action === 'delete_workplace') {
      const id = String(body.id || url.searchParams.get('id') || '');
      const idx = workplaces.findIndex((w) => w.id === id);
      if (idx >= 0) workplaces.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    if (action === 'save_placement') {
      const plIn = (body.placement || body) as Partial<AgencyPlacement> & { workerId: string; companyClientId: string; startDate: string };
      const idx = plIn.id ? placements.findIndex((p) => p.id === plIn.id) : -1;
      const existing = idx >= 0 ? placements[idx] : null;
      const id = existing ? existing.id : plIn.id || nextId('agpl');
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const status = plIn.status || 'active';

      if (status === 'active') {
        placements.forEach((p, i) => {
          if (p.workerId === plIn.workerId && p.id !== id && p.status === 'active') {
            placements[i] = { ...p, status: 'ended', endDate: p.endDate || plIn.startDate };
          }
        });
      }

      const saved: AgencyPlacement = {
        id,
        workerId: plIn.workerId,
        companyClientId: plIn.companyClientId,
        workplaceId: plIn.workplaceId ?? null,
        contactLeadId: plIn.contactLeadId ?? null,
        jobRole: plIn.jobRole || '',
        status,
        startDate: plIn.startDate,
        endDate: plIn.endDate ?? null,
        payRate: canPayments ? (plIn.payRate ?? existing?.payRate ?? 0) : existing?.payRate ?? 0,
        payRateType: plIn.payRateType || 'hourly',
        billRate: canPayments ? (plIn.billRate ?? existing?.billRate ?? 0) : existing?.billRate ?? 0,
        billRateType: plIn.billRateType || 'hourly',
        currency: plIn.currency || settings.defaultCurrency || 'EUR',
        notes: plIn.notes || '',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (existing) placements[idx] = saved;
      else placements.unshift(saved);

      const wIdx = workers.findIndex((w) => w.id === plIn.workerId);
      if (wIdx >= 0) {
        const hasActive = placements.some((p) => p.workerId === plIn.workerId && p.status === 'active');
        workers[wIdx] = {
          ...workers[wIdx],
          workerStatus: hasActive ? 'rented' : workers[wIdx].workerStatus === 'rented' ? 'inactive' : workers[wIdx].workerStatus,
          stageId: hasActive ? 'placed' : workers[wIdx].stageId,
        };
      }
      if (!existing || existing.status !== saved.status || existing.companyClientId !== saved.companyClientId) {
        appendTimeline(
          plIn.workerId,
          'placement',
          saved.status === 'active' ? `Placed at ${plIn.companyClientId}` : `Placement ${saved.status}`,
          saved.notes,
          { placementId: id, companyClientId: plIn.companyClientId },
          plIn.startDate,
        );
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, placement: projectPlacement(saved) }),
      });
    }

    if (action === 'save_shifts') {
      const incoming = (Array.isArray(body.shifts) ? body.shifts : [body]) as Array<
        Partial<AgencyShift> & { workerId: string; companyClientId: string; workDate: string }
      >;
      const saved: AgencyShift[] = [];
      for (const sh of incoming) {
        if (!isAdmin && isPeriodPaid(sh.workerId, sh.workDate)) {
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: 'Period already paid and locked for edits', code: 'period_locked' }),
          });
        }
        const exIdx = shifts.findIndex(
          (s) => s.workerId === sh.workerId && s.workDate === sh.workDate && s.companyClientId === sh.companyClientId,
        );
        const prevStatus = exIdx >= 0 ? shifts[exIdx].status : null;
        const status = sh.status || 'scheduled';
        const hours = status === 'sick' || status === 'absent' ? 0 : Number(sh.hours ?? 0);
        const ot = status === 'sick' || status === 'absent' ? 0 : Number(sh.overtimeHours ?? 0);
        const row: AgencyShift = {
          id: exIdx >= 0 ? shifts[exIdx].id : sh.id || nextId('agsh'),
          workerId: sh.workerId,
          placementId: sh.placementId ?? null,
          companyClientId: sh.companyClientId,
          workplaceId: sh.workplaceId ?? null,
          workDate: sh.workDate,
          shiftTemplateId: sh.shiftTemplateId ?? null,
          shiftLabel: sh.shiftLabel || '',
          startTime: sh.startTime || '',
          endTime: sh.endTime || '',
          hours,
          overtimeHours: ot,
          status,
          sickNote: sh.sickNote || '',
          notes: sh.notes || '',
        };
        if (exIdx >= 0) shifts[exIdx] = row;
        else shifts.push(row);

        if (status === 'sick' && prevStatus !== 'sick') {
          appendTimeline(sh.workerId, 'sick_leave', `Sick leave logged (${sh.workDate})`, row.sickNote, {}, sh.workDate);
        } else if (status === 'worked' && prevStatus !== 'worked') {
          appendTimeline(sh.workerId, 'work_log', `${sh.workDate}: ${row.shiftLabel} ${hours + ot}h`.trim(), '', {}, sh.workDate);
        }
        saved.push(row);
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, shifts: saved }) });
    }

    if (action === 'delete_shift') {
      const id = String(body.id || url.searchParams.get('id') || '');
      const idx = shifts.findIndex((s) => s.id === id);
      if (idx >= 0) {
        if (!isAdmin && isPeriodPaid(shifts[idx].workerId, shifts[idx].workDate)) {
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Period locked' }) });
        }
        shifts.splice(idx, 1);
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }

    if (action === 'calculate_payment') {
      if (!canPayments) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Forbidden' }) });
      }
      const calculated = calcPaymentData(String(body.workerId || ''), String(body.periodYm || ''));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, calculated }) });
    }

    if (action === 'save_payment') {
      if (!canPayments) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Forbidden' }) });
      }
      const pIn = (body.payment || body) as Partial<AgencyPayment> & { workerId: string; periodYm: string };
      const idx = payments.findIndex((p) => (pIn.id ? p.id === pIn.id : p.workerId === pIn.workerId && p.periodYm === pIn.periodYm));
      const existing = idx >= 0 ? payments[idx] : null;
      const id = existing ? existing.id : pIn.id || nextId('agpay');
      const items = pIn.items || existing?.items || [];
      const basePay = Number(pIn.basePay ?? existing?.basePay ?? 0);
      const totals = computePaymentTotals(basePay, items, Number(pIn.billableTotal ?? existing?.billableTotal ?? 0));
      const status = pIn.status || existing?.status || 'draft';
      const frId = settings.autoCreateExpense ? existing?.financialRecordId || `fr-ag-${id}` : existing?.financialRecordId ?? null;
      const saved: AgencyPayment = {
        id,
        workerId: pIn.workerId,
        placementId: pIn.placementId ?? existing?.placementId ?? null,
        companyClientId: pIn.companyClientId ?? existing?.companyClientId ?? null,
        periodYm: pIn.periodYm,
        regularHours: Number(pIn.regularHours ?? existing?.regularHours ?? 0),
        overtimeHours: Number(pIn.overtimeHours ?? existing?.overtimeHours ?? 0),
        sickDays: Number(pIn.sickDays ?? existing?.sickDays ?? 0),
        basePay,
        items,
        grossPay: totals.grossPay,
        deductionsTotal: totals.deductionsTotal,
        netPay: totals.netPay,
        paidAmount: status === 'paid' ? totals.netPay : Number(pIn.paidAmount ?? 0),
        billableTotal: Number(pIn.billableTotal ?? existing?.billableTotal ?? 0),
        currency: pIn.currency || existing?.currency || settings.defaultCurrency || 'EUR',
        status,
        paidAt: status === 'paid' ? pIn.paidAt || new Date().toISOString().slice(0, 10) : null,
        financialRecordId: frId,
        notes: pIn.notes ?? existing?.notes ?? '',
        updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      if (existing) payments[idx] = saved;
      else payments.unshift(saved);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, payment: saved }) });
    }

    if (action === 'create_client_billing_record') {
      const companyClientId = String(body.companyClientId || '');
      const periodYm = String(body.periodYm || '');
      const amount = payments
        .filter((p) => p.companyClientId === companyClientId && p.periodYm === periodYm)
        .reduce((s, p) => s + p.billableTotal, 0);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          financialRecordId: `fr-ag-bill-${companyClientId}-${periodYm}`,
          amount,
        }),
      });
    }

    if (action === 'save_settings') {
      const next = (body.settings || body) as AgencySettings;
      settings = { ...settings, ...next };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, settings }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  return {
    getState: () => ({ settings, workers, workplaces, placements, shifts, payments, checklists, timelines }),
  };
}
