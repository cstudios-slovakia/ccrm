import React, { useState, useEffect } from "react";
import { 
  Play, Copy, Trash2, Plus, Settings, 
  GitFork, Brain, Database, Mail, 
  CheckCircle2, XCircle, AlertCircle, 
  Activity, ArrowLeft, RefreshCw, Layers, Terminal, Workflow,
  ToggleLeft, ToggleRight, Eye,
  Zap, Clock, UserPlus, Users, CheckSquare, ClipboardList,
  Bot, Calendar, User, Filter, Code, MapPin, Phone, Briefcase, Globe, FileText,
  ChevronDown, ChevronUp, Move, Sparkles, Send, Star, Bell, Flame, Heart, Shield, Wrench, Package, Award, Target, Lock, Search, Sliders, Tag, Gift, Compass, Paperclip, Printer, Headphones, Video, Radio, Megaphone, Bookmark, DollarSign, CreditCard, TrendingUp, BarChart2, HelpCircle, Info, Smile, ThumbsUp
} from "lucide-react";
import type { Language } from "../utils/translations";

const SYSTEM_COLORS = [
  { name: "Purple", hex: "#7e22ce" },
  { name: "Indigo", hex: "#4338ca" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Sky", hex: "#0284c7" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Emerald", hex: "#047857" },
  { name: "Amber", hex: "#d97706" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Rose", hex: "#be123c" },
  { name: "Pink", hex: "#be185d" },
  { name: "Slate", hex: "#334155" },
];

const ALL_ICONS_MAP: { [key: string]: React.ComponentType<{ className?: string }> } = {
  Play, Zap, Sparkles, Mail, Send, Database, CheckCircle2, Activity, Layers, Bot, Brain,
  User, Users, Star, Bell, Phone, Flame, Heart, Globe, Shield, Wrench, Package, Award,
  Target, FileText, Lock, Search, RefreshCw, Sliders, Tag, Gift, Compass, Paperclip, Printer,
  Headphones, Video, Terminal, Settings, Radio, Megaphone, Bookmark, MapPin, Calendar,
  DollarSign, CreditCard, TrendingUp, BarChart2, HelpCircle, Info, Smile, ThumbsUp, CheckSquare, ClipboardList, UserPlus, Code, Briefcase
};

const renderIconByName = (iconName: string, className: string = "h-4 w-4") => {
  const IconComp = ALL_ICONS_MAP[iconName] || Play;
  return <IconComp className={className} />;
};


const getActionIcon = (type: string) => {
  const size = "h-3.5 w-3.5";
  switch (type) {
    case "create_lead":
      return <UserPlus className={`${size} text-blue-500`} />;
    case "create_task":
      return <CheckSquare className={`${size} text-amber-600`} />;
    case "send_email":
      return <Mail className={`${size} text-indigo-500`} />;
    case "create_client":
      return <Users className={`${size} text-emerald-500`} />;
    default:
      return <Activity className={`${size} text-slate-400`} />;
  }
};

const getNodeHeaderIcon = (type: string) => {
  const size = "h-3.5 w-3.5";
  switch (type) {
    case "trigger":
      return <Zap className={`${size} text-blue-500`} />;
    case "condition":
      return <GitFork className={`${size} text-indigo-500`} />;
    case "splitter":
      return <Layers className={`${size} text-amber-500`} />;
    case "ai_agent":
      return <Brain className={`${size} text-purple-500`} />;
    case "action":
      return <CheckCircle2 className={`${size} text-emerald-500`} />;
    default:
      return <Zap className={`${size} text-slate-400`} />;
  }
};


interface AutomationViewProps {
  systemLanguage: Language;
  users: any[];
  leads: any[];
  taskStates: string[];
  leadStates: string[];
  leadSources: string[];
}

interface VariableInputFieldProps {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  multiline?: boolean;
  nodes?: any[];
  currentNodeId?: string;
}

const VariableInputField: React.FC<VariableInputFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  icon,
  multiline,
  nodes = [],
  currentNodeId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      // Capture phase: the node card's own onMouseDown calls stopPropagation()
      // during the bubble phase to start dragging, which would otherwise stop
      // this listener from ever seeing the click.
      document.addEventListener("mousedown", handleClickOutside, true);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [isOpen]);

  // Extract tags in current value
  const extractedTags = React.useMemo(() => {
    if (!value) return [];
    const matches = value.match(/\{\{\$[a-zA-Z0-9_\.]+\}\}/g) || [];
    return Array.from(new Set(matches));
  }, [value]);

  const tagLabels: Record<string, { label: string; block: string; color: string }> = {
    "{{$trigger.name}}": { label: "Meno / Name", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.email}}": { label: "E-mail", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.phone}}": { label: "Telefón / Phone", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.city}}": { label: "Mesto / City", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.company}}": { label: "Spoločnosť / Company", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.value}}": { label: "Hodnota / Value", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.status}}": { label: "Stav / Status", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$trigger.id}}": { label: "ID", block: "Spúšťač", color: "bg-blue-100 text-blue-800 border-blue-200" },
    "{{$ai.result}}": { label: "AI Výstup", block: "AI Agent", color: "bg-purple-100 text-purple-800 border-purple-200" },
    "{{$ai.summary}}": { label: "AI Zhrnutie", block: "AI Agent", color: "bg-purple-100 text-purple-800 border-purple-200" },
    "{{$condition.result}}": { label: "Výsledok", block: "Podmienka", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    "{{$item.value}}": { label: "Položka", block: "Rozdeľovač", color: "bg-amber-100 text-amber-800 border-amber-200" },
    "{{$input.text}}": { label: "Input Text", block: "Predchádzajúci block", color: "bg-slate-100 text-slate-800 border-slate-200" },
    "{{$input.result}}": { label: "Výsledok", block: "Predchádzajúci block", color: "bg-slate-100 text-slate-800 border-slate-200" },
  };

  // Group available tags by previous blocks
  const categories = React.useMemo(() => {
    const list: { title: string; badge: string; color: string; items: { label: string; tag: string }[] }[] = [];

    // Category 1: Trigger (Spúšťací uzol)
    list.push({
      title: "⚡ SPÚŠŤAČ / TRIGGER (PREVIOUS BLOCK)",
      badge: "Spúšťač",
      color: "text-blue-600 bg-blue-50/80 border-blue-100",
      items: [
        { label: "Meno / Name", tag: "{{$trigger.name}}" },
        { label: "E-mail", tag: "{{$trigger.email}}" },
        { label: "Telefón / Phone", tag: "{{$trigger.phone}}" },
        { label: "Mesto / City", tag: "{{$trigger.city}}" },
        { label: "Spoločnosť / Company", tag: "{{$trigger.company}}" },
        { label: "Hodnota / Value", tag: "{{$trigger.value}}" },
        { label: "Stav / Status", tag: "{{$trigger.status}}" },
        { label: "ID", tag: "{{$trigger.id}}" },
      ]
    });

    // Category 2: AI Agent (if exists in canvas)
    const hasAiNode = nodes.some(n => n.type === "ai_agent" && n.id !== currentNodeId);
    if (hasAiNode || nodes.length === 0) {
      list.push({
        title: "🧠 AI AGENT (PREVIOUS BLOCK)",
        badge: "AI Agent",
        color: "text-purple-600 bg-purple-50/80 border-purple-100",
        items: [
          { label: "AI Výstup / Output", tag: "{{$ai.result}}" },
          { label: "AI Zhrnutie / Summary", tag: "{{$ai.summary}}" },
        ]
      });
    }

    // Category 3: Condition (if exists in canvas)
    const hasConditionNode = nodes.some(n => n.type === "condition" && n.id !== currentNodeId);
    if (hasConditionNode || nodes.length === 0) {
      list.push({
        title: "🔀 PODMIENKA / CONDITION",
        badge: "Condition",
        color: "text-indigo-600 bg-indigo-50/80 border-indigo-100",
        items: [
          { label: "Podmienka Výsledok / Result", tag: "{{$condition.result}}" },
        ]
      });
    }

    // Category 4: Splitter (if exists in canvas)
    const hasSplitterNode = nodes.some(n => n.type === "splitter" && n.id !== currentNodeId);
    if (hasSplitterNode || nodes.length === 0) {
      list.push({
        title: "🥞 ROZDEĽOVAČ / SPLITTER",
        badge: "Splitter",
        color: "text-amber-600 bg-amber-50/80 border-amber-100",
        items: [
          { label: "Aktuálna položka / Split Item", tag: "{{$item.value}}" },
        ]
      });
    }

    return list;
  }, [nodes, currentNodeId]);

  const handleInsertTag = (tag: string) => {
    const space = (value && !value.endsWith(" ")) ? " " : "";
    onChange((value || "") + space + tag);
    setIsOpen(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = (value || "").replaceAll(tagToRemove, "").trim();
    onChange(updated);
  };

  return (
    <div className="space-y-1 relative" ref={dropdownRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            {label}
          </label>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-[9px] bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold px-1.5 py-0.5 rounded cursor-pointer transition-colors select-none flex items-center gap-1"
          >
            <Plus className="h-2.5 w-2.5" /> Pill Tag
          </button>
        </div>
      )}

      {/* Selected Pills Display Badges */}
      {extractedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 py-1">
          {extractedTags.map(tag => {
            const info = tagLabels[tag] || { label: tag, block: "Variable", color: "bg-purple-100 text-purple-800 border-purple-200" };
            return (
              <span 
                key={tag}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border shadow-xs ${info.color}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                <span>{info.block}: {info.label}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-rose-600 text-slate-400 font-extrabold text-[10px] ml-0.5 cursor-pointer"
                  title="Odstrániť pill"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-0.5">
        {icon && (
          <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
            {icon}
          </div>
        )}
        {multiline ? (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 h-16 bg-white resize-none focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all cursor-text"
            placeholder={placeholder}
          />
        ) : (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all cursor-text"
            placeholder={placeholder}
          />
        )}
      </div>

      {/* Previous Block Values Dropdown */}
      {isOpen && (
        <div 
          className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-[999] border-purple-100 ring-4 ring-purple-50/50 max-h-60 overflow-y-auto animate-in fade-in-50 zoom-in-95"
        >
          <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 mb-1.5 select-none">
            <span className="text-[9px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1">
              <Zap className="h-3 w-3 text-purple-600" />
              Hodnoty z predchádzajúcich blokov
            </span>
            <button 
              type="button" 
              onClick={() => setIsOpen(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-bold px-1"
            >
              ✕
            </button>
          </div>

          {categories.map((cat) => (
            <div key={cat.title} className="mb-2">
              <div className={`px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider rounded-md mb-1 flex items-center justify-between ${cat.color}`}>
                <span>{cat.title}</span>
                <span className="text-[7px] opacity-75">{cat.badge}</span>
              </div>
              <div className="space-y-0.5">
                {cat.items.map((tItem) => (
                  <button
                    key={tItem.tag}
                    type="button"
                    onClick={() => handleInsertTag(tItem.tag)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-purple-50 rounded-lg transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span className="font-bold text-slate-700 group-hover:text-purple-900">{tItem.label}</span>
                    <code className="text-[9px] bg-slate-100 group-hover:bg-purple-100 text-slate-500 group-hover:text-purple-800 px-1.5 py-0.5 rounded-md font-mono font-bold">
                      {tItem.tag}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AutomationView: React.FC<AutomationViewProps> = ({
  systemLanguage,
  users,
  leadStates,
  leadSources
}) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "editor" | "logs" | "settings">("list");
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  
  // Settings state
  const [apiKeys, setApiKeys] = useState({
    openAiKey: "",
    anthropicKey: "",
    geminiKey: "",
    cronToken: ""
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Execution logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Editor states
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDesc, setWorkflowDesc] = useState("");
  const [triggerType, setTriggerType] = useState("lead_created");
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [nodes, setNodes] = useState<any[]>([]);
  const [isTriggerDropdownOpen, setIsTriggerDropdownOpen] = useState(false);
  const triggerDropdownRef = React.useRef<HTMLDivElement>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const iconPickerRef = React.useRef<HTMLDivElement>(null);
  const [activePillDropdown, setActivePillDropdown] = useState<string | null>(null);
  const pillDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pillDropdownRef.current && !pillDropdownRef.current.contains(e.target as Node)) {
        setActivePillDropdown(null);
      }
    };
    if (activePillDropdown) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [activePillDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerDropdownRef.current && !triggerDropdownRef.current.contains(e.target as Node)) {
        setIsTriggerDropdownOpen(false);
      }
    };
    if (isTriggerDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [isTriggerDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIsIconPickerOpen(false);
      }
    };
    if (isIconPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [isIconPickerOpen]);

  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // Canvas drag & connect states
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingSource, setConnectingSource] = useState<{ nodeId: string; handleId?: string } | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);

  // Collapsed nodes & Canvas Panning states
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const toggleNodeCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };
  
  // Icon Picker states
  const [iconSearchQuery, setIconSearchQuery] = useState("");

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "sk") return sk;
    if (systemLanguage === "hu") return hu;
    return en;
  };

  const getModuleColor = (type: string) => {
    if (type.startsWith("lead")) return "#2563eb";     // Blue
    if (type.startsWith("client")) return "#059669";   // Green
    if (type.startsWith("task")) return "#ff5d00";     // Orange
    if (type === "timer") return "#b45309";            // Amber
    if (type === "manual") return "#6b21a8";           // Purple
    return "#64748b";                                  // Slate
  };

  const getTriggerLabel = (type: string) => {
    switch (type) {
      case "lead_created":
        return t("Lead Created", "Vytvorený lead", "Lead létrehozva");
      case "lead_status_changed":
        return t("Lead Status Changed", "Zmena stavu leadu", "Lead státusz változott");
      case "lead_timeline_event":
        return t("New Timeline Event", "Nová udalosť na osi", "Új idővonali esemény");
      case "client_created":
        return t("Client Created", "Vytvorený klient", "Ügyfél létrehozva");
      case "task_created":
        return t("Task Created", "Vytvorená úloha", "Feladat létrehozva");
      case "task_status_changed":
        return t("Task Status Changed", "Zmena stavu úlohy", "Feladat státusz változott");
      case "timer":
        return t("Timer Trigger (Cron)", "Časovač (Cron)", "Időzítő");
      case "manual":
        return t("Manual Button Trigger", "Manuálny spúšťač", "Kézi indítás");
      default:
        return type;
    }
  };


  // Every other module reports through the app-wide toast stack in the bottom-right
  // corner. This view used to draw its own banner in the top-right, so an automation
  // message looked like it came from a different product — route it through the
  // shared one instead.
  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(message, type === "error" ? "error" : undefined);
      return;
    }
    console.warn("[automation]", message);
  };

  // Fetch workflows
  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows.php?action=list");
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.workflows || []);
      } else {
        showToast(data.message || "Failed to fetch workflows", "error");
      }
    } catch (err) {
      showToast("Error loading workflows", "error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/workflows.php?action=get_settings");
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.settings);
      }
    } catch (err) {
      console.error("Error fetching settings", err);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    fetchSettings();
  }, []);

  // Save Settings
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/workflows.php?action=save_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeys)
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("Settings saved successfully", "Nastavenia boli úspešne uložené", "Beállítások sikeresen mentve"));
        fetchSettings();
      } else {
        showToast(data.message || "Failed to save settings", "error");
      }
    } catch (err) {
      showToast("Error saving settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Clone workflow
  const cloneWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/workflows.php?action=clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("Workflow duplicated successfully", "Workflow bol úspešne duplikovaný", "A munkafolyamat sikeresen duplikálva"));
        fetchWorkflows();
      } else {
        showToast(data.message || "Failed to clone workflow", "error");
      }
    } catch (err) {
      showToast("Error duplicating workflow", "error");
    }
  };

  // Toggle active state
  const toggleActive = async (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextStatus = !currentStatus;
      const res = await fetch("/api/workflows.php?action=toggle_active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: nextStatus ? 1 : 0 })
      });
      const data = await res.json();
      if (data.success) {
        showToast(nextStatus ? t("Workflow activated", "Workflow bol aktivovaný", "Munkafolyamat aktiválva") : t("Workflow deactivated", "Workflow bol deaktivovaný", "Munkafolyamat deaktiválva"));
        fetchWorkflows();
      }
    } catch (err) {
      showToast("Error toggling status", "error");
    }
  };

  // Delete workflow
  const deleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("Are you sure you want to delete this workflow?", "Naozaj chcete vymazať tento workflow?", "Biztosan törli ezt a munkafolyamatot?"))) {
      return;
    }
    try {
      const res = await fetch("/api/workflows.php?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("Workflow deleted", "Workflow bol vymazaný", "Munkafolyamat törölve"));
        fetchWorkflows();
      }
    } catch (err) {
      showToast("Error deleting workflow", "error");
    }
  };

  // Initialize new workflow editor
  const handleNewWorkflow = () => {
    setSelectedWorkflow(null);
    setWorkflowName("");
    setWorkflowDesc("");
    setTriggerType("lead_created");
    setTriggerConfig({});
    
    // Add default trigger node. y clears the floating "Add Nodes" toolbar that sits
    // at the top-left of the canvas — at y=50 the card opened underneath it.
    const initialNodes = [
      { id: "node-trigger", type: "trigger", name: t("Trigger Node", "Spúšťací uzol", "Indító csomópont"), data: { type: "lead_created" }, x: 250, y: 110 }
    ];
    setNodes(initialNodes);
    setEdges([]);
    setSelectedNode(initialNodes[0]);
    setActiveTab("editor");
  };

  // Open existing workflow editor
  const handleEditWorkflow = (wf: any) => {
    setSelectedWorkflow(wf);
    setWorkflowName(wf.name);
    setWorkflowDesc(wf.description || "");
    setTriggerType(wf.trigger_type);
    setTriggerConfig(wf.trigger_config || {});
    setNodes(wf.nodes || []);
    setEdges(wf.edges || []);
    setSelectedNode(wf.nodes?.[0] || null);
    setActiveTab("editor");
    setSelectedLog(null);
  };

  // Open logs view
  const handleViewLogs = async (wf: any) => {
    setSelectedWorkflow(wf);
    setActiveTab("logs");
    try {
      const res = await fetch(`/api/workflows.php?action=logs&id=${wf.id}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      showToast("Error loading logs", "error");
    }
  };

  // Save workflow
  const saveWorkflow = async () => {
    if (!workflowName.trim()) {
      showToast(t("Workflow name is required", "Názov workflow je povinný", "A név megadása kötelező"), "error");
      return;
    }

    const payload = {
      id: selectedWorkflow?.id || "",
      name: workflowName,
      description: workflowDesc,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      nodes,
      edges,
      is_active: selectedWorkflow ? selectedWorkflow.is_active : 1
    };

    try {
      const res = await fetch("/api/workflows.php?action=save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("Workflow saved successfully", "Workflow bol úspešne uložený", "A munkafolyamat sikeresen mentve"));
        setActiveTab("list");
        fetchWorkflows();
      } else {
        showToast(data.message || "Failed to save workflow", "error");
      }
    } catch (err) {
      showToast("Error saving workflow", "error");
    }
  };

  // Add node to editor
  const addNode = (type: "condition" | "splitter" | "ai_agent" | "action", subType = "") => {
    const newId = `node-${Date.now()}`;
    let name = "";
    let data: any = {};
    
    if (type === "condition") {
      if (subType === "status_check") {
        name = t("Check Status Condition", "Kontrola stavu", "Státusz ellenőrzése");
        data = { js_code: 'return $input.status === "new";' };
      } else {
        name = t("If/Else Condition", "Podmienka If/Else", "Feltétel");
        data = { js_code: 'return $input.status === "won";' };
      }
    } else if (type === "splitter") {
      if (subType === "parallel") {
        name = t("Parallel Branching", "Paralelné vetvenie", "Párhuzamos ágak");
        data = { array_path: "" };
      } else {
        name = t("Split Events", "Rozdeliť udalosti", "Események felosztása");
        data = { array_path: "" };
      }
    } else if (type === "ai_agent") {
      if (subType === "summarize") {
        name = t("AI Lead Summarizer", "AI Zhrnutie leadu", "AI Lead Összegzés");
        data = { provider: "gemini", prompt: "Summarize lead details and key requirements: {{$trigger.name}}, {{$trigger.city}}" };
      } else if (subType === "draft_email") {
        name = t("AI Email Drafter", "AI Návrh e-mailu", "AI E-mail piszkozat");
        data = { provider: "gemini", prompt: "Write a polite follow-up email to {{$trigger.name}}" };
      } else {
        name = t("AI Agent Processor", "AI Agent Procesor", "AI Ágens");
        data = { provider: "gemini", prompt: "Summarize this lead: {{$trigger.name}}" };
      }
    } else if (type === "action") {
      if (subType === "create_lead") {
        name = t("Create Lead", "Vytvoriť lead", "Lead létrehozása");
        data = { type: "create_lead", name: "{{$trigger.name}}", city: "{{$trigger.city}}", status: "new" };
      } else if (subType === "create_task") {
        name = t("Create Task", "Vytvoriť úlohu", "Feladat létrehozása");
        data = { type: "create_task", title: "", description: "", priority: "medium", deadline_days: 2, deadline_time: "09:00" };
      } else if (subType === "send_email") {
        name = t("Send Email", "Odoslať e-mail", "E-mail küldése");
        data = { type: "send_email", to: "{{$trigger.email}}", subject: "Welcome to CCRM", body: "Hello {{$trigger.name}}, ..." };
      } else {
        name = t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása");
        data = { type: "create_client", name: "{{$trigger.name}}", client_type: "business", status: "new" };
      }
    }

    const newNode = {
      id: newId,
      type,
      name,
      data,
      x: 150 + Math.floor(Math.random() * 150),
      y: 150 + Math.floor(Math.random() * 150)
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode);
    setActivePillDropdown(null);
  };

  // Remove node
  const removeNode = (nodeId: string) => {
    if (nodeId === "node-trigger") {
      alert(t("Trigger node cannot be deleted.", "Spúšťací uzol nie je možné vymazať.", "Az indító csomópont nem törölhető."));
      return;
    }
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
  };



  // Node Drag & Connect & Canvas Panning Handlers
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.connection-handle')) {
      return;
    }
    
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setDraggedNodeId(nodeId);
      setDragOffset({
        x: e.clientX - node.x,
        y: e.clientY - node.y
      });
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('.connection-handle') || target.closest('.node-card')) {
      return;
    }
    setIsPanning(true);
    setPanStart({
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (draggedNodeId) {
      const updatedNodes = nodes.map(n => {
        if (n.id === draggedNodeId) {
          return {
            ...n,
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
          };
        }
        return n;
      });
      setNodes(updatedNodes);
    }
    
    if (connectingSource) {
      const rect = e.currentTarget.getBoundingClientRect();
      setConnectionMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggedNodeId(null);
    setIsPanning(false);
  };

  const handleStartConnection = (nodeId: string, handleId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConnectingSource({ nodeId, handleId });
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      const isCollapsed = !!collapsedNodes[nodeId];
      const xOffset = 320;
      setConnectionMousePos({
        x: node.x + panOffset.x + xOffset,
        y: node.y + panOffset.y + (isCollapsed ? 24 : (handleId === "false" ? 80 : 45))
      });
    }
  };

  const handleCompleteConnection = (targetNodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!connectingSource) return;
    if (connectingSource.nodeId === targetNodeId) {
      setConnectingSource(null);
      setConnectionMousePos(null);
      return;
    }
    
    const exists = edges.some(edge => 
      edge.source === connectingSource.nodeId && 
      edge.target === targetNodeId && 
      edge.sourceHandle === connectingSource.handleId
    );
    
    if (!exists) {
      const newEdge = {
        id: `edge-${Date.now()}`,
        source: connectingSource.nodeId,
        target: targetNodeId,
        sourceHandle: connectingSource.handleId
      };
      setEdges([...edges, newEdge]);
    }
    
    setConnectingSource(null);
    setConnectionMousePos(null);
  };

  const handleCanvasClick = () => {
    if (connectingSource) {
      setConnectingSource(null);
      setConnectionMousePos(null);
    }
  };

  const getHandleCoords = (nodeId: string, type: "input" | "output", handleId?: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    
    const cardWidth = 320;
    const isCollapsed = !!collapsedNodes[nodeId];
    const yOffset = isCollapsed ? 24 : 45;
    
    if (type === "input") {
      return {
        x: node.x + panOffset.x,
        y: node.y + panOffset.y + yOffset
      };
    } else {
      if (node.type === "condition") {
        return {
          x: node.x + panOffset.x + cardWidth,
          y: node.y + panOffset.y + (isCollapsed ? 24 : (handleId === "false" ? 80 : 45))
        };
      }
      return {
        x: node.x + panOffset.x + cardWidth,
        y: node.y + panOffset.y + yOffset
      };
    }
  };

  const renderEdgeLine = (edge: any) => {
    const start = getHandleCoords(edge.source, "output", edge.sourceHandle);
    const end = getHandleCoords(edge.target, "input");
    
    const controlPointX = (start.x + end.x) / 2;
    const d = `M ${start.x} ${start.y} C ${controlPointX} ${start.y}, ${controlPointX} ${end.y}, ${end.x} ${end.y}`;
    
    const strokeColor = edge.sourceHandle === "true" ? "#22c55e" : (edge.sourceHandle === "false" ? "#ef4444" : "#a855f7");

    return (
      <g key={edge.id} className="group">
        <path
          d={d}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3.5"
          className="transition-all group-hover:stroke-rose-500 group-hover:stroke-[4px]"
        />
        <circle cx={end.x} cy={end.y} r="4" fill={strokeColor} className="group-hover:fill-rose-500 transition-colors" />
      </g>
    );
  };

  // Run manual execution test
  const triggerManualRun = async () => {
    if (!selectedWorkflow) return;
    try {
      const res = await fetch(`/api/workflows.php?action=trigger_manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedWorkflow.id, payload: { name: "Test Lead", city: "Bratislava", email: "test@example.com", status: "new" } })
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("Test run completed successfully!", "Testovací beh prebehol úspešne!", "Tesztfutás sikeresen befejeződött!"));
        handleViewLogs(selectedWorkflow);
      } else {
        showToast(data.message || "Test run failed", "error");
      }
    } catch (err) {
      showToast("Error triggering test run", "error");
    }
  };

  const getTriggerIcon = (type: string) => {
    switch (type) {
      case "lead_created":
      case "lead_status_changed":
      case "lead_timeline_event":
        return <Database className="h-5 w-5 text-blue-500" />;
      case "email_received":
      case "email_sent":
        return <Mail className="h-5 w-5 text-pink-500" />;
      case "timer":
        return <Activity className="h-5 w-5 text-amber-500" />;
      default:
        return <Play className="h-5 w-5 text-purple-500" />;
    }
  };

  const cronUrl = `${window.location.origin}/api/cron.php?token=${apiKeys.cronToken || "TOKEN"}`;

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
      {/* HEADER SECTION — same shape as every other module: title block on the left,
          actions on the right, hairline rule underneath. The view used to paint its
          own full-width white bar directly under the app header, which read as a
          second, competing header. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-purple-600" />
            {t("Automations & Workflows", "Automatizácie a workflowy", "Automatizálás és munkafolyamatok")}
          </h1>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t(
              "Build event-driven triggers, branching logic and AI agents that run your CRM for you.",
              "Vytvárajte spúšťače udalostí, vetviacu logiku a AI agentov, ktorí za vás obsluhujú CRM.",
              "Eseményvezérelt triggerek, elágazó logika és AI ágensek, amelyek Ön helyett működtetik a CRM-et."
            )}
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {activeTab === "list" ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Settings className="h-4 w-4" />
                {t("Settings", "Nastavenia", "Beállítások")}
              </button>
              <button
                type="button"
                onClick={handleNewWorkflow}
                className="px-5 py-3 rounded-2xl bg-[#0b1329] text-white hover:bg-slate-900 shadow-md shadow-[#0b1329]/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
              >
                <Plus className="h-4.5 w-4.5" />
                {t("Create Workflow", "Vytvoriť workflow", "Új munkafolyamat")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActiveTab("list");
                fetchWorkflows();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("Back to list", "Späť na zoznam", "Vissza a listához")}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full">

        {/* TAB 1: WORKFLOW LIST */}
        {activeTab === "list" && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="h-8 w-8 text-purple-600 animate-spin" />
                <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">{t("Loading automations...", "Načítavam automatizácie...", "Betöltés...")}</span>
              </div>
            ) : workflows.length === 0 ? (
              <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-12 text-center flex flex-col items-center justify-center">
                <div className="h-16 w-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-4">
                  <Workflow className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="font-heading font-extrabold text-slate-900 mb-1">{t("No workflows created yet", "Zatiaľ neboli vytvorené žiadne workflowy", "Még nincsenek munkafolyamatok")}</h3>
                <p className="text-sm text-slate-500 max-w-sm mb-6 font-medium">
                  {t("Set up your first automation to trigger AI actions, notifications or task creation when leads/events change.", "Vytvorte si svoju prvú automatizáciu pre spúšťanie AI akcií, upozornení alebo vytváranie úloh.", "Hozzon létre egy automatizációt a feladatok automatikus indításához.")}
                </p>
                <button
                  type="button"
                  onClick={handleNewWorkflow}
                  className="px-5 py-3 rounded-2xl bg-[#0b1329] text-white hover:bg-slate-900 shadow-md shadow-[#0b1329]/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  <Plus className="h-4.5 w-4.5" />
                  {t("Create Workflow", "Vytvoriť workflow", "Új munkafolyamat")}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.map(wf => (
                  <div
                    key={wf.id}
                    onClick={() => handleEditWorkflow(wf)}
                    className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 hover:shadow-lg hover:-translate-y-0.5 hover:border-purple-200 transition-all duration-300 group cursor-pointer flex flex-col relative overflow-hidden"
                  >
                    {/* Active State Ribbon */}
                    <div className={`absolute top-0 right-0 h-1.5 left-0 ${wf.is_active ? 'bg-purple-600' : 'bg-slate-300'}`} />

                    <div className="flex items-start justify-between mb-4">
                      <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                        {getTriggerIcon(wf.trigger_type)}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => toggleActive(wf.id, wf.is_active === 1, e)}
                          title={wf.is_active ? t("Deactivate", "Deaktivovať", "Deaktivál") : t("Activate", "Aktivovať", "Aktivál")}
                          className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors cursor-pointer"
                        >
                          {wf.is_active ? <ToggleRight className="h-6 w-6 text-purple-600" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => cloneWorkflow(wf.id, e)}
                          title={t("Duplicate", "Duplikovať", "Duplikál")}
                          className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors cursor-pointer"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteWorkflow(wf.id, e)}
                          title={t("Delete", "Vymazať", "Töröl")}
                          className="p-1.5 hover:bg-rose-50 rounded-xl text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-heading font-extrabold text-slate-900 group-hover:text-purple-800 transition-colors mb-1">
                      {wf.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2">
                      {wf.description || t("No description added.", "Žiadny popis.", "Nincs leírás.")}
                    </p>

                    {/* Stats Section */}
                    <div className="mt-auto border-t border-slate-100 pt-4 flex items-center justify-between">
                      <div className="flex gap-4">
                        <div className="flex flex-col">
                          <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest">{t("Total Runs", "Spustenia", "Futások")}</span>
                          <span className="text-sm font-black text-slate-900 font-mono">{wf.stats?.total_runs || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-widest">{t("Success Rate", "Úspešnosť", "Siker")}</span>
                          <span className="text-sm font-black text-emerald-600 font-mono">
                            {wf.stats?.total_runs > 0
                              ? Math.round((wf.stats.success_runs / wf.stats.total_runs) * 100) + "%"
                              : "100%"
                            }
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewLogs(wf);
                        }}
                        className="text-[10px] font-heading font-bold uppercase tracking-wider text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("Logs", "Záznamy", "Naplók")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NODE WORKFLOW EDITOR */}
        {activeTab === "editor" && (
          /* The canvas is a bounded card inside the padded workspace, not a full-bleed
             screen — the old 100vh-80px height assumed this view drew its own header
             and left the editor hanging past the bottom of the page. */
          <div className="h-[calc(100vh-15rem)] min-h-[560px] flex overflow-hidden rounded-3xl border border-white/60 bg-white/95 shadow-glass">
            {/* Editor Canvas Area */}
            <div
              className="flex-1 bg-slate-50 border-r border-slate-200 overflow-hidden relative select-none"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              style={{
                backgroundSize: '20px 20px',
                backgroundImage: 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
                backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                cursor: isPanning ? 'grabbing' : (draggedNodeId ? 'grabbing' : 'grab')
              }}
            >
              
              {/* Floating Node Controls Bar */}
              <div ref={pillDropdownRef} className="absolute top-4 left-4 bg-white/95 backdrop-blur border border-slate-200/90 rounded-2xl p-2.5 shadow-lg flex items-center gap-2 z-30">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-r border-slate-200 pr-3 mr-1 select-none">{t("Add Nodes", "Pridať uzly", "Új csomópontok")}</span>

                {/* AI Agent Pill */}
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setActivePillDropdown(activePillDropdown === "agent" ? null : "agent")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                      activePillDropdown === "agent"
                        ? "bg-purple-100 text-purple-800 border-purple-300 ring-2 ring-purple-200"
                        : "bg-purple-50/80 hover:bg-purple-100 text-purple-700 border-purple-200/80"
                    }`}
                  >
                    <Brain className="h-3.5 w-3.5 text-purple-600" />
                    <span>{t("AI Agent", "AI Agent", "AI Ágens")}</span>
                    <ChevronDown className={`h-3 w-3 text-purple-500 transition-transform ${activePillDropdown === "agent" ? "rotate-180" : ""}`} />
                  </button>
                  {activePillDropdown === "agent" && (
                    <div className="absolute left-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 border-purple-100 ring-4 ring-purple-50/50 animate-in fade-in-50 zoom-in-95">
                      <div className="px-3 py-1 text-[9px] font-extrabold text-purple-600 uppercase tracking-wider bg-purple-50/50 flex items-center gap-1.5 select-none mb-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        {t("AI Processors", "AI PROCESORY", "AI PROCESSZOROK")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("ai_agent", "general")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-purple-50 text-purple-600">
                          <Brain className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("AI Agent Processor", "AI Agent Procesor", "AI Ágens")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Custom AI prompts & logic", "Vlastné AI vzory a logika", "Egyedi AI promptok")}</div>
                        </div>
                      </button>
                      <button 
                        type="button"
                        onClick={() => addNode("ai_agent", "summarize")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-purple-50 text-purple-600">
                          <Bot className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("Summarize Lead", "Zhrnutie leadu", "Lead összegzés")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Auto-generate lead summary", "Automatické zhrnutie leadu", "Automatikus összegzés")}</div>
                        </div>
                      </button>
                      <button 
                        type="button"
                        onClick={() => addNode("ai_agent", "draft_email")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-purple-50 text-purple-600">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("Draft Email Response", "Návrh odpovede na e-mail", "E-mail válasz piszkozat")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("AI smart email draft", "AI inteligentný návrh", "AI okos piszkozat")}</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Action Pill */}
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setActivePillDropdown(activePillDropdown === "action" ? null : "action")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                      activePillDropdown === "action"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-200"
                        : "bg-emerald-50/80 hover:bg-emerald-100 text-emerald-700 border-emerald-200/80"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{t("Action", "Action", "Akció")}</span>
                    <ChevronDown className={`h-3 w-3 text-emerald-500 transition-transform ${activePillDropdown === "action" ? "rotate-180" : ""}`} />
                  </button>
                  {activePillDropdown === "action" && (
                    <div className="absolute left-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 border-emerald-100 ring-4 ring-emerald-50/50 animate-in fade-in-50 zoom-in-95">
                      
                      {/* Leads */}
                      <div className="px-3 py-1 text-[9px] font-extrabold text-blue-600 uppercase tracking-wider bg-blue-50/40 flex items-center gap-1 select-none mb-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {t("Leads", "LEADY", "LEADEK")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("action", "create_lead")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-900 text-left transition-colors cursor-pointer"
                      >
                        <UserPlus className="h-4 w-4 text-blue-500" />
                        <span>{t("Create Lead", "Vytvoriť lead", "Lead létrehozása")}</span>
                      </button>

                      {/* Clients */}
                      <div className="mt-1 px-3 py-1 text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider bg-emerald-50/40 flex items-center gap-1 select-none mb-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t("Clients", "KLIENTI", "ÜGYFELEK")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("action", "create_client")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 text-left transition-colors cursor-pointer"
                      >
                        <Users className="h-4 w-4 text-emerald-500" />
                        <span>{t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása")}</span>
                      </button>

                      {/* Tasks */}
                      <div className="mt-1 px-3 py-1 text-[9px] font-extrabold text-amber-600 uppercase tracking-wider bg-amber-50/40 flex items-center gap-1 select-none mb-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {t("Tasks", "ÚLOHY", "FELADATOK")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("action", "create_task")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 text-left transition-colors cursor-pointer"
                      >
                        <CheckSquare className="h-4 w-4 text-amber-600" />
                        <span>{t("Create Task", "Vytvoriť úlohu", "Feladat létrehozása")}</span>
                      </button>

                      {/* Email */}
                      <div className="mt-1 px-3 py-1 text-[9px] font-extrabold text-indigo-600 uppercase tracking-wider bg-indigo-50/40 flex items-center gap-1 select-none mb-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        {t("Email", "E-MAIL", "E-MAIL")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("action", "send_email")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 text-left transition-colors cursor-pointer"
                      >
                        <Mail className="h-4 w-4 text-indigo-500" />
                        <span>{t("Send Email", "Odoslať e-mail", "E-mail küldése")}</span>
                      </button>

                    </div>
                  )}
                </div>

                {/* Condition (If/Else) Pill */}
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setActivePillDropdown(activePillDropdown === "condition" ? null : "condition")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                      activePillDropdown === "condition"
                        ? "bg-indigo-100 text-indigo-800 border-indigo-300 ring-2 ring-indigo-200"
                        : "bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80"
                    }`}
                  >
                    <GitFork className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{t("If/Else", "If/Else", "If/Else")}</span>
                    <ChevronDown className={`h-3 w-3 text-indigo-500 transition-transform ${activePillDropdown === "condition" ? "rotate-180" : ""}`} />
                  </button>
                  {activePillDropdown === "condition" && (
                    <div className="absolute left-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 border-indigo-100 ring-4 ring-indigo-50/50 animate-in fade-in-50 zoom-in-95">
                      <div className="px-3 py-1 text-[9px] font-extrabold text-indigo-600 uppercase tracking-wider bg-indigo-50/40 flex items-center gap-1 select-none mb-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        {t("Logic Conditions", "PODMIENKY A LOGIKA", "FELTÉTELEK")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("condition", "if_else")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                          <GitFork className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("If/Else Condition", "Podmienka If/Else", "Feltétel")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Branch logic evaluation", "Vyhodnotenie podmienky", "Feltétel kiértékelés")}</div>
                        </div>
                      </button>
                      <button 
                        type="button"
                        onClick={() => addNode("condition", "status_check")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                          <Filter className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("Status Filter", "Kontrola stavu", "Státusz szűrő")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Filter by status", "Filtrovať podľa stavu", "Szűrés státusz alapján")}</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Splitter Pill */}
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setActivePillDropdown(activePillDropdown === "splitter" ? null : "splitter")}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                      activePillDropdown === "splitter"
                        ? "bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-200"
                        : "bg-amber-50/80 hover:bg-amber-100 text-amber-700 border-amber-200/80"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5 text-amber-600" />
                    <span>{t("Splitter", "Rozdeľovač", "Osztó")}</span>
                    <ChevronDown className={`h-3 w-3 text-amber-500 transition-transform ${activePillDropdown === "splitter" ? "rotate-180" : ""}`} />
                  </button>
                  {activePillDropdown === "splitter" && (
                    <div className="absolute left-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 py-2 border-amber-100 ring-4 ring-amber-50/50 animate-in fade-in-50 zoom-in-95">
                      <div className="px-3 py-1 text-[9px] font-extrabold text-amber-600 uppercase tracking-wider bg-amber-50/40 flex items-center gap-1 select-none mb-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {t("Flow Control", "ROZDELENIE TOKU", "FOLYAMAT VEZÉRLÉS")}
                      </div>
                      <button 
                        type="button"
                        onClick={() => addNode("splitter", "array")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-amber-50 text-amber-600">
                          <Layers className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("Split Events Array", "Rozdeliť udalosti", "Események felosztása")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Process items individually", "Spracovať položky po jednej", "Elemek feldolgozása egyenkoľnek")}</div>
                        </div>
                      </button>
                      <button 
                        type="button"
                        onClick={() => addNode("splitter", "parallel")} 
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-900 text-left transition-colors cursor-pointer"
                      >
                        <div className="p-1 rounded-md bg-amber-50 text-amber-600">
                          <GitFork className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-bold">{t("Parallel Branches", "Paralelné vetvenie", "Párhuzamos ágak")}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{t("Execute multiple paths", "Spustiť viacero ciest súčasne", "Több ág párhuzamos futtatása")}</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Reset View Button */}
                <button 
                  type="button"
                  onClick={() => setPanOffset({ x: 0, y: 0 })}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-bold transition-all select-none ml-2 cursor-pointer"
                  title={t("Reset view position", "Vynulovať pohľad", "Nézet visszaállítása")}
                >
                  <Move className="h-3.5 w-3.5 text-slate-500" />
                  <span>{panOffset.x !== 0 || panOffset.y !== 0 ? `Reset (${Math.round(panOffset.x)}, ${Math.round(panOffset.y)})` : t("Reset View", "Reset pohľadu", "Alaphelyzet")}</span>
                </button>
              </div>

              {/* SVG Connector Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {edges.map(edge => renderEdgeLine(edge))}
                
                {/* Temp dragging connection helper line */}
                {connectingSource && connectionMousePos && (() => {
                  const start = getHandleCoords(connectingSource.nodeId, "output", connectingSource.handleId);
                  const controlPointX = (start.x + connectionMousePos.x) / 2;
                  const d = `M ${start.x} ${start.y} C ${controlPointX} ${start.y}, ${controlPointX} ${connectionMousePos.y}, ${connectionMousePos.x} ${connectionMousePos.y}`;
                  return (
                    <path
                      d={d}
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth="2.5"
                      strokeDasharray="5,5"
                    />
                  );
                })()}
              </svg>

              {/* Interactive Edge Delete Buttons Layer */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {edges.map(edge => {
                  const start = getHandleCoords(edge.source, "output", edge.sourceHandle);
                  const end = getHandleCoords(edge.target, "input");
                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2;

                  return (
                    <button
                      key={`del-btn-${edge.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setEdges(edges.filter(ed => ed.id !== edge.id));
                        showToast(t("Connection removed", "Prepojenie bolo odstránené", "Kapcsolat törölve"));
                      }}
                      className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white border border-slate-300 shadow-md hover:border-rose-500 hover:bg-rose-500 text-slate-500 hover:text-white flex items-center justify-center transition-all cursor-pointer group select-none"
                      style={{ left: midX, top: midY }}
                      title={t("Remove Connection", "Odstrániť prepojenie", "Kapcsolat törlése")}
                    >
                      <span className="group-hover:hidden text-[10px] font-extrabold">✕</span>
                      <Trash2 className="hidden group-hover:block h-3.5 w-3.5 text-white" />
                    </button>
                  );
                })}
              </div>

              {/* Freeform draggable node cards */}
              <div className="absolute inset-0 z-0">
                {nodes.map(node => {
                  const isCollapsed = !!collapsedNodes[node.id];
                  return (
                    <div 
                      key={node.id}
                      id={node.id}
                      onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(node);
                      }}
                      className={`node-card absolute w-80 bg-white border-2 rounded-xl p-4 shadow-sm cursor-grab transition-all select-none ${
                        selectedNode?.id === node.id 
                          ? "border-purple-700 shadow-md ring-4 ring-purple-100" 
                          : "border-slate-200/80 hover:border-purple-300 hover:shadow"
                      }`}
                      style={{ 
                        left: node.x + panOffset.x, 
                        top: node.y + panOffset.y,
                        cursor: isPanning ? 'grabbing' : (draggedNodeId === node.id ? 'grabbing' : 'grab')
                      }}
                    >
                      {/* Node Inputs Handle Handle */}
                      {node.id !== "node-trigger" && (
                        <div 
                          className={`connection-handle absolute ${isCollapsed ? 'top-1/2' : 'top-[45px]'} left-0 -translate-x-1/2 -translate-y-1/2 h-5 px-1.5 rounded-full border-2 border-slate-200 bg-white hover:bg-purple-600 hover:border-purple-600 cursor-crosshair transition-all z-20 flex items-center justify-center text-[7px] font-extrabold text-slate-500 hover:text-white shadow-sm select-none`}
                          onClick={(e) => handleCompleteConnection(node.id, e)}
                          title={t("Connect Input", "Vstup", "Bemenet")}
                        >
                          IN
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {getNodeHeaderIcon(node.type)}
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">
                            {node.type === "trigger" ? t("Trigger", "Spúšťač", "Indító") :
                             node.type === "condition" ? t("Condition", "Podmienka", "Feltétel") :
                             node.type === "splitter" ? t("Splitter", "Rozdeľovač", "Osztó") :
                             node.type === "ai_agent" ? t("AI Agent", "AI Agent", "AI Ügynök") :
                             t("Action", "Akcia", "Akció")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => toggleNodeCollapse(node.id, e)}
                            className="p-1 text-slate-400 hover:text-purple-700 rounded hover:bg-purple-50 transition-colors"
                            title={isCollapsed ? t("Expand block", "Rozbaliť blok", "Kibontás") : t("Collapse block", "Zbaliť blok", "Összecsukás")}
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronUp className="h-3.5 w-3.5" />
                            )}
                          </button>
                          {node.id !== "node-trigger" && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeNode(node.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="font-bold text-slate-700 text-xs truncate">{node.name}</h4>

                      {/* Node Config forms directly inside the card if NOT collapsed */}
                      {!isCollapsed && (
                        <>
                          {node.type === "trigger" && (
                      <div className="space-y-2 mt-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Trigger Event", "Udalosť spúšťača", "Indító esemény")}</label>
                          <div className="relative mt-0.5" ref={triggerDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setIsTriggerDropdownOpen(!isTriggerDropdownOpen)}
                              className="w-full flex items-center justify-between px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:border-purple-300 focus:outline-none text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="p-1 rounded-md shrink-0 flex items-center justify-center"
                                  style={{ 
                                    backgroundColor: `${getModuleColor(triggerType)}15`, 
                                    color: getModuleColor(triggerType) 
                                  }}
                                >
                                  {getTriggerIcon(triggerType)}
                                </div>
                                <span className="font-semibold text-slate-750">{getTriggerLabel(triggerType)}</span>
                              </div>
                              <span className="text-slate-400 text-[9px] mr-1">▼</span>
                            </button>
                            {isTriggerDropdownOpen && (
                              <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-[999] max-h-80 overflow-y-auto border-purple-100 ring-4 ring-purple-50">
                                
                                {/* Group: Leads */}
                                <div className="px-3 py-1 text-[9px] font-extrabold text-blue-600 uppercase tracking-wider bg-blue-50/40 flex items-center gap-1 select-none">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  {t("Leads", "Leady", "Leadek")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("lead_created");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "lead_created" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                                      <UserPlus className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "lead_created" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Lead Created", "Vytvorený lead", "Lead létrehozva")}
                                    </span>
                                  </div>
                                  {triggerType === "lead_created" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("lead_status_changed");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "lead_status_changed" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                                      <Activity className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "lead_status_changed" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Lead Status Changed", "Zmena stavu leadu", "Lead státusz változott")}
                                    </span>
                                  </div>
                                  {triggerType === "lead_status_changed" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("lead_timeline_event");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "lead_timeline_event" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-blue-50 text-blue-600">
                                      <Layers className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "lead_timeline_event" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("New Timeline Event", "Nová udalosť na osi", "Új idővonali esemény")}
                                    </span>
                                  </div>
                                  {triggerType === "lead_timeline_event" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>

                                {/* Group: Clients */}
                                <div className="mt-1.5 px-3 py-1 text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider bg-emerald-50/40 flex items-center gap-1 select-none">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {t("Clients", "Klienti", "Ügyfelek")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("client_created");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "client_created" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-emerald-50 text-emerald-600">
                                      <Users className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "client_created" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Client Created", "Vytvorený klient", "Ügyfél létrehozva")}
                                    </span>
                                  </div>
                                  {triggerType === "client_created" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>

                                {/* Group: Tasks */}
                                <div className="mt-1.5 px-3 py-1 text-[9px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50/40 flex items-center gap-1 select-none">
                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                  {t("Tasks", "Úlohy", "Feladatok")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("task_created");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "task_created" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-orange-50 text-orange-600">
                                      <CheckSquare className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "task_created" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Task Created", "Vytvorená úloha", "Feladat létrehozva")}
                                    </span>
                                  </div>
                                  {triggerType === "task_created" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("task_status_changed");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "task_status_changed" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-orange-50 text-orange-600">
                                      <ClipboardList className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "task_status_changed" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Task Status Changed", "Zmena stavu úlohy", "Feladat státusz változott")}
                                    </span>
                                  </div>
                                  {triggerType === "task_status_changed" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>

                                {/* Group: System */}
                                <div className="mt-1.5 px-3 py-1 text-[9px] font-extrabold text-purple-600 uppercase tracking-wider bg-purple-50/40 flex items-center gap-1 select-none">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                  {t("System", "Systém", "Rendszer")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("timer");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "timer" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-amber-50 text-amber-600">
                                      <Clock className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "timer" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Timer Trigger (Cron)", "Časovač (Cron)", "Időzítő")}
                                    </span>
                                  </div>
                                  {triggerType === "timer" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTriggerType("manual");
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, type: "manual" } } : n));
                                    setIsTriggerDropdownOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded-md bg-purple-50 text-purple-600">
                                      <Zap className="h-3.5 w-3.5" />
                                    </div>
                                    <span className={triggerType === "manual" ? "font-bold text-slate-900" : "font-medium"}>
                                      {t("Manual Button Trigger", "Manuálny spúšťač", "Kézi indítás")}
                                    </span>
                                  </div>
                                  {triggerType === "manual" && <span className="text-purple-600 font-bold">✓</span>}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Trigger Filter: Lead Source */}
                        {triggerType === "lead_created" && (
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Filter Lead Source", "Filter zdroja leadu", "Lead forrás szűrő")}</label>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                                <Filter className="h-3.5 w-3.5 text-slate-400" />
                              </div>
                              <select
                                value={triggerConfig.leadSource || "any"}
                                onChange={(e) => setTriggerConfig({ ...triggerConfig, leadSource: e.target.value === "any" ? null : e.target.value })}
                                className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                              >
                                <option value="any">{t("Any Source", "Akýkoľvek zdroj", "Bármely forrás")}</option>
                                {leadSources.map(src => <option key={src} value={src}>{src}</option>)}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Trigger Filter: Lead Status Changed */}
                        {triggerType === "lead_status_changed" && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">From Status</label>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="p-1 bg-slate-50 border border-slate-100 rounded-md shrink-0 flex items-center justify-center">
                                  <Activity className="h-3 w-3 text-slate-400" />
                                </div>
                                <select
                                  value={triggerConfig.fromStatus || "any"}
                                  onChange={(e) => setTriggerConfig({ ...triggerConfig, fromStatus: e.target.value })}
                                  className="w-full px-1.5 py-0.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 bg-white focus:outline-none"
                                >
                                  <option value="any">Any</option>
                                  {leadStates.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">To Status</label>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="p-1 bg-slate-50 border border-slate-100 rounded-md shrink-0 flex items-center justify-center">
                                  <Activity className="h-3 w-3 text-slate-400" />
                                </div>
                                <select
                                  value={triggerConfig.toStatus || "any"}
                                  onChange={(e) => setTriggerConfig({ ...triggerConfig, toStatus: e.target.value })}
                                  className="w-full px-1.5 py-0.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 bg-white focus:outline-none"
                                >
                                  <option value="any">Any</option>
                                  {leadStates.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Trigger Filter: Timer */}
                        {triggerType === "timer" && (
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Interval (Minutes)", "Interval (Minúty)", "Időköz (perc)")}</label>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                              </div>
                              <input
                                type="number"
                                value={triggerConfig.interval_minutes || 60}
                                onChange={(e) => setTriggerConfig({ ...triggerConfig, interval_minutes: parseInt(e.target.value) || 60 })}
                                className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* Trigger Filter: Manual Trigger custom styling */}
                        {triggerType === "manual" && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
                            {/* Finite Palette of System Colors */}
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                {t("Button Color", "Farba tlačidla", "Gomb színe")}
                              </label>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {SYSTEM_COLORS.map(c => {
                                  const isSelected = (triggerConfig.buttonColor || "#6b21a8").toLowerCase() === c.hex.toLowerCase();
                                  return (
                                    <button
                                      key={c.name}
                                      type="button"
                                      onClick={() => setTriggerConfig({ ...triggerConfig, buttonColor: c.hex })}
                                      className={`h-5 w-5 rounded-full border border-black/10 flex items-center justify-center transition-all cursor-pointer hover:scale-110 shadow-xs ${
                                        isSelected ? "ring-2 ring-purple-600 ring-offset-1 scale-110" : ""
                                      }`}
                                      style={{ backgroundColor: c.hex }}
                                      title={c.name}
                                    >
                                      {isSelected && <span className="text-white text-[9px] font-extrabold select-none">✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Button Style & Icon Selector */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Style", "Štýl", "Stílus")}</label>
                                <select
                                  value={triggerConfig.buttonStyle || "full"}
                                  onChange={(e) => setTriggerConfig({ ...triggerConfig, buttonStyle: e.target.value })}
                                  className="w-full mt-0.5 px-2 py-1 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 bg-white focus:outline-none"
                                >
                                  <option value="full">Full</option>
                                  <option value="skeleton">Skeleton</option>
                                  <option value="icon_only">Icon Only</option>
                                </select>
                              </div>

                              {/* Rich Icon Selector with all system icons */}
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Button Icon", "Ikona tlačidla", "Gomb ikon")}</label>
                                <div className="relative mt-0.5" ref={iconPickerRef}>
                                  <button
                                    type="button"
                                    onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                                    className="w-full flex items-center justify-between px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:border-purple-300 focus:outline-none cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {renderIconByName(triggerConfig.buttonIcon || "Play", "h-3.5 w-3.5 text-purple-600")}
                                      <span className="text-[10px] font-bold">{triggerConfig.buttonIcon || "Play"}</span>
                                    </div>
                                    <ChevronDown className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
                                  </button>

                                  {/* Icon Picker Popover */}
                                  {isIconPickerOpen && (
                                    <div className="absolute left-0 right-0 top-full mt-1 w-64 p-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[999] border-purple-100 ring-4 ring-purple-50 animate-in fade-in-50 zoom-in-95">
                                      <div className="relative mb-2">
                                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                          type="text"
                                          value={iconSearchQuery}
                                          onChange={(e) => setIconSearchQuery(e.target.value)}
                                          placeholder={t("Search icons...", "Hľadať ikonu...", "Ikon keresése...")}
                                          className="w-full pl-7 pr-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none"
                                          autoFocus
                                        />
                                      </div>
                                      
                                      <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                                        {Object.keys(ALL_ICONS_MAP)
                                          .filter(iconName => iconName.toLowerCase().includes(iconSearchQuery.toLowerCase()))
                                          .map(iconName => {
                                            const isSelected = (triggerConfig.buttonIcon || "Play") === iconName;
                                            return (
                                              <button
                                                key={iconName}
                                                type="button"
                                                onClick={() => {
                                                  setTriggerConfig({ ...triggerConfig, buttonIcon: iconName });
                                                  setIsIconPickerOpen(false);
                                                  setIconSearchQuery("");
                                                }}
                                                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                                  isSelected 
                                                    ? "bg-purple-100 text-purple-700 border border-purple-300 font-bold scale-105 shadow-xs" 
                                                    : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                                                }`}
                                                title={iconName}
                                              >
                                                {renderIconByName(iconName, "h-4 w-4")}
                                              </button>
                                            );
                                          })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {node.type === "condition" && (
                      <div className="mt-2 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("JS Expression", "JS výraz", "JS kifejezés")}</label>
                        <div className="flex items-start gap-2 mt-0.5">
                          <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center mt-0.5">
                            <Code className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                          <textarea
                            value={node.data.js_code || ""}
                            onChange={(e) => {
                              const updatedNodes = nodes.map(n => {
                                if (n.id === node.id) {
                                  return { ...n, data: { ...n.data, js_code: e.target.value } };
                                }
                                return n;
                              });
                              setNodes(updatedNodes);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 h-16 bg-white resize-none focus:outline-none"
                            placeholder="return $input.status === 'won';"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === "splitter" && (
                      <div className="mt-2 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Array Path", "Cesta k poľu", "Tömb útvonal")}</label>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                            <Layers className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                          <input
                            type="text"
                            value={node.data.array_path || ""}
                            onChange={(e) => {
                              const updatedNodes = nodes.map(n => {
                                if (n.id === node.id) {
                                  return { ...n, data: { ...n.data, array_path: e.target.value } };
                                }
                                return n;
                              });
                              setNodes(updatedNodes);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                            placeholder="e.g. leads"
                          />
                        </div>
                      </div>
                    )}

                    {node.type === "ai_agent" && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">AI Provider</label>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                              <Bot className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <select
                              value={node.data.provider || "gemini"}
                              onChange={(e) => {
                                const updatedNodes = nodes.map(n => {
                                  if (n.id === node.id) {
                                    return { ...n, data: { ...n.data, provider: e.target.value } };
                                  }
                                  return n;
                                });
                                setNodes(updatedNodes);
                              }}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                            >
                              <option value="gemini">Gemini</option>
                              <option value="openai">OpenAI</option>
                              <option value="anthropic">Anthropic</option>
                            </select>
                          </div>
                        </div>
                        <VariableInputField
                          label="Prompt"
                          value={node.data.prompt || ""}
                          onChange={(val) => {
                            const updatedNodes = nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, prompt: val } } : n);
                            setNodes(updatedNodes);
                          }}
                          placeholder="Summarize this lead: {{$trigger.name}}"
                          icon={<Brain className="h-3.5 w-3.5 text-slate-400" />}
                          multiline={true}
                          nodes={nodes}
                          currentNodeId={node.id}
                        />
                      </div>
                    )}

                    {node.type === "action" && (() => {
                      const updateActionField = (field: string, value: any) => {
                        const updatedNodes = nodes.map(n => {
                          if (n.id === node.id) {
                            return { ...n, data: { ...n.data, [field]: value } };
                          }
                          return n;
                        });
                        setNodes(updatedNodes);
                      };

                      return (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-1.5 select-none mb-2 pb-1.5 border-b border-slate-100">
                            {getActionIcon(node.data.type)}
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                              {node.data.type === "create_lead" ? t("Create Lead", "Vytvoriť lead", "Lead") :
                               node.data.type === "create_task" ? t("Create Task", "Vytvoriť úlohu", "Feladat") :
                               node.data.type === "send_email" ? t("Send Email", "Odoslať e-mail", "E-mail") :
                               node.data.type === "create_client" ? t("Create Client", "Vytvoriť klienta", "Ügyfél") : ""}
                            </span>
                          </div>

                          {node.data.type === "create_lead" && (
                            <div className="space-y-2">
                              <VariableInputField
                                label={t("Lead Name", "Meno leadu", "Lead neve")}
                                value={node.data.name || ""}
                                onChange={(val) => updateActionField("name", val)}
                                placeholder="e.g. {{$trigger.name}}"
                                icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <VariableInputField
                                label={t("City", "Mesto", "Város")}
                                value={node.data.city || ""}
                                onChange={(val) => updateActionField("city", val)}
                                placeholder="e.g. {{$trigger.city}}"
                                icon={<Filter className="h-3.5 w-3.5 text-slate-400" />}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                                    <Activity className="h-3.5 w-3.5 text-slate-400" />
                                  </div>
                                  <select
                                    value={node.data.status || "new"}
                                    onChange={(e) => updateActionField("status", e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                                  >
                                    {leadStates.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}

                          {node.data.type === "create_task" && (
                            <div className="space-y-2">
                              <VariableInputField
                                label={t("Task Title", "Názov úlohy", "Feladat neve")}
                                value={node.data.title || ""}
                                onChange={(val) => updateActionField("title", val)}
                                placeholder="e.g. Follow up with {{$trigger.name}}"
                                icon={<CheckSquare className="h-3.5 w-3.5 text-slate-400" />}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <VariableInputField
                                label={t("Task Description", "Popis úlohy", "Feladat leírása")}
                                value={node.data.description || ""}
                                onChange={(val) => updateActionField("description", val)}
                                placeholder="e.g. Contact lead {{$trigger.name}} regarding quote"
                                icon={<FileText className="h-3.5 w-3.5 text-slate-400" />}
                                multiline={true}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="p-1 bg-slate-50 border border-slate-100 rounded-md shrink-0 flex items-center justify-center">
                                      <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <select
                                      value={node.data.priority || "medium"}
                                      onChange={(e) => updateActionField("priority", e.target.value)}
                                      className="w-full px-1.5 py-0.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 bg-white focus:outline-none"
                                    >
                                      <option value="low">Low</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">High</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                    {t("Deadline (Days)", "Termín (dni)", "Határidő (nap)")}
                                    <Info
                                      className="h-2.5 w-2.5 text-slate-300 cursor-help shrink-0"
                                      title={t(
                                        "The task's due date is set automatically to today + this many days",
                                        "Termín úlohy sa automaticky nastaví na dnešný deň + tento počet dní",
                                        "A feladat határideje automatikusan a mai nap + ennyi napra lesz beállítva"
                                      )}
                                    />
                                  </label>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="p-1 bg-slate-50 border border-slate-100 rounded-md shrink-0 flex items-center justify-center">
                                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <input
                                      type="number"
                                      value={node.data.deadline_days || 2}
                                      onChange={(e) => updateActionField("deadline_days", parseInt(e.target.value) || 2)}
                                      className="w-full px-1.5 py-0.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 focus:outline-none"
                                    />
                                  </div>
                                </div>
                                {/* Without a time the task lands on the calendar
                                    with no hour and sorts above every timed entry. */}
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Time", "Čas", "Időpont")}</label>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="p-1 bg-slate-50 border border-slate-100 rounded-md shrink-0 flex items-center justify-center">
                                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <input
                                      type="time"
                                      value={node.data.deadline_time || ""}
                                      onChange={(e) => updateActionField("deadline_time", e.target.value)}
                                      className="w-full px-1.5 py-0.5 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-0.5">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t("Assignee", "Poverená osoba", "Felelős")}</label>
                                  {users.length > 0 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          updateActionField("owner", e.target.value);
                                        }
                                      }}
                                      className="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded cursor-pointer border-none"
                                    >
                                      <option value="">{t("Select User...", "Vybrať používateľa...", "Kiválasztás...")}</option>
                                      {users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                                    </select>
                                  )}
                                </div>
                                <VariableInputField
                                  label=""
                                  value={node.data.owner || ""}
                                  onChange={(val) => updateActionField("owner", val)}
                                  placeholder="e.g. Erik or {{$trigger.owner}}"
                                  icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                                  nodes={nodes}
                                  currentNodeId={node.id}
                                />
                              </div>
                            </div>
                          )}

                          {node.data.type === "send_email" && (
                            <div className="space-y-2">
                              <VariableInputField
                                label={t("Recipient Email", "Príjemca e-mailu", "Címzett e-mail")}
                                value={node.data.to || ""}
                                onChange={(val) => updateActionField("to", val)}
                                placeholder="e.g. {{$trigger.email}}"
                                icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <VariableInputField
                                label={t("Subject", "Predmet", "Tárgy")}
                                value={node.data.subject || ""}
                                onChange={(val) => updateActionField("subject", val)}
                                placeholder="e.g. Welcome {{$trigger.name}}"
                                icon={<Mail className="h-3.5 w-3.5 text-slate-400" />}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                              <VariableInputField
                                label={t("Body", "Telo e-mailu", "E-mail törzse")}
                                value={node.data.body || ""}
                                onChange={(val) => updateActionField("body", val)}
                                placeholder="Hello {{$trigger.name}}..."
                                icon={<ClipboardList className="h-3.5 w-3.5 text-slate-400" />}
                                multiline={true}
                                nodes={nodes}
                                currentNodeId={node.id}
                              />
                            </div>
                          )}

                          {node.data.type === "create_client" && (
                            <div className="space-y-2.5">
                              {/* Name */}
                              <VariableInputField
                                label={t("Client Name", "Meno klienta", "Ügyfél neve")}
                                value={node.data.name || ""}
                                onChange={(val) => updateActionField("name", val)}
                                placeholder="e.g. Acme Corp / {{$trigger.name}}"
                                icon={<User className="h-3.5 w-3.5 text-slate-400" />}
                              />

                              {/* Client Type */}
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                  {t("Client Type", "Typ klienta", "Ügyfél típusa")}
                                </label>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 flex items-center justify-center">
                                    <Users className="h-3.5 w-3.5 text-slate-400" />
                                  </div>
                                  <select
                                    value={node.data.client_type || "business"}
                                    onChange={(e) => updateActionField("client_type", e.target.value)}
                                    className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none"
                                  >
                                    <option value="business">Business / Firma</option>
                                    <option value="person">Person / Súkromná osoba</option>
                                    <option value="partner">Partner / Obchodný partner</option>
                                  </select>
                                </div>
                              </div>

                              {/* Phone & Email */}
                              <div className="grid grid-cols-2 gap-2">
                                <VariableInputField
                                  label={t("Email", "E-mail", "E-mail")}
                                  value={node.data.email || ""}
                                  onChange={(val) => updateActionField("email", val)}
                                  placeholder="client@email.com"
                                  icon={<Mail className="h-3.5 w-3.5 text-slate-400" />}
                                />
                                <VariableInputField
                                  label={t("Phone", "Telefón", "Telefon")}
                                  value={node.data.phone || ""}
                                  onChange={(val) => updateActionField("phone", val)}
                                  placeholder="+421 900..."
                                  icon={<Phone className="h-3.5 w-3.5 text-slate-400" />}
                                />
                              </div>

                              {/* Street */}
                              <VariableInputField
                                label={t("Street", "Ulica", "Utca")}
                                value={node.data.street || ""}
                                onChange={(val) => updateActionField("street", val)}
                                placeholder="Mlynské Nivy 42"
                                icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
                              />

                              {/* City & Postal Code */}
                              <div className="grid grid-cols-2 gap-2">
                                <VariableInputField
                                  label={t("City", "Mesto", "Város")}
                                  value={node.data.city || ""}
                                  onChange={(val) => updateActionField("city", val)}
                                  placeholder="Bratislava"
                                />
                                <VariableInputField
                                  label={t("Postal Code", "PSČ", "Irányítószám")}
                                  value={node.data.postal_code || ""}
                                  onChange={(val) => updateActionField("postal_code", val)}
                                  placeholder="821 09"
                                />
                              </div>

                              {/* Country */}
                              <VariableInputField
                                label={t("Country", "Krajina", "Ország")}
                                value={node.data.country || "Slovensko"}
                                onChange={(val) => updateActionField("country", val)}
                                placeholder="Slovensko"
                              />

                              {/* Corporate Registries: IČO / DIČ / IČ DPH */}
                              <div className="border-t border-slate-100 pt-2 space-y-2">
                                <span className="text-[9px] font-extrabold text-purple-600 uppercase tracking-wider block">
                                  {t("Company Details", "Firemné údaje", "Cégadatok")}
                                </span>
                                <div className="grid grid-cols-2 gap-2">
                                  <VariableInputField
                                    label={t("IČO / Company ID", "IČO", "Cégjegyzékszám")}
                                    value={node.data.company_id || node.data.ico || ""}
                                    onChange={(val) => updateActionField("company_id", val)}
                                    placeholder="12345678"
                                    icon={<Briefcase className="h-3.5 w-3.5 text-slate-400" />}
                                  />
                                  <VariableInputField
                                    label={t("DIČ / Tax ID", "DIČ", "Adószám")}
                                    value={node.data.tax_id || node.data.dic || ""}
                                    onChange={(val) => updateActionField("tax_id", val)}
                                    placeholder="2021234567"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <VariableInputField
                                    label={t("IČ DPH / VAT ID", "IČ DPH", "EU Adószám")}
                                    value={node.data.vat_id || node.data.ic_dph || ""}
                                    onChange={(val) => updateActionField("vat_id", val)}
                                    placeholder="SK2021234567"
                                  />
                                  <VariableInputField
                                    label={t("Contact Person", "Kontaktná osoba", "Kapcsolattartó")}
                                    value={node.data.contact_person || ""}
                                    onChange={(val) => updateActionField("contact_person", val)}
                                    placeholder="Ján Novák"
                                  />
                                </div>
                                <VariableInputField
                                  label={t("Website", "Webstránka", "Weboldal")}
                                  value={node.data.website || ""}
                                  onChange={(val) => updateActionField("website", val)}
                                  placeholder="https://acme.com"
                                  icon={<Globe className="h-3.5 w-3.5 text-slate-400" />}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}

                    {/* Node Outputs Handles */}
                    {node.type === "condition" ? (
                      <>
                        {/* True handle */}
                        <div 
                          className={`connection-handle absolute ${isCollapsed ? 'top-1/2' : 'top-[45px]'} right-0 translate-x-1/2 -translate-y-1/2 h-5 px-1 rounded-full border-2 border-emerald-200 bg-white hover:bg-emerald-600 hover:border-emerald-600 cursor-crosshair transition-all z-20 flex items-center justify-center text-[7px] font-extrabold text-emerald-600 hover:text-white shadow-sm select-none`}
                          onClick={(e) => handleStartConnection(node.id, "true", e)}
                          title={t("True branch", "Pravda", "Igaz")}
                        >
                          TRUE
                        </div>
                        {/* False handle */}
                        <div 
                          className={`connection-handle absolute ${isCollapsed ? 'top-1/2' : 'top-[80px]'} right-0 translate-x-1/2 -translate-y-1/2 h-5 px-1 rounded-full border-2 border-rose-200 bg-white hover:bg-rose-600 hover:border-rose-600 cursor-crosshair transition-all z-20 flex items-center justify-center text-[7px] font-extrabold text-rose-600 hover:text-white shadow-sm select-none`}
                          onClick={(e) => handleStartConnection(node.id, "false", e)}
                          title={t("False branch", "Nepravda", "Hamis")}
                        >
                          FALSE
                        </div>
                      </>
                    ) : (
                      <div 
                        className={`connection-handle absolute ${isCollapsed ? 'top-1/2' : 'top-[45px]'} right-0 translate-x-1/2 -translate-y-1/2 h-5 px-1.5 rounded-full border-2 border-purple-200 bg-white hover:bg-purple-600 hover:border-purple-600 cursor-crosshair transition-all z-20 flex items-center justify-center text-[7px] font-extrabold text-purple-600 hover:text-white shadow-sm select-none`}
                        onClick={(e) => handleStartConnection(node.id, undefined, e)}
                        title={t("Connect Output", "Výstup", "Kimenet")}
                      >
                        OUT
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>

            {/* Sidebar properties editor panel */}
            <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden shrink-0">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Sliders className="h-4.5 w-4.5 text-purple-600" />
                  {t("Workflow Properties", "Vlastnosti workflow", "Munkafolyamat tulajdonságok")}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* General Config */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">{t("Workflow Name", "Názov workflow", "Munkafolyamat név")}</label>
                    <input 
                      type="text" 
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      placeholder="e.g. New Website Lead Nurture"
                      className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">{t("Description", "Popis", "Leírás")}</label>
                    <textarea 
                      value={workflowDesc}
                      onChange={(e) => setWorkflowDesc(e.target.value)}
                      placeholder="What does this workflow do?"
                      className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 h-20 resize-none focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                    />
                  </div>
                </div>

                {/* Node-specific configurations help */}
                {selectedNode && (
                  <div className="border-t border-slate-100 pt-6 space-y-4">
                    <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider text-purple-700">
                      {t("Selected Node:", "Vybraný uzol:", "Kiválasztott csomópont:")} {selectedNode.name}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {t(
                        "All node properties and settings are now editable directly inside the card itself on the canvas.",
                        "Všetky vlastnosti a nastavenia uzla sú teraz upraviteľné priamo vo vnútri karty na plátne.",
                        "Minden csomópont tulajdonság és beállítás most már közvetlenül a kártyán belül szerkeszthető a vásznon."
                      )}
                    </p>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t("Canvas Tips", "Tipy na plátne", "Tippek")}</h5>
                      <ul className="list-disc pl-4 text-[10px] text-slate-500 space-y-1 font-semibold">
                        <li>{t("Drag nodes by their header or background.", "Presúvajte uzly ťahaním za hlavičku alebo pozadie.", "Húzza a csomópontokat a fejlécüknél vagy a hátterüknél fogva.")}</li>
                        <li>{t("Click any output circle, then click an input circle to connect nodes.", "Kliknite na výstupný krúžok, potom na vstupný krúžok pre prepojenie.", "Kattintson egy kimeneti körre, majd egy bemeneti körre a csatlakozáshoz.")}</li>
                        <li>{t("Click any connection line to delete it.", "Pre vymazanie prepojenia naň kliknite.", "Kattintson bármelyik kapcsolódási vonalra a törléséhez.")}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Editor bottom save bar */}
              <div className="p-6 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("list")}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors text-xs font-heading font-bold uppercase tracking-wider cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="button"
                  onClick={saveWorkflow}
                  className="px-5 py-3 rounded-2xl bg-[#0b1329] text-white hover:bg-slate-900 shadow-md shadow-[#0b1329]/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95"
                >
                  {t("Save Workflow", "Uložiť workflow", "Mentés")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EXECUTION LOGS & DEBUGGER */}
        {activeTab === "logs" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col">
                <h2 className="text-lg font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-purple-600" />
                  {t("Execution Logs & Runs for:", "Záznamy o spustení pre:", "Futási naplók:")} {selectedWorkflow?.name}
                </h2>
                <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
                  {t("Track automation runs and visually debug each step payload", "Sledujte behy a debugujte JSON payload každého kroku", "Kövesse nyomon a futásokat és debugolja a lépéseket")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={triggerManualRun}
                  className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-heading font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  {t("Trigger Test Run", "Spustiť testovací beh", "Teszt futás indítása")}
                </button>
                <button
                  type="button"
                  onClick={() => handleViewLogs(selectedWorkflow)}
                  title={t("Refresh", "Obnoviť", "Frissítés")}
                  className="p-2.5 border border-slate-200 bg-white rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
              {/* Runs List */}
              <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden flex flex-col h-full">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 font-heading font-extrabold text-[10px] text-slate-400 uppercase tracking-widest">
                  {t("Run History", "História spustení", "Futási előzmények")}
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 font-medium">
                      {t("No runs logged yet.", "Zatiaľ žiadne záznamy.", "Nincsenek futások.")}
                    </div>
                  ) : (
                    logs.map(log => (
                      <div 
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between ${
                          selectedLog?.id === log.id ? "bg-purple-50 hover:bg-purple-50" : ""
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${
                              log.status === "success" ? "bg-emerald-500" : "bg-rose-500"
                            }`} />
                            <span className="text-xs font-bold text-slate-700 font-mono">{log.id.substring(4, 12)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold block">{log.created_at}</span>
                        </div>
                        <div className="text-right space-y-1">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}>
                            {log.status}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">{log.execution_time_ms} ms</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Visual Execution Step Trace / Debugger */}
              <div className="lg:col-span-2 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden flex flex-col h-full">
                <div className="p-4 bg-slate-50/80 border-b border-slate-200 font-heading font-extrabold text-[10px] text-slate-400 uppercase tracking-widest flex items-center justify-between">
                  <span>{t("Visual Debugger Trace", "Vizualizácia behu", "Vizuális nyomkövető")}</span>
                  {selectedLog && (
                    <span className="text-[10px] font-mono text-slate-400">{selectedLog.id}</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {!selectedLog ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs font-medium">
                      <Terminal className="h-8 w-8 mb-2 text-slate-300" />
                      {t("Select a run to view execution trace details.", "Vyberte beh pre zobrazenie detailov.", "Válasszon egy futást a részletekhez.")}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedLog.execution_log?.map((step: any, index: number) => (
                        <div key={index} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className={`p-3 flex items-center justify-between border-b ${
                            step.success ? "bg-emerald-50/50 border-emerald-100" : "bg-rose-50/50 border-rose-100"
                          }`}>
                            <div className="flex items-center gap-2">
                              {step.success ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600" />
                              )}
                              <span className="text-xs font-bold text-slate-700">{step.node_name}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 font-extrabold uppercase px-1.5 py-0.5 rounded">{step.type}</span>
                            </div>
                            {!step.success && (
                              <span className="text-xs font-bold text-rose-700">{t("FAILED", "ZLYHALO", "HIBA")}</span>
                            )}
                          </div>
                          <div className="p-4 grid grid-cols-2 gap-4 bg-slate-50/50">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Input Data</span>
                              <pre className="text-[10px] font-mono bg-white p-2.5 border border-slate-200 rounded-lg max-h-36 overflow-auto text-slate-600">
                                {JSON.stringify(step.input, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Output Data</span>
                              <pre className="text-[10px] font-mono bg-white p-2.5 border border-slate-200 rounded-lg max-h-36 overflow-auto text-slate-600">
                                {JSON.stringify(step.output, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AUTOMATION MODULE CONFIG / KEYS */}
        {activeTab === "settings" && (
          <div className="max-w-2xl space-y-6">
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass p-6 sm:p-8">
              <h2 className="text-lg font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Settings className="h-5 w-5 text-purple-600" />
                {t("Automation Integration Keys", "Integračné kľúče pre automatizácie", "Integrációs kulcsok")}
              </h2>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1 mb-6">{t("Configure API keys for AI processors and copy background execution Cron URLs.", "Nastavte API kľúče pre AI a skopírujte Cron URL časovača.", "Konfigurálja az API kulcsokat és a Cron URL-t.")}</p>

              <form onSubmit={saveSettings} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">OpenAI API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.openAiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, openAiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Anthropic API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.anthropicKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, anthropicKey: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Gemini API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.geminiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, geminiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Cron Endpoint Token</label>
                  <div className="flex gap-2 mt-1.5">
                    <input 
                      type="text" 
                      value={apiKeys.cronToken}
                      onChange={(e) => setApiKeys({ ...apiKeys, cronToken: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none"
                    />
                    <button 
                      type="button"
                      onClick={() => setApiKeys({ ...apiKeys, cronToken: Math.random().toString(36).substring(2, 18) })}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600"
                    >
                      {t("Regenerate", "Regenerovať", "Újra előállít")}
                    </button>
                  </div>
                </div>

                {/* Cron integration link setup instructions */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">{t("Cron Webhook Link", "Cron Webhook Link", "Cron Webhook Link")}</span>
                    <button 
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(cronUrl);
                        showToast(t("Copied to clipboard!", "Skopírované do schránky!", "Másolva a vágólapra!"));
                      }}
                      className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      {t("Copy URL", "Kopírovať", "Másolás")}
                    </button>
                  </div>
                  <code className="text-[10px] font-mono block break-all bg-white p-2.5 border border-slate-200 rounded text-slate-600">
                    {cronUrl}
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    {t(
                      "To execute timer events and run queued workflows, configure a crontab schedule on your host server to query this webhook endpoint every minute: e.g. * * * * * curl -s 'URL'",
                      "Pre spúšťanie časovačov a spracovanie frontu, nastavte crontab na serveri každú minútu: napr. * * * * * curl -s 'URL'",
                      "A munkafolyamatok ütemezéséhez állítson be cron feladatot a fenti címmel percenként."
                    )}
                  </p>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-3 rounded-2xl bg-[#0b1329] text-white hover:bg-slate-900 shadow-md shadow-[#0b1329]/20 transition-all font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {savingSettings ? t("Saving...", "Ukladám...", "Mentés...") : t("Save API Keys", "Uložiť API kľúče", "Kulcsok mentése")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
