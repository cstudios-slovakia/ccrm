import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowRightLeft, ArrowUp, Check, ChevronLeft, ChevronRight, Home, PinOff } from "lucide-react";
import type { Language } from "../../utils/translations";
import type { SidebarGroup } from "../../utils/sidebarLayout";
import { cn } from "../../utils/cn";
import { menuEditStrings } from "./menuEditStrings";
import { mobileEditStrings } from "./MobileStrings";
import { ActionRow, MobileSheet, SheetCancel } from "./MobileSheet";
import type { MobileMenuEditorItem } from "./MobileMenuEditor";

/** Item ⋯ sheet ("Mobil · Akcie položky") with the "move to group" picker as a second view. */
export interface MobileItemActionsSheetProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  item: MobileMenuEditorItem | null;
  groups: SidebarGroup[];
  groupTitle: (g: SidebarGroup, index: number) => string;
  onMove: (groupId: string, indexInGroup: number, direction: -1 | 1) => void;
  onMoveToGroup: (itemId: string, groupId: string) => void;
  onSetDefault: (id: string) => void;
  onUnpin: (itemId: string) => void;
}

export const MobileItemActionsSheet: React.FC<MobileItemActionsSheetProps> = ({
  open,
  onClose,
  language,
  item,
  groups,
  groupTitle,
  onMove,
  onMoveToGroup,
  onSetDefault,
  onUnpin,
}) => {
  const s = menuEditStrings(language);
  const m = mobileEditStrings(language);
  const [view, setView] = useState<"actions" | "groups">("actions");
  // Keep the last item while the exit animation plays.
  const [shown, setShown] = useState<MobileMenuEditorItem | null>(item);
  useEffect(() => {
    if (item) setShown(item);
    if (open) setView("actions");
  }, [open, item]);

  const cur = item ?? shown;
  const gi = cur ? groups.findIndex((g) => g.items.includes(cur.id)) : -1;
  const group = gi >= 0 ? groups[gi] : null;
  const index = group && cur ? group.items.indexOf(cur.id) : -1;
  const n = group ? group.items.length : 0;
  const name = group ? groupTitle(group, gi) : "";
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <MobileSheet open={open && !!cur} onClose={onClose} label={cur ? s.itemActions(cur.label) : ""}>
      {cur && (
        <div className="px-4 pb-4 flex flex-col gap-1 overflow-y-auto min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {view === "actions" ? (
            <>
              <div className="flex items-center gap-3 px-1 pb-3 mb-1 border-b border-slate-100">
                <span className="size-11 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                  <cur.icon className="size-5" style={{ color: cur.color || "#4f46e5" }} />
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="type-panel-title text-slate-900 truncate">{cur.label}</span>
                  {group && <span className="text-caption text-slate-500">{s.groupPosition(name, index + 1, n)}</span>}
                </span>
              </div>
              <ActionRow
                icon={<ArrowUp className="size-5" />}
                label={s.moveUp}
                disabled={index <= 0}
                meta={index === 0 ? s.isFirst : undefined}
                onClick={() => group && (onMove(group.id, index, -1), onClose())}
              />
              <ActionRow
                icon={<ArrowDown className="size-5" />}
                label={s.moveDown}
                disabled={!group || index >= n - 1}
                meta={group && index === n - 1 ? s.isLast : undefined}
                onClick={() => group && (onMove(group.id, index, 1), onClose())}
              />
              <ActionRow
                icon={<ArrowRightLeft className="size-5" />}
                label={s.moveToGroup}
                meta={name}
                trailing={<ChevronRight className="size-4 text-slate-400" aria-hidden="true" />}
                onClick={() => setView("groups")}
              />
              <ActionRow icon={<Home className="size-5" />} label={s.setAsStart} onClick={run(() => onSetDefault(cur.id))} />
              <div className="h-px bg-slate-100 my-1" />
              <ActionRow
                icon={<PinOff className="size-5" />}
                label={s.unpinFromPanel}
                hint={s.staysInStartMenu}
                onClick={run(() => onUnpin(cur.id))}
              />
              <SheetCancel label={s.cancel} onClick={onClose} />
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-100">
                <button
                  type="button"
                  aria-label={m.back}
                  onClick={() => setView("actions")}
                  className="size-11 rounded-xl inline-flex items-center justify-center text-slate-500 cursor-pointer transition-[background-color,transform] active:scale-95 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <span className="type-panel-title text-slate-900">{s.moveToGroup}</span>
              </div>
              <div role="radiogroup" aria-label={s.moveToGroup} className="flex flex-col gap-1">
                {groups.map((g, i) => {
                  const current = g.id === group?.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      onClick={() => {
                        if (!current) onMoveToGroup(cur.id, g.id);
                        onClose();
                      }}
                      className={cn(
                        "w-full min-h-12 px-3 rounded-xl flex items-center gap-3 text-left text-body font-medium cursor-pointer transition-[background-color,transform] duration-150 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                        current ? "bg-indigo-50 text-indigo-700" : "text-slate-800 hover:bg-slate-50"
                      )}
                    >
                      <span className="flex-1 truncate">{groupTitle(g, i)}</span>
                      {current && <Check className="size-5" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <SheetCancel label={s.cancel} onClick={() => setView("actions")} />
            </>
          )}
        </div>
      )}
    </MobileSheet>
  );
};
