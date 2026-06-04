import React, { useState, useMemo, useEffect } from "react";
import { 
  Users, MapPin, Search, Clock, User, Briefcase, Handshake, 
  Euro, UserCheck, Check, Layers, Phone, Mail, Globe, 
  Calendar, ArrowLeft, Plus, TrendingUp, PencilLine, FileText,
  X, FolderOpen, Download, Trash2, SlidersHorizontal
} from "lucide-react";
import type { Lead, TimelineEvent, Task } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface ClientsViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  projectManagers: string[];
  leadSources: string[];
  initialSelectedClient?: string;
  systemLanguage: Language;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  leadCategories: string[];
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  leads,
  setLeads,
  projectManagers,
  leadSources,
  initialSelectedClient,
  systemLanguage,
  tasks: _tasks,
  setTasks,
  leadCategories
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterCity, setFilterCity] = useState("");
  const [filterPM, setFilterPM] = useState("");
  
  // State hook to toggle detail card edit mode
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  /**
   * Dynamic Client Profile Aggregator:
   * Consolidates raw leads matching the same trimmed, case-insensitive client name into
   * unified Client Profile entities. It accumulates financial values, groups timeline activities,
   * compiles corporate registers, and sorts events chronologically (newest first).
   */
  const clientProfiles = useMemo(() => {
    const profilesMap: Record<string, {
      name: string;
      city: string;
      clientType: "person" | "business" | "partner";
      source: string;
      owner: string;
      totalValue: number;
      leadsCount: number;
      associatedLeads: Lead[];
      
      // Extended Metadata fields
      phone: string;
      email: string;
      street: string;
      postalCode: string;
      country: string;
      companyId: string;
      taxId: string;
      vatId: string;
      contactPerson: string;
      website: string;
      timeline: TimelineEvent[];
      categories: string[];
    }> = {};

    leads.forEach(lead => {
      const clientKey = lead.name.trim().toLowerCase();
      if (!profilesMap[clientKey]) {
        profilesMap[clientKey] = {
          name: lead.name,
          city: lead.city || "",
          clientType: lead.clientType || "person",
          source: lead.source || "website",
          owner: lead.owner || "",
          totalValue: 0,
          leadsCount: 0,
          associatedLeads: [],
          
          phone: lead.phone || "",
          email: lead.email || "",
          street: lead.address?.street || "",
          postalCode: lead.address?.postalCode || "",
          country: lead.address?.country || "Slovakia",
          companyId: lead.companyId || "",
          taxId: lead.taxId || "",
          vatId: lead.vatId || "",
          contactPerson: lead.contactPerson || "",
          website: lead.website || "",
          timeline: lead.timeline || [],
          categories: []
        };
      }
      profilesMap[clientKey].totalValue += lead.value;
      profilesMap[clientKey].leadsCount += 1;
      profilesMap[clientKey].associatedLeads.push(lead);

      if (lead.categories && Array.isArray(lead.categories)) {
        lead.categories.forEach(cat => {
          if (!profilesMap[clientKey].categories.includes(cat)) {
            profilesMap[clientKey].categories.push(cat);
          }
        });
      }
      
      // Merge unique timeline events safely
      if (lead.timeline && lead.timeline.length > 0) {
        lead.timeline.forEach(event => {
          if (!profilesMap[clientKey].timeline.some(e => e.id === event.id)) {
            profilesMap[clientKey].timeline.push(event);
          }
        });
      }
    });

    // Sort timelines chronologically (Newest First)
    Object.values(profilesMap).forEach(profile => {
      profile.timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    return Object.values(profilesMap);
  }, [leads, leadSources]);

  // Find active client details based on URL deep routing
  const activeClient = useMemo(() => {
    if (!initialSelectedClient) return null;
    return clientProfiles.find(c => c.name.toLowerCase() === initialSelectedClient.toLowerCase()) || null;
  }, [clientProfiles, initialSelectedClient]);

  // Retrieve current user session to authenticate API requests to mail_broker.php
  const currentUser = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("crm_current_user_rbac");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }, []);

  const userEmailSettings = useMemo(() => {
    try {
      if (currentUser && currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        return metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing user emailSettings", e);
    }
    return null;
  }, [currentUser]);

  const [clientEmails, setClientEmails] = useState<TimelineEvent[]>([]);
  const [isLoadingMails, setIsLoadingMails] = useState(false);

  useEffect(() => {
    if (!activeClient || !activeClient.email || !userEmailSettings || !userEmailSettings.isValidated) {
      setClientEmails([]);
      return;
    }

    const fetchClientMails = async () => {
      setIsLoadingMails(true);
      try {
        const inboxRes = await fetch(
          `/api/mail_broker.php?action=get_emails&folder=INBOX&email=${encodeURIComponent(activeClient.email)}`,
          { headers: { "X-User-Email": currentUser.email } }
        );
        const inboxData = await inboxRes.json();
        
        let sentEmails: any[] = [];
        try {
          const sentRes = await fetch(
            `/api/mail_broker.php?action=get_emails&folder=Sent&email=${encodeURIComponent(activeClient.email)}`,
            { headers: { "X-User-Email": currentUser.email } }
          );
          const sentData = await sentRes.json();
          if (sentData.success && Array.isArray(sentData.emails)) {
            sentEmails = sentData.emails;
          }
        } catch (e) {}

        const combinedEmails: TimelineEvent[] = [];
        
        const processMail = (mail: any) => {
          return {
            id: `email-${mail.uid}`,
            type: "email" as const,
            timestamp: mail.date.substring(0, 16),
            title: mail.subject || "(No Subject)",
            content: `From: ${mail.from.name || mail.from.address} <${mail.from.address}>\nDate: ${mail.date}\n\nTo view this email or reply, please open the Mail Client.`,
            seen: mail.seen
          };
        };

        if (inboxData.success && Array.isArray(inboxData.emails)) {
          inboxData.emails.forEach((m: any) => combinedEmails.push(processMail(m)));
        }
        sentEmails.forEach((m: any) => combinedEmails.push(processMail(m)));

        setClientEmails(combinedEmails);
      } catch (err) {
        console.error("Failed to load timeline client emails", err);
      } finally {
        setIsLoadingMails(false);
      }
    };

    fetchClientMails();
  }, [activeClient, userEmailSettings, currentUser]);

  const activeClientTimeline = useMemo(() => {
    if (!activeClient) return [];
    const standardEvents = activeClient.timeline || [];
    const emailIds = new Set(clientEmails.map(e => e.id));
    const merged = [
      ...standardEvents.filter(e => !emailIds.has(e.id)),
      ...clientEmails
    ];
    return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [activeClient, clientEmails]);

  // Group events into future and past relative to current timestamp
  const { futureEvents, pastEvents } = useMemo(() => {
    if (!activeClient) return { futureEvents: [], pastEvents: [] };
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);
    
    const future = activeClientTimeline
      .filter(e => e.timestamp > nowStr)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // ascending: closest future event at the bottom
      
    const past = activeClientTimeline
      .filter(e => e.timestamp <= nowStr)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // descending: most recent past event at the top
      
    return { futureEvents: future, pastEvents: past };
  }, [activeClient, activeClientTimeline]);

  // --- CLIENT DETAIL VIEW FORM STATE HOOKS ---
  const [profileName, setProfileName] = useState("");
  const [profileStreet, setProfileStreet] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profilePostalCode, setProfilePostalCode] = useState("");
  const [profileCountry, setProfileCountry] = useState("Slovakia");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileType, setProfileType] = useState<"person" | "business" | "partner">("person");
  const [profileOwner, setProfileOwner] = useState("");
  const [profileCompanyId, setProfileCompanyId] = useState("");
  const [profileTaxId, setProfileTaxId] = useState("");
  const [profileVatId, setProfileVatId] = useState("");
  const [profileContactPerson, setProfileContactPerson] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileCategories, setProfileCategories] = useState<string[]>([]);

  // --- EVENT TIMELINE LOGGING STATES ---
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

  // --- DETAIL TABS & DOCUMENT UPLOADER STATE ---
  const [activeDetailTab, setActiveDetailTab] = useState<"timeline" | "files">("timeline");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSize, setUploadFileSize] = useState("");
  const [uploadFileType, setUploadFileType] = useState<"offer" | "contract" | "invoice">("offer");
  const [uploadDescription, setUploadDescription] = useState("");

  // Sync form states with activeClient properties when deep-route is loaded
  useEffect(() => {
    if (activeClient) {
      setProfileName(activeClient.name);
      setProfileStreet(activeClient.street);
      setProfileCity(activeClient.city);
      setProfilePostalCode(activeClient.postalCode);
      setProfileCountry(activeClient.country);
      setProfilePhone(activeClient.phone);
      setProfileEmail(activeClient.email);
      setProfileType(activeClient.clientType);
      setProfileOwner(activeClient.owner);
      setProfileCompanyId(activeClient.companyId);
      setProfileTaxId(activeClient.taxId);
      setProfileVatId(activeClient.vatId);
      setProfileContactPerson(activeClient.contactPerson);
      setProfileWebsite(activeClient.website);
      setProfileCategories(activeClient.categories || []);
      setIsEditingProfile(false); // Reset to read-only by default on transition
    }
  }, [activeClient]);

  // --- PERSIST DUAL-PANEL CLIENT DETAILS CHANGES ---
  const handleUpdateClientProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient) return;
    if (!profileName.trim()) {
      alert("Client Name is strictly required!");
      return;
    }

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        return {
          ...lead,
          name: profileName.trim(),
          city: profileCity.trim(),
          clientType: profileType,
          owner: profileOwner,
          phone: profilePhone.trim(),
          email: profileEmail.trim(),
          address: {
            street: profileStreet.trim(),
            city: profileCity.trim(),
            postalCode: profilePostalCode.trim(),
            country: profileCountry
          },
          companyId: profileType !== "person" ? profileCompanyId.trim() : undefined,
          taxId: profileType !== "person" ? profileTaxId.trim() : undefined,
          vatId: profileType !== "person" ? profileVatId.trim() : undefined,
          contactPerson: profileType !== "person" ? profileContactPerson.trim() : undefined,
          website: profileType !== "person" ? profileWebsite.trim() : undefined,
          categories: profileCategories
        };
      }
      return lead;
    }));

    setIsEditingProfile(false); // Toggle back to read-only
    // Update dynamic URL to reflect new client profile name
    window.location.hash = `client-${encodeURIComponent(profileName.trim())}`;
    alert("Client profile parameters successfully updated!");
  };

  // --- LOG A NEW EVENT INTO TIMELINE ---
  const handleAddTimelineEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !logType) return;
    if (!logContent.trim()) {
      alert("Please specify a description log note!");
      return;
    }

    // Auto-generate title based on event type
    const getEventDefaultTitle = (type: string) => {
      switch (type) {
        case "phone": return "Phone Call Logged";
        case "email": return "Email Logged";
        case "note": return "Internal Note Added";
        case "offer": return "Formal Offer Submitted";
        case "appointment": return "Meeting Scheduled";
        default: return "Activity Logged";
      }
    };

    const newEvent: TimelineEvent = {
      id: `ev-${Date.now()}`,
      type: logType,
      timestamp: `${logDate} ${logTimeOfEvent}`,
      title: getEventDefaultTitle(logType),
      content: logContent.trim()
    };

    if (logType === "offer") {
      const amt = parseFloat(logAmount);
      if (!isNaN(amt)) newEvent.amount = amt;
      if (logFileName) {
        newEvent.fileName = logFileName;
        newEvent.fileSize = logFileSize;
        newEvent.fileType = logFileType;
      }
    } else if (logType === "appointment") {
      newEvent.extraTime = logTime;
    }

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        const currentTimeline = lead.timeline || [];
        return {
          ...lead,
          timeline: [newEvent, ...currentTimeline]
        };
      }
      return lead;
    }));

    // Auto-create PM task if the event is in the future
    const eventDateTime = new Date(`${logDate}T${logTimeOfEvent}:00`);
    if (eventDateTime.getTime() > Date.now()) {
      let deadlineVal = logDate;

      // Find original lead from activeClient
      const matchedLead = leads.find(l => l.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase());
      const leadOwner = matchedLead?.owner || "Erik";
      const leadId = matchedLead?.id;

      const taskTitle = systemLanguage === "sk" 
        ? `Budúca udalosť: ${activeClient.name} (${getEventDefaultTitle(logType)})`
        : systemLanguage === "hu"
          ? `Jövőbeli esemény: ${activeClient.name} (${getEventDefaultTitle(logType)})`
          : `Future Event: ${activeClient.name} (${getEventDefaultTitle(logType)})`;

      const autoPMTask: Task = {
        id: `task-${Date.now()}`,
        title: taskTitle,
        description: logContent.trim() || `Scheduled for ${logDate} ${logTimeOfEvent}`,
        status: "todo",
        priority: "medium",
        deadline: deadlineVal,
        owner: leadOwner,
        assignedUsers: [leadOwner],
        relatedLeadId: leadId,
        isLocking: false
      };

      setTasks(prev => [autoPMTask, ...prev]);
    }

    setLogContent("");
    setLogAmount("");
    setLogTime("");
    setLogFileName("");
    setLogFileSize("");
    setLogFileType("offer");
    setLogType(null); // Reset selector so fields close smoothly
    
    // Reset date/time to now
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    setLogDate((new Date(Date.now() - tzOffset)).toISOString().split("T")[0]);
    setLogTimeOfEvent(new Date().toTimeString().substring(0, 5));
    alert("Event logged successfully!");
  };

  const handleAttachFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !uploadFileName) return;

    const newEvent: TimelineEvent = {
      id: "evt_" + Math.random().toString(36).substring(2, 9),
      type: "offer",
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
      title: `Document Attached: ${uploadFileName}`,
      content: uploadDescription.trim() || `Attached document for category ${uploadFileType}.`,
      fileName: uploadFileName,
      fileSize: uploadFileSize,
      fileType: uploadFileType,
    };

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        const currentTimeline = lead.timeline || [];
        return {
          ...lead,
          timeline: [newEvent, ...currentTimeline]
        };
      }
      return lead;
    }));

    setUploadFileName("");
    setUploadFileSize("");
    setUploadDescription("");
    alert("Document attached successfully!");
  };

  // Extract unique cities dynamically from the active customer registry
  const uniqueCities = useMemo(() => {
    const cities = new Set(clientProfiles.map(c => c.city).filter(Boolean));
    return Array.from(cities).sort();
  }, [clientProfiles]);

  // Filter clients list
  const processedClients = useMemo(() => {
    return clientProfiles
      .filter(client => {
        const matchesSearch = 
          searchQuery === "" ||
          client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.owner.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesType = selectedType === "all" || client.clientType === selectedType;

        const matchesCity = filterCity === "" || client.city.toLowerCase() === filterCity.toLowerCase();
        
        const matchesPM = filterPM === "" || client.owner.toLowerCase() === filterPM.toLowerCase();

        return matchesSearch && matchesType && matchesCity && matchesPM;
      });
  }, [clientProfiles, searchQuery, selectedType, filterCity, filterPM]);



  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Preset European countries dropdown
  const europeanCountries = [
    "Slovakia", "Czech Republic", "Austria", "Germany", "Hungary", 
    "Poland", "France", "Italy", "Spain", "United Kingdom", 
    "Netherlands", "Belgium", "Switzerland"
  ];

  // Helper to color-code events
  const getEventColors = (type: string) => {
    switch (type) {
      case "phone":
        return {
          dotBg: "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-500/20",
          cardBorder: "border-l-4 border-l-blue-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-blue-50 text-blue-700 border-blue-200"
        };
      case "email":
        return {
          dotBg: "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-500/20",
          cardBorder: "border-l-4 border-l-indigo-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200"
        };
      case "note":
        return {
          dotBg: "bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-500/20",
          cardBorder: "border-l-4 border-l-amber-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-amber-50 text-amber-700 border-amber-200"
        };
      case "offer":
        return {
          dotBg: "bg-emerald-600 border-emerald-700 text-white shadow-md shadow-emerald-500/20",
          cardBorder: "border-l-4 border-l-emerald-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200"
        };
      case "appointment":
        return {
          dotBg: "bg-rose-600 border-rose-700 text-white shadow-md shadow-rose-500/20",
          cardBorder: "border-l-4 border-l-rose-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-rose-50 text-rose-700 border-rose-200"
        };
      default:
        return {
          dotBg: "bg-slate-600 border-slate-700 text-white shadow-md",
          cardBorder: "border-l-4 border-l-slate-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-slate-50 text-slate-750 border-slate-200"
        };
    }
  };

  // Helper to render lucide icon for event
  const renderEventIcon = (type: string) => {
    switch (type) {
      case "phone": return <Phone className="h-3 w-3 stroke-[2.5]" />;
      case "email": return <Mail className="h-3 w-3 stroke-[2.5]" />;
      case "note": return <FileText className="h-3 w-3 stroke-[2.5]" />;
      case "offer": return <Euro className="h-3 w-3 stroke-[2.5]" />;
      case "appointment": return <Calendar className="h-3 w-3 stroke-[2.5]" />;
      default: return <Clock className="h-3 w-3 stroke-[2.5]" />;
    }
  };

  // ----------------------------------------------------
  // --- SUB-RENDER ROUTE: DEDICATED CLIENT DETAIL VIEW ---
  // ----------------------------------------------------
  if (initialSelectedClient) {
    if (!activeClient) {
      return (
        <div className="p-8 glass-panel rounded-[28px] border-2 border-red-400 bg-white shadow-glass text-center space-y-4">
          <div className="text-4xl text-rose-600 animate-bounce">⚠️</div>
          <h2 className="text-xl font-heading font-black text-slate-900 uppercase tracking-wide">Client Profile Not Found</h2>
          <p className="text-xs text-slate-600 font-semibold">The profile name '{initialSelectedClient}' could not be resolved in the active database.</p>
          <button 
            onClick={() => { window.location.hash = "clients"; }}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
          >
            Back to Clients List
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
        {/* Back header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { window.location.hash = "clients"; }}
            className="px-4.5 py-3 rounded-2xl bg-white border-2 border-slate-300 text-slate-700 hover:text-slate-955 hover:border-slate-850 transition-all text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.back_to_clients")}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 border-2 border-emerald-300 px-4 py-2 rounded-2xl shadow-inner">
              {getTranslation(systemLanguage, "common.client_value")}: &euro; {activeClient.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Master Dual-Panel Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL: Comprehensive Details Form */}
          <div className="lg:col-span-5 glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl space-y-6">
            <div className="border-b-2 border-slate-150 pb-4 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-black text-sm shadow-md">
                  {getInitials(profileName || activeClient.name)}
                </div>
                <div>
                  <h3 className="text-md font-heading font-black text-slate-900 uppercase tracking-tight">{getTranslation(systemLanguage, "profile.client_contact")}</h3>
                  <p className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wide mt-0.5">{getTranslation(systemLanguage, "profile.edit_desc")}</p>
                </div>
              </div>
              
              {/* Pencil Toggle edit button */}
              <button
                type="button"
                onClick={() => {
                  if (isEditingProfile) {
                    // Revert changes on toggle off
                    setProfileName(activeClient.name);
                    setProfileStreet(activeClient.street);
                    setProfileCity(activeClient.city);
                    setProfilePostalCode(activeClient.postalCode);
                    setProfileCountry(activeClient.country);
                    setProfilePhone(activeClient.phone);
                    setProfileEmail(activeClient.email);
                    setProfileType(activeClient.clientType);
                    setProfileOwner(activeClient.owner);
                    setProfileCompanyId(activeClient.companyId);
                    setProfileTaxId(activeClient.taxId);
                    setProfileVatId(activeClient.vatId);
                    setProfileContactPerson(activeClient.contactPerson);
                    setProfileWebsite(activeClient.website);
                  }
                  setIsEditingProfile(!isEditingProfile);
                }}
                className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all border-2 shadow-sm ${
                  isEditingProfile 
                    ? "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100" 
                    : "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                }`}
                title={isEditingProfile ? "Cancel editing" : "Edit Profile details"}
              >
                {isEditingProfile ? <X className="h-4.5 w-4.5 stroke-[2.5]" /> : <PencilLine className="h-4.5 w-4.5 stroke-[2.5]" />}
              </button>
            </div>

            <form onSubmit={handleUpdateClientProfile} className="space-y-4 text-xs font-bold">
              
              {/* Name & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.client_name")}</label>
                  <input
                    type="text"
                    required
                    readOnly={!isEditingProfile}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingProfile 
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                        : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.client_type")}</label>
                  {isEditingProfile ? (
                    <select
                      value={profileType}
                      onChange={(e) => setProfileType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-800"
                    >
                      <option value="person">{systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}</option>
                      <option value="business">{systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}</option>
                      <option value="partner">{systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}</option>
                    </select>
                  ) : (
                    <div className="pt-2 pl-0 text-slate-900 text-sm font-black uppercase tracking-wider cursor-default select-all">
                      {profileType === "business" && `🏢 ${systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}`}
                      {profileType === "partner" && `🤝 ${systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}`}
                      {profileType === "person" && `👤 ${systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-500" /> {getTranslation(systemLanguage, "profile.phone")}</label>
                  <input
                    type="text"
                    required
                    readOnly={!isEditingProfile}
                    placeholder="e.g. +421 905..."
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingProfile 
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                        : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Mail className="h-3 w-3 text-emerald-500" /> {getTranslation(systemLanguage, "profile.email")}</label>
                  <input
                    type="email"
                    required
                    readOnly={!isEditingProfile}
                    placeholder="e.g. client@email.com"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingProfile 
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                        : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                    }`}
                  />
                </div>
              </div>

              {/* Address details */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-3">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "profile.address_details")}</span>
                
                <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.street")}</label>
                    <input
                      type="text"
                      readOnly={!isEditingProfile}
                      placeholder={isEditingProfile ? "e.g. Mlynské Nivy 42" : "No Street Added"}
                      value={profileStreet}
                      onChange={(e) => setProfileStreet(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                        isEditingProfile 
                          ? "bg-white border-2 border-slate-200 text-slate-800" 
                          : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.city")}</label>
                      <input
                        type="text"
                        readOnly={!isEditingProfile}
                        placeholder={isEditingProfile ? "e.g. Bratislava" : ""}
                        value={profileCity}
                        onChange={(e) => setProfileCity(e.target.value)}
                        className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                          isEditingProfile 
                            ? "bg-white border-2 border-slate-200 text-slate-800" 
                            : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.postal")}</label>
                      <input
                        type="text"
                        readOnly={!isEditingProfile}
                        placeholder={isEditingProfile ? "e.g. 821 09" : ""}
                        value={profilePostalCode}
                        onChange={(e) => setProfilePostalCode(e.target.value)}
                        className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                          isEditingProfile 
                            ? "bg-white border-2 border-slate-200 text-slate-800" 
                            : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.country")}</label>
                    {isEditingProfile ? (
                      <select
                        value={profileCountry}
                        onChange={(e) => setProfileCountry(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border-2 border-slate-200 focus:outline-none text-slate-800"
                      >
                        {europeanCountries.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="pl-0 text-slate-900 font-black cursor-default select-all">
                        🇪🇺 {profileCountry}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Corporate Registries section */}
              {profileType !== "person" && (
                <div className="border-t-2 border-slate-100 pt-4 space-y-3">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "profile.corporate_details")}</span>
                  
                  <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border-2 border-slate-200">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.company_id")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileCompanyId}
                          onChange={(e) => setProfileCompanyId(e.target.value)}
                          className={`w-full px-2 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.tax_id")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileTaxId}
                          onChange={(e) => setProfileTaxId(e.target.value)}
                          className={`w-full px-2 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.vat_id")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileVatId}
                          onChange={(e) => setProfileVatId(e.target.value)}
                          className={`w-full px-2 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.contact_person")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileContactPerson}
                          onChange={(e) => setProfileContactPerson(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><Globe className="h-3 w-3" /> {getTranslation(systemLanguage, "profile.website")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          placeholder={isEditingProfile ? "e.g. www.company.sk" : ""}
                          value={profileWebsite}
                          onChange={(e) => setProfileWebsite(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all text-blue-600 underline"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Manager */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.primary_pm")}</label>
                {isEditingProfile ? (
                  <select
                    value={profileOwner}
                    onChange={(e) => setProfileOwner(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-850 font-bold"
                  >
                    {projectManagers.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                ) : (
                  <div className="pl-0 text-slate-900 font-black cursor-default select-all">
                    👤 {profileOwner}
                  </div>
                )}
              </div>

              {/* Client Categories */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-2 text-left">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  📁 {systemLanguage === "sk" ? "Kategórie Klienta" : systemLanguage === "hu" ? "Ügyfél kategóriák" : "Client Categories"}
                </label>
                {isEditingProfile ? (
                  <div className="grid grid-cols-2 gap-2 bg-emerald-50/5 border border-slate-200/60 p-3 rounded-2xl">
                    {leadCategories.map((cat) => {
                      const isChecked = profileCategories.includes(cat);
                      return (
                        <label 
                          key={cat} 
                          className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-black uppercase tracking-wide cursor-pointer transition-all ${
                            isChecked 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700" 
                              : "bg-white border-slate-200/60 text-slate-500 hover:border-slate-350"
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setProfileCategories(prev => prev.filter(c => c !== cat));
                              } else {
                                setProfileCategories(prev => [...prev, cat]);
                              }
                            }}
                            className="hidden"
                          />
                          <span className={`h-2 w-2 rounded-full ${isChecked ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                          <span className="truncate">{cat}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {profileCategories.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic">None</span>
                    ) : (
                      profileCategories.map((cat) => (
                        <span 
                          key={cat}
                          className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-255 text-[9px] font-extrabold uppercase"
                        >
                          {cat}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Actions visible only in edit mode */}
              {isEditingProfile && (
                <div className="pt-4 border-t-2 border-slate-100 flex gap-3 animate-in fade-in duration-200">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-4.5 w-4.5 stroke-[2.5]" /> {systemLanguage === "sk" ? "Uložiť profil klienta" : systemLanguage === "hu" ? "Ügyfélprofil mentése" : "Save Client Profile"}
                  </button>
                </div>
              )}

            </form>
          </div>

          {/* RIGHT PANEL: Chronological Event Timeline & Interactive Logger (Combined) */}
          <div className="lg:col-span-7">
            <div className="glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl space-y-6">
              
              {/* Tab Navigation Switches */}
              <div className="flex flex-wrap justify-start border-b-2 border-slate-100 pb-2.5 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab("timeline")}
                  className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                    activeDetailTab === "timeline"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/10 border-emerald-700"
                      : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <Clock className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.history_timeline")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab("files")}
                  className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                    activeDetailTab === "files"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 border-blue-700"
                      : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <FileText className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.attached_files")} ({activeClient.timeline.filter(e => e.fileName).length})
                </button>
              </div>

              {activeDetailTab === "timeline" ? (
                <>
                  {/* Log event Form (New Event Bar) */}
                  <div>
                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b-2 border-slate-100 pb-2">
                      <PencilLine className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.log_event_client")}
                    </h3>

                    <form onSubmit={handleAddTimelineEvent} className="space-y-4 text-xs font-bold">
                      
                      {/* Event Category Switcher */}
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-450 uppercase tracking-wider">{getTranslation(systemLanguage, "common.event_type")}</label>
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

                      {/* Conditional form fields - Expand-down conditionally */}
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
                                
                                {/* Always-visible file type selection when a file is selected */}
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
                                              ? "bg-amber-700 text-white border border-amber-800 shadow" 
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
 
                          {/* Description details */}
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
 
                          {/* Submit log */}
                          {/* Submit log */}
                          <button
                            type="submit"
                            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-lg w-fit ml-auto border-2 border-emerald-700"
                          >
                            <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "logger.btn_log")}
                          </button>

                        </div>
                      </div>

                    </form>
                  </div>

                  {/* Timeline event log */}
                  <div className="border-t-2 border-slate-150 pt-6 space-y-4">
                    <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                      <Clock className="h-4.5 w-4.5 text-emerald-600 animate-pulse stroke-[2.5]" /> {getTranslation(systemLanguage, "common.chronological_timeline")}
                      {isLoadingMails && <span className="ml-2 text-[9px] text-emerald-500 font-extrabold uppercase animate-pulse">Syncing Mail...</span>}
                    </h3>

                    {activeClientTimeline.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2 animate-bounce">📜</div>
                        <div className="font-black text-slate-700 uppercase tracking-wider">No events logged yet</div>
                        <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">Use the form above to add phone calls, emails, notes or proposals.</div>
                      </div>
                    ) : (
                      <div className="relative pl-0 md:pl-4 space-y-6 py-2">
                        {/* Running timeline vertical line on desktop/mobile */}
                        <div className="absolute left-[17px] md:left-[132px] top-2 bottom-2 w-1 bg-emerald-100 rounded-full"></div>

                        {/* 1. FUTURE EVENTS (Rendered at top, closest future closest to line) */}
                        {futureEvents.map((event) => {
                          const colors = getEventColors(event.type);
                          return (
                            <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                              
                              {/* Left Date / Time part */}
                              <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                  {event.timestamp.substring(0, 10)}
                                </span>
                                <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                                  {event.timestamp.substring(11, 16)}
                                </span>
                              </div>

                              {/* Timeline dot */}
                              <div className="relative z-10 flex items-center justify-center shrink-0 w-9 h-9">
                                <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shadow-md ${colors.dotBg} transition-transform group-hover:scale-110`}>
                                  {renderEventIcon(event.type)}
                                </span>
                              </div>

                              {/* Event Card */}
                              <div className="flex-1 min-w-0 pl-3 md:pl-0">
                                <div className={`bg-amber-50/10 border-2 border-dashed border-amber-300 rounded-2xl p-4 transition-all shadow-md hover:shadow-lg ${colors.cardBorder}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200/50 pb-2 mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-wide">
                                        {event.title}
                                      </span>
                                      <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-widest shadow-inner ${colors.badgeBg}`}>
                                        {event.type}
                                      </span>
                                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-white border border-amber-600 tracking-widest shadow-sm">
                                        Upcoming
                                      </span>
                                    </div>
                                    <span className="block md:hidden text-[9px] font-black text-slate-450 uppercase tracking-wider">
                                      {event.timestamp}
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-slate-700 leading-relaxed font-bold select-text">
                                    {event.content}
                                  </p>

                                  {/* Extra values */}
                                  {event.type === "offer" && event.amount !== undefined && (
                                    <div className="mt-3 pl-3 border-l-4 border-emerald-500 flex items-center gap-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                      <TrendingUp className="h-4 w-4" /> BUDGET WORTH OFFERED: &euro; {event.amount.toLocaleString()}
                                    </div>
                                  )}

                                  {event.type === "appointment" && event.extraTime && (
                                    <div className="mt-3 pl-3 border-l-4 border-rose-500 flex items-center gap-1 text-[10px] font-black text-rose-700 uppercase tracking-wider">
                                      <Calendar className="h-4 w-4" /> MEETING SCHEDULED AT: {event.extraTime}
                                    </div>
                                  )}

                                  {/* File Attachment details */}
                                  {event.fileName && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-200 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-amber-900 uppercase tracking-wider">
                                        <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                                        <span className="truncate max-w-[150px]">{event.fileName}</span>
                                        <span className="text-[9px] font-extrabold text-slate-400">({event.fileSize})</span>
                                      </div>
                                      <a 
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); alert(`Simulating file download: ${event.fileName}`); }}
                                        className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 hover:bg-amber-250 transition-all text-[8px] font-black uppercase text-amber-800 tracking-wider shadow-sm"
                                      >
                                        View File
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. TODAY DIVIDER LINE (Delineates future and past) */}
                        <div className="relative z-10 flex items-center gap-3 my-6 animate-in fade-in duration-300">
                          <div className="hidden md:block w-[116px] shrink-0"></div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="h-0.5 bg-emerald-500/35 flex-1"></div>
                            <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 border-2 border-emerald-300 px-4 py-1.5 rounded-full tracking-widest shadow-sm flex items-center gap-1.5 shrink-0 select-text">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                              Today ({new Date().toISOString().substring(0, 10)})
                            </span>
                            <div className="h-0.5 bg-emerald-500/35 flex-1"></div>
                          </div>
                        </div>

                        {/* 3. PAST EVENTS (Rendered at bottom, most recent closest to line) */}
                        {pastEvents.map((event) => {
                          const colors = getEventColors(event.type);
                          return (
                            <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                              
                              {/* Left Date / Time part */}
                              <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                  {event.timestamp.substring(0, 10)}
                                </span>
                                <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                                  {event.timestamp.substring(11, 16)}
                                </span>
                              </div>

                              {/* Timeline dot */}
                              <div className="relative z-10 flex items-center justify-center shrink-0 w-9 h-9">
                                <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shadow-md ${colors.dotBg} transition-transform group-hover:scale-110`}>
                                  {renderEventIcon(event.type)}
                                </span>
                              </div>

                              {/* Event Card */}
                              <div className="flex-1 min-w-0 pl-3 md:pl-0">
                                <div className={`bg-slate-50/60 border rounded-2xl p-4 transition-all shadow-md hover:shadow-lg ${colors.cardBorder}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200/50 pb-2 mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-wide">
                                        {event.title}
                                      </span>
                                      <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-widest shadow-inner ${colors.badgeBg}`}>
                                        {event.type}
                                      </span>
                                    </div>
                                    <span className="block md:hidden text-[9px] font-black text-slate-450 uppercase tracking-wider">
                                      {event.timestamp}
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-slate-700 leading-relaxed font-bold select-text">
                                    {event.content}
                                  </p>

                                  {/* Extra values */}
                                  {event.type === "offer" && event.amount !== undefined && (
                                    <div className="mt-3 pl-3 border-l-4 border-emerald-500 flex items-center gap-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                      <TrendingUp className="h-4 w-4" /> BUDGET WORTH OFFERED: &euro; {event.amount.toLocaleString()}
                                    </div>
                                  )}

                                  {event.type === "appointment" && event.extraTime && (
                                    <div className="mt-3 pl-3 border-l-4 border-rose-500 flex items-center gap-1 text-[10px] font-black text-rose-700 uppercase tracking-wider">
                                      <Calendar className="h-4 w-4" /> MEETING SCHEDULED AT: {event.extraTime}
                                    </div>
                                  )}

                                  {/* File Attachment details */}
                                  {event.fileName && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-200 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-amber-900 uppercase tracking-wider">
                                        <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                                        <span className="truncate max-w-[150px]">{event.fileName}</span>
                                        <span className="text-[9px] font-extrabold text-slate-400">({event.fileSize})</span>
                                      </div>
                                      <a 
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); alert(`Simulating file download: ${event.fileName}`); }}
                                        className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 hover:bg-amber-250 transition-all text-[8px] font-black uppercase text-amber-800 tracking-wider shadow-sm"
                                      >
                                        View File
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  {/* Attach New Document Form */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border-2 border-slate-200">
                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                      <FolderOpen className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> Attach New Document to Profile
                    </h3>

                    <form onSubmit={handleAttachFile} className="space-y-4 text-xs font-bold">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">Upload File *</label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-2 border-amber-300 transition-all cursor-pointer text-[10px] font-black uppercase shadow-sm select-none shrink-0">
                              <FolderOpen className="h-4 w-4" />
                              <span>Select File</span>
                              <input 
                                type="file" 
                                required
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setUploadFileName(file.name);
                                    setUploadFileSize((file.size / 1024 / 1024).toFixed(2) + " MB");
                                  }
                                }} 
                              />
                            </label>
                            <input
                              type="text"
                              placeholder="No file chosen"
                              value={uploadFileName ? `${uploadFileName} (${uploadFileSize})` : ""}
                              readOnly
                              className="flex-1 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 focus:outline-none text-[10px] text-slate-550 font-bold"
                            />
                            {uploadFileName && (
                              <button 
                                type="button" 
                                onClick={() => { setUploadFileName(""); setUploadFileSize(""); }} 
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">Document Category *</label>
                          <div className="grid grid-cols-3 gap-2 bg-white p-1 rounded-xl border-2 border-slate-200">
                            {(["offer", "contract", "invoice"] as const).map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setUploadFileType(type)}
                                className={`py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
                                  uploadFileType === type 
                                    ? "bg-amber-600 text-white border border-amber-700 shadow" 
                                    : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
                                }`}
                              >
                                <span>
                                  {type === "offer" && "Offer"}
                                  {type === "contract" && "Contract"}
                                  {type === "invoice" && "Invoice"}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">Document Description / Remarks *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Approved price quote sheet for Q2..."
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          className="w-full px-4 py-2 rounded-xl bg-white border-2 border-slate-200 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-lg w-fit ml-auto border-2 border-emerald-700"
                      >
                        <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> Attach File to Client
                      </button>
                    </form>
                  </div>

                  {/* Attached Documents List */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                      <FileText className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> Attached Client Documents ({activeClient.timeline.filter(e => e.fileName).length})
                    </h3>

                    {activeClient.timeline.filter(e => e.fileName).length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2">📁</div>
                        <div className="font-black text-slate-700 uppercase tracking-wider">No files attached to this client</div>
                        <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">Use the attachment form above to upload proposals, contracts or invoices.</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {activeClient.timeline.filter(e => e.fileName).map((file) => {
                          return (
                            <div 
                              key={file.id} 
                              className="p-4 rounded-2xl bg-white border-2 border-slate-150 shadow-md flex items-center justify-between gap-4 hover:border-slate-300 transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105 ${
                                  file.fileType === "contract"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : file.fileType === "invoice"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}>
                                  <FileText className="h-5 w-5 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide truncate">
                                    {file.fileName}
                                  </span>
                                  <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] border font-black ${
                                      file.fileType === "contract"
                                        ? "bg-amber-100/50 text-amber-800 border-amber-200"
                                        : file.fileType === "invoice"
                                        ? "bg-emerald-100/50 text-emerald-800 border-emerald-200"
                                        : "bg-blue-100/50 text-blue-800 border-blue-200"
                                    }`}>
                                      {file.fileType || "document"}
                                    </span>
                                    &bull; {file.fileSize || "Unknown size"} &bull; {file.timestamp.substring(0, 10)}
                                  </span>
                                  <p className="text-[10px] text-slate-505 font-bold mt-1 leading-normal italic line-clamp-1">
                                    "{file.content}"
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => alert(systemLanguage === "sk" ? `Simulované sťahovanie súboru: ${file.fileName}` : systemLanguage === "hu" ? `Fájl letöltés szimulációja: ${file.fileName}` : `Simulating file download: ${file.fileName}`)}
                                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all text-slate-650 hover:text-slate-900 shadow-sm"
                                  title={systemLanguage === "sk" ? "Stiahnuť dokument" : systemLanguage === "hu" ? "Dokumentum letöltése" : "Download Document"}
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(systemLanguage === "sk" ? "Naozaj chcete natrvalo odpojiť tento dokument?" : systemLanguage === "hu" ? "Biztosan véglegesen le szeretné választani ezt a dokumentumot?" : "Are you sure you want to permanently detach this document?")) {
                                      setLeads(prev => prev.map(lead => {
                                        if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
                                          return {
                                            ...lead,
                                            timeline: (lead.timeline || []).filter(evt => evt.id !== file.id)
                                          };
                                        }
                                        return lead;
                                      }));
                                      alert(systemLanguage === "sk" ? "Dokument bol úspešne odpojený!" : systemLanguage === "hu" ? "Dokumentum sikeresen leválasztva!" : "Document detached successfully!");
                                    }
                                  }}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all text-rose-600 hover:text-rose-700 shadow-sm"
                                  title={systemLanguage === "sk" ? "Odpojiť dokument" : systemLanguage === "hu" ? "Dokumentum leválasztása" : "Detach Document"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // --- DEFAULT ROUTE: MAIN OVERVIEW CLIENTS LIST GRID ---
  // ----------------------------------------------------
  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      
      {/* 2. Control search & filter bar */}
      <div className="glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          
          {/* Saturated & Prominent Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600 stroke-[2.5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(systemLanguage, "clients.filter.search")}
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-emerald-50/15 border-2 border-emerald-250 text-xs text-slate-800 placeholder:text-slate-400 font-extrabold focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner"
            />
          </div>

          {/* Saturated Client Type Selector */}
          <div className="relative w-full sm:w-[180px] shrink-0">
            <div className="flex items-center gap-2 bg-gradient-to-br from-emerald-600 to-emerald-700 border-2 border-emerald-800 text-white rounded-2xl px-4 py-3 shadow-md shadow-emerald-600/10">
              <Users className="h-4.5 w-4.5 text-emerald-100 shrink-0" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-transparent text-[11px] font-black text-white focus:outline-none cursor-pointer uppercase tracking-wider w-full select-none"
                style={{ colorScheme: "dark" }}
              >
                <option value="all" className="bg-emerald-800 text-white">All Types</option>
                <option value="person" className="bg-emerald-800 text-white">Person</option>
                <option value="business" className="bg-emerald-800 text-white">Business</option>
                <option value="partner" className="bg-emerald-800 text-white">Partner</option>
              </select>
            </div>
          </div>

          {/* Saturated Toggle Filters Drawer Button */}
          <button
            type="button"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-center shadow-sm shrink-0 active:scale-95 ${
              showFilterDrawer
                ? "bg-emerald-700 text-white border-emerald-800 shadow-md shadow-emerald-700/25"
                : "bg-slate-50 border-slate-250 text-slate-550 hover:bg-slate-100 hover:text-slate-800"
            }`}
            title={showFilterDrawer ? "Close Filters Drawer" : "Open Filters Drawer"}
          >
            <SlidersHorizontal className="h-4.5 w-4.5 stroke-[2.5]" />
          </button>

        </div>

        {/* Collapsible Filter Panel (Collapses smoothly using modern CSS grid/height transitions) */}
        <div className={`grid transition-all duration-350 ease-in-out ${showFilterDrawer ? "grid-rows-[1fr] opacity-100 border-t border-slate-150 pt-4" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1">
              
              {/* City Location Filter */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider pl-0.5">Filter by City Location</label>
                <div className="relative">
                  <select
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 font-extrabold text-xs text-slate-700 uppercase tracking-wide cursor-pointer appearance-none"
                  >
                    <option value="">{getTranslation(systemLanguage, "clients.filter.city")}</option>
                    {uniqueCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Account PM Manager Filter */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider pl-0.5">Filter by Account Manager (PM)</label>
                <div className="relative">
                  <select
                    value={filterPM}
                    onChange={(e) => setFilterPM(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 font-extrabold text-xs text-slate-700 uppercase tracking-wide cursor-pointer appearance-none"
                  >
                    <option value="">{getTranslation(systemLanguage, "clients.filter.pm")}</option>
                    {projectManagers.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 3. Clients Data Grid Table */}
      <div className="glass-panel rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl overflow-hidden">
        <div className="overflow-x-auto lg:overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse text-left block lg:table">
            <thead className="hidden lg:table-header-group">
              <tr className="bg-white text-emerald-700 text-[10px] font-black uppercase tracking-wider">
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tl-[24px] border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.client")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">Contact Phone</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "login.email")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.city")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.type")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.pm")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 text-center border-b-2 border-slate-100">{getTranslation(systemLanguage, "clients.card.leads_count")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tr-[24px] text-right border-b-2 border-slate-100">{getTranslation(systemLanguage, "clients.card.total_value")}</th>
              </tr>
            </thead>

            <tbody className="divide-y-0 lg:divide-y lg:divide-emerald-100 text-xs block lg:table-row-group">
              {processedClients.length === 0 ? (
                <tr className="block lg:table-row">
                  <td colSpan={8} className="py-16 px-6 text-center text-slate-400 block lg:table-cell w-full lg:w-auto">
                    <div className="text-2xl mb-2 animate-bounce">👥</div>
                    <div className="font-black text-slate-700 uppercase tracking-wider">No registered clients found</div>
                    <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">We aggregate clients automatically from your leads database.</div>
                  </td>
                </tr>
              ) : (
                processedClients.map((client) => (
                  <tr 
                    key={client.name}
                    onClick={() => { window.location.hash = `client-${encodeURIComponent(client.name)}`; }}
                    className="block lg:table-row border-b-4 border-slate-200/80 lg:border-b lg:border-emerald-50/60 p-4 lg:p-0 hover:bg-emerald-50/40 transition-colors duration-150 cursor-pointer group"
                  >
                    
                    {/* Client Name & initials */}
                    <td className="block lg:table-cell py-1.5 lg:py-3.5 px-0 lg:px-6 font-bold text-slate-900 mb-2 lg:mb-0 w-full lg:w-auto">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white border border-emerald-700 font-heading font-black text-[9px] flex items-center justify-center shrink-0 shadow">
                          {getInitials(client.name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="line-clamp-1 group-hover:text-emerald-700 transition-colors font-black text-sm lg:text-xs text-slate-850">{client.name}</span>
                          {client.categories && client.categories.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider line-clamp-1 mt-0.5">
                              {client.categories.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      {client.phone ? (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-500 stroke-[2.5]" /> {client.phone}</span>
                      ) : (
                        <span className="text-slate-350 italic">None</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      {client.email ? (
                        <span className="flex items-center gap-1 truncate max-w-[140px]"><Mail className="h-3 w-3 text-emerald-500 stroke-[2.5]" /> {client.email}</span>
                      ) : (
                        <span className="text-slate-350 italic">None</span>
                      )}
                    </td>

                    {/* City location / address */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-emerald-500 stroke-[2.5] shrink-0" />
                        <span className="line-clamp-1 text-slate-650">
                          {client.street ? `${client.street}, ` : ""}
                          {client.city || ""}
                          {client.country ? ` (${client.country})` : ""}
                        </span>
                      </div>
                    </td>

                    {/* Client Type badge */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 mr-3.5">
                      {client.clientType === "business" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-600 text-white border border-emerald-700 shadow-sm animate-fade-in">
                          <Briefcase className="h-2.5 w-2.5 text-white" /> Business
                        </span>
                      )}
                      {client.clientType === "partner" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500 text-white border border-amber-600 shadow-sm animate-fade-in">
                          <Handshake className="h-2.5 w-2.5 text-white" /> Partner
                        </span>
                      )}
                      {client.clientType === "person" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500 text-white border border-emerald-600 shadow-sm animate-fade-in">
                          <User className="h-2.5 w-2.5 text-white" /> Person
                        </span>
                      )}
                    </td>

                    {/* PM Manager */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">PM:</span>
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
                          <span>{client.owner}</span>
                        </div>
                      </div>
                    </td>

                    {/* Deals count */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-center mr-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">Deals:</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white border border-emerald-600 shadow">
                          <Layers className="h-3 w-3 text-white" /> {client.leadsCount}
                        </span>
                      </div>
                    </td>

                    {/* Total Value */}
                    <td className="inline-flex items-center lg:table-cell py-1.5 lg:py-3.5 px-0 lg:px-6 font-heading font-black text-emerald-700 text-sm w-full lg:w-auto mt-1 lg:mt-0 pt-2 lg:pt-3.5 border-t border-slate-50 lg:border-t-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">Worth:</span>
                        <span className="font-heading font-black text-emerald-700 text-sm">
                          &euro; {client.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-emerald-50/20 border-t-2 border-emerald-100 p-4 flex items-center justify-between text-[10px] text-slate-500 font-black uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
            <span>Click any client row to inspect profile details & timeline logs</span>
          </div>
          <div>
            Showing <strong className="text-emerald-700">{processedClients.length}</strong> unique clients
          </div>
        </div>
      </div>
    </div>
  );
};
