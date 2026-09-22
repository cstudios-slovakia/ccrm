import React, { useState } from "react";
import {
  Pin,
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Check,
  RotateCcw,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import type { Language } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";
import { normalizeSidebarGroups, type SidebarGroup } from "../utils/sidebarLayout";
import { cn } from "../utils/cn";

interface SidebarSettingsProps {
  systemLanguage: Language;
  compact?: boolean;
}

export const SidebarSettings: React.FC<SidebarSettingsProps> = ({ systemLanguage, compact = false }) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  const [sidebarPinned, setSidebarPinned] = useUserPref("sidebarPinned");
  const [sidebarCompactness, setSidebarCompactness] = useUserPref("sidebarCompactness");
  const [sidebarUnpinnedStyle, setSidebarUnpinnedStyle] = useUserPref("sidebarUnpinnedStyle");
  const [storedGroups, setStoredGroups] = useUserPref("sidebarGroups");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  // Fallback defaults if groups are not customized
  const activeGroups = normalizeSidebarGroups(storedGroups, []);

  const handleTogglePin = (pinned: boolean) => {
    setSidebarPinned(pinned);
  };

  const handleCompactnessChange = (level: "compact" | "comfortable" | "spacious") => {
    setSidebarCompactness(level);
  };

  const handleUnpinnedStyleChange = (style: "overlay" | "dock") => {
    setSidebarUnpinnedStyle(style);
  };

  const handleStartRenameGroup = (group: SidebarGroup) => {
    setEditingGroupId(group.id);
    setEditingTitle(group.title || "");
  };

  const handleSaveRenameGroup = () => {
    if (!editingGroupId) return;
    const current = normalizeSidebarGroups(storedGroups, []);
    const updated = current.map((g) =>
      g.id === editingGroupId ? { ...g, title: editingTitle.trim() } : g
    );
    setStoredGroups(updated);
    setEditingGroupId(null);
    setEditingTitle("");
  };

  const handleAddGroup = () => {
    if (!newGroupTitle.trim()) return;
    const current = normalizeSidebarGroups(storedGroups, []);
    const newGroup: SidebarGroup = {
      id: `group_${Date.now()}`,
      title: newGroupTitle.trim(),
      items: []
    };
    setStoredGroups([...current, newGroup]);
    setNewGroupTitle("");
    setIsAddingGroup(false);
  };

  const handleDeleteGroup = (groupId: string) => {
    const current = normalizeSidebarGroups(storedGroups, []);
    if (current.length <= 1) return;
    const toDelete = current.find((g) => g.id === groupId);
    const remaining = current.filter((g) => g.id !== groupId);
    if (toDelete && toDelete.items.length > 0 && remaining.length > 0) {
      remaining[0].items.push(...toDelete.items);
    }
    setStoredGroups(remaining);
  };

  const handleResetGroups = () => {
    if (
      window.confirm(
        t(
          "Reset sidebar groups and layout to defaults?",
          "Obnoviť predvolené skupiny a rozloženie bočného menu?",
          "Visszaállítja az oldalsáv csoportjait és elrendezését az alapértelmezettre?"
        )
      )
    ) {
      setStoredGroups(null);
    }
  };

  return (
    <div className={cn("text-left", compact ? "space-y-4" : "space-y-6 pt-5 border-t border-slate-200/80")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {t("Sidebar & Navigation", "Bočné menu & Navigácia", "Oldalsáv és Navigáció")}
            </h4>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5">
              {t(
                "Customize left sidebar behavior, density, depth style, and groups",
                "Prispôsobte správanie ľavého menu, hustotu, hĺbku a skupiny",
                "Szabja testre a bal oldalsáv működését, sűrűségét, stílusát és csoportjait"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Main Settings */}
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
        {/* 1. Pinning Behavior */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
            {t("Sidebar Attachment", "Uchytenie bočného menu", "Oldalsáv rögzítése")}
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleTogglePin(false)}
              className={cn(
                "p-3 rounded-xl border text-left flex flex-col gap-2 transition-all cursor-pointer relative",
                !sidebarPinned
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="flex items-center justify-between">
                <PanelLeftClose className={cn("h-4 w-4", !sidebarPinned ? "text-indigo-600" : "text-slate-400")} />
                {!sidebarPinned && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  {t("Floating Overlay", "Plávajúce menu", "Lebegő menü")}
                </span>
                <span className="text-[9.5px] text-slate-500 leading-tight block mt-0.5">
                  {t("Floats over UI on hover", "Rozbalí sa pri prechode myšou", "Rámutatáskor kinyílik")}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTogglePin(true)}
              className={cn(
                "p-3 rounded-xl border text-left flex flex-col gap-2 transition-all cursor-pointer relative",
                sidebarPinned
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="flex items-center justify-between">
                <Pin className={cn("h-4 w-4", sidebarPinned ? "text-indigo-600 fill-indigo-600" : "text-slate-400")} />
                {sidebarPinned && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  {t("Pinned Column", "Pripnutý stĺpec", "Rögzített oszlop")}
                </span>
                <span className="text-[9.5px] text-slate-500 leading-tight block mt-0.5">
                  {t("Permanent column with depth shadow", "Trvalý stĺpec s vnútorným tieňom", "Állandó oszlop belső árnyékkal")}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Compactness Density */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
            {t("Compactness & Density", "Hustota a veľkosť", "Kompaktság és méret")}
          </label>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "compact", label: t("Compact", "Kompaktné", "Kompakt"), sub: "64px / 224px" },
                { id: "comfortable", label: t("Comfortable", "Pohodlné", "Kényelmes"), sub: "80px / 256px" },
                { id: "spacious", label: t("Spacious", "Priestranné", "Tágas"), sub: "96px / 288px" }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleCompactnessChange(opt.id)}
                className={cn(
                  "p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer",
                  sidebarCompactness === opt.id
                    ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                    : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-bold block",
                    sidebarCompactness === opt.id ? "text-indigo-600" : "text-slate-700"
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-[8.5px] text-slate-500 block">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Unpinned Interaction Style */}
        <div className={cn("p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3", !compact && "md:col-span-2")}>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
              {t("Unpinned Interaction Style", "Štýl nepripnutého menu", "Nem rögzített oldalsáv stílusa")}
            </label>
            <span className="text-[9.5px] text-slate-500">
              {t("Active when sidebar is unpinned", "Platí, keď menu nie je pripnuté", "Akkor él, ha az oldalsáv nincs rögzítve")}
            </span>
          </div>

          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            <button
              type="button"
              onClick={() => handleUnpinnedStyleChange("overlay")}
              className={cn(
                "p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer",
                sidebarUnpinnedStyle === "overlay"
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="p-2 rounded-xl bg-slate-100 text-slate-600 shrink-0">
                <PanelLeftOpen className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-800 block">
                  {t("Standard Flyout", "Štandardné vysunutie", "Kinyíló sáv")}
                </span>
                <span className="text-[10px] text-slate-500 leading-snug block mt-0.5">
                  {t(
                    "Expands sidebar smoothly on hover with full labels",
                    "Plynule vysunie celé menu s popiskami pri prejdení myšou",
                    "Rámutatáskor kinyitja az oldalsávot a teljes feliratokkal"
                  )}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleUnpinnedStyleChange("dock")}
              className={cn(
                "p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer",
                sidebarUnpinnedStyle === "dock"
                  ? "bg-indigo-50/70 border-indigo-500/60 ring-2 ring-indigo-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/60"
              )}
            >
              <div className="p-2 rounded-xl bg-purple-100 text-purple-600 shrink-0">
                <Sparkles className="h-4 w-4 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  {t("Dynamic macOS Dock", "Dynamický macOS Dock", "Dinamikus macOS Dock")}
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-700">
                    NEW
                  </span>
                </span>
                <span className="text-[10px] text-slate-500 leading-snug block mt-0.5">
                  {t(
                    "Fluid cursor-distance icon magnification with floating tooltips",
                    "Zväčšovanie ikon podľa vzdialenosti kurzora a plávajúce popisky",
                    "Kurzortávolság alapú nagyítás lebegő feliratokkal"
                  )}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 4. Navigation Groups Organizer */}
        <div className={cn("p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3", !compact && "md:col-span-2")}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                {t("Navigation Groups", "Navigačné skupiny", "Navigációs csoportok")}
              </label>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {t(
                  "Organize menu items into named groups (divided by lines when collapsed)",
                  "Usporiadajte položky do skupín (v zbalenom stave oddelené čiarou)",
                  "Rendszerezze a menüpontokat csoportokba (összecsukva elválasztó vonallal)"
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetGroups}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title={t("Reset to default layout", "Obnoviť predvolené rozloženie", "Alapértelmezett elrendezés visszaállítása")}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t("Reset", "Obnoviť", "Visszaállítás")}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddingGroup(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="h-3 w-3" />
                <span>{t("New Group", "Nová skupina", "Új csoport")}</span>
              </button>
            </div>
          </div>

          {/* Add Group Inline Form */}
          {isAddingGroup && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 animate-in fade-in duration-200">
              <input
                type="text"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                placeholder={t("Group name (e.g. Sales, Core, Finance)...", "Názov skupiny (napr. Predaj, Jadro)...", "Csoport neve...")}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddGroup();
                  if (e.key === "Escape") setIsAddingGroup(false);
                }}
              />
              <button
                type="button"
                onClick={handleAddGroup}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsAddingGroup(false)}
                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Groups List */}
          <div className="space-y-2">
            {activeGroups.map((grp, idx) => (
              <div
                key={grp.id}
                className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-[10px] font-black text-slate-500 w-4">{idx + 1}.</span>
                  {editingGroupId === grp.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-indigo-400 text-slate-800 text-xs font-semibold focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRenameGroup();
                          if (e.key === "Escape") setEditingGroupId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveRenameGroup}
                        className="p-1 rounded-md bg-emerald-600 text-white cursor-pointer"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {grp.title || t("Main Section", "Hlavná sekcia", "Fő szekció")}
                      </span>
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-700 font-semibold">
                        {grp.items.length} {t("items", "položiek", "elem")}
                      </span>
                    </div>
                  )}
                </div>

                {editingGroupId !== grp.id && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartRenameGroup(grp)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                      title={t("Rename group", "Premenovať skupinu", "Csoport átnevezése")}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {activeGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(grp.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={t("Delete group", "Vymazať skupinu", "Csoport törlése")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
