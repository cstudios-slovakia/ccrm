import React, { useRef, useState } from "react";
import {
  Check,
  FileText,
  Mail,
  Minus,
  Paperclip,
  Phone,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  Lead,
  ProjectAttribute,
  ProjectAttributeType,
  ProjectUploadedFile,
} from "../../types";
import type { Language } from "../../utils/translations";
import { cn } from "../../utils/cn";
import {
  CURRENCY_OPTIONS,
  formatMoney,
  isMoneyValueEmpty,
  parseMoneyValue,
} from "../../utils/currency";
import { formatDateLocalized, formatTimestampLocalized } from "../../utils/localTime";
import {
  asAttributeList,
  isBooleanCheckbox,
  missingChecklistItems,
  readChecklistValue,
  writeChecklistValue,
} from "../../utils/projectColumns";
import { isLeadAttributeMissing } from "../../utils/leadAttributes";
import { runUndoable } from "../../utils/undoable";
import { singleMessage, undoLabel } from "../../utils/undoMessages";
import { CustomSelect } from "../ui/CustomSelect";
import { ClientSelect } from "../ui/ClientSelect";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { WhatsAppChip } from "../WhatsAppChip";

export const ATTRIBUTE_TYPES: { id: ProjectAttributeType; label: [string, string, string] }[] = [
  { id: "textfield", label: ["Text Field", "Textové pole", "Szövegmező"] },
  { id: "textarea", label: ["Text Area", "Textová oblasť", "Szövegterület"] },
  { id: "select", label: ["Dropdown Select", "Rozbaľovací zoznam", "Legördülő lista"] },
  { id: "date", label: ["Date", "Dátum", "Dátum"] },
  { id: "time", label: ["Time", "Čas", "Idő"] },
  { id: "datetime", label: ["Date & Time", "Dátum a čas", "Dátum és idő"] },
  { id: "number", label: ["Number", "Číslo", "Szám"] },
  { id: "money", label: ["Money (amount + currency)", "Suma (Čiastka + mena)", "Összeg (összeg + pénznem)"] },
  { id: "checkbox", label: ["Checkbox", "Zaškrtávacie pole", "Jelölőnégyzet"] },
  { id: "radio", label: ["Radio Button", "Prepínač", "Választógomb"] },
  { id: "files", label: ["File Upload", "Nahranie súboru", "Fájlfeltöltés"] },
  { id: "contact", label: ["Contact Picker", "Výber kontaktu", "Kapcsolatválasztó"] },
];

export const OPTION_ATTR_TYPES: ProjectAttributeType[] = ["select", "radio", "checkbox"];
export const isOptionAttrType = (type: ProjectAttributeType) => OPTION_ATTR_TYPES.includes(type);

export const cleanAttrOptions = (type: ProjectAttributeType, options: string[], draft = "") =>
  isOptionAttrType(type)
    ? Array.from(new Set([...options, draft].map(o => o.trim()).filter(Boolean)))
    : undefined;

/**
 * Shared option editor for `select`, `radio`, and `checkbox` custom fields.
 */
export const AttrOptionsEditor: React.FC<{
  options: string[];
  onChange: (next: string[]) => void;
  draft: string;
  onDraftChange: (next: string) => void;
  requiredOptions?: string[];
  onRequiredChange?: (next: string[]) => void;
  t: (en: string, sk: string, hu: string) => string;
  requiredTooltip?: string;
  requiredHint?: string;
}> = ({
  options,
  onChange,
  draft,
  onDraftChange,
  requiredOptions,
  onRequiredChange,
  t,
  requiredTooltip,
  requiredHint,
}) => {
  const trimmedDraft = draft.trim();
  const isDuplicate = !!trimmedDraft && options.some(o => o.trim() === trimmedDraft);

  const add = () => {
    if (!trimmedDraft || isDuplicate) return;
    onChange([...options, trimmedDraft]);
    onDraftChange("");
  };

  const rename = (index: number, value: string) => {
    const old = options[index];
    onChange(options.map((o, i) => (i === index ? value : o)));
    if (requiredOptions?.includes(old)) {
      onRequiredChange?.(requiredOptions.map(o => (o === old ? value : o)));
    }
  };

  const remove = (index: number) => {
    const old = options[index];
    onChange(options.filter((_, i) => i !== index));
    if (requiredOptions?.includes(old)) {
      onRequiredChange?.(requiredOptions.filter(o => o !== old));
    }
  };

  const toggleRequired = (opt: string) => {
    if (!requiredOptions) return;
    onRequiredChange?.(
      requiredOptions.includes(opt)
        ? requiredOptions.filter(o => o !== opt)
        : [...requiredOptions, opt],
    );
  };

  return (
    <div>
      <label className="block type-overline text-gray-400 mb-1">
        {t("Options", "Možnosti", "Opciók")}
      </label>
      <div className="space-y-1.5">
        {options.map((opt, index) => {
          const required = !!requiredOptions?.includes(opt);
          return (
            <div key={index} className="flex items-center gap-1.5">
              <input
                value={opt}
                onChange={e => rename(index, e.target.value)}
                aria-label={t(`Option ${index + 1}`, `Možnosť ${index + 1}`, `${index + 1}. opció`)}
                className="flex-1 min-w-0 px-3 py-2 rounded-md border border-gray-200 text-ui font-semibold bg-white"
              />
              {requiredOptions && (
                <button
                  type="button"
                  aria-pressed={required}
                  onClick={() => toggleRequired(opt)}
                  title={
                    requiredTooltip ||
                    t(
                      "Every record has to tick this box",
                      "Každý záznam musí toto políčko zaškrtnúť",
                      "Minden rekordnak be kell jelölnie",
                    )
                  }
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-caption font-bold transition-all duration-150 active:scale-95 cursor-pointer",
                    required
                      ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700",
                  )}
                >
                  {required ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {t("Required", "Povinné", "Kötelező")}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t("Remove option", "Odstrániť možnosť", "Opció törlése")}
                className="shrink-0 p-1.5 hover:bg-rose-50 rounded-lg text-rose-600 transition-colors duration-150 active:scale-95 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("New option", "Nová možnosť", "Új opció")}
            className={cn(
              "flex-1 min-w-0 px-3 py-2 rounded-md border text-ui font-semibold bg-white",
              isDuplicate ? "border-rose-300" : "border-gray-200",
            )}
          />
          <button
            type="button"
            onClick={add}
            disabled={!trimmedDraft || isDuplicate}
            className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-md bg-entity-solid text-white font-bold text-ui hover:bg-entity-solid disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Add", "Pridať", "Hozzáadás")}
          </button>
        </div>
      </div>
      {isDuplicate && (
        <p className="text-micro font-medium text-rose-600 mt-1">
          {t("This option already exists.", "Táto možnosť už existuje.", "Ez az opció már létezik.")}
        </p>
      )}
      {requiredOptions && options.length > 0 && (
        <p className="text-micro font-medium text-gray-400 mt-1">
          {requiredHint ||
            t(
              "Mark the boxes every record has to tick.",
              "Označte políčka, ktoré musí každý záznam zaškrtnúť.",
              "Jelölje meg, mely négyzeteket kell minden rekordnak bejelölnie.",
            )}
        </p>
      )}
    </div>
  );
};

interface RenderAttrContext {
  leads: Lead[];
  defaultCurrency: string;
  userLanguage: Language;
  t: (en: string, sk: string, hu: string) => string;
}

/** Roomy read-only representation of one custom attribute inside a detail card. */
export function renderCustomAttributeValue(
  attr: ProjectAttribute,
  rawVal: unknown,
  { leads, defaultCurrency, userLanguage, t }: RenderAttrContext,
): React.ReactNode {
  const empty = <span className="text-slate-300 italic font-semibold">—</span>;

  switch (attr.type) {
    case "money": {
      if (isMoneyValueEmpty(rawVal, defaultCurrency)) return empty;
      const m = parseMoneyValue(rawVal, defaultCurrency);
      return <span className="font-bold text-slate-800">{formatMoney(m.amount || 0, m.currency, userLanguage)}</span>;
    }
    case "date":
      return rawVal ? formatDateLocalized(String(rawVal), userLanguage) : empty;
    case "datetime":
      return rawVal ? formatTimestampLocalized(String(rawVal).replace("T", " "), userLanguage) : empty;
    case "textarea":
      return rawVal ? <span className="whitespace-pre-line leading-relaxed">{String(rawVal)}</span> : empty;
    case "checkbox": {
      if (isBooleanCheckbox(attr)) {
        return rawVal
          ? t("Yes", "Áno", "Igen")
          : <span className="text-slate-300 italic font-semibold">{t("No", "Nie", "Nem")}</span>;
      }
      const picked = readChecklistValue(rawVal).checked;
      if (picked.length === 0) return empty;
      return (
        <div className="flex flex-wrap gap-1.5">
          {picked.map(opt => (
            <span key={String(opt)} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 type-overline text-slate-600">
              {String(opt)}
            </span>
          ))}
        </div>
      );
    }
    case "files": {
      const files = asAttributeList(rawVal);
      if (files.length === 0) return empty;
      return (
        <div className="flex flex-col gap-1">
          {files.map((f: any, i: number) => (
            <a
              key={i}
              href={f.path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 truncate"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{f.name}</span>
            </a>
          ))}
        </div>
      );
    }
    case "contact": {
      const contact = typeof rawVal === "string" ? leads.find(l => l.id === rawVal) : undefined;
      if (!contact) return empty;
      return (
        <a href={`#lead-${contact.id}`} className="text-indigo-600 hover:text-indigo-800 font-bold">
          {contact.name}
        </a>
      );
    }
    default:
      return rawVal === "" || rawVal === null || rawVal === undefined ? empty : String(rawVal);
  }
}

/** Compact one-line / chip representation of one custom attribute inside a list table cell. */
export function renderCustomAttributeCell(
  attr: ProjectAttribute,
  rawVal: unknown,
  { leads, defaultCurrency, userLanguage, t }: RenderAttrContext,
): React.ReactNode {
  const emptyCell = <span className="text-slate-300 text-ui">—</span>;

  switch (attr.type) {
    case "money": {
      if (isMoneyValueEmpty(rawVal, defaultCurrency)) return emptyCell;
      const m = parseMoneyValue(rawVal, defaultCurrency);
      return (
        <span className="text-ui font-bold text-slate-700 tabular-nums whitespace-nowrap">
          {formatMoney(m.amount || 0, m.currency, userLanguage)}
        </span>
      );
    }
    case "date":
      return rawVal
        ? <span className="text-ui font-semibold text-slate-600 whitespace-nowrap">{formatDateLocalized(String(rawVal), userLanguage)}</span>
        : emptyCell;
    case "datetime":
      return rawVal
        ? <span className="text-ui font-semibold text-slate-600 whitespace-nowrap">{formatTimestampLocalized(String(rawVal).replace("T", " "), userLanguage)}</span>
        : emptyCell;
    case "number":
      return rawVal === "" || rawVal === null || rawVal === undefined
        ? emptyCell
        : <span className="text-ui font-semibold text-slate-600 tabular-nums">{String(rawVal)}</span>;
    case "checkbox": {
      if (isBooleanCheckbox(attr)) {
        return rawVal
          ? <Check className="h-4 w-4 text-emerald-600" aria-label={t("Yes", "Áno", "Igen")} />
          : <Minus className="h-4 w-4 text-slate-300" aria-label={t("No", "Nie", "Nem")} />;
      }
      const picked = readChecklistValue(rawVal).checked;
      if (picked.length === 0) return emptyCell;
      return (
        <div className="flex flex-wrap items-center gap-1 max-w-[14rem]" title={picked.join(", ")}>
          {picked.slice(0, 2).map(opt => (
            <span key={opt} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-micro font-bold text-slate-600 truncate max-w-[7rem]">
              {opt}
            </span>
          ))}
          {picked.length > 2 && (
            <span className="text-micro font-bold text-slate-400 tabular-nums">+{picked.length - 2}</span>
          )}
        </div>
      );
    }
    case "files": {
      const files = asAttributeList(rawVal);
      if (files.length === 0) return emptyCell;
      return (
        <span
          className="inline-flex items-center gap-1.5 text-ui font-semibold text-slate-500 whitespace-nowrap"
          title={files.map((f: any) => f?.name).filter(Boolean).join(", ")}
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="tabular-nums">{files.length}</span>
        </span>
      );
    }
    case "contact": {
      const contact = typeof rawVal === "string" ? leads.find(l => l.id === rawVal) : undefined;
      if (!contact) return emptyCell;
      return (
        <span className="block truncate max-w-[12rem] text-ui font-semibold text-slate-600" title={contact.name}>
          {contact.name}
        </span>
      );
    }
    default: {
      if (rawVal === "" || rawVal === null || rawVal === undefined) return emptyCell;
      const text = String(rawVal);
      return (
        <span className="block truncate max-w-[14rem] text-ui font-semibold text-slate-600" title={text}>
          {text}
        </span>
      );
    }
  }
}

interface CustomAttributesGridProps {
  attributes: readonly ProjectAttribute[];
  values: Record<string, any>;
  onChange: (attrId: string, nextVal: any) => void;
  leads: Lead[];
  defaultCurrency: string;
  userLanguage: Language;
  t: (en: string, sk: string, hu: string) => string;
  canEdit: boolean;
  canDelete?: boolean;
  /** Prefix used when generating upload event IDs & DOM input IDs (e.g. `lead-123` or `lead-new`). */
  instanceKey: string;
  /** Whether to show "Required" hints next to empty required attributes. */
  showRequiredHints?: boolean;
}

export const CustomAttributesGrid: React.FC<CustomAttributesGridProps> = ({
  attributes,
  values,
  onChange,
  leads,
  defaultCurrency,
  userLanguage,
  t,
  canEdit,
  canDelete = canEdit,
  instanceKey,
  showRequiredHints = true,
}) => {
  const [newChecklistLabels, setNewChecklistLabels] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragDepth = useRef(0);

  if (attributes.length === 0) return null;

  const uploadFile = async (attrId: string, file: File): Promise<ProjectUploadedFile | null> => {
    setIsUploading(attrId);
    const eventId = `${instanceKey}-${attrId}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);

    try {
      const res = await fetch("/upload.php", { method: "POST", body: formData });
      const resData = await res.json();
      if (!resData.success) {
        (window as any).showToast?.(
          t("File upload failed", "Nahrávanie súboru zlyhalo", "Fájl feltöltés sikertelen"),
          "error",
        );
        return null;
      }
      const sizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;
      return {
        name: resData.fileName || file.name,
        size: sizeStr,
        path: `/uploads/${eventId}_${resData.fileName || file.name}`,
      };
    } catch {
      return null;
    } finally {
      setIsUploading(null);
    }
  };

  const addFiles = async (attrId: string, files: File[]) => {
    if (!canEdit || files.length === 0) return;
    const uploaded: ProjectUploadedFile[] = [];
    for (const file of files) {
      const one = await uploadFile(attrId, file);
      if (one) uploaded.push(one);
    }
    if (uploaded.length === 0) return;
    onChange(attrId, [...asAttributeList(values[attrId]), ...uploaded]);
  };

  const removeFile = (attrId: string, fileIndex: number) => {
    if (!canDelete) return;
    const current = asAttributeList(values[attrId]);
    const removed = current[fileIndex];
    if (!removed) return;
    runUndoable({
      message: singleMessage(userLanguage, "file", "delete", removed.name),
      undoLabel: undoLabel(userLanguage),
      apply: () => onChange(attrId, asAttributeList(values[attrId]).filter((_: any, idx: number) => idx !== fileIndex)),
      revert: () => {
        const list = asAttributeList(values[attrId]);
        if (list.some((f: any) => f.path === removed.path && f.name === removed.name)) return;
        const next = [...list];
        next.splice(Math.min(fileIndex, next.length), 0, removed);
        onChange(attrId, next);
      },
    });
  };

  const dropZoneProps = (attrId: string) => ({
    onDragEnter: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDropTarget(attrId);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDropTarget(null);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) void addFiles(attrId, files);
    },
  });

  const isWide = (a: ProjectAttribute) =>
    a.type === "textarea" || a.type === "files" || (canEdit && (a.type === "money" || a.type === "contact"));

  const lone = new Set<string>();
  let col = 0;
  attributes.forEach((a, i) => {
    if (isWide(a)) {
      col = 0;
      return;
    }
    if (col === 0 && (i === attributes.length - 1 || isWide(attributes[i + 1]))) lone.add(a.id);
    col = col === 0 ? 1 : 0;
  });

  return (
    <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-x-4 gap-y-4">
      {attributes.map(attr => {
        const val = values[attr.id] ?? "";
        const wide = isWide(attr) || lone.has(attr.id);
        const missingRequired = showRequiredHints && isLeadAttributeMissing(attr, values[attr.id], defaultCurrency);
        const missingBoxes = missingChecklistItems(attr, values[attr.id]);

        return (
          <div key={attr.id} className={`min-w-0 break-words ${wide ? "ws-sm:col-span-2" : ""}`}>
            <label className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 type-overline text-slate-500 mb-1">
              <span>
                {attr.name} {canEdit && attr.required && <span className="text-red-500">*</span>}
              </span>
              {missingBoxes.length > 0 && (
                <span
                  title={missingBoxes.join(", ")}
                  className="px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 text-micro font-bold normal-case tracking-normal leading-none tabular-nums animate-fade-in"
                >
                  {missingBoxes.length} {t("missing", "chýba", "hiányzik")}
                </span>
              )}
            </label>

            {!canEdit ? (
              <div className="text-ui font-bold text-slate-800">
                {renderCustomAttributeValue(attr, values[attr.id], {
                  leads,
                  defaultCurrency,
                  userLanguage,
                  t,
                })}
              </div>
            ) : (
              <>
                {attr.type === "textfield" && (
                  <input
                    type="text"
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                  />
                )}

                {attr.type === "textarea" && (
                  <textarea
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring resize-none"
                  />
                )}

                {attr.type === "number" && (
                  <input
                    type="number"
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                  />
                )}

                {attr.type === "money" && (() => {
                  const current = parseMoneyValue(values[attr.id], defaultCurrency);
                  return (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={current.amount === null ? "" : String(current.amount)}
                        onChange={e => {
                          const raw = e.target.value.trim().replace(",", ".");
                          const parsed = Number(raw);
                          onChange(attr.id, {
                            amount: raw === "" || !Number.isFinite(parsed) ? null : parsed,
                            currency: current.currency,
                          });
                        }}
                        className="flex-1 min-w-0 px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                        placeholder={t("Amount", "Čiastka", "Összeg")}
                      />
                      <div className="w-28 shrink-0">
                        <CustomSelect
                          value={current.currency}
                          onChange={code => onChange(attr.id, { amount: current.amount, currency: code })}
                          className="text-ui"
                          options={CURRENCY_OPTIONS.map(c => ({ value: c.code, label: `${c.code} ${c.symbol}` }))}
                        />
                      </div>
                    </div>
                  );
                })()}

                {attr.type === "date" && (
                  <input
                    type="date"
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                  />
                )}

                {attr.type === "time" && (
                  <input
                    type="time"
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                  />
                )}

                {attr.type === "datetime" && (
                  <input
                    type="datetime-local"
                    value={val}
                    onChange={e => onChange(attr.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid focus:ring-2 focus:ring-entity-ring"
                  />
                )}

                {attr.type === "select" && (
                  <CustomSelect
                    value={val}
                    onChange={v => onChange(attr.id, v)}
                    placeholder={t("Select option...", "Vybrať možnosť...", "Válasszon opciót...")}
                    options={(attr.options || []).map(opt => ({ value: opt, label: opt }))}
                  />
                )}

                {attr.type === "checkbox" && (
                  <div className="space-y-1 py-1">
                    {attr.options ? (() => {
                      const list = readChecklistValue(val);
                      const save = (next: Partial<typeof list>) =>
                        onChange(attr.id, writeChecklistValue({ ...list, ...next }));
                      const toggle = (label: string) =>
                        save({
                          checked: list.checked.includes(label)
                            ? list.checked.filter(o => o !== label)
                            : [...list.checked, label],
                        });
                      const requiredOptions = attr.requiredOptions || [];
                      const draft = newChecklistLabels[attr.id] || "";
                      const addExtra = () => {
                        const label = draft.trim();
                        if (!label) return;
                        const taken = [...(attr.options || []), ...list.extra.map(e => e.label)].some(
                          l => l.toLowerCase() === label.toLowerCase(),
                        );
                        if (!taken) save({ extra: [...list.extra, { label, required: true }] });
                        setNewChecklistLabels(prev => ({ ...prev, [attr.id]: "" }));
                      };
                      return (
                        <>
                          {(attr.options || []).map(opt => (
                            <label key={opt} className="flex items-center gap-2 cursor-pointer text-ui font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                checked={list.checked.includes(opt)}
                                onChange={() => toggle(opt)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              <span>{opt}</span>
                              {requiredOptions.includes(opt) && <span className="text-red-500">*</span>}
                            </label>
                          ))}
                          {list.extra.map(extra => (
                            <div key={extra.label} className="group flex items-start gap-2 text-ui font-semibold text-slate-600">
                              <label className="flex min-w-0 items-start gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={list.checked.includes(extra.label)}
                                  onChange={() => toggle(extra.label)}
                                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600"
                                />
                                <span className="min-w-0 break-words">{extra.label}</span>
                              </label>
                              {(() => {
                                const hint = extra.required
                                  ? t("Required — click to make optional", "Povinné — kliknutím nastavíte ako nepovinné", "Kötelező — kattintson az opcionálishoz")
                                  : t("Optional — click to make required", "Nepovinné — kliknutím nastavíte ako povinné", "Opcionális — kattintson a kötelezőhöz");
                                return (
                                  <button
                                    type="button"
                                    aria-pressed={extra.required}
                                    aria-label={hint}
                                    title={hint}
                                    onClick={() =>
                                      save({
                                        extra: list.extra.map(e =>
                                          e.label === extra.label ? { ...e, required: !e.required } : e,
                                        ),
                                      })
                                    }
                                    className={`-ml-1 shrink-0 w-4 h-4 flex items-center justify-center rounded text-body leading-none font-bold transition-all duration-150 active:scale-90 cursor-pointer ${
                                      extra.required
                                        ? "text-red-500 hover:bg-rose-50"
                                        : "text-slate-300 hover:text-red-400 hover:bg-slate-100"
                                    }`}
                                  >
                                    *
                                  </button>
                                );
                              })()}
                              {canDelete && (
                                <HoldToConfirmButton
                                  tone="danger"
                                  lang={userLanguage}
                                  what={extra.label}
                                  onConfirm={() => {
                                    const previous = { extra: list.extra, checked: list.checked };
                                    runUndoable({
                                      message: singleMessage(userLanguage, "item", "delete", extra.label),
                                      undoLabel: undoLabel(userLanguage),
                                      apply: () =>
                                        save({
                                          extra: list.extra.filter(e => e.label !== extra.label),
                                          checked: list.checked.filter(o => o !== extra.label),
                                        }),
                                      revert: () => save(previous),
                                    });
                                  }}
                                  className="shrink-0 p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-150 active:scale-95"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </HoldToConfirmButton>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              value={draft}
                              onChange={e => setNewChecklistLabels(prev => ({ ...prev, [attr.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addExtra();
                                }
                              }}
                              placeholder={t("Add checkbox…", "Pridať políčko…", "Jelölőnégyzet hozzáadása…")}
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md border border-gray-300 text-ui font-medium bg-white text-gray-900 focus:outline-none focus:border-entity-solid"
                            />
                            <button
                              type="button"
                              onClick={addExtra}
                              disabled={!draft.trim()}
                              aria-label={t("Add checkbox", "Pridať políčko", "Jelölőnégyzet hozzáadása")}
                              className="shrink-0 p-1.5 rounded-md bg-entity-solid text-white hover:bg-entity-solid-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      );
                    })() : (
                      <label className="flex items-center gap-2 cursor-pointer text-ui font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={e => onChange(attr.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <span>{t("Yes / Enabled", "Áno / Povolené", "Igen / Engedélyezve")}</span>
                      </label>
                    )}
                  </div>
                )}

                {attr.type === "radio" && (
                  <div className="space-y-1.5 py-1">
                    {(attr.options || []).map(opt => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer text-ui font-semibold text-slate-600">
                        <input
                          type="radio"
                          name={`${instanceKey}-${attr.id}`}
                          value={opt}
                          checked={val === opt}
                          onChange={() => onChange(attr.id, opt)}
                          className="h-4 w-4 border-slate-300 text-blue-600"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {attr.type === "files" && (
                  <div
                    className={`space-y-2 rounded-xl transition-colors duration-150 ${
                      dropTarget === attr.id ? "ring-2 ring-blue-400 bg-blue-50/60" : ""
                    }`}
                    {...dropZoneProps(attr.id)}
                  >
                    <div className="flex flex-col gap-1.5">
                      {asAttributeList(val).map((f, fIdx) => (
                        <div key={fIdx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-ui font-semibold">
                          <a
                            href={f.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 truncate animate-fade-in"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate">{f.name}</span>
                            <span className="text-micro text-slate-400 font-medium shrink-0">({f.size})</span>
                          </a>
                          {canDelete && (
                            <HoldToConfirmButton
                              tone="danger"
                              lang={userLanguage}
                              what={f.name}
                              onConfirm={() => removeFile(attr.id, fIdx)}
                              className="p-1 hover:bg-rose-50 rounded text-rose-600 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </HoldToConfirmButton>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        disabled={isUploading === attr.id}
                        onClick={() => document.getElementById(`attr-file-${instanceKey}-${attr.id}`)?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-ui font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="h-4 w-4 text-slate-400" />
                        <span>
                          {isUploading === attr.id
                            ? t("Uploading...", "Nahráva sa...", "Feltöltés...")
                            : t("Upload file or drop it here", "Nahrať súbor alebo ho sem pretiahnite", "Fájl feltöltése vagy húzza ide")}
                        </span>
                      </button>
                      <input
                        type="file"
                        multiple
                        id={`attr-file-${instanceKey}-${attr.id}`}
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          void addFiles(attr.id, files);
                        }}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}

                {attr.type === "contact" && (
                  <div className="space-y-2">
                    <ClientSelect
                      leads={leads}
                      value={val}
                      onChange={v => onChange(attr.id, v)}
                      placeholder={t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}
                    />
                    {val && (() => {
                      const contact = leads.find(l => l.id === val);
                      if (!contact) return null;
                      return (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-caption font-semibold text-slate-600 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-800 font-bold">{contact.name}</span>
                            <a href={`#lead-${contact.id}`} className="text-blue-600 hover:text-blue-800 text-micro underline">
                              {t("View Profile", "Zobraziť profil", "Profil megtekintése")}
                            </a>
                          </div>
                          {contact.email && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{contact.email}</span>
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{contact.phone}</span>
                              <WhatsAppChip lead={contact} leads={leads} userLanguage={userLanguage} className="ml-1" />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {canEdit && missingRequired && (
              <p className="mt-1 text-micro font-bold text-rose-600 leading-snug">
                {t("Required", "Povinné", "Kötelező")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
