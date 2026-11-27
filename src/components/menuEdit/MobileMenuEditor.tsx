import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Home, Plus, X } from "lucide-react";
import type { Language } from "../../utils/translations";
import type { SidebarGroup } from "../../utils/sidebarLayout";
import { cn } from "../../utils/cn";
import { CountChip, Dots, Grip, IconButton, MENU_EDIT_LAYER_ATTR, editBtn } from "./primitives";
import { menuEditStrings } from "./menuEditStrings";
import { DeleteGroupDialog } from "./DeleteGroupDialog";
import { useMobileDrag } from "./MobileDrag";
import { MobileItemActionsSheet } from "./MobileItemActionsSheet";
import { MobileAddModuleSheet } from "./MobileAddModuleSheet";
import { MobileGroupActionsSheet, MobileStartScreenSheet } from "./MobileGroupSheets";

/**
 * Mobile "Upraviť menu" (below `lg`): edits the sidebar groups, which on a phone
 * are the modules of the bottom bar. Mounted by Sidebar while the Start menu is
 * in edit mode; it covers the Start menu (which hides its own edit dialog below
 * `lg`).
 *
 * Artboards: "Mobil · Bočný panel v úpravách", "Mobil · Akcie položky",
 * "Mobil · Pridať modul".
 */
export interface MobileMenuEditorItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
  /** Custom dashboard (`dash_*`) or custom table (`ue_*`). */
  kind?: "dashboard" | "table";
}

export interface MobileMenuEditorProps {
  open: boolean;
  language: Language;
  /** Sidebar groups in order, each with its item ids in order. */
  groups: SidebarGroup[];
  /** Every module the user may see (visible in the system), pinned or not. */
  items: MobileMenuEditorItem[];
  /** Current start screen module id. */
  defaultPage: string;
  onSetDefaultPage: (id: string) => void;
  /** "Hotovo": leave edit mode (closes the Start menu too). */
  onDone: () => void;
  onMoveItemInGroup: (groupId: string, indexInGroup: number, direction: -1 | 1) => void;
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void;
  /** Drag result: put `itemId` into `groupId` at `index` (removed from wherever it was). */
  onInsertItem: (itemId: string, groupId: string, index: number) => void;
  /** Unpin from the sidebar (stays in the Start menu). */
  onUnpinItem: (itemId: string) => void;
  /** Pin an unpinned module into a group (appended). */
  onAddItemToGroup: (itemId: string, groupId: string) => void;
  onAddGroup: () => void;
  onRenameGroup: (groupId: string, title: string) => void;
  onMoveGroup: (groupId: string, direction: -1 | 1) => void;
  /** Deletes with an Undo toast; ask first with DeleteGroupDialog. Items go to the first remaining group. */
  onDeleteGroup: (groupId: string) => void;
  onCreateCustomDashboard?: () => void;
}

const scrollbarless = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Inline rename in a group header: 44px input + save / cancel, hint below. */
const RenameRow: React.FC<{
  language: Language;
  initial: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}> = ({ language, initial, onSave, onCancel }) => {
  const s = menuEditStrings(language);
  const [draft, setDraft] = useState(initial);
  const save = () => {
    const t = draft.trim();
    if (t && t !== initial) onSave(t);
    else onCancel();
  };
  return (
    <div className="pt-4 pb-1 pl-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          aria-label={s.groupName}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl border border-indigo-300 bg-white text-body text-slate-800 outline-none ring-2 ring-indigo-500/20"
        />
        <IconButton touch aria-label={s.saveName} onClick={save} className="text-indigo-600 hover:bg-indigo-50">
          <Check className="size-5" />
        </IconButton>
        <IconButton touch aria-label={s.cancel} onClick={onCancel} className="-mr-2 hover:bg-slate-100">
          <X className="size-5" />
        </IconButton>
      </div>
      <span className="text-caption text-slate-500">{s.renameHint}</span>
    </div>
  );
};

const ItemIcon: React.FC<{ item: MobileMenuEditorItem }> = ({ item }) => (
  <item.icon className="size-5 shrink-0" style={{ color: item.color || "#4f46e5" }} />
);

const MobileMenuEditorBody: React.FC<MobileMenuEditorProps> = (props) => {
  const { language, groups, items, defaultPage, onDone, onAddGroup, onRenameGroup, onMoveGroup, onDeleteGroup } = props;
  const s = menuEditStrings(language);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { drag, startDrag } = useMobileDrag(scrollRef, props.onInsertItem);

  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  // "Nová skupina": rename the group that shows up after onAddGroup.
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!knownIds.current) return;
    const fresh = groups.find((g) => !knownIds.current!.has(g.id));
    if (fresh) {
      knownIds.current = null;
      setRenaming(fresh.id);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      );
    }
  }, [groups]);

  const titleOf = (g: SidebarGroup, i: number) => g.title.trim() || s.groupFallback(i + 1);
  const closeActions = useCallback(() => setActionsFor(null), []);
  const closeAdd = useCallback(() => setAddTo(null), []);
  const closeGroupMenu = useCallback(() => setGroupMenu(null), []);
  const closeStart = useCallback(() => setStartOpen(false), []);

  const dragItem = drag ? byId.get(drag.id) : undefined;
  const wrapTop = wrapRef.current?.getBoundingClientRect().top ?? 0;
  const startItem = byId.get(defaultPage);
  const menuGroupIndex = groups.findIndex((g) => g.id === groupMenu);
  const menuGroup = menuGroupIndex >= 0 ? groups[menuGroupIndex] : null;
  const delIndex = groups.findIndex((g) => g.id === deleting);
  const delGroup = delIndex >= 0 ? groups[delIndex] : null;
  const delTarget = groups.find((g) => g.id !== deleting);
  const addGroupIndex = groups.findIndex((g) => g.id === addTo);

  const insertionLine = (
    <div aria-hidden="true" className="relative h-0.5 my-0.75 ml-7.5 rounded-full bg-indigo-600">
      <span className="absolute -left-1 -top-0.75 size-2 rounded-full bg-indigo-600" />
    </div>
  );

  return (
    <motion.div
      {...{ [MENU_EDIT_LAYER_ATTR]: "" }}
      role="dialog"
      aria-label={s.title}
      className="view-size-fixed fixed inset-0 z-[100002] lg:hidden bg-white flex flex-col overflow-hidden text-slate-800"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header className="px-4 pt-4 pb-3 border-b border-slate-100 flex flex-col gap-1 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="m-0 flex-1 type-panel-title text-slate-900">{s.title}</h1>
          <button type="button" onClick={onDone} className={cn(editBtn.base, editBtn.primary)}>
            <Check className="size-4" aria-hidden="true" />
            {s.done}
          </button>
        </div>
        <p className="m-0 text-caption text-slate-500">
          {s.mobileHintBefore} <Grip className="align-[-3px]" />
          {s.mobileHintAfter}
        </p>
      </header>

      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <div ref={scrollRef} className={cn("h-full overflow-y-auto px-4 pt-3 pb-12", scrollbarless)}>
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            className="w-full min-h-12 py-1.5 pl-3.5 pr-2 rounded-2xl border-0 bg-slate-50 flex items-center gap-3 text-left cursor-pointer transition-[background-color,transform] duration-150 hover:bg-slate-100 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <Home className="size-5 text-indigo-600 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-caption text-slate-500">{s.startScreen}</span>
              <span className="text-body font-semibold text-slate-800 truncate">{startItem?.label ?? defaultPage}</span>
            </span>
            <ChevronRight className="size-5 text-slate-400 shrink-0" aria-hidden="true" />
          </button>

          {groups.map((g, gi) => {
            const title = titleOf(g, gi);
            const rows = g.items.filter((id) => byId.has(id));
            const lineHere = (idx: number) =>
              drag?.target && drag.target.groupId === g.id && drag.target.index === idx ? insertionLine : null;
            let counter = 0;
            return (
              <section key={g.id} data-mgroup={g.id}>
                {renaming === g.id ? (
                  <RenameRow
                    language={language}
                    initial={g.title}
                    onSave={(t) => {
                      onRenameGroup(g.id, t);
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <div className="flex items-center gap-2 pt-4 pb-1 pl-1.5">
                    <span className="flex-1 min-w-0 truncate type-overline text-slate-500">{title}</span>
                    <CountChip count={rows.length} />
                    <IconButton touch aria-label={s.addModuleToGroup(title)} onClick={() => setAddTo(g.id)}>
                      <Plus className="size-5" />
                    </IconButton>
                    <IconButton
                      touch
                      aria-label={s.groupOptions(title)}
                      open={groupMenu === g.id}
                      className="-mr-2"
                      onClick={() => setGroupMenu(g.id)}
                    >
                      <Dots />
                    </IconButton>
                  </div>
                )}
                {rows.map((id) => {
                  const item = byId.get(id)!;
                  const isDragged = drag?.id === id;
                  const line = isDragged ? null : lineHere(counter);
                  if (!isDragged) counter++;
                  return (
                    <React.Fragment key={id}>
                      {line}
                      <div
                        data-mrow={id}
                        className={cn(
                          "flex items-center gap-2 min-h-12 pl-0.5 rounded-xl bg-white transition-opacity duration-150",
                          isDragged && "opacity-35"
                        )}
                      >
                        <span
                          role="presentation"
                          className="w-7 h-11 flex items-center justify-center shrink-0 cursor-grab"
                          style={{ touchAction: "none" }}
                          onPointerDown={(e) => startDrag(e, id)}
                        >
                          <Grip />
                        </span>
                        <ItemIcon item={item} />
                        <span className="flex-1 min-w-0 truncate text-body font-medium text-slate-800">{item.label}</span>
                        <IconButton touch aria-label={s.itemActions(item.label)} className="-mr-2" onClick={() => setActionsFor(id)}>
                          <Dots />
                        </IconButton>
                      </div>
                    </React.Fragment>
                  );
                })}
                {lineHere(counter)}
              </section>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-12 pointer-events-none bg-gradient-to-b from-white/0 to-white"
        />
        {drag && dragItem && (
          <div
            aria-hidden="true"
            className="absolute left-3 right-3 h-13 pl-1.5 pr-1 rounded-xl bg-white border border-indigo-200 shadow-[0_10px_15px_-3px_rgb(15_23_42/0.15),0_4px_6px_-4px_rgb(15_23_42/0.1)] flex items-center gap-2 pointer-events-none"
            style={{ top: drag.y - drag.grab - wrapTop }}
          >
            <span className="w-7 h-11 flex items-center justify-center shrink-0 cursor-grabbing">
              <Grip active />
            </span>
            <ItemIcon item={dragItem} />
            <span className="flex-1 min-w-0 truncate text-body font-medium text-slate-800">{dragItem.label}</span>
            <span className="text-caption pr-3 font-semibold text-indigo-700">{s.moving}</span>
          </div>
        )}
      </div>

      <footer className="px-4 pt-3 pb-4 border-t border-slate-100 bg-white shrink-0">
        <button
          type="button"
          onClick={() => {
            knownIds.current = new Set(groups.map((g) => g.id));
            onAddGroup();
          }}
          className={cn(editBtn.base, editBtn.secondary, "w-full h-11")}
        >
          <Plus className="size-4" aria-hidden="true" />
          {s.newGroup}
        </button>
      </footer>

      <MobileItemActionsSheet
        open={!!actionsFor}
        onClose={closeActions}
        language={language}
        item={actionsFor ? byId.get(actionsFor) ?? null : null}
        groups={groups}
        groupTitle={titleOf}
        onMove={props.onMoveItemInGroup}
        onMoveToGroup={props.onMoveItemToGroup}
        onSetDefault={props.onSetDefaultPage}
        onUnpin={props.onUnpinItem}
      />
      <MobileAddModuleSheet
        open={!!addTo}
        onClose={closeAdd}
        language={language}
        groupId={addTo}
        groupName={addGroupIndex >= 0 ? titleOf(groups[addGroupIndex], addGroupIndex) : ""}
        groups={groups}
        items={items}
        onAdd={props.onAddItemToGroup}
        onCreateCustomDashboard={props.onCreateCustomDashboard}
      />
      <MobileStartScreenSheet
        open={startOpen}
        onClose={closeStart}
        language={language}
        items={items}
        current={defaultPage}
        onPick={props.onSetDefaultPage}
      />
      <MobileGroupActionsSheet
        open={!!menuGroup}
        onClose={closeGroupMenu}
        language={language}
        name={menuGroup ? titleOf(menuGroup, menuGroupIndex) : ""}
        index={menuGroupIndex}
        count={groups.length}
        onRename={() => menuGroup && setRenaming(menuGroup.id)}
        onMove={(d) => menuGroup && onMoveGroup(menuGroup.id, d)}
        onDelete={() => menuGroup && setDeleting(menuGroup.id)}
      />
      <DeleteGroupDialog
        open={!!delGroup}
        title={delGroup ? s.deleteGroupTitle(titleOf(delGroup, delIndex)) : ""}
        body={
          delGroup && delGroup.items.length > 0 && delTarget
            ? s.deleteSidebarGroupBody(delGroup.items.length, titleOf(delTarget, groups.indexOf(delTarget)))
            : s.deleteSidebarGroupEmpty
        }
        note={s.deleteSidebarGroupNote}
        cancelLabel={s.cancel}
        confirmLabel={s.deleteGroup}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDeleteGroup(deleting);
          setDeleting(null);
        }}
      />
    </motion.div>
  );
};

export const MobileMenuEditor: React.FC<MobileMenuEditorProps> = (props) => (
  <AnimatePresence>{props.open && <MobileMenuEditorBody key="mobile-menu-editor" {...props} />}</AnimatePresence>
);
