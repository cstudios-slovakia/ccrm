import React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../../utils/cn";
import { getTranslation } from "../../utils/translations";
import type { Language } from "../../utils/translations";

/** A settings card with the title, description and an optional action in its header. */
export const SectionCard: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "danger";
  children?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, action, tone = "default", children, className }) => (
  <div
    className={cn(
      "glass-panel flex flex-col gap-6 rounded-3xl border p-6 shadow-glass",
      tone === "danger" ? "border-rose-200/70 bg-rose-50/20" : "border-white/60 bg-white/95",
      className,
    )}
  >
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3.5">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className={cn("type-panel-title flex items-center gap-2 font-heading", tone === "danger" ? "text-rose-800" : "text-slate-900")}>
          {icon}
          {title}
        </h3>
        {description && <p className="type-body max-w-2xl text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

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
  <div className="glass-panel flex flex-wrap items-center gap-4 rounded-3xl border border-white/60 bg-white/95 p-6 shadow-glass">
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">{icon}</span>
    <div className="flex min-w-60 flex-1 flex-col gap-1">
      <h3 className="type-panel-title font-heading text-slate-900">{title}</h3>
      <p className="type-body text-slate-500">{description}</p>
      <p className="text-ui text-slate-500">{getTranslation(lang, "settings.nav.ui.module_link_body")}</p>
    </div>
    <a
      href={href}
      data-testid="settings-module-link"
      className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white no-underline shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500"
    >
      {getTranslation(lang, "settings.nav.ui.module_link_btn")}
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </a>
  </div>
);
