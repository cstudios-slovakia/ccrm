import React, { useMemo, useState } from "react";
import { GripVertical, Lock, Plus, Tag, X } from "lucide-react";
import type { Project } from "../types";
import type { Language } from "../utils/translations";
import {
  PROJECT_STATUS_GROUPS,
  NEW_PROJECT_STATUS_COLOR,
  defaultProjectStatus,
  projectStatusKeyFor,
  projectStatusLabel,
  type ProjectStatusDef,
  type ProjectStatusGroup,
} from "../utils/projects";
import { ColorPicker } from "./ui/ColorPicker";
import { CustomSelect } from "./ui/CustomSelect";
import { InlineRenameName } from "./ui/InlineRenameName";

/*
  ── PROJECT STATUSES EDITOR ─────────────────────────────

  The project counterpart of the lead pipeline stages editor in SettingsView,
  built the same way: the statuses sit under one divider per group, and
  dragging a row across a divider moves it into that group. A status is
  renamed in place and recoloured from its dot.

  What a group means is in utils/projects.ts — in short, "completed" stamps
  the finish date and both closed groups stop the deadline counting down.
  Renaming changes only the label; the key a project stores never moves, so a
  rename rewrites no project.
*/

interface ProjectStatusSettingsProps {
  statuses: ProjectStatusDef[];
  setStatuses: React.Dispatch<React.SetStateAction<ProjectStatusDef[]>>;
  /** For "used by N projects", and to move projects off a status being deleted. */
  projects: Project[];
  setProjects?: (updater: Project[] | ((prev: Project[]) => Project[])) => void;
  userLanguage: Language;
  canEdit: boolean;
}

type Row = { type: "divider"; group: ProjectStatusGroup } | { type: "status"; def: ProjectStatusDef };

const isOpenGroup = (g: ProjectStatusGroup) => g === "new" || g === "in_progress";

export const ProjectStatusSettings: React.FC<ProjectStatusSettingsProps> = ({
  statuses,
  setStatuses,
  projects,
  setProjects,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const toast = (msg: string) => (window as unknown as { showToast?: (m: string) => void }).showToast?.(msg);
  const labelOf = (key: string) => projectStatusLabel(key, t, statuses);

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<ProjectStatusGroup>("in_progress");

  const groupInfo = (g: ProjectStatusGroup): { name: string; desc: string; chip: string } => {
    switch (g) {
      case "new":
        return {
          name: t("New", "Nové", "Új"),
          desc: t("Where every new project starts", "Tu začína každý nový projekt", "Itt indul minden új projekt"),
          chip: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "in_progress":
        return {
          name: t("In progress", "Prebiehajúce", "Folyamatban"),
          desc: t("The project is being worked on", "Na projekte sa pracuje", "A projekten dolgoznak"),
          chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
        };
      case "completed":
        return {
          name: t("Completed", "Dokončené", "Befejezett"),
          desc: t("Closed and done — stamps the finish date", "Uzavreté a hotové — zapíše dátum dokončenia", "Lezárva és kész — rögzíti a befejezés dátumát"),
          chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "cancelled":
        return {
          name: t("Cancelled", "Zrušené", "Törölt"),
          desc: t("Closed without finishing", "Uzavreté bez dokončenia", "Befejezés nélkül lezárva"),
          chip: "bg-rose-50 text-rose-700 border-rose-200",
        };
    }
  };

  const usage = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      if (p.status) counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [projects]);

  // The table exactly as rendered: each group's divider followed by its statuses.
  const rows: Row[] = PROJECT_STATUS_GROUPS.flatMap((group) => [
    { type: "divider" as const, group },
    ...statuses.filter((d) => d.group === group).map((def) => ({ type: "status" as const, def })),
  ]);

  const nameTaken = (name: string, exceptKey?: string) =>
    statuses.some((d) => d.key !== exceptKey && labelOf(d.key).toLowerCase() === name.toLowerCase());

  const openCountWithout = (key: string) => statuses.filter((d) => d.key !== key && isOpenGroup(d.group)).length;

  /** Drops `key` at row `targetIdx`; the divider above it decides its group. */
  const handleMoveToIndex = (key: string, targetIdx: number) => {
    if (!canEdit) return;
    const items = [...rows];
    const from = items.findIndex((r) => r.type === "status" && r.def.key === key);
    if (from === -1) return;
    // Same walk as the lead stages: out of the list, back in at the target
    // index — below the target when dragged down, above it when dragged up.
    const [dragged] = items.splice(from, 1);
    items.splice(targetIdx, 0, dragged);

    const next: ProjectStatusDef[] = [];
    let group: ProjectStatusGroup = "new";
    items.forEach((r) => {
      if (r.type === "divider") group = r.group;
      else next.push({ ...r.def, group });
    });
    if (!next.some((d) => isOpenGroup(d.group))) {
      toast(t(
        "At least one status must stay open (New or In progress) — that is where projects start.",
        "Aspoň jeden stav musí zostať otvorený (Nové alebo Prebiehajúce) — tam projekty začínajú.",
        "Legalább egy állapotnak nyitottnak kell maradnia (Új vagy Folyamatban) — ott indulnak a projektek.",
      ));
      return;
    }
    setStatuses(PROJECT_STATUS_GROUPS.flatMap((g) => next.filter((d) => d.group === g)));
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
      toast(t("This project status already exists!", "Tento stav projektu už existuje!", "Ez a projekt állapot már létezik!"));
      return;
    }
    // Keys still sitting on projects count as taken too, so a new status never
    // silently inherits the projects of one deleted earlier.
    const taken = [...statuses.map((d) => d.key), ...Object.keys(usage)];
    const def: ProjectStatusDef = { key: projectStatusKeyFor(label, taken), label, color: NEW_PROJECT_STATUS_COLOR, group: newGroup };
    setStatuses((prev) => PROJECT_STATUS_GROUPS.flatMap((g) => [...prev, def].filter((d) => d.group === g)));
    setNewName("");
  };

  const handleRemove = (def: ProjectStatusDef) => {
    if (!canEdit) return;
    if (isOpenGroup(def.group) && openCountWithout(def.key) === 0) {
      toast(t(
        "At least one open status (New or In progress) is required — that is where projects start.",
        "Je potrebný aspoň jeden otvorený stav (Nové alebo Prebiehajúce) — tam projekty začínajú.",
        "Legalább egy nyitott állapot (Új vagy Folyamatban) szükséges — ott indulnak a projektek.",
      ));
      return;
    }
    const remaining = statuses.filter((d) => d.key !== def.key);
    const fallback = defaultProjectStatus(remaining);
    const inUse = usage[def.key] || 0;
    const name = labelOf(def.key);
    const fallbackName = projectStatusLabel(fallback, t, remaining);
    const question = inUse > 0
      ? t(
          `Remove the status "${name}"? ${inUse} project(s) in it will be moved to "${fallbackName}".`,
          `Odstrániť stav "${name}"? ${inUse} projekt(y) v ňom sa presunie do stavu "${fallbackName}".`,
          `Eltávolítja a(z) "${name}" állapotot? A benne lévő ${inUse} projekt a(z) "${fallbackName}" állapotba kerül.`,
        )
      : t(
          `Remove the status "${name}"?`,
          `Odstrániť stav "${name}"?`,
          `Eltávolítja a(z) "${name}" állapotot?`,
        );
    if (!confirm(question)) return;
    setStatuses(remaining);
    if (inUse > 0 && setProjects) {
      setProjects((prev) => prev.map((p) => (p.status === def.key ? { ...p, status: fallback } : p)));
    }
  };

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
      <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
        <Tag className="h-4.5 w-4.5 text-indigo-500" />
        {t("Project statuses", "Stavy projektov", "Projekt állapotok")}
      </h3>

      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
        {t(
          "Drag statuses up or down relative to the group dividers to reorder them and change their group. Click a status's colour dot to change its colour.",
          "Presunutím stavov nahor alebo nadol vzhľadom na oddeľovače skupín zmeníte ich poradie aj skupinu. Kliknutím na farebný bod zmeníte farbu stavu.",
          "Húzza az állapotokat a csoportelválasztókhoz képest fel vagy le a sorrend és a csoport módosításához. A színes pontra kattintva módosíthatja a színt.",
        )}
      </p>

      <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-inner bg-white/50">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 text-center">{t("Drag", "Ťahať", "Húzás")}</th>
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-44">{t("Colour", "Farba", "Szín")}</th>
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("Status name", "Názov stavu", "Állapot neve")}</th>
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-36">{t("Group", "Skupina", "Csoport")}</th>
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-28 text-center">{t("Projects", "Projekty", "Projektek")}</th>
              <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">{t("Delete", "Zmazať", "Törlés")}</th>
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
                    data-testid={`project-status-divider-${row.group}`}
                    onDragOver={onDragOver}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={onDrop}
                    className={`transition-all border-b border-slate-200/60 duration-200 ${
                      isDragOver ? "bg-indigo-50/60 scale-[0.99] border-2 border-dashed border-indigo-300" : "bg-slate-100/70"
                    }`}
                  >
                    <td colSpan={6} className="py-3 px-4 select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-900 font-extrabold uppercase tracking-wide">{info.name}</span>
                        <span className="text-[9px] text-slate-400 font-bold ml-1">{info.desc}</span>
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
                  data-testid={`project-status-row-${def.key}`}
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
                      <span className="text-[9px] font-black uppercase text-slate-400">{def.color}</span>
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
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase border"
                        style={{ backgroundColor: `${def.color}12`, color: def.color, borderColor: `${def.color}35` }}
                      >
                        {label}
                      </span>
                    </InlineRenameName>
                  </td>

                  <td className="py-3 px-4 align-middle select-none">
                    <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border tracking-widest ${info.chip}`}>
                      {info.name}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center align-middle select-none">
                    <span className={`text-xs font-black ${count ? "text-slate-700" : "text-slate-300"}`}>{count}</span>
                  </td>

                  <td className="py-3 px-4 text-center align-middle">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => handleRemove(def)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block cursor-pointer"
                        title={t("Remove status", "Odstrániť stav", "Állapot eltávolítása")}
                        aria-label={t("Remove status", "Odstrániť stav", "Állapot eltávolítása")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-[9px] text-slate-300 font-bold block uppercase select-none">{t("Locked", "Zamknuté", "Zárolt")}</span>
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
            placeholder={t("Add new project status...", "Pridať nový stav projektu...", "Új projekt állapot hozzáadása...")}
            aria-label={t("New project status", "Nový stav projektu", "Új projekt állapot")}
            className="flex-1 min-w-[150px] px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
          />
          <div className="w-40">
            <CustomSelect
              value={newGroup}
              onChange={(v) => setNewGroup(v as ProjectStatusGroup)}
              options={PROJECT_STATUS_GROUPS.map((g) => ({ value: g, label: groupInfo(g).name }))}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> {t("Add status", "Pridať stav", "Állapot hozzáadása")}
          </button>
        </form>
      )}
    </div>
  );
};
