import React, { useState, useEffect } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, Upload, FileText, ArrowLeft, Mail, Phone } from "lucide-react";
import type { Project, ProjectType, Lead, UserProfile, ProjectTimelineEvent, ProjectGanttRow } from "../types";
import type { Language } from "../utils/translations";
import { nowLocalStamp } from "../utils/localTime";

const SearchableClientSelect: React.FC<{
  leads: Lead[];
  value: string;
  onChange: (id: string) => void;
  userLanguage: Language;
}> = ({ leads, value, onChange, userLanguage }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  
  const noneLabel = userLanguage === "sk" ? "Žiadny klient" : userLanguage === "hu" ? "Nincs ügyfél" : "No associated client";
  const searchLabel = userLanguage === "sk" ? "Hľadať..." : userLanguage === "hu" ? "Keresés..." : "Search...";
  const selectLabel = userLanguage === "sk" ? "Vybrať klienta..." : userLanguage === "hu" ? "Ügyfél választása..." : "Select Client...";
  const emptyLabel = userLanguage === "sk" ? "Žiadne výsledky" : userLanguage === "hu" ? "Nincs találat" : "No matches";

  const filtered = query.trim()
    ? leads.filter((l) => `${l.name} ${l.city || ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : leads;
  const selected = leads.find((l) => l.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative font-sans" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none flex items-center justify-between gap-2 cursor-pointer text-left"
      >
        <span className={selected ? "truncate" : "truncate text-slate-400 font-normal"}>
          {selected ? `${selected.name} (${selected.city || "N/A"})` : selectLabel}
        </span>
        <Icons.ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-64 overflow-y-auto z-[999] animate-in fade-in zoom-in-95 duration-150 scrollbar-thin">
          <div className="p-2 sticky top-0 bg-white border-b border-slate-100 z-10">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchLabel}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:border-indigo-400"
            />
          </div>
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
            className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 cursor-pointer"
          >
            {noneLabel}
          </button>
          {filtered.length === 0 ? (
            <div className="px-4 py-2.5 text-xs text-slate-400 text-center font-medium">{emptyLabel}</div>
          ) : (
            filtered.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => { onChange(l.id); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50/50 cursor-pointer ${l.id === value ? "bg-indigo-50/50 font-bold text-indigo-700" : "text-slate-700"}`}
              >
                {l.name} ({l.city || "N/A"})
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

interface ProjectDetailsViewProps {
  project: Project | null;
  projectType: ProjectType | null;
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

export const ProjectDetailsView: React.FC<ProjectDetailsViewProps> = ({
  project,
  projectType,
  leads,
  users,
  userLanguage,
  onClose,
  onSave
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  // Global state wiring
  const [status, setStatus] = useState("active");
  const [associatedLeadId, setAssociatedLeadId] = useState("");
  const [associatedClientId, setAssociatedClientId] = useState("");
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [dynamicData, setDynamicData] = useState<Record<string, any>>({});
  const [timeline, setTimeline] = useState<ProjectTimelineEvent[]>([]);
  const [gantt, setGantt] = useState<ProjectGanttRow[]>([]);

  // Right Side tab control
  const [activeRightTab, setActiveRightTab] = useState<"timeline" | "gantt">("timeline");

  // Timeline Event Form
  const [newTeTitle, setNewTeTitle] = useState("");
  const [newTeType, setNewTeType] = useState("note");
  const [newTeContent, setNewTeContent] = useState("");
  const [newTeTime, setNewTeTime] = useState("");
  const [timelineEventData, setTimelineEventData] = useState<Record<string, any>>({});

  // Gantt Row Form
  const [newGeTitle, setNewGeTitle] = useState("");
  const [newGeContactId, setNewGeContactId] = useState("");
  const [newGeStart, setNewGeStart] = useState("");
  const [newGeEnd, setNewGeEnd] = useState("");
  const [columnWidth, setColumnWidth] = useState(60);
  const [selectedGanttEdit, setSelectedGanttEdit] = useState<ProjectGanttRow | null>(null);

  // File Upload states
  const [isUploading, setIsUploading] = useState<string | null>(null); // tracks active attribute.id uploading

  useEffect(() => {
    if (projectType?.timelineEventTypes && projectType.timelineEventTypes.length > 0) {
      setNewTeType(projectType.timelineEventTypes[0].id);
    } else {
      setNewTeType("note");
    }
  }, [projectType]);

  useEffect(() => {
    if (project) {
      setStatus(project.status || "active");
      setAssociatedLeadId(project.leadId || "");
      setAssociatedClientId(project.clientId || "");
      setSelectedManagers(project.managers || []);
      setDynamicData(project.data || {});
      setTimeline(project.timeline || []);
      setGantt(project.gantt || []);

      // Resolve default right tab
      if (projectType) {
        if (projectType.hasTimeline) setActiveRightTab("timeline");
        else if (projectType.hasGantt) setActiveRightTab("gantt");
      }
    }
  }, [project, projectType]);

  if (!project || !projectType) return null;

  const handleFileUpload = async (attrId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(attrId);
    const eventId = `proj-${project.id}-${attrId}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);

    try {
      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });
      const resData = await res.json();
      if (resData.success) {
        const sizeStr = file.size > 1024 * 1024 
          ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
          : (file.size / 1024).toFixed(0) + " KB";
          
        const uploadedFile = {
          name: resData.fileName || file.name,
          size: sizeStr,
          path: `/uploads/${eventId}_${resData.fileName || file.name}`
        };

        const currentFiles = dynamicData[attrId] ? (Array.isArray(dynamicData[attrId]) ? dynamicData[attrId] : JSON.parse(dynamicData[attrId] || "[]")) : [];
        const nextFiles = [...currentFiles, uploadedFile];

        setDynamicData(prev => ({
          ...prev,
          [attrId]: nextFiles
        }));
      } else {
        alert(t("File upload failed", "Nahrávanie súboru zlyhalo", "Fájl feltöltés sikertelen"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(null);
    }
  };

  const handleRemoveFile = (attrId: string, fileIndex: number) => {
    const currentFiles = dynamicData[attrId] ? (Array.isArray(dynamicData[attrId]) ? dynamicData[attrId] : JSON.parse(dynamicData[attrId] || "[]")) : [];
    const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
    setDynamicData(prev => ({
      ...prev,
      [attrId]: nextFiles
    }));
  };

  const handleSave = () => {
    // Basic validations for required dynamic attributes
    for (const attr of projectType.attributes || []) {
      if (attr.required) {
        const val = dynamicData[attr.id];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          alert(`"${attr.name}" ${t("is required.", "je povinné.", "megadása kötelező.")}`);
          return;
        }
      }
    }

    const updatedProject: Project = {
      ...project,
      status,
      leadId: associatedLeadId || null,
      clientId: associatedClientId || null,
      managers: selectedManagers,
      data: dynamicData,
      timeline,
      gantt
    };

    onSave(updatedProject);
  };

  // Timeline Handlers
  const handleAddTimelineEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeTitle.trim()) return;

    // Validate required timeline attributes
    const selectedTeType = projectType.timelineEventTypes?.find(t => t.id === newTeType);
    const activeTimelineAttributes = selectedTeType ? selectedTeType.attributes : [];
    for (const attr of activeTimelineAttributes) {
      if (attr.required) {
        const val = timelineEventData[attr.id];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          alert(`"${attr.name}" ${t("is required.", "je povinné.", "megadása kötelező.")}`);
          return;
        }
      }
    }

    const isCustom = projectType.timelineEventTypes && projectType.timelineEventTypes.length > 0;
    const newEvent: ProjectTimelineEvent = {
      id: "pte-" + Date.now(),
      type: isCustom ? "custom" : newTeType,
      eventType: isCustom ? newTeType : undefined,
      timestamp: newTeTime || nowLocalStamp(),
      title: newTeTitle.trim(),
      content: newTeContent.trim(),
      data: timelineEventData
    };

    setTimeline(prev => [newEvent, ...prev]);
    setNewTeTitle("");
    setNewTeContent("");
    setNewTeTime("");
    setTimelineEventData({});
  };

  const handleRemoveTimelineEvent = (id: string) => {
    if (!window.confirm(t("Delete timeline event?", "Vymazať udalosť časovej osi?", "Törli az idővonal eseményt?"))) return;
    setTimeline(prev => prev.filter(e => e.id !== id));
  };

  // Gantt Handlers
  const handleAddGanttRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeTitle.trim()) return;

    const newRow: ProjectGanttRow = {
      id: "pgr-" + Date.now(),
      title: newGeTitle.trim(),
      contactId: newGeContactId,
      startDate: newGeStart || undefined,
      endDate: newGeEnd || undefined,
      progress: 0
    };

    setGantt(prev => [...prev, newRow]);
    setNewGeTitle("");
    setNewGeContactId("");
    setNewGeStart("");
    setNewGeEnd("");
  };

  const handleUpdateGanttProgress = (id: string, progress: number) => {
    setGantt(prev => prev.map(r => r.id === id ? { ...r, progress } : r));
  };

  const handleRemoveGanttRow = (id: string) => {
    if (!window.confirm(t("Delete Gantt row?", "Vymazať riadok Gantt diagramu?", "Törli a Gantt diagram sort?"))) return;
    setGantt(prev => prev.filter(r => r.id !== id));
  };

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const formatWeekRange = (monday: Date) => {
    const weekNum = getWeekNumber(monday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatMonthDay = (d: Date) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };

    return `W${weekNum} ${formatMonthDay(monday)} - ${formatMonthDay(sunday)}`;
  };

  const formatDayHeader = (d: Date) => {
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  const handleZoomIn = () => setColumnWidth(prev => Math.min(prev + 10, 120));
  const handleZoomOut = () => setColumnWidth(prev => Math.max(prev - 10, 35));

  const getGanttTimelineData = () => {
    let minDate = new Date();
    minDate.setDate(minDate.getDate() - 10);
    let maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 20);

    const validDates = gantt
      .filter(r => r.startDate || r.endDate)
      .map(r => new Date(r.startDate || r.endDate!));
    const validEndDates = gantt
      .filter(r => r.startDate || r.endDate)
      .map(r => new Date(r.endDate || r.startDate!));

    if (validDates.length > 0) {
      const minVal = Math.min(...validDates.map(d => d.getTime()));
      const maxVal = validEndDates.length > 0 
        ? Math.max(...validEndDates.map(d => d.getTime()), ...validDates.map(d => d.getTime()))
        : Math.max(...validDates.map(d => d.getTime()));
      
      minDate = new Date(minVal - 5 * 24 * 60 * 60 * 1000);
      maxDate = new Date(maxVal + 10 * 24 * 60 * 60 * 1000);
    }

    const weekdays: Date[] = [];
    let curr = new Date(minDate);
    let count = 0;
    while (curr <= maxDate && count < 150) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) { // Skip weekends
        weekdays.push(new Date(curr));
      }
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    const weekGroups: { monday: Date; startOffset: number; width: number; weekdays: Date[] }[] = [];
    const grouped: Record<string, Date[]> = {};
    weekdays.forEach(d => {
      const monday = getMonday(d);
      const mStr = monday.toISOString().slice(0, 10);
      if (!grouped[mStr]) grouped[mStr] = [];
      grouped[mStr].push(d);
    });

    let currentOffset = 0;
    Object.keys(grouped).sort().forEach(mStr => {
      const groupDays = grouped[mStr];
      const monday = new Date(mStr);
      const width = groupDays.length * columnWidth;
      weekGroups.push({
        monday,
        startOffset: currentOffset,
        width,
        weekdays: groupDays
      });
      currentOffset += width;
    });

    return { weekdays, weekGroups, totalTimelineWidth: currentOffset };
  };

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Icons.Briefcase className={className} />;
  };

  const getTimelineIcon = (type: string, eventType?: string | null) => {
    if (eventType && projectType) {
      const customType = projectType.timelineEventTypes?.find(t => t.id === eventType);
      if (customType) {
        const IconComp = (Icons as any)[customType.icon];
        if (IconComp) {
          return <IconComp className="h-4 w-4" style={{ color: customType.color }} />;
        }
      }
    }
    switch (type) {
      case "phone": return <Icons.Phone className="h-4 w-4 text-sky-500" />;
      case "email": return <Icons.Mail className="h-4 w-4 text-pink-500" />;
      case "offer": return <Icons.FileText className="h-4 w-4 text-amber-500" />;
      case "appointment": return <Icons.Calendar className="h-4 w-4 text-indigo-500" />;
      default: return <Icons.MessageSquare className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className="w-full bg-[#0f111a]/5 border border-slate-200/80 rounded-3xl flex flex-col h-[calc(100vh-11rem)] shadow-sm animate-fade-in overflow-hidden">
      
      {/* Header */}
      <div className="h-16 shrink-0 bg-white border-b border-slate-200 px-6 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors mr-1 cursor-pointer"
            title={t("Back to list", "Späť na zoznam", "Vissza a listához")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div 
            className="p-2 rounded-xl text-white shadow-sm"
            style={{ backgroundColor: projectType.color }}
          >
            {renderIcon(projectType.icon, "h-5 w-5")}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
              {projectType.name}
            </span>
            <span className="font-heading font-bold text-sm text-slate-800 mt-1">
              {leads.find(l => l.id === associatedLeadId)?.name || t("New Project", "Nový projekt", "Új projekt")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
          >
            <Icons.Save className="h-4.5 w-4.5" />
            <span>{t("Save Changes", "Uložiť zmeny", "Mentés")}</span>
          </button>
        </div>
      </div>

      {/* Workspace Body */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-0 bg-slate-50/50">
        
        {/* LEFT COLUMN: Metadata & Custom Attributes Card */}
        <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm text-left">
          <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-widest pb-3 border-b border-slate-150 mb-4 shrink-0">
            {t("Project Card Details", "Detaily karty projektu", "Projekt részletei")}
          </h4>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {/* Status */}
            <div>
              <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Status", "Stav", "Állapot")}</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="active">{t("Active", "Aktívny", "Aktív")}</option>
                <option value="completed">{t("Completed", "Dokončený", "Befejezett")}</option>
                <option value="on_hold">{t("On Hold", "Pozastavený", "Függőben")}</option>
                <option value="cancelled">{t("Cancelled", "Zrušený", "Törölt")}</option>
              </select>
            </div>

            {/* Lead / Client Link */}
            <div>
              <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Associated Client", "Priradený klient", "Kapcsolódó ügyfél")}</label>
              <SearchableClientSelect
                leads={leads}
                value={associatedLeadId}
                onChange={id => {
                  setAssociatedLeadId(id);
                  setAssociatedClientId(id);
                }}
                userLanguage={userLanguage}
              />
            </div>

            {/* Project Managers (Multiple selection) */}
            <div>
              <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Project Managers", "Projektoví manažéri", "Projektmenedzserek")}</label>
              <div className="border border-slate-200 rounded-xl p-2.5 bg-white space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                {users.map(u => {
                  const isChecked = selectedManagers.includes(u.name);
                  return (
                    <label key={u.email} className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedManagers(prev => prev.filter(m => m !== u.name));
                          } else {
                            setSelectedManagers(prev => [...prev, u.name]);
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>{u.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-205 my-4 shrink-0" />

            {/* DYNAMIC CUSTOM ATTRIBUTES FIELDS */}
            <div className="space-y-4">
              {(projectType.attributes || []).map(attr => {
                const val = dynamicData[attr.id] ?? "";
                const updateVal = (newVal: any) => {
                  setDynamicData(prev => ({ ...prev, [attr.id]: newVal }));
                };

                return (
                  <div key={attr.id}>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">
                      {attr.name} {attr.required && <span className="text-red-500">*</span>}
                    </label>

                    {/* Textfield */}
                    {attr.type === "textfield" && (
                      <input
                        type="text"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Textarea */}
                    {attr.type === "textarea" && (
                      <textarea
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 resize-none"
                      />
                    )}

                    {/* Number */}
                    {attr.type === "number" && (
                      <input
                        type="number"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Date */}
                    {attr.type === "date" && (
                      <input
                        type="date"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Time */}
                    {attr.type === "time" && (
                      <input
                        type="time"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Datetime */}
                    {attr.type === "datetime" && (
                      <input
                        type="datetime-local"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Select Dropdown */}
                    {attr.type === "select" && (
                      <select
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
                      >
                        <option value="">{t("Select option...", "Vybrať možnosť...", "Válasszon opciót...")}</option>
                        {(attr.options || []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}

                    {/* Checkbox (options-based or single boolean) */}
                    {attr.type === "checkbox" && (
                      <div className="space-y-1 py-1">
                        {attr.options ? (
                          attr.options.map(opt => {
                            const checkedList = Array.isArray(val) ? val : [];
                            const isChecked = checkedList.includes(opt);
                            return (
                              <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-655">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const nextList = isChecked 
                                      ? checkedList.filter(o => o !== opt)
                                      : [...checkedList, opt];
                                    updateVal(nextList);
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })
                        ) : (
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-655">
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={e => updateVal(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                            <span>{t("Yes / Enabled", "Áno / Povolené", "Igen / Engedélyezve")}</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Radio Buttons */}
                    {attr.type === "radio" && (
                      <div className="space-y-1.5 py-1">
                        {(attr.options || []).map(opt => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-655">
                            <input
                              type="radio"
                              name={attr.id}
                              value={opt}
                              checked={val === opt}
                              onChange={() => updateVal(opt)}
                              className="h-4 w-4 border-slate-300 text-indigo-600"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Multiple Files Upload */}
                    {attr.type === "files" && (
                      <div className="space-y-2">
                        <div className="flex flex-col gap-1.5">
                          {((Array.isArray(val) ? val : JSON.parse(val || "[]")) as any[]).map((f, fIdx) => (
                            <div key={fIdx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                              <a 
                                href={f.path} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 truncate animate-fade-in"
                              >
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="truncate">{f.name}</span>
                                <span className="text-[10px] text-slate-400 font-medium shrink-0">({f.size})</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(attr.id, fIdx)}
                                className="p-1 hover:bg-rose-50 rounded text-rose-600 shrink-0 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="relative">
                          <button
                            type="button"
                            disabled={isUploading === attr.id}
                            onClick={() => {
                              const input = document.getElementById(`file-input-${attr.id}`);
                              input?.click();
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-550 hover:bg-slate-50 hover:border-slate-450 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Upload className="h-4 w-4 text-slate-400" />
                            <span>{isUploading === attr.id ? t("Uploading...", "Nahráva sa...", "Feltöltés...") : t("Upload File", "Nahrať súbor", "Fájl feltöltése")}</span>
                          </button>
                          <input
                            type="file"
                            id={`file-input-${attr.id}`}
                            onChange={e => handleFileUpload(attr.id, e)}
                            className="hidden"
                          />
                        </div>
                      </div>
                    )}

                    {/* Contact Picker attribute type */}
                    {attr.type === "contact" && (
                      <div className="space-y-2">
                        <select
                          value={val}
                          onChange={e => updateVal(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
                        >
                          <option value="">{t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}</option>
                          {leads.map(l => (
                            <option key={l.id} value={l.id}>{l.name} ({l.city})</option>
                          ))}
                        </select>
                        {val && (() => {
                          const contact = leads.find(l => l.id === val);
                          if (!contact) return null;
                          return (
                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] font-semibold text-slate-600 animate-fade-in">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-800 font-bold">{contact.name}</span>
                                <a 
                                  href={`#lead-${contact.id}`}
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] underline"
                                >
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
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Timeline & Gantt Tabs */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm text-left">
          {/* Tab Switched Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 shrink-0">
            <div className="flex items-center gap-2 select-none">
              {projectType.hasTimeline && (
                <button
                  onClick={() => setActiveRightTab("timeline")}
                  className={`px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    activeRightTab === "timeline"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {t("Timeline", "Časová os", "Idővonal")}
                </button>
              )}
              {projectType.hasGantt && (
                <button
                  onClick={() => setActiveRightTab("gantt")}
                  className={`px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    activeRightTab === "gantt"
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {t("Gantt Chart", "Ganttov diagram", "Gantt diagram")}
                </button>
              )}
            </div>
          </div>

          {/* TAB CONTENT: Timeline */}
          {activeRightTab === "timeline" && projectType.hasTimeline && (
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6">
              {/* Timeline Form */}
              <div className="lg:w-1/3 flex flex-col shrink-0 bg-slate-50 p-4 border border-slate-200 rounded-2xl h-fit">
                <span className="text-[10px] font-black text-slate-450 uppercase mb-3 block">
                  {t("Log Timeline Event", "Zaznamenať udalosť", "Esemény rögzítése")}
                </span>
                
                <form onSubmit={handleAddTimelineEvent} className="space-y-3.5 text-xs font-semibold">
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Event Title", "Názov udalosti", "Esemény címe")}</label>
                    <input
                      value={newTeTitle}
                      onChange={e => setNewTeTitle(e.target.value)}
                      placeholder={t("e.g. Site survey completed", "napr. Zameranie dokončené", "pl. Helyszíni felmérés kész")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Event Type", "Typ", "Típus")}</label>
                    <select
                      value={newTeType}
                      onChange={e => setNewTeType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold"
                    >
                      {projectType.timelineEventTypes && projectType.timelineEventTypes.length > 0 ? (
                        projectType.timelineEventTypes.map(et => (
                          <option key={et.id} value={et.id}>{et.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="note">{t("Internal Note", "Interná poznámka", "Belső jegyzet")}</option>
                          <option value="phone">{t("Phone Call", "Telefonát", "Telefonhívás")}</option>
                          <option value="email">{t("Email Dispatch", "Odoslaný e-mail", "E-mail")}</option>
                          <option value="appointment">{t("Meeting / Appointment", "Stretnutie", "Találkozó")}</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Timestamp (Optional)", "Dátum a čas", "Dátum és idő")}</label>
                    <input
                      type="datetime-local"
                      value={newTeTime}
                      onChange={e => setNewTeTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Content details...", "Podrobnosti", "Részletek")}</label>
                    <textarea
                      value={newTeContent}
                      onChange={e => setNewTeContent(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white resize-none"
                    />
                  </div>

                  {/* DYNAMIC TIMELINE EVENT ATTRIBUTES FIELDS */}
                  {(() => {
                    const selectedTeType = projectType.timelineEventTypes?.find(t => t.id === newTeType);
                    const activeTimelineAttributes = selectedTeType ? selectedTeType.attributes : [];
                    return activeTimelineAttributes.map(attr => {
                      const val = timelineEventData[attr.id] ?? "";
                      const updateVal = (newVal: any) => {
                        setTimelineEventData(prev => ({ ...prev, [attr.id]: newVal }));
                      };

                      return (
                        <div key={attr.id} className="text-left mt-2">
                          <label className="block text-[9px] text-slate-400 uppercase mb-1">
                            {attr.name} {attr.required && <span className="text-red-500">*</span>}
                          </label>
                          {attr.type === "textfield" && (
                            <input
                              type="text"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "textarea" && (
                            <textarea
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white resize-none text-slate-800"
                            />
                          )}
                          {attr.type === "number" && (
                            <input
                              type="number"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "date" && (
                            <input
                              type="date"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "time" && (
                            <input
                              type="time"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "datetime" && (
                            <input
                              type="datetime-local"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "select" && (
                            <select
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700"
                            >
                              <option value="">{t("Select...", "Vybrať...", "Kiválasztás...")}</option>
                              {(attr.options || []).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          )}
                          {attr.type === "contact" && (
                            <select
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700"
                            >
                              <option value="">{t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}</option>
                              {leads.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                          )}
                          {attr.type === "checkbox" && (
                            <div className="space-y-1 py-1">
                              {attr.options ? (
                                attr.options.map(opt => {
                                  const checkedList = Array.isArray(val) ? val : [];
                                  const isChecked = checkedList.includes(opt);
                                  return (
                                    <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const nextList = isChecked 
                                            ? checkedList.filter(o => o !== opt)
                                            : [...checkedList, opt];
                                          updateVal(nextList);
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                      />
                                      <span>{opt}</span>
                                    </label>
                                  );
                                })
                              ) : (
                                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    onChange={e => updateVal(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                  />
                                  <span>{t("Yes", "Áno", "Igen")}</span>
                                </label>
                              )}
                            </div>
                          )}
                          {attr.type === "radio" && (
                            <div className="space-y-1.5 py-1">
                              {(attr.options || []).map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                  <input
                                    type="radio"
                                    name={`te-${attr.id}`}
                                    value={opt}
                                    checked={val === opt}
                                    onChange={() => updateVal(opt)}
                                    className="h-4 w-4 border-slate-300 text-indigo-600"
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {attr.type === "files" && (
                            <div className="space-y-2">
                              <div className="flex flex-col gap-1.5">
                                {((Array.isArray(val) ? val : JSON.parse(val || "[]")) as any[]).map((f, fIdx) => (
                                  <div key={fIdx} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl text-[10.5px]">
                                    <span className="truncate max-w-[150px] font-bold text-slate-700">{f.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentFiles = Array.isArray(val) ? val : JSON.parse(val || "[]");
                                        const next = currentFiles.filter((_: any, idx: number) => idx !== fIdx);
                                        updateVal(next);
                                      }}
                                      className="p-0.5 text-rose-600 hover:text-rose-800"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="relative">
                                <button
                                  type="button"
                                  disabled={isUploading === `te-${attr.id}`}
                                  onClick={() => {
                                    document.getElementById(`te-file-input-${attr.id}`)?.click();
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-[10.5px] font-bold text-slate-550 hover:bg-slate-100/50 hover:border-slate-400 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Upload className="h-3.5 w-3.5 text-slate-400" />
                                  <span>{isUploading === `te-${attr.id}` ? t("Uploading...", "Nahráva sa...", "Feltöltés...") : t("Upload File", "Nahrať súbor", "Fájl feltöltése")}</span>
                                </button>
                                <input
                                  type="file"
                                  id={`te-file-input-${attr.id}`}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setIsUploading(`te-${attr.id}`);
                                    const eventId = `pte-${project.id}-${attr.id}-${Date.now()}`;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    formData.append("eventId", eventId);
                                    try {
                                      const res = await fetch("/upload.php", { method: "POST", body: formData });
                                      const resData = await res.json();
                                      if (resData.success) {
                                        const sizeStr = file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + " MB" : (file.size / 1024).toFixed(0) + " KB";
                                        const uploaded = { name: resData.fileName || file.name, size: sizeStr, path: `/uploads/${eventId}_${resData.fileName || file.name}` };
                                        const current = Array.isArray(val) ? val : JSON.parse(val || "[]");
                                        updateVal([...current, uploaded]);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    } finally {
                                      setIsUploading(null);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer mt-4"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t("Add Event", "Pridať udalosť", "Esemény hozzáadása")}</span>
                  </button>
                </form>
              </div>

              {/* Timeline Events List */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
                {timeline.length === 0 ? (
                  <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl p-6 text-slate-400 text-xs">
                    {t("No events logged for this project yet.", "Zatiaľ neboli zaznamenané žiadne udalosti.", "Még nincsenek események rögzítve.")}
                  </div>
                ) : (
                  timeline.map(event => (
                    <div key={event.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-xs font-semibold relative group flex gap-3.5 animate-fade-in">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 shrink-0 self-start shadow-sm">
                        {getTimelineIcon(event.type, event.eventType)}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 text-[13px] font-bold">{event.title}</span>
                            {event.eventType && (
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {projectType.timelineEventTypes?.find(t => t.id === event.eventType)?.name || event.eventType}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <Icons.Clock className="h-3 w-3" />
                            {event.timestamp}
                          </span>
                        </div>
                        {event.content && (
                          <p className="text-slate-500 font-medium mt-1 leading-relaxed whitespace-pre-line">
                            {event.content}
                          </p>
                        )}

                        {/* Timeline custom event attributes values */}
                        {event.data && Object.keys(event.data).length > 0 && (() => {
                          const eventTypeObj = projectType.timelineEventTypes?.find(t => t.id === event.eventType);
                          const eventTypeAttrs = eventTypeObj ? eventTypeObj.attributes : [];
                          if (eventTypeAttrs.length === 0) return null;

                          return (
                            <div className="mt-2.5 grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/50">
                              {eventTypeAttrs.map(attr => {
                                const rawVal = event.data?.[attr.id];
                                if (rawVal === undefined || rawVal === null || rawVal === "" || (Array.isArray(rawVal) && rawVal.length === 0)) return null;

                                let renderedVal = rawVal;
                                if (attr.type === "contact") {
                                  const c = leads.find(l => l.id === rawVal);
                                  renderedVal = c ? c.name : rawVal;
                                } else if (attr.type === "files") {
                                  const filesList = Array.isArray(rawVal) ? rawVal : JSON.parse(rawVal || "[]");
                                  renderedVal = (
                                    <div className="flex flex-col gap-1 mt-0.5">
                                      {filesList.map((f: any, fIdx: number) => (
                                        <a key={fIdx} href={f.path} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 text-[10px] font-bold">
                                          <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                                          <span className="truncate max-w-[120px]">{f.name}</span>
                                        </a>
                                      ))}
                                    </div>
                                  );
                                } else if (Array.isArray(rawVal)) {
                                  renderedVal = rawVal.join(", ");
                                } else if (typeof rawVal === "boolean") {
                                  renderedVal = rawVal ? "Yes" : "No";
                                }

                                return (
                                  <div key={attr.id} className="text-left text-[11px] font-semibold text-slate-500">
                                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">{attr.name}</span>
                                    <div className="text-slate-700 mt-0.5">{renderedVal}</div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveTimelineEvent(event.id)}
                        className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Gantt Chart */}
          {activeRightTab === "gantt" && projectType.hasGantt && (() => {
            const { weekdays, weekGroups, totalTimelineWidth } = getGanttTimelineData();
            return (
              <div className="flex-1 overflow-hidden flex flex-col gap-4 text-xs font-semibold">
                
                {/* Gantt Entry Form Inline */}
                <form onSubmit={handleAddGanttRow} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex flex-wrap gap-4 items-end shrink-0">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Task Title", "Názov úlohy", "Feladat címe")}</label>
                    <input
                      value={newGeTitle}
                      onChange={e => setNewGeTitle(e.target.value)}
                      placeholder={t("e.g. Slab fabrication", "napr. Výroba dosiek", "pl. Lapok gyártása")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Assignee Contact", "Kontakt", "Kapcsolat")}</label>
                    <select
                      value={newGeContactId}
                      onChange={e => setNewGeContactId(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold min-w-[150px]"
                    >
                      <option value="">{t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Start Date", "Začiatok", "Kezdet")}</label>
                    <input
                      type="date"
                      value={newGeStart}
                      onChange={e => setNewGeStart(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("End Date", "Koniec", "Vége")}</label>
                    <input
                      type="date"
                      value={newGeEnd}
                      onChange={e => setNewGeEnd(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t("Add Row", "Pridať", "Hozzáadás")}</span>
                  </button>
                </form>

                {/* THE GANTT CONTAINER: Left Table & Right Timeline Scrollable */}
                <div className="flex-1 border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm flex flex-col relative min-h-[350px]">
                  
                  {/* Zoom controls floating */}
                  <div className="absolute right-4 top-3.5 z-30 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 p-1.5 rounded-xl shadow-sm">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      className="p-1 hover:bg-slate-100 rounded text-slate-650 transition-colors"
                    >
                      <Icons.Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-black text-slate-450 px-1.5 uppercase select-none">{columnWidth}px</span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      className="p-1 hover:bg-slate-100 rounded text-slate-650 transition-colors"
                    >
                      <Icons.Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT SIDE PANEL: Tasks table */}
                    <div className="w-[340px] shrink-0 flex flex-col border-r border-slate-200 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.015)]">
                      {/* Left Header */}
                      <div className="h-[76px] border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-50/20">
                        <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest">{t("Task Name", "Názov úlohy", "Feladat")}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest pr-4">{t("Due Date", "Termín", "Határidő")}</span>
                        </div>
                      </div>

                      {/* Left Body List */}
                      <div className="flex-1 overflow-y-auto divide-y divide-slate-150 scrollbar-none" id="gantt-left-body" onScroll={(e) => {
                        const rightBody = document.getElementById("gantt-right-body");
                        if (rightBody) rightBody.scrollTop = (e.target as HTMLDivElement).scrollTop;
                      }}>
                        {gantt.map(row => {
                          const isCompleted = row.progress === 100;
                          return (
                            <div key={row.id} className="h-[44px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors shrink-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateGanttProgress(row.id, isCompleted ? 0 : 100)}
                                  className="focus:outline-none shrink-0 cursor-pointer"
                                >
                                  {isCompleted ? (
                                    <Icons.CheckCircle2 className="h-4.5 w-4.5 text-blue-500 fill-blue-50" />
                                  ) : (
                                    <div className="h-4.5 w-4.5 rounded-full border border-slate-350 bg-white hover:border-slate-550 transition-colors" />
                                  )}
                                </button>
                                <input
                                  value={row.title}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setGantt(prev => prev.map(r => r.id === row.id ? { ...r, title: val } : r));
                                  }}
                                  className="bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500/30 rounded px-1.5 py-0.5 flex-1 min-w-0 truncate text-slate-800 font-bold"
                                  placeholder={t("Task name", "Názov úlohy", "Feladat neve")}
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedGanttEdit(row)}
                                  className="text-slate-555 hover:text-indigo-600 hover:bg-indigo-50/50 font-bold px-2 py-0.5 rounded-xl border border-slate-200 transition-all text-[10.5px] cursor-pointer"
                                >
                                  {row.endDate ? (
                                    new Date(row.endDate).toLocaleDateString(userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US", { month: "short", day: "numeric" })
                                  ) : (
                                    <Icons.Calendar className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGanttRow(row.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT SIDE PANEL: Timeline scrollable */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
                      
                      {/* Timeline Header */}
                      <div className="h-[76px] border-b border-slate-200 overflow-x-hidden overflow-y-hidden shrink-0 bg-slate-50/20" id="gantt-right-header">
                        <div style={{ width: totalTimelineWidth, height: "100%" }} className="flex flex-col relative select-none">
                          {/* Weeks Row */}
                          <div className="h-[38px] border-b border-slate-150 relative">
                            {weekGroups.map((g, idx) => (
                              <div
                                key={idx}
                                className="absolute h-full border-r border-slate-150 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase tracking-wider bg-slate-50/20 px-2"
                                style={{
                                  left: g.startOffset,
                                  width: g.width
                                }}
                              >
                                <span className="truncate">{formatWeekRange(g.monday)}</span>
                              </div>
                            ))}
                          </div>
                          {/* Days Row */}
                          <div className="h-[38px] relative">
                            {weekdays.map((d, idx) => (
                              <div
                                key={idx}
                                className="absolute h-full border-r border-slate-150 flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase"
                                style={{
                                  left: idx * columnWidth,
                                  width: columnWidth
                                }}
                              >
                                {formatDayHeader(d)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Timeline Body */}
                      <div 
                        className="flex-1 overflow-auto" 
                        id="gantt-right-body"
                        onScroll={(e) => {
                          const target = e.target as HTMLDivElement;
                          const header = document.getElementById("gantt-right-header");
                          if (header) header.scrollLeft = target.scrollLeft;
                          const leftBody = document.getElementById("gantt-left-body");
                          if (leftBody) leftBody.scrollTop = target.scrollTop;
                        }}
                      >
                        <div style={{ width: totalTimelineWidth, minHeight: "100%" }} className="relative divide-y divide-slate-150">
                          {/* Grid background lines */}
                          <div className="absolute inset-y-0 flex z-0 pointer-events-none">
                            {weekdays.map((_, idx) => (
                              <div 
                                key={idx} 
                                className="h-full border-r border-slate-100/70 shrink-0" 
                                style={{ width: columnWidth }}
                              />
                            ))}
                          </div>

                          {/* Task Timeline Rows */}
                          {gantt.map(row => {
                            let hasPill = false;
                            let pillLeft = 0;
                            let pillWidth = 0;

                            const effectiveStart = row.startDate || row.endDate;
                            const effectiveEnd = row.endDate || row.startDate;

                            if (effectiveStart && effectiveEnd) {
                              const startIdx = weekdays.findIndex(d => d.toISOString().slice(0,10) === effectiveStart);
                              const endIdx = weekdays.findIndex(d => d.toISOString().slice(0,10) === effectiveEnd);
                              if (startIdx !== -1 && endIdx !== -1) {
                                hasPill = true;
                                const leftIdx = Math.min(startIdx, endIdx);
                                const rightIdx = Math.max(startIdx, endIdx);
                                pillLeft = leftIdx * columnWidth;
                                pillWidth = (rightIdx - leftIdx + 1) * columnWidth;
                              }
                            }

                            const contact = leads.find(l => l.id === row.contactId);
                            const contactName = contact?.name || "";
                            const initials = contactName ? contactName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "";

                            return (
                              <div key={row.id} className="h-[44px] relative shrink-0 z-10 flex items-center bg-transparent">
                                {hasPill ? (
                                  <div 
                                    className="absolute h-full flex items-center transition-all duration-300"
                                    style={{
                                      left: pillLeft,
                                      width: `calc(100% - ${pillLeft}px)`
                                    }}
                                  >
                                    {/* Green Pill bar */}
                                    <div 
                                      className="h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 shrink-0 select-none cursor-pointer flex items-center justify-center hover:bg-emerald-500/30 transition-colors"
                                      style={{ width: pillWidth }}
                                      onClick={() => setSelectedGanttEdit(row)}
                                      title={`${row.startDate || row.endDate} to ${row.endDate || row.startDate}`}
                                    />
                                    
                                    {/* Assignee initials badge */}
                                    {initials && (
                                      <div 
                                        className={`h-5.5 w-5.5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white ml-2 shadow-sm uppercase ${
                                          row.progress === 100 ? "bg-blue-500" : "bg-orange-500"
                                        }`}
                                        title={contactName}
                                      >
                                        {initials}
                                      </div>
                                    )}

                                    {/* Task name display next to badge */}
                                    <span 
                                      className="ml-2 text-[11px] font-bold text-slate-700 truncate cursor-pointer hover:underline max-w-[300px]"
                                      onClick={() => setSelectedGanttEdit(row)}
                                    >
                                      {row.title}
                                    </span>
                                  </div>
                                ) : (
                                  // If no dates set, show yellow dot and name on the left of timeline
                                  <div className="absolute h-full flex items-center left-3">
                                    <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                                    {initials && (
                                      <div className="h-5 w-5 rounded-full bg-slate-500 shrink-0 flex items-center justify-center text-[8.5px] font-black text-white ml-2 shadow-sm">
                                        {initials}
                                      </div>
                                    )}
                                    <span 
                                      className="ml-2 text-[11px] font-bold text-slate-400 italic cursor-pointer hover:underline truncate max-w-[250px]"
                                      onClick={() => setSelectedGanttEdit(row)}
                                    >
                                      {row.title} ({t("no dates", "bez termínu", "nincs határidő")})
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

              </div>
            );
          })()}

          {/* GANTT EDIT MODAL */}
          {selectedGanttEdit && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-glass border border-slate-200/60 text-left space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h4 className="font-heading font-bold text-sm text-slate-800">
                    {t("Edit Task Details", "Upraviť podrobnosti úlohy", "Feladat részleteinek szerkesztése")}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedGanttEdit(null)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                  >
                    <Icons.X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Task Title", "Názov úlohy", "Feladat címe")}</label>
                    <input
                      type="text"
                      value={selectedGanttEdit.title}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedGanttEdit(prev => prev ? { ...prev, title: val } : null);
                        setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, title: val } : r));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Assignee Contact", "Kontakt", "Kapcsolat")}</label>
                    <select
                      value={selectedGanttEdit.contactId}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedGanttEdit(prev => prev ? { ...prev, contactId: val } : null);
                        setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, contactId: val } : r));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold"
                    >
                      <option value="">{t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("Start Date", "Začiatok", "Kezdet")}</label>
                      <input
                        type="date"
                        value={selectedGanttEdit.startDate || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedGanttEdit(prev => prev ? { ...prev, startDate: val || undefined } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, startDate: val || undefined } : r));
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-450 uppercase mb-1">{t("End Date", "Koniec", "Vége")}</label>
                      <input
                        type="date"
                        value={selectedGanttEdit.endDate || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedGanttEdit(prev => prev ? { ...prev, endDate: val || undefined } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, endDate: val || undefined } : r));
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-450 uppercase mb-1.5">{t("Progress", "Postup", "Haladás")} ({selectedGanttEdit.progress}%)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedGanttEdit.progress}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setSelectedGanttEdit(prev => prev ? { ...prev, progress: val } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: val } : r));
                        }}
                        className="flex-1 accent-indigo-600"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGanttEdit(prev => prev ? { ...prev, progress: 0 } : null);
                            setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: 0 } : r));
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] cursor-pointer"
                        >
                          0%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGanttEdit(prev => prev ? { ...prev, progress: 100 } : null);
                            setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: 100 } : r));
                          }}
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] cursor-pointer"
                        >
                          100%
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGanttEdit(null)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {t("Close", "Zatvoriť", "Bezárás")}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
