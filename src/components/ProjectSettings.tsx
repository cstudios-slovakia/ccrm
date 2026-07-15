import React, { useState } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import type { ProjectType, ProjectAttribute, ProjectAttributeType, TimelineEventType } from "../types";
import type { Language } from "../utils/translations";

interface ProjectSettingsProps {
  projectTypes: ProjectType[];
  setProjectTypes: React.Dispatch<React.SetStateAction<ProjectType[]>>;
  userLanguage: Language;
  canEdit: boolean;
}

const ALL_LUCIDE_ICONS = Object.keys(Icons).filter(key => {
  return /^[A-Z][a-zA-Z0-9]*$/.test(key) && 
         key !== 'createReactComponent' &&
         key !== 'Icon';
});

const ATTRIBUTE_TYPES: { id: ProjectAttributeType; label: string }[] = [
  { id: "textfield", label: "Text Field" },
  { id: "textarea", label: "Text Area" },
  { id: "select", label: "Dropdown Select" },
  { id: "date", label: "Date" },
  { id: "time", label: "Time" },
  { id: "datetime", label: "Date & Time" },
  { id: "number", label: "Number" },
  { id: "checkbox", label: "Checkbox" },
  { id: "radio", label: "Radio Button" },
  { id: "files", label: "File Upload" },
  { id: "contact", label: "Contact Picker" }
];

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
  projectTypes,
  setProjectTypes,
  userLanguage,
  canEdit
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [typeName, setTypeName] = useState("");
  const [typeDesc, setTypeDesc] = useState("");
  const [typeIcon, setTypeIcon] = useState("Briefcase");
  const [typeColor, setTypeColor] = useState("#a855f7"); // Default lavender
  const [hasTimeline, setHasTimeline] = useState(false);
  const [hasGantt, setHasGantt] = useState(false);
  const [attributes, setAttributes] = useState<ProjectAttribute[]>([]);

  // Timeline Custom Events states
  const [timelineEventTypes, setTimelineEventTypes] = useState<TimelineEventType[]>([]);
  const [selectedTeTypeId, setSelectedTeTypeId] = useState<string | null>(null);

  // Timeline Event Types builder state
  const [newTeTypeName, setNewTeTypeName] = useState("");
  const [newTeTypeColor, setNewTeTypeColor] = useState("#a855f7");
  const [newTeTypeIcon, setNewTeTypeIcon] = useState("Activity");
  const [isTeIconPickerOpen, setIsTeIconPickerOpen] = useState(false);
  const [teIconSearchQuery, setTeIconSearchQuery] = useState("");

  // Timeline Attribute builder states
  const [newTeAttrName, setNewTeAttrName] = useState("");
  const [newTeAttrType, setNewTeAttrType] = useState<ProjectAttributeType>("textfield");
  const [newTeAttrRequired, setNewTeAttrRequired] = useState(false);
  const [newTeAttrOptions, setNewTeAttrOptions] = useState("");

  // Attribute builder states
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState<ProjectAttributeType>("textfield");
  const [newAttrRequired, setNewAttrRequired] = useState(false);
  const [newAttrOptions, setNewAttrOptions] = useState("");

  const [iconSearchQuery, setIconSearchQuery] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const colors = [
    "#a855f7", // Lavender
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#ec4899", // Pink
    "#06b6d4"  // Cyan
  ];

  const handleStartCreate = () => {
    setTypeName("");
    setTypeDesc("");
    setTypeIcon("Briefcase");
    setTypeColor("#a855f7");
    setHasTimeline(false);
    setHasGantt(false);
    setAttributes([]);
    setTimelineEventTypes([]);
    setSelectedTeTypeId(null);
    setIsCreating(true);
    setEditingType(null);
  };

  const handleStartEdit = (type: ProjectType) => {
    setEditingType(type);
    setTypeName(type.name);
    setTypeDesc(type.description);
    setTypeIcon(type.icon);
    setTypeColor(type.color);
    setHasTimeline(type.hasTimeline);
    setHasGantt(type.hasGantt);
    setAttributes(type.attributes || []);
    setTimelineEventTypes(type.timelineEventTypes || []);
    setSelectedTeTypeId(type.timelineEventTypes && type.timelineEventTypes.length > 0 ? type.timelineEventTypes[0].id : null);
    setIsCreating(false);
  };

  const handleAddAttribute = () => {
    if (!newAttrName.trim()) return;
    const attrId = "attr_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newAttr: ProjectAttribute = {
      id: attrId,
      name: newAttrName.trim(),
      type: newAttrType,
      required: newAttrRequired,
      options: ["select", "radio", "checkbox"].includes(newAttrType)
        ? newAttrOptions.split(",").map(o => o.trim()).filter(Boolean)
        : undefined
    };

    setAttributes(prev => [...prev, newAttr]);
    setNewAttrName("");
    setNewAttrType("textfield");
    setNewAttrRequired(false);
    setNewAttrOptions("");
  };

  const handleRemoveAttribute = (attrId: string) => {
    if (editingType) {
      const confirmMsg = t(
        "WARNING: Removing this attribute will permanently delete all associated data from the database for existing projects. Do you want to proceed?",
        "VAROVANIE: Odstránenie tohto atribútu trvalo vymaže všetky pridružené údaje z databázy pre existujúce projekty. Chcete pokračovať?",
        "FIGYELMEZTETÉS: Ezen attribútum törlése véglegesen törli az összes kapcsolódó adatot az adatbázisból a meglévő projekteknél. Folytatja?"
      );
      if (!window.confirm(confirmMsg)) return;
    }
    setAttributes(prev => prev.filter(a => a.id !== attrId));
  };

  const handleMoveAttribute = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= attributes.length) return;
    const nextAttrs = [...attributes];
    const temp = nextAttrs[index];
    nextAttrs[index] = nextAttrs[nextIndex];
    nextAttrs[nextIndex] = temp;
    setAttributes(nextAttrs);
  };

  const handleAddTeType = () => {
    if (!newTeTypeName.trim()) return;
    if (timelineEventTypes.some(t => t.name.toLowerCase() === newTeTypeName.trim().toLowerCase())) return;
    const newId = "tet_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newTeType: TimelineEventType = {
      id: newId,
      name: newTeTypeName.trim(),
      color: newTeTypeColor,
      icon: newTeTypeIcon,
      attributes: []
    };
    setTimelineEventTypes(prev => [...prev, newTeType]);
    setSelectedTeTypeId(newId);
    setNewTeTypeName("");
    setNewTeTypeColor("#a855f7");
    setNewTeTypeIcon("Activity");
  };

  const handleAddTimelineAttribute = () => {
    if (!selectedTeTypeId || !newTeAttrName.trim()) return;
    const attrId = "tattr_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newAttr: ProjectAttribute = {
      id: attrId,
      name: newTeAttrName.trim(),
      type: newTeAttrType,
      required: newTeAttrRequired,
      options: ["select", "radio", "checkbox"].includes(newTeAttrType)
        ? newTeAttrOptions.split(",").map(o => o.trim()).filter(Boolean)
        : undefined
    };

    setTimelineEventTypes(prev => prev.map(t => {
      if (t.id === selectedTeTypeId) {
        return { ...t, attributes: [...t.attributes, newAttr] };
      }
      return t;
    }));

    setNewTeAttrName("");
    setNewTeAttrType("textfield");
    setNewTeAttrRequired(false);
    setNewTeAttrOptions("");
  };

  const handleRemoveTimelineAttribute = (attrId: string) => {
    if (!selectedTeTypeId) return;
    if (editingType) {
      const confirmMsg = t(
        "WARNING: Removing this timeline attribute will permanently delete all associated data from the database. Do you want to proceed?",
        "VAROVANIE: Odstránenie tohto atribútu časovej osi trvalo vymaže všetky prislúchajúce údaje z databázy. Chcete pokračovať?",
        "FIGYELMEZTETÉS: Ezen idővonal attribútum törlése véglegesen törli a hozzá tartozó adatokat az adatbázisból. Biztosan folytatja?"
      );
      if (!window.confirm(confirmMsg)) return;
    }
    setTimelineEventTypes(prev => prev.map(t => {
      if (t.id === selectedTeTypeId) {
        return { ...t, attributes: t.attributes.filter((a: ProjectAttribute) => a.id !== attrId) };
      }
      return t;
    }));
  };

  const handleMoveTimelineAttribute = (index: number, direction: "up" | "down") => {
    if (!selectedTeTypeId) return;
    setTimelineEventTypes(prev => prev.map(t => {
      if (t.id === selectedTeTypeId) {
        const nextList = [...t.attributes];
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= nextList.length) return t;
        const temp = nextList[index];
        nextList[index] = nextList[targetIndex];
        nextList[targetIndex] = temp;
        return { ...t, attributes: nextList };
      }
      return t;
    }));
  };

  const handleSaveType = () => {
    if (!typeName.trim()) {
      alert(t("Name is required", "Názov je povinný", "Név megadása kötelező"));
      return;
    }

    const typeId = editingType?.id || "pt_" + Date.now();
    const newType: ProjectType = {
      id: typeId,
      name: typeName.trim(),
      description: typeDesc.trim(),
      icon: typeIcon,
      color: typeColor,
      hasTimeline,
      hasGantt,
      attributes,
      timelineEventTypes
    };

    setProjectTypes(prev => {
      const exists = prev.some(t => t.id === typeId);
      if (exists) {
        return prev.map(t => t.id === typeId ? newType : t);
      } else {
        return [...prev, newType];
      }
    });

    setIsCreating(false);
    setEditingType(null);

    (window as any).showToast(
      t("Project type saved successfully!", "Projektový typ bol úspešne uložený!", "Projekt típus sikeresen mentve!")
    );
  };

  const handleDeleteType = (typeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmMsg = t(
      "WARNING: Deleting this project type will drop its associated data tables and permanently delete all projects of this type. Are you sure you want to proceed?",
      "VAROVANIE: Vymazanie tohto typu projektu odstráni jeho pridružené dátové tabuľky a trvalo vymaže všetky projekty tohto typu. Naozaj chcete pokračovať?",
      "FIGYELMEZTETÉS: Ezen projekt típus törlése törli a hozzá tartozó adattáblákat és véglegesen törli az összes ilyen típusú projektet. Biztosan folytatja?"
    );

    if (!window.confirm(confirmMsg)) return;

    setProjectTypes(prev => prev.filter(t => t.id !== typeId));
    (window as any).showToast(t("Project type deleted.", "Projektový typ bol vymazaný.", "Projekt típus törölve."));
  };

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Icons.Briefcase className={className} />;
  };

  const filteredIcons = ALL_LUCIDE_ICONS.filter(icon => 
    icon.toLowerCase().includes(iconSearchQuery.toLowerCase())
  ).slice(0, 48);

  if (isCreating || editingType) {
    return (
      <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h3 className="font-heading font-bold text-lg text-slate-800">
            {isCreating ? t("Create Project Type", "Vytvoriť typ projektu", "Projekt típus létrehozása") : t("Edit Project Type", "Upraviť typ projektu", "Projekt típus szerkesztése")}
          </h3>
          <button
            onClick={() => {
              setIsCreating(false);
              setEditingType(null);
            }}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-heading font-black text-slate-450 uppercase tracking-widest mb-1.5">
                {t("Type Name", "Názov typu", "Típus neve")}
              </label>
              <input
                disabled={!canEdit}
                value={typeName}
                onChange={e => setTypeName(e.target.value)}
                placeholder={t("e.g. Construction Project", "napr. Stavebný projekt", "pl. Építési projekt")}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-semibold text-slate-800 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-heading font-black text-slate-450 uppercase tracking-widest mb-1.5">
                {t("Description", "Popis", "Leírás")}
              </label>
              <textarea
                disabled={!canEdit}
                value={typeDesc}
                onChange={e => setTypeDesc(e.target.value)}
                placeholder={t("Describe the purpose of this project type...", "Popíšte účel tohto typu projektu...", "Írja le a projekt típus célját...")}
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-semibold text-slate-800 bg-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Icon Picker Toggle */}
              <div>
                <label className="block text-xs font-heading font-black text-slate-450 uppercase tracking-widest mb-1.5">
                  {t("Icon", "Ikona", "Ikon")}
                </label>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setIsIconPickerOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {renderIcon(typeIcon, "h-5 w-5 text-indigo-600")}
                    {typeIcon}
                  </span>
                  <Icons.ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-heading font-black text-slate-450 uppercase tracking-widest mb-1.5">
                  {t("Theme Color", "Farba témy", "Téma színe")}
                </label>
                <div className="flex items-center gap-2 py-1">
                  {colors.map(c => (
                    <button
                      key={c}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setTypeColor(c)}
                      className="h-8 w-8 rounded-full border-2 transition-all relative"
                      style={{
                        backgroundColor: c,
                        borderColor: typeColor === c ? "#000" : "transparent"
                      }}
                    >
                      {typeColor === c && (
                        <Icons.Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optional Modules */}
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={hasTimeline}
                  onChange={e => setHasTimeline(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  {t("Enable Timeline (attached events)", "Povoliť časovú os", "Idővonal engedélyezése")}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={hasGantt}
                  onChange={e => setHasGantt(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  {t("Enable Gantt Chart (project roadmap)", "Povoliť Ganttov diagram", "Gantt diagram engedélyezése")}
                </span>
              </label>
            </div>

            {/* Custom Event Types for Timeline */}
            {hasTimeline && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <label className="block text-xs font-heading font-black text-slate-450 uppercase tracking-widest">
                  {t("Timeline Event Types", "Typy udalostí časovej osi", "Idővonal eseménytípusok")}
                </label>

                {/* Input for Name, Color, and Icon picker */}
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-left">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                        {t("Event Type Name", "Názov typu udalosti", "Eseménytípus neve")}
                      </label>
                      <input
                        value={newTeTypeName}
                        onChange={e => setNewTeTypeName(e.target.value)}
                        placeholder="e.g. Measurement, Site Survey, Offer"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                        {t("Icon", "Ikona", "Ikon")}
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsTeIconPickerOpen(!isTeIconPickerOpen)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            {renderIcon(newTeTypeIcon, "h-4 w-4 text-purple-650")}
                            <span>{newTeTypeIcon}</span>
                          </div>
                          <span className="text-slate-400">▼</span>
                        </button>

                        {isTeIconPickerOpen && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-3 max-h-60 overflow-y-auto">
                            <input
                              type="text"
                              value={teIconSearchQuery}
                              onChange={e => setTeIconSearchQuery(e.target.value)}
                              placeholder={t("Search icons...", "Hľadať ikonu...", "Ikon keresése...")}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50"
                            />
                            <div className="grid grid-cols-6 gap-2">
                              {ALL_LUCIDE_ICONS.filter(icon =>
                                icon.toLowerCase().includes(teIconSearchQuery.toLowerCase())
                              ).slice(0, 36).map(iconName => {
                                const IconComp = (Icons as any)[iconName];
                                if (!IconComp) return null;
                                return (
                                  <button
                                    key={iconName}
                                    type="button"
                                    onClick={() => {
                                      setNewTeTypeIcon(iconName);
                                      setIsTeIconPickerOpen(false);
                                    }}
                                    className={`p-2 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer ${
                                      newTeTypeIcon === iconName ? "bg-purple-50 border border-purple-200 text-purple-600" : "text-slate-500"
                                    }`}
                                    title={iconName}
                                  >
                                    <IconComp className="h-4 w-4" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                      {t("Theme Color", "Farba témy", "Téma színe")}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {colors.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setNewTeTypeColor(c)}
                            className="h-6 w-6 rounded-full border border-slate-200 flex items-center justify-center cursor-pointer"
                            style={{ backgroundColor: c }}
                          >
                            {newTeTypeColor === c && (
                              <Icons.Check className="h-3 w-3 text-white stroke-[3px]" />
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleAddTeType}
                        className="ml-auto px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-all cursor-pointer shadow-sm"
                      >
                        {t("Add Event Type", "Pridať typ", "Hozzáadás")}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Display Event Types as Tags */}
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin mt-2">
                  {timelineEventTypes.length === 0 ? (
                    <span className="text-[10px] text-slate-400 font-semibold">{t("No custom event types configured yet.", "Žiadne vlastné typy.", "Nincsenek egyedi eseménytípusok.")}</span>
                  ) : (
                    timelineEventTypes.map((et) => {
                      const isSelected = selectedTeTypeId === et.id;
                      return (
                        <div
                          key={et.id}
                          onClick={() => setSelectedTeTypeId(et.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                            isSelected
                              ? "border-purple-300 bg-purple-50 text-purple-755 ring-2 ring-purple-600 ring-offset-1"
                              : "bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          {renderIcon(et.icon, "h-3.5 w-3.5")}
                          <span style={{ color: et.color }}>●</span>
                          <span>{et.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedTeTypeId === et.id) {
                                setSelectedTeTypeId(timelineEventTypes.find(t => t.id !== et.id)?.id || null);
                              }
                              setTimelineEventTypes(prev => prev.filter(t => t.id !== et.id));
                            }}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-1"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Tabs & Attributes Schema Builder under the input field */}
                {timelineEventTypes.length > 0 && (
                  <div className="space-y-4 border-t border-slate-200 pt-4 mt-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm text-left">
                    <h4 className="font-heading font-bold text-[11px] text-slate-500 uppercase tracking-widest">
                      {t("Configure Attributes per Event Type", "Konfigurovať atribúty podľa typu udalosti", "Attribútumok konfigurálása eseménytípus szerint")}
                    </h4>

                    {/* Event Type Tabs */}
                    <div className="flex border-b border-slate-200 overflow-x-auto gap-2 mb-4 scrollbar-none">
                      {timelineEventTypes.map(et => {
                        const isSelected = selectedTeTypeId === et.id;
                        return (
                          <button
                            key={et.id}
                            type="button"
                            onClick={() => setSelectedTeTypeId(et.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 font-black text-[10px] uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                              isSelected
                                ? "border-purple-600 text-purple-700"
                                : "border-transparent text-slate-400 hover:text-slate-700"
                            }`}
                          >
                            {renderIcon(et.icon, "h-3.5 w-3.5")}
                            <span style={{ color: et.color }}>●</span>
                            <span>{et.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    {(() => {
                      const selectedTeType = timelineEventTypes.find(t => t.id === selectedTeTypeId);
                      if (!selectedTeType) return null;

                      return (
                        <div className="space-y-4 animate-fade-in text-left">
                          {/* Existing timeline attributes list */}
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                            {selectedTeType.attributes.length === 0 ? (
                              <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                                {t("No custom attributes defined for this event type.", "Pre tento typ udalosti nie sú definované žiadne vlastné atribúty.", "Nincsenek egyedi attribútumok definiálva ehhez az eseménytípushoz.")}
                              </div>
                            ) : (
                              selectedTeType.attributes.map((attr: ProjectAttribute, idx: number) => (
                                <div key={attr.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs font-semibold">
                                  <div className="flex flex-col">
                                    <span className="text-slate-800 text-[13px]">{attr.name}</span>
                                    <span className="text-slate-400 font-medium">
                                      {ATTRIBUTE_TYPES.find(t => t.id === attr.type)?.label} 
                                      {attr.required && " • Required"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={!canEdit || idx === 0}
                                      onClick={() => handleMoveTimelineAttribute(idx, "up")}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"
                                    >
                                      <ArrowUp className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEdit || idx === selectedTeType.attributes.length - 1}
                                      onClick={() => handleMoveTimelineAttribute(idx, "down")}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"
                                    >
                                      <ArrowDown className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEdit}
                                      onClick={() => handleRemoveTimelineAttribute(attr.id)}
                                      className="p-1 hover:bg-rose-50 rounded text-rose-600"
                                    >
                                      <Trash2 className="h-4.5 w-4.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Add new timeline attribute form */}
                          {canEdit && (
                            <div className="bg-slate-50 p-4 rounded-2xl space-y-3 border border-slate-200">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                                    {t("Attribute Label", "Názov atribútu", "Attribútum neve")}
                                  </label>
                                  <input
                                    value={newTeAttrName}
                                    onChange={e => setNewTeAttrName(e.target.value)}
                                    placeholder="e.g. Photograph, Site Report"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                                    {t("Type", "Typ", "Típus")}
                                  </label>
                                  <select
                                    value={newTeAttrType}
                                    onChange={e => setNewTeAttrType(e.target.value as ProjectAttributeType)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                                  >
                                    {ATTRIBUTE_TYPES.map(t => (
                                      <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {["select", "radio", "checkbox"].includes(newTeAttrType) && (
                                <div>
                                  <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                                    {t("Options (comma separated)", "Možnosti (oddelené čiarkou)", "Opciók (vesszővel elválasztva)")}
                                  </label>
                                  <input
                                    value={newTeAttrOptions}
                                    onChange={e => setNewTeAttrOptions(e.target.value)}
                                    placeholder="Option 1, Option 2, Option 3"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                                  />
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={newTeAttrRequired}
                                    onChange={e => setNewTeAttrRequired(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-650"
                                  />
                                  <span className="text-xs font-semibold text-slate-655">{t("Required field", "Povinné pole", "Kötelező mező")}</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={handleAddTimelineAttribute}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-755 transition-all cursor-pointer"
                                >
                                  <Plus className="h-4 w-4" />
                                  <span>{t("Add Attribute", "Pridať atribút", "Attribútum hozzáadása")}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attributes Schema Builder */}
          <div className="space-y-4 border-l border-slate-200 pl-6">
            <h4 className="font-heading font-bold text-sm text-slate-700">
              {t("Project Attributes", "Atribúty projektu", "Projekt attribútumok")}
            </h4>

            {/* Existing attributes list */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
              {attributes.length === 0 ? (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                  {t("No attributes added yet. Use the form below to add attributes.", "Zatiaľ neboli pridané žiadne atribúty.", "Még nincsenek attribútumok hozzáadva.")}
                </div>
              ) : (
                attributes.map((attr, idx) => (
                  <div key={attr.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs font-semibold">
                    <div className="flex flex-col">
                      <span className="text-slate-800 text-[13px]">{attr.name}</span>
                      <span className="text-slate-400 font-medium">
                        {ATTRIBUTE_TYPES.find(t => t.id === attr.type)?.label} 
                        {attr.required && " • Required"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!canEdit || idx === 0}
                        onClick={() => handleMoveAttribute(idx, "up")}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || idx === attributes.length - 1}
                        onClick={() => handleMoveAttribute(idx, "down")}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleRemoveAttribute(attr.id)}
                        className="p-1 hover:bg-rose-50 rounded text-rose-600"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add new attribute form */}
            {canEdit && (
              <div className="bg-slate-50 p-4 rounded-2xl space-y-3 border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                      {t("Attribute Label", "Názov atribútu", "Attribútum neve")}
                    </label>
                    <input
                      value={newAttrName}
                      onChange={e => setNewAttrName(e.target.value)}
                      placeholder="e.g. Dimensions"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                      {t("Type", "Typ", "Típus")}
                    </label>
                    <select
                      value={newAttrType}
                      onChange={e => setNewAttrType(e.target.value as ProjectAttributeType)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                    >
                      {ATTRIBUTE_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {["select", "radio", "checkbox"].includes(newAttrType) && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                      {t("Options (comma separated)", "Možnosti (oddelené čiarkou)", "Opciók (vesszővel elválasztva)")}
                    </label>
                    <input
                      value={newAttrOptions}
                      onChange={e => setNewAttrOptions(e.target.value)}
                      placeholder="Option 1, Option 2, Option 3"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newAttrRequired}
                      onChange={e => setNewAttrRequired(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-650"
                    />
                    <span className="text-xs font-semibold text-slate-655">{t("Required field", "Povinné pole", "Kötelező mező")}</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddAttribute}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-755 transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t("Add Attribute", "Pridať atribút", "Attribútum hozzáadása")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        {canEdit && (
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              onClick={() => {
                setIsCreating(false);
                setEditingType(null);
              }}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-black uppercase text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
            <button
              onClick={handleSaveType}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-wider hover:bg-emerald-700 shadow-md cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{t("Save Project Type", "Uložiť typ projektu", "Projekt típus mentése")}</span>
            </button>
          </div>
        )}

        {/* Icon Picker Modal */}
        {isIconPickerOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl animate-in scale-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <span className="font-heading font-bold text-sm text-slate-800">
                  {t("Select Icon", "Vybrať ikonu", "Ikon kiválasztása")}
                </span>
                <button
                  type="button"
                  onClick={() => setIsIconPickerOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <input
                value={iconSearchQuery}
                onChange={e => setIconSearchQuery(e.target.value)}
                placeholder={t("Search icons...", "Hľadať ikony...", "Ikon keresése...")}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold mb-4 bg-slate-50"
              />

              <div className="grid grid-cols-6 gap-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                {filteredIcons.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => {
                      setTypeIcon(icon);
                      setIsIconPickerOpen(false);
                    }}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                      typeIcon === icon 
                        ? "border-indigo-600 bg-indigo-50 text-indigo-600" 
                        : "border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-600"
                    }`}
                    title={icon}
                  >
                    {renderIcon(icon, "h-5 w-5")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-left">
        <div className="flex flex-col">
          <h3 className="font-heading font-black text-slate-800 text-[15px] uppercase tracking-widest">
            {t("Project Types", "Typy projektov", "Projekt típusok")}
          </h3>
          <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider mt-0.5">
            {t("Configure dynamic templates and attributes schemas", "Konfigurácia šablón a atribútov pre projekty", "Sablonok és attribútum sémák beállítása")}
          </p>
        </div>

        {canEdit && (
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider hover:bg-indigo-750 shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>{t("New Project Type", "Nový typ", "Új típus")}</span>
          </button>
        )}
      </div>

      {projectTypes.length === 0 ? (
        <div className="glass-panel p-8 rounded-3xl border border-white/60 bg-white/95 text-center text-slate-400 shadow-glass">
          <p className="text-sm font-semibold">{t("No project types configured.", "Nie sú nakonfigurované žiadne typy projektov.", "Nincsenek projekt típusok beállítva.")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          {projectTypes.map(type => (
            <div
              key={type.id}
              onClick={() => handleStartEdit(type)}
              className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass hover:shadow-lg transition-all duration-300 cursor-pointer flex items-start justify-between group"
            >
              <div className="flex items-start gap-4">
                <div 
                  className="p-3 rounded-2xl text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: type.color }}
                >
                  {renderIcon(type.icon, "h-6 w-6")}
                </div>
                <div>
                  <h4 className="font-heading font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                    {type.name}
                  </h4>
                  <p className="text-xs font-semibold text-slate-500 line-clamp-2 mt-1">
                    {type.description || t("No description.", "Bez popisu.", "Nincs leírás.")}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 border border-slate-200">
                      {type.attributes?.length || 0} {t("attributes", "atribútov", "attribútum")}
                    </span>
                    {type.hasTimeline && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-50 text-[10px] font-bold text-purple-600 border border-purple-100">
                        {t("Timeline", "Časová os", "Idővonal")}
                      </span>
                    )}
                    {type.hasGantt && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[10px] font-bold text-blue-600 border border-blue-100">
                        {t("Gantt", "Gantt", "Gantt")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteType(type.id, e)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer shrink-0"
                  title={t("Delete Project Type", "Vymazať typ projektu", "Projekt típus törlése")}
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
