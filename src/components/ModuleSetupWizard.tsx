import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Check, CheckCheck, TriangleAlert, WandSparkles, X } from "lucide-react";
import type { Language } from "../utils/translations";
import { getTranslation } from "../utils/translations";
import { getModuleCategories } from "../utils/moduleCatalog";
import type { ModuleItemConfig } from "../utils/moduleCatalog";
import {
  canConfirmDraft,
  countActive,
  draftFromDisabled,
  mergeDraftIntoDisabled,
  toggleInDraft,
} from "../utils/moduleWizard";

/**
 * Module setup wizard: a large popup in which an admin chooses which CRM
 * modules the workspace shows.
 *
 * It is a second view of Settings -> Visible Modules and reads and writes the
 * same field (`integrationsConfig.disabledModules`, via the owner's onConfirm).
 * The difference is when it writes: Settings applies every toggle at once, this
 * holds the choices as a draft and applies them on Confirm.
 *
 * Not to be confused with InstallerWizard (the database installer) or
 * ui/ModuleSetupRequired (the "connect a mailbox first" card).
 */

export interface ModuleSetupWizardProps {
  open: boolean;
  language: Language;
  /** The shared module list — see utils/moduleCatalog.ts. */
  catalog: ModuleItemConfig[];
  /** The workspace's current state; the draft starts from this, not from "everything on". */
  disabledModules: string[];
  /** Receives the complete next `disabledModules`. */
  onConfirm: (nextDisabled: string[]) => void;
  /** "Decide later", the close button and Escape. Leaves `disabledModules` alone. */
  onSkip: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Number that counts up or down to its new value instead of jumping. */
const AnimatedCount: React.FC<{ value: number }> = ({ value }) => {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.35, ease: "easeOut" });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);
  return <motion.span>{rounded}</motion.span>;
};

/** What a card shows when a module has no screenshot, or its screenshot fails to load. */
const FallbackArt: React.FC<{ module: ModuleItemConfig }> = ({ module }) => {
  const Icon = module.icon;
  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
      style={{ background: `linear-gradient(135deg, ${module.color}2e 0%, ${module.color}0d 60%, transparent 100%)` }}
    >
      <span
        className="flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg ring-1 ring-black/5"
        style={{ backgroundColor: module.color, color: "#fff" }}
      >
        <Icon className="h-10 w-10" />
      </span>
      <span className="type-card-title max-w-full truncate text-slate-700">{module.title}</span>
    </span>
  );
};

interface ModuleCardProps {
  module: ModuleItemConfig;
  visible: boolean;
  index: number;
  language: Language;
  categoryTitle: string;
  onToggle: (id: string) => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ module, visible, index, language, categoryTitle, onToggle }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const Icon = module.icon;
  const showImage = !!module.screenshot && !imageFailed;
  const altText =
    language === "sk"
      ? `Snímka obrazovky modulu ${module.title}`
      : language === "hu"
        ? `A(z) ${module.title} modul képernyőképe`
        : `Screenshot of the ${module.title} module`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid={`module-card-${module.id}`}
      data-module-id={module.id}
      onClick={() => onToggle(module.id)}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`group flex w-full flex-col gap-4 rounded-3xl border p-3 text-left cursor-pointer select-none transition-all duration-200 ease-out motion-reduce:transition-none animate-in fade-in slide-in-from-bottom-2 [animation-fill-mode:backwards] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/10 active:translate-y-0 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
        visible
          ? "border-slate-200 bg-white hover:border-indigo-300"
          : "border-dashed border-slate-300 bg-slate-50 hover:border-slate-400"
      }`}
    >
      {/* Screenshot */}
      <span data-testid="module-card-shot" className="relative block aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100">
        {showImage ? (
          <img
            src={module.screenshot}
            alt={altText}
            width={1440}
            height={900}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setImageFailed(true)}
            className={`h-full w-full object-cover object-top transition duration-300 motion-reduce:transition-none ${
              visible ? "group-hover:scale-[1.015]" : "grayscale opacity-50"
            }`}
          />
        ) : (
          <span className={`block h-full w-full transition duration-300 ${visible ? "" : "grayscale opacity-60"}`}>
            <FallbackArt module={module} />
          </span>
        )}
        {!visible && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 type-overline text-amber-700 shadow-sm">
            {getTranslation(language, "settings.modules.status.hidden")}
          </span>
        )}
      </span>

      {/* Title row */}
      <span className="flex items-center gap-3 px-1">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${visible ? "" : "grayscale"}`}
          style={{ backgroundColor: module.bgColor || `${module.color}18`, color: module.color }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span id={titleId} className={`type-card-title block truncate ${visible ? "text-slate-900" : "text-slate-500"}`}>
            {module.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 type-overline text-slate-600">
              {categoryTitle}
            </span>
            {module.badge && (
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 type-overline ${
                  module.isCustom ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {module.badge}
              </span>
            )}
          </span>
        </span>

        {/* The switch is decorative: the whole card is the control, so it has one tab stop. */}
        <span className="flex shrink-0 items-center gap-2.5" aria-hidden="true">
          <span className={`hidden type-overline sm:inline ${visible ? "text-indigo-700" : "text-slate-400"}`}>
            {getTranslation(language, visible ? "settings.modules.status.visible" : "settings.modules.status.hidden")}
          </span>
          <span
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out motion-reduce:transition-none ${
              visible ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out motion-reduce:transition-none ${
                visible ? "translate-x-5" : "translate-x-0"
              }`}
            >
              {visible ? <Check className="h-3.5 w-3.5 text-indigo-600 stroke-[3]" /> : <X className="h-3.5 w-3.5 text-slate-400 stroke-[2.5]" />}
            </span>
          </span>
        </span>
      </span>

      {/* Description */}
      <span id={descId} className={`type-body block px-1 pb-1 ${visible ? "text-slate-600" : "text-slate-500"}`}>
        {module.longDescription}
      </span>
    </button>
  );
};

interface WizardDialogProps extends Omit<ModuleSetupWizardProps, "open"> {}

const WizardDialog: React.FC<WizardDialogProps> = ({ language, catalog, disabledModules, onConfirm, onSkip }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const uid = useId();
  const titleId = `${uid}-title`;
  const subtitleId = `${uid}-subtitle`;
  const panelRef = useRef<HTMLDivElement>(null);

  const catalogIds = useMemo(() => catalog.map((m) => m.id), [catalog]);
  const categories = useMemo(() => getModuleCategories(language), [language]);

  // The draft: ids switched OFF. Seeded once, from the workspace's current state.
  const [draft, setDraft] = useState<string[]>(() => draftFromDisabled(disabledModules, catalogIds));
  const [showGuard, setShowGuard] = useState(false);

  const total = catalogIds.length;
  const active = countActive(draft, catalogIds);
  const canConfirm = canConfirmDraft(draft, catalogIds);

  const toggle = useCallback((id: string) => {
    setDraft((prev) => toggleInDraft(prev, id));
    setShowGuard(false);
  }, []);

  const enableAll = () => {
    setDraft([]);
    setShowGuard(false);
  };

  const confirm = () => {
    if (!canConfirm) {
      setShowGuard(true);
      return;
    }
    onConfirm(mergeDraftIntoDisabled(disabledModules, draft, catalogIds));
  };

  // Escape = "Decide later". Captured on window, like ConfirmDialog, so an
  // overlay underneath (Start menu, drawer) never sees the same keypress.
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        skipRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Focus: remember where it was, move it into the dialog, hand it back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) panel.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (previous && previous !== document.body && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  // The page behind must not scroll while the dialog is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (nodes.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const current = document.activeElement;
    if (e.shiftKey && (current === first || current === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const settingsName = getTranslation(language, "settings.modules.title");
  const subtitle = t(
    `Switch off what your team does not need and the navigation stays clean. This choice applies to everyone in the workspace, and you can change it at any time in Settings → ${settingsName}.`,
    `Vypnite, čo váš tím nepotrebuje, a navigácia ostane prehľadná. Voľba platí pre všetkých v pracovnom priestore a kedykoľvek ju zmeníte v Nastavenia → ${settingsName}.`,
    `Kapcsolja ki, amire a csapatának nincs szüksége, így a navigáció átlátható marad. A választás a munkaterület minden tagjára érvényes, és bármikor módosíthatja a Beállítások → ${settingsName} menüpontban.`
  );
  const isDraftHidden = (id: string) => draft.includes(id);
  let cardIndex = 0;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        data-testid="module-wizard-overlay"
        // Above drawers (100000) and select panels (100001), below ConfirmDialog (100020).
        className="fixed inset-0 z-[100010] flex items-stretch justify-center bg-slate-900/55 p-0 backdrop-blur-sm sm:p-6"
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitleId}
          tabIndex={-1}
          data-testid="module-wizard"
          onKeyDown={onPanelKeyDown}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex min-h-0 w-full max-w-360 flex-col overflow-hidden border-slate-200 bg-white shadow-2xl focus:outline-none sm:rounded-3xl sm:border"
        >
          {/* Header — a flex child, not an overlay, so it can never cover content. */}
          <header className="shrink-0 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
              <div className="shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 text-white shadow-lg shadow-indigo-500/25">
                <WandSparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="type-panel-title font-heading text-slate-900">
                  {t("Choose your modules", "Vyberte si moduly", "Válassza ki a modulokat")}
                </h2>
                <p id={subtitleId} className="type-body mt-1 hidden max-w-4xl text-slate-500 sm:block">
                  {subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={onSkip}
                data-testid="module-wizard-close"
                title={t("Decide later", "Rozhodnúť neskôr", "Később döntök")}
                aria-label={t("Close and decide later", "Zavrieť a rozhodnúť neskôr", "Bezárás, később döntök")}
                className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-xl p-2 text-slate-400 lg:order-last transition hover:bg-slate-100 hover:text-slate-600 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="order-last flex w-full flex-wrap items-center gap-3 lg:order-none lg:w-auto lg:self-center">
              <div
                data-testid="module-wizard-counter"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-ui font-bold text-emerald-800"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <span aria-hidden="true" className="tabular-nums">
                  <AnimatedCount value={active} /> {t("of", "z", "/")} {total} {t("active", "aktívnych", "aktív")}
                </span>
                <span className="sr-only" role="status">
                  {t(`${active} of ${total} modules active`, `${active} z ${total} modulov aktívnych`, `${active} / ${total} modul aktív`)}
                </span>
              </div>
              {draft.length > 0 && (
                <button
                  type="button"
                  onClick={enableAll}
                  data-testid="module-wizard-enable-all"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-ui font-bold text-slate-700 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <CheckCheck className="h-4 w-4 text-indigo-600" />
                  {getTranslation(language, "settings.modules.enable_all")}
                </button>
              )}
              </div>
            </div>
          </header>

          {/* Scrolling body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-4 py-5 sm:px-6" data-testid="module-wizard-body">
            {/* On a phone the header keeps to a title and the counter; the explanation scrolls with the content. */}
            <p className="type-body mb-5 text-slate-500 sm:hidden">{subtitle}</p>
            <div className="space-y-8">
              {categories.map((category) => {
                const items = catalog.filter((m) => m.category === category.id);
                if (items.length === 0) return null;
                const CategoryIcon = category.icon;
                const activeInCategory = items.filter((m) => !isDraftHidden(m.id)).length;
                return (
                  <section key={category.id} aria-label={category.title}>
                    <div className="mb-3 flex items-center gap-2.5 px-1">
                      <span className={`rounded-xl border p-2 ${category.bgColor}`}>
                        <CategoryIcon className="h-4 w-4" />
                      </span>
                      <h3 className="type-card-title font-heading text-slate-900">{category.title}</h3>
                      <span className="type-meta text-slate-400 tabular-nums">
                        {activeInCategory} / {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
                      {items.map((module) => (
                        <ModuleCard
                          key={module.id}
                          module={module}
                          visible={!isDraftHidden(module.id)}
                          index={cardIndex++}
                          language={language}
                          categoryTitle={category.title}
                          onToggle={toggle}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          {/* Footer — also a flex child, so Confirm is always reachable. */}
          <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                {!canConfirm ? (
                  <p
                    role="alert"
                    data-testid="module-wizard-guard"
                    className={`type-body flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 transition ${
                      showGuard ? "ring-2 ring-amber-400/60" : ""
                    }`}
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {t(
                        "Keep at least one module visible — with every module hidden the navigation would be empty.",
                        "Ponechajte viditeľný aspoň jeden modul – ak skryjete všetky, navigácia ostane prázdna.",
                        "Legalább egy modult hagyjon láthatóan – ha mindet elrejti, a navigáció üres marad."
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="type-meta text-slate-500">
                    {t(
                      "Nothing changes until you press Confirm.",
                      "Nič sa nezmení, kým nestlačíte Potvrdiť.",
                      "Addig nem változik semmi, amíg meg nem erősíti."
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onSkip}
                  data-testid="module-wizard-skip"
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ui font-bold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  {t("Decide later", "Rozhodnúť neskôr", "Később döntök")}
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  aria-disabled={!canConfirm}
                  data-testid="module-wizard-confirm"
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-ui font-bold text-white shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                    canConfirm
                      ? "cursor-pointer bg-indigo-600 shadow-indigo-600/25 hover:bg-indigo-700 active:scale-95"
                      : "cursor-not-allowed bg-slate-300 shadow-none"
                  }`}
                >
                  <Check className="h-4 w-4" />
                  {t("Confirm", "Potvrdiť", "Megerősítés")}
                </button>
              </div>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
};

export const ModuleSetupWizard: React.FC<ModuleSetupWizardProps> = ({ open, ...rest }) => {
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{open && <WizardDialog key="module-setup-wizard" {...rest} />}</AnimatePresence>, document.body);
};

export default ModuleSetupWizard;
