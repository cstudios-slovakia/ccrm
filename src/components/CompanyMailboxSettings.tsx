import React, { useCallback, useEffect, useState } from "react";
import { SectionCard } from "./settings/SectionCard";
import { AlertCircle, CheckCircle2, Pencil, Play, Plus, RefreshCw, X } from "lucide-react";
import type { UserProfile } from "../types";
import type { Language } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import {
  SECRET_MASK,
  backlogSummary,
  deleteMailbox,
  draftFromMailbox,
  emptyMailboxDraft,
  listMailboxes,
  runMailbox,
  saveMailbox,
  testMailbox,
  type CompanyMailbox,
  type MailboxDraft,
  type MailboxList,
} from "../utils/companyMailboxes";

/*
  ── COMPANY MAILBOXES ───────────────────────────────────

  Shared mailboxes (info@, steel@, ...) an admin defines once. A background job reads
  them, and every user's own mailbox, every few minutes and files each message from or
  to a known customer onto that customer's timeline, readable by everyone who may see
  the timeline. Admin only: the server refuses everyone else.
*/

interface CompanyMailboxSettingsProps {
  users: UserProfile[];
  userLanguage: Language;
}

const inputClass =
  "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui text-slate-800 focus:outline-none focus:border-indigo-500 disabled:bg-slate-50";
const labelClass = "type-overline text-slate-500 block mb-1";

export const CompanyMailboxSettings: React.FC<CompanyMailboxSettingsProps> = ({ users, userLanguage }) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const toast = (msg: string, variant?: "error" | "warning") =>
    (window as unknown as { showToast?: (m: string, v?: "error" | "warning") => void }).showToast?.(msg, variant);

  const [data, setData] = useState<MailboxList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MailboxDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "run" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listMailboxes();
      // An answer without the lists (an older backend, a mock) must not take the whole page down.
      setData({ ...list, mailboxes: list?.mailboxes ?? [], userMailboxes: list?.userMailboxes ?? [] });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = (next: Partial<MailboxDraft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const patchSettings = (next: Partial<MailboxDraft["settings"]>) =>
    setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...next } } : d));

  const openNew = () => {
    setDraft(emptyMailboxDraft());
    setFormError(null);
    setTestOk(null);
  };
  const openEdit = (box: CompanyMailbox) => {
    setDraft(draftFromMailbox(box));
    setFormError(null);
    setTestOk(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy("save");
    setFormError(null);
    try {
      await saveMailbox(draft);
      toast(t("Mailbox saved.", "Schránka bola uložená.", "A postafiók mentve."));
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    if (!draft) return;
    setBusy("test");
    setFormError(null);
    setTestOk(null);
    try {
      await testMailbox(draft);
      setTestOk(true);
    } catch (err) {
      setTestOk(false);
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRun = async (box: CompanyMailbox) => {
    setBusy("run");
    try {
      const r = await runMailbox(box.id);
      toast(
        t(
          `Checked ${r.run.seen ?? 0} message(s), filed ${r.run.filed ?? 0}.`,
          `Skontrolovaných ${r.run.seen ?? 0} správ, zaevidovaných ${r.run.filed ?? 0}.`,
          `${r.run.seen ?? 0} üzenet ellenőrizve, ${r.run.filed ?? 0} rögzítve.`,
        ),
      );
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (box: CompanyMailbox) => {
    try {
      await deleteMailbox(box.id);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  const ownerName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  const secureOptions = [
    { value: "ssl", label: "SSL / TLS" },
    { value: "tls", label: "STARTTLS" },
    { value: "none", label: t("None", "Žiadne", "Nincs") },
  ];

  return (
    <SectionCard
      title={t("Company mailboxes", "Firemné schránky", "Céges postafiókok")}
      description={t(
              "Shared mailboxes such as info@ or an order desk. Every few minutes the CRM reads them, and everyone's personal mailbox, and files each message from or to a known customer onto that customer's timeline, where everyone who may see it can read it.",
              "Spoločné schránky, napríklad info@ alebo objednávky. CRM ich každých pár minút načíta spolu s osobnými schránkami všetkých a každú správu od známeho zákazníka alebo jemu zaeviduje do jeho časovej osi, kde si ju prečíta každý, kto ju smie vidieť.",
              "Közös postafiókok, például az info@ vagy a rendeléskezelő. A CRM néhány percenként beolvassa őket és mindenki személyes postafiókját, és minden ismert ügyféltől érkező vagy neki küldött üzenetet az ügyfél idővonalán rögzít, ahol mindenki elolvashatja, aki láthatja.",
            )}
      action={!draft ? (
<button
            type="button"
            onClick={openNew}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-ui font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add mailbox", "Pridať schránku", "Postafiók hozzáadása")}
          </button>
) : undefined}
      testId="company-mailboxes"
    >
      {loadError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold">
          {loadError}
        </div>
      )}
      {data && !data.imapAvailable && (
        <div role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-ui font-semibold">
          {t(
            "The PHP IMAP extension is not available on this server, so no mailbox can be read.",
            "Na tomto serveri nie je dostupné rozšírenie PHP IMAP, preto sa nedá načítať žiadna schránka.",
            "Ezen a szerveren nem érhető el a PHP IMAP kiterjesztés, ezért egyetlen postafiók sem olvasható be.",
          )}
        </div>
      )}

      {/* ---- the form ---- */}
      {draft && (
        <form onSubmit={handleSave} className="space-y-4 p-4 rounded-2xl border border-indigo-200 bg-indigo-50/30" data-testid="company-mailbox-form">
          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="cmb-name">{t("Name", "Názov", "Név")}</label>
              <input id="cmb-name" required className={inputClass} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Info" />
            </div>
            <div>
              <label className={labelClass} htmlFor="cmb-address">{t("Address", "Adresa", "Cím")}</label>
              <input id="cmb-address" required type="email" className={inputClass} value={draft.address} onChange={(e) => patch({ address: e.target.value })} placeholder="info@company.sk" />
            </div>
          </div>

          <div className="grid grid-cols-1 ws-md:grid-cols-4 gap-3">
            <div className="ws-md:col-span-2">
              <label className={labelClass} htmlFor="cmb-imap-host">{t("IMAP server", "Server IMAP", "IMAP szerver")}</label>
              <input id="cmb-imap-host" required className={inputClass} value={draft.settings.imapHost} onChange={(e) => patchSettings({ imapHost: e.target.value })} placeholder="imap.company.sk" />
            </div>
            <div>
              <label className={labelClass} htmlFor="cmb-imap-port">{t("Port", "Port", "Port")}</label>
              <input id="cmb-imap-port" required className={inputClass} value={draft.settings.imapPort} onChange={(e) => patchSettings({ imapPort: e.target.value })} inputMode="numeric" />
            </div>
            <div>
              <label className={labelClass}>{t("Encryption", "Šifrovanie", "Titkosítás")}</label>
              <CustomSelect value={draft.settings.imapSecure} onChange={(v) => patchSettings({ imapSecure: v as "ssl" | "tls" | "none" })} options={secureOptions} />
            </div>
          </div>

          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="cmb-imap-user">{t("Login", "Prihlasovacie meno", "Felhasználónév")}</label>
              <input id="cmb-imap-user" required autoComplete="off" className={inputClass} value={draft.settings.imapUsername} onChange={(e) => patchSettings({ imapUsername: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cmb-imap-pass">{t("Password", "Heslo", "Jelszó")}</label>
              <input
                id="cmb-imap-pass"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={draft.settings.imapPassword}
                onChange={(e) => patchSettings({ imapPassword: e.target.value, smtpPassword: draft.settings.smtpPassword === draft.settings.imapPassword ? e.target.value : draft.settings.smtpPassword })}
                placeholder={draft.id ? t("Unchanged", "Nezmenené", "Változatlan") : ""}
              />
              {draft.settings.imapPassword === SECRET_MASK && (
                <p className="text-micro text-slate-400 mt-1">{t("The saved password is kept unless you type a new one.", "Uložené heslo sa zachová, kým nezadáte nové.", "A mentett jelszó megmarad, amíg újat nem ír be.")}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 ws-md:grid-cols-4 gap-3">
            <div className="ws-md:col-span-2">
              <label className={labelClass} htmlFor="cmb-smtp-host">{t("SMTP server (to send)", "Server SMTP (odosielanie)", "SMTP szerver (küldéshez)")}</label>
              <input id="cmb-smtp-host" className={inputClass} value={draft.settings.smtpHost} onChange={(e) => patchSettings({ smtpHost: e.target.value })} placeholder="smtp.company.sk" />
            </div>
            <div>
              <label className={labelClass} htmlFor="cmb-smtp-port">{t("Port", "Port", "Port")}</label>
              <input id="cmb-smtp-port" className={inputClass} value={draft.settings.smtpPort} onChange={(e) => patchSettings({ smtpPort: e.target.value })} inputMode="numeric" />
            </div>
            <div>
              <label className={labelClass}>{t("Encryption", "Šifrovanie", "Titkosítás")}</label>
              <CustomSelect value={draft.settings.smtpSecure} onChange={(v) => patchSettings({ smtpSecure: v as "ssl" | "tls" | "none" })} options={secureOptions} />
            </div>
          </div>

          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("Owner (optional)", "Vlastník (voliteľné)", "Tulajdonos (opcionális)")}</label>
              <CustomSelect
                value={draft.ownerUserId}
                onChange={(v) => patch({ ownerUserId: v })}
                options={[{ value: "", label: t("Nobody in particular", "Nikto konkrétny", "Senki különösebben") }, ...users.filter((u) => u.id).map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cmb-since">{t("File mail from this date on", "Evidovať poštu od dátumu", "Levelek rögzítése ettől a dátumtól")}</label>
              <input id="cmb-since" type="date" className={inputClass} value={draft.backfillSince} onChange={(e) => patch({ backfillSince: e.target.value })} />
              <p className="text-micro text-slate-400 mt-1">{t("Older mail is skipped. Leave empty to catch up on everything; the backlog is filed in small steps, newest first.", "Staršia pošta sa preskočí. Prázdne = všetko; staré správy sa dopĺňajú po malých dávkach, od najnovších.", "A régebbi levelek kimaradnak. Üresen minden; a régi levelek kis lépésekben, a legújabbakkal kezdve kerülnek fel.")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-ui font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => patch({ isActive: e.target.checked })} />
              {t("Active", "Aktívna", "Aktív")}
            </label>
            <label className="flex items-center gap-2 text-ui font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={draft.settings.imapAllowSelfSigned} onChange={(e) => patchSettings({ imapAllowSelfSigned: e.target.checked })} />
              {t("Accept a self-signed certificate", "Prijať certifikát podpísaný sebou samým", "Önaláírt tanúsítvány elfogadása")}
            </label>
          </div>

          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-ui font-semibold flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{formError}</span>
            </div>
          )}
          {testOk && (
            <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-ui font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("The connection works.", "Spojenie funguje.", "A kapcsolat működik.")}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy !== null} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-ui font-bold transition-all disabled:opacity-60 cursor-pointer">
              {busy === "save" ? t("Saving…", "Ukladá sa…", "Mentés…") : t("Save mailbox", "Uložiť schránku", "Postafiók mentése")}
            </button>
            <button type="button" onClick={handleTest} disabled={busy !== null} className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-ui font-bold transition-all disabled:opacity-60 cursor-pointer">
              {busy === "test" ? t("Testing…", "Testuje sa…", "Tesztelés…") : t("Test connection", "Otestovať spojenie", "Kapcsolat tesztelése")}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="px-4 py-2.5 text-slate-500 hover:text-slate-700 rounded-xl text-ui font-bold cursor-pointer">
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
          </div>
        </form>
      )}

      {/* ---- the list ---- */}
      {data && data.mailboxes.length === 0 && !draft && (
        <p className="text-ui text-slate-500 italic">{t("No company mailboxes yet.", "Zatiaľ nie sú žiadne firemné schránky.", "Még nincsenek céges postafiókok.")}</p>
      )}
      <div className="space-y-3">
        {(data?.mailboxes ?? []).map((box) => {
          const progress = backlogSummary(box.folders);
          const owner = ownerName(box.ownerUserId);
          return (
            <div key={box.id} data-testid={`company-mailbox-${box.id}`} className="p-4 rounded-2xl border border-slate-200 bg-white/70 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ui font-bold text-slate-900">{box.name}</span>
                    <span className="text-ui text-slate-500">{box.address}</span>
                    {!box.isActive && <span className="type-overline px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-500">{t("Inactive", "Neaktívna", "Inaktív")}</span>}
                    {owner && <span className="type-overline px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">{owner}</span>}
                  </div>
                  <p className="text-caption text-slate-500 mt-0.5">
                    {box.lastSuccessAt
                      ? `${t("Last read", "Naposledy načítané", "Utoljára beolvasva")}: ${box.lastSuccessAt}`
                      : t("Not read yet — it is picked up by the next scheduled run.", "Zatiaľ nenačítané — načíta sa pri ďalšom plánovanom behu.", "Még nem olvastuk be — a következő ütemezett futás veszi fel.")}
                    {progress.started && ` · ${t("filed", "zaevidované", "rögzítve")}: ${progress.filed}`}
                    {progress.started && !progress.caughtUp && ` · ${t("older mail is still being filed", "staršia pošta sa ešte dopĺňa", "a régebbi levelek még feldolgozás alatt")}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleRun(box)} disabled={busy !== null} title={t("Read this mailbox now", "Načítať schránku teraz", "Postafiók beolvasása most")} className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 cursor-pointer">
                    {busy === "run" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => openEdit(box)} title={t("Edit", "Upraviť", "Szerkesztés")} className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <HoldToConfirmButton
                    tone="danger"
                    lang={userLanguage}
                    what={box.name}
                    onConfirm={() => handleDelete(box)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title={t("Remove mailbox (mail already filed stays)", "Odstrániť schránku (už zaevidovaná pošta zostane)", "Postafiók eltávolítása (a már rögzített levelek megmaradnak)")}
                  >
                    <X className="h-4 w-4" />
                  </HoldToConfirmButton>
                </div>
              </div>
              {box.lastError && (
                <div role="alert" data-testid="company-mailbox-error" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-caption font-semibold flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{box.lastError}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* personal mailboxes are read by the same job: their problems belong on the same screen */}
      {data && data.userMailboxes.some((u) => u.folders.some((f) => f.lastError)) && (
        <div className="pt-2 space-y-2" data-testid="user-mailbox-errors">
          <p className="type-overline text-slate-500">{t("Personal mailboxes that could not be read", "Osobné schránky, ktoré sa nepodarilo načítať", "Nem olvasható személyes postafiókok")}</p>
          {data.userMailboxes
            .filter((u) => u.folders.some((f) => f.lastError))
            .map((u) => (
              <div key={u.id} className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-caption font-semibold">
                {u.name} ({u.email}): {u.folders.find((f) => f.lastError)?.lastError}
              </div>
            ))}
        </div>
      )}
    </SectionCard>
  );
};
