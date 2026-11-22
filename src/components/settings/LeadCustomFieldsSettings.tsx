import React, { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { ProjectAttribute, ProjectAttributeType } from "../../types";
import type { Language } from "../../utils/translations";
import { cn } from "../../utils/cn";
import { useDragReorder } from "../../hooks/useDragReorder";
import { moveRelative } from "../../utils/reorder";
import { runUndoable } from "../../utils/undoable";
import { singleMessage, undoLabel } from "../../utils/undoMessages";
import { SectionCard } from "./SectionCard";
import { CustomSelect } from "../ui/CustomSelect";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import {
  ATTRIBUTE_TYPES,
  AttrOptionsEditor,
  cleanAttrOptions,
  isOptionAttrType,
} from "../common/CustomAttributeControls";

interface LeadCustomFieldsSettingsProps {
  leadAttributes: ProjectAttribute[];
  setLeadAttributes: React.Dispatch<React.SetStateAction<ProjectAttribute[]>>;
  userLanguage: Language;
  canEdit: boolean;
}

export const LeadCustomFieldsSettings: React.FC<LeadCustomFieldsSettingsProps> = ({
  leadAttributes,
  setLeadAttributes,
  userLanguage,
  canEdit,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const attributeTypeLabel = (id: ProjectAttributeType) => {
    const entry = ATTRIBUTE_TYPES.find(a => a.id === id);
    return entry ? t(entry.label[0], entry.label[1], entry.label[2]) : id;
  };

  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState<ProjectAttributeType>("textfield");
  const [newAttrRequired, setNewAttrRequired] = useState(false);
  const [newAttrOptions, setNewAttrOptions] = useState<string[]>([]);
  const [newAttrOptionDraft, setNewAttrOptionDraft] = useState("");
  const [newAttrRequiredOptions, setNewAttrRequiredOptions] = useState<string[]>([]);
  const [editingAttrId, setEditingAttrId] = useState<string | null>(null);

  const attrDrag = useDragReorder<string>({
    disabled: !canEdit,
    onReorder: (dragId, targetId, pos) =>
      setLeadAttributes(prev => moveRelative(prev, a => a.id, dragId, targetId, pos)),
  });

  const resetForm = () => {
    setNewAttrName("");
    setNewAttrType("textfield");
    setNewAttrRequired(false);
    setNewAttrOptions([]);
    setNewAttrOptionDraft("");
    setNewAttrRequiredOptions([]);
    setEditingAttrId(null);
  };

  const handleStartEdit = (attr: ProjectAttribute) => {
    setEditingAttrId(attr.id);
    setNewAttrName(attr.name);
    setNewAttrType(attr.type);
    setNewAttrRequired(!!attr.required);
    setNewAttrOptions(attr.options || []);
    setNewAttrOptionDraft("");
    setNewAttrRequiredOptions(attr.requiredOptions || []);
  };

  const handleTypeChange = (next: ProjectAttributeType) => {
    if (editingAttrId && next !== newAttrType) {
      const ok = window.confirm(
        t(
          "WARNING: Changing this field's type can lead to data loss on existing leads. Do you want to proceed?",
          "VAROVANIE: Zmena typu tohto poľa môže viesť k strate údajov pri existujúcich leadoch. Chcete pokračovať?",
          "FIGYELMEZTETÉS: A mező típusának megváltoztatása adatvesztéshez vezethet a meglévő leadeknél. Folytatja?",
        ),
      );
      if (!ok) return;
    }
    setNewAttrType(next);
  };

  const handleSave = () => {
    const name = newAttrName.trim();
    if (!name || !canEdit) return;
    const options = cleanAttrOptions(newAttrType, newAttrOptions, newAttrOptionDraft);
    const requiredOptions =
      newAttrType === "checkbox" && options
        ? Array.from(new Set(newAttrRequiredOptions.map(o => o.trim()))).filter(o => options.includes(o))
        : [];
    const required = newAttrType === "checkbox" ? false : newAttrRequired;

    if (editingAttrId) {
      setLeadAttributes(prev =>
        prev.map(a =>
          a.id === editingAttrId
            ? { ...a, name, type: newAttrType, required, options, requiredOptions }
            : a,
        ),
      );
    } else {
      const id = `lattr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      setLeadAttributes(prev => [
        ...prev,
        { id, name, type: newAttrType, required, options, requiredOptions },
      ]);
    }
    resetForm();
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    if (!canEdit) return;
    setLeadAttributes(prev => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleRemove = (attrId: string) => {
    if (!canEdit) return;
    const idx = leadAttributes.findIndex(a => a.id === attrId);
    if (idx === -1) return;
    const removed = leadAttributes[idx];
    if (editingAttrId === attrId) resetForm();

    runUndoable({
      message: singleMessage(userLanguage, "attribute", "delete", removed.name),
      undoLabel: undoLabel(userLanguage),
      apply: () => setLeadAttributes(prev => prev.filter(a => a.id !== attrId)),
      revert: () =>
        setLeadAttributes(prev => {
          if (prev.some(a => a.id === removed.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(idx, next.length), 0, removed);
          return next;
        }),
    });
  };

  return (
    <SectionCard
      title={t("Lead Custom Fields", "Vlastné polia leadov", "Lead egyedi mezők")}
      description={t(
        "Custom attributes appear on every lead card, in the add-lead form, and as optional sortable columns in the leads list. When a lead is converted into a project, fields with a matching name and type carry their values across automatically.",
        "Vlastné atribúty sa zobrazujú na karte každého leadu, vo formulári nového leadu a ako voliteľné triediteľné stĺpce v zozname leadov. Pri konverzii leadu na projekt sa polia s rovnakým názvom a typom prenesú automaticky.",
        "Az egyedi attribútumok megjelennek minden lead kártyáján, az új lead űrlapon és opcionális, rendezhető oszlopként a leadek listájában. Projektkonvertáláskor az azonos nevű és típusú mezők értékei automatikusan átkerülnek.",
      )}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {leadAttributes.length === 0 ? (
            <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center text-gray-400 text-ui">
              {t(
                "No custom lead fields yet. Add your first field below.",
                "Zatiaľ žiadne vlastné polia leadov. Pridajte prvé pole nižšie.",
                "Még nincsenek egyedi lead mezők. Adja hozzá az elsőt lent.",
              )}
            </div>
          ) : (
            leadAttributes.map((attr, idx) => {
              const drop = attrDrag.dropAt(attr.id);
              const isEditing = editingAttrId === attr.id;
              return (
                <div
                  key={attr.id}
                  data-attr-row=""
                  {...attrDrag.rowProps(attr.id, !isEditing)}
                  title={canEdit && !isEditing ? t("Drag to reorder", "Potiahnutím zmeníte poradie", "Húzza az átrendezéshez") : undefined}
                  className={cn(
                    "group relative flex items-center justify-between p-3 bg-white border rounded-lg shadow-xs text-ui font-semibold transition-[opacity,box-shadow,border-color] duration-150",
                    isEditing ? "border-entity-border ring-2 ring-entity-solid/25" : "border-gray-200",
                    canEdit && !isEditing && "cursor-grab active:cursor-grabbing",
                    attrDrag.draggedId === attr.id && "opacity-40",
                  )}
                >
                  {drop === "before" && (
                    <span className="pointer-events-none absolute inset-x-2 -top-1 h-0.5 rounded-full bg-entity-solid animate-in fade-in duration-150" />
                  )}
                  {drop === "after" && (
                    <span className="pointer-events-none absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-entity-solid animate-in fade-in duration-150" />
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    {canEdit && (
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-entity-text transition-colors duration-150" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-gray-800 text-ui truncate">{attr.name}</span>
                      <span className="text-gray-400 font-medium text-caption">
                        {attributeTypeLabel(attr.type)}
                        {attr.required && t(" • Required", " • Povinné", " • Kötelező")}
                        {attr.type === "checkbox" &&
                          (attr.requiredOptions || []).length > 0 &&
                          ` • ${(attr.requiredOptions || []).length} ${t("required boxes", "povinných políčok", "kötelező négyzet")}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={!canEdit || idx === 0}
                      onClick={() => handleMove(idx, "up")}
                      aria-label={t("Move up", "Posunúť hore", "Feljebb")}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 transition-colors duration-150 active:scale-95 cursor-pointer"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || idx === leadAttributes.length - 1}
                      onClick={() => handleMove(idx, "down")}
                      aria-label={t("Move down", "Posunúť dole", "Lejjebb")}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30 transition-colors duration-150 active:scale-95 cursor-pointer"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-label={t("Edit field", "Upraviť pole", "Mező szerkesztése")}
                      onClick={() => handleStartEdit(attr)}
                      className="p-1 hover:bg-entity-soft rounded text-entity-text disabled:opacity-30 transition-colors duration-150 active:scale-95 cursor-pointer"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <HoldToConfirmButton
                      tone="danger"
                      lang={userLanguage}
                      what={attr.name}
                      onConfirm={() => handleRemove(attr.id)}
                      disabled={!canEdit}
                      className="p-1 hover:bg-rose-50 rounded text-rose-600 transition-colors duration-150 active:scale-95"
                    >
                      <Trash2 className="h-4 w-4" />
                    </HoldToConfirmButton>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canEdit && (
          <div
            data-lead-attr-form=""
            className={cn(
              "p-4 rounded-lg space-y-3 border transition-colors duration-150",
              editingAttrId ? "bg-entity-soft border-entity-border" : "bg-gray-50 border-gray-200",
            )}
          >
            {editingAttrId && (
              <div className="type-overline font-heading text-entity-text">
                {t("Edit custom field", "Upraviť vlastné pole", "Egyedi mező szerkesztése")}
              </div>
            )}
            <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
              <div>
                <label className="block type-overline text-gray-400 mb-1">
                  {t("Field Label", "Názov poľa", "Mező neve")}
                </label>
                <input
                  value={newAttrName}
                  onChange={e => setNewAttrName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !isOptionAttrType(newAttrType)) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  placeholder={t("e.g. Budget Ceiling", "napr. Rozpočtový strop", "pl. Költségkeret")}
                  className="w-full px-3 py-2 rounded-md border border-gray-200 text-ui font-semibold bg-white"
                />
              </div>
              <div>
                <label className="block type-overline text-gray-400 mb-1">
                  {t("Type", "Typ", "Típus")}
                </label>
                <CustomSelect
                  value={newAttrType}
                  onChange={v => handleTypeChange(v as ProjectAttributeType)}
                  options={ATTRIBUTE_TYPES.map(at => ({ value: at.id, label: attributeTypeLabel(at.id) }))}
                />
              </div>
            </div>

            {isOptionAttrType(newAttrType) && (
              <AttrOptionsEditor
                options={newAttrOptions}
                onChange={setNewAttrOptions}
                draft={newAttrOptionDraft}
                onDraftChange={setNewAttrOptionDraft}
                requiredOptions={newAttrType === "checkbox" ? newAttrRequiredOptions : undefined}
                onRequiredChange={setNewAttrRequiredOptions}
                requiredTooltip={t(
                  "Every lead has to tick this box",
                  "Každý lead musí toto políčko zaškrtnúť",
                  "Minden leadnek be kell jelölnie",
                )}
                requiredHint={t(
                  "Mark the boxes every lead should tick.",
                  "Označte políčka, ktoré by mal každý lead zaškrtnúť.",
                  "Jelölje meg, mely négyzeteket kell minden leadnél bejelölni.",
                )}
                t={t}
              />
            )}

            <div className="flex items-center justify-between pt-1">
              {newAttrType === "checkbox" ? (
                <span />
              ) : (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newAttrRequired}
                    onChange={e => setNewAttrRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-entity-text"
                  />
                  <span className="text-ui font-semibold text-gray-600">
                    {t("Required field", "Povinné pole", "Kötelező mező")}
                  </span>
                </label>
              )}

              <div className="flex items-center gap-1.5">
                {editingAttrId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 font-bold text-ui hover:bg-gray-50 transition-all duration-150 active:scale-95 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    <span>{t("Cancel", "Zrušiť", "Mégse")}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={!newAttrName.trim()}
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-entity-solid text-white font-bold text-ui hover:bg-entity-solid disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 cursor-pointer"
                >
                  {editingAttrId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>
                    {editingAttrId
                      ? t("Save changes", "Uložiť zmeny", "Változtatások mentése")
                      : t("Add Field", "Pridať pole", "Mező hozzáadása")}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
