/**
 * One widget's settings, as a right-hand drawer.
 *
 * Everything a card can be told to do lives here rather than on the card
 * itself: the edit-mode toolbar over a widget carries only the four things you
 * reach for while arranging a grid (move, resize, duplicate, remove), and the
 * rest — what it is called, how wide it sits, which rows and columns it shows —
 * is a considered change made with the card still visible beside the drawer.
 *
 * Every control writes straight into the working layout, which is only
 * persisted on Save, exactly like an AI generation.
 */

import React, { useState } from "react";
import { Check, GripVertical, Lock, Trash2, X } from "lucide-react";
import { cn } from "../../utils/cn";
import { liftAccent } from "../../utils/accentColor";
import {
  WIDGET_ROW_COUNTS,
  WIDGET_SIZES,
  WIDGET_SIZE_LABELS,
  WIDGET_SIZE_SPAN,
  type WidgetColumnDef,
  type WidgetPreset,
  type WidgetSection,
  type WidgetSettings,
  type WidgetSize
} from "../../utils/dashboardWidgets";
import { SegmentedToggle, colorForStatus, type Translate } from "./widgetKit";

const Field: React.FC<{ label: string; aside?: React.ReactNode; children: React.ReactNode }> = ({
  label,
  aside,
  children
}) => (
  <div className="shrink-0 flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {aside ? <span className="text-[11px] font-bold text-slate-500">{aside}</span> : null}
    </div>
    {children}
  </div>
);

/** The twelve-column strip that shows what a size actually takes up. */
const SizePreview: React.FC<{ span: number; active: boolean }> = ({ span, active }) => (
  <span className="flex gap-[2px] w-full">
    {Array.from({ length: 12 }).map((_, index) => (
      <span
        key={index}
        className={cn(
          "flex-1 h-3.5 rounded-[3px]",
          index < span
            ? active
              ? "bg-indigo-600"
              : "bg-slate-400"
            : active
              ? "bg-indigo-200"
              : "bg-slate-200"
        )}
      />
    ))}
  </span>
);

export const WidgetSettingsDrawer: React.FC<{
  widget: any;
  preset: WidgetPreset | null;
  section: WidgetSection;
  /** "Newest leads · Table" — what the card is, under the drawer's own title. */
  subtitle: string;
  title: string;
  settings: WidgetSettings;
  columnCatalogue: WidgetColumnDef[];
  /** Phases or task states this widget can be narrowed to; empty hides the picker. */
  statusOptions: string[];
  statusColors: Record<string, string> | null;
  canDelete: boolean;
  t: Translate;
  /** An AI-generated widget has no fixed shape, so it can be re-pointed. */
  typeOptions: { value: string; label: string }[];
  currentType: string;
  chartTypes: string[];
  currentChartType: string;
  onType: (type: string) => void;
  onChartType: (chartType: string) => void;
  onRename: (value: string) => void;
  onSize: (size: WidgetSize) => void;
  onSettings: (patch: WidgetSettings) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({
  widget,
  preset,
  section,
  subtitle,
  title,
  settings,
  columnCatalogue,
  statusOptions,
  statusColors,
  canDelete,
  t,
  typeOptions,
  currentType,
  chartTypes,
  currentChartType,
  onType,
  onChartType,
  onRename,
  onSize,
  onSettings,
  onDelete,
  onClose
}) => {
  const SectionIcon = section.icon;
  const [dragKey, setDragKey] = useState<string | null>(null);

  const isTaskTable = widget?.query?.action === "recent_tasks";
  const isLeadTable = widget?.query?.action === "recent_leads";
  const isTable = columnCatalogue.length > 0;

  const currentSize: WidgetSize = (WIDGET_SIZES as string[]).includes(widget?.size)
    ? (widget.size as WidgetSize)
    : "full";

  const picked: string[] = Array.isArray(settings.statuses) ? settings.statuses : [];
  const hasPick = picked.length > 0;
  const isStatusOn = (status: string) =>
    !hasPick || picked.some((s) => s.toLowerCase() === status.toLowerCase());

  const toggleStatus = (status: string) => {
    const base = hasPick ? picked : statusOptions;
    const on = base.some((s) => s.toLowerCase() === status.toLowerCase());
    const next = on
      ? base.filter((s) => s.toLowerCase() !== status.toLowerCase())
      : [...base, status];
    // Everything selected is the same thing as no filter, and is stored that way
    // so a phase added in Settings later shows up on its own.
    onSettings({ statuses: next.length === statusOptions.length || next.length === 0 ? [] : next });
  };

  /* The visible column list, in order, followed by the ones switched off. */
  const visible: string[] = (Array.isArray(settings.columns) ? settings.columns : []).filter((key) =>
    columnCatalogue.some((c) => c.key === key)
  );
  const ordered = [
    ...visible,
    ...columnCatalogue.map((c) => c.key).filter((key) => !visible.includes(key))
  ];

  const toggleColumn = (key: string) => {
    const column = columnCatalogue.find((c) => c.key === key);
    if (column?.locked) return;
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : [...visible, key];
    onSettings({ columns: next });
  };

  const dropColumn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const next = ordered.filter((key) => key !== dragKey);
    next.splice(ordered.indexOf(targetKey), 0, dragKey);
    // Only the switched-on columns are stored; the rest keep the catalogue order.
    onSettings({ columns: next.filter((key) => visible.includes(key)) });
    setDragKey(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-[9998] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside
        aria-label={t("Widget settings", "Nastavenia modulu", "Modul beállításai")}
        className="fixed right-0 top-0 h-screen w-full max-w-[460px] bg-white border-l border-slate-200 shadow-2xl z-[9999] flex flex-col animate-in slide-in-from-right duration-300"
      >
        <div className="flex items-center gap-3.5 px-6 py-[22px] border-b border-slate-100 shrink-0">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: section.accent }}
          >
            <SectionIcon className="h-5 w-5 text-white" strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-[3px] flex-1 min-w-0">
            <span className="text-[17px] font-bold text-slate-900">
              {t("Widget settings", "Nastavenia modulu", "Modul beállításai")}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 truncate">
              {subtitle}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close", "Zavrieť", "Bezárás")}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-[22px]">
          <label className="shrink-0 flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
              {t("Name", "Názov", "Név")}
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => onRename(e.target.value)}
              className="h-[42px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 box-border"
            />
          </label>

          <Field label={t("Data source", "Zdroj dát", "Adatforrás")}>
            <div className="flex items-center gap-3 h-[52px] px-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <SectionIcon className="h-[18px] w-[18px] shrink-0" style={{ color: section.accent }} strokeWidth={2.25} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[13px] font-bold text-slate-800 truncate">
                  {t(section.title.en, section.title.sk, section.title.hu)}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 truncate">
                  {preset ? t(preset.title.en, preset.title.sk, preset.title.hu) : widget?.query?.action}
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-400 text-right shrink-0">
                {t("Icon and colour from the section", "Ikona a farba zo sekcie", "Ikon és szín a szekcióból")}
              </span>
            </div>
          </Field>

          {/* A library card is one fixed thing, so there is nothing to choose
              here. An AI-generated one is only ever a guess at how to draw the
              rows it fetched, and is worth being able to correct. */}
          {!preset && (
            <Field label={t("Display", "Zobrazenie", "Megjelenítés")}>
              <div className="flex items-center gap-2">
                <select
                  value={typeOptions.some((o) => o.value === currentType) ? currentType : ""}
                  onChange={(e) => onType(e.target.value)}
                  aria-label={t("Widget type", "Typ modulu", "Modul típusa")}
                  className="flex-1 h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {!typeOptions.some((o) => o.value === currentType) && (
                    <option value="" disabled>
                      {currentType}
                    </option>
                  )}
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {currentType === "chart" && (
                  <select
                    value={currentChartType}
                    onChange={(e) => onChartType(e.target.value)}
                    aria-label={t("Chart type", "Typ grafu", "Diagram típusa")}
                    className="flex-1 h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {chartTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Field>
          )}

          <Field
            label={t("Width", "Veľkosť", "Szélesség")}
            aside={isTable ? t("A table needs L or wider", "Tabuľka potrebuje min. L", "A táblázat legalább L") : undefined}
          >
            <div className="grid grid-cols-4 gap-2">
              {WIDGET_SIZES.map((size) => {
                const active = currentSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSize(size)}
                    className={cn(
                      "flex flex-col gap-2 p-2.5 rounded-xl border-[1.5px] text-left transition-colors cursor-pointer",
                      active ? "bg-indigo-50 border-indigo-600" : "bg-white border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <SizePreview span={WIDGET_SIZE_SPAN[size]} active={active} />
                    <span className="flex items-baseline gap-1.5">
                      <span className={cn("text-[13px] font-extrabold", active ? "text-indigo-700" : "text-slate-800")}>
                        {WIDGET_SIZE_LABELS[size]}
                      </span>
                      <span className={cn("text-[11px] font-semibold", active ? "text-indigo-600" : "text-slate-400")}>
                        {size === "sm" ? "1/4" : size === "md" ? "1/3" : size === "lg" ? "2/3" : t("Full width", "Celá šírka", "Teljes szélesség")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {isTaskTable && (
            <Field label={t("Whose tasks", "Koho úlohy", "Kinek a feladatai")}>
              <SegmentedToggle
                large
                value={String(settings.scope ?? "team")}
                onChange={(value) => onSettings({ scope: value as "mine" | "team" })}
                options={[
                  { value: "mine", label: t("Mine", "Moje", "Enyém") },
                  { value: "team", label: t("Whole team", "Celý tím", "Egész csapat") }
                ]}
              />
            </Field>
          )}

          {isTable && (
            <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
              <Field label={t("Default order", "Predvolené zoradenie", "Alapértelmezett rendezés")}>
                <SegmentedToggle
                  large
                  value={String(settings.order ?? (isLeadTable ? "recent" : "created"))}
                  onChange={(value) => onSettings({ order: value })}
                  options={
                    isLeadTable
                      ? [
                          { value: "recent", label: t("Newest", "Najnovšie", "Legújabb") },
                          { value: "value", label: t("Highest value", "Najvyššia hodnota", "Legnagyobb érték") }
                        ]
                      : [
                          { value: "deadline", label: t("Deadline", "Termínu", "Határidő") },
                          { value: "created", label: t("Created", "Vytvorenia", "Létrehozás") }
                        ]
                  }
                />
              </Field>
              <Field label={t("Rows", "Riadkov", "Sorok")}>
                <SegmentedToggle
                  large
                  value={String(settings.rows ?? 5)}
                  onChange={(value) => onSettings({ rows: Number(value) })}
                  options={WIDGET_ROW_COUNTS.map((count) => ({ value: String(count), label: String(count) }))}
                />
              </Field>
            </div>
          )}

          {statusOptions.length > 0 && (
            <Field
              label={
                isTaskTable
                  ? t("Show statuses", "Zobraziť stavy", "Állapotok mutatása")
                  : t("Show phases", "Zobraziť fázy", "Fázisok mutatása")
              }
              aside={`${statusOptions.filter(isStatusOn).length} ${t("of", "zo", "/")} ${statusOptions.length}`}
            >
              <div className="flex flex-wrap gap-1.5">
                {statusOptions.map((status) => {
                  const on = isStatusOn(status);
                  const color = colorForStatus(status, statusColors, "#64748b");
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleStatus(status)}
                      className={cn(
                        "flex items-center gap-1.5 h-[30px] px-2.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer",
                        on ? "border" : "bg-white border border-dashed border-slate-300 text-slate-500 hover:text-slate-700"
                      )}
                      style={
                        on
                          ? { backgroundColor: `${color}1a`, borderColor: `${color}55`, color: liftAccent(color) }
                          : undefined
                      }
                    >
                      {on ? (
                        <Check className="h-3 w-3 shrink-0" strokeWidth={3} />
                      ) : (
                        <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: color }} />
                      )}
                      {status}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {isTable && (
            <Field
              label={t("Columns", "Stĺpce", "Oszlopok")}
              aside={t("Drag to reorder", "Poradie potiahnutím", "Húzással rendezhető")}
            >
              <div className="shrink-0 flex flex-col border border-slate-100 rounded-2xl overflow-hidden">
                {ordered.map((key) => {
                  const column = columnCatalogue.find((c) => c.key === key)!;
                  const on = column.locked || visible.includes(key);
                  return (
                    <label
                      key={key}
                      draggable={!column.locked}
                      onDragStart={() => setDragKey(key)}
                      onDragOver={(e) => {
                        if (dragKey) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropColumn(key);
                      }}
                      onDragEnd={() => setDragKey(null)}
                      className={cn(
                        "flex items-center gap-2.5 h-11 pl-1.5 pr-3 border-t border-slate-100 first:border-t-0",
                        column.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                        dragKey === key && "opacity-50"
                      )}
                    >
                      <span className="flex items-center justify-center w-5 shrink-0">
                        <GripVertical className="h-3.5 w-3.5 text-slate-300" strokeWidth={2.5} />
                      </span>
                      <span className="flex-1 flex flex-col min-w-0">
                        <span
                          className={cn(
                            "text-[13px] font-bold truncate",
                            on ? "text-slate-800" : "text-slate-500"
                          )}
                        >
                          {t(column.label.en, column.label.sk, column.label.hu)}
                        </span>
                        {column.hint ? (
                          <span className="text-[11px] font-semibold text-slate-400 truncate">
                            {t(column.hint.en, column.hint.sk, column.hint.hu)}
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={column.locked}
                        onChange={() => toggleColumn(key)}
                        aria-label={t(column.label.en, column.label.sk, column.label.hu)}
                        className="sr-only"
                      />
                      {column.locked ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 shrink-0">
                          <Lock className="h-3 w-3" strokeWidth={2.25} />
                          {t("Always", "Vždy", "Mindig")}
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "w-[34px] h-5 rounded-full flex items-center p-0.5 box-border transition-colors shrink-0",
                            on ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                          )}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2 h-11 px-4 rounded-2xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors text-xs font-bold uppercase tracking-[0.06em] cursor-pointer"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              {t("Remove", "Odstrániť", "Eltávolítás")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-[0.08em] transition-colors cursor-pointer"
          >
            {t("Done", "Hotovo", "Kész")}
          </button>
        </div>
      </aside>
    </>
  );
};

/** Exported for the grid's toolbar, which prints the same short size letter. */
export const sizeLetter = (size: any): string =>
  WIDGET_SIZE_LABELS[(WIDGET_SIZES as string[]).includes(size) ? (size as WidgetSize) : "full"];
