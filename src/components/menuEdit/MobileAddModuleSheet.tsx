import React, { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Plus, Search, X } from "lucide-react";
import type { Language } from "../../utils/translations";
import type { SidebarGroup } from "../../utils/sidebarLayout";
import { normalizeStartMenuLayout } from "../../utils/startMenuLayout";
import { useUserPref } from "../../utils/userPrefs";
import { menuEditStrings } from "./menuEditStrings";
import { MobileSheet } from "./MobileSheet";
import type { MobileMenuEditorItem } from "./MobileMenuEditor";

/** "Pridať modul" sheet ("Mobil · Pridať modul"): unpinned + hidden modules, search, create-dashboard footer. */
export const MobileAddModuleSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  language: Language;
  groupId: string | null;
  groupName: string;
  groups: SidebarGroup[];
  items: MobileMenuEditorItem[];
  onAdd: (itemId: string, groupId: string) => void;
  onCreateCustomDashboard?: () => void;
}> = ({ open, onClose, language, groupId, groupName, groups, items, onAdd, onCreateCustomDashboard }) => {
  const s = menuEditStrings(language);
  const [rawLayout, setRawLayout] = useUserPref("startMenuLayout");
  const layout = useMemo(() => normalizeStartMenuLayout(rawLayout), [rawLayout]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const pinned = useMemo(() => new Set(groups.flatMap((g) => g.items)), [groups]);
  const unused = useMemo(() => new Set(layout?.unused ?? []), [layout]);
  const q = query.trim().toLowerCase();
  const match = (it: MobileMenuEditorItem) => !q || it.label.toLowerCase().includes(q);
  const unpinned = items.filter((it) => !pinned.has(it.id) && !unused.has(it.id) && match(it));
  const hidden = items.filter((it) => !pinned.has(it.id) && unused.has(it.id) && match(it));

  const metaFor = (it: MobileMenuEditorItem, isHidden: boolean): string => {
    if (isHidden) return s.alsoInStartMenu;
    const parts: string[] = [];
    if (it.kind) parts.push(it.kind === "dashboard" ? s.customDashboard : s.customTable);
    if (layout) {
      const gid = Object.keys(layout.groupItems).find((k) => layout.groupItems[k]?.includes(it.id));
      const name = gid ? layout.groups.find((g) => g.id === gid)?.name : undefined;
      if (name) parts.push(name);
    }
    return parts.join(" · ");
  };

  const pick = (it: MobileMenuEditorItem, isHidden: boolean) => {
    if (!groupId) return;
    if (isHidden && layout) setRawLayout({ ...layout, unused: layout.unused.filter((id) => id !== it.id) });
    onAdd(it.id, groupId);
    onClose();
  };

  const section = (title: string, list: MobileMenuEditorItem[], isHidden: boolean, first: boolean) =>
    list.length > 0 && (
      <div key={title}>
        <div className={`type-overline text-slate-500 px-3 pb-1.5 ${first ? "pt-3" : "pt-4"}`}>{title}</div>
        {list.map((it) => {
          const meta = metaFor(it, isHidden);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => pick(it, isHidden)}
              className="w-full min-h-14 py-1.5 pl-3 pr-1.5 rounded-xl border-0 bg-transparent flex items-center gap-3 text-left cursor-pointer transition-[background-color,transform] duration-150 hover:bg-slate-50 active:bg-slate-100 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <it.icon className="size-5 shrink-0" style={{ color: it.color || "#4f46e5" }} />
              <span className="flex-1 min-w-0 flex flex-col">
                <b className="text-body font-medium text-slate-800 truncate">{it.label}</b>
                {meta && <span className="text-caption text-slate-500 truncate">{meta}</span>}
              </span>
              <span className="size-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-indigo-600 shrink-0">
                <Plus className="size-4.5" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    );

  const empty = unpinned.length === 0 && hidden.length === 0;

  return (
    <MobileSheet open={open && !!groupId} onClose={onClose} label={s.addToGroupTitle(groupName)} tall>
      <div className="flex items-center gap-2 pl-5 pr-2 pt-1 pb-2 shrink-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <h2 className="m-0 type-panel-title text-slate-900 truncate">{s.addToGroupTitle(groupName)}</h2>
          <span className="text-caption text-slate-500">{s.addToGroupHint}</span>
        </div>
        <button
          type="button"
          aria-label={s.close}
          onClick={onClose}
          className="size-11 rounded-xl inline-flex items-center justify-center text-slate-500 cursor-pointer transition-[background-color,transform] hover:bg-slate-50 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="px-4 pb-2 shrink-0">
        <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-400 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-[border-color,box-shadow]">
          <Search className="size-5 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={s.searchModule}
            aria-label={s.searchModule}
            className="border-0 outline-none flex-1 min-w-0 text-body text-slate-800 bg-transparent"
          />
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section(s.unpinnedModules, unpinned, false, true)}
        {section(s.hiddenModules, hidden, true, unpinned.length === 0)}
        {empty && (
          <p className="m-0 px-3 py-8 text-center text-body text-slate-500">{q ? s.noModulesFound : s.allModulesAdded}</p>
        )}
      </div>
      {onCreateCustomDashboard && (
        <div className="px-4 pt-3 pb-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => (onClose(), onCreateCustomDashboard())}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white text-slate-700 text-ui font-semibold inline-flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgb(15_23_42/0.05)] cursor-pointer transition-[background-color,transform] hover:bg-slate-50 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            {s.createCustomDashboard}
          </button>
        </div>
      )}
    </MobileSheet>
  );
};
