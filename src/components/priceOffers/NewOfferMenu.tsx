import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Award, ChevronDown, ExternalLink, Plus, Settings, Sparkles } from "lucide-react";
import type { AiCustomTemplate, InvoiceOfferMode } from "../../types";
import type { Language } from "../../utils/translations";
import { formatDateLocalized } from "../../utils/localTime";
import { cn } from "../../utils/cn";

export interface NewOfferChoice {
  mode: InvoiceOfferMode;
  /** The AI template to start on — only for the "custom" mode. */
  templateId?: string;
}

interface NewOfferMenuProps {
  lang: Language;
  aiTemplates: AiCustomTemplate[];
  /** At least one of SuperFaktúra / iDoklad is switched on. */
  hasExternalProvider: boolean;
  canConfigure: boolean;
  onOpenSettings: () => void;
  onChoose: (choice: NewOfferChoice) => void;
}

/** Above drawers and select panels, below the confirm dialog. */
const MENU_Z = 100001;

const ITEM_BASE =
  "w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60";

/**
 * "New price offer" — a button that opens a menu with one entry per template.
 *
 * The menu is portaled and positioned from the button, so no parent `overflow`
 * can clip it. Disabled entries stay in the list and say why, with a way to the
 * offer settings for people allowed to change them; they are skipped by the
 * arrow keys because there is nothing to do on them.
 */
export const NewOfferMenu: React.FC<NewOfferMenuProps> = ({
  lang,
  aiTemplates,
  hasExternalProvider,
  canConfigure,
  onOpenSettings,
  onChoose
}) => {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const [open, setOpen] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (returnFocus = false) => {
    setOpen(false);
    setAiExpanded(false);
    setAnchor(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Hand the focus to the first live entry as the menu appears.
  useEffect(() => {
    if (open && anchor) enabledItems()[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor !== null]);

  const enabledItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = enabledItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length].focus();
    };
    if (e.key === "ArrowDown") focusAt(index + 1);
    else if (e.key === "ArrowUp") focusAt(index <= 0 ? items.length - 1 : index - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(items.length - 1);
    else if (e.key === "Tab") close();
  };

  const choose = (choice: NewOfferChoice) => {
    close();
    onChoose(choice);
  };

  const openSettings = () => {
    close();
    onOpenSettings();
  };

  const settingsLink = (
    <button
      type="button"
      role="menuitem"
      onClick={openSettings}
      className="ml-10 mb-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-caption font-semibold text-indigo-600 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 cursor-pointer"
    >
      <Settings className="size-3.5" />
      {t("Open offer settings", "Otvoriť nastavenia ponúk", "Ajánlat-beállítások megnyitása")}
    </button>
  );

  const standard = {
    icon: <Award className="size-4 text-orange-500" />,
    label: t("Standard template", "Štandardná šablóna", "Alap sablon"),
    desc: t(
      "Built-in company template with all sections and USP cards.",
      "Vstavaná firemná šablóna so všetkými blokmi a USP kartami.",
      "Beépített cégsablon minden blokkal és USP kártyával."
    )
  };

  const aiLabel = t("AI template", "AI šablóna", "AI sablon");
  const aiDesc = aiTemplates.length
    ? t("Generated by AI from your uploaded sample PDF.", "Vygenerovaná AI z vami nahraného vzorového PDF.", "AI által generálva a feltöltött minta PDF-ből.")
    : t(
        "No AI template uploaded yet — add one in the offer settings.",
        "Zatiaľ nie je nahraná žiadna AI šablóna — pridajte ju v nastaveniach ponúk.",
        "Még nincs AI sablon — adjon hozzá az árajánlat-beállításokban."
      );

  const externalDesc = hasExternalProvider
    ? t("Issue directly through your accounting service API.", "Vystavenie priamo cez API vášho účtovníctva.", "Kiállítás közvetlenül a könyvelő API-n keresztül.")
    : t(
        "No accounting service enabled — configure it in the offer settings.",
        "Nie je zapnutá žiadna účtovná služba — nastavte ju v nastaveniach ponúk.",
        "Nincs engedélyezett könyvelő szolgáltatás."
      );

  const entryText = (label: string, desc: string) => (
    <span className="min-w-0">
      <span className="block text-ui font-semibold text-slate-900">{label}</span>
      <span className="block text-caption text-slate-500 leading-snug mt-0.5">{desc}</span>
    </span>
  );

  const menu =
    open && anchor
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t("New price offer", "Nová cenová ponuka", "Új árajánlat")}
            onKeyDown={onMenuKeyDown}
            style={{ top: anchor.top, right: anchor.right, zIndex: MENU_Z }}
            className="fixed w-(--drawer-sm) max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl animate-fade-in"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => choose({ mode: "default" })}
              className={cn(ITEM_BASE, "hover:bg-slate-50 cursor-pointer")}
            >
              <span className="mt-0.5 shrink-0">{standard.icon}</span>
              {entryText(standard.label, standard.desc)}
            </button>

            {aiTemplates.length === 0 && (
              <div role="group">
                <div role="menuitem" aria-disabled="true" className={cn(ITEM_BASE, "opacity-60 cursor-not-allowed")}>
                  <Sparkles className="size-4 mt-0.5 shrink-0 text-purple-500" />
                  {entryText(aiLabel, aiDesc)}
                </div>
                {canConfigure && settingsLink}
              </div>
            )}
            {aiTemplates.length === 1 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => choose({ mode: "custom", templateId: aiTemplates[0].id })}
                className={cn(ITEM_BASE, "hover:bg-slate-50 cursor-pointer")}
              >
                <Sparkles className="size-4 mt-0.5 shrink-0 text-purple-500" />
                {entryText(aiLabel, `${aiTemplates[0].name} · ${aiDesc}`)}
              </button>
            )}
            {aiTemplates.length > 1 && (
              <div role="group">
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={aiExpanded}
                  onClick={() => setAiExpanded(v => !v)}
                  className={cn(ITEM_BASE, "hover:bg-slate-50 cursor-pointer")}
                >
                  <Sparkles className="size-4 mt-0.5 shrink-0 text-purple-500" />
                  {entryText(aiLabel, aiDesc)}
                  <ChevronDown className={cn("size-4 ml-auto self-center shrink-0 text-slate-400 transition-transform", aiExpanded && "rotate-180")} />
                </button>
                {aiExpanded &&
                  aiTemplates.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      role="menuitem"
                      onClick={() => choose({ mode: "custom", templateId: tpl.id })}
                      className={cn(ITEM_BASE, "pl-10 py-2 hover:bg-purple-50 cursor-pointer")}
                    >
                      <span className="min-w-0">
                        <span className="block text-ui font-semibold text-slate-800 truncate">{tpl.name}</span>
                        <span className="block text-caption text-slate-400">{formatDateLocalized(tpl.createdAt, lang)}</span>
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {hasExternalProvider ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => choose({ mode: "external" })}
                className={cn(ITEM_BASE, "hover:bg-slate-50 cursor-pointer")}
              >
                <ExternalLink className="size-4 mt-0.5 shrink-0 text-blue-500" />
                {entryText("SuperFaktúra / iDoklad", externalDesc)}
              </button>
            ) : (
              <div role="group">
                <div role="menuitem" aria-disabled="true" className={cn(ITEM_BASE, "opacity-60 cursor-not-allowed")}>
                  <ExternalLink className="size-4 mt-0.5 shrink-0 text-blue-500" />
                  {entryText("SuperFaktúra / iDoklad", externalDesc)}
                </div>
                {canConfigure && settingsLink}
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={e => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-ui font-semibold rounded-2xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        <span>{t("New price offer", "Nová cenová ponuka", "Új árajánlat")}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {menu}
    </>
  );
};
