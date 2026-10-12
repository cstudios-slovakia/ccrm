import React, { useMemo, useState } from "react";
import { GripVertical, Plus, ShoppingCart, Tag, X, CheckCircle2 } from "lucide-react";
import type { Order } from "../types";
import type { Language } from "../utils/translations";
import {
  ORDER_STATUS_GROUPS,
  NEW_ORDER_STATUS_COLOR,
  defaultOrderStatus,
  orderStatusLabel,
  type OrderStatusDef,
  type OrderStatusGroup,
} from "../utils/orders";
import { ColorPicker } from "./ui/ColorPicker";
import { CustomSelect } from "./ui/CustomSelect";
import { InlineRenameName } from "./ui/InlineRenameName";

interface OrderStatusSettingsProps {
  statuses: OrderStatusDef[];
  setStatuses: React.Dispatch<React.SetStateAction<OrderStatusDef[]>>;
  orders?: Order[];
  setOrders?: (updater: Order[] | ((prev: Order[]) => Order[])) => void;
  userLanguage: Language;
  canEdit: boolean;
}

type Row = { type: "divider"; group: OrderStatusGroup } | { type: "status"; def: OrderStatusDef };

const isOpenGroup = (g: OrderStatusGroup) => g === "new" || g === "processing" || g === "shipped";

export const OrderStatusSettings: React.FC<OrderStatusSettingsProps> = ({
  statuses,
  setStatuses,
  orders = [],
  setOrders,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const toast = (msg: string) => (window as unknown as { showToast?: (m: string) => void }).showToast?.(msg);
  const labelOf = (key: string) => orderStatusLabel(key, t, statuses);

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<OrderStatusGroup>("processing");

  const groupInfo = (g: OrderStatusGroup): { name: string; desc: string; chip: string } => {
    switch (g) {
      case "new":
        return {
          name: t("New", "Nové objednávky", "Új rendelések"),
          desc: t("Where every incoming customer or guest order starts", "Tu začína každá nová objednávka od klienta alebo hosťa", "Itt indul minden új rendelés"),
          chip: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "processing":
        return {
          name: t("Processing & Preparation", "Spracovanie a Príprava", "Feldolgozás és Előkészítés"),
          desc: t("Order is being assembled, packed, or waiting for stock", "Objednávka sa kompletizuje, balí alebo čaká na naskladnenie", "A rendelés összeállítása vagy csomagolása zajlik"),
          chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
        };
      case "shipped":
        return {
          name: t("Shipped / In Transit", "Odoslané / V preprave", "Kiszállítva / Úton"),
          desc: t("Handed over to courier, post, or pickup point", "Odovzdané kuriérovi, pošte alebo odbernému miestu", "Átadva a futárnak vagy csomagpontnak"),
          chip: "bg-cyan-50 text-cyan-700 border-cyan-200",
        };
      case "delivered":
        return {
          name: t("Delivered & Completed", "Doručené a Vybavené", "Kézbesítve és Teljesítve"),
          desc: t("Successfully received by customer — terminal state", "Úspešne prevzaté zákazníkom — finálny stav", "A vevő sikeresen átvette — záró állapot"),
          chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "cancelled":
        return {
          name: t("Cancelled / Returned", "Stornované a Reklamácie", "Törölt és Reklamáció"),
          desc: t("Cancelled, returned, or uncollected order — terminal state", "Stornovaná, vrátená alebo neprevzatá objednávka", "Törölt vagy visszaküldött rendelés"),
          chip: "bg-rose-50 text-rose-700 border-rose-200",
        };
    }
  };

  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.status) counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const rows: Row[] = ORDER_STATUS_GROUPS.flatMap((group) => [
    { type: "divider" as const, group },
    ...statuses.filter((d) => d.group === group).map((def) => ({ type: "status" as const, def })),
  ]);

  const nameTaken = (name: string, exceptKey?: string) =>
    statuses.some((d) => d.key !== exceptKey && labelOf(d.key).toLowerCase() === name.toLowerCase());

  const openCountWithout = (key: string) => statuses.filter((d) => d.key !== key && d.group === "new").length;

  const handleMoveToIndex = (key: string, targetIdx: number) => {
    if (!canEdit) return;
    const items = [...rows];
    const from = items.findIndex((r) => r.type === "status" && r.def.key === key);
    if (from === -1) return;

    const [dragged] = items.splice(from, 1);
    items.splice(targetIdx, 0, dragged);

    const next: OrderStatusDef[] = [];
    let group: OrderStatusGroup = "new";
    items.forEach((r) => {
      if (r.type === "divider") group = r.group;
      else next.push({ ...r.def, group });
    });

    if (!next.some((d) => d.group === "new")) {
      toast(t(
        "At least one status must stay in 'New' — that is where new orders start.",
        "Aspoň jeden stav musí zostať v skupine 'Nové' — tam začínajú nové objednávky.",
        "Legalább egy állapotnak az 'Új' csoportban kell maradnia — ott indulnak a rendelések."
      ));
      return;
    }
    setStatuses(ORDER_STATUS_GROUPS.flatMap((g) => next.filter((d) => d.group === g)));
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

  const handleToggleTerminal = (key: string) => {
    if (!canEdit) return;
    setStatuses((prev) =>
      prev.map((d) => (d.key === key ? { ...d, isTerminal: !d.isTerminal } : d))
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const label = newName.trim();
    if (!label) return;
    if (nameTaken(label)) {
      toast(t("This order status already exists!", "Tento stav objednávky už existuje!", "Ez a rendelés állapot már létezik!"));
      return;
    }

    const key = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `status_${Date.now()}`;

    const isTerminal = newGroup === "delivered" || newGroup === "cancelled";
    const def: OrderStatusDef = {
      key,
      label,
      color: NEW_ORDER_STATUS_COLOR,
      group: newGroup,
      isTerminal,
    };

    setStatuses((prev) => ORDER_STATUS_GROUPS.flatMap((g) => [...prev, def].filter((d) => d.group === g)));
    setNewName("");
  };

  const handleRemove = (def: OrderStatusDef) => {
    if (!canEdit) return;
    if (def.group === "new" && openCountWithout(def.key) === 0) {
      toast(t(
        "At least one status in 'New' is required.",
        "Je potrebný aspoň jeden stav v skupine 'Nové'.",
        "Legalább egy állapot szükséges az 'Új' csoportban."
      ));
      return;
    }
    const remaining = statuses.filter((d) => d.key !== def.key);
    const fallback = defaultOrderStatus(remaining);
    const inUse = usage[def.key] || 0;
    const name = labelOf(def.key);
    const fallbackName = orderStatusLabel(fallback, t, remaining);
    const question = inUse > 0
      ? t(
          `Remove the status "${name}"? ${inUse} order(s) in it will be moved to "${fallbackName}".`,
          `Odstrániť stav "${name}"? ${inUse} objednávok v ňom sa presunie do stavu "${fallbackName}".`,
          `Eltávolítja a(z) "${name}" állapotot? A benne lévő ${inUse} rendelés a(z) "${fallbackName}" állapotba kerül.`
        )
      : t(
          `Remove the status "${name}"?`,
          `Odstrániť stav "${name}"?`,
          `Eltávolítja a(z) "${name}" állapotot?`
        );
    if (!confirm(question)) return;
    setStatuses(remaining);
    if (inUse > 0 && setOrders) {
      setOrders((prev) => prev.map((o) => (o.status === def.key ? { ...o, status: fallback } : o)));
    }
  };

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
      <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
        <ShoppingCart className="h-4.5 w-4.5 text-indigo-500" />
        {t("Order Statuses (E-Shop & Pipeline)", "Stavy objednávok (E-shop & Obchod)", "Rendelés állapotok")}
      </h3>

      <p className="type-overline text-slate-400">
        {t(
          "Drag statuses up or down relative to the group dividers to change their lifecycle phase. Click a status colour dot to change its colour.",
          "Presunutím stavov nahor alebo nadol vzhľadom na oddeľovače skupín zmeníte fázu životného cyklu. Kliknutím na farebný bod zmeníte farbu stavu.",
          "Húzza az állapotokat a csoportelválasztókhoz képest a fázis módosításához. A színes pontra kattintva módosíthatja a színt."
        )}
      </p>

      <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-inner bg-white/50">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
              <th className="py-3 px-4 type-overline text-slate-500 w-12 text-center">{t("Drag", "Ťahať", "Húzás")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-44">{t("Colour", "Farba", "Szín")}</th>
              <th className="py-3 px-4 type-overline text-slate-500">{t("Status name", "Názov stavu", "Állapot neve")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-36">{t("Group", "Skupina", "Csoport")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">{t("Orders", "Objednávky", "Rendelések")}</th>
              <th className="py-3 px-4 type-overline text-slate-500 w-28 text-center">{t("Terminal", "Uzavretý", "Záró")}</th>
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
                    data-testid={`order-status-divider-${row.group}`}
                    onDragOver={onDragOver}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={onDrop}
                    className={`transition-all border-b border-slate-200/60 duration-200 ${
                      isDragOver ? "bg-indigo-50/60 scale-[0.99] border-2 border-dashed border-indigo-300" : "bg-slate-100/70"
                    }`}
                  >
                    <td colSpan={7} className="py-3 px-4 select-none">
                      <div className="flex items-center gap-2">
                        <span className="type-overline text-slate-900 font-semibold">{info.name}</span>
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
              const isTerm = def.isTerminal ?? (def.group === "delivered" || def.group === "cancelled");

              return (
                <tr
                  key={`status-${def.key}`}
                  data-testid={`order-status-row-${def.key}`}
                  draggable={canEdit}
                  onDragStart={() => canEdit && setDraggedKey(def.key)}
                  onDragEnd={() => {
                    setDraggedKey(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={onDragOver}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={onDrop}
                  className={`border-b border-slate-200/40 transition-colors hover:bg-slate-50/80 ${
                    draggedKey === def.key ? "opacity-30" : ""
                  } ${isDragOver ? "border-t-2 border-indigo-400 bg-indigo-50/30" : ""}`}
                >
                  <td className="py-2.5 px-4 text-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
                    {canEdit && <GripVertical className="h-4 w-4 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-4">
                    <ColorPicker
                      color={def.color}
                      onChange={(c) => handleColor(def.key, c)}
                      disabled={!canEdit}
                      title={label}
                    />
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-800">
                    {canEdit ? (
                      <InlineRenameName
                        value={label}
                        onSave={(val) => handleRename(def.key, val)}
                        userLanguage={userLanguage}
                      />
                    ) : (
                      label
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium border ${info.chip}`}>
                      {info.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-micro font-bold ${
                      count > 0 ? "bg-slate-100 text-slate-700" : "text-slate-400"
                    }`}>
                      {count}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleTerminal(def.key)}
                      disabled={!canEdit}
                      className={`p-1 rounded-md transition-colors ${
                        isTerm ? "text-emerald-600 bg-emerald-50" : "text-slate-300 hover:text-slate-500"
                      }`}
                      title={t("Marks order as complete/closed", "Označí objednávku ako ukončenú", "Lezártnak jelöli a rendelést")}
                    >
                      <CheckCircle2 className="h-4 w-4 mx-auto" />
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemove(def)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                        title={t("Remove status", "Odstrániť stav", "Állapot törlése")}
                      >
                        <X className="h-4 w-4 mx-auto" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-3 pt-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("New order status name...", "Názov nového stavu objednávky...", "Új rendelés állapot neve...")}
            className="flex-1 min-w-50 px-3.5 py-2 text-input border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
          />
          <div className="w-48">
            <CustomSelect
              value={newGroup}
              onChange={(val) => setNewGroup(val as OrderStatusGroup)}
              options={ORDER_STATUS_GROUPS.map((g) => ({
                value: g,
                label: groupInfo(g).name,
              }))}
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-input font-medium transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            {t("Add status", "Pridať stav", "Állapot hozzáadása")}
          </button>
        </form>
      )}
    </div>
  );
};
