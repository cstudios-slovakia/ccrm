import React from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Trash } from "lucide-react";
import type { Language } from "../../utils/translations";
import { cn } from "../../utils/cn";
import { menuEditStrings } from "./menuEditStrings";
import { mobileEditStrings } from "./MobileStrings";
import { ActionRow, MobileSheet, SheetCancel } from "./MobileSheet";
import type { MobileMenuEditorItem } from "./MobileMenuEditor";

/** Group ⋯ sheet: rename, move up/down, delete (ask first). */
export const MobileGroupActionsSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  language: Language;
  name: string;
  index: number;
  count: number;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}> = ({ open, onClose, language, name, index, count, onRename, onMove, onDelete }) => {
  const s = menuEditStrings(language);
  return (
    <MobileSheet open={open} onClose={onClose} label={s.groupOptions(name)}>
      <div className="px-4 pb-4 flex flex-col gap-1">
        <div className="px-1 pb-3 mb-1 border-b border-slate-100 flex flex-col">
          <span className="type-panel-title text-slate-900 truncate">{name}</span>
          <span className="text-caption text-slate-500">{s.groupOptionsShort}</span>
        </div>
        <ActionRow icon={<Pencil className="size-5" />} label={s.rename} onClick={() => (onClose(), onRename())} />
        <ActionRow
          icon={<ArrowUp className="size-5" />}
          label={s.moveUp}
          disabled={index <= 0}
          meta={index === 0 ? s.isFirst : undefined}
          onClick={() => (onMove(-1), onClose())}
        />
        <ActionRow
          icon={<ArrowDown className="size-5" />}
          label={s.moveDown}
          disabled={index >= count - 1}
          meta={index === count - 1 ? s.isLast : undefined}
          onClick={() => (onMove(1), onClose())}
        />
        <div className="h-px bg-slate-100 my-1" />
        <ActionRow
          icon={<Trash className="size-5" />}
          label={s.deleteGroupEllipsis}
          danger
          disabled={count <= 1}
          onClick={() => (onClose(), onDelete())}
        />
        <SheetCancel label={s.cancel} onClick={onClose} />
      </div>
    </MobileSheet>
  );
};

/** Start-screen picker: every module, check on the current one. */
export const MobileStartScreenSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  language: Language;
  items: MobileMenuEditorItem[];
  current: string;
  onPick: (id: string) => void;
}> = ({ open, onClose, language, items, current, onPick }) => {
  const s = menuEditStrings(language);
  const m = mobileEditStrings(language);
  return (
    <MobileSheet open={open} onClose={onClose} label={s.startScreen}>
      <div className="flex flex-col min-h-0 px-4 pb-4">
        <div className="px-1 pb-3 border-b border-slate-100 flex flex-col">
          <span className="type-panel-title text-slate-900">{s.startScreen}</span>
          <span className="text-caption text-slate-500">{m.startScreenHint}</span>
        </div>
        <div
          role="radiogroup"
          aria-label={s.startScreen}
          className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((it) => {
            const on = it.id === current;
            return (
              <button
                key={it.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (!on) onPick(it.id);
                  onClose();
                }}
                className={cn(
                  "w-full min-h-12 px-3 rounded-xl flex items-center gap-3 text-left text-body font-medium cursor-pointer transition-[background-color,transform] duration-150 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                  on ? "bg-indigo-50 text-indigo-700" : "text-slate-800 hover:bg-slate-50"
                )}
              >
                <it.icon className="size-5 shrink-0" style={{ color: it.color || "#4f46e5" }} />
                <span className="flex-1 truncate">{it.label}</span>
                {on && <Check className="size-5" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <SheetCancel label={s.cancel} onClick={onClose} />
      </div>
    </MobileSheet>
  );
};
