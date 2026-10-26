import React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatTranslation, getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import { sectionKey, settingsPath } from "./settingsRegistry.ts";
import { ScrollFade } from "./ScrollFade";

/**
 * Phone replacement for the desktop section tabs: one full-width button showing
 * "Section N of M" and the current section, which opens a menu listing every
 * section. A chip row would scroll sideways; this never does.
 */
export const MobileSectionMenu: React.FC<{
  lang: Language;
  categoryId: string;
  sectionIds: string[];
  activeId: string;
  onPick: (sectionId: string) => void;
}> = ({ lang, categoryId, sectionIds, activeId, onPick }) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const t = (k: string) => getTranslation(lang, k);
  const menuId = React.useId();
  const index = Math.max(0, sectionIds.indexOf(activeId));

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="settings-section-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 text-left text-slate-900"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-caption font-semibold text-slate-500">
            {formatTranslation(lang, "settings.nav.ui.section_of", { n: index + 1, m: sectionIds.length })}
          </span>
          <span className="truncate text-body font-bold">{t(sectionKey(categoryId, sectionIds[index] ?? "", "title"))}</span>
        </span>
        {open ? <ChevronUp className="size-4.5 shrink-0 text-slate-500" aria-hidden="true" /> : <ChevronDown className="size-4.5 shrink-0 text-slate-500" aria-hidden="true" />}
      </button>

      {open && (
        <nav
          id={menuId}
          aria-label={t("settings.nav.ui.sections")}
          data-testid="settings-section-menu-list"
          className="settings-menu-in absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 rounded-3xl border border-slate-200 bg-white p-1.5 shadow-2xl"
        >
          <ScrollFade axis="y" className="max-h-[60vh]">
            <ul className="flex flex-col gap-0.5">
              {sectionIds.map((id) => {
                const current = id === activeId;
                return (
                  <li key={id}>
                    <a
                      href={"#" + settingsPath(categoryId, id)}
                      aria-current={current ? "true" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpen(false);
                        onPick(id);
                      }}
                      className={cn(
                        "flex min-h-11.5 items-center gap-2.5 rounded-xl px-3 text-body no-underline",
                        current ? "bg-indigo-50 font-bold text-indigo-900" : "font-semibold text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span className="flex-1">{t(sectionKey(categoryId, id, "title"))}</span>
                      {current && <Check className="size-4.5 text-indigo-600" aria-hidden="true" />}
                    </a>
                  </li>
                );
              })}
            </ul>
          </ScrollFade>
        </nav>
      )}
    </div>
  );
};
