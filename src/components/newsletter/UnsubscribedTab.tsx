import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { EmptyState, Surface } from "../layout";
import { useConfirmDialog } from "../ui/ConfirmDialog";
import { newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import { parseExtraAddresses } from "./audience";
import type { SuppressionRow } from "./types";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, HINT, LABEL, Loading, Notice, formatDate, useDebounced, type NewsletterEnv } from "./shared";

const PAGE = 50;

const reasonLabel = (r: SuppressionRow["reason"], t: NewsletterEnv["t"]) =>
  r === "unsubscribed"
    ? t("Unsubscribed", "Odhlásený", "Leiratkozott")
    : r === "bounced"
      ? t("Bounced", "Nedoručiteľný", "Visszapattant")
      : t("Added by hand", "Pridaný ručne", "Kézzel hozzáadva");

/** C12 list, Unsubscribed tab: the global suppression list. */
export const UnsubscribedTab = ({ env }: { env: NewsletterEnv }) => {
  const { t, language, canEdit } = env;
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: SuppressionRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirmDialog();

  useEffect(() => setOffset(0), [dq]);

  const load = useCallback(() => {
    setError(null);
    newsletterApi
      .suppressions({ q: dq || undefined, offset, limit: PAGE })
      .then(setData)
      .catch((e) => setError(newsletterErrorMessage(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, offset]);
  useEffect(load, [load]);

  const parsed = parseExtraAddresses(raw);

  const add = async () => {
    if (parsed.valid.length === 0) return;
    setBusy(true);
    try {
      const r = await newsletterApi.suppressionAdd(parsed.valid, note.trim() || undefined);
      window.showToast?.(t(`${r.added} added.`, `Pridaných: ${r.added}.`, `Hozzáadva: ${r.added}.`));
      setRaw("");
      setNote("");
      setAdding(false);
      load();
    } catch (e) {
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: SuppressionRow) => {
    const ok = await confirm({
      title: t("Remove from the unsubscribe list?", "Odstrániť zo zoznamu odhlásených?", "Eltávolítja a leiratkozottak listájáról?"),
      message: t(
        `${row.email} will receive newsletters again. Only re-subscribe someone who asked for it.`,
        `${row.email} bude opäť dostávať newslettre. Znova prihláste iba toho, kto o to požiadal.`,
        `${row.email} újra kap hírleveleket. Csak azt iratkoztassa fel újra, aki kérte.`,
      ),
      confirmLabel: t("Remove", "Odstrániť", "Eltávolítás"),
      cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
      danger: true,
    });
    if (!ok) return;
    try {
      await newsletterApi.suppressionRemove(row.email);
      load();
    } catch (e) {
      window.showToast?.(newsletterErrorMessage(e, t), "error");
    }
  };

  return (
    <div className="grid gap-4">
      {confirmNode}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search address", "Hľadať adresu", "Cím keresése")}
            className={`${FIELD} pl-9`}
          />
        </div>
        {canEdit && (
          <button type="button" className={BTN_PRIMARY} onClick={() => setAdding((v) => !v)} data-testid="newsletter-suppression-add">
            <Plus className="size-4" />
            {t("Add addresses", "Pridať adresy", "Címek hozzáadása")}
          </button>
        )}
      </div>

      {adding && (
        <Surface tone="inset">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className={LABEL}>{t("Addresses that must never receive newsletters", "Adresy, ktoré nikdy nemajú dostať newslettre", "Címek, amelyek soha nem kaphatnak hírlevelet")}</span>
              <textarea rows={3} value={raw} onChange={(e) => setRaw(e.target.value)} className={`${FIELD} h-auto py-2`} />
              <span className={HINT}>
                {t(`${parsed.valid.length} valid`, `${parsed.valid.length} platných`, `${parsed.valid.length} érvényes`)}
                {parsed.invalid.length > 0 && `, ${t(`${parsed.invalid.length} invalid`, `${parsed.invalid.length} neplatných`, `${parsed.invalid.length} érvénytelen`)}`}
              </span>
            </label>
            <label className="grid gap-1">
              <span className={LABEL}>{t("Note (optional)", "Poznámka (nepovinná)", "Megjegyzés (nem kötelező)")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
            </label>
            <div className="flex gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={busy || parsed.valid.length === 0} onClick={add}>
                {t("Add", "Pridať", "Hozzáadás")}
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)}>
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
            </div>
          </div>
        </Surface>
      )}

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !data ? (
        <Loading t={t} />
      ) : data.rows.length === 0 ? (
        <Surface>
          <EmptyState
            title={dq ? t("No address matches", "Žiadna adresa nevyhovuje", "Egy cím sem felel meg") : t("Nobody has unsubscribed", "Nikto sa neodhlásil", "Senki sem iratkozott le")}
            body={t(
              "Addresses on this list are skipped in every campaign.",
              "Adresy v tomto zozname sa vo všetkých kampaniach preskakujú.",
              "A lista címeit minden kampány kihagyja.",
            )}
          />
        </Surface>
      ) : (
        <Surface padding="none" className="overflow-x-auto">
          <table className="w-full min-w-160 text-left text-ui">
            <thead>
              <tr className="border-b border-slate-100 type-overline text-slate-500">
                <th className="px-4 py-3 font-semibold">{t("Address", "Adresa", "Cím")}</th>
                <th className="px-4 py-3 font-semibold">{t("Reason", "Dôvod", "Ok")}</th>
                <th className="px-4 py-3 font-semibold">{t("Campaign", "Kampaň", "Kampány")}</th>
                <th className="px-4 py-3 font-semibold">{t("Date", "Dátum", "Dátum")}</th>
                <th className="px-4 py-3 font-semibold">{t("By", "Zadal", "Rögzítette")}</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {r.email}
                    {r.note && <span className="block type-meta font-normal text-slate-500">{r.note}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{reasonLabel(r.reason, t)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.campaignName || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(r.createdAt, language)}</td>
                  <td className="px-4 py-3 text-slate-500">{r.createdBy || "-"}</td>
                  <td className="px-2 py-3">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        aria-label={t("Remove", "Odstrániť", "Eltávolítás")}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > PAGE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 type-meta text-slate-500">
              <span>
                {offset + 1}-{Math.min(offset + PAGE, data.total)} / {data.total}
              </span>
              <span className="flex gap-2">
                <button type="button" className={BTN_SECONDARY} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  {t("Previous", "Predošlé", "Előző")}
                </button>
                <button type="button" className={BTN_SECONDARY} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
                  {t("Next", "Ďalšie", "Következő")}
                </button>
              </span>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
};
