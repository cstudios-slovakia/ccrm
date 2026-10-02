import React, { useMemo, useRef, useState } from "react";
import { GripVertical, Layers, Trash2 } from "lucide-react";
import type { FinancialCategory, FinancialRecord, FinancialType } from "../types";
import { CustomSelect } from "./ui/CustomSelect";
import { ColorPicker } from "./ui/ColorPicker";
import { inheritedColor, nextCategoryColor } from "../utils/color";
import type { Language } from "../utils/translations";
import {
  categoryChildren,
  moveCategory,
  nextCategorySortOrder,
  resolveCategoryDrop,
  type CategoryDropPosition,
  type CategoryDropTarget
} from "../utils/financialCategoryTree";
import { useDragAutoScroll } from "../hooks/useDragAutoScroll";

interface FinancialCategoriesManagerProps {
  financialCategories: FinancialCategory[];
  setFinancialCategories: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  /** Deleting a category un-files the movements that sat under it, so this has to reach them. */
  setFinancialRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  userLanguage: Language;
  /** Finance edit rights: without them the tree is read-only. */
  canEdit: boolean;
  canDelete: boolean;
}

const CATEGORY_ROW_STYLES = {
  1: {
    row: "p-3.5 bg-slate-50/80 border-b border-slate-100",
    swatch: "h-3.5 w-3.5",
    name: "font-bold text-ui text-slate-900",
    badge: "px-2 py-0.5 rounded-full text-micro font-semibold bg-slate-200 text-slate-600",
    badgeText: "Level 1",
    trash: "h-3.5 w-3.5"
  },
  2: {
    row: "p-2 rounded-xl bg-white border border-slate-100",
    swatch: "h-3 w-3",
    name: "font-semibold text-ui text-slate-800",
    badge: "px-1.5 py-0.2 rounded text-micro bg-slate-100 text-slate-500",
    badgeText: "Level 2",
    trash: "h-3 w-3"
  },
  3: {
    row: "p-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100 text-ui",
    swatch: "h-2.5 w-2.5",
    name: "text-slate-700 font-medium",
    badge: "text-micro text-slate-400",
    badgeText: "(Level 3)",
    trash: "h-3 w-3"
  }
} as const;

/**
 * The 3-level income / expense category tree: add, recolour, drag to reorder or
 * re-parent, delete.
 *
 * It used to be a tab of the Finance screen. It lives under Settings → Finance
 * now, because what the categories *are* is configuration; the Finance screen
 * only picks from them.
 */
export const FinancialCategoriesManager: React.FC<FinancialCategoriesManagerProps> = ({
  financialCategories,
  setFinancialCategories: setFinancialCategoriesRaw,
  setFinancialRecords: setFinancialRecordsRaw,
  userLanguage,
  canEdit,
  canDelete
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  // Without edit rights a write is dropped, so a handler that would then say
  // "saved" asks first and says it was not.
  const setFinancialCategories: typeof setFinancialCategoriesRaw = (updater) => {
    if (!canEdit) return;
    setFinancialCategoriesRaw(updater);
  };
  const setFinancialRecords: typeof setFinancialRecordsRaw = (updater) => {
    if (!canEdit) return;
    setFinancialRecordsRaw(updater);
  };
  const refuseWithoutEdit = (): boolean => {
    if (canEdit) return false;
    (window as any).showToast?.(t(
      "You can view finances but not change them — nothing was saved.",
      "Financie môžete prezerať, ale nie meniť — nič sa neuložilo.",
      "A pénzügyeket megtekintheti, de nem módosíthatja — semmi sem lett mentve."
    ));
    return true;
  };

  const [catTreeType, setCatTreeType] = useState<FinancialType>("expense");
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState<string>("");
  const [newCatColor, setNewCatColor] = useState("");
  // Until a colour is picked on purpose, a subcategory inherits its parent's and
  // a main category gets the next colour no other main category of its type has.
  const [newCatColorTouched, setNewCatColorTouched] = useState(false);

  // Dragging a row rewrites its position, level and parent together.
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState<CategoryDropTarget | null>(null);
  const categoryTreeRef = useRef<HTMLDivElement | null>(null);
  useDragAutoScroll(draggedCategoryId !== null, categoryTreeRef);

  // A colour picker fires on every pixel the pointer crosses, so the swatch
  // previews a local draft and only the colour the user settles on is saved.
  const [categoryColorDrafts, setCategoryColorDrafts] = useState<Record<string, string>>({});
  const categoryColorTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const categoryTree = useMemo(() => {
    const buildTree = (type: FinancialType) =>
      categoryChildren(financialCategories, type, null).map((root) => ({
        ...root,
        children: categoryChildren(financialCategories, type, root.id).map((l2) => ({
          ...l2,
          children: categoryChildren(financialCategories, type, l2.id)
        }))
      }));

    return {
      incomeTree: buildTree("income"),
      expenseTree: buildTree("expense")
    };
  }, [financialCategories]);

  const suggestedRootCatColor = useMemo(
    () => nextCategoryColor(financialCategories.filter((c) => c.type === catTreeType && !c.parentId).map((c) => c.color)),
    [financialCategories, catTreeType]
  );
  const newCatFormColor = newCatColorTouched
    ? newCatColor
    : newCatParentId
      ? inheritedColor(financialCategories, newCatParentId) || suggestedRootCatColor
      : suggestedRootCatColor;

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (refuseWithoutEdit()) return;
    if (!newCatName.trim()) return;

    let parentLevel = 1;
    if (newCatParentId) {
      const parent = financialCategories.find((c) => c.id === newCatParentId);
      // A parent from the other side of the ledger (stale selection left over
      // from the Expense/Income switcher) is treated the same as no parent found
      // at all — the new category is created as a root of its own type instead
      // of silently nesting under the wrong section.
      if (parent && parent.type === catTreeType) {
        parentLevel = parent.level + 1;
      }
    }

    if (parentLevel > 3) {
      alert(t("Maximum category depth is 3 levels.", "Maximálna hĺbka kategórií je 3 úrovne.", "A maximális kategóriamélység 3 szint."));
      return;
    }

    const newCat: FinancialCategory = {
      id: `fc-${catTreeType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: catTreeType,
      name: newCatName.trim(),
      parentId: newCatParentId || null,
      level: parentLevel as 1 | 2 | 3,
      sortOrder: nextCategorySortOrder(financialCategories, catTreeType, newCatParentId || null),
      color: newCatColorTouched ? newCatColor : newCatParentId ? null : suggestedRootCatColor,
      icon: parentLevel === 1 ? "Layers" : parentLevel === 2 ? "Folder" : "Tag",
      createdAt: new Date().toISOString()
    };

    setFinancialCategories((prev) => [...prev, newCat]);
    setNewCatName("");
    setNewCatParentId("");
    setNewCatColorTouched(false);
    (window as any).showToast?.(t("Category added!", "Kategória bola pridaná!", "Kategória hozzáadva!"));
  };

  const handleDeleteCategory = (id: string) => {
    if (!canDelete) return;
    if (confirm(t("Delete category and its subcategories?", "Vymazať kategóriu a všetky jej podkategórie?", "Törli a kategóriát és alkategóriáit?"))) {
      // Find all nested child ids recursively
      const toDeleteIds = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        financialCategories.forEach((c) => {
          if (c.parentId && toDeleteIds.has(c.parentId) && !toDeleteIds.has(c.id)) {
            toDeleteIds.add(c.id);
            changed = true;
          }
        });
      }

      setFinancialCategories((prev) => prev.filter((c) => !toDeleteIds.has(c.id)));
      // The movements filed under them stay, now uncategorized, so every tab keeps counting them.
      setFinancialRecords((prev) =>
        prev.some((r) => r.categoryId && toDeleteIds.has(r.categoryId))
          ? prev.map((r) =>
              r.categoryId && toDeleteIds.has(r.categoryId)
                ? { ...r, categoryId: null, categoryPath: null, updatedAt: new Date().toISOString() }
                : r
            )
          : prev
      );
      (window as any).showToast?.(t("Category removed", "Kategória odstránená", "Kategória eltávolítva"));
    }
  };

  const endCategoryDrag = () => {
    setDraggedCategoryId(null);
    setCategoryDropTarget(null);
  };

  const handleCategoryDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id); // Firefox will not start a drag without data
    setDraggedCategoryId(id);
  };

  /**
   * The top quarter of a row drops before it, the bottom quarter after it and
   * the middle inside it. When the row cannot take the dragged category as a
   * child (too deep), the middle falls back to the nearer edge.
   */
  const categoryDropFromPointer = (e: React.DragEvent<HTMLElement>, targetId: string | null): CategoryDropTarget | null => {
    if (!draggedCategoryId) return null;
    let candidates: CategoryDropPosition[] = ["after"];
    if (targetId !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
      const nearerEdge: CategoryDropPosition = ratio < 0.5 ? "before" : "after";
      candidates = ratio < 0.25 ? ["before"] : ratio > 0.75 ? ["after"] : ["inside", nearerEdge];
    }
    for (const position of candidates) {
      const drop = { targetId, position };
      if (resolveCategoryDrop(financialCategories, draggedCategoryId, drop)) return drop;
    }
    return null;
  };

  const handleCategoryDragOver = (e: React.DragEvent<HTMLElement>, targetId: string | null) => {
    if (!draggedCategoryId) return;
    e.stopPropagation();
    const drop = categoryDropFromPointer(e, targetId);
    if (!drop) {
      e.dataTransfer.dropEffect = "none";
      if (categoryDropTarget) setCategoryDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (categoryDropTarget?.targetId !== drop.targetId || categoryDropTarget?.position !== drop.position) {
      setCategoryDropTarget(drop);
    }
  };

  const handleCategoryDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!canEdit) {
      e.preventDefault();
      endCategoryDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const dragId = draggedCategoryId;
    const drop = categoryDropTarget;
    endCategoryDrag();
    if (!dragId || !drop) return;

    const next = moveCategory(financialCategories, dragId, drop);
    if (!next || next === financialCategories) return;
    setFinancialCategories((prev) => moveCategory(prev, dragId, drop) ?? prev);
    (window as any).showToast?.(t("Category moved", "Kategória bola presunutá", "Kategória áthelyezve"));
  };

  const categoryColor = (cat: FinancialCategory | undefined | null): string | null =>
    cat ? categoryColorDrafts[cat.id] ?? cat.color ?? null : null;

  const handleCategoryColorChange = (id: string, color: string) => {
    if (!canEdit) return;
    setCategoryColorDrafts((drafts) => ({ ...drafts, [id]: color }));
    clearTimeout(categoryColorTimers.current[id]);
    categoryColorTimers.current[id] = setTimeout(() => {
      delete categoryColorTimers.current[id];
      setFinancialCategories((prev) => prev.map((c) => (c.id === id && c.color !== color ? { ...c, color } : c)));
      setCategoryColorDrafts((drafts) => {
        const rest = { ...drafts };
        delete rest[id];
        return rest;
      });
    }, 400);
  };

  /** One draggable row of the category tree; `inherited` is shown while the category has none of its own. */
  const renderCategoryRow = (cat: FinancialCategory, level: 1 | 2 | 3, inherited?: string | null) => {
    const styles = CATEGORY_ROW_STYLES[level];
    const drop = draggedCategoryId && categoryDropTarget?.targetId === cat.id ? categoryDropTarget.position : null;
    const shownColor = categoryColor(cat) || inherited || "#6366f1";

    return (
      <div
        key={cat.id}
        draggable={canEdit}
        onDragStart={(e) => handleCategoryDragStart(e, cat.id)}
        onDragEnd={endCategoryDrag}
        onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
        onDrop={handleCategoryDrop}
        title={canEdit ? t("Drag to reorder or move under another category", "Potiahnutím zmeníte poradie alebo nadradenú kategóriu", "Húzza az átrendezéshez vagy áthelyezéshez") : undefined}
        className={`group relative flex items-center justify-between transition-[opacity,background-color,box-shadow] duration-150 ${
          canEdit ? "cursor-grab active:cursor-grabbing" : ""
        } ${styles.row} ${
          draggedCategoryId === cat.id ? "opacity-40" : ""
        } ${drop === "inside" ? "ring-2 ring-inset ring-indigo-400 !bg-indigo-50" : ""}`}
      >
        {drop === "before" && (
          <span className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
        )}
        {drop === "after" && (
          <span className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
        )}

        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors duration-150" />
          <ColorPicker
            value={shownColor}
            onChange={(color) => handleCategoryColorChange(cat.id, color)}
            title={t("Change color", "Zmeniť farbu", "Szín módosítása")}
            className={styles.swatch}
          />
          <span className={`truncate ${styles.name}`}>{cat.name}</span>
          <span className={`shrink-0 ${styles.badge}`}>{styles.badgeText}</span>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => handleDeleteCategory(cat.id)}
            className="p-1 text-slate-400 hover:text-rose-600 transition-colors duration-150 cursor-pointer"
            title={t("Delete category", "Vymazať", "Törlés")}
          >
            <Trash2 className={styles.trash} />
          </button>
        )}
      </div>
    );
  };

  const activeTree = catTreeType === "expense" ? categoryTree.expenseTree : categoryTree.incomeTree;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center ws-sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-body font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            {t("Movement Categories", "Kategórie finančných pohybov", "Mozgási kategóriák")}
          </h3>
          <p className="text-ui text-slate-400 mt-0.5">
            {t("Organize your financial movement categories across Main Category (L1) ➔ Subcategory (L2) ➔ Sub-subcategory (L3).", "Organizácia finančných tokov a nákladov v 3 úrovniach: Hlavná kategória (L1) ➔ Podkategória (L2) ➔ Pod-podkategória (L3).", "Pénzügyi tételek 3 szintű rendszerezése: Főkategória (L1) ➔ Alkategória (L2) ➔ Al-alkategória (L3).")}
          </p>
        </div>

        {/* Incomes vs Expenses tree switcher */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => {
              // A parent id from the tree just left behind must not survive the
              // switch — it would be silently invisible in the "Parent Category"
              // select (its option belongs to the other type) while still being
              // submitted, putting the new category's money on the wrong side of
              // the ledger.
              setCatTreeType("expense");
              setNewCatParentId("");
            }}
            className={`px-4 py-1.5 rounded-xl text-ui font-bold transition-all cursor-pointer ${
              catTreeType === "expense" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
            }`}
          >
            {t("Expense Categories", "Kategórie výdavkov", "Kiadási kategóriák")}
          </button>
          <button
            type="button"
            onClick={() => {
              setCatTreeType("income");
              setNewCatParentId("");
            }}
            className={`px-4 py-1.5 rounded-xl text-ui font-bold transition-all cursor-pointer ${
              catTreeType === "income" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
            }`}
          >
            {t("Income Categories", "Kategórie príjmov", "Bevételi kategóriák")}
          </button>
        </div>
      </div>

      {/* Quick Add Category Form */}
      {canEdit && (
        <form onSubmit={handleCreateCategory} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-50">
            <label className="text-caption font-bold text-slate-500 block mb-1">
              {t("Category Name", "Názov kategórie", "Kategória neve")}
            </label>
            <input
              type="text"
              maxLength={150}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder={t("e.g. Meta Ads, Truck Transport, LAM 5+...", "napr. Meta Ads, Preprava, LAM 5+...", "pl. Google Ads, Szállítás...")}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-ui text-slate-800 focus:outline-none"
            />
          </div>

          <div className="min-w-55">
            <label className="text-caption font-bold text-slate-500 block mb-1">
              {t("Parent Category (optional)", "Nadradená kategória (voliteľné)", "Szülő kategória (opcionális)")}
            </label>
            <CustomSelect
              value={newCatParentId}
              onChange={(val) => setNewCatParentId(val)}
              options={[
                { value: "", label: t("★ None (Create as Level 1 Root)", "★ Žiadna (Vytvoriť ako Hlavnú L1)", "★ Nincs (Fő L1 kategória)") },
                ...activeTree.flatMap((l1) => [
                  { value: l1.id, label: `● ${l1.name} (L1)` },
                  ...l1.children.map((l2) => ({ value: l2.id, label: `  ↳ ${l2.name} (L2)` })),
                ]),
              ]}
              size="sm"
              className="w-full text-ui font-semibold rounded-xl bg-white border-slate-200"
            />
          </div>

          <div>
            <label className="text-caption font-bold text-slate-500 block mb-1">
              {newCatParentId && !newCatColorTouched ? t("Color (inherited)", "Farba (zdedená)", "Szín (örökölt)") : t("Color", "Farba", "Szín")}
            </label>
            <ColorPicker
              variant="field"
              value={newCatFormColor}
              onChange={(color) => {
                setNewCatColor(color);
                setNewCatColorTouched(true);
              }}
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-ui font-semibold rounded-xl cursor-pointer shadow-sm"
          >
            {t("Add Category", "Pridať kategóriu", "Kategória hozzáadása")}
          </button>
        </form>
      )}

      {/* Tree: every row drags — onto a row's edge to sit beside it, onto its middle to go under it */}
      {canEdit && (
        <p className="-mt-3 text-caption text-slate-400 flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5 shrink-0" />
          {t(
            "Drag a category to reorder it or move it under another one; click its colour dot to recolour it.",
            "Potiahnutím kategórie zmeníte poradie alebo ju presuniete pod inú; kliknutím na farebnú bodku zmeníte farbu.",
            "Húzással átrendezheti vagy más kategória alá helyezheti; a színes pontra kattintva módosíthatja a színét."
          )}
        </p>
      )}
      <div
        ref={categoryTreeRef}
        className="space-y-3"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCategoryDropTarget(null);
        }}
      >
        {activeTree.map((l1) => (
          <div key={l1.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            {/* Level 1 Header */}
            {renderCategoryRow(l1, 1)}

            {/* Level 2 Children */}
            {l1.children.length > 0 && (
              <div className="p-3 space-y-2 bg-slate-50/30">
                {l1.children.map((l2) => (
                  <div key={l2.id} className="pl-4 border-l-2 border-slate-200 space-y-2">
                    {renderCategoryRow(l2, 2, categoryColor(l1))}

                    {/* Level 3 Children */}
                    {l2.children.length > 0 && (
                      <div className="pl-6 space-y-1">
                        {l2.children.map((l3) => renderCategoryRow(l3, 3, categoryColor(l2) || categoryColor(l1)))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Drop zone: the end of the main categories */}
        {draggedCategoryId && (
          <div
            onDragOver={(e) => handleCategoryDragOver(e, null)}
            onDrop={handleCategoryDrop}
            className={`animate-in fade-in slide-in-from-bottom-1 duration-200 rounded-2xl border-2 border-dashed px-4 py-3 text-center text-ui font-semibold transition-colors ${
              categoryDropTarget?.targetId === null
                ? "border-indigo-400 bg-indigo-50 text-indigo-600"
                : "border-slate-200 text-slate-400"
            }`}
          >
            {t(
              "Drop here to make it a main category (L1) at the end",
              "Pustite sem — stane sa hlavnou kategóriou (L1) na konci zoznamu",
              "Engedje el ide — fő kategória (L1) lesz a lista végén"
            )}
          </div>
        )}
      </div>
    </div>
  );
};
