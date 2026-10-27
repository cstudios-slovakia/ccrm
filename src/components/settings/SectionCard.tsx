import React from "react";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";
import type { AutosaveStatus } from "./useAutosave";

/**
 * THE block of Settings: a card with a title, a one-line description and an optional
 * action (an "Add" button, a save status) on one header row, a hairline, then the body.
 * Every setting on every tab lives in one of these — a screen that needs a second
 * kind of block is a screen that should be split, not restyled.
 */
export const SectionCard: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "danger" | "warning";
  children?: React.ReactNode;
  className?: string;
  testId?: string;
}> = ({ title, description, action, tone = "default", children, className, testId }) => (
  <div
    data-testid={testId}
    className={cn(
      "glass-panel flex flex-col gap-6 rounded-3xl border p-6 text-left shadow-glass",
      tone === "danger" && "border-rose-200/70 bg-rose-50/20",
      tone === "warning" && "border-amber-200/70 bg-amber-50/20",
      tone === "default" && "border-white/60 bg-white/95",
      className,
    )}
  >
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
      <div className="flex min-w-0 flex-col gap-1">
        <h3
          className={cn(
            "type-panel-title font-heading",
            tone === "danger" ? "text-rose-800" : tone === "warning" ? "text-amber-800" : "text-slate-900",
          )}
        >
          {title}
        </h3>
        {description && <p className="type-body max-w-2xl text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/** A small captioned group inside a card (what an old `<h4>` was): label on top, content under it. */
export const SettingsGroup: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ title, description, children, className }) => (
  <div className={cn("flex flex-col gap-3", className)}>
    {(title || description) && (
      <div className="flex flex-col gap-0.5">
        {title && <h4 className="text-body font-bold text-slate-800">{title}</h4>}
        {description && <p className="text-ui text-slate-500">{description}</p>}
      </div>
    )}
    {children}
  </div>
);

/**
 * The header chip of a block that saves by itself: nothing while idle, "Saving…" while
 * a change is waiting or on its way, "Saved" for a moment afterwards.
 */
export const SaveStatus: React.FC<{ lang: Language; status: AutosaveStatus }> = ({ lang, status }) => {
  if (status === "idle") return <span aria-live="polite" className="min-h-6" />;
  const saving = status === "saving";
  return (
    <span
      aria-live="polite"
      data-testid="settings-save-status"
      data-status={status}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 text-caption font-semibold",
        saving ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
      {getTranslation(lang, saving ? "settings.nav.ui.autosave_saving" : "settings.nav.ui.autosave_saved")}
    </span>
  );
};

/**
 * A section whose settings live in another module's own screen (the Price offers
 * module owns its templates and statuses). The card says so and opens it.
 */
export const ModuleLinkCard: React.FC<{
  lang: Language;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}> = ({ lang, title, description, href, icon }) => (
  <SectionCard
    title={title}
    description={description}
    action={
      <a
        href={href}
        data-testid="settings-module-link"
        className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white no-underline shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500"
      >
        {getTranslation(lang, "settings.nav.ui.module_link_btn")}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    }
  >
    <div className="flex items-center gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">{icon}</span>
      <p className="type-body text-slate-500">{getTranslation(lang, "settings.nav.ui.module_link_body")}</p>
    </div>
  </SectionCard>
);
