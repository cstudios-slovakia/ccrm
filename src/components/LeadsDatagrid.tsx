import React, { useState, useMemo, useEffect } from "react";
import { 
  Users, MapPin, Plus, Search, Trash2, 
  Clock, User, Briefcase, Handshake, 
  X, Tag, Euro, UserCheck, Share2, TableProperties,
  Edit3, Check, Layers, SlidersHorizontal,
  ArrowLeft, PencilLine, Phone, Mail, Globe,
  Calendar, FolderOpen, FileText, Minimize2, CheckSquare, Lock
} from "lucide-react";
import type { Lead, TimelineEvent, Task, UserProfile } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface LeadsDatagridProps {
  systemName: string;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  leadStates: string[];
  leadSources: string[];
  projectManagers: string[];
  leadStateColors: Record<string, string>;
  initialSelectedLeadId?: string;
  projectManagerColors?: Record<string, string>;
  leadCategories?: string[];
  leadSourceColors?: Record<string, string>;
  leadCategoryColors?: Record<string, string>;
  systemLanguage: Language;
  leadStateParents: Record<string, string>;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  users: UserProfile[];
}

export const LeadsDatagrid: React.FC<LeadsDatagridProps> = ({
  systemName,
  leads,
  setLeads,
  leadStates,
  leadSources,
  projectManagers,
  leadStateColors,
  initialSelectedLeadId,
  projectManagerColors = {},
  leadCategories = [],
  leadSourceColors = {},
  leadCategoryColors = {},
  systemLanguage,
  leadStateParents,
  tasks,
  setTasks,
  users: _users
}) => {
  const getSafeStateColor = (stateName: string) => {
    if (!leadStateColors) return "#64748b";
    const key = (stateName || "").toLowerCase();
    return leadStateColors[key] || "#64748b";
  };

  const StatusSelector: React.FC<{
    status: string;
    onChange: (newStatus: string) => void;
    isEditing?: boolean;
  }> = ({ status, onChange, isEditing = true }) => {
    const sName = (status || "").toLowerCase();
    const activeMain = leadStateParents[sName] || sName;
    const hasSubstates = leadStates.some(s => leadStateParents[s.toLowerCase()] === activeMain);
    const activeSubstates = leadStates.filter(s => leadStateParents[s.toLowerCase()] === activeMain);
    const currentSub = leadStateParents[sName] ? sName : "";
    
    const mainColor = getSafeStateColor(activeMain);
    const subColor = currentSub ? getSafeStateColor(currentSub) : mainColor;

    const handleMainChange = (newMain: string) => {
      onChange(newMain);
    };

    const handleSubChange = (newSub: string) => {
      if (newSub) {
        onChange(newSub);
      } else {
        onChange(activeMain);
      }
    };

    const majorStates = leadStates.filter(s => !leadStateParents[s.toLowerCase()]);

    if (!isEditing) {
      if (leadStateParents[sName]) {
        return (
          <span 
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase border shadow-sm text-white select-none leading-none tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${mainColor}, ${subColor})`,
              borderColor: "transparent"
            }}
          >
            {leadStateParents[sName].toUpperCase()} &gt; {sName.toUpperCase()}
          </span>
        );
      } else {
        return (
          <span 
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase border shadow-sm text-white select-none leading-none tracking-wider"
            style={{
              backgroundColor: mainColor,
              borderColor: mainColor
            }}
          >
            {sName.toUpperCase()}
          </span>
        );
      }
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5 justify-center lg:justify-start">
        {/* Main Dropdown */}
        <select
          value={activeMain}
          onChange={(e) => handleMainChange(e.target.value)}
          className="text-[9px] font-black uppercase tracking-wider border rounded-xl px-2.5 py-1 focus:outline-none focus:ring-1 transition-all cursor-pointer shadow-sm animate-fade-in"
          style={{
            backgroundColor: `${mainColor}18`,
            color: mainColor,
            borderColor: `${mainColor}35`
          }}
        >
          {majorStates.map(state => (
            <option key={state} value={state.toLowerCase()}>
              {state}
            </option>
          ))}
        </select>

        {/* Substate Dropdown */}
        {hasSubstates && (
          <select
            value={currentSub}
            onChange={(e) => handleSubChange(e.target.value)}
            className="text-[9px] font-black uppercase tracking-wider border rounded-xl px-2.5 py-1 focus:outline-none focus:ring-1 transition-all cursor-pointer shadow-sm animate-fade-in"
            style={{
              background: currentSub ? `linear-gradient(to right, ${mainColor}18, ${subColor}18)` : `${mainColor}10`,
              color: subColor,
              borderColor: `${subColor}30`
            }}
          >
            <option value="">{systemLanguage === "sk" ? "-- Žiadny podstav --" : systemLanguage === "hu" ? "-- Nincs al-állapot --" : "-- No Substate --"}</option>
            {activeSubstates.map(sub => (
              <option key={sub} value={sub.toLowerCase()}>
                ↳ {sub}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  const getSafePMColor = (pmName: string) => {
    if (!projectManagerColors) return "#64748b";
    const name = pmName || "";
    if (projectManagerColors[name]) return projectManagerColors[name];
    const lowerKey = Object.keys(projectManagerColors).find(k => k.toLowerCase() === name.toLowerCase());
    if (lowerKey) return projectManagerColors[lowerKey];
    return "#64748b";
  };

  const getSafeSourceColor = (sourceName: string) => {
    if (!leadSourceColors) return "#10b981";
    const key = (sourceName || "").toLowerCase();
    return leadSourceColors[key] || "#10b981";
  };

  const getSafeCategoryColor = (catName: string) => {
    if (!leadCategoryColors) return "#6366f1";
    return leadCategoryColors[catName] || "#6366f1";
  };

  // Hover state for rendering responsive state progress bars on list rows
  const [hoveredLeadId, setHoveredLeadId] = useState<string | null>(null);
  
  // Hover state for the detail view left card progress bar
  const [hoveredDetailTimeline, setHoveredDetailTimeline] = useState<boolean>(false);

  // View mode switcher: list (default) or kanban
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    const stored = sessionStorage.getItem("crm_leads_view_mode");
    return (stored === "kanban" || stored === "list") ? stored : "list";
  });

  useEffect(() => {
    sessionStorage.setItem("crm_leads_view_mode", viewMode);
  }, [viewMode]);

  // Compact mode switcher
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    return sessionStorage.getItem("crm_leads_compact_mode") === "true";
  });

  useEffect(() => {
    sessionStorage.setItem("crm_leads_compact_mode", String(compactMode));
  }, [compactMode]);

  // Multiple sorting and grouping versions
  const [orderingMode, setOrderingMode] = useState<"state" | "pm" | "created_newest" | "created_oldest" | "size" | "rating">(() => {
    const stored = sessionStorage.getItem("crm_leads_ordering_mode");
    return (stored === "state" || stored === "pm" || stored === "created_newest" || stored === "created_oldest" || stored === "size" || stored === "rating") ? stored : "state";
  });

  useEffect(() => {
    sessionStorage.setItem("crm_leads_ordering_mode", orderingMode);
  }, [orderingMode]);

  const cellPy = compactMode ? "py-0.5 lg:py-1" : "py-1.5 lg:py-3";
  const nameCellPy = compactMode ? "py-1 lg:py-1.5" : "py-1.5 lg:py-3";

  // Kanban Drag and Drop States
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Filters and Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedType, setSelectedType] = useState("all");

  // Collapsible Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("all");
  const [selectedCity, setSelectedCity] = useState("all");

  // Extract unique cities dynamically from database
  const uniqueCities = useMemo(() => {
    const cities = leads.map(l => (l.city || "").trim()).filter(Boolean);
    return Array.from(new Set(cities));
  }, [leads]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return selectedOwner !== "all" || 
      selectedCity !== "all" || 
      selectedSource !== "all" || 
      selectedType !== "all" || 
      selectedState !== "all";
  }, [selectedOwner, selectedCity, selectedSource, selectedType, selectedState]);

  // Create Lead modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadCity, setNewLeadCity] = useState("");
  const [newLeadType, setNewLeadType] = useState<"person" | "business" | "partner">("person");
  const [newLeadValue, setNewLeadValue] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("");
  const [newLeadOwner, setNewLeadOwner] = useState("");
  const [newLeadRating, setNewLeadRating] = useState(3);
  const [newLeadCategories, setNewLeadCategories] = useState<string[]>([]);

  const [clientMode, setClientMode] = useState<"existing" | "new">("new");
  const [selectedExistingClient, setSelectedExistingClient] = useState("");

  const existingClients = useMemo(() => {
    const profiles: Record<string, { name: string; city: string; clientType: "person" | "business" | "partner" }> = {};
    leads.forEach(lead => {
      const key = lead.name.trim().toLowerCase();
      if (key && !profiles[key]) {
        profiles[key] = {
          name: lead.name.trim(),
          city: lead.city || "",
          clientType: lead.clientType || "person"
        };
      }
    });
    return Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const handleSelectExistingClient = (clientName: string) => {
    setSelectedExistingClient(clientName);
    const found = existingClients.find(c => c.name === clientName);
    if (found) {
      setNewLeadName(found.name);
      setNewLeadCity(found.city);
      setNewLeadType(found.clientType);
    }
  };

  // --- DUAL EDIT MODE STATE ---
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineCity, setInlineCity] = useState("");
  const [inlineType, setInlineType] = useState<"person" | "business" | "partner">("person");
  const [inlineValue, setInlineValue] = useState("");
  const [inlineSource, setInlineSource] = useState("");
  const [inlineOwner, setInlineOwner] = useState("");



  // Graph states (Unused)
  // const [graphTab] = useState<"DEV" | "DESIGN" | "PM">("PM");
  // const [complexityWeighting] = useState(false);

  // Client slideout state (when clicking client name in Leads list)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editClientCity, setEditClientCity] = useState("");
  const [editClientType, setEditClientType] = useState<"person" | "business" | "partner">("person");
  const [editClientSource, setEditClientSource] = useState("");
  const [editClientOwner, setEditClientOwner] = useState("");

  // --- LEAD DETAIL VIEW STATES ---
  const activeLead = useMemo(() => {
    if (!initialSelectedLeadId) return null;
    return leads.find(l => l.id === initialSelectedLeadId) || null;
  }, [leads, initialSelectedLeadId]);

  const [isEditingLead, setIsEditingLead] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [leadOwner, setLeadOwner] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadRating, setLeadRating] = useState(3);
  const [leadCity, setLeadCity] = useState("");
  const [leadClientType, setLeadClientType] = useState<"person" | "business" | "partner">("person");
  const [leadSelectedCategories, setLeadSelectedCategories] = useState<string[]>([]);

  // Sync state with active lead
  useEffect(() => {
    if (activeLead) {
      setLeadName(activeLead.name);
      setLeadValue(activeLead.value.toString());
      setLeadOwner(activeLead.owner);
      setLeadStatus(activeLead.status);
      setLeadSource(activeLead.source);
      setLeadRating(activeLead.rating || 3);
      setLeadCity(activeLead.city || "");
      setLeadClientType(activeLead.clientType || "person");
      setLeadSelectedCategories(activeLead.categories || []);
      setIsEditingLead(false);
    }
  }, [activeLead]);

  // Aggregate Client Card details
  const clientCardData = useMemo(() => {
    if (!activeLead) return null;
    const clientName = activeLead.name.trim().toLowerCase();
    const matchingLeads = leads.filter(l => l.name.trim().toLowerCase() === clientName);
    
    const leadWithPhone = matchingLeads.find(l => l.phone) || activeLead;
    const leadWithEmail = matchingLeads.find(l => l.email) || activeLead;
    const leadWithAddress = matchingLeads.find(l => l.address?.street) || activeLead;
    const leadWithCompanyId = matchingLeads.find(l => l.companyId) || activeLead;
    const leadWithWebsite = matchingLeads.find(l => l.website) || activeLead;

    return {
      name: activeLead.name,
      clientType: activeLead.clientType || "person",
      phone: leadWithPhone.phone || "",
      email: leadWithEmail.email || "",
      street: leadWithAddress.address?.street || "",
      city: activeLead.city || "",
      postalCode: leadWithAddress.address?.postalCode || "",
      country: leadWithAddress.address?.country || "Slovakia",
      companyId: leadWithCompanyId.companyId || "",
      taxId: leadWithCompanyId.taxId || "",
      vatId: leadWithCompanyId.vatId || "",
      contactPerson: leadWithCompanyId.contactPerson || "",
      website: leadWithWebsite.website || ""
    };
  }, [leads, activeLead]);

  // Event Logging states
  const [logType, setLogType] = useState<"phone" | "email" | "note" | "offer" | "appointment" | null>(null);
  const [logContent, setLogContent] = useState("");
  const [logAmount, setLogAmount] = useState("");
  const [logTime, setLogTime] = useState("");
  const [logFileName, setLogFileName] = useState("");
  const [logFileSize, setLogFileSize] = useState("");
  const [logFileType, setLogFileType] = useState<"offer" | "contract" | "invoice">("offer");
  
  // Explicit Event Date/Time
  const [logDate, setLogDate] = useState(() => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split("T")[0];
  });
  const [logTimeOfEvent, setLogTimeOfEvent] = useState(() => {
    const d = new Date();
    return d.toTimeString().substring(0, 5);
  });

  // Inline locking task states
  const [inlineTaskTitle, setInlineTaskTitle] = useState("");
  const [inlineTaskDeadline, setInlineTaskDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [inlineTaskIsLocking, setInlineTaskIsLocking] = useState(true);

  const { futureEvents, pastEvents } = useMemo(() => {
    if (!activeLead) return { futureEvents: [], pastEvents: [] };
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);
    const timeline = activeLead.timeline || [];
    
    const future = timeline
      .filter(e => e.timestamp > nowStr)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      
    const past = timeline
      .filter(e => e.timestamp <= nowStr)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
    return { futureEvents: future, pastEvents: past };
  }, [activeLead]);

  const getEventColors = (type: string) => {
    switch (type) {
      case "phone":
        return { dotBg: "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-500/20", badgeBg: "bg-blue-50 text-blue-700 border-blue-200" };
      case "email":
        return { dotBg: "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-500/20", badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200" };
      case "note":
        return { dotBg: "bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-500/20", badgeBg: "bg-amber-50 text-amber-700 border-amber-200" };
      case "offer":
        return { dotBg: "bg-emerald-600 border-emerald-700 text-white shadow-md shadow-emerald-500/20", badgeBg: "bg-emerald-55 text-emerald-700 border-emerald-200" };
      case "appointment":
        return { dotBg: "bg-purple-600 border-purple-700 text-white shadow-md shadow-purple-500/20", badgeBg: "bg-purple-50 text-purple-700 border-purple-200" };
      default:
        return { dotBg: "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-500/20", badgeBg: "bg-blue-50 text-blue-700 border-blue-200" };
    }
  };

  const renderEventIcon = (type: string) => {
    switch (type) {
      case "phone": return <Phone className="h-3.5 w-3.5 stroke-[2.5]" />;
      case "email": return <Mail className="h-3.5 w-3.5 stroke-[2.5]" />;
      case "note": return <FileText className="h-3.5 w-3.5 stroke-[2.5]" />;
      case "offer": return <Euro className="h-3.5 w-3.5 stroke-[2.5]" />;
      case "appointment": return <Calendar className="h-3.5 w-3.5 stroke-[2.5]" />;
      default: return <Clock className="h-3.5 w-3.5 stroke-[2.5]" />;
    }
  };

  const handleUpdateLeadProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead) return;
    if (!leadName.trim() || !leadValue.trim() || !leadCity.trim()) {
      alert("Name, City and Value are strictly required!");
      return;
    }
    const valNum = parseFloat(leadValue);
    if (isNaN(valNum)) {
      alert("Please enter a valid numeric value!");
      return;
    }

    setLeads(prev => prev.map(l => {
      if (l.id === activeLead.id) {
        return {
          ...l,
          name: leadName.trim(),
          city: leadCity.trim(),
          clientType: leadClientType,
          value: valNum,
          owner: leadOwner,
          status: leadStatus.toLowerCase(),
          source: leadSource.toLowerCase(),
          rating: leadRating,
          categories: leadSelectedCategories
        };
      }
      return l;
    }));
    setIsEditingLead(false);
  };

  const handleAddLeadTimelineEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || !logType) return;

    let contentString = logContent.trim();
    let titleString = "";

    const timestampStr = `${logDate} ${logTimeOfEvent}`;

    if (logType === "phone") {
      titleString = "Outbound Call Completed";
      if (!contentString) contentString = "Completed voice call with customer regarding updates.";
    } else if (logType === "email") {
      titleString = "Direct Email Sent";
      if (!contentString) contentString = "Outbound email correspondence successfully transmitted.";
    } else if (logType === "note") {
      titleString = "Internal Note Added";
      if (!contentString) {
        alert("Please write down some details for the note!");
        return;
      }
    } else if (logType === "appointment") {
      titleString = "Meeting Pinned";
      if (!logTime.trim()) {
        alert("Please select appointment time!");
        return;
      }
      if (!contentString) contentString = `Client appointment set for ${logTime.trim()}`;
    } else if (logType === "offer") {
      titleString = "Commercial Proposal Submitted";
      const amt = parseFloat(logAmount);
      if (isNaN(amt) || amt <= 0) {
        alert("Offer amount must be a positive number!");
        return;
      }
      titleString = `Commercial Proposal Sent (€ ${amt.toLocaleString()})`;
      if (!contentString) contentString = `Submitted commercial proposal of € ${amt.toLocaleString()} to client.`;
    }

    const newEvent: TimelineEvent = {
      id: "evt_" + Math.random().toString(36).substr(2, 9),
      type: logType,
      timestamp: timestampStr,
      title: titleString,
      content: contentString,
      amount: logType === "offer" ? parseFloat(logAmount) : undefined,
      extraTime: logType === "appointment" ? logTime : undefined,
      fileName: logType === "offer" && logFileName ? logFileName : undefined,
      fileSize: logType === "offer" && logFileSize ? logFileSize : undefined,
      fileType: logType === "offer" && logFileName ? logFileType : undefined
    };

    setLeads(prev => prev.map(l => {
      if (l.id === activeLead.id) {
        const currentTimeline = l.timeline || [];
        return {
          ...l,
          timeline: [newEvent, ...currentTimeline]
        };
      }
      return l;
    }));

    // Auto-create PM task if the event is in the future
    const eventDateTime = new Date(`${logDate}T${logTimeOfEvent}:00`);
    if (eventDateTime.getTime() > Date.now()) {
      let deadlineVal = logDate;

      const taskTitle = systemLanguage === "sk" 
        ? `Budúca udalosť: ${activeLead.name} (${titleString})`
        : systemLanguage === "hu"
          ? `Jövőbeli esemény: ${activeLead.name} (${titleString})`
          : `Future Event: ${activeLead.name} (${titleString})`;

      const autoPMTask: Task = {
        id: `task-${Date.now()}`,
        title: taskTitle,
        description: contentString || `Scheduled for ${logDate} ${logTimeOfEvent}`,
        status: "todo",
        priority: "medium",
        deadline: deadlineVal,
        owner: activeLead.owner || "Erik",
        assignedUsers: [activeLead.owner || "Erik"],
        relatedLeadId: activeLead.id,
        isLocking: false
      };

      setTasks(prev => [autoPMTask, ...prev]);
    }

    // Reset log states
    setLogContent("");
    setLogAmount("");
    setLogTime("");
    setLogFileName("");
    setLogFileSize("");
    setLogType(null);
    
    // Reset date/time to now
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    setLogDate((new Date(Date.now() - tzOffset)).toISOString().split("T")[0]);
    setLogTimeOfEvent(new Date().toTimeString().substring(0, 5));
  };

  const handleAddInlineLockingTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead) return;
    if (!inlineTaskTitle.trim()) {
      alert(systemLanguage === "sk" ? "Zadajte názov úlohy!" : systemLanguage === "hu" ? "Adja meg a feladat címét!" : "Please enter a task title!");
      return;
    }

    const newLockingTask: Task = {
      id: `task-${Date.now()}`,
      title: inlineTaskTitle.trim(),
      description: systemLanguage === "sk" ? "Vytvorené v detaile záujemcu" : systemLanguage === "hu" ? "Érdeklődő részleteinél létrehozva" : "Created from Lead detail drawer",
      status: "todo",
      priority: "high",
      deadline: inlineTaskDeadline,
      owner: activeLead.owner || "Erik",
      assignedUsers: [activeLead.owner || "Erik"],
      relatedLeadId: activeLead.id,
      isLocking: inlineTaskIsLocking
    };

    setTasks(prev => [newLockingTask, ...prev]);
    setInlineTaskTitle("");
    const d = new Date();
    d.setDate(d.getDate() + 3);
    setInlineTaskDeadline(d.toISOString().split("T")[0]);
    setInlineTaskIsLocking(true);
  };

  const [isClosingModal, setIsClosingModal] = useState(false);
  const [isClosingClient, setIsClosingClient] = useState(false);

  const closeLeadModal = () => {
    setIsClosingModal(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosingModal(false);
    }, 350);
  };

  const closeClientDrawer = () => {
    setIsClosingClient(true);
    setTimeout(() => {
      setSelectedClientName(null);
      setIsClosingClient(false);
    }, 350);
  };

  // Save edited client properties across ALL associated database leads
  const handleSaveClientDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientName) return;
    if (!editClientName.trim() || !editClientCity.trim()) {
      alert("Name and City fields are required!");
      return;
    }

    setLeads(prev => prev.map(lead => {
      // Match leads by the old client name
      if (lead.name.trim().toLowerCase() === selectedClientName.trim().toLowerCase()) {
        return {
          ...lead,
          name: editClientName.trim(),
          city: editClientCity.trim(),
          clientType: editClientType,
          source: editClientSource,
          owner: editClientOwner
        };
      }
      return lead;
    }));

    closeClientDrawer();
  };

  // Initialize inline editing
  const startInlineEdit = (lead: Lead) => {
    setEditingRowId(lead.id);
    setInlineName(lead.name);
    setInlineCity(lead.city);
    setInlineType(lead.clientType);
    setInlineValue(lead.value.toString());
    setInlineSource(lead.source);
    setInlineOwner(lead.owner);
  };

  // Save inline edit
  const saveInlineEdit = (id: string) => {
    if (!inlineName.trim() || !inlineCity.trim() || !inlineValue.trim()) {
      alert("Fields cannot be left blank!");
      return;
    }
    const valNum = parseFloat(inlineValue);
    if (isNaN(valNum) || valNum < 0) {
      alert("Invalid numeric value!");
      return;
    }

    setLeads(prev => prev.map(l => l.id === id ? {
      ...l,
      name: inlineName.trim(),
      city: inlineCity.trim(),
      clientType: inlineType,
      value: valNum,
      source: inlineSource,
      owner: inlineOwner.trim()
    } : l));
    
    setEditingRowId(null);
  };



  // Delete lead
  const handleDeleteLead = (id: string, name: string) => {
    if (confirm(
      systemLanguage === "sk" 
        ? `Naozaj chcete vymazať lead pre "${name}"?` 
        : systemLanguage === "hu" 
          ? `Biztosan törölni szeretné a(z) "${name}" leadet?` 
          : `Are you sure you want to delete the lead for "${name}"?`
    )) {
      setLeads(prev => prev.filter(l => l.id !== id));
      if (editingRowId === id) setEditingRowId(null);
    }
  };

  /**
   * Pipeline Stage Transition Guard:
   * Handles updating a lead's status/stage inside the CRM.
   * If there are uncompleted tasks with the `isLocking` (blocking) flag set for the lead,
   * it prevents the stage transition and alerts the user in their active language.
   * 
   * @param id String unique lead record ID
   * @param newStatus String target stage status key (e.g. "contacted", "accepted")
   */
  const handleUpdateLeadState = (id: string, newStatus: string) => {
    const lead = leads.find(l => l.id === id);
    if (lead && lead.status !== newStatus) {
      const lockingTasks = tasks.filter(t => t.relatedLeadId === id && t.isLocking && t.status !== "done");
      if (lockingTasks.length > 0) {
        const warningTitle = systemLanguage === "sk" ? "Presun zablokovaný!" : systemLanguage === "hu" ? "Állapotváltozás blokkolva!" : "Pipeline Transition Blocked!";
        const warningMsg = systemLanguage === "sk" 
          ? `Nemôžete zmeniť stav záujemcu! Najprv musíte splniť blokujúce úlohy:\n\n` + lockingTasks.map(t => `• ${t.title}`).join("\n")
          : systemLanguage === "hu"
            ? `Nem változtathatja meg az érdeklődő állapotát! Először be kell fejeznie a blokkoló feladatokat:\n\n` + lockingTasks.map(t => `• ${t.title}`).join("\n")
            : `Cannot transition pipeline stage! Please complete the following locking tasks first:\n\n` + lockingTasks.map(t => `• ${t.title}`).join("\n");
        alert(`${warningTitle}\n\n${warningMsg}`);
        return;
      }
    }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
  };

  /**
   * Kanban drag-and-drop handler:
   * Triggered upon dropping a card into a columns column, invoking the standard state guard method.
   * 
   * @param leadId String unique lead record ID
   * @param targetMajorState String columns column title name
   */
  const handleLeadDrop = (leadId: string, targetMajorState: string) => {
    handleUpdateLeadState(leadId, targetMajorState.toLowerCase());
  };

  /**
   * Create New Lead handler:
   * Pushes a new client lead record into the database, initializing it with standard colors and rating values.
   */
  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadCity.trim() || !newLeadValue.trim()) {
      alert("Please fill in all required fields!");
      return;
    }

    const valNum = parseFloat(newLeadValue);
    if (isNaN(valNum) || valNum < 0) {
      alert("Please enter a valid numeric lead value!");
      return;
    }

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      name: newLeadName.trim(),
      city: newLeadCity.trim(),
      clientType: newLeadType,
      status: newLeadStatus || leadStates[0] || "new",
      source: newLeadSource || leadSources[0] || "website",
      owner: newLeadOwner || projectManagers[0] || "Tomi",
      value: valNum,
      createdAt: new Date().toISOString().split("T")[0],
      rating: newLeadRating,
      categories: newLeadCategories
    };

    setLeads(prev => [newLead, ...prev]);
    closeLeadModal();

    setNewLeadName("");
    setNewLeadCity("");
    setNewLeadType("person");
    setNewLeadValue("");
    setNewLeadStatus("");
    setNewLeadSource("");
    setNewLeadOwner("");
    setNewLeadRating(3);
    setNewLeadCategories([]);
    setClientMode("new");
    setSelectedExistingClient("");
  };

  // Filter and Sort leads
  const processedLeads = useMemo(() => {
    return leads
      .filter(lead => {
        const matchesSearch = 
          (lead.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (lead.city || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (lead.owner || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesState = selectedState === "all" || (lead.status || "").toLowerCase() === selectedState.toLowerCase() || leadStateParents[(lead.status || "").toLowerCase()] === selectedState.toLowerCase();
        const matchesSource = selectedSource === "all" || (lead.source || "").toLowerCase() === selectedSource.toLowerCase();
        const matchesType = selectedType === "all" || (lead.clientType || "").toLowerCase() === selectedType.toLowerCase();
        
        const matchesOwner = selectedOwner === "all" || (lead.owner || "").toLowerCase() === selectedOwner.toLowerCase();
        const matchesCity = selectedCity === "all" || (lead.city || "").toLowerCase() === selectedCity.toLowerCase();

        return matchesSearch && matchesState && matchesSource && matchesType && matchesOwner && matchesCity;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [leads, searchQuery, selectedState, selectedSource, selectedType, selectedOwner, selectedCity]);

  // Group processed leads by lead states dynamically (always used for Kanban & Top Summary counters)
  const stateGroupedLeads = useMemo(() => {
    const groups: Record<string, Lead[]> = {};
    leadStates.forEach(state => {
      groups[state.toLowerCase()] = [];
    });
    processedLeads.forEach(lead => {
      const statusKey = lead.status.toLowerCase();
      const parent = leadStateParents[statusKey];
      const target = parent ? parent.toLowerCase() : statusKey;
      if (!groups[target]) {
        groups[target] = [];
      }
      groups[target].push(lead);
    });
    return leadStates
      .filter(state => !leadStateParents[state.toLowerCase()])
      .map(state => ({
        state: state,
        colorOverride: undefined as string | undefined,
        leads: groups[state.toLowerCase()] || []
      }));
  }, [processedLeads, leadStates, leadStateParents]);

  // Dynamic consistent manager colors
  const getPMColor = (pmName: string) => {
    const pmColors = ["#3b82f6", "#0ea5e9", "#6366f1", "#10b981", "#ec4899", "#8b5cf6", "#f59e0b", "#14b8a6"];
    let hash = 0;
    for (let i = 0; i < pmName.length; i++) {
      hash = pmName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % pmColors.length;
    return pmColors[index];
  };

  // Group and sort leads by selected orderingMode (specifically for Datagrid list view)
  const groupedLeads = useMemo(() => {
    if (orderingMode === "state") {
      return stateGroupedLeads;
    }

    if (orderingMode === "pm") {
      const groups: Record<string, Lead[]> = {};
      processedLeads.forEach(lead => {
        const pm = lead.owner || "Unassigned";
        if (!groups[pm]) {
          groups[pm] = [];
        }
        groups[pm].push(lead);
      });
      return Object.keys(groups)
        .sort((a, b) => a.localeCompare(b))
        .map(pm => ({
          state: pm,
          colorOverride: getPMColor(pm),
          leads: groups[pm]
        }));
    }

    // Plain sorted modes (Single group without state partitions)
    let sorted = [...processedLeads];
    if (orderingMode === "created_newest") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (orderingMode === "created_oldest") {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (orderingMode === "size") {
      sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
    } else if (orderingMode === "rating") {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return [
      {
        state: "All Leads",
        colorOverride: "#6366f1",
        leads: sorted
      }
    ];
  }, [processedLeads, stateGroupedLeads, orderingMode]);

  // Order all major states and their associated substates sequentially for the progress bar
  const orderedAllStates = useMemo(() => {
    const list: string[] = [];
    leadStates.forEach(state => {
      const stateLower = state.toLowerCase();
      // If it is a major state (not a substate), push it, and then push all its substates immediately after
      if (!leadStateParents[stateLower]) {
        list.push(state);
        const substates = leadStates.filter(s => leadStateParents[s.toLowerCase()] === stateLower);
        list.push(...substates);
      }
    });
    return Array.from(new Set(list));
  }, [leadStates, leadStateParents]);

  // Aggregate statistics for Card 1 & Card 2 (Unused)
  /*
  const stats = useMemo(() => {
    const totalCount = leads.length;
    const totalValue = leads.reduce((acc, curr) => acc + curr.value, 0);
    
    const statusCounts: Record<string, number> = {};
    leadStates.forEach(state => {
      statusCounts[state.toLowerCase()] = 0;
    });
    leads.forEach(lead => {
      const statusKey = lead.status.toLowerCase();
      const parent = leadStateParents[statusKey];
      const target = parent ? parent.toLowerCase() : statusKey;
      if (statusCounts[target] !== undefined) {
        statusCounts[target]++;
      } else {
        statusCounts[target] = 1;
      }
    });

    return {
      totalCount,
      totalValue,
      statusCounts
    };
  }, [leads, leadStates, leadStateParents]);
  */

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const renderStars = (rating: number = 0, onChange?: (r: number) => void) => {
    return (
      <div className="flex items-center gap-1 select-none animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= rating;
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange && onChange(star)}
              disabled={!onChange}
              className={`focus:outline-none transition-all duration-150 p-0.5 ${onChange ? "cursor-pointer hover:scale-130 active:scale-90" : "cursor-default"}`}
              aria-label={`Rate ${star} dots`}
            >
              <div 
                className={`h-2 w-2 rounded-full transition-colors duration-150 ${
                  isFilled 
                    ? "bg-amber-500 shadow-sm animate-pulse" 
                    : "bg-slate-200"
                }`} 
              />
            </button>
          );
        })}
      </div>
    );
  };

  // PM Workload Graph Data Calculations (Unused)
  /*
  const graphData = useMemo(() => {
    if (graphTab === "DEV") {
      return [
        { name: "Tomi", value: 3, cap: 3 },
        { name: "Roli", value: 8, cap: 9 },
        { name: "Erik", value: 5, cap: 6 }
      ];
    }
    if (graphTab === "DESIGN") {
      return [
        { name: "Tomi", value: 6, cap: 6 },
        { name: "Roli", value: 3, cap: 4 },
        { name: "Erik", value: 10, cap: 12 }
      ];
    }

    const managers = projectManagers;
    return managers.map(name => {
      const pmLeads = leads.filter(l => l.owner.toLowerCase() === name.toLowerCase());
      if (complexityWeighting) {
        const totalVal = pmLeads.reduce((acc, curr) => acc + curr.value, 0);
        const scaleVal = Math.min(18, Math.round(totalVal / 5000));
        return {
          name,
          value: scaleVal,
          cap: Math.min(18, scaleVal + 2)
        };
      } else {
        const count = pmLeads.length;
        let visualScale = count * 2; 
        if (name.toLowerCase() === "tomi") visualScale = 4;
        if (name.toLowerCase() === "roli") visualScale = 6;
        if (name.toLowerCase() === "erik") visualScale = 13;
        
        return {
          name,
          value: visualScale,
          cap: name.toLowerCase() === "erik" ? 17 : name.toLowerCase() === "roli" ? 7 : visualScale
        };
      }
    });
  }, [leads, graphTab, complexityWeighting, projectManagers]);
  */

  // ----------------------------------------------------
  // --- SUB-RENDER ROUTE: DEDICATED LEAD DETAIL VIEW ---
  // ----------------------------------------------------
  if (initialSelectedLeadId) {
    if (!activeLead) {
      return (
        <div className="p-8 glass-panel rounded-[28px] border-2 border-red-400 bg-white shadow-glass text-center space-y-4">
          <div className="text-4xl text-rose-600 animate-bounce">⚠️</div>
          <h2 className="text-xl font-heading font-black text-slate-900 uppercase tracking-wide">Lead Record Not Found</h2>
          <p className="text-xs text-slate-650 font-semibold">The lead ID '{initialSelectedLeadId}' could not be resolved in the active database.</p>
          <button 
            onClick={() => { window.location.hash = "leads"; }}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
          >
            Back to Leads Registry
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
        {/* Back header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { window.location.hash = "leads"; }}
            className="px-4.5 py-3 rounded-2xl bg-white border-2 border-slate-300 text-slate-700 hover:text-slate-955 hover:border-slate-850 transition-all text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.back_to_leads")}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-blue-800 bg-blue-100 border-2 border-blue-300 px-4 py-2 rounded-2xl shadow-inner">
              {getTranslation(systemLanguage, "common.lead_value")}: &euro; {activeLead.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Master Dual-Panel Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL: Lead Details Form & Client Card */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Lead Details Panel */}
            <div className="glass-panel p-6 rounded-[28px] border-2 border-blue-450 bg-white shadow-xl space-y-6 overflow-hidden relative">
              {/* Pipeline State Progress Bar at the top edge of the card */}
              <div 
                onMouseEnter={() => setHoveredDetailTimeline(true)}
                onMouseLeave={() => setHoveredDetailTimeline(false)}
                className="w-[calc(100%+48px)] mx-[-24px] mt-[-24px] flex items-center gap-[1px] select-none bg-slate-200 transition-all duration-300 overflow-hidden shrink-0 border-b border-slate-100"
                style={{ 
                  height: hoveredDetailTimeline ? "20px" : "4px"
                }}
              >
                {(() => {
                  const isStateClosed = (stateName: string) => {
                    const sLower = stateName.toLowerCase();
                    const parent = leadStateParents[sLower];
                    return sLower === "accepted" || sLower === "rejected" || parent === "accepted" || parent === "rejected";
                  };

                  const nonClosedStates = orderedAllStates.filter(s => !isStateClosed(s));
                  const closedStates = orderedAllStates.filter(s => isStateClosed(s));

                  // Use active edited status or saved lead status
                  const currentStatus = (leadStatus || activeLead.status || "");
                  const leadStatusLower = currentStatus.toLowerCase();
                  const isLeadClosed = isStateClosed(leadStatusLower);

                  const segments: {
                    key: string;
                    title: string;
                    isPastOrCurrent: boolean;
                    color: string;
                    tooltip: string;
                  }[] = [];

                  // 1. Add non-closed states
                  nonClosedStates.forEach((state) => {
                    const stateLower = state.toLowerCase();
                    const sIndex = orderedAllStates.findIndex(s => s.toLowerCase() === stateLower);
                    const cIndex = orderedAllStates.findIndex(s => s.toLowerCase() === leadStatusLower);
                    
                    const isPastOrCurrent = isLeadClosed || (sIndex !== -1 && cIndex !== -1 && sIndex <= cIndex);
                    const stateColor = getSafeStateColor(state);
                    const bgStyle = isPastOrCurrent ? stateColor : "#cbd5e1";

                    segments.push({
                      key: state,
                      title: state,
                      isPastOrCurrent,
                      color: bgStyle,
                      tooltip: `${state} ${isPastOrCurrent ? "(Current/Past)" : "(Upcoming)"}`
                    });
                  });

                  // 2. Add combined final segment
                  if (closedStates.length > 0) {
                    const combinedTitle = closedStates.join(" / ");
                    const activeColor = isLeadClosed ? getSafeStateColor(currentStatus) : "#cbd5e1";

                    segments.push({
                      key: "closed_states_combined",
                      title: combinedTitle,
                      isPastOrCurrent: isLeadClosed,
                      color: activeColor,
                      tooltip: isLeadClosed ? `Closed (${currentStatus})` : `Closed (${combinedTitle})`
                    });
                  }

                  return segments.map((seg, index) => {
                    const isFirst = index === 0;
                    const isLast = index === segments.length - 1;
                    
                    let segmentClipPath = "none";
                    if (segments.length > 1) {
                      if (isFirst) {
                        segmentClipPath = "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%)";
                      } else if (isLast) {
                        segmentClipPath = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 4px 50%)";
                      } else {
                        segmentClipPath = "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%, 4px 50%)";
                      }
                    }

                    const textColor = seg.isPastOrCurrent ? "#ffffff" : "#334155";

                    return (
                      <div 
                        key={seg.key}
                        className="flex-1 h-full flex items-center justify-center relative transition-all duration-300"
                        style={{ 
                          backgroundColor: seg.color,
                          clipPath: segmentClipPath
                        }}
                        title={seg.tooltip}
                      >
                        {hoveredDetailTimeline && (
                          <span 
                            className="text-[10px] font-black uppercase tracking-wider px-1 truncate"
                            style={{ 
                              fontSize: "10px", 
                              lineHeight: "10px",
                              color: textColor
                            }}
                          >
                            {seg.title}
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="border-b-2 border-slate-150 pb-4 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white border-2 border-blue-700 flex items-center justify-center font-heading font-black text-sm shadow-md">
                    {getInitials(leadName || activeLead.name)}
                  </div>
                  <div>
                    <h3 className="text-md font-heading font-black text-slate-900 uppercase tracking-tight">{getTranslation(systemLanguage, "profile.lead_params")}</h3>
                    <p className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wide mt-0.5">{getTranslation(systemLanguage, "profile.edit_lead_desc")}</p>
                  </div>
                </div>
                
                {/* Pencil Toggle edit button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingLead) {
                      // Revert changes on toggle off
                      setLeadName(activeLead.name);
                      setLeadValue(activeLead.value.toString());
                      setLeadOwner(activeLead.owner);
                      setLeadStatus(activeLead.status);
                      setLeadSource(activeLead.source);
                      setLeadRating(activeLead.rating || 3);
                      setLeadCity(activeLead.city || "");
                      setLeadClientType(activeLead.clientType || "person");
                    }
                    setIsEditingLead(!isEditingLead);
                  }}
                  className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all border-2 shadow-sm ${
                    isEditingLead 
                      ? "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100" 
                      : "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                  }`}
                  title={isEditingLead ? "Cancel editing" : "Edit Lead details"}
                >
                  {isEditingLead ? <X className="h-4.5 w-4.5 stroke-[2.5]" /> : <PencilLine className="h-4.5 w-4.5 stroke-[2.5]" />}
                </button>
              </div>

              <form onSubmit={handleUpdateLeadProfile} className="space-y-4 text-xs font-bold">
                
                {/* Lead Name & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.lead_client_name")}</label>
                    <input
                      type="text"
                      required
                      disabled={!isEditingLead}
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                        isEditingLead 
                          ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-blue-500 text-slate-800" 
                          : "bg-transparent border-2 border-transparent pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{systemLanguage === "sk" ? "Lokalita / Mesto *" : systemLanguage === "hu" ? "Helyszín / Város *" : "City Location *"}</label>
                    <input
                      type="text"
                      required
                      disabled={!isEditingLead}
                      value={leadCity}
                      onChange={(e) => setLeadCity(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                        isEditingLead 
                          ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-blue-500 text-slate-800" 
                          : "bg-transparent border-2 border-transparent pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                      }`}
                    />
                  </div>
                </div>

                {/* Value & Client Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.lead_valuation")}</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      disabled={!isEditingLead}
                      value={leadValue}
                      onChange={(e) => setLeadValue(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                        isEditingLead 
                          ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-blue-500 text-slate-800" 
                          : "bg-transparent border-2 border-transparent pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.client_type")}</label>
                    {isEditingLead ? (
                      <select
                        value={leadClientType}
                        onChange={(e) => setLeadClientType(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-800"
                      >
                        <option value="person">{systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}</option>
                        <option value="business">{systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}</option>
                        <option value="partner">{systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}</option>
                      </select>
                    ) : (
                      <div className="pt-2 pl-0 text-slate-900 text-sm font-black uppercase tracking-wider cursor-default select-all">
                        {leadClientType === "business" && `🏢 ${systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}`}
                        {leadClientType === "partner" && `🤝 ${systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}`}
                        {leadClientType === "person" && `👤 ${systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}`}
                      </div>
                    )}
                  </div>
                </div>

                {/* State & Source */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-555 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.lead_state")}</label>
                    <div className="pt-1 select-none">
                      <StatusSelector 
                        status={leadStatus} 
                        onChange={(newStatus) => setLeadStatus(newStatus)} 
                        isEditing={isEditingLead} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.source_channel")}</label>
                    {isEditingLead ? (
                      <select
                        value={leadSource}
                        onChange={(e) => setLeadSource(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-800 uppercase"
                      >
                        {leadSources.map(s => (
                          <option key={s} value={s.toLowerCase()}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="pt-2 pl-0 text-slate-900 text-sm font-black uppercase tracking-wider cursor-default select-all">
                        🚀 {leadSource}
                      </div>
                    )}
                  </div>
                </div>

                {/* Project Manager */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.project_manager_label")}</label>
                    {isEditingLead ? (
                      <select
                        value={leadOwner}
                        onChange={(e) => setLeadOwner(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-800"
                      >
                        {projectManagers.map(pm => (
                          <option key={pm} value={pm}>{pm}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="pt-2 pl-0 flex items-center">
                        <span 
                          className="px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-sm"
                          style={{ 
                            backgroundColor: `${getSafePMColor(leadOwner)}15`, 
                            color: getSafePMColor(leadOwner), 
                            borderColor: `${getSafePMColor(leadOwner)}30` 
                          }}
                        >
                          <User className="h-3 w-3 shrink-0" />
                          {leadOwner}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.priority_rating")}</label>
                    <div className="flex items-center gap-1 bg-slate-50 p-2 rounded-xl border border-slate-200 w-fit">
                      {renderStars(leadRating, isEditingLead ? setLeadRating : undefined)}
                    </div>
                  </div>
                </div>

                {/* Categories Interest Selection or List display */}
                <div className="space-y-2 border-t-2 border-slate-100 pt-3 text-left">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-blue-500" /> {getTranslation(systemLanguage, "profile.interested_categories")}
                  </label>
                  {isEditingLead ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-blue-50/5 border border-slate-200/60 p-3 rounded-2xl">
                      {leadCategories.map((cat) => {
                        const isChecked = leadSelectedCategories.includes(cat);
                        return (
                          <label 
                            key={cat}
                            className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl cursor-pointer text-[9px] font-black uppercase transition-all select-none ${
                              isChecked 
                                ? "bg-blue-50 border-blue-300 text-blue-755 shadow-sm" 
                                : "bg-white border-slate-150 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            }`}
                          >
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setLeadSelectedCategories([...leadSelectedCategories, cat]);
                                } else {
                                  setLeadSelectedCategories(leadSelectedCategories.filter(c => c !== cat));
                                }
                              }}
                              className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 shrink-0"
                            />
                            <span className="truncate">{cat}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {leadSelectedCategories.length > 0 ? (
                        leadSelectedCategories.map((cat) => {
                          const color = getSafeCategoryColor(cat);
                          return (
                            <span 
                              key={cat} 
                              className="px-2.5 py-1 rounded-lg text-[9px] font-black border uppercase tracking-wider transition-all"
                              style={{
                                backgroundColor: `${color}15`,
                                color: color,
                                borderColor: `${color}35`
                              }}
                            >
                              {cat}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold italic uppercase tracking-wider">
                          {getTranslation(systemLanguage, "profile.no_categories")}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Save Changes button */}
                {isEditingLead && (
                  <div className="pt-4 border-t-2 border-slate-100 flex animate-in fade-in duration-200 justify-end">
                    <button
                      type="submit"
                      className="w-fit px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Check className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "leads.detail.save_changes")}
                    </button>
                  </div>
                )}

              </form>
            </div>

            {/* 2. Client Profile Card */}
            {clientCardData && (
              <div className="glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl space-y-4">
                <div className="border-b-2 border-slate-150 pb-3 flex items-center justify-between">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <Briefcase className="h-4 w-4" /> {getTranslation(systemLanguage, "common.client_relationship_card")}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-250 uppercase tracking-wider">
                    {getTranslation(systemLanguage, "common.synced_profile")}
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-black text-sm shadow">
                      {getInitials(clientCardData.name)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-850 line-clamp-1">{clientCardData.name}</h4>
                      <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">
                        {clientCardData.clientType === "business" && `🏢 ${systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}`}
                        {clientCardData.clientType === "partner" && `🤝 ${systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}`}
                        {clientCardData.clientType === "person" && `👤 ${systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px] bg-slate-50/50 p-3 rounded-xl border border-slate-200">
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(systemLanguage, "profile.phone_number")}</span>
                      <span className="font-extrabold text-slate-700">
                        {clientCardData.phone ? (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-500" /> {clientCardData.phone}</span>
                        ) : (
                          <span className="text-slate-350 italic">{getTranslation(systemLanguage, "profile.none_added")}</span>
                        )}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(systemLanguage, "profile.email_address")}</span>
                      <span className="font-extrabold text-slate-700 truncate block text-slate-700">
                        {clientCardData.email ? (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-emerald-500" /> {clientCardData.email}</span>
                        ) : (
                          <span className="text-slate-350 italic">{getTranslation(systemLanguage, "profile.none_added")}</span>
                        )}
                      </span>
                    </div>
                    <div className="space-y-0.5 col-span-2 border-t border-slate-200 pt-2 mt-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(systemLanguage, "profile.location_address")}</span>
                      <span className="font-extrabold text-slate-700 block">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="line-clamp-1">
                            {clientCardData.street ? `${clientCardData.street}, ` : ""}
                            {clientCardData.city}
                            {clientCardData.postalCode ? ` (${clientCardData.postalCode})` : ""}
                          </span>
                        </span>
                      </span>
                    </div>
                    {clientCardData.website && (
                      <div className="space-y-0.5 col-span-2 border-t border-slate-200 pt-2 mt-1">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(systemLanguage, "profile.website_link")}</span>
                        <a 
                          href={`https://${clientCardData.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="h-3.5 w-3.5 text-emerald-500" /> {clientCardData.website}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => { window.location.hash = `client-${encodeURIComponent(clientCardData.name)}`; }}
                      className="w-fit px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-emerald-700"
                    >
                      {getTranslation(systemLanguage, "common.view_full_profile")} <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Pipeline Stage Gate & Tasks Card */}
            <div className="glass-panel p-6 rounded-[28px] border-2 border-violet-400 bg-white shadow-xl space-y-4">
              <div className="border-b-2 border-slate-150 pb-3 flex items-center justify-between">
                <span className="text-[9px] font-black text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="h-4.5 w-4.5 text-violet-650" />
                  {systemLanguage === "sk" ? "FÁZOVÁ BRÁNA A ÚLOHY" : systemLanguage === "hu" ? "FÁZISKAPU ÉS FELADATOK" : "PIPELINE GATE & TASKS"}
                </span>
                
                {/* Count badge */}
                <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-violet-50 text-violet-750 border border-violet-200">
                  {tasks.filter(t => t.relatedLeadId === activeLead.id).length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                {tasks.filter(t => t.relatedLeadId === activeLead.id).length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-[10px] font-semibold">
                    {systemLanguage === "sk" ? "Žiadne prepojené úlohy." : systemLanguage === "hu" ? "Nincsenek kapcsolódó feladatok." : "No tasks linked to this lead."}
                  </div>
                ) : (
                  tasks.filter(t => t.relatedLeadId === activeLead.id).map(task => {
                    const isCompleted = task.status === "done";
                    return (
                      <div 
                        key={task.id}
                        className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-2.5 ${
                          isCompleted 
                            ? "bg-emerald-50/20 border-emerald-100" 
                            : task.isLocking 
                              ? "bg-rose-50/20 border-rose-200" 
                              : "bg-slate-50/50 border-slate-150"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => {
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t));
                            }}
                            className={`h-4.5 w-4.5 rounded-full shrink-0 flex items-center justify-center border transition-all mt-0.5 cursor-pointer ${
                              isCompleted 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : "bg-white border-slate-350 text-transparent hover:border-violet-650"
                            }`}
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                          </button>

                          <div className="space-y-0.5">
                            <span className={`text-[11px] font-extrabold tracking-wide block leading-tight ${isCompleted ? "line-through text-slate-400 font-bold" : "text-slate-700"}`}>
                              {task.title}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Locking badge */}
                              {task.isLocking && (
                                <span className="inline-flex items-center gap-0.5 text-[7.5px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md uppercase border border-rose-150">
                                  <Lock className="h-2 w-2 text-rose-500" />
                                  {systemLanguage === "sk" ? "Zámok" : systemLanguage === "hu" ? "Kapu" : "Lock"}
                                </span>
                              )}
                              {/* Deadline */}
                              <span className="text-[8.5px] text-slate-400 font-bold">{task.deadline}</span>
                            </div>
                          </div>
                        </div>

                        {/* Inline Delete Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(systemLanguage === "sk" ? "Vymazať?" : systemLanguage === "hu" ? "Törlés?" : "Delete?")) {
                              setTasks(prev => prev.filter(t => t.id !== task.id));
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Inline Create Locking Task Form */}
              <form onSubmit={handleAddInlineLockingTask} className="border-t border-slate-100 pt-3 space-y-2.5 text-xs">
                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
                  {systemLanguage === "sk" ? "RÝCHLE PRIDANIE ÚLOHY BRÁNY" : systemLanguage === "hu" ? "KAPU FELADAT GYORS HOZZÁADÁSA" : "QUICK ADD GATE TASK"}
                </span>

                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    placeholder={systemLanguage === "sk" ? "napr. Podpísať preberací protokol" : systemLanguage === "hu" ? "pl. Átadás-átvételi jegyzőkönyv" : "e.g. Sign handover protocol"}
                    value={inlineTaskTitle}
                    onChange={(e) => setInlineTaskTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none font-bold text-[11px]"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      required
                      value={inlineTaskDeadline}
                      onChange={(e) => setInlineTaskDeadline(e.target.value)}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none font-bold text-[10px]"
                    />
                    
                    {/* Locking switch */}
                    <button
                      type="button"
                      onClick={() => setInlineTaskIsLocking(!inlineTaskIsLocking)}
                      className={`px-3 py-1.5 rounded-xl border font-black text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                        inlineTaskIsLocking 
                          ? "bg-rose-50 border-rose-250 text-rose-700 font-extrabold" 
                          : "bg-slate-50 border-slate-200 text-slate-550"
                      }`}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{inlineTaskIsLocking ? (systemLanguage === "sk" ? "BLOKUJE" : systemLanguage === "hu" ? "BLOKKOL" : "LOCKING") : (systemLanguage === "sk" ? "VOĽNÁ" : systemLanguage === "hu" ? "SZABAD" : "NORMAL")}</span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-650 text-white font-black text-[10px] uppercase tracking-wider shadow hover:shadow-violet-600/10 hover:scale-[1.01] transition-all cursor-pointer border border-violet-550/20"
                >
                  {systemLanguage === "sk" ? "+ Pridať úlohu fázovej brány" : systemLanguage === "hu" ? "+ Kapu feladat hozzáadása" : "+ Add Pipeline Gate Task"}
                </button>
              </form>
            </div>

          </div>

          {/* RIGHT PANEL: Timeline History & Quick Logger */}
          <div className="lg:col-span-7">
            <div className="glass-panel p-6 rounded-[28px] border-2 border-blue-450 bg-white shadow-xl space-y-6">
              
              {/* Logger form */}
              <div>
                <h3 className="text-xs font-black text-blue-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b-2 border-slate-100 pb-2">
                  <PencilLine className="h-4.5 w-4.5 text-blue-600 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.log_event_lead")}
                </h3>

                <form onSubmit={handleAddLeadTimelineEvent} className="space-y-4 text-xs font-bold">
                  
                  {/* Switcher */}
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_type")}</label>
                    <div className="grid grid-cols-5 gap-1.5 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-200">
                      {(["phone", "email", "note", "offer", "appointment"] as const).map(type => {
                        const colors = getEventColors(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setLogType(type)}
                            className={`py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1 ${
                              logType === type 
                                ? `${colors.dotBg} border-2 shadow` 
                                : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200"
                            }`}
                          >
                            {renderEventIcon(type)}
                            <span>
                              {type === "phone" && (systemLanguage === "sk" ? "Hovor" : systemLanguage === "hu" ? "Hívás" : "Call")}
                              {type === "email" && (systemLanguage === "sk" ? "E-mail" : systemLanguage === "hu" ? "E-mail" : "Email")}
                              {type === "note" && (systemLanguage === "sk" ? "Poznámka" : systemLanguage === "hu" ? "Jegyzet" : "Note")}
                              {type === "offer" && (systemLanguage === "sk" ? "Ponuka" : systemLanguage === "hu" ? "Ajánlat" : "Offer")}
                              {type === "appointment" && (systemLanguage === "sk" ? "Meet" : systemLanguage === "hu" ? "Találkozó" : "Meet")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expand-down conditionally */}
                  <div className={`grid transition-all duration-300 ease-in-out ${logType ? "grid-rows-[1fr] opacity-100 mt-4 border-t border-slate-150 pt-4" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
                    <div className="overflow-hidden space-y-4">
                      
                      {/* Date and Time selectors for the event */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_date") || "Event Date"}</label>
                          <input
                            type="date"
                            required
                            value={logDate}
                            onChange={(e) => setLogDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none text-xs font-bold text-slate-700"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_time") || "Event Time"}</label>
                          <input
                            type="time"
                            required
                            value={logTimeOfEvent}
                            onChange={(e) => setLogTimeOfEvent(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none text-xs font-bold text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {logType === "offer" && (
                          <>
                            <div className="space-y-1 animate-in slide-in-from-left duration-200">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.offer_amount")}</label>
                              <input
                                type="number"
                                required
                                min="0"
                                placeholder="e.g. 15000"
                                value={logAmount}
                                onChange={(e) => setLogAmount(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none font-bold text-xs"
                              />
                            </div>
                            <div className="space-y-1 animate-in slide-in-from-left duration-200">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.attach_doc")}</label>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-2 border-amber-300 transition-all cursor-pointer text-[10px] font-black uppercase shadow-sm select-none shrink-0">
                                  <FolderOpen className="h-4 w-4" />
                                  <span>{getTranslation(systemLanguage, "logger.choose_file")}</span>
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setLogFileName(file.name);
                                        setLogFileSize((file.size / 1024 / 1024).toFixed(2) + " MB");
                                      }
                                    }} 
                                  />
                                </label>
                                <input
                                  type="text"
                                  placeholder={getTranslation(systemLanguage, "logger.no_file")}
                                  value={logFileName ? `${logFileName} (${logFileSize})` : ""}
                                  readOnly
                                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-[10px] text-slate-500 font-bold"
                                />
                                {logFileName && (
                                  <button 
                                    type="button" 
                                    onClick={() => { setLogFileName(""); setLogFileSize(""); }} 
                                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl animate-in fade-in"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {logFileName && (
                              <div className="md:col-span-2 space-y-1.5 animate-in slide-in-from-top-2 duration-200 border-t border-slate-100 pt-3">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.specify_type")}</label>
                                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-200">
                                  {(["offer", "contract", "invoice"] as const).map(type => (
                                    <button
                                      key={type}
                                      type="button"
                                      onClick={() => setLogFileType(type)}
                                      className={`py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
                                        logFileType === type 
                                          ? "bg-amber-750 text-white border border-amber-800 shadow" 
                                          : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200"
                                      }`}
                                    >
                                      <span>
                                        {type === "offer" && getTranslation(systemLanguage, "logger.type.offer")}
                                        {type === "contract" && getTranslation(systemLanguage, "logger.type.contract")}
                                        {type === "invoice" && getTranslation(systemLanguage, "logger.type.invoice")}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {logType === "appointment" && (
                          <div className="space-y-1 animate-in slide-in-from-left duration-200">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.appt_time")}</label>
                            <input
                              type="text"
                              required
                              placeholder={getTranslation(systemLanguage, "logger.appt_placeholder")}
                              value={logTime}
                              onChange={(e) => setLogTime(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none"
                            />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_details")}</label>
                        <textarea
                          required={!!logType}
                          rows={3}
                          placeholder={logType ? getTranslation(systemLanguage, "logger.details_placeholder_log") : getTranslation(systemLanguage, "logger.details_placeholder_generic")}
                          value={logContent}
                          onChange={(e) => setLogContent(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-lg w-fit ml-auto border-2 border-blue-700"
                      >
                        <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "logger.btn_log")}
                      </button>

                    </div>
                  </div>

                </form>
              </div>

              {/* Chronological timeline */}
              <div className="border-t-2 border-slate-150 pt-6 space-y-4">
                <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                  <Clock className="h-4.5 w-4.5 text-blue-650 animate-pulse stroke-[2.5]" /> {getTranslation(systemLanguage, "common.chronological_timeline")}
                </h3>

                {(activeLead.timeline || []).length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2 animate-bounce">📜</div>
                    <div className="font-black text-slate-700 uppercase tracking-wider">{getTranslation(systemLanguage, "timeline.no_events")}</div>
                    <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">{getTranslation(systemLanguage, "timeline.no_events_desc")}</div>
                  </div>
                ) : (
                  <div className="relative pl-0 md:pl-4 space-y-6 py-2">
                    {/* Running timeline vertical line */}
                    <div className="absolute left-[17px] md:left-[132px] top-2 bottom-2 w-1 bg-blue-100 rounded-full"></div>

                    {/* FUTURE EVENTS */}
                    {futureEvents.map((event) => {
                      const colors = getEventColors(event.type);
                      return (
                        <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                          
                          {/* Left Date */}
                          <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                              {event.timestamp.substring(0, 10)}
                            </span>
                            <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                              {event.timestamp.substring(11, 16)}
                            </span>
                          </div>

                          {/* Middle dot icon */}
                          <div className={`h-9.5 w-9.5 rounded-xl flex items-center justify-center border-2 shrink-0 z-10 shadow-sm transition-all duration-200 group-hover:scale-115 ${colors.dotBg}`}>
                            {renderEventIcon(event.type)}
                          </div>

                          {/* Right content box */}
                          <div className="flex-1 bg-white p-4.5 rounded-[22px] border-2 border-slate-200 shadow-md group-hover:shadow-lg transition-all duration-200 relative select-text">
                            <div className="absolute -left-[7px] top-[14px] w-3 h-3 bg-white border-l-2 border-b-2 border-slate-200 transform rotate-45 hidden md:block"></div>
                            
                            <div className="flex items-start justify-between gap-4">
                              <h4 className="font-heading font-black text-[11px] uppercase tracking-tight text-slate-850 leading-tight">
                                {event.title}
                              </h4>
                              <span className="px-2.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase border shrink-0 bg-purple-50 text-purple-700 border-purple-250">
                                {getTranslation(systemLanguage, "timeline.upcoming_meet")}
                              </span>
                            </div>

                            <p className="text-slate-600 mt-2 text-xs font-semibold leading-relaxed whitespace-pre-line leading-relaxed">
                              {event.content}
                            </p>
                          </div>

                        </div>
                      );
                    })}

                    {/* Today line marker */}
                    {futureEvents.length > 0 && (
                      <div className="relative py-2 select-none animate-in fade-in duration-200">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t-2 border-dashed border-blue-400"></div>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-blue-100 text-blue-750 text-[9px] font-black uppercase px-4 py-1.5 rounded-full border-2 border-blue-300 shadow-md flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" /> {getTranslation(systemLanguage, "timeline.today_line")}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* PAST EVENTS */}
                    {pastEvents.map((event) => {
                      const colors = getEventColors(event.type);
                      return (
                        <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                          
                          {/* Left Date */}
                          <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                              {event.timestamp.substring(0, 10)}
                            </span>
                            <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                              {event.timestamp.substring(11, 16)}
                            </span>
                          </div>

                          {/* Middle dot icon */}
                          <div className={`h-9.5 w-9.5 rounded-xl flex items-center justify-center border-2 shrink-0 z-10 shadow-sm transition-all duration-200 group-hover:scale-115 ${colors.dotBg}`}>
                            {renderEventIcon(event.type)}
                          </div>

                          {/* Right Content box */}
                          <div className="flex-1 bg-white p-4.5 rounded-[22px] border-2 border-slate-200 shadow-md group-hover:shadow-lg transition-all duration-200 relative select-text">
                            <div className="absolute -left-[7px] top-[14px] w-3 h-3 bg-white border-l-2 border-b-2 border-slate-200 transform rotate-45 hidden md:block"></div>
                            
                            <div className="flex items-start justify-between gap-4">
                              <h4 className="font-heading font-black text-[11px] uppercase tracking-tight text-slate-850 leading-tight">
                                {event.title}
                              </h4>
                              <span className={`px-2.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase border shrink-0 ${colors.badgeBg}`}>
                                {event.type === "phone" && getTranslation(systemLanguage, "timeline.badge.phone")}
                                {event.type === "email" && getTranslation(systemLanguage, "timeline.badge.email")}
                                {event.type === "note" && getTranslation(systemLanguage, "timeline.badge.note")}
                                {event.type === "offer" && getTranslation(systemLanguage, "timeline.badge.offer")}
                                {event.type === "appointment" && getTranslation(systemLanguage, "timeline.badge.appointment")}
                              </span>
                            </div>

                            <p className="text-slate-600 mt-2 text-xs font-semibold leading-relaxed whitespace-pre-line">
                              {event.content}
                            </p>

                            {/* Offer details & document badges */}
                            {event.type === "offer" && event.fileName && (
                              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50 p-2.5 rounded-xl border border-slate-150 animate-in slide-in-from-top-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px]">
                                    {event.fileType === "invoice" ? "💰" : event.fileType === "contract" ? "🤝" : "📄"}
                                  </span>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-amber-800">
                                      {event.fileType || "offer"} {getTranslation(systemLanguage, "timeline.doc_suffix")}
                                    </span>
                                    <span className="text-[10px] font-extrabold text-slate-700 truncate max-w-[200px]">
                                      {event.fileName}
                                    </span>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[8.5px] border border-amber-250 font-black">
                                  {event.fileSize || "1.0 MB"}
                                </span>
                              </div>
                            )}

                          </div>

                        </div>
                      );
                    })}

                  </div>
                )}

              </div>

            </div>
          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      {/* 1. Sleek Minimalist Stage Counter Statistics Strip */}
      <div className="glass-panel px-6 py-4 rounded-[26px] border border-blue-50 bg-white/85 shadow-glass flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
            <Layers className="h-4.5 w-4.5 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">
              {systemLanguage === "sk" ? "Prehľad fáz" : systemLanguage === "hu" ? "Fázisok áttekintése" : "Pipeline Summary"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-heading font-black text-slate-800 uppercase tracking-tight">
                {systemLanguage === "sk" ? "Stav leadov" : systemLanguage === "hu" ? "Leadek állapota" : "Leads Status"}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider">
                {leads.length} {systemLanguage === "sk" ? "aktívnych" : systemLanguage === "hu" ? "aktív" : "active"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stateGroupedLeads.map((group) => {
            const stateColor = getSafeStateColor(group.state);
            return (
              <div 
                key={group.state}
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-[10px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: `${stateColor}08`,
                  borderColor: `${stateColor}18`,
                  color: stateColor
                }}
              >
                <span>{group.state}</span>
                <span 
                  className="px-1.5 py-0.5 rounded-lg text-[9px] font-black leading-none"
                  style={{
                    backgroundColor: `${stateColor}12`,
                    color: stateColor
                  }}
                >
                  {group.leads.length}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Control search, filter, and sort bar (Blue accents) */}
      <div className="glass-panel p-6 rounded-[28px] border border-blue-100 bg-white/90 shadow-glass space-y-4">
        
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-between border-b border-slate-100/80 pb-4">
          <div className="flex items-center gap-2.5 w-full sm:max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={getTranslation(systemLanguage, "leads.filter.search")}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-blue-50/20 border border-blue-100 text-xs text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-inner"
              />
            </div>
            
            {/* Filters toggle button */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold border transition-all flex items-center gap-1.5 shadow-sm shrink-0 uppercase tracking-wider ${
                showFilters 
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-black shadow-blue-100" 
                  : "bg-white border-slate-200/60 hover:bg-slate-50 text-slate-650"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 text-blue-500" />
              {getTranslation(systemLanguage, "leads.btn.filters")} {showFilters ? "(ON)" : "(OFF)"}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedOwner("all");
                  setSelectedCity("all");
                  setSelectedSource("all");
                  setSelectedType("all");
                  setSelectedState("all");
                }}
                className="px-3 py-2.5 rounded-2xl text-xs font-extrabold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 transition-all flex items-center gap-1 shadow-sm shrink-0 uppercase tracking-wider animate-fade-in"
                title="Clear all active filters"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* View Mode Toggle: List vs Kanban */}
            <div className="flex bg-slate-100 p-0.5 rounded-2xl border border-slate-200 gap-0.5 select-none shrink-0 w-full sm:w-auto justify-center">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                    : "text-slate-550 hover:text-slate-800 hover:bg-slate-200/50"
                }`}
              >
                <TableProperties className="h-3.5 w-3.5" />
                {systemLanguage === "sk" ? "Zoznam" : systemLanguage === "hu" ? "Lista" : "List"}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "kanban"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                    : "text-slate-555 hover:text-slate-800 hover:bg-slate-200/50"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {systemLanguage === "sk" ? "Kanban" : systemLanguage === "hu" ? "Kanban" : "Kanban"}
              </button>
            </div>

            {/* Compact Mode Toggle */}
            <button
              type="button"
              onClick={() => setCompactMode(!compactMode)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                compactMode 
                  ? "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/10" 
                  : "bg-white border-slate-200 text-slate-550 hover:text-slate-800 hover:bg-slate-200/50"
              }`}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              {systemLanguage === "sk" ? "Kompaktné" : systemLanguage === "hu" ? "Kompakt" : "Compact"}
            </button>

            {/* Ordering Selector */}
            {viewMode === "list" && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0 shadow-sm">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  {systemLanguage === "sk" ? "Usporiadať:" : systemLanguage === "hu" ? "Rendezés:" : "Order By:"}
                </span>
                <select
                  value={orderingMode}
                  onChange={(e: any) => setOrderingMode(e.target.value)}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-transparent border-none focus:ring-0 focus:outline-none cursor-pointer pr-1 select-none"
                  style={{ border: "none", outline: "none", boxShadow: "none" }}
                >
                  <option value="state">{systemLanguage === "sk" ? "Stav (Predvolené)" : systemLanguage === "hu" ? "Állapot" : "State (Default)"}</option>
                  <option value="pm">{systemLanguage === "sk" ? "Projektový Manažér" : systemLanguage === "hu" ? "Projektmenedzser" : "Project Manager"}</option>
                  <option value="created_newest">{systemLanguage === "sk" ? "Najnovšie prvé" : systemLanguage === "hu" ? "Legújabb elöl" : "Created (Newest)"}</option>
                  <option value="created_oldest">{systemLanguage === "sk" ? "Najstaršie prvé" : systemLanguage === "hu" ? "Legrégebbi elöl" : "Created (Oldest)"}</option>
                  <option value="size">{systemLanguage === "sk" ? "Odhadovaný objem" : systemLanguage === "hu" ? "Becsült érték" : "Estimated Size"}</option>
                  <option value="rating">{systemLanguage === "sk" ? "Hodnotenie" : systemLanguage === "hu" ? "Értékelés" : "Rating"}</option>
                </select>
              </div>
            )}

            <button
              onClick={() => {
                setNewLeadStatus(leadStates[0] || "");
                setNewLeadSource(leadSources[0] || "");
                setNewLeadOwner(projectManagers[0] || "");
                setIsModalOpen(true);
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 group hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4 text-white group-hover:rotate-90 transition-transform" /> 
              {getTranslation(systemLanguage, "leads.btn.add").toUpperCase()}
            </button>
          </div>
        </div>

        {/* Collapsible 5-column filter panels */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-blue-50/10 p-3 rounded-2xl border border-blue-50 animate-fade-in">
            {/* Filter 1: Project Manager */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider pl-1">{getTranslation(systemLanguage, "leads.table.pm")}</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200/70 rounded-xl px-2.5 py-1.5">
                <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                <select
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full"
                >
                  <option value="all">{getTranslation(systemLanguage, "leads.filter.manager")}</option>
                  {projectManagers.map(pm => (
                    <option key={pm} value={pm.toLowerCase()}>{pm}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 2: City */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider pl-1">{getTranslation(systemLanguage, "leads.table.city")}</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200/70 rounded-xl px-2.5 py-1.5">
                <MapPin className="h-3.5 w-3.5 text-blue-500" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full"
                >
                  <option value="all">{getTranslation(systemLanguage, "clients.filter.city")}</option>
                  {uniqueCities.map(city => (
                    <option key={city} value={city.toLowerCase()}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 3: Source */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider pl-1">{getTranslation(systemLanguage, "leads.table.source")}</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200/70 rounded-xl px-2.5 py-1.5">
                <Share2 className="h-3.5 w-3.5 text-blue-500" />
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full"
                >
                  <option value="all">{getTranslation(systemLanguage, "leads.filter.source")}</option>
                  {leadSources.map(src => (
                    <option key={src} value={src.toLowerCase()}>{src}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 4: Client Type */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider pl-1">{getTranslation(systemLanguage, "leads.table.type")}</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200/70 rounded-xl px-2.5 py-1.5">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full"
                >
                  <option value="all">{getTranslation(systemLanguage, "leads.filter.type")}</option>
                  <option value="person">{systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}</option>
                  <option value="business">{systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}</option>
                  <option value="partner">{systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}</option>
                </select>
              </div>
            </div>

            {/* Filter 5: State */}
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider pl-1">{getTranslation(systemLanguage, "leads.table.state")}</span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200/70 rounded-xl px-2.5 py-1.5">
                <Tag className="h-3.5 w-3.5 text-blue-500" />
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full"
                >
                  <option value="all">{getTranslation(systemLanguage, "leads.filter.stage")}</option>
                  {leadStates.map(s => (
                    <option key={s} value={s.toLowerCase()}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {viewMode === "list" ? (
          <div className="overflow-x-auto lg:overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse text-left block lg:table">
              <thead className="hidden lg:table-header-group">
                <tr className="bg-white text-blue-600 text-[10px] font-black uppercase tracking-wider">
                  <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tl-[24px] border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.client")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.city")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.type")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.source")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.pm")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 text-right border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.value")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-4 text-center border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.state")}</th>
                  <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tr-[24px] text-center w-28 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.actions")}</th>
                </tr>
              </thead>

              <tbody className="divide-y-0 lg:divide-y lg:divide-blue-50 text-xs block lg:table-row-group">
                {groupedLeads.map((group) => {
                    const stateColor = group.colorOverride || getSafeStateColor(group.state);
                    const stageTotalValue = group.leads.reduce((acc, curr) => acc + curr.value, 0);

                    return (
                      <React.Fragment key={group.state}>
                        {/* State/PM Group Header Row */}
                        {(orderingMode === "state" || orderingMode === "pm") && (
                          <tr className="bg-slate-50/20 block lg:table-row">
                            <td 
                              colSpan={8} 
                              className={`px-4 lg:px-6 font-bold border-l-4 align-middle select-none border-y border-blue-50/40 block lg:table-cell w-full lg:w-auto ${compactMode ? "py-1.5 lg:py-2" : "py-3 lg:py-3.5"}`}
                              style={{ 
                                borderLeftColor: stateColor,
                                backgroundColor: `${stateColor}06`
                              }}
                            >
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="text-[11px] font-black uppercase tracking-wider font-heading"
                                    style={{ color: stateColor }}
                                  >
                                    {orderingMode === "pm" ? `Project Manager: ${group.state}` : group.state}
                                  </span>
                                  <span 
                                    className="px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider font-sans"
                                    style={{
                                      backgroundColor: `${stateColor}12`,
                                      color: stateColor,
                                      borderColor: `${stateColor}25`
                                    }}
                                  >
                                    {group.leads.length} {group.leads.length === 1 ? "lead" : "leads"}
                                  </span>
                                </div>
                                <span 
                                  className="text-[10px] font-heading font-black tracking-wide"
                                  style={{ color: stateColor }}
                                >
                                  {orderingMode === "pm" ? "MANAGER VALUE" : "STAGE VALUE"}: &euro; {stageTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Lead Rows inside this group */}
                        {group.leads.length === 0 ? (
                          <tr className="block lg:table-row">
                            <td 
                              colSpan={8} 
                              className="py-5 px-6 text-center text-slate-400 select-none uppercase font-black text-[9px] tracking-wider bg-slate-50/10 border-l-4 block lg:table-cell w-full lg:w-auto"
                              style={{ borderLeftColor: `${stateColor}15` }}
                            >
                              No active leads in {group.state}
                            </td>
                          </tr>
                        ) : (
                          group.leads.map((lead) => {
                            const isInlineEditing = editingRowId === lead.id;

                          return (
                            <>
                              <tr 
                                key={lead.id}
                                onMouseEnter={() => setHoveredLeadId(lead.id)}
                                onMouseLeave={() => setHoveredLeadId(null)}
                                className={`block lg:table-row border-b-[3px] border-slate-200/90 lg:border-b-0 p-4 lg:p-0 hover:bg-blue-50/30 transition-colors duration-150 group ${isInlineEditing ? "bg-blue-50/10" : ""}`}
                              >
                              
                              {/* --- COLUMN 1: CLIENT NAME --- */}
                              <td 
                                onClick={() => {
                                  if (!isInlineEditing) {
                                    window.location.hash = `lead-${lead.id}`;
                                  }
                                }}
                                className={`block lg:table-cell px-0 lg:px-6 font-bold text-slate-900 cursor-pointer mb-2 lg:mb-0 w-full lg:w-auto ${nameCellPy}`}
                              >
                                {isInlineEditing ? (
                                  <input
                                    type="text"
                                    value={inlineName}
                                    onChange={(e) => setInlineName(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-2.5 py-1 rounded bg-white border border-blue-300 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                ) : (
                                  <div className="flex items-center gap-2.5 w-full">
                                    <div className={`rounded-lg bg-blue-100 text-blue-700 font-heading font-black flex items-center justify-center shrink-0 shadow-inner ${
                                      compactMode ? "h-5.5 w-5.5 text-[8px]" : "h-7 w-7 text-[9px]"
                                    }`}>
                                      {getInitials(lead.name)}
                                    </div>
                                    <div className="flex flex-col justify-center">
                                      <span className="line-clamp-1 border-b border-transparent hover:border-blue-400/50 transition-all text-sm font-bold text-slate-900 leading-tight">{lead.name}</span>
                                      {!compactMode && (
                                        <div className="scale-90 origin-left mt-0.5">
                                          {renderStars(lead.rating || 0, (newRating) => {
                                            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, rating: newRating } : l));
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* --- COLUMN 2: CITY --- */}
                              <td 
                                onClick={() => !isInlineEditing && startInlineEdit(lead)}
                                className={`inline-flex items-center lg:table-cell px-0 lg:px-4 text-slate-500 font-semibold cursor-pointer mr-3.5 ${cellPy}`}
                              >
                                {isInlineEditing ? (
                                  <input
                                    type="text"
                                    value={inlineCity}
                                    onChange={(e) => setInlineCity(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-2.5 py-1 rounded bg-white border border-blue-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                    <span className="border-b border-transparent hover:border-blue-400/50 transition-all text-slate-650">{lead.city}</span>
                                  </div>
                                )}
                              </td>

                              {/* --- COLUMN 3: CLIENT TYPE --- */}
                              <td 
                                onClick={() => !isInlineEditing && startInlineEdit(lead)}
                                className={`inline-flex items-center lg:table-cell px-0 lg:px-4 cursor-pointer mr-3.5 ${cellPy}`}
                              >
                                {isInlineEditing ? (
                                  <select
                                    value={inlineType}
                                    onChange={(e) => setInlineType(e.target.value as any)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-2 py-1 rounded bg-white border border-blue-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="person">Person</option>
                                    <option value="business">Business</option>
                                    <option value="partner">Partner</option>
                                  </select>
                                ) : (
                                  <div className="hover:opacity-85 transition-opacity">
                                    {lead.clientType === "business" && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Briefcase className="h-2.5 w-2.5" /> Business
                                      </span>
                                    )}
                                    {lead.clientType === "partner" && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                        <Handshake className="h-2.5 w-2.5" /> Partner
                                      </span>
                                    )}
                                    {lead.clientType === "person" && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                        <User className="h-2.5 w-2.5" /> Person
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* --- COLUMN 4: LEAD SOURCE --- */}
                              <td 
                                onClick={() => !isInlineEditing && startInlineEdit(lead)}
                                className={`inline-flex items-center lg:table-cell px-0 lg:px-4 cursor-pointer mr-3.5 ${cellPy}`}
                              >
                                {isInlineEditing ? (
                                  <select
                                    value={inlineSource}
                                    onChange={(e) => setInlineSource(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-2 py-1 rounded bg-white border border-blue-300 text-xs uppercase font-extrabold focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    {leadSources.map(src => (
                                      <option key={src} value={src}>{src}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span 
                                    className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border select-none transition-colors"
                                    style={{
                                      backgroundColor: `${getSafeSourceColor(lead.source)}15`,
                                      color: getSafeSourceColor(lead.source),
                                      borderColor: `${getSafeSourceColor(lead.source)}35`
                                    }}
                                  >
                                    {lead.source}
                                  </span>
                                )}
                              </td>

                              {/* --- COLUMN 5: PROJECT MANAGER --- */}
                               <td 
                                 onClick={() => !isInlineEditing && startInlineEdit(lead)}
                                 className={`inline-flex items-center lg:table-cell px-0 lg:px-4 text-slate-500 font-medium cursor-pointer mr-3.5 ${cellPy}`}
                               >
                                 {isInlineEditing ? (
                                   <select
                                     value={inlineOwner}
                                     onChange={(e) => setInlineOwner(e.target.value)}
                                     onClick={(e) => e.stopPropagation()}
                                     className="w-full px-2 py-1 rounded bg-white border border-blue-300 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                                   >
                                     {projectManagers.map(pm => (
                                       <option key={pm} value={pm}>{pm}</option>
                                     ))}
                                   </select>
                                 ) : (
                                   <div className="flex items-center gap-1.5">
                                     <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">PM:</span>
                                     <span 
                                       className="px-2.5 py-0.5 lg:py-1 rounded-full border text-[9px] lg:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-sm"
                                       style={{ 
                                         backgroundColor: `${getSafePMColor(lead.owner)}15`, 
                                         color: getSafePMColor(lead.owner), 
                                         borderColor: `${getSafePMColor(lead.owner)}30` 
                                       }}
                                     >
                                       <User className="h-2.5 w-2.5 shrink-0" />
                                       {lead.owner}
                                     </span>
                                   </div>
                                 )}
                               </td>

                              {/* --- COLUMN 6: LEAD VALUE --- */}
                              <td 
                                onClick={() => !isInlineEditing && startInlineEdit(lead)}
                                className={`inline-flex items-center lg:table-cell px-0 lg:px-4 font-heading font-black text-blue-755 cursor-pointer mr-3.5 ${cellPy}`}
                              >
                                {isInlineEditing ? (
                                  <input
                                    type="number"
                                    value={inlineValue}
                                    onChange={(e) => setInlineValue(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-24 px-2 py-1 rounded bg-white border border-blue-300 text-xs text-right focus:outline-none"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">Val:</span>
                                    <span className="border-b border-transparent hover:border-blue-400/50 transition-all font-black text-blue-700">
                                      &euro; {lead.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* --- COLUMN 7: LEAD STATE (Dropdown) --- */}
                              <td className={`inline-flex items-center lg:table-cell px-0 lg:px-4 text-center mr-3.5 border-b border-slate-100 lg:border-b-0 ${cellPy}`}>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider mr-1">Stage:</span>
                                  <StatusSelector 
                                    status={lead.status} 
                                    onChange={(newStatus) => handleUpdateLeadState(lead.id, newStatus)} 
                                  />
                                </div>
                              </td>

                              {/* --- COLUMN 8: ACTIONS --- */}
                              <td className={`block lg:table-cell px-0 lg:px-6 text-center border-t border-slate-100 lg:border-t-0 mt-2.5 lg:mt-0 pt-2.5 lg:pt-3 ${cellPy}`}>
                                {isInlineEditing ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveInlineEdit(lead.id);
                                      }}
                                      className="h-6 w-6 rounded bg-emerald-500 text-white flex items-center justify-center shadow hover:bg-emerald-600 transition-colors"
                                      title="Save Changes"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingRowId(null);
                                      }}
                                      className="h-6 w-6 rounded bg-slate-200 text-slate-650 flex items-center justify-center shadow hover:bg-slate-350 transition-colors"
                                      title="Cancel Inline Edit"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.location.hash = `lead-${lead.id}`;
                                      }}
                                      className="h-7 w-7 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 text-blue-500 flex items-center justify-center transition-all"
                                      title="Open Edit Slideout"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteLead(lead.id, lead.name);
                                      }}
                                      className="h-7 w-7 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-all"
                                      title="Delete Lead"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>

                            </tr>

                            {/* --- RESPONSIVE STATE & SUBSTATE PROGRESS BAR ROW --- */}
                            {!compactMode && (
                              <tr 
                                onMouseEnter={() => setHoveredLeadId(lead.id)}
                                onMouseLeave={() => setHoveredLeadId(null)}
                                className="block lg:table-row border-none hover:bg-transparent"
                              >
                                <td colSpan={8} className="p-0 border-none select-none block lg:table-cell w-full lg:w-auto">
                                  <div 
                                    className="w-full flex items-center gap-[1px] select-none bg-slate-205 transition-all duration-300 overflow-hidden"
                                    style={{ height: hoveredLeadId === lead.id ? "16px" : "3px" }}
                                  >
                                    {(() => {
                                      const isStateClosed = (stateName: string) => {
                                        const sLower = stateName.toLowerCase();
                                        const parent = leadStateParents[sLower];
                                        return sLower === "accepted" || sLower === "rejected" || parent === "accepted" || parent === "rejected";
                                      };

                                      const nonClosedStates = orderedAllStates.filter(s => !isStateClosed(s));
                                      const closedStates = orderedAllStates.filter(s => isStateClosed(s));

                                      const leadStatusLower = (lead.status || "").toLowerCase();
                                      const isLeadClosed = isStateClosed(leadStatusLower);

                                      // Create the list of renderable segments
                                      const segments: {
                                        key: string;
                                        title: string;
                                        isPastOrCurrent: boolean;
                                        color: string;
                                        tooltip: string;
                                      }[] = [];

                                      // 1. Add non-closed states
                                      nonClosedStates.forEach((state) => {
                                        const stateLower = state.toLowerCase();
                                        const sIndex = orderedAllStates.findIndex(s => s.toLowerCase() === stateLower);
                                        const cIndex = orderedAllStates.findIndex(s => s.toLowerCase() === leadStatusLower);
                                        
                                        // If the lead is in any closed state, then all non-closed states are in the past
                                        const isPastOrCurrent = isLeadClosed || (sIndex !== -1 && cIndex !== -1 && sIndex <= cIndex);
                                        const stateColor = getSafeStateColor(state);
                                        const bgStyle = isPastOrCurrent ? stateColor : "#cbd5e1";

                                        segments.push({
                                          key: state,
                                          title: state,
                                          isPastOrCurrent,
                                          color: bgStyle,
                                          tooltip: `${state} ${isPastOrCurrent ? "(Current/Past)" : "(Upcoming)"}`
                                        });
                                      });

                                      // 2. Add the combined final segment if there are closed states
                                      if (closedStates.length > 0) {
                                        const combinedTitle = closedStates.join(" / ");
                                        const activeColor = isLeadClosed ? getSafeStateColor(lead.status) : "#cbd5e1";

                                        segments.push({
                                          key: "closed_states_combined",
                                          title: combinedTitle,
                                          isPastOrCurrent: isLeadClosed,
                                          color: activeColor,
                                          tooltip: isLeadClosed ? `Closed (${lead.status})` : `Closed (${combinedTitle})`
                                        });
                                      }

                                      return segments.map((seg, index) => {
                                        const isFirst = index === 0;
                                        const isLast = index === segments.length - 1;
                                        
                                        let segmentClipPath = "none";
                                        if (segments.length > 1) {
                                          if (isFirst) {
                                            segmentClipPath = "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%)";
                                          } else if (isLast) {
                                            segmentClipPath = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 4px 50%)";
                                          } else {
                                            segmentClipPath = "polygon(0% 0%, calc(100% - 4px) 0%, 100% 50%, calc(100% - 4px) 100%, 0% 100%, 4px 50%)";
                                          }
                                        }

                                        const textColor = seg.isPastOrCurrent ? "#ffffff" : "#334155";

                                        return (
                                          <div 
                                            key={seg.key}
                                            className="flex-1 h-full flex items-center justify-center relative transition-all duration-300"
                                            style={{ 
                                              backgroundColor: seg.color,
                                              clipPath: segmentClipPath
                                            }}
                                            title={seg.tooltip}
                                          >
                                            {hoveredLeadId === lead.id && (
                                              <span 
                                                className="text-[10px] font-black uppercase tracking-wider px-1 truncate"
                                                style={{ 
                                                  fontSize: "10px", 
                                                  lineHeight: "10px",
                                                  color: textColor
                                                }}
                                              >
                                                {seg.title}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                      )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-row gap-5 overflow-x-auto p-5 pb-6 items-stretch min-h-[580px] scrollbar-thin select-none bg-slate-50/20">
            {stateGroupedLeads.map((group, index) => {
              const stateColor = getSafeStateColor(group.state);
              const totalVal = group.leads.reduce((sum, l) => sum + l.value, 0);
              const columnState = group.state.toLowerCase();
              const isOver = dragOverColumn === columnState;
              
              return (
                <React.Fragment key={group.state}>
                  {index > 0 && (
                    <div className="w-[1.5px] bg-slate-200/50 my-2 shrink-0 self-stretch rounded-full" />
                  )}
                  <div 
                    onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(columnState);
                  }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverColumn(null);
                    if (draggedLeadId) {
                      handleLeadDrop(draggedLeadId, group.state);
                    }
                  }}
                  className={`flex flex-col min-w-[285px] max-w-[320px] flex-1 rounded-[26px] bg-slate-50/40 border-2 transition-all duration-300 ${
                    compactMode ? "p-2.5 gap-2" : "p-4 gap-4"
                  } ${
                    isOver 
                      ? "border-dashed border-blue-400 bg-blue-50/15 scale-[0.99] shadow-inner" 
                      : "border-slate-100"
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stateColor }} />
                      <span className="text-[11px] font-black uppercase text-slate-800 tracking-wider">
                        {group.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-205 leading-none shrink-0 shadow-sm">
                        {group.leads.length}
                      </span>
                      <span className="text-[10px] font-extrabold text-indigo-700">
                        &euro;{totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Column Body - Cards List */}
                  <div className={`flex-1 flex flex-col overflow-y-auto max-h-[490px] pr-1.5 scrollbar-thin ${compactMode ? "gap-2" : "gap-3"}`}>
                    {group.leads.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[10px] font-black text-slate-350 uppercase tracking-widest border border-dashed border-slate-200 rounded-[20px] min-h-[250px] bg-slate-100/10">
                        No Leads
                      </div>
                    ) : (
                      group.leads.map((lead) => {
                        const leadSource = lead.source || "";
                        const pmName = lead.owner || "";
                        const initials = pmName
                          ? pmName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
                          : "?";
                        
                        return (
                          <div
                            key={lead.id}
                            draggable="true"
                            onDragStart={() => {
                              setDraggedLeadId(lead.id);
                            }}
                            onDragEnd={() => {
                              setDraggedLeadId(null);
                            }}
                            onClick={() => {
                              window.location.hash = `lead-${lead.id}`;
                            }}
                            className={`glass-panel rounded-[22px] bg-white border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer relative group flex flex-col ${
                              compactMode ? "p-2 pb-2.5 pt-1 gap-1" : "p-4 gap-2.5"
                            }`}
                          >
                            {/* Row 1: Hover Actions */}
                            <div className={`flex items-center justify-end shrink-0 ${compactMode ? "h-2" : "h-4"}`}>
                              {/* Card quick actions on hover */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.hash = `lead-${lead.id}`;
                                  }}
                                  className="p-1 rounded bg-slate-50 hover:bg-blue-50 text-blue-500 border border-slate-200/50 cursor-pointer"
                                  title="Edit Lead"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLead(lead.id, lead.name);
                                  }}
                                  className="p-1 rounded bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/50 cursor-pointer"
                                  title="Delete Lead"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

                            {/* Row 2: Lead Name & Dots Rating Stack */}
                            <div className="flex flex-col">
                              <h4 className="text-xs font-black text-slate-800 leading-snug group-hover:text-blue-600 transition-colors uppercase tracking-wider">
                                {lead.name}
                              </h4>
                              {!compactMode && (
                                <div className="scale-85 origin-left mt-1">
                                  {renderStars(lead.rating || 0, (newRating) => {
                                    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, rating: newRating } : l));
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Row 4: Location & Client Type Badges */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <div className="flex items-center gap-0.5 text-[8.5px] font-bold text-slate-500">
                                <MapPin className="h-3 w-3 text-slate-450 shrink-0" />
                                <span>{lead.city}</span>
                              </div>

                              {lead.clientType && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border select-none leading-none ${
                                  lead.clientType === "business" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                  lead.clientType === "partner" ? "bg-amber-50 text-amber-700 border-amber-100" :
                                  "bg-blue-50 text-blue-700 border-blue-100"
                                }`}>
                                  {lead.clientType}
                                </span>
                              )}
                            </div>

                            {/* Card Footer: Value, Avatar PM, Source */}
                            <div className={`flex items-center justify-between border-t border-slate-100 shrink-0 ${compactMode ? "pt-1.5 mt-0.5" : "pt-2.5 mt-1"}`}>
                              {/* Price Tag */}
                              <span className="text-xs font-black text-slate-900 leading-none">
                                &euro;{lead.value.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                              </span>

                              {/* PM Avatar & Source */}
                              <div className="flex items-center gap-2">
                                <span 
                                  className="px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase border select-none leading-none tracking-wider"
                                  style={{
                                    backgroundColor: `${getSafeSourceColor(leadSource)}15`,
                                    color: getSafeSourceColor(leadSource),
                                    borderColor: `${getSafeSourceColor(leadSource)}35`
                                  }}
                                >
                                  {leadSource}
                                </span>

                                {pmName && (
                                  <div 
                                    className={`rounded-full flex items-center justify-center font-black text-white shadow-sm border border-white ${
                                      compactMode ? "h-4.5 w-4.5 text-[6.5px]" : "h-5.5 w-5.5 text-[7.5px]"
                                    }`}
                                    style={{ backgroundColor: getSafePMColor(pmName) }}
                                    title={pmName}
                                  >
                                    {initials}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Substate Selector Dropdown */}
                            {(() => {
                              const activeMain = group.state.toLowerCase();
                              const activeSubstates = leadStates.filter(s => leadStateParents[s.toLowerCase()] === activeMain);
                              const hasSubstates = activeSubstates.length > 0;
                              
                              if (!hasSubstates) return null;
                              
                              const currentSub = lead.status.toLowerCase() === activeMain ? "" : lead.status.toLowerCase();
                              const mainColor = getSafeStateColor(activeMain);
                              const subColor = currentSub ? getSafeStateColor(currentSub) : mainColor;

                              return (
                                <div className="mt-2 pt-2 border-t border-slate-100/60 flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">↳ Substate:</span>
                                  <select
                                    value={currentSub}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleUpdateLeadState(lead.id, val ? val : activeMain);
                                    }}
                                    className="flex-1 text-[9px] font-extrabold uppercase tracking-wider border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 transition-all cursor-pointer shadow-sm text-slate-650 hover:opacity-90"
                                    style={{
                                      background: currentSub ? `linear-gradient(to right, ${mainColor}18, ${subColor}18)` : `${mainColor}10`,
                                      color: subColor,
                                      borderColor: `${subColor}30`
                                    }}
                                  >
                                    <option value="" style={{ color: '#475569', background: '#ffffff' }}>
                                      {systemLanguage === "sk" ? "Žiadny podstav" : systemLanguage === "hu" ? "Nincs al-állapot" : "No Substate"}
                                    </option>
                                    {activeSubstates.map(sub => {
                                      const subCol = getSafeStateColor(sub);
                                      return (
                                        <option key={sub} value={sub.toLowerCase()} style={{ color: subCol, background: '#ffffff' }}>
                                          {sub}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })
                    )
                  }
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          </div>
        )}
        <div className="bg-blue-50/20 border-t border-blue-50 p-4 flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-500" />
            <span>Click any cell to edit inline &bull; Slideout opens via Edit button</span>
          </div>
          <div>
            Showing <strong className="text-blue-600">{processedLeads.length}</strong> of {leads.length} leads
          </div>
        </div>
      </div>

      {(isModalOpen || isClosingModal) && (
        <div className={`fixed inset-0 z-[9999] flex items-end justify-center bg-slate-900/35 backdrop-blur-sm ${isClosingModal ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Click backdrop to close */}
          <div className="absolute inset-0" onClick={closeLeadModal} />

          <div 
            className={`w-full max-w-2xl rounded-t-[32px] border-t border-x border-blue-100 shadow-2xl p-7 space-y-6 relative z-10 ${isClosingModal ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}
            style={{ background: "#ffffff", backdropFilter: "none" }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <h3 className="text-md font-heading font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <TableProperties className="h-4.5 w-4.5 text-blue-600" /> Add Incoming Lead Record
                </h3>
                <p className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                  Append new rows to the active {systemName} leads datagrid (Bottom Slideout)
                </p>
              </div>
              <button
                type="button"
                onClick={closeLeadModal}
                className="h-8 w-8 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center text-blue-400 hover:text-blue-800 transition-colors shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Selection *</label>
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setClientMode("new");
                        setNewLeadName("");
                        setNewLeadCity("");
                        setNewLeadType("person");
                        setSelectedExistingClient("");
                      }}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        clientMode === "new" 
                          ? "bg-white text-blue-600 shadow-sm font-black" 
                          : "text-slate-550 hover:text-slate-800 font-bold"
                      }`}
                    >
                      New Client
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClientMode("existing");
                        setNewLeadName("");
                        setNewLeadCity("");
                        setNewLeadType("person");
                        setSelectedExistingClient("");
                      }}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                        clientMode === "existing" 
                          ? "bg-white text-blue-600 shadow-sm font-black" 
                          : "text-slate-550 hover:text-slate-800 font-bold"
                      }`}
                    >
                      Existing Client
                    </button>
                  </div>
                </div>

                {clientMode === "existing" ? (
                  <select
                    required
                    value={selectedExistingClient}
                    onChange={(e) => handleSelectExistingClient(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-850 focus:outline-none focus:bg-white focus:border-blue-500"
                  >
                    <option value="">-- Choose Existing Client --</option>
                    {existingClients.map(client => (
                      <option key={client.name} value={client.name}>
                        {client.name} ({client.city || "No City"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">City *</label>
                  <input
                    type="text"
                    required
                    value={newLeadCity}
                    onChange={(e) => setNewLeadCity(e.target.value)}
                    placeholder="e.g. Bratislava"
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Type *</label>
                  <select
                    value={newLeadType}
                    onChange={(e) => setNewLeadType(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="person">Person</option>
                    <option value="business">Business</option>
                    <option value="partner">Partner</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lead Value *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newLeadValue}
                    onChange={(e) => setNewLeadValue(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project Manager</label>
                  <select
                    value={newLeadOwner}
                    onChange={(e) => setNewLeadOwner(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs text-slate-800 focus:outline-none"
                  >
                    {projectManagers.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">Lead State</label>
                  <div className="pt-1 select-none">
                    <StatusSelector 
                      status={newLeadStatus} 
                      onChange={(newStatus) => setNewLeadStatus(newStatus)} 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lead Source</label>
                  <select
                    value={newLeadSource}
                    onChange={(e) => setNewLeadSource(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-blue-50/10 border border-blue-100 text-xs uppercase font-bold focus:outline-none"
                  >
                    {leadSources.map(source => (
                      <option key={source} value={source.toLowerCase()}>
                        {source}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category interest selection grid */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-4 w-4 text-blue-605" /> Interested Categories / Services
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-blue-50/5 border border-blue-100/30 p-3 rounded-2xl">
                  {leadCategories.map((cat) => {
                    const isChecked = newLeadCategories.includes(cat);
                    return (
                      <label 
                        key={cat}
                        className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl cursor-pointer text-[9px] font-black uppercase transition-all select-none ${
                          isChecked 
                            ? "bg-blue-50 border-blue-300 text-blue-750 shadow-sm" 
                            : "bg-white border-slate-150 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                        }`}
                      >
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewLeadCategories([...newLeadCategories, cat]);
                            } else {
                              setNewLeadCategories(newLeadCategories.filter(c => c !== cat));
                            }
                          }}
                          className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 shrink-0"
                        />
                        <span className="truncate">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lead Priority Rating</label>
                <div className="flex items-center gap-1 bg-slate-50 p-2 rounded-xl border border-slate-150 w-fit">
                  {renderStars(newLeadRating, setNewLeadRating)}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3.5">
                <button
                  type="button"
                  onClick={closeLeadModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-lg shadow-blue-600/25 transition-all flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Inject Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* --- CLIENT INSPECT SLIDEOUT RIGHT DRAWER (Per rules.md) --- */}
      {(selectedClientName || isClosingClient) && (
        <div className={`fixed inset-0 z-[9999] flex justify-end bg-slate-900/35 backdrop-blur-sm ${isClosingClient ? "animate-fade-out" : "animate-fade-in"}`}>
          <div className="flex-1" onClick={closeClientDrawer} />

          <div 
            className={`h-screen w-full sm:w-[500px] border-l border-emerald-100/50 shadow-2xl flex flex-col justify-between p-6 ${isClosingClient ? "animate-slide-out-right" : "animate-slide-in-right"}`}
            style={{ background: "#ffffff", backdropFilter: "none" }}
          >
            
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 text-emerald-700 border border-emerald-200 flex items-center justify-center font-heading font-black text-sm">
                  {getInitials(editClientName || selectedClientName || "")}
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-emerald-650 font-extrabold uppercase tracking-wider">Active Client Profile</span>
                  <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight flex items-center gap-1 mt-0.5">
                    {selectedClientName}
                  </h3>
                </div>
              </div>
              <button
                onClick={closeClientDrawer}
                className="h-8 w-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Inspect / Edit form */}
            <form onSubmit={handleSaveClientDetails} className="flex-1 overflow-y-auto py-5 space-y-5 pr-1 scrollbar-thin">
              
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Profile Name *</label>
                <input
                  type="text"
                  required
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-semibold focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-1"
                />
                <p className="text-[9px] text-slate-400">Changing the client name will automatically re-associate all leads referencing this client.</p>
              </div>

              {/* City */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">City Location Name *</label>
                <input
                  type="text"
                  required
                  value={editClientCity}
                  onChange={(e) => setEditClientCity(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-850 focus:outline-none focus:bg-white focus:border-emerald-500"
                />
              </div>

              {/* Client Type */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Type *</label>
                <select
                  value={editClientType}
                  onChange={(e) => setEditClientType(e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
                >
                  <option value="person">Person</option>
                  <option value="business">Business</option>
                  <option value="partner">Partner</option>
                </select>
              </div>

              {/* Lead Source */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Marketing Source Channel</label>
                <select
                  value={editClientSource}
                  onChange={(e) => setEditClientSource(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs uppercase font-extrabold focus:outline-none"
                >
                  {leadSources.map(source => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Manager */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Primary Project Manager</label>
                <select
                  value={editClientOwner}
                  onChange={(e) => setEditClientOwner(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-850 font-bold focus:outline-none"
                >
                  {projectManagers.map(pm => (
                    <option key={pm} value={pm}>{pm}</option>
                  ))}
                </select>
              </div>

              {/* Nested Associated Leads checklist */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <label className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" /> Associated active leads
                </label>
                
                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-150">
                  {selectedClientName && leads.filter(l => l.name.trim().toLowerCase() === selectedClientName.trim().toLowerCase()).map(lead => (
                    <div key={lead.id} className="flex justify-between items-center text-xs border-b border-white pb-2 last:border-b-0 last:pb-0">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{lead.name} ({lead.city})</span>
                        <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Registered inflow: {lead.createdAt}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-black text-emerald-700">&euro; {lead.value.toLocaleString()}</span>
                        <div className="mt-1 select-none">
                          <StatusSelector 
                            status={lead.status} 
                            onChange={() => {}} 
                            isEditing={false} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </form>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-150 flex gap-3">
              <button
                type="button"
                onClick={closeClientDrawer}
                className="flex-1 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 text-xs font-bold transition-all"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveClientDetails}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" /> Save Client Profile
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
