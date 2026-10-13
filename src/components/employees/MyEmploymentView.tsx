import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  Download,
  FileText,
  Loader2,
  UserRound,
  UserX,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { formatTranslation, getTranslation } from "../../utils/translations";
import { formatMoney, formatNumber } from "../../utils/currency";
import { asLang } from "../../utils/undoMessages";
import { Page, PageHeader, Tabs, Surface, EmptyState, FormGrid, Field } from "../layout";
import type { TabItem } from "../layout";
import {
  cancelMyLeave,
  countWorkingDays,
  errorTranslationKey,
  fetchMyEmployment,
  fetchMyHours,
  isPendingLeave,
  requestMyLeave,
  updateMyContact,
  visibleTabs,
  type MyEmploymentOverview,
  type MyEmploymentTab,
  type MyHours,
} from "../../utils/myEmployment";

type LoadState =
  | { status: "loading" }
  | { status: "ok"; data: MyEmploymentOverview }
  | { status: "not_linked" }
  | { status: "forbidden" }
  | { status: "error"; code: string };

type Notice = { tone: "ok" | "error"; text: string } | null;

interface MyEmploymentViewProps {
  systemLanguage?: string;
  systemCurrency?: string;
}

const inputClass =
  "w-full px-4 py-2.5 text-body bg-white border border-slate-200 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62] shadow-sm disabled:bg-slate-50 disabled:text-slate-500";
const primaryButton =
  "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white text-ui font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const secondaryButton =
  "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-ui font-semibold hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

const statusBadge = (status: string): string => {
  if (status === "approved" || status === "paid" || status === "taken") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
};

export const MyEmploymentView: React.FC<MyEmploymentViewProps> = ({ systemLanguage = "en", systemCurrency = "EUR" }) => {
  const lang = asLang(systemLanguage);
  const tr = useCallback((key: string) => getTranslation(lang, key), [lang]);
  const locale = lang === "hu" ? "hu-HU" : lang === "sk" ? "sk-SK" : "en-GB";
  const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale) : "—");

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<MyEmploymentTab>("personal");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetchMyEmployment();
    // An answer without the identity and `can` blocks is not an overview (an old or foreign server):
    // show the error state instead of crashing on it.
    if (res.ok && (!res.data?.identity || !res.data?.can)) {
      setLoad({ status: "error", code: "generic" });
    } else if (res.ok) {
      setLoad({ status: "ok", data: res.data });
    } else if (res.code === "not_linked") {
      setLoad({ status: "not_linked" });
    } else if (res.code === "forbidden") {
      setLoad({ status: "forbidden" });
    } else {
      setLoad({ status: "error", code: res.code });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const data = load.status === "ok" ? load.data : null;
  const tabs = useMemo(() => (data ? visibleTabs(data.can) : []), [data]);

  // The first tab the person may see; follows the permissions if they change under us.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  const fail = (code: string) => setNotice({ tone: "error", text: tr(errorTranslationKey(code)) });

  // ---- personal / contact -------------------------------------------------------------
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState({ phone: "", addressStreet: "", addressCity: "", addressZip: "", addressCountry: "" });

  const startEditContact = () => {
    const p = data?.personal;
    setContact({
      phone: p?.phone ?? "",
      addressStreet: p?.addressStreet ?? "",
      addressCity: p?.addressCity ?? "",
      addressZip: p?.addressZip ?? "",
      addressCountry: p?.addressCountry ?? "",
    });
    setNotice(null);
    setEditingContact(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await updateMyContact(contact);
    setBusy(false);
    if (!res.ok) return fail(res.code);
    setEditingContact(false);
    setNotice({ tone: "ok", text: tr("myEmployment.personal.saved") });
    await reload();
  };

  // ---- leave --------------------------------------------------------------------------
  const [leaveForm, setLeaveForm] = useState({ vacationTypeId: "", startDate: "", endDate: "", note: "" });
  const leaveTypes = data?.leave?.types ?? [];
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? id;
  const typeColor = (id: string) => leaveTypes.find((t) => t.id === id)?.color ?? "#94a3b8";
  const previewDays = countWorkingDays(leaveForm.startDate, leaveForm.endDate);

  useEffect(() => {
    if (leaveTypes.length > 0 && !leaveTypes.some((t) => t.id === leaveForm.vacationTypeId)) {
      setLeaveForm((f) => ({ ...f, vacationTypeId: leaveTypes[0].id }));
    }
  }, [leaveTypes, leaveForm.vacationTypeId]);

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await requestMyLeave({
      vacationTypeId: leaveForm.vacationTypeId,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      note: leaveForm.note.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) return fail(res.code);
    setLeaveForm((f) => ({ ...f, startDate: "", endDate: "", note: "" }));
    setNotice({ tone: "ok", text: tr("myEmployment.leave.submitted") });
    await reload();
  };

  const cancelLeave = async (id: string) => {
    setBusy(true);
    const res = await cancelMyLeave(id);
    setBusy(false);
    if (!res.ok) return fail(res.code);
    setNotice({ tone: "ok", text: tr("myEmployment.leave.cancelled") });
    await reload();
  };

  // ---- hours --------------------------------------------------------------------------
  const today = new Date();
  const [hoursMonth, setHoursMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [hours, setHours] = useState<
    { status: "idle" | "loading" } | { status: "none" } | { status: "error"; code: string } | { status: "ok"; data: MyHours }
  >({ status: "idle" });

  useEffect(() => {
    if (tab !== "hours" || !data?.can.hours) return;
    let cancelled = false;
    setHours({ status: "loading" });
    fetchMyHours(hoursMonth.year, hoursMonth.month).then((res) => {
      if (cancelled) return;
      if (!res.ok) return setHours({ status: "error", code: res.code });
      if (res.data.no_user_attached) return setHours({ status: "none" });
      setHours({ status: "ok", data: res.data as unknown as MyHours });
    });
    return () => {
      cancelled = true;
    };
  }, [tab, data?.can.hours, hoursMonth.year, hoursMonth.month]);

  const shiftMonth = (delta: number) => {
    setHoursMonth(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };

  // ---- rendering ----------------------------------------------------------------------
  const header = (
    <PageHeader
      icon={<UserRound className="text-[#9e7638]" />}
      title={tr("myEmployment.title")}
      subtitle={tr("myEmployment.subtitle")}
    />
  );

  if (load.status === "loading") {
    return (
      <Page>
        {header}
        <div className="flex items-center gap-2 text-slate-500 type-body" data-testid="my-employment-loading">
          <Loader2 className="size-4 animate-spin" /> {tr("myEmployment.loading")}
        </div>
      </Page>
    );
  }

  if (load.status === "not_linked") {
    return (
      <Page>
        {header}
        <Surface>
          <EmptyState
            icon={<UserX />}
            title={tr("myEmployment.not_linked.title")}
            body={tr("myEmployment.not_linked.body")}
          />
        </Surface>
        <span data-testid="my-employment-not-linked" className="sr-only">not_linked</span>
      </Page>
    );
  }

  if (load.status === "forbidden") {
    return (
      <Page>
        {header}
        <Surface>
          <EmptyState icon={<ShieldAlert />} title={tr("myEmployment.forbidden.title")} body={tr("myEmployment.forbidden.body")} />
        </Surface>
      </Page>
    );
  }

  if (load.status === "error") {
    return (
      <Page>
        {header}
        <Surface>
          <EmptyState
            icon={<ShieldAlert />}
            title={tr("myEmployment.error.title")}
            body={tr(errorTranslationKey(load.code))}
            action={
              <button type="button" className={secondaryButton} onClick={() => { setLoad({ status: "loading" }); void reload(); }}>
                {tr("myEmployment.retry")}
              </button>
            }
          />
        </Surface>
      </Page>
    );
  }

  const overview = load.data;
  const tabIcons: Record<MyEmploymentTab, React.ReactNode> = {
    personal: <UserRound />,
    payroll: <Wallet />,
    leave: <CalendarDays />,
    documents: <FileText />,
    hours: <Clock />,
  };
  const tabItems: TabItem<MyEmploymentTab>[] = tabs.map((key) => ({ key, label: tr(`myEmployment.tab.${key}`), icon: tabIcons[key] }));

  const readOnlyNote = (
    <p className="type-meta text-slate-500" data-testid="my-employment-readonly">
      {tr("myEmployment.readonly")}
    </p>
  );

  const field = (label: string, value: string | null | undefined, mono = false) => (
    <div className="min-w-0">
      <dt className="type-label text-slate-500">{label}</dt>
      <dd className={`type-body text-slate-900 break-words ${mono ? "font-mono" : ""}`}>{value && value.trim() !== "" ? value : "—"}</dd>
    </div>
  );

  return (
    <Page>
      <div data-testid="my-employment-page" className="contents">
        {header}

        {tabs.length === 0 ? (
          <Surface>
            <EmptyState icon={<ShieldAlert />} title={tr("myEmployment.forbidden.title")} body={tr("myEmployment.forbidden.body")} />
          </Surface>
        ) : (
          <>
            <Tabs items={tabItems} value={tab} onChange={(k) => { setTab(k); setNotice(null); }} testId="my-employment-tabs" />

            {notice && (
              <div
                role="status"
                data-testid="my-employment-notice"
                className={`rounded-2xl border px-4 py-3 type-body ${
                  notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {notice.text}
              </div>
            )}

            {tab === "personal" && overview.personal && (
              <Surface>
                <div className="flex flex-col gap-5">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 ws-md:grid-cols-2">
                    {field(tr("myEmployment.personal.name"), overview.identity.name)}
                    {field(tr("myEmployment.personal.email"), overview.identity.email)}
                    {field(tr("myEmployment.personal.pin"), overview.personal.pin, true)}
                  </dl>

                  <div className="border-t border-slate-100 pt-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="type-card-title text-slate-900">{tr("myEmployment.personal.contact")}</h3>
                        <p className="type-meta text-slate-500">{overview.can.editProfile ? tr("myEmployment.personal.contact_hint") : tr("myEmployment.readonly")}</p>
                      </div>
                      {overview.can.editProfile && !editingContact && (
                        <button type="button" className={secondaryButton} onClick={startEditContact} data-testid="my-employment-edit-contact">
                          {tr("myEmployment.personal.edit")}
                        </button>
                      )}
                    </div>

                    {editingContact && overview.can.editProfile ? (
                      <form onSubmit={saveContact} data-testid="my-employment-contact-form" className="flex flex-col gap-4">
                        <FormGrid>
                          <Field label={tr("myEmployment.personal.phone")} htmlFor="me-phone">
                            <input id="me-phone" className={inputClass} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                          </Field>
                          <Field label={tr("myEmployment.personal.street")} htmlFor="me-street">
                            <input id="me-street" className={inputClass} value={contact.addressStreet} onChange={(e) => setContact({ ...contact, addressStreet: e.target.value })} />
                          </Field>
                          <Field label={tr("myEmployment.personal.city")} htmlFor="me-city">
                            <input id="me-city" className={inputClass} value={contact.addressCity} onChange={(e) => setContact({ ...contact, addressCity: e.target.value })} />
                          </Field>
                          <Field label={tr("myEmployment.personal.zip")} htmlFor="me-zip">
                            <input id="me-zip" className={inputClass} value={contact.addressZip} onChange={(e) => setContact({ ...contact, addressZip: e.target.value })} />
                          </Field>
                          <Field label={tr("myEmployment.personal.country")} htmlFor="me-country">
                            <input id="me-country" className={inputClass} value={contact.addressCountry} onChange={(e) => setContact({ ...contact, addressCountry: e.target.value })} />
                          </Field>
                        </FormGrid>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className={primaryButton} disabled={busy}>
                            {busy && <Loader2 className="size-4 animate-spin" />} {tr("myEmployment.personal.save")}
                          </button>
                          <button type="button" className={secondaryButton} onClick={() => setEditingContact(false)} disabled={busy}>
                            {tr("myEmployment.personal.cancel")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 ws-md:grid-cols-2">
                        {field(tr("myEmployment.personal.phone"), overview.personal.phone)}
                        {field(tr("myEmployment.personal.street"), overview.personal.addressStreet)}
                        {field(tr("myEmployment.personal.city"), overview.personal.addressCity)}
                        {field(tr("myEmployment.personal.zip"), overview.personal.addressZip)}
                        {field(tr("myEmployment.personal.country"), overview.personal.addressCountry)}
                      </dl>
                    )}
                  </div>
                </div>
              </Surface>
            )}

            {tab === "payroll" && overview.pay && (
              <div className="flex flex-col gap-4">
                <Surface>
                  <div className="grid grid-cols-1 gap-4 ws-md:grid-cols-2">
                    <div>
                      <div className="type-label text-slate-500">{tr("myEmployment.pay.rate")}</div>
                      <div className="type-metric text-slate-900" data-testid="my-employment-rate">
                        {formatMoney(overview.pay.salaryAmount, systemCurrency, lang)}{" "}
                        <span className="type-body text-slate-500">{tr(`myEmployment.pay.per.${overview.pay.salaryType}`)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="type-label text-slate-500">{tr("myEmployment.pay.due_day")}</div>
                      <div className="type-body text-slate-900">
                        {overview.pay.salaryDueDay != null
                          ? formatTranslation(lang, "myEmployment.pay.due_day_value", { day: String(overview.pay.salaryDueDay) })
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">{readOnlyNote}</div>
                </Surface>

                <Surface padding="none">
                  <div className="px-4 ws-sm:px-6 pt-4 ws-sm:pt-6 pb-2">
                    <h3 className="type-card-title text-slate-900">{tr("myEmployment.pay.records")}</h3>
                  </div>
                  {overview.pay.payroll.length === 0 ? (
                    <p className="px-4 ws-sm:px-6 pb-6 type-body text-slate-500">{tr("myEmployment.pay.empty")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left" data-testid="my-employment-payroll">
                        <thead>
                          <tr className="border-y border-slate-100 bg-slate-50 type-overline text-slate-500">
                            <th className="px-4 ws-sm:px-6 py-2">{tr("myEmployment.pay.period")}</th>
                            <th className="px-3 py-2 text-right">{tr("myEmployment.pay.total")}</th>
                            <th className="px-3 py-2 text-right">{tr("myEmployment.pay.paid")}</th>
                            <th className="px-3 py-2">{tr("myEmployment.pay.due")}</th>
                            <th className="px-4 ws-sm:px-6 py-2">{tr("myEmployment.pay.status")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.pay.payroll.map((row) => (
                            <tr key={row.id} className="border-b border-slate-100 type-body text-slate-800">
                              <td className="px-4 ws-sm:px-6 py-2.5 font-semibold">{row.periodKey}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.totalSalary, systemCurrency, lang)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.totalPaid, systemCurrency, lang)}</td>
                              <td className="px-3 py-2.5">{fmtDate(row.dueDate)}</td>
                              <td className="px-4 ws-sm:px-6 py-2.5">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 type-overline ${statusBadge(row.status)}`}>
                                  {tr(`myEmployment.pay.status.${row.status}`)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Surface>
              </div>
            )}

            {tab === "leave" && overview.leave && (
              <div className="flex flex-col gap-4">
                <Surface>
                  <h3 className="type-card-title text-slate-900 mb-3">{tr("myEmployment.leave.balances")}</h3>
                  <div className="grid grid-cols-1 gap-3 ws-md:grid-cols-2 ws-2xl:grid-cols-4" data-testid="my-employment-balances">
                    {overview.leave.balances.map((b) => {
                      const pct = b.allowance > 0 ? Math.min(100, Math.round((b.used / b.allowance) * 100)) : 0;
                      return (
                        <Surface tone="inset" key={b.typeId}>
                          <div className="flex items-center gap-2 type-label text-slate-700">
                            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: typeColor(b.typeId) }} />
                            <span className="truncate">{typeName(b.typeId)}</span>
                          </div>
                          <div className="type-body text-slate-900 mt-1 tabular-nums">
                            {formatNumber(b.used, lang)} / {formatNumber(b.allowance, lang)} {tr("myEmployment.leave.used")}
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
                            <div className="h-full rounded-full bg-slate-700" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="type-meta text-slate-500 mt-1">
                            {formatNumber(b.remaining, lang)} {tr("myEmployment.leave.remaining")}
                          </div>
                        </Surface>
                      );
                    })}
                  </div>
                </Surface>

                {overview.can.requestLeave && (
                  <Surface>
                    <h3 className="type-card-title text-slate-900 mb-3">{tr("myEmployment.leave.request")}</h3>
                    <form onSubmit={submitLeave} data-testid="my-employment-leave-form" className="flex flex-col gap-4">
                      <FormGrid>
                        <Field label={tr("myEmployment.leave.type")} htmlFor="me-leave-type">
                          <select
                            id="me-leave-type"
                            className={inputClass}
                            value={leaveForm.vacationTypeId}
                            onChange={(e) => setLeaveForm({ ...leaveForm, vacationTypeId: e.target.value })}
                          >
                            {leaveTypes.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </Field>
                        <div className="hidden ws-md:block" />
                        <Field label={tr("myEmployment.leave.start")} htmlFor="me-leave-start">
                          <input id="me-leave-start" type="date" required className={inputClass} value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                        </Field>
                        <Field label={tr("myEmployment.leave.end")} htmlFor="me-leave-end" hint={previewDays > 0 ? `${formatTranslation(lang, "myEmployment.leave.days", { days: String(previewDays) })} · ${tr("myEmployment.leave.working_days_hint")}` : tr("myEmployment.leave.working_days_hint")}>
                          <input id="me-leave-end" type="date" required min={leaveForm.startDate || undefined} className={inputClass} value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
                        </Field>
                        <Field label={tr("myEmployment.leave.note")} htmlFor="me-leave-note" span="full">
                          <textarea id="me-leave-note" rows={2} className={inputClass} value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} />
                        </Field>
                      </FormGrid>
                      <div>
                        <button type="submit" className={primaryButton} disabled={busy || !leaveForm.startDate || !leaveForm.endDate}>
                          {busy && <Loader2 className="size-4 animate-spin" />} {tr("myEmployment.leave.submit")}
                        </button>
                      </div>
                    </form>
                  </Surface>
                )}

                <Surface padding="none">
                  <div className="px-4 ws-sm:px-6 pt-4 ws-sm:pt-6 pb-2">
                    <h3 className="type-card-title text-slate-900">{tr("myEmployment.leave.requests")}</h3>
                  </div>
                  {overview.leave.requests.length === 0 ? (
                    <p className="px-4 ws-sm:px-6 pb-6 type-body text-slate-500">{tr("myEmployment.leave.empty")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100" data-testid="my-employment-leave-list">
                      {overview.leave.requests.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 ws-sm:px-6 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 type-body text-slate-900 font-semibold">
                              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: typeColor(r.vacationTypeId) }} />
                              <span className="truncate">{typeName(r.vacationTypeId)}</span>
                            </div>
                            <div className="type-meta text-slate-500">
                              {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {formatTranslation(lang, "myEmployment.leave.days", { days: formatNumber(r.daysCount, lang) })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 type-overline ${statusBadge(r.status)}`}>
                              {tr(`myEmployment.leave.status.${r.status}`)}
                            </span>
                            {overview.can.requestLeave && isPendingLeave(r.status) && (
                              <button type="button" className={secondaryButton} disabled={busy} onClick={() => void cancelLeave(r.id)}>
                                {tr("myEmployment.leave.cancel")}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Surface>
              </div>
            )}

            {tab === "documents" && overview.documents && (
              <Surface padding="none">
                {overview.documents.length === 0 ? (
                  <p className="p-6 type-body text-slate-500">{tr("myEmployment.docs.empty")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100" data-testid="my-employment-documents">
                    {overview.documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 ws-sm:px-6 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="size-9 shrink-0 inline-flex items-center justify-center rounded-xl bg-[#c29b62]/15 text-[#9e7638]">
                            <FileText className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="type-body text-slate-900 font-semibold truncate" title={d.name}>{d.name}</div>
                            <div className="type-meta text-slate-500">
                              {d.size ? `${(d.size / 1024).toFixed(1)} KB` : ""}
                              {d.size && d.uploadedAt ? " · " : ""}
                              {d.uploadedAt ? formatTranslation(lang, "myEmployment.docs.uploaded", { date: fmtDate(d.uploadedAt) }) : ""}
                            </div>
                          </div>
                        </div>
                        <a href={d.downloadUrl} target="_blank" rel="noreferrer" className={secondaryButton} title={tr("myEmployment.docs.open")}>
                          <Download className="size-4" />
                          <span className="hidden ws-sm:inline">{tr("myEmployment.docs.open")}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>
            )}

            {tab === "hours" && (
              <Surface>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <button type="button" className={secondaryButton} onClick={() => shiftMonth(-1)} aria-label={tr("myEmployment.hours.prev")} title={tr("myEmployment.hours.prev")}>
                    <ChevronLeft className="size-4" />
                  </button>
                  <div className="type-card-title text-slate-900 tabular-nums">
                    {new Date(hoursMonth.year, hoursMonth.month - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}
                  </div>
                  <button type="button" className={secondaryButton} onClick={() => shiftMonth(1)} aria-label={tr("myEmployment.hours.next")} title={tr("myEmployment.hours.next")}>
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                {hours.status === "loading" && (
                  <div className="flex items-center gap-2 text-slate-500 type-body"><Loader2 className="size-4 animate-spin" /> {tr("myEmployment.loading")}</div>
                )}
                {hours.status === "none" && <p className="type-body text-slate-500" data-testid="my-employment-no-tracker">{tr("myEmployment.hours.no_tracker")}</p>}
                {hours.status === "error" && <p className="type-body text-rose-700">{tr(errorTranslationKey(hours.code === "hours_unavailable" ? "hours_unavailable" : hours.code))}</p>}
                {hours.status === "ok" && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Surface tone="inset">
                        <div className="type-label text-slate-500">{tr("myEmployment.hours.total")}</div>
                        <div className="type-metric text-slate-900 tabular-nums">{formatNumber(hours.data?.total_hours ?? 0, lang)} h</div>
                      </Surface>
                      <Surface tone="inset">
                        <div className="type-label text-slate-500">{tr("myEmployment.hours.active_days")}</div>
                        <div className="type-metric text-slate-900 tabular-nums">{hours.data?.active_days ?? 0}</div>
                      </Surface>
                    </div>
                    <div>
                      <h3 className="type-card-title text-slate-900 mb-2">{tr("myEmployment.hours.daily")}</h3>
                      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                        {(hours.data?.daily_log ?? []).filter((d) => d.hours > 0).map((d) => (
                          <li key={d.date} className="flex items-center justify-between px-4 py-2 type-body text-slate-800">
                            <span>{fmtDate(d.date)} <span className="text-slate-400">{d.weekday}</span></span>
                            <span className="tabular-nums font-semibold">{formatNumber(d.hours, lang)} h</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Surface>
            )}
          </>
        )}
      </div>
    </Page>
  );
};
