import React, { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Layers, PencilLine, Trash2 } from "lucide-react";
import type { ClientCategory } from "../types";
import { CustomSelect } from "./ui/CustomSelect";
import type { DropdownOption } from "./ui/CustomSelect";
import { cn } from "../utils/cn";
import {
  MAX_CLIENT_CATEGORY_DEPTH,
  clientCategoryChildren,
  clientCategoryColor,
  clientCategoryDescendantIds,
  clientCategoryPath,
  flattenClientCategories,
  iconForClientCategoryLevel,
  moveClientCategory,
  nextClientCategorySortOrder,
  resolveClientCategoryDrop,
  type ClientCategoryDropPosition,
  type ClientCategoryDropTarget,
} from "../utils/clientCategoryTree";

type Translate = (en: string, sk: string, hu: string) => string;

const FALLBACK_COLOR = "#94a3b8";

// ---------------------------------------------------------------------------
// Badge — the category a client is filed under, wherever a client is listed.
// ---------------------------------------------------------------------------

export const ClientCategoryBadge: React.FC<{
  categories: ClientCategory[];
  categoryId?: string | null;
  className?: string;
}> = ({ categories, categoryId, className }) => {
  const path = clientCategoryPath(categories, categoryId);
  if (path.length === 0) return null;
  const color = clientCategoryColor(categories, categoryId) || FALLBACK_COLOR;
  const fullPath = path.map((c) => c.name).join(" › ");

  return (
    <span
      title={fullPath}
      className={cn(
        "inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-md border border-slate-200 bg-white text-[9px] font-extrabold uppercase tracking-wide text-slate-600",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate">{fullPath}</span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Select — pick one category; the tree reads top to bottom, each option
// naming its ancestors so a level-3 choice is never ambiguous.
// ---------------------------------------------------------------------------

export const ClientCategorySelect: React.FC<{
  value: string;
  onChange: (id: string) => void;
  categories: ClientCategory[];
  t: Translate;
  /** Rows above the tree. Defaults to a single "No category" row with the value "". */
  leadingOptions?: DropdownOption[];
  className?: string;
  size?: "sm" | "md";
}> = ({ value, onChange, categories, t, leadingOptions, className, size }) => {
  const options = useMemo<DropdownOption[]>(() => {
    const lead = leadingOptions ?? [{ value: "", label: t("No category", "Bez kategórie", "Nincs kategória") }];
    return [
      ...lead,
      ...flattenClientCategories(categories).map(({ category }) => {
        const ancestors = clientCategoryPath(categories, category.id).slice(0, -1);
        return {
          value: category.id,
          label: (
            <span className="inline-flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: clientCategoryColor(categories, category.id) || FALLBACK_COLOR }}
              />
              <span className="truncate">
                {ancestors.length > 0 && (
                  <span className="text-slate-400">{ancestors.map((a) => a.name).join(" › ")} › </span>
                )}
                {category.name}
              </span>
            </span>
          ),
        };
      }),
    ];
  }, [categories, leadingOptions, t]);

  return <CustomSelect value={value} onChange={onChange} options={options} className={className} size={size} />;
};

// ---------------------------------------------------------------------------
// Manager — the finance categories tab, for customers: quick-add form, the
// three-level tree, drag & drop to reorder or re-parent, click the dot to
// recolour. Adds inline rename, which a customer list needs more than a chart
// of accounts does.
// ---------------------------------------------------------------------------

const ROW_STYLES = {
  1: {
    row: "p-3.5 bg-slate-50/80 border-b border-slate-100",
    swatch: "h-3.5 w-3.5",
    name: "font-bold text-xs text-slate-900 uppercase tracking-wider",
    badge: "px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600",
    icon: "h-3.5 w-3.5",
  },
  2: {
    row: "p-2 rounded-xl bg-white border border-slate-100",
    swatch: "h-3 w-3",
    name: "font-semibold text-xs text-slate-800",
    badge: "px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-500",
    icon: "h-3 w-3",
  },
  3: {
    row: "p-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100 text-xs",
    swatch: "h-2.5 w-2.5",
    name: "text-slate-700 font-medium",
    badge: "text-[10px] text-slate-400",
    icon: "h-3 w-3",
  },
} as const;

const DEFAULT_NEW_COLOR = "#10b981";

export const ClientCategoryManager: React.FC<{
  categories: ClientCategory[];
  setCategories: (updater: (prev: ClientCategory[]) => ClientCategory[]) => void;
  /** Every id a delete removed, so the caller can take clients out of those categories. */
  onCategoriesDeleted?: (ids: Set<string>) => void;
  /** Clients filed directly under each category id. */
  clientCounts: Record<string, number>;
  t: Translate;
}> = ({ categories, setCategories, onCategoriesDeleted, clientCounts, t }) => {
  const toast = (msg: string) => (window as any).showToast?.(msg);

  // --- quick add ---
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_NEW_COLOR);
  // A subcategory inherits its parent's colour unless one is picked on purpose.
  const [colorTouched, setColorTouched] = useState(false);

  const parentOptions = useMemo(
    () => [
      { value: "", label: t("★ None (Create as Level 1 Root)", "★ Žiadna (Vytvoriť ako Hlavnú L1)", "★ Nincs (Fő L1 kategória)") },
      ...flattenClientCategories(categories)
        .filter(({ depth }) => depth < MAX_CLIENT_CATEGORY_DEPTH)
        .map(({ category, depth }) => ({
          value: category.id,
          label: depth === 1 ? `● ${category.name} (L1)` : `  ↳ ${category.name} (L2)`,
        })),
    ],
    [categories, t]
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast(t("Category name is required.", "Názov kategórie je povinný.", "A kategória neve kötelező."));
      return;
    }
    const parent = newParentId ? categories.find((c) => c.id === newParentId) : undefined;
    const level = parent ? parent.level + 1 : 1;
    if (level > MAX_CLIENT_CATEGORY_DEPTH) {
      toast(t("Maximum category depth is 3 levels.", "Maximálna hĺbka kategórií je 3 úrovne.", "A maximális kategóriamélység 3 szint."));
      return;
    }
    const parentId = parent?.id ?? null;
    const category: ClientCategory = {
      id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      parentId,
      level: level as ClientCategory["level"],
      sortOrder: nextClientCategorySortOrder(categories, parentId),
      color: parent && !colorTouched ? null : newColor,
      icon: iconForClientCategoryLevel(level),
    };
    setCategories((prev) => [...prev, category]);
    setNewName("");
    setColorTouched(false);
    toast(t("Category added!", "Kategória bola pridaná!", "Kategória hozzáadva!"));
  };

  // --- delete ---
  const handleDelete = (cat: ClientCategory) => {
    const ids = clientCategoryDescendantIds(categories, cat.id);
    ids.add(cat.id);
    const affected = [...ids].reduce((sum, id) => sum + (clientCounts[id] || 0), 0);
    const question =
      affected > 0
        ? t(
            `Delete "${cat.name}" and its subcategories? ${affected} client(s) will be left without a category.`,
            `Vymazať „${cat.name}“ a všetky jej podkategórie? ${affected} klient(ov) zostane bez kategórie.`,
            `Törli a(z) „${cat.name}” kategóriát és alkategóriáit? ${affected} ügyfél kategória nélkül marad.`
          )
        : t(
            `Delete "${cat.name}" and its subcategories?`,
            `Vymazať „${cat.name}“ a všetky jej podkategórie?`,
            `Törli a(z) „${cat.name}” kategóriát és alkategóriáit?`
          );
    if (!window.confirm(question)) return;
    setCategories((prev) => prev.filter((c) => !ids.has(c.id)));
    onCategoriesDeleted?.(ids);
    toast(t("Category removed", "Kategória odstránená", "Kategória eltávolítva"));
  };

  // --- rename ---
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const commitRename = () => {
    const id = renamingId;
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!id || !name) return;
    setCategories((prev) => prev.map((c) => (c.id === id && c.name !== name ? { ...c, name } : c)));
  };

  // --- colour: the picker fires on every pixel of a drag, so only the last value is synced ---
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
  const colorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = colorTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);
  const shownColorOf = (cat: ClientCategory): string | null => colorDrafts[cat.id] ?? cat.color ?? null;
  const handleColorChange = (id: string, color: string) => {
    setColorDrafts((drafts) => ({ ...drafts, [id]: color }));
    clearTimeout(colorTimers.current[id]);
    colorTimers.current[id] = setTimeout(() => {
      delete colorTimers.current[id];
      setCategories((prev) => prev.map((c) => (c.id === id && c.color !== color ? { ...c, color } : c)));
      setColorDrafts((drafts) => {
        const next = { ...drafts };
        delete next[id];
        return next;
      });
    }, 400);
  };

  // --- drag & drop: onto a row's edge to sit beside it, onto its middle to go under it ---
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ClientCategoryDropTarget | null>(null);

  const endDrag = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  };

  /** The drop under the pointer, falling back to the other half of the row when the nearer one is not allowed. */
  const dropFromPointer = (e: React.DragEvent<HTMLElement>, targetId: string | null): ClientCategoryDropTarget | null => {
    if (!draggedId) return null;
    let candidates: ClientCategoryDropPosition[] = ["after"];
    if (targetId !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
      const nearerEdge: ClientCategoryDropPosition = ratio < 0.5 ? "before" : "after";
      candidates = ratio > 0.25 && ratio < 0.75 ? ["inside", nearerEdge] : [nearerEdge, "inside"];
    }
    for (const position of candidates) {
      const drop = { targetId, position };
      if (resolveClientCategoryDrop(categories, draggedId, drop)) return drop;
    }
    return null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>, targetId: string | null) => {
    if (!draggedId) return;
    const drop = dropFromPointer(e, targetId);
    if (!drop) {
      if (dropTarget) setDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget?.targetId !== drop.targetId || dropTarget?.position !== drop.position) {
      setDropTarget(drop);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const dragId = draggedId;
    const drop = dropTarget;
    endDrag();
    if (!dragId || !drop) return;
    const next = moveClientCategory(categories, dragId, drop);
    if (!next || next === categories) return;
    setCategories((prev) => moveClientCategory(prev, dragId, drop) ?? prev);
    toast(t("Category moved", "Kategória bola presunutá", "Kategória áthelyezve"));
  };

  const renderRow = (cat: ClientCategory, level: 1 | 2 | 3, inheritedColor: string | null) => {
    const styles = ROW_STYLES[level];
    const drop = draggedId && dropTarget?.targetId === cat.id ? dropTarget.position : null;
    const shownColor = shownColorOf(cat) || inheritedColor || FALLBACK_COLOR;
    const isRenaming = renamingId === cat.id;
    const count = clientCounts[cat.id] || 0;

    return (
      <div
        key={cat.id}
        data-client-category-row={cat.id}
        draggable={!isRenaming}
        onDragStart={(e) => handleDragStart(e, cat.id)}
        onDragEnd={endDrag}
        onDragOver={(e) => handleDragOver(e, cat.id)}
        onDrop={handleDrop}
        title={t("Drag to reorder or move under another category", "Potiahnutím zmeníte poradie alebo nadradenú kategóriu", "Húzza az átrendezéshez vagy áthelyezéshez")}
        className={cn(
          "group relative flex items-center justify-between gap-2 transition-[opacity,background-color,box-shadow] duration-150",
          isRenaming ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          styles.row,
          draggedId === cat.id && "opacity-40",
          drop === "inside" && "ring-2 ring-inset ring-emerald-400 !bg-emerald-50"
        )}
      >
        {drop === "before" && (
          <span className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-emerald-500 animate-in fade-in duration-150" />
        )}
        {drop === "after" && (
          <span className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-500 animate-in fade-in duration-150" />
        )}

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-emerald-500 transition-colors duration-150" />
          <label
            title={t("Change color", "Zmeniť farbu", "Szín módosítása")}
            className={cn(
              "relative rounded-full shrink-0 shadow-sm cursor-pointer transition-transform duration-150 hover:scale-125 active:scale-95 focus-within:ring-2 focus-within:ring-emerald-400 focus-within:ring-offset-1",
              styles.swatch
            )}
            style={{ backgroundColor: shownColor }}
            onDragStart={(e) => e.preventDefault()}
          >
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(shownColor) ? shownColor : FALLBACK_COLOR}
              onChange={(e) => handleColorChange(cat.id, e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            />
          </label>
          {isRenaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  setRenamingId(null);
                }
              }}
              className="min-w-0 flex-1 px-2 py-1 rounded-lg border border-emerald-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          ) : (
            <span
              className={cn("truncate", styles.name)}
              onDoubleClick={() => {
                setRenamingId(cat.id);
                setRenameDraft(cat.name);
              }}
            >
              {cat.name}
            </span>
          )}
          <span className={cn("shrink-0", styles.badge)}>L{level}</span>
          {count > 0 && (
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-black text-emerald-700 tabular-nums"
              title={t(`${count} client(s) in this category`, `${count} klient(ov) v tejto kategórii`, `${count} ügyfél ebben a kategóriában`)}
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setRenamingId(cat.id);
              setRenameDraft(cat.name);
            }}
            className="p-1 text-slate-400 hover:text-emerald-600 active:scale-90 transition-all duration-150 cursor-pointer"
            title={t("Rename category", "Premenovať kategóriu", "Kategória átnevezése")}
          >
            <PencilLine className={styles.icon} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(cat)}
            className="p-1 text-slate-400 hover:text-rose-600 active:scale-90 transition-all duration-150 cursor-pointer"
            title={t("Delete category", "Vymazať", "Törlés")}
          >
            <Trash2 className={styles.icon} />
          </button>
        </div>
      </div>
    );
  };

  const roots = clientCategoryChildren(categories, null);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-500" />
          {t("Client Categories", "Kategórie klientov", "Ügyfélkategóriák")}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {t(
            "Organize your clients across Main Category (L1) ➔ Subcategory (L2) ➔ Sub-subcategory (L3).",
            "Organizácia klientov v 3 úrovniach: Hlavná kategória (L1) ➔ Podkategória (L2) ➔ Pod-podkategória (L3).",
            "Ügyfelek 3 szintű rendszerezése: Főkategória (L1) ➔ Alkategória (L2) ➔ Al-alkategória (L3)."
          )}
        </p>
      </div>

      {/* Quick add */}
      <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold text-slate-500 block mb-1">
            {t("Category Name", "Názov kategórie", "Kategória neve")}
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("e.g. Retail, Architects, Key accounts...", "napr. Maloobchod, Architekti, Kľúčoví klienti...", "pl. Kiskereskedelem, Építészek...")}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="min-w-[220px]">
          <label className="text-[11px] font-bold text-slate-500 block mb-1">
            {t("Parent Category (optional)", "Nadradená kategória (voliteľné)", "Szülő kategória (opcionális)")}
          </label>
          <CustomSelect
            value={newParentId}
            onChange={(val) => setNewParentId(val)}
            options={parentOptions}
            size="sm"
            className="w-full text-xs font-semibold rounded-xl bg-white border-slate-200"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">
            {newParentId && !colorTouched ? t("Color (inherited)", "Farba (zdedená)", "Szín (örökölt)") : t("Color", "Farba", "Szín")}
          </label>
          <input
            type="color"
            value={newParentId && !colorTouched ? clientCategoryColor(categories, newParentId) || newColor : newColor}
            onChange={(e) => {
              setNewColor(e.target.value);
              setColorTouched(true);
            }}
            className="h-9 w-12 rounded-xl bg-white border border-slate-200 cursor-pointer p-0.5"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm transition-all duration-150"
        >
          {t("Add Category", "Pridať kategóriu", "Kategória hozzáadása")}
        </button>
      </form>

      {roots.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-10 text-center text-xs font-semibold text-slate-400">
          {t(
            "No client categories yet — add the first one above.",
            "Zatiaľ žiadne kategórie klientov — pridajte prvú vyššie.",
            "Még nincsenek ügyfélkategóriák — adja hozzá az elsőt fent."
          )}
        </div>
      ) : (
        <>
          <p className="-mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 shrink-0" />
            {t(
              "Drag a category to reorder it or move it under another one; click its colour dot to recolour it, double-click its name to rename it.",
              "Potiahnutím kategórie zmeníte poradie alebo ju presuniete pod inú; kliknutím na farebnú bodku zmeníte farbu, dvojklikom na názov ju premenujete.",
              "Húzással átrendezheti vagy más kategória alá helyezheti; a színes pontra kattintva módosíthatja a színét, a névre duplán kattintva átnevezheti."
            )}
          </p>
          <div
            className="space-y-3"
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
            }}
          >
            {roots.map((l1) => {
              const l1Color = shownColorOf(l1);
              const level2 = clientCategoryChildren(categories, l1.id);
              return (
                <div key={l1.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {renderRow(l1, 1, null)}
                  {level2.length > 0 && (
                    <div className="p-3 space-y-2 bg-slate-50/30">
                      {level2.map((l2) => {
                        const level3 = clientCategoryChildren(categories, l2.id);
                        return (
                          <div key={l2.id} className="pl-4 border-l-2 border-slate-200 space-y-2">
                            {renderRow(l2, 2, l1Color)}
                            {level3.length > 0 && (
                              <div className="pl-6 space-y-1">
                                {level3.map((l3) => renderRow(l3, 3, shownColorOf(l2) || l1Color))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {draggedId && (
              <div
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={handleDrop}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 duration-200 rounded-2xl border-2 border-dashed px-4 py-3 text-center text-xs font-semibold transition-colors",
                  dropTarget?.targetId === null ? "border-emerald-400 bg-emerald-50 text-emerald-600" : "border-slate-200 text-slate-400"
                )}
              >
                {t(
                  "Drop here to make it a main category (L1) at the end",
                  "Pustite sem — stane sa hlavnou kategóriou (L1) na konci zoznamu",
                  "Engedje el ide — fő kategória (L1) lesz a lista végén"
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
