import React, { useMemo, useState } from "react";
import { GripVertical, Lock, Plus, Tag, X } from "lucide-react";
import type { InvoiceOffer } from "../types";
import type { Language } from "../utils/translations";
import {
  OFFER_STATUS_GROUPS,
  NEW_OFFER_STATUS_COLOR,
  defaultOfferStatus,
  offerStatusKeyFor,
  offerStatusLabel,
  type OfferStatusDef,
  type OfferStatusGroup,
} from "../utils/offerStatuses";
import { todayLocal } from "../utils/localTime";
import { ColorPicker } from "./ui/ColorPicker";
import { CustomSelect } from "./ui/CustomSelect";
import { InlineRenameName } from "./ui/InlineRenameName";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { runUndoable } from "../utils/undoable";
import { reinsertAt } from "../utils/undoableList";
import { singleMessage, undoLabel } from "../utils/undoMessages";

/*
  ── OFFER STATUSES EDITOR ───────────────────────────────

  The price-offer counterpart of ProjectStatusSettings, built the same way: the
  statuses sit under one divider per group, and dragging a row across a divider
  moves it into that group. A status is renamed in place and recoloured from its
  dot. What a group means is in utils/offerStatuses.ts.

  It edits one of two lists: the price-offer statuses (`kind="offer"`, the
  default) or the one list proformas and invoices share (`kind="invoice"`).
  Only the wording, the documents counted as using a status, and the test ids
  differ.

  Deleting a status that offers still use asks where to move them first; an
  unused one just goes (with Undo). Renaming changes only the label, so the key
  an offer stores never moves and a rename rewrites no offer.
*/

interface OfferStatusSettingsProps {
  /** Which list this edits. */
  kind?: "offer" | "invoice";
  statuses: OfferStatusDef[];
  setStatuses: React.Dispatch<React.SetStateAction<OfferStatusDef[]>>;
  /** The whole shared document list: usage is counted over the price offers in it. */
  documents: InvoiceOffer[];
  setDocuments?: React.Dispatch<React.SetStateAction<InvoiceOffer[]>>;
  userLanguage: Language;
  canEdit: boolean;
}

type Row = { type: "divider"; group: OfferStatusGroup } | { type: "status"; def: OfferStatusDef };

export const OfferStatusSettings: React.FC<OfferStatusSettingsProps> = ({
  kind = "offer",
  statuses,
  setStatuses,
  documents,
  setDocuments,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const toast = (msg: string) => (window as unknown as { showToast?: (m: string) => void }).showToast?.(msg);
  const labelOf = (key: string) => offerStatusLabel(key, t, statuses);
  const isInvoice = kind === "invoice";
  /** The documents that sit on this list's statuses. */
  const usesList = (d: InvoiceOffer) => (isInvoice ? d.type === "invoice" || d.type === "proforma" : d.type === "price_offer");
  const tid = isInvoice ? "invoice-status" : "offer-status";

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<OfferStatusGroup>("open");
  /** The status whose offers are being re-homed before it is deleted, and where they go. */
  const [removing, setRemoving] = useState<{ def: OfferStatusDef; target: string } | null>(null);

  const groupInfo = (g: OfferStatusGroup): { name: string; desc: string; chip: string } => {
    if (isInvoice) {
      switch (g) {
        case "draft":
          return {
            name: t("Draft", "Návrh", "Piszkozat"),
            desc: t("Being prepared — where every new document starts", "Pripravuje sa — tu začína každý nový doklad", "Előkészületben — itt indul minden új bizonylat"),
            chip: "bg-slate-100 text-slate-700 border-slate-200",
          };
        case "open":
          return {
            name: t("Issued", "Vystavené", "Kiállítva"),
            desc: t("Sent, waiting to be settled", "Odoslané, čaká sa na vyrovnanie", "Elküldve, rendezésre vár"),
            chip: "bg-blue-50 text-blue-700 border-blue-200",
          };
        case "won":
          return {
            name: t("Invoiced", "Vyfakturované", "Kiszámlázva"),
            desc: t("Approved or invoiced — still expected income", "Schválené alebo vyfakturované — stále očakávaný príjem", "Jóváhagyva vagy kiszámlázva — továbbra is várt bevétel"),
            chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
          };
        case "lost":
          return {
            name: t("Rejected", "Zamietnuté", "Elutasítva"),
            desc: t("Turned down — no longer expected income", "Zamietnuté — už nie je očakávaný príjem", "Elutasítva — már nem várt bevétel"),
            chip: "bg-rose-50 text-rose-700 border-rose-200",
          };
        case "cancelled":
          return {
            name: t("Cancelled", "Zrušené", "Törölt"),
            desc: t("Withdrawn — no longer expected income", "Stiahnuté — už nie je očakávaný príjem", "Visszavonva — már nem várt bevétel"),
            chip: "bg-amber-50 text-amber-700 border-amber-200",
          };
      }
    }
    switch (g) {
      case "draft":
        return {
          name: t("Draft", "Návrh", "Piszkozat"),
          desc: t("Being prepared — where every new offer starts", "Pripravuje sa — tu začína každá nová ponuka", "Előkészületben — itt indul minden új ajánlat"),
          chip: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "open":
        return {
          name: t("Open", "Otvorené", "Nyitott"),
          desc: t("Sent, waiting for the client", "Odoslané, čaká sa na klienta", "Elküldve, az ügyfél válaszára várva"),
          chip: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "won":
        return {
          name: t("Won", "Vyhrané", "Megnyert"),
          desc: t("Accepted — counts as won in the win rate", "Prijaté — počíta sa ako vyhraté v úspešnosti", "Elfogadva — megnyertnek számít a nyerési arányban"),
          chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "lost":
        return {
          name: t("Lost", "Prehraté", "Elveszett"),
          desc: t("Rejected — counts as lost in the win rate", "Zamietnuté — počíta sa ako prehraté v úspešnosti", "Elutasítva — elveszettnek számít a nyerési arányban"),
          chip: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "cancelled":
        return {
          name: t("Cancelled", "Zrušené", "Törölt"),
          desc: t("Withdrawn — leaves the win rate", "Stiahnuté — nezapočítava sa do úspešnosti", "Visszavonva — kikerül a nyerési arányból"),
          chip: "bg-amber-50 text-amber-700 border-amber-200",
        };
    }
  };

  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((d) => {
      if (usesList(d) && d.status) counts[d.status] = (counts[d.status] || 0) + 1;
    });
    return counts;
  }, [documents]);

  // The table exactly as rendered: each group's divider followed by its statuses.
  const rows: Row[] = OFFER_STATUS_GROUPS.flatMap((group) => [
    { type: "divider" as const, group },
    ...statuses.filter((d) => d.group === group).map((def) => ({ type: "status" as const, def })),
  ]);

  const nameTaken = (name: string, exceptKey?: string) =>
    statuses.some((d) => d.key !== exceptKey && labelOf(d.key).toLowerCase() === name.toLowerCase());

  /** A new offer needs somewhere to start: at least one draft status that is not the legacy one. */
  const startersWithout = (key: string) => statuses.filter((d) => d.key !== key && d.group === "draft" && !d.legacy).length;

  /** Drops `key` at row `targetIdx`; the divider above it decides its group. */
  const handleMoveToIndex = (key: string, targetIdx: number) => {
    if (!canEdit) return;
    const items = [...rows];
    const from = items.findIndex((r) => r.type === "status" && r.def.key === key);
    if (from === -1) return;
    const [dragged] = items.splice(from, 1);
    items.splice(targetIdx, 0, dragged);

    const next: OfferStatusDef[] = [];
    let group: OfferStatusGroup = "draft";
    items.forEach((r) => {
      if (r.type === "divider") group = r.group;
      else next.push({ ...r.def, group });
    });
    if (!next.some((d) => d.group === "draft" && !d.legacy)) {
      toast(isInvoice ? t(
        "At least one Draft status must remain — that is where new documents start.",
        "Musí zostať aspoň jeden stav v skupine Návrh — tam začínajú nové doklady.",
        "Legalább egy Piszkozat állapotnak maradnia kell — ott indulnak az új bizonylatok.",
      ) : t(
        "At least one Draft status must remain — that is where new offers start.",
        "Musí zostať aspoň jeden stav v skupine Návrh — tam začínajú nové ponuky.",
        "Legalább egy Piszkozat állapotnak maradnia kell — ott indulnak az új ajánlatok.",
      ));
      return;
    }
    setStatuses(OFFER_STATUS_GROUPS.flatMap((g) => next.filter((d) => d.group === g)));
  };

  const handleRename = (key: string, raw: string) => {
    if (!canEdit) return;
    const label = raw.trim();
    if (!label || label === labelOf(key)) return;
    if (nameTaken(label, key)) {
      toast(t("This name already exists!", "Tento názov už existuje!", "Ez a név már létezik!"));
      return;
    }
    setStatuses((prev) => prev.map((d) => (d.key === key ? { ...d, label } : d)));
  };

  const handleColor = (key: string, color: string) => {
    if (!canEdit) return;
    setStatuses((prev) => prev.map((d) => (d.key === key ? { ...d, color } : d)));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const label = newName.trim();
    if (!label) return;
    if (nameTaken(label)) {
      toast(isInvoice
        ? t("This invoice status already exists!", "Tento stav dokladu už existuje!", "Ez a bizonylat-állapot már létezik!")
        : t("This offer status already exists!", "Tento stav ponuky už existuje!", "Ez az ajánlat-állapot már létezik!"));
      return;
    }
    // Keys still sitting on documents count as taken too, so a new status never
    // silently inherits the documents of one deleted earlier.
    const taken = [...statuses.map((d) => d.key), ...Object.keys(usage)];
    const def: OfferStatusDef = { key: offerStatusKeyFor(label, taken), label, color: NEW_OFFER_STATUS_COLOR, group: newGroup };
    setStatuses((prev) => OFFER_STATUS_GROUPS.flatMap((g) => [...prev, def].filter((d) => d.group === g)));
    setNewName("");
  };

  /** Removes the status; offers on it (if any) are moved to `target` first, and Undo moves exactly those back. */
  const removeStatus = (def: OfferStatusDef, target: string | null) => {
    const remaining = statuses.filter((d) => d.key !== def.key);
    const index = statuses.findIndex((d) => d.key === def.key);
    const moved = new Set(
      documents.filter((d) => usesList(d) && d.status === def.key).map((d) => d.id),
    );
    runUndoable({
      message: singleMessage(userLanguage, "status", "delete", labelOf(def.key)),
      undoLabel: undoLabel(userLanguage),
      apply: () => {
        setStatuses(remaining);
        if (moved.size > 0 && target && setDocuments) {
          const stamp = todayLocal();
          setDocuments((prev) =>
            prev.map((d) => (moved.has(d.id) && d.status === def.key ? { ...d, status: target, statusChangedAt: stamp } : d)),
          );
        }
      },
      revert: () => {
        setStatuses((prev) => reinsertAt(prev, [{ item: def, index }], (d) => d.key));
        if (moved.size > 0 && target && setDocuments) {
          setDocuments((prev) => prev.map((d) => (moved.has(d.id) && d.status === target ? { ...d, status: def.key } : d)));
        }
      },
    });
    setRemoving(null);
  };

  const handleRemove = (def: OfferStatusDef) => {
    if (!canEdit) return;
    if (def.group === "draft" && !def.legacy && startersWithout(def.key) === 0) {
      toast(isInvoice ? t(
        "At least one Draft status is required — that is where new documents start.",
        "Je potrebný aspoň jeden stav v skupine Návrh — tam začínajú nové doklady.",
        "Legalább egy Piszkozat állapot szükséges — ott indulnak az új bizonylatok.",
      ) : t(
        "At least one Draft status is required — that is where new offers start.",
        "Je potrebný aspoň jeden stav v skupine Návrh — tam začínajú nové ponuky.",
        "Legalább egy Piszkozat állapot szükséges — ott indulnak az új ajánlatok.",
      ));
      return;
    }
    if ((usage[def.key] || 0) > 0 && setDocuments) {
      // Offers sit on it: ask where they go. Same group first, else the start status.
      const remaining = statuses.filter((d) => d.key !== def.key);
      const sameGroup = remaining.find((d) => d.group === def.group && !d.legacy);
      setRemoving({ def, target: sameGroup?.key ?? defaultOfferStatus(remaining) });
      return;
    }
    removeStatus(def, null);
  };

  const removingCount = removing ? usage[removing.def.key] || 0 : 0;
  const targetOptions = removing
    ? statuses
        .filter((d) => d.key !== removing.def.key && !d.legacy)
        .map((d) => ({ value: d.key, label: `${labelOf(d.key)} — ${groupInfo(d.group).name}` }))
    : [];

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left" data-testid={`${tid}-settings`}>
      <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
        <Tag className="h-4.5 w-4.5 text-indigo-500" />
        {isInvoice
          ? t("Invoice & proforma statuses", "Stavy faktúr a zálohových faktúr", "Számla- és díjbekérő-állapotok")
          : t("Offer statuses", "Stavy cenových ponúk", "Árajánlat-állapotok")}
      </h3>

      <p className="type-overline text-slate-400">
        {isInvoice
          ? t(
              "One list for proformas and invoices. Drag statuses relative to the group dividers to reorder them and change their group; click the colour dot to recolour. The group decides the books: a Rejected or Cancelled invoice is no longer expected income in Finance.",
              "Jeden zoznam pre zálohové aj ostré faktúry. Presunutím stavov vzhľadom na oddeľovače skupín zmeníte poradie aj skupinu; kliknutím na farebný bod zmeníte farbu. Skupina rozhoduje o účtovníctve: zamietnutá alebo zrušená faktúra už vo Financiách nie je očakávaný príjem.",
              "Egy lista a díjbekérőknek és a számláknak. Húzza az állapotokat a csoportelválasztókhoz képest a sorrend és a csoport módosításához; a színes pontra kattintva módosíthatja a színt. A csoport dönt a könyvelésről: az Elutasított vagy Törölt számla a Pénzügyekben már nem várt bevétel.",
            )
          : t(
              "Drag statuses up or down relative to the group dividers to reorder them and change their group. Click a status's colour dot to change its colour. Won and Lost statuses decide the win rate. Proformas and invoices have a list of their own, below.",
              "Presunutím stavov nahor alebo nadol vzhľadom na oddeľovače skupín zmeníte ich poradie aj skupinu. Kliknutím na farebný bod zmeníte farbu stavu. Stavy Vyhrané a Prehraté určujú úspešnosť. Zálohové a ostré faktúry majú vlastný zoznam nižšie.",
              "Húzza az állapotokat a csoportelválasztókhoz képest fel vagy le a sorrend és a csoport módosításához. A színes pontra kattintva módosíthatja a színt. A Megnyert és Elveszett állapotok döntik el a nyerési arányt. A díjbekérőknek és a számláknak lentebb saját listájuk van.",
            )}
      </p>

      {removing && (
        <div
          role="alertdialog"
          aria-label={isInvoice
            ? t("Move documents before deleting", "Presunúť doklady pred zmazaním", "Bizonylatok áthelyezése törlés előtt")
            : t("Move offers before deleting", "Presunúť ponuky pred zmazaním", "Ajánlatok áthelyezése törlés előtt")}
          data-testid={`${tid}-reassign`}
          className="p-4 rounded-2xl border border-amber-200 bg-amber-50 space-y-3"
        >
          <p className="text-ui text-amber-900 font-semibold">
            {isInvoice
              ? t(
                  `${removingCount} invoice(s) or proforma(s) have the status “${labelOf(removing.def.key)}”. Where should they go before it is deleted?`,
                  `${removingCount} faktúr alebo zálohových faktúr má stav „${labelOf(removing.def.key)}“. Kam ich presunúť pred zmazaním?`,
                  `${removingCount} számla vagy díjbekérő állapota „${labelOf(removing.def.key)}”. Hová kerüljenek a törlés előtt?`,
                )
              : t(
                  `${removingCount} price offer(s) have the status “${labelOf(removing.def.key)}”. Where should they go before it is deleted?`,
                  `${removingCount} cenových ponúk má stav „${labelOf(removing.def.key)}“. Kam ich presunúť pred zmazaním?`,
                  `${removingCount} árajánlat állapota „${labelOf(removing.def.key)}”. Hová kerüljenek a törlés előtt?`,
                )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64 max-w-full">
              <CustomSelect
                value={removing.target}
                onChange={(v) => setRemoving((r) => (r ? { ...r, target: v } : r))}
                options={targetOptions}
              />
            </div>
            <button
              type="button"
              onClick={() => removeStatus(removing.def, removing.target)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-95"
            >
              {t("Move and delete", "Presunúť a zmazať", "Áthelyezés és törlés")}
            </button>
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-ui font-bold transition-all cursor-pointer active:scale-95"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
          </div>
        </div>
      )}

      <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-inner bg-white/50">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
              <th className="py-3 px-4 type-overline text-slate-500 w-12 text-center">{t("Drag", "Ťahať", "Húzás")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-44">{t("Colour", "Farba", "Szín")}</th>
              <th className="py-3 px-4 type-overline text-slate-500">{t("Status name", "Názov stavu", "Állapot neve")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-36">{t("Group", "Skupina", "Csoport")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">{isInvoice ? t("Documents", "Doklady", "Bizonylatok") : t("Offers", "Ponuky", "Ajánlatok")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-16 text-center">{t("Delete", "Zmazať", "Törlés")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isDragOver = dragOverIndex === idx;
              const onDragOver = (e: React.DragEvent) => {
                e.preventDefault();
                if (canEdit && draggedKey && (row.type === "divider" || row.def.key !== draggedKey)) setDragOverIndex(idx);
              };
              const onDrop = (e: React.DragEvent) => {
                e.preventDefault();
                setDragOverIndex(null);
                if (draggedKey) {
                  handleMoveToIndex(draggedKey, idx);
                  setDraggedKey(null);
                }
              };

              if (row.type === "divider") {
                const info = groupInfo(row.group);
                return (
                  <tr
                    key={`div-${row.group}`}
                    data-testid={`${tid}-divider-${row.group}`}
                    onDragOver={onDragOver}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={onDrop}
                    className={`transition-all border-b border-slate-200/60 duration-200 ${
                      isDragOver ? "bg-indigo-50/60 scale-[0.99] border-2 border-dashed border-indigo-300" : "bg-slate-100/70"
                    }`}
                  >
                    <td colSpan={6} className="py-3 px-4 select-none">
                      <div className="flex items-center gap-2">
                        <span className="type-overline text-slate-900">{info.name}</span>
                        <span className="text-micro text-slate-400 font-bold ml-1">{info.desc}</span>
                      </div>
                    </td>
                  </tr>
                );
              }

              const { def } = row;
              const label = labelOf(def.key);
              const info = groupInfo(def.group);
              const count = usage[def.key] || 0;
              return (
                <tr
                  key={`status-${def.key}`}
                  data-testid={`${tid}-row-${def.key}`}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDraggedKey(def.key)}
                  onDragEnd={() => {
                    setDraggedKey(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={onDragOver}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={onDrop}
                  className={`border-b border-slate-200/60 hover:bg-slate-50/50 transition-all duration-200 ${
                    isDragOver ? "bg-indigo-50/55 scale-[0.99] border-y-2 border-dashed border-indigo-300" : ""
                  }`}
                >
                  <td className="py-3 px-4 text-center align-middle">
                    {canEdit ? (
                      <GripVertical className="h-4 w-4 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing inline-block" />
                    ) : (
                      <Lock className="h-3 w-3 text-slate-300 inline-block" />
                    )}
                  </td>

                  <td className="py-3 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <ColorPicker
                          variant="ring"
                          value={def.color}
                          onChange={(next) => handleColor(def.key, next)}
                          title={t("Click to edit color", "Kliknutím upravíte farbu", "Kattintson a szín szerkesztéséhez")}
                        />
                      ) : (
                        <span className="h-3 w-3 rounded-full border border-slate-200 inline-block" style={{ backgroundColor: def.color }} />
                      )}
                      <span className="type-overline text-slate-400">{def.color}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 align-middle">
                    <InlineRenameName
                      value={label}
                      canEdit={canEdit}
                      onCommit={(next) => handleRename(def.key, next)}
                      renameTitle={t("Rename", "Premenovať", "Átnevezés")}
                    >
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-ui font-bold border"
                        style={{ backgroundColor: `${def.color}12`, color: def.color, borderColor: `${def.color}35` }}
                      >
                        {label}
                      </span>
                    </InlineRenameName>
                    {def.legacy && (
                      <span
                        className="ml-2 type-overline text-slate-400"
                        title={t(
                          "Kept for documents that already carry it; not offered when picking a status",
                          "Ponechaný pre doklady, ktoré ho už majú; pri výbere stavu sa neponúka",
                          "Azoknak a bizonylatoknak marad meg, amelyeknél már szerepel; választáskor nem jelenik meg",
                        )}
                      >
                        {t("legacy", "starý", "régi")}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 align-middle select-none">
                    <span className={`px-2.5 py-0.5 rounded-full type-overline border ${info.chip}`}>
                      {info.name}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center align-middle select-none">
                    <span className={`text-ui font-bold ${count ? "text-slate-700" : "text-slate-300"}`}>{count}</span>
                  </td>

                  <td className="py-3 px-4 text-center align-middle">
                    {canEdit ? (
                      <HoldToConfirmButton
                        tone="danger"
                        lang={userLanguage}
                        what={labelOf(def.key)}
                        onConfirm={() => handleRemove(def)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block"
                        title={t("Remove status", "Odstrániť stav", "Állapot eltávolítása")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </HoldToConfirmButton>
                    ) : (
                      <span className="type-overline text-slate-300 block select-none">{t("Locked", "Zamknuté", "Zárolt")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 max-w-lg pt-2 items-center">
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={isInvoice
              ? t("Add new invoice status...", "Pridať nový stav faktúry...", "Új számla-állapot hozzáadása...")
              : t("Add new offer status...", "Pridať nový stav ponuky...", "Új ajánlat-állapot hozzáadása...")}
            aria-label={isInvoice ? t("New invoice status", "Nový stav faktúry", "Új számla-állapot") : t("New offer status", "Nový stav ponuky", "Új ajánlat-állapot")}
            className="flex-1 min-w-37.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
          />
          <div className="w-40">
            <CustomSelect
              value={newGroup}
              onChange={(v) => setNewGroup(v as OfferStatusGroup)}
              options={OFFER_STATUS_GROUPS.map((g) => ({ value: g, label: groupInfo(g).name }))}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-ui font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add status", "Pridať stav", "Állapot hozzáadása")}
          </button>
        </form>
      )}
    </div>
  );
};
