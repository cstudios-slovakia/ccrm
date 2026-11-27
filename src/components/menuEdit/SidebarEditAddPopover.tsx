import React, { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "../../utils/cn";
import { useUserPref } from "../../utils/userPrefs";
import { normalizeStartMenuLayout } from "../../utils/startMenuLayout";
import { MenuPopover } from "./MenuPopover";
import { editBtn } from "./primitives";
import { menuEditStrings } from "./menuEditStrings";

/** One module that can be pinned (already filtered to what the user may see). */
export interface SidebarEditModule {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
  kind?: "dashboard" | "table";
}

interface Props {
  anchor: HTMLElement | null;
  onClose: () => void;
  language: string;
  groupName: string;
  modules: SidebarEditModule[];
  /** Ids already pinned in any sidebar group. */
  pinnedIds: Set<string>;
  onAdd: (id: string) => void;
  onCreateDashboard: () => void;
}

/**
 * Desktop version of the "Pridať do skupiny" sheet: an anchored popover with a
 * search field, the unpinned modules, the modules hidden from the Start menu
 * (adding one brings it back there too) and a "create a custom dashboard" button.
 */
export const SidebarEditAddPopover: React.FC<Props> = ({
  anchor,
  onClose,
  language,
  groupName,
  modules,
  pinnedIds,
  onAdd,
  onCreateDashboard,
}) => {
  const s = menuEditStrings(language);
  const [query, setQuery] = useState("");
  const [rawLayout, setRawLayout] = useUserPref("startMenuLayout");
  const layout = useMemo(() => normalizeStartMenuLayout(rawLayout), [rawLayout]);

  const startGroupOf = (id: string): string | undefined => {
    if (!layout) return undefined;
    const gid = Object.keys(layout.groupItems).find((g) => layout.groupItems[g].includes(id));
    return gid ? layout.groups.find((g) => g.id === gid)?.name : undefined;
  };

  const needle = query.trim().toLowerCase();
  const matches = (m: SidebarEditModule) => !needle || m.label.toLowerCase().includes(needle);
  const hiddenIds = new Set(layout?.unused ?? []);
  const hidden = modules.filter((m) => !pinnedIds.has(m.id) && hiddenIds.has(m.id) && matches(m));
  const unpinned = modules.filter((m) => !pinnedIds.has(m.id) && !hiddenIds.has(m.id) && matches(m));
  const nothingLeft = modules.every((m) => pinnedIds.has(m.id));

  const add = (m: SidebarEditModule, wasHidden: boolean) => {
    if (wasHidden && layout) {
      setRawLayout({ ...layout, unused: layout.unused.filter((id) => id !== m.id) });
    }
    onAdd(m.id);
  };

  const row = (m: SidebarEditModule, wasHidden: boolean) => {
    const Icon = m.icon;
    const meta = [
      m.kind === "dashboard" ? s.customDashboard : m.kind === "table" ? s.customTable : null,
      wasHidden ? s.alsoInStartMenu : startGroupOf(m.id) ?? null,
    ].filter(Boolean);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => add(m, wasHidden)}
        className="group w-full flex items-center gap-2.5 min-h-11 px-2 rounded-xl text-left cursor-pointer transition-[background-color,transform] duration-150 hover:bg-slate-50 focus-visible:bg-slate-50 active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <Icon className="size-4 shrink-0" style={{ color: m.color || "#64748b" }} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-ui font-medium text-slate-800 truncate">{m.label}</span>
          {meta.length > 0 && (
            <span className="text-caption text-slate-500 truncate">
              {meta.join(" · ")}
            </span>
          )}
        </span>
        <span className="size-7 rounded-lg border border-slate-200 text-indigo-600 inline-flex items-center justify-center shrink-0 transition-colors duration-150 group-hover:bg-indigo-50 group-hover:border-indigo-200">
          <Plus className="size-4" aria-hidden="true" />
        </span>
      </button>
    );
  };

  const section = (title: string, list: SidebarEditModule[], wasHidden: boolean) =>
    list.length > 0 && (
      <div className="flex flex-col gap-px">
        <div className="px-2 pt-2 pb-1 type-overline text-slate-500">{title}</div>
        {list.map((m) => row(m, wasHidden))}
      </div>
    );

  return (
    <MenuPopover anchor={anchor} onClose={onClose} ariaLabel={s.addToGroupTitle(groupName)} widthClass="w-75" autoFocus={false} className="p-3 gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-title-sm font-bold text-slate-900">{s.addToGroupTitle(groupName)}</h3>
        <p className="m-0 text-caption text-slate-500">{s.addToGroupHint}</p>
      </div>
      <label className="relative block">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={s.searchModule}
          aria-label={s.searchModule}
          className={cn(
            "w-full h-9 pl-8 pr-2.5 rounded-xl border border-slate-200 bg-white text-ui text-slate-800 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150",
            "focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20"
          )}
        />
      </label>
      <div className="max-h-72 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col">
        {section(s.unpinnedModules, unpinned, false)}
        {section(s.hiddenModules, hidden, true)}
        {unpinned.length === 0 && hidden.length === 0 && (
          <p className="m-0 py-4 text-center text-caption text-slate-400">
            {nothingLeft ? s.allModulesAdded : s.noModulesFound}
          </p>
        )}
      </div>
      <button
        type="button"
        className={cn(editBtn.base, editBtn.secondary, "w-full")}
        onClick={() => {
          onClose();
          onCreateDashboard();
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        {s.createCustomDashboard}
      </button>
    </MenuPopover>
  );
};
