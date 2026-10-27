import React, { useMemo, useState } from "react";
import { SectionCard } from "./settings/SectionCard";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { Lead, WarehouseItem } from "../types";
import type { Language } from "../utils/translations";
import { priceLevelIdFor, type PriceLevel } from "../utils/priceLevels";
import { InlineRenameName } from "./ui/InlineRenameName";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { runUndoable } from "../utils/undoable";
import { reinsertAt } from "../utils/undoableList";
import { singleMessage, undoLabel } from "../utils/undoMessages";

/*
  ── PRICE LEVELS EDITOR ─────────────────────────────────

  The named price lists ("Retail", "Wholesale", "Partner") an item can carry a
  price for, and a client can buy on. The list is only names and an order; the
  prices live on the items (Warehouse → item → Price levels) and the client's
  level on the client form. Renaming changes only the name, so no item and no
  client is rewritten. Deleting a level takes it off the clients that used it;
  the prices left on items are ignored from then on.
*/

interface PriceLevelSettingsProps {
  levels: PriceLevel[];
  setLevels: React.Dispatch<React.SetStateAction<PriceLevel[]>>;
  /** For "N items / N clients", and to take a deleted level off the clients that used it. */
  warehouseItems: WarehouseItem[];
  leads: Lead[];
  setLeads?: (updater: Lead[] | ((prev: Lead[]) => Lead[])) => void;
  userLanguage: Language;
  canEdit: boolean;
}

export const PriceLevelSettings: React.FC<PriceLevelSettingsProps> = ({
  levels,
  setLevels,
  warehouseItems,
  leads,
  setLeads,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const toast = (msg: string) => (window as unknown as { showToast?: (m: string) => void }).showToast?.(msg);
  const [newName, setNewName] = useState("");

  const usage = useMemo(() => {
    const items: Record<string, number> = {};
    for (const it of warehouseItems) {
      for (const [id, price] of Object.entries(it.priceLevels ?? {})) if (price > 0) items[id] = (items[id] || 0) + 1;
    }
    const clients: Record<string, number> = {};
    for (const l of leads) if (l.priceLevelId) clients[l.priceLevelId] = (clients[l.priceLevelId] || 0) + 1;
    return { items, clients };
  }, [warehouseItems, leads]);

  const nameTaken = (name: string, exceptId?: string) =>
    levels.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase());

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const name = newName.trim();
    if (!name) return;
    if (nameTaken(name)) {
      toast(t("This price level already exists!", "Táto cenová hladina už existuje!", "Ez az árszint már létezik!"));
      return;
    }
    // Ids still sitting on items or clients count as taken, so a new level never
    // silently inherits the prices of one deleted earlier.
    const taken = [...levels.map((l) => l.id), ...Object.keys(usage.items), ...Object.keys(usage.clients)];
    setLevels((prev) => [...prev, { id: priceLevelIdFor(name, taken), name }]);
    setNewName("");
  };

  const handleRename = (id: string, raw: string) => {
    if (!canEdit) return;
    const name = raw.trim();
    if (!name || levels.find((l) => l.id === id)?.name === name) return;
    if (nameTaken(name, id)) {
      toast(t("This name already exists!", "Tento názov už existuje!", "Ez a név már létezik!"));
      return;
    }
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
  };

  const handleMove = (id: string, delta: -1 | 1) => {
    if (!canEdit) return;
    setLevels((prev) => {
      const from = prev.findIndex((l) => l.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const handleRemove = (level: PriceLevel) => {
    if (!canEdit) return;
    const index = levels.findIndex((l) => l.id === level.id);
    const cleared = new Set(leads.filter((l) => l.priceLevelId === level.id).map((l) => l.id));
    runUndoable({
      message: singleMessage(userLanguage, "priceLevel", "delete", level.name),
      undoLabel: undoLabel(userLanguage),
      apply: () => {
        setLevels((prev) => prev.filter((l) => l.id !== level.id));
        if (cleared.size > 0 && setLeads) {
          setLeads((prev) => prev.map((l) => (cleared.has(l.id) ? { ...l, priceLevelId: null } : l)));
        }
      },
      revert: () => {
        setLevels((prev) => reinsertAt(prev, [{ item: level, index }], (l) => l.id));
        if (cleared.size > 0 && setLeads) {
          setLeads((prev) => prev.map((l) => (cleared.has(l.id) && !l.priceLevelId ? { ...l, priceLevelId: level.id } : l)));
        }
      },
    });
  };

  return (
    <SectionCard
      title={t("Price levels", "Cenové hladiny", "Árszintek")}
      description={t(
          "Named price lists, e.g. Retail, Wholesale, Partner. Set the price per level on each product (Warehouse), and the level a client buys on on the client's profile. A product without a price on that level uses its default sell price.",
          "Pomenované cenníky, napr. Maloobchod, Veľkoobchod, Partner. Cenu pre každú hladinu nastavíte na produkte (Sklad) a hladinu klienta v jeho profile. Tovar bez ceny na danej hladine použije svoju predvolenú predajnú cenu.",
          "Elnevezett árlisták, pl. Kiskereskedelem, Nagykereskedelem, Partner. Az árat szintenként a terméken (Raktár), az ügyfél szintjét az ügyfél profiljában állíthatja be. Az adott szinten ár nélküli termék az alapértelmezett eladási árát használja.",
        )}
      testId="price-level-settings"
    >
      {levels.length === 0 ? (
        <p className="text-ui text-slate-500 italic">{t("No price levels yet.", "Zatiaľ nie sú žiadne cenové hladiny.", "Még nincsenek árszintek.")}</p>
      ) : (
        <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-inner bg-white/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                <th className="py-3 px-4 type-overline text-slate-500 w-24 text-center">{t("Order", "Poradie", "Sorrend")}</th>
                <th className="py-3 px-4 type-overline text-slate-500">{t("Level name", "Názov hladiny", "Szint neve")}</th>
                <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">{t("Products", "Tovar", "Termékek")}</th>
                <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">{t("Clients", "Klienti", "Ügyfelek")}</th>
                <th className="py-3 px-4 type-overline text-slate-500 w-16 text-center">{t("Delete", "Zmazať", "Törlés")}</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level, idx) => (
                <tr key={level.id} data-testid={`price-level-row-${level.id}`} className="border-b border-slate-200/60 hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-center align-middle">
                    {canEdit && (
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMove(level.id, -1)}
                          title={t("Move up", "Posunúť vyššie", "Feljebb")}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === levels.length - 1}
                          onClick={() => handleMove(level.id, 1)}
                          title={t("Move down", "Posunúť nižšie", "Lejjebb")}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 align-middle">
                    <InlineRenameName
                      value={level.name}
                      canEdit={canEdit}
                      onCommit={(next) => handleRename(level.id, next)}
                      renameTitle={t("Rename", "Premenovať", "Átnevezés")}
                    >
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-ui font-bold border bg-indigo-50 text-indigo-700 border-indigo-200">
                        {level.name}
                      </span>
                    </InlineRenameName>
                  </td>
                  <td className="py-3 px-4 text-center align-middle select-none">
                    <span className={`text-ui font-bold ${usage.items[level.id] ? "text-slate-700" : "text-slate-300"}`}>{usage.items[level.id] || 0}</span>
                  </td>
                  <td className="py-3 px-4 text-center align-middle select-none">
                    <span className={`text-ui font-bold ${usage.clients[level.id] ? "text-slate-700" : "text-slate-300"}`}>{usage.clients[level.id] || 0}</span>
                  </td>
                  <td className="py-3 px-4 text-center align-middle">
                    {canEdit ? (
                      <HoldToConfirmButton
                        tone="danger"
                        lang={userLanguage}
                        what={level.name}
                        onConfirm={() => handleRemove(level)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block"
                        title={t("Remove price level", "Odstrániť cenovú hladinu", "Árszint eltávolítása")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </HoldToConfirmButton>
                    ) : (
                      <span className="type-overline text-slate-300 block select-none">{t("Locked", "Zamknuté", "Zárolt")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 max-w-lg pt-2 items-center">
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("Add new price level...", "Pridať novú cenovú hladinu...", "Új árszint hozzáadása...")}
            aria-label={t("New price level", "Nová cenová hladina", "Új árszint")}
            className="flex-1 min-w-37.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-ui font-bold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add level", "Pridať hladinu", "Szint hozzáadása")}
          </button>
        </form>
      )}
    </SectionCard>
  );
};
