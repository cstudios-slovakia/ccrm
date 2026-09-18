import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Workflow, LayoutGrid, Rows3, CalendarClock, Paperclip, FileText, SlidersHorizontal, History, ListChecks, GripVertical, Pencil } from "lucide-react";
import { CustomSelect } from "./ui/CustomSelect";
import { cn } from "../utils/cn";
import { ColorPicker } from "./ui/ColorPicker";
import type { ProjectAutoCreateSettings, ProjectType, ProjectAttribute, ProjectAttributeType, ProjectFileField, TimelineEventType } from "../types";
import { DEFAULT_PROJECT_AUTO_CREATE, isProjectAutoCreateActive } from "../utils/projectAutoCreate";
import { DEFAULT_DEADLINE_WARNING_DAYS, normalizeDeadlineWarningDays } from "../utils/projects";
import type { Language } from "../utils/translations";
import { useUserPref } from "../utils/userPrefs";

/**
 * PROJECT-AUTO-CREATE-DISABLED (v1.9.29): automatic project creation from leads
 * is switched off, so its settings card is hidden. Setting this back to true
 * also needs the server calls restored — grep for the same marker.
 */
const PROJECT_AUTO_CREATE_ENABLED = false;

interface ProjectSettingsProps {
  projectTypes: ProjectType[];
  setProjectTypes: React.Dispatch<React.SetStateAction<ProjectType[]>>;
  userLanguage: Language;
  canEdit: boolean;
  /** Rules for turning every incoming lead into a project. */
  projectAutoCreate?: ProjectAutoCreateSettings;
  setProjectAutoCreate?: React.Dispatch<React.SetStateAction<ProjectAutoCreateSettings>>;
  /** The interest categories a lead can carry, so each can be given its own project type. */
  leadCategories?: string[];
  /**
   * Open straight into the "create project type" form. Set by the projects list
   * when someone picks "New project type" from the + New Project dropdown,
   * which used to dead-end at "No types configured" with nowhere to go.
   */
  autoStartCreate?: boolean;
  /** Called once the request above has been honoured, so it fires only once. */
  onAutoStartCreateHandled?: () => void;
}

const ALL_LUCIDE_ICONS = Object.keys(Icons).filter(key => {
  return /^[A-Z][a-zA-Z0-9]*$/.test(key) && 
         key !== 'createReactComponent' &&
         key !== 'Icon';
});

const ATTRIBUTE_TYPES: { id: ProjectAttributeType; label: [string, string, string] }[] = [
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
  { id: "contact", label: ["Contact Picker", "Výber kontaktu", "Kapcsolatválasztó"] }
];

const OPTION_ATTR_TYPES: ProjectAttributeType[] = ["select", "radio", "checkbox"];
const isOptionAttrType = (type: ProjectAttributeType) => OPTION_ATTR_TYPES.includes(type);

/** The sections the project type editor is split into. */
type EditSection = "general" | "timeline" | "attributes" | "files";

/** The light switch that turns a built-in attribute on or off. */
const Switch: React.FC<{ checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }> = ({
  checked,
  onChange,
  disabled,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 ${
      checked ? "bg-indigo-600" : "bg-slate-300"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
        checked ? "translate-x-4" : "translate-x-0.5"
      }`}
    />
  </button>
);

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
  projectTypes,
  setProjectTypes,
  userLanguage,
  canEdit,
  projectAutoCreate = DEFAULT_PROJECT_AUTO_CREATE,
  setProjectAutoCreate,
  leadCategories = [],
  autoStartCreate = false,
  onAutoStartCreateHandled
}) => {
  /* The view the projects screen opens on. The same preference the toggle in
     the list writes, deliberately: a separate stored default would sooner or
     later disagree with the toggle, and nobody could tell which one won. */
  const [projectsViewMode, setProjectsViewMode] = useUserPref("projectsViewMode");

  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  const attributeTypeLabel = (id: ProjectAttributeType) => {
    const entry = ATTRIBUTE_TYPES.find((a) => a.id === id);
    return entry ? t(entry.label[0], entry.label[1], entry.label[2]) : id;
  };

  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>("general");

  // Form states
  const [typeName, setTypeName] = useState("");
  const [typeDesc, setTypeDesc] = useState("");
  const [typeIcon, setTypeIcon] = useState("Briefcase");
  const [typeColor, setTypeColor] = useState("#a855f7"); // Default lavender
  const [hasTimeline, setHasTimeline] = useState(false);
  const [hasGantt, setHasGantt] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineWarningDays, setDeadlineWarningDays] = useState(DEFAULT_DEADLINE_WARNING_DAYS);
  const [deadlineRequired, setDeadlineRequired] = useState(false);
  const [fileFields, setFileFields] = useState<ProjectFileField[]>([]);
  const [newFileFieldName, setNewFileFieldName] = useState("");
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
  const [editingAttrId, setEditingAttrId] = useState<string | null>(null);
  const [editingTeAttrId, setEditingTeAttrId] = useState<string | null>(null);

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
    setHasDeadline(false);
    setDeadlineWarningDays(DEFAULT_DEADLINE_WARNING_DAYS);
    setDeadlineRequired(false);
    setFileFields([]);
    setNewFileFieldName("");
    setAttributes([]);
    setTimelineEventTypes([]);
    setSelectedTeTypeId(null);
    setEditSection("general");
    setIsCreating(true);
    setEditingType(null);
    resetAttrForm();
    resetTeAttrForm();
  };

  /* The projects list can ask for the create form directly — see autoStartCreate.
     The request is acknowledged straight away so it fires once and does not
     re-open the form every time this component re-renders. */
  useEffect(() => {
    if (!autoStartCreate || !canEdit) return;
    handleStartCreate();
    onAutoStartCreateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartCreate, canEdit]);

  const handleStartEdit = (type: ProjectType) => {
    setEditingType(type);
    setTypeName(type.name);
    setTypeDesc(type.description);
    setTypeIcon(type.icon);
    setTypeColor(type.color);
    setHasTimeline(type.hasTimeline);
    setHasGantt(type.hasGantt);
    setHasDeadline(!!type.hasDeadline);
    // A type saved before deadlines existed has no window of its own; offer the
    // default rather than 0, which would read as "never warn me early".
    setDeadlineWarningDays(
      type.hasDeadline ? normalizeDeadlineWarningDays(type.deadlineWarningDays) : DEFAULT_DEADLINE_WARNING_DAYS
    );
    setDeadlineRequired(!!type.deadlineRequired);
    setFileFields(type.fileFields || []);
    setNewFileFieldName("");
    setEditSection("general");
    setAttributes(type.attributes || []);
    setTimelineEventTypes(type.timelineEventTypes || []);
    setSelectedTeTypeId(type.timelineEventTypes && type.timelineEventTypes.length > 0 ? type.timelineEventTypes[0].id : null);
    setIsCreating(false);
    resetAttrForm();
    resetTeAttrForm();
  };

  const parseAttrOptions = (type: ProjectAttributeType, raw: string) =>
    isOptionAttrType(type) ? raw.split(",").map(o => o.trim()).filter(Boolean) : undefined;

  const resetAttrForm = () => {
    setNewAttrName("");
    setNewAttrType("textfield");
    setNewAttrRequired(false);
    setNewAttrOptions("");
    setEditingAttrId(null);
  };

  const resetTeAttrForm = () => {
    setNewTeAttrName("");
    setNewTeAttrType("textfield");
    setNewTeAttrRequired(false);
    setNewTeAttrOptions("");
    setEditingTeAttrId(null);
  };

  const warnAttrTypeChange = (from: ProjectAttributeType, to: ProjectAttributeType, persisted: boolean) => {
    if (from === to || !persisted) return true;
    return window.confirm(t(
      "WARNING: Changing this attribute's type can lead to data loss on existing projects. Do you want to proceed?",
      "VAROVANIE: Zmena typu tohto atribútu môže viesť k strate údajov v existujúcich projektoch. Chcete pokračovať?",
      "FIGYELMEZTETÉS: Az attribútum típusának megváltoztatása adatvesztéshez vezethet a meglévő projekteknél. Folytatja?"
    ));
  };

  const handleStartEditAttribute = (attr: ProjectAttribute) => {
    setEditingAttrId(attr.id);
    setNewAttrName(attr.name);
    setNewAttrType(attr.type);
    setNewAttrRequired(!!attr.required);
    setNewAttrOptions((attr.options || []).join(", "));
  };

  const handleAttrFormTypeChange = (next: ProjectAttributeType) => {
    const persisted = !!editingAttrId && !!editingType?.attributes?.some(a => a.id === editingAttrId);
    if (!warnAttrTypeChange(newAttrType, next, persisted)) return;
    setNewAttrType(next);
  };

  const handleSaveAttribute = () => {
    if (!newAttrName.trim()) return;
    const name = newAttrName.trim();
    const options = parseAttrOptions(newAttrType, newAttrOptions);
    if (editingAttrId) {
      setAttributes(prev => prev.map(a => a.id === editingAttrId
        ? { ...a, name, type: newAttrType, required: newAttrRequired, options }
        : a));
      resetAttrForm();
      return;
    }
    const newAttr: ProjectAttribute = {
      id: "attr_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name,
      type: newAttrType,
      required: newAttrRequired,
      options
    };
    setAttributes(prev => [...prev, newAttr]);
    resetAttrForm();
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
    if (editingAttrId === attrId) resetAttrForm();
    setAttributes(prev => prev.filter(a => a.id !== attrId));
  };

  const handleAddFileField = () => {
    const name = newFileFieldName.trim();
    if (!name) return;
    if (fileFields.some(f => f.name.toLowerCase() === name.toLowerCase())) return;
    // The prefix keeps a slot's data column from ever colliding with an attribute's.
    const id = "file_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    setFileFields(prev => [...prev, { id, name }]);
    setNewFileFieldName("");
  };

  const handleRemoveFileField = (fieldId: string) => {
    // A slot that was already saved has uploads behind it; one added in this
    // session has nothing to lose.
    if (editingType?.fileFields?.some(f => f.id === fieldId)) {
      const confirmMsg = t(
        "WARNING: Removing this file field will permanently delete the files attached to it in existing projects. Do you want to proceed?",
        "VAROVANIE: Odstránenie tohto poľa trvalo vymaže súbory, ktoré sú k nemu priložené v existujúcich projektoch. Chcete pokračovať?",
        "FIGYELMEZTETÉS: Ezen fájlmező törlése véglegesen törli a meglévő projektekben hozzá csatolt fájlokat. Folytatja?"
      );
      if (!window.confirm(confirmMsg)) return;
    }
    setFileFields(prev => prev.filter(f => f.id !== fieldId));
  };

  /* Drag-and-drop reordering of the custom attributes. The dragged row is held
     by id, and the drop marker by the row it points at plus which edge of it,
     so the blue line sits exactly where the attribute will land. */
  const [draggedAttrId, setDraggedAttrId] = useState<string | null>(null);
  const [attrDropTarget, setAttrDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

  const endAttrDrag = () => {
    setDraggedAttrId(null);
    setAttrDropTarget(null);
  };

  const handleAttrDragStart = (e: React.DragEvent<HTMLElement>, id: string) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDraggedAttrId(id);
  };

  const handleAttrDragOver = (e: React.DragEvent<HTMLElement>, targetId: string) => {
    if (!draggedAttrId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const position: "before" | "after" =
      rect.height && e.clientY - rect.top > rect.height / 2 ? "after" : "before";
    if (attrDropTarget?.id !== targetId || attrDropTarget?.position !== position) {
      setAttrDropTarget({ id: targetId, position });
    }
  };

  const handleAttrDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const dragId = draggedAttrId;
    const drop = attrDropTarget;
    endAttrDrag();
    if (!canEdit || !dragId || !drop) return;
    setAttributes(prev => {
      const from = prev.findIndex(a => a.id === dragId);
      const onto = prev.findIndex(a => a.id === drop.id);
      if (from === -1 || onto === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      // The target index shifts by one once the dragged row is lifted out from above it.
      const base = onto > from ? onto - 1 : onto;
      next.splice(drop.position === "after" ? base + 1 : base, 0, moved);
      return next;
    });
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

  const handleStartEditTimelineAttribute = (attr: ProjectAttribute) => {
    setEditingTeAttrId(attr.id);
    setNewTeAttrName(attr.name);
    setNewTeAttrType(attr.type);
    setNewTeAttrRequired(!!attr.required);
    setNewTeAttrOptions((attr.options || []).join(", "));
  };

  const handleTeAttrFormTypeChange = (next: ProjectAttributeType) => {
    const persisted = !!editingTeAttrId && !!editingType?.timelineEventTypes?.some(et =>
      et.attributes.some(a => a.id === editingTeAttrId)
    );
    if (!warnAttrTypeChange(newTeAttrType, next, persisted)) return;
    setNewTeAttrType(next);
  };

  const handleSaveTimelineAttribute = () => {
    if (!selectedTeTypeId || !newTeAttrName.trim()) return;
    const name = newTeAttrName.trim();
    const options = parseAttrOptions(newTeAttrType, newTeAttrOptions);
    if (editingTeAttrId) {
      setTimelineEventTypes(prev => prev.map(t => {
        if (t.id !== selectedTeTypeId) return t;
        return {
          ...t,
          attributes: t.attributes.map(a => a.id === editingTeAttrId
            ? { ...a, name, type: newTeAttrType, required: newTeAttrRequired, options }
            : a)
        };
      }));
      resetTeAttrForm();
      return;
    }
    const newAttr: ProjectAttribute = {
      id: "tattr_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name,
      type: newTeAttrType,
      required: newTeAttrRequired,
      options
    };
    setTimelineEventTypes(prev => prev.map(t => {
      if (t.id === selectedTeTypeId) {
        return { ...t, attributes: [...t.attributes, newAttr] };
      }
      return t;
    }));
    resetTeAttrForm();
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
    if (editingTeAttrId === attrId) resetTeAttrForm();
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
      setEditSection("general");
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
      hasDeadline,
      // Only meaningful while deadlines are on. Storing 0 for a type with them
      // off keeps the saved shape identical whichever way the switch was flipped.
      deadlineWarningDays: hasDeadline ? normalizeDeadlineWarningDays(deadlineWarningDays) : 0,
      deadlineRequired: hasDeadline && deadlineRequired,
      // Default files have no on/off switch any more, and none is required.
      // hasFiles stays true so the server keeps treating the slots as live.
      hasFiles: true,
      fileFields: fileFields.map(({ id, name }) => ({ id, name })),
      attributes,
      timelineEventTypes
    };

    setProjectTypes(prev => {
      const exists = prev.some(t => t.id === typeId);
      if (exists) {
        // The list's column layout is edited from the projects table's View
        // menu, not here — carry whatever it holds now through the save.
        return prev.map(t => t.id === typeId ? { ...newType, listColumns: t.listColumns } : t);
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

  const confirmDeleteTypeMessage = () => t(
    "WARNING: Deleting this project type will drop its associated data tables and permanently delete all projects of this type. Are you sure you want to proceed?",
    "VAROVANIE: Vymazanie tohto typu projektu odstráni jeho pridružené dátové tabuľky a trvalo vymaže všetky projekty tohto typu. Naozaj chcete pokračovať?",
    "FIGYELMEZTETÉS: Ezen projekt típus törlése törli a hozzá tartozó adattáblákat és véglegesen törli az összes ilyen típusú projektet. Biztosan folytatja?"
  );

  const handleDeleteType = (typeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(confirmDeleteTypeMessage())) return;

    setProjectTypes(prev => prev.filter(t => t.id !== typeId));
    (window as any).showToast(t("Project type deleted.", "Projektový typ bol vymazaný.", "Projekt típus törölve."));
  };

  /** Delete straight from the editor, so removing a type doesn't need a trip
      back to the list. Only offered while editing an existing type — one
      being created has nothing saved yet to delete. */
  const handleDeleteEditingType = () => {
    if (!editingType) return;
    if (!window.confirm(confirmDeleteTypeMessage())) return;

    const typeId = editingType.id;
    setProjectTypes(prev => prev.filter(t => t.id !== typeId));
    setIsCreating(false);
    setEditingType(null);
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
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section tabs */}
        <div role="tablist" className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200 select-none w-fit max-w-full">
          {([
            { id: "general", Icon: SlidersHorizontal, label: t("General", "Všeobecné", "Általános"), count: null },
            { id: "timeline", Icon: History, label: t("Timeline", "Časová os", "Idővonal"), count: hasTimeline ? timelineEventTypes.length : null },
            { id: "attributes", Icon: ListChecks, label: t("Attributes", "Atribúty", "Attribútumok"), count: attributes.length + (hasDeadline ? 1 : 0) },
            { id: "files", Icon: Paperclip, label: t("Files", "Súbory", "Fájlok"), count: fileFields.length },
          ] as { id: EditSection; Icon: React.ComponentType<{ className?: string }>; label: string; count: number | null }[]).map(({ id, Icon, label, count }) => {
            const active = editSection === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setEditSection(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-150 active:scale-95 cursor-pointer ${
                  active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
                {count !== null && count > 0 && (
                  <span className={`min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] leading-none text-center transition-colors duration-150 ${
                    active ? "bg-indigo-50 text-indigo-600" : "bg-slate-200 text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {editSection === "general" && (
          <div className="space-y-4 max-w-2xl animate-fade-in">
            <div>
              <label className="block text-xs font-heading font-black text-slate-400 uppercase tracking-widest mb-1.5">
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
              <label className="block text-xs font-heading font-black text-slate-400 uppercase tracking-widest mb-1.5">
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
                <label className="block text-xs font-heading font-black text-slate-400 uppercase tracking-widest mb-1.5">
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
                <label className="block text-xs font-heading font-black text-slate-400 uppercase tracking-widest mb-1.5">
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
                  <ColorPicker variant="palette" value={typeColor} onChange={setTypeColor} disabled={!canEdit} className="h-8 w-8 p-1" />
                </div>
              </div>
            </div>

            {/* Optional Modules */}
            <div className="space-y-2 pt-2">
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
          </div>
        )}

        {editSection === "timeline" && (
          <div className="space-y-4 max-w-3xl animate-fade-in">
            <label className="flex items-start gap-3 cursor-pointer w-fit">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={hasTimeline}
                onChange={e => setHasTimeline(e.target.checked)}
                className="h-4.5 w-4.5 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">
                  {t("Allow timeline", "Povoliť časovú os", "Idővonal engedélyezése")}
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  {t(
                    "Projects of this type get a Timeline tab for logging events.",
                    "Projekty tohto typu dostanú kartu Časová os na zaznamenávanie udalostí.",
                    "Az ilyen típusú projektek Idővonal fület kapnak az események rögzítéséhez.",
                  )}
                </span>
              </span>
            </label>

            {/* The rest of the timeline settings stay in view while it is off —
                inactive, so what switching it on brings is never hidden. */}
            <fieldset
              disabled={!hasTimeline}
              aria-disabled={!hasTimeline}
              className={`min-w-0 transition-opacity duration-150 ${hasTimeline ? "" : "opacity-50 pointer-events-none select-none"}`}
            >
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <label className="block text-xs font-heading font-black text-slate-400 uppercase tracking-widest">
                  {t("Timeline Event Types", "Typy udalostí časovej osi", "Idővonal eseménytípusok")}
                </label>

                {/* Input for Name, Color, and Icon picker */}
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-left">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                        {t("Event Type Name", "Názov typu udalosti", "Eseménytípus neve")}
                      </label>
                      <input
                        value={newTeTypeName}
                        onChange={e => setNewTeTypeName(e.target.value)}
                        placeholder={t("e.g. Measurement, Site Survey, Offer", "napr. Zameranie, Obhliadka, Ponuka", "pl. Felmérés, Helyszíni szemle, Ajánlat")}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                        {t("Icon", "Ikona", "Ikon")}
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsTeIconPickerOpen(!isTeIconPickerOpen)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            {renderIcon(newTeTypeIcon, "h-4 w-4 text-purple-600")}
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
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
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
                        <ColorPicker variant="palette" value={newTeTypeColor} onChange={setNewTeTypeColor} />
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
                          onClick={() => {
                            if (et.id !== selectedTeTypeId) resetTeAttrForm();
                            setSelectedTeTypeId(et.id);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                            isSelected
                              ? "border-purple-600 bg-purple-50 text-purple-700"
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

                {/* Attributes Schema Builder for the selected event type */}
                {timelineEventTypes.length > 0 && (
                  <div className="space-y-4 border-t border-slate-200 pt-4 mt-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm text-left">
                    {(() => {
                      const selectedTeType = timelineEventTypes.find(t => t.id === selectedTeTypeId);
                      if (!selectedTeType) return null;

                      return (
                        <div className="space-y-4 animate-fade-in text-left">
                          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                            <div className="min-w-0">
                              <div className="font-heading font-black text-[10px] text-slate-400 uppercase tracking-widest">
                                {t("Attributes for event type", "Atribúty typu udalosti", "Eseménytípus attribútumai")}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                <span
                                  className="flex items-center justify-center h-6 w-6 rounded-lg shrink-0"
                                  style={{ backgroundColor: `${selectedTeType.color}1a`, color: selectedTeType.color }}
                                >
                                  {renderIcon(selectedTeType.icon, "h-3.5 w-3.5")}
                                </span>
                                <span className="font-heading font-bold text-sm text-slate-800 truncate">
                                  {selectedTeType.name}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                              {selectedTeType.attributes.length} {t("attributes", "atribútov", "attribútum")}
                            </span>
                          </div>
                          {/* Existing timeline attributes list */}
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                            {selectedTeType.attributes.length === 0 ? (
                              <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                                {t("No custom attributes defined for this event type.", "Pre tento typ udalosti nie sú definované žiadne vlastné atribúty.", "Nincsenek egyedi attribútumok definiálva ehhez az eseménytípushoz.")}
                              </div>
                            ) : (
                              selectedTeType.attributes.map((attr: ProjectAttribute, idx: number) => (
                                <div
                                  key={attr.id}
                                  className={cn(
                                    "flex items-center justify-between p-3 bg-white border rounded-2xl shadow-sm text-xs font-semibold transition-colors duration-150",
                                    editingTeAttrId === attr.id ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200"
                                  )}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-slate-800 text-[13px]">{attr.name}</span>
                                    <span className="text-slate-400 font-medium">
                                      {attributeTypeLabel(attr.type)} 
                                      {attr.required && t(" • Required", " • Povinné", " • Kötelező")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={!canEdit || idx === 0}
                                      onClick={() => handleMoveTimelineAttribute(idx, "up")}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                                    >
                                      <ArrowUp className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEdit || idx === selectedTeType.attributes.length - 1}
                                      onClick={() => handleMoveTimelineAttribute(idx, "down")}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                                    >
                                      <ArrowDown className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEdit}
                                      aria-label={t("Edit attribute", "Upraviť atribút", "Attribútum szerkesztése")}
                                      onClick={() => handleStartEditTimelineAttribute(attr)}
                                      className="p-1 hover:bg-indigo-50 rounded text-indigo-600 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                                    >
                                      <Pencil className="h-4.5 w-4.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!canEdit}
                                      onClick={() => handleRemoveTimelineAttribute(attr.id)}
                                      className="p-1 hover:bg-rose-50 rounded text-rose-600 transition-colors duration-150 active:scale-95"
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
                            <div className={cn(
                              "p-4 rounded-2xl space-y-3 border transition-colors duration-150",
                              editingTeAttrId ? "bg-indigo-50/60 border-indigo-200" : "bg-slate-50 border-slate-200"
                            )}>
                              {editingTeAttrId && (
                                <div className="text-[10px] font-heading font-black text-indigo-500 uppercase tracking-widest">
                                  {t("Edit attribute", "Upraviť atribút", "Attribútum szerkesztése")}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                                    {t("Attribute Label", "Názov atribútu", "Attribútum neve")}
                                  </label>
                                  <input
                                    value={newTeAttrName}
                                    onChange={e => setNewTeAttrName(e.target.value)}
                                    placeholder={t("e.g. Photograph, Site Report", "napr. Fotografia, Správa z obhliadky", "pl. Fénykép, Helyszíni jelentés")}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                                    {t("Type", "Typ", "Típus")}
                                  </label>
                                  <CustomSelect
                                    value={newTeAttrType}
                                    onChange={(v) => handleTeAttrFormTypeChange(v as ProjectAttributeType)}
                                    options={ATTRIBUTE_TYPES.map(at => ({ value: at.id, label: attributeTypeLabel(at.id) }))}
                                  />
                                </div>
                              </div>

                              {isOptionAttrType(newTeAttrType) && (
                                <div>
                                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                                    {t("Options (comma separated)", "Možnosti (oddelené čiarkou)", "Opciók (vesszővel elválasztva)")}
                                  </label>
                                  <input
                                    value={newTeAttrOptions}
                                    onChange={e => setNewTeAttrOptions(e.target.value)}
                                    placeholder={t("Option 1, Option 2, Option 3", "Možnosť 1, Možnosť 2, Možnosť 3", "1. lehetőség, 2. lehetőség, 3. lehetőség")}
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
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                  />
                                  <span className="text-xs font-semibold text-slate-600">{t("Required field", "Povinné pole", "Kötelező mező")}</span>
                                </label>

                                <div className="flex items-center gap-1.5">
                                  {editingTeAttrId && (
                                    <button
                                      type="button"
                                      onClick={resetTeAttrForm}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all duration-150 active:scale-95 cursor-pointer"
                                    >
                                      <X className="h-4 w-4" />
                                      <span>{t("Cancel", "Zrušiť", "Mégse")}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={handleSaveTimelineAttribute}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all duration-150 active:scale-95 cursor-pointer"
                                  >
                                    {editingTeAttrId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    <span>
                                      {editingTeAttrId
                                        ? t("Save changes", "Uložiť zmeny", "Változtatások mentése")
                                        : t("Add Attribute", "Pridať atribút", "Attribútum hozzáadása")}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        )}

        {/* Attributes Schema Builder */}
        {editSection === "attributes" && (
          <div className="space-y-4 max-w-3xl animate-fade-in">

            {/* Built-in attributes. Every type has them; each is switched on or
                off rather than added, and brings its own settings when on. */}
            <div className="space-y-2">
              {/* Deadline */}
              <div className={`bg-white border rounded-2xl shadow-sm transition-colors duration-150 ${hasDeadline ? "border-indigo-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-3 p-3 text-xs font-semibold">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex items-center justify-center h-8 w-8 rounded-xl shrink-0 transition-colors duration-150 ${hasDeadline ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-slate-800 text-[13px]">{t("Deadline", "Termín dokončenia", "Határidő")}</span>
                      <span className="text-slate-400 font-medium truncate">
                        {t("Due date and countdown", "Dátum dokončenia a odpočet", "Esedékesség és visszaszámlálás")}
                        {hasDeadline && deadlineRequired && t(" • Required", " • Povinné", " • Kötelező")}
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={hasDeadline}
                    onChange={setHasDeadline}
                    disabled={!canEdit}
                    label={t("Deadline", "Termín dokončenia", "Határidő")}
                  />
                </div>

                {hasDeadline && (
                  <div className="border-t border-slate-100 p-3 space-y-3 animate-fade-in">
                    <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={deadlineRequired}
                        onChange={e => setDeadlineRequired(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span className="text-xs font-semibold text-slate-600">{t("Required field", "Povinné pole", "Kötelező mező")}</span>
                    </label>

                    {/* How early the countdown starts warning. Off by default is not an
                        option here — a deadline nobody is reminded of is just a date. */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                        {t("Warn this many days ahead", "Upozorniť toľkoto dní vopred", "Ennyi nappal előbb figyelmeztessen")}
                      </label>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="number"
                          min={0}
                          max={365}
                          disabled={!canEdit}
                          value={deadlineWarningDays}
                          onChange={e => setDeadlineWarningDays(normalizeDeadlineWarningDays(e.target.value))}
                          className="w-20 shrink-0 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                        <span className="text-[11px] font-medium text-slate-400 leading-snug">
                          {deadlineWarningDays > 0
                            ? t(
                                `Projects turn amber ${deadlineWarningDays} days before they are due, and red once late.`,
                                `Projekty zožltnú ${deadlineWarningDays} dní pred termínom a sčervenajú po ňom.`,
                                `A projektek ${deadlineWarningDays} nappal a határidő előtt sárgák, utána pirosak lesznek.`,
                              )
                            : t(
                                "No early warning — projects are only flagged once they are late.",
                                "Bez včasného upozornenia — projekty sa označia až po termíne.",
                                "Nincs korai figyelmeztetés — a projektek csak lejárat után lesznek megjelölve.",
                              )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <div className="flex items-center gap-3 pt-2">
              <span className="text-[10px] font-heading font-black text-slate-400 uppercase tracking-widest shrink-0">
                {t("Custom attributes", "Vlastné atribúty", "Egyedi attribútumok")}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Existing attributes list */}
            <div className="space-y-2">
              {attributes.length === 0 ? (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                  {t("No attributes added yet. Use the form below to add attributes.", "Zatiaľ neboli pridané žiadne atribúty.", "Még nincsenek attribútumok hozzáadva.")}
                </div>
              ) : (
                attributes.map((attr, idx) => {
                  const drop = draggedAttrId && attrDropTarget?.id === attr.id ? attrDropTarget.position : null;
                  const isEditing = editingAttrId === attr.id;
                  return (
                  <div
                    key={attr.id}
                    draggable={canEdit && !isEditing}
                    onDragStart={e => handleAttrDragStart(e, attr.id)}
                    onDragEnd={endAttrDrag}
                    onDragOver={e => handleAttrDragOver(e, attr.id)}
                    onDrop={handleAttrDrop}
                    title={canEdit && !isEditing ? t("Drag to reorder", "Potiahnutím zmeníte poradie", "Húzza az átrendezéshez") : undefined}
                    className={cn(
                      "group relative flex items-center justify-between p-3 bg-white border rounded-2xl shadow-sm text-xs font-semibold transition-[opacity,box-shadow,border-color] duration-150",
                      isEditing ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200",
                      canEdit && !isEditing && "cursor-grab active:cursor-grabbing",
                      draggedAttrId === attr.id && "opacity-40"
                    )}
                  >
                    {drop === "before" && (
                      <span className="pointer-events-none absolute inset-x-2 -top-1 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
                    )}
                    {drop === "after" && (
                      <span className="pointer-events-none absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-indigo-500 animate-in fade-in duration-150" />
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      {canEdit && (
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500 transition-colors duration-150" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-slate-800 text-[13px]">{attr.name}</span>
                        <span className="text-slate-400 font-medium">
                          {attributeTypeLabel(attr.type)} 
                          {attr.required && t(" • Required", " • Povinné", " • Kötelező")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!canEdit || idx === 0}
                        onClick={() => handleMoveAttribute(idx, "up")}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                      >
                        <ArrowUp className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || idx === attributes.length - 1}
                        onClick={() => handleMoveAttribute(idx, "down")}
                        className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                      >
                        <ArrowDown className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-label={t("Edit attribute", "Upraviť atribút", "Attribútum szerkesztése")}
                        onClick={() => handleStartEditAttribute(attr)}
                        className="p-1 hover:bg-indigo-50 rounded text-indigo-600 disabled:opacity-30 transition-colors duration-150 active:scale-95"
                      >
                        <Pencil className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleRemoveAttribute(attr.id)}
                        className="p-1 hover:bg-rose-50 rounded text-rose-600 transition-colors duration-150 active:scale-95"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {/* Add new attribute form */}
            {canEdit && (
              <div className={cn(
                "p-4 rounded-2xl space-y-3 border transition-colors duration-150",
                editingAttrId ? "bg-indigo-50/60 border-indigo-200" : "bg-slate-50 border-slate-200"
              )}>
                {editingAttrId && (
                  <div className="text-[10px] font-heading font-black text-indigo-500 uppercase tracking-widest">
                    {t("Edit attribute", "Upraviť atribút", "Attribútum szerkesztése")}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                      {t("Attribute Label", "Názov atribútu", "Attribútum neve")}
                    </label>
                    <input
                      value={newAttrName}
                      onChange={e => setNewAttrName(e.target.value)}
                      placeholder={t("e.g. Dimensions", "napr. Rozmery", "pl. Méretek")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                      {t("Type", "Typ", "Típus")}
                    </label>
                    <CustomSelect
                      value={newAttrType}
                      onChange={(v) => handleAttrFormTypeChange(v as ProjectAttributeType)}
                      options={ATTRIBUTE_TYPES.map(at => ({ value: at.id, label: attributeTypeLabel(at.id) }))}
                    />
                  </div>
                </div>

                {isOptionAttrType(newAttrType) && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                      {t("Options (comma separated)", "Možnosti (oddelené čiarkou)", "Opciók (vesszővel elválasztva)")}
                    </label>
                    <input
                      value={newAttrOptions}
                      onChange={e => setNewAttrOptions(e.target.value)}
                      placeholder={t("Option 1, Option 2, Option 3", "Možnosť 1, Možnosť 2, Možnosť 3", "1. lehetőség, 2. lehetőség, 3. lehetőség")}
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
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-600">{t("Required field", "Povinné pole", "Kötelező mező")}</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {editingAttrId && (
                      <button
                        type="button"
                        onClick={resetAttrForm}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all duration-150 active:scale-95 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                        <span>{t("Cancel", "Zrušiť", "Mégse")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveAttribute}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all duration-150 active:scale-95 cursor-pointer"
                    >
                      {editingAttrId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      <span>
                        {editingAttrId
                          ? t("Save changes", "Uložiť zmeny", "Változtatások mentése")
                          : t("Add Attribute", "Pridať atribút", "Attribútum hozzáadása")}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Default files — the slots every project of this type starts with */}
        {editSection === "files" && (
          <div className="space-y-4 max-w-3xl animate-fade-in">
            <div className="flex flex-col">
              <h4 className="font-heading font-bold text-sm text-slate-700">
                {t("Default files", "Predvolené súbory", "Alapértelmezett fájlok")}
              </h4>
              <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                {t(
                  "Every project of this type starts with these file slots, all optional. A project can add its own on its Files tab.",
                  "Každý projekt tohto typu začína s týmito súbormi, všetky sú nepovinné. Projekt si môže pridať vlastné na karte Súbory.",
                  "Minden ilyen típusú projekt ezekkel a fájlhelyekkel indul, mind opcionális. Egy projekt a Fájlok fülön sajátokat is hozzáadhat.",
                )}
              </p>
            </div>

            <div className="space-y-2">
              {fileFields.length === 0 ? (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                  {t("No default files yet — add one below.", "Zatiaľ žiadne predvolené súbory — pridajte ich nižšie.", "Még nincsenek alapértelmezett fájlok — adjon hozzá lent.")}
                </div>
              ) : (
                fileFields.map(field => (
                  <div key={field.id} className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm text-xs font-semibold animate-fade-in">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="flex-1 min-w-0 truncate text-slate-800 text-[13px]">{field.name}</span>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleRemoveFileField(field.id)}
                      className="p-1 hover:bg-rose-50 rounded text-rose-600 shrink-0 transition-colors duration-150 active:scale-95 cursor-pointer disabled:opacity-30"
                      title={t("Remove", "Odobrať", "Eltávolítás")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <input
                  value={newFileFieldName}
                  onChange={e => setNewFileFieldName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddFileField();
                    }
                  }}
                  placeholder={t("e.g. Contract, GDPR consent", "napr. Zmluva, Súhlas GDPR", "pl. Szerződés, GDPR hozzájárulás")}
                  className="flex-1 min-w-[8rem] px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddFileField}
                  disabled={!newFileFieldName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t("Add file", "Pridať súbor", "Fájl hozzáadása")}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        {canEdit && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            {editingType ? (
              <button
                type="button"
                onClick={handleDeleteEditingType}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-rose-200 text-xs font-black uppercase text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t("Delete Project Type", "Vymazať typ projektu", "Projekt típus törlése")}</span>
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-0.5">
            {t("Configure dynamic templates and attributes schemas", "Konfigurácia šablón a atribútov pre projekty", "Sablonok és attribútum sémák beállítása")}
          </p>
        </div>

        {canEdit && (
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider hover:bg-indigo-700 shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>{t("New Project Type", "Nový typ", "Új típus")}</span>
          </button>
        )}
      </div>

      {/* ── DISPLAY ─────────────────────────────────────────────────────── */}
      <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-wrap items-center justify-between gap-3 text-left">
        <div className="flex flex-col">
          <span className="font-heading font-black text-slate-800 text-xs uppercase tracking-widest">
            {t("Default project view", "Predvolené zobrazenie projektov", "Alapértelmezett projekt nézet")}
          </span>
          <span className="text-[11px] font-semibold text-slate-400 mt-0.5">
            {t(
              "Which view the projects screen opens on. The switcher in the list changes it too.",
              "Zobrazenie, ktorým sa otvorí zoznam projektov. Prepínač v zozname ho tiež mení.",
              "Melyik nézettel nyílik meg a projektek képernyő. A listában lévő kapcsoló is módosítja.",
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 select-none shrink-0">
          {([
            { mode: "list" as const, Icon: Rows3, label: t("List", "Zoznam", "Lista") },
            { mode: "grid" as const, Icon: LayoutGrid, label: t("Cards", "Karty", "Kártyák") },
          ]).map(({ mode, Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setProjectsViewMode(mode)}
              aria-pressed={projectsViewMode === mode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                projectsViewMode === mode
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </div>
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
                    {type.hasDeadline && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-[10px] font-bold text-amber-600 border border-amber-100">
                        {t("Deadline", "Termín", "Határidő")}
                      </span>
                    )}
                    {(type.fileFields?.length || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 border border-emerald-100">
                        {t("Files", "Súbory", "Fájlok")}
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

      {/* ── AUTOMATIC CREATION FROM LEADS ──────────────────────────────────
          Every lead that arrives gets a project already paired with it — one
          per interest category that names a type, or a single project of the
          fallback type. The creation happens server-side, so it covers leads
          that never pass through this app — the public web-form webhook and
          workflow actions — and two devices syncing the same new lead cannot
          each produce their own project for it.

          PROJECT-AUTO-CREATE-DISABLED (v1.9.29): hidden, because the server no
          longer creates projects from leads. Flip the constant at the top of
          this file (and restore the server calls) to bring it back. */}
      {PROJECT_AUTO_CREATE_ENABLED && setProjectAutoCreate && (() => {
        const active = isProjectAutoCreateActive(projectAutoCreate, projectTypes);
        const chosenType = projectTypes.find(pt => pt.id === projectAutoCreate.projectTypeId);
        const canToggle = canEdit && projectTypes.length > 0;
        const update = (patch: Partial<ProjectAutoCreateSettings>) =>
          setProjectAutoCreate(prev => ({ ...prev, ...patch }));
        const NO_TYPE_LABEL = t("No project", "Žiadny projekt", "Nincs projekt");

        /** The map with one category pointed at a type, or cleared of it. */
        const setCategoryType = (map: Record<string, string>, category: string, typeId: string) => {
          const next = { ...map };
          if (typeId) next[category] = typeId;
          else delete next[category];
          return next;
        };

        // Only the rules that will actually fire: a type deleted after it was
        // chosen must not be read out as if it still creates something.
        const mappedRules = leadCategories
          .map((category) => ({
            category,
            type: projectTypes.find(pt => pt.id === projectAutoCreate.categoryTypes[category])?.name,
          }))
          .filter((r): r is { category: string; type: string } => !!r.type);

        return (
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left space-y-5">
            <div className="space-y-1">
              <h3 className="font-heading font-black text-slate-800 text-[15px] uppercase tracking-widest flex items-center gap-2">
                <Workflow className="h-4.5 w-4.5 text-indigo-500" />
                {t("Automatic project creation", "Automatické vytváranie projektov", "Automatikus projektlétrehozás")}
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 leading-relaxed max-w-3xl">
                {t(
                  "Every new lead is paired with a project — leads from the web form, from automations, from imports, and leads added by hand. Each interest category can name its own project type, so a lead ticking two of them gets one project of each. A lead whose interests match no rule falls back to the type below.",
                  "Každý nový lead sa spáruje s projektom — leady z webového formulára, z automatizácií, z importov aj leady pridané ručne. Každá kategória záujmu môže mať vlastný typ projektu, takže lead s dvoma kategóriami dostane projekt z každej. Lead, ktorého záujmy nezodpovedajú žiadnemu pravidlu, dostane záložný typ nižšie.",
                  "Minden új lead projekttel lesz párosítva — a webűrlapról, automatizációkból és importokból érkező, valamint a kézzel hozzáadott leadek. Minden érdeklődési kategóriának saját projekt típusa lehet, így a két kategóriát megjelölő lead mindegyikből kap egyet. Az egyik szabályra sem illeszkedő lead az alábbi tartalék típust kapja.",
                )}
              </p>
            </div>

            {projectTypes.length === 0 ? (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                {t(
                  "Create a project type first — there is nothing to create projects from yet.",
                  "Najprv vytvorte typ projektu — zatiaľ nie je z čoho projekty vytvárať.",
                  "Előbb hozzon létre egy projekt típust — jelenleg nincs miből projektet létrehozni.",
                )}
              </p>
            ) : (
              <>
                {/* On/off */}
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
                  <button
                    type="button"
                    disabled={!canToggle}
                    onClick={() => update({ enabled: !projectAutoCreate.enabled })}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5 ${
                      projectAutoCreate.enabled ? "bg-indigo-600" : "bg-slate-300"
                    } ${canToggle ? "cursor-pointer hover:opacity-90" : "opacity-50 cursor-not-allowed"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      projectAutoCreate.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </button>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-700">
                      {t("Create a project for every new lead", "Vytvoriť projekt pre každý nový lead", "Projekt létrehozása minden új leadhez")}
                    </span>
                    <span className="block text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                      {t(
                        "Off by default. Existing leads are left alone — this only applies to leads that arrive from now on.",
                        "Predvolene vypnuté. Existujúcich leadov sa to netýka — platí len pre leady, ktoré prídu odteraz.",
                        "Alapértelmezés szerint kikapcsolva. A meglévő leadeket nem érinti — csak a mostantól érkező leadekre vonatkozik.",
                      )}
                    </span>
                  </div>
                </div>

                {projectAutoCreate.enabled && (
                  <>
                    {/* One rule per interest category. The map is keyed by the
                        category name, which is what a lead stores; SettingsView
                        carries the entry across a rename and drops it on a
                        delete, exactly as it does for the colour map. */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        {t("Project type per interest category", "Typ projektu podľa kategórie záujmu", "Projekt típus érdeklődési kategóriánként")}
                      </label>
                      {leadCategories.length === 0 ? (
                        <p className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                          {t(
                            "No interest categories are configured — add them in Settings to give each its own project type.",
                            "Nie sú nastavené žiadne kategórie záujmu — pridajte ich v Nastaveniach, aby mohla každá dostať vlastný typ projektu.",
                            "Nincsenek beállított érdeklődési kategóriák — adja hozzá őket a Beállításokban, hogy mindegyik saját projekt típust kaphasson.",
                          )}
                        </p>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
                          {leadCategories.map((cat) => (
                            <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-[11px] font-black text-slate-700 truncate flex-1 min-w-0" title={cat}>
                                {cat}
                              </span>
                              <div className="w-full max-w-[16rem] shrink-0">
                                <CustomSelect
                                  size="sm"
                                  disabled={!canEdit}
                                  value={projectAutoCreate.categoryTypes[cat] || ""}
                                  onChange={(v) => update({ categoryTypes: setCategoryType(projectAutoCreate.categoryTypes, cat, v) })}
                                  placeholder={NO_TYPE_LABEL}
                                  options={[
                                    { value: "", label: NO_TYPE_LABEL },
                                    ...projectTypes.map(pt => ({ value: pt.id, label: pt.name })),
                                  ]}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Everything the rules above did not catch */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        {t("Type for leads no rule matched", "Typ pre leady bez zhody", "Típus a szabályt nem találó leadekhez")}
                      </label>
                      <CustomSelect
                        disabled={!canEdit}
                        value={projectAutoCreate.projectTypeId}
                        onChange={(v) => update({ projectTypeId: v })}
                        placeholder={NO_TYPE_LABEL}
                        options={[
                          { value: "", label: NO_TYPE_LABEL },
                          ...projectTypes.map(pt => ({ value: pt.id, label: pt.name })),
                        ]}
                      />
                      <p className="text-[10px] font-semibold text-slate-400 mt-1.5 leading-snug">
                        {t(
                          "Used for a lead that carries no interest category, or none that names a type above.",
                          "Použije sa pre lead bez kategórie záujmu, alebo keď žiadna z jeho kategórií nemá vyššie určený typ.",
                          "Az érdeklődési kategória nélküli leadhez használja, vagy ha egyik kategóriája sem nevez meg fenti típust.",
                        )}
                      </p>
                    </div>

                    {/* Manager */}
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => update({ assignOwner: !projectAutoCreate.assignOwner })}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5 ${
                          projectAutoCreate.assignOwner ? "bg-indigo-600" : "bg-slate-300"
                        } ${canEdit ? "cursor-pointer hover:opacity-90" : "opacity-50 cursor-not-allowed"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          projectAutoCreate.assignOwner ? "translate-x-4" : "translate-x-0.5"
                        }`} />
                      </button>
                      <div className="min-w-0">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-slate-700">
                          {t("Hand the project to the lead's manager", "Prideliť projekt manažérovi leadu", "A projekt a lead menedzseréhez kerül")}
                        </span>
                        <span className="block text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                          {t(
                            "The lead's project manager becomes the project's manager too. Leave it off to create projects nobody is on yet.",
                            "Projektový manažér leadu sa stane aj manažérom projektu. Vypnite, ak majú projekty vznikať bez priradenej osoby.",
                            "A lead projektmenedzsere a projekt menedzsere is lesz. Kapcsolja ki, ha a projektek felelős nélkül jöjjenek létre.",
                          )}
                        </span>
                      </div>
                    </div>

                    {/* What the rules actually add up to. A type deleted after it
                        was chosen leaves this looking configured while the server
                        creates nothing. */}
                    {active ? (
                      <div className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3 space-y-1">
                        <span className="block text-slate-400 uppercase tracking-wider font-black">
                          {t("Result", "Výsledok", "Eredmény")}:
                        </span>
                        {mappedRules.map(({ category, type }) => (
                          <span key={category} className="block">
                            {t(
                              `A lead interested in "${category}" gets a "${type}" project.`,
                              `Lead so záujmom „${category}“ dostane projekt typu „${type}“.`,
                              `A „${category}” iránt érdeklődő lead „${type}” projektet kap.`,
                            )}
                          </span>
                        ))}
                        {mappedRules.length > 0 && (
                          <span className="block text-slate-400">
                            {t(
                              "A lead in several of them gets one project of each.",
                              "Lead s viacerými z nich dostane projekt z každej.",
                              "A több ilyen kategóriával rendelkező lead mindegyikből kap egyet.",
                            )}
                          </span>
                        )}
                        <span className="block">
                          {chosenType
                            ? t(
                                `Every other lead gets a "${chosenType.name}" project.`,
                                `Každý ostatný lead dostane projekt typu „${chosenType.name}“.`,
                                `Minden más lead „${chosenType.name}” projektet kap.`,
                              )
                            : t(
                                "A lead matching none of these rules gets no project.",
                                "Lead, ktorý nezodpovedá žiadnemu pravidlu, projekt nedostane.",
                                "Az egyik szabályra sem illeszkedő lead nem kap projektet.",
                              )}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                        {projectAutoCreate.projectTypeId || Object.keys(projectAutoCreate.categoryTypes).length > 0
                          ? t(
                              "The chosen project types no longer exist — pick others, or no projects will be created.",
                              "Zvolené typy projektov už neexistujú — vyberte iné, inak sa žiadne projekty nevytvoria.",
                              "A kiválasztott projekt típusok már nem léteznek — válasszon másikat, különben nem jön létre projekt.",
                            )
                          : t(
                              "No project type chosen yet — no projects will be created.",
                              "Zatiaľ nie je vybraný typ projektu — žiadne projekty sa nevytvoria.",
                              "Még nincs kiválasztva projekt típus — nem jön létre projekt.",
                            )}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};
