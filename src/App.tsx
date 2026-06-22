import { useState, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { SettingsView } from "./components/SettingsView";
import { LeadsDatagrid } from "./components/LeadsDatagrid";
import { ClientsView } from "./components/ClientsView";
import { FilesView } from "./components/FilesView";
import { LoginView } from "./components/LoginView";
import { TaskDashboardView } from "./components/TaskDashboardView";
import { PersonalSettingsView } from "./components/PersonalSettingsView";
import { EmailView } from "./components/EmailView";
import { RagAiView } from "./components/RagAiView";
import type { Lead, UserProfile, RolePermission, Task } from "./types";
import { VERSION } from "./utils/version";
import { MeetingRoomView } from "./components/MeetingRoomView";
import type { MeetingNote } from "./components/MeetingRoomView";
import { getTranslation } from "./utils/translations";
import { InstallerWizard } from "./components/InstallerWizard";
import { RefreshCw } from "lucide-react";

function App() {
  const activePushesRef = useRef(0);
  const lastPushTimeRef = useRef(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dbInfo, setDbInfo] = useState<{ host: string; port: string; name: string; user: string } | null>(null);

  const getTabFromHash = () => {
    const rawHash = window.location.hash.replace("#", "");
    const baseHash = rawHash.split(/[/?]/)[0];
    const hashLower = baseHash.toLowerCase();
    if (hashLower.startsWith("client-") || hashLower.startsWith("lead-") || hashLower.startsWith("user-")) {
      return rawHash; // Keep case sensitivity
    }
    const validTabs = ["dashboard", "overview", "leads", "clients", "tasks", "files", "settings", "personal-settings", "email", "rag_ai", "meetings"];
    return validTabs.includes(hashLower) ? hashLower : "dashboard";
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [isInitialSyncResolved, setIsInitialSyncResolved] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    (window as any).previewFile = (url: string, name: string) => {
      setPreviewFile({ url, name });
    };

    (window as any).showToast = (message: string, action?: { label: string; onClick: () => void }) => {
      setToast({ message, action });
      // Auto close after 5 seconds if no action is provided
      if (!action) {
        setTimeout(() => {
          setToast(curr => curr?.message === message ? null : curr);
        }, 5000);
      }
    };
  }, []);
  const [systemName, setSystemName] = useState("CCRM");
  const [systemLanguage, setSystemLanguage] = useState<"en" | "sk" | "hu">("sk");
  const [userLanguage, setUserLanguage] = useState<"en" | "sk" | "hu">("sk");

  // Meeting Room state
  const [meetingsAction, setMeetingsAction] = useState<"list" | "new">("list");
  const [autoOpenAddTask, setAutoOpenAddTask] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>(() => {
    const stored = localStorage.getItem("crm_meeting_notes");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return [
      {
        id: "meet-1",
        title: "Initial Budget Alignment Call",
        date: "2026-06-10",
        leadId: "lead-1",
        leadName: "Ján Novák",
        duration: 25,
        notes: JSON.stringify([
          { id: "b-init-1", type: "h2", content: "Countertop Slab Price Negotiation" },
          { id: "b-init-2", type: "paragraph", content: "Ján from Bratislava showroom discussed countertop materials. He is interested in Laminam Ceramic slabs but is concerned about the price." },
          { id: "b-init-3", type: "banner", bannerType: "info", content: "Proposed a bundle discount of 15% if they proceed with flooring tiles as well." },
          { id: "b-init-4", type: "todo", content: "Prepare a unified quote for countertops and flooring tiles by Friday", "checked": false },
          { id: "b-init-5", type: "todo", content: "Send gray marble sample slabs package via courier", "checked": true }
        ]),
        aiSummary: {
          summary: "Discussion regarding Laminam Ceramic slabs pricing and interested cross-sell for flooring tiles. The lead is price-sensitive but open to discounts.",
          actionItems: [
            "Prepare unified quote for countertops and flooring tiles",
            "Send sample package via courier"
          ],
          sentiment: "neutral",
          topics: ["Pricing & Budget", "Material Selection"]
        }
      },
      {
        id: "meet-2",
        title: "Technical Spec & Timeline Review",
        date: "2026-06-12",
        leadId: "lead-2",
        leadName: "Martina Kováčová",
        duration: 45,
        notes: JSON.stringify([
          { id: "b-init-6", type: "h2", content: "Onsite Measurements & Finish Approvals" },
          { id: "b-init-7", type: "paragraph", content: "Conducted full onsite measurements at Martina's kitchen in Trnava. Physical layout details recorded successfully." },
          { id: "b-init-8", type: "banner", bannerType: "success", content: "Client officially approved the Calacatta Gold polished finish quartz countertop!" },
          { id: "b-init-9", type: "todo", content: "Send measurements sheet to fabrication team", "checked": false },
          { id: "b-init-10", type: "todo", content: "Book installation window for early July", "checked": false }
        ]),
        aiSummary: {
          summary: "Onsite physical measurements completed. Client approved Calacatta Gold quartz in polished finish. Milestone delivery dates established.",
          actionItems: [
            "Send measurements sheet to fabrication team",
            "Book installation window for early July"
          ],
          sentiment: "positive",
          topics: ["Onsite Measurement", "Milestones", "Material Selection"]
        }
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem("crm_meeting_notes", JSON.stringify(meetingNotes));
    if (isInitialSyncResolved) {
      pushStateToServer(leads, tasks, roles, integrationsConfig, users, meetingNotes);
    }
  }, [meetingNotes, isInitialSyncResolved]);

  // Initial states set to empty / defaults without localStorage or mockData loaders
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [leadStates, setLeadStates] = useState<string[]>([
    "new", "contacted", "offer sent", "accepted", "rejected"
  ]);

  const [taskStates, setTaskStates] = useState<string[]>([
    "New", "In progress", "Blocked", "Done"
  ]);

  const [taskStateColors, setTaskStateColors] = useState<Record<string, string>>({
    "New": "#3b82f6",
    "In progress": "#f59e0b",
    "Blocked": "#ef4444",
    "Done": "#10b981"
  });

  const [leadSources, setLeadSources] = useState<string[]>([
    "showroom", "facebook", "instagram", "website"
  ]);

  const [leadCategories, setLeadCategories] = useState<string[]>([
    "Kitchen Countertops", "Flooring Tiles", "Bathroom Renovation", "Granite Slabs", "Plumbing Services", "Custom Masonry"
  ]);

  const [leadStateColors, setLeadStateColors] = useState<Record<string, string>>({
    "new": "#3b82f6",
    "contacted": "#0ea5e9",
    "offer sent": "#6366f1",
    "accepted": "#10b981",
    "rejected": "#ef4444"
  });

  const [leadSourceColors, setLeadSourceColors] = useState<Record<string, string>>({
    "showroom": "#10b981",
    "facebook": "#3b82f6",
    "instagram": "#ec4899",
    "website": "#8b5cf6"
  });

  const [leadCategoryColors, setLeadCategoryColors] = useState<Record<string, string>>({
    "Kitchen Countertops": "#f59e0b",
    "Flooring Tiles": "#10b981",
    "Bathroom Renovation": "#3b82f6",
    "Granite Slabs": "#6366f1",
    "Plumbing Services": "#0ea5e9",
    "Custom Masonry": "#ec4899"
  });

  const [leadStageGroups, setLeadStageGroups] = useState<Record<string, "new" | "in_progress" | "closed">>({
    "new": "new",
    "contacted": "in_progress",
    "offer sent": "in_progress",
    "accepted": "closed",
    "rejected": "closed"
  });

  const [leadStateParents, setLeadStateParents] = useState<Record<string, string>>({});

  const [integrationsConfig, setIntegrationsConfig] = useState<any>({
    emailProvider: "smtp",
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: "ssl",
    smtpAuth: true,
    smtpUser: "",
    smtpPassword: "",
    senderName: "CCRM",
    senderEmail: "",
    exchUrl: "https://outlook.office365.com/EWS/Exchange.asmx",
    exchDomain: "",
    exchAuth: "oauth",
    exchClientId: "00000000-0000-0000-0000-000000000000",
    exchTenantId: "00000000-0000-0000-0000-000000000000",
    exchClientSecret: "",
    exchPassword: "",
    exchMailbox: "",
    metaAppId: "",
    metaAppSecret: "",
    metaAccessToken: "",
    googleDevToken: "",
    googleClientId: "",
    googleClientSecret: "",
    googleRefreshToken: "",
    adsConnected: false,
    campaigns: []
  });



  // Roles Registry
  const [roles, setRoles] = useState<RolePermission[]>([]);

  // Users Directory
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Current session (null represents logged-out state)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const stored = sessionStorage.getItem("crm_current_user_rbac");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem("crm_current_user_rbac", JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem("crm_current_user_rbac");
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      const stored = sessionStorage.getItem(`crm_user_language_${currentUser.name}`);
      if (stored) {
        setUserLanguage(stored as "en" | "sk" | "hu");
      } else {
        setUserLanguage(systemLanguage);
      }
    } else {
      setUserLanguage(systemLanguage);
    }
  }, [currentUser, systemLanguage]);

  useEffect(() => {
    const username = currentUser ? currentUser.name : "guest";
    sessionStorage.setItem(`crm_user_language_${username}`, userLanguage);
  }, [userLanguage, currentUser]);

  // Dynamically update browser tab document title based on the active view and language preference
  useEffect(() => {
    let viewName = "";
    if (activeTab.startsWith("client-")) {
      const clientName = decodeURIComponent(activeTab.replace("client-", ""));
      viewName = clientName;
    } else if (activeTab.startsWith("lead-")) {
      const leadId = activeTab.replace("lead-", "");
      const targetLead = leads.find(l => String(l.id) === leadId);
      viewName = targetLead ? targetLead.name : "Lead";
    } else {
      switch (activeTab) {
        case "leads":
          viewName = getTranslation(userLanguage, "sidebar.leads");
          break;
        case "clients":
          viewName = getTranslation(userLanguage, "sidebar.clients");
          break;
        case "files":
          viewName = getTranslation(userLanguage, "sidebar.files");
          break;
        case "settings":
          viewName = getTranslation(userLanguage, "sidebar.settings");
          break;
        default:
          viewName = getTranslation(userLanguage, "sidebar.dashboard");
          break;
      }
    }
    
    document.title = `${viewName} | ${systemName}`;
  }, [activeTab, systemName, userLanguage, leads]);

  // --- DYNAMICALLY DERIVED COMPATIBILITY PARAMETERS ---
  const projectManagers = users.map(u => u.name);
  const projectManagerColors = users.reduce((acc, u) => {
    acc[u.name] = u.color;
    return acc;
  }, {} as Record<string, string>);

  // Permission resolver helper
  const getPermission = (section: keyof RolePermission["permissions"]) => {
    if (!currentUser) return "nothing";
    if (currentUser.role.toLowerCase() === "admin") return "edit"; // Admin always has absolute write privileges
    const userRole = roles.find(r => r.name === currentUser.role);
    if (!userRole) return "nothing";
    return userRole.permissions[section] || "nothing";
  };

  // Has settings access flag
  const hasSettingsAccess = 
    getPermission("general_config") !== "nothing" ||
    getPermission("pm_managers") !== "nothing" ||
    getPermission("pipeline_stages") !== "nothing" ||
    getPermission("traffic_sources") !== "nothing" ||
    getPermission("system_reset") !== "nothing" ||
    getPermission("ai_config") !== "nothing";

  // Guard routing pathway from unauthorised users
  useEffect(() => {
    if (currentUser && activeTab === "settings" && !hasSettingsAccess) {
      setActiveTab("dashboard");
      window.location.hash = "dashboard";
    }
  }, [activeTab, currentUser, roles]);

  // --- REAL-TIME SERVER SYNCHRONIZER ENGINE ---
  const pushStateToServer = async (
    nextLeads?: Lead[],
    nextTasks?: Task[],
    nextRoles?: RolePermission[],
    nextIntegrationsConfig?: any,
    nextUsers?: UserProfile[],
    nextMeetingNotes?: MeetingNote[]
  ) => {
    if (!isInstalled) return;
    setIsSyncing(true);
    activePushesRef.current++;
    lastPushTimeRef.current = Date.now();
    const payload = {
      leads: nextLeads || leads,
      tasks: nextTasks || tasks,
      users: nextUsers || users,
      roles: nextRoles || roles,
      meetingNotes: nextMeetingNotes || meetingNotes,
      settings: {
        systemName,
        systemLanguage,
        leadStates,
        leadSources,
        leadCategories,
        leadStateColors,
        leadSourceColors,
        leadCategoryColors,
        leadStageGroups,
        leadStateParents,
        taskStates,
        taskStateColors,
        integrationsConfig: nextIntegrationsConfig || integrationsConfig
      }
    };
    try {
      const res = await fetch("/sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        setCurrentUser(null);
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("Session expired. Please log in again.");
        }
      }
    } catch (err) {
      console.warn("Failed immediate push to sync.php", err);
    } finally {
      activePushesRef.current = Math.max(0, activePushesRef.current - 1);
      if (activePushesRef.current === 0) {
        setIsSyncing(false);
      }
    }
  };

  const updateRolesAndSync = (newRoles: RolePermission[] | ((prev: RolePermission[]) => RolePermission[])) => {
    setRoles(prev => {
      const nextRoles = typeof newRoles === "function" ? newRoles(prev) : newRoles;
      pushStateToServer(leads, tasks, nextRoles);
      return nextRoles;
    });
  };

  const updateIntegrationsConfigAndSync = (next: any) => {
    setIntegrationsConfig((prev: any) => {
      const updated = typeof next === "function" ? next(prev) : next;
      pushStateToServer(leads, tasks, roles, updated);
      return updated;
    });
  };

  const syncIntegrationsConfig = (config: any) => {
    if (!config) return;
    setIntegrationsConfig((prev: any) => {
      if (JSON.stringify(config) === JSON.stringify(prev)) return prev;
      return config;
    });
  };

  const updateLeadsAndSync = async (updater: Lead[] | ((prev: Lead[]) => Lead[])) => {
    setLeads((prev) => {
      const nextLeads = typeof updater === "function" ? updater(prev) : updater;
      pushStateToServer(nextLeads, tasks, roles);
      return nextLeads;
    });
  };

  const updateTasksAndSync = (newTasks: Task[] | ((prev: Task[]) => Task[])) => {
    setTasks(prev => {
      const nextTasks = typeof newTasks === "function" ? newTasks(prev) : newTasks;
      pushStateToServer(leads, nextTasks, roles);
      return nextTasks;
    });
  };

  const updateMeetingNotesAndSync = (newNotes: MeetingNote[] | ((prev: MeetingNote[]) => MeetingNote[])) => {
    setMeetingNotes(prev => {
      const nextNotes = typeof newNotes === "function" ? newNotes(prev) : newNotes;
      pushStateToServer(leads, tasks, roles, integrationsConfig, users, nextNotes);
      return nextNotes;
    });
  };

  const updateUsersAndSync = (newUsers: UserProfile[] | ((prev: UserProfile[]) => UserProfile[])) => {
    setUsers(prev => {
      const nextUsers = typeof newUsers === "function" ? newUsers(prev) : newUsers;
      pushStateToServer(leads, tasks, roles, integrationsConfig, nextUsers);
      if (currentUser) {
        const updatedMe = nextUsers.find(u => u.email === currentUser.email);
        if (updatedMe) {
          setCurrentUser(updatedMe);
        }
      }
      return nextUsers;
    });
  };

  // Expose leads state globally for markdown file name reference lookup
  useEffect(() => {
    (window as any).leads = leads;
  }, [leads]);

  // Sync settings when modified (only AFTER the initial database sync is resolved to prevent overwriting with defaults)
  useEffect(() => {
    const syncSettingsToServer = async () => {
      if (!isInstalled || !isInitialSyncResolved) return;
      pushStateToServer(leads, tasks);
    };
    syncSettingsToServer();
  }, [leadStates, leadSources, leadCategories, systemName, systemLanguage, leadStateColors, leadSourceColors, leadCategoryColors, leadStageGroups, leadStateParents, taskStates, taskStateColors, isInitialSyncResolved]);

  // Layout Hash change listener
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    
    if (!window.location.hash) {
      window.location.hash = "dashboard";
    }

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Server data poller
  useEffect(() => {
    const syncFromServer = async () => {
      const pollStartTime = Date.now();
      try {
        const res = await fetch(`/sync.php?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (activePushesRef.current > 0 || pollStartTime < lastPushTimeRef.current) {
            return;
          }
          if (data && data.installed === false) {
            setIsInstalled(false);
            return;
          }
          
          if (data && data.installed === true) {
            setIsInstalled(true);
            setIsDemoMode(data.demoMode === true);
            if (data.leads && Array.isArray(data.leads)) {
              setLeads(prev => {
                if (JSON.stringify(prev) === JSON.stringify(data.leads)) return prev;
                return data.leads;
              });
            }
            if (data.tasks && Array.isArray(data.tasks)) {
              setTasks(data.tasks);
            }
            if (data.users && Array.isArray(data.users)) {
              setUsers(data.users);
              if (currentUser) {
                const updatedMe = data.users.find((u: UserProfile) => u.email === currentUser.email);
                if (updatedMe && JSON.stringify(updatedMe) !== JSON.stringify(currentUser)) {
                  setCurrentUser(updatedMe);
                }
              }
            }
            if (data.db_info) {
              setDbInfo(data.db_info);
            }
            if (data.roles && Array.isArray(data.roles)) {
              setRoles(data.roles);
            }
            if (data.meetingNotes && Array.isArray(data.meetingNotes)) {
              setMeetingNotes(data.meetingNotes);
            }
            if (data.settings) {
              const s = data.settings;
              if (s.systemName) setSystemName(s.systemName);
              if (s.systemLanguage) setSystemLanguage(s.systemLanguage);
              if (s.leadStates) setLeadStates(s.leadStates);
              if (s.leadSources) setLeadSources(s.leadSources);
              if (s.leadCategories) setLeadCategories(s.leadCategories);
              if (s.leadStateColors) setLeadStateColors(s.leadStateColors);
              if (s.leadSourceColors) setLeadSourceColors(s.leadSourceColors);
              if (s.leadCategoryColors) setLeadCategoryColors(s.leadCategoryColors);
              if (s.leadStageGroups) setLeadStageGroups(s.leadStageGroups);
              if (s.leadStateParents) setLeadStateParents(s.leadStateParents);
              if (s.taskStates) setTaskStates(s.taskStates);
              if (s.taskStateColors) setTaskStateColors(s.taskStateColors);
              if (s.integrationsConfig) syncIntegrationsConfig(s.integrationsConfig);
            }
            setIsInitialSyncResolved(true);
          }
        }
      } catch (err) {
        console.warn("Staging sync backend offline", err);
        setIsInitialSyncResolved(true);
      }
    };

    syncFromServer();

    const poller = setInterval(async () => {
      const pollStartTime = Date.now();
      try {
        const res = await fetch(`/sync.php?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (activePushesRef.current > 0 || pollStartTime < lastPushTimeRef.current) {
            return;
          }
          if (data && data.installed === false) {
            setIsInstalled(false);
            return;
          }
          if (data && data.installed === true) {
            setIsInstalled(true);
            setIsDemoMode(data.demoMode === true);
            
            if (data.leads && Array.isArray(data.leads)) {
              setLeads((prev) => {
                if (JSON.stringify(data.leads) !== JSON.stringify(prev)) {
                  return data.leads;
                }
                return prev;
              });
            }
            if (data.tasks && Array.isArray(data.tasks)) {
              setTasks((prev) => {
                if (JSON.stringify(data.tasks) !== JSON.stringify(prev)) {
                  return data.tasks;
                }
                return prev;
              });
            }
            if (data.users && Array.isArray(data.users)) {
              setUsers((prev) => {
                if (JSON.stringify(data.users) !== JSON.stringify(prev)) {
                  return data.users;
                }
                return prev;
              });
              if (currentUser) {
                const updatedMe = data.users.find((u: UserProfile) => u.email === currentUser.email);
                if (updatedMe && JSON.stringify(updatedMe) !== JSON.stringify(currentUser)) {
                  setCurrentUser(updatedMe);
                }
              }
            }
            if (data.roles && Array.isArray(data.roles)) {
              setRoles((prev) => {
                if (JSON.stringify(data.roles) !== JSON.stringify(prev)) {
                  return data.roles;
                }
                return prev;
              });
            }
            if (data.meetingNotes && Array.isArray(data.meetingNotes)) {
              setMeetingNotes((prev) => {
                if (JSON.stringify(data.meetingNotes) !== JSON.stringify(prev)) {
                  return data.meetingNotes;
                }
                return prev;
              });
            }
            if (data.db_info) {
              setDbInfo(data.db_info);
            }
            if (data.settings) {
              const s = data.settings;
              if (s.systemName) setSystemName(s.systemName);
              if (s.systemLanguage) setSystemLanguage(s.systemLanguage);
              if (s.leadStates) setLeadStates(s.leadStates);
              if (s.leadSources) setLeadSources(s.leadSources);
              if (s.leadCategories) setLeadCategories(s.leadCategories);
              if (s.leadStateColors) setLeadStateColors(s.leadStateColors);
              if (s.leadSourceColors) setLeadSourceColors(s.leadSourceColors);
              if (s.leadCategoryColors) setLeadCategoryColors(s.leadCategoryColors);
              if (s.leadStageGroups) setLeadStageGroups(s.leadStageGroups);
              if (s.leadStateParents) setLeadStateParents(s.leadStateParents);
              if (s.taskStates) setTaskStates(s.taskStates);
              if (s.taskStateColors) setTaskStateColors(s.taskStateColors);
              if (s.integrationsConfig) syncIntegrationsConfig(s.integrationsConfig);
            }
          }
        }
      } catch (err) {
        // quiet fail on background polling
      }
    }, 5000);

    return () => clearInterval(poller);
  }, [isInstalled]);

  // Background email fetching poller when the user is logged in
  useEffect(() => {
    if (!currentUser) return;

    let emailSettings: any = null;
    try {
      if (currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string'
          ? JSON.parse(currentUser.metadata_json)
          : currentUser.metadata_json;
        emailSettings = metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing emailSettings for background fetching", e);
    }

    if (!emailSettings || !emailSettings.isValidated) {
      return;
    }

    const fetchEmailsInBackground = async () => {
      try {
        await fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=1`, {
          headers: { "X-User-Email": currentUser.email }
        });
      } catch (err) {
        console.warn("Background email fetching failed", err);
      }
    };

    // Run once on load/login
    fetchEmailsInBackground();

    // Poll every 2 minutes
    const interval = setInterval(fetchEmailsInBackground, 120000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // View router
  const renderWorkspaceView = () => {
    const activeUser = currentUser || users[0] || {
      id: "guest",
      name: "Guest User",
      email: "guest@example.com",
      role: "Viewer",
      color: "#6366f1",
      avatar: null,
      activityLog: [],
      metadata_json: "{}"
    };

    if (activeTab.startsWith("user-")) {
      const username = decodeURIComponent(activeTab.replace("user-", ""));
      return (
        <SettingsView 
          systemName={systemName} 
          setSystemName={setSystemName} 
          leadStates={leadStates}
          setLeadStates={setLeadStates}
          leadSources={leadSources}
          setLeadSources={setLeadSources}
          users={users}
          setUsers={setUsers}
          roles={roles}
          setRoles={updateRolesAndSync}
          getPermission={getPermission}
          currentUser={activeUser}
          leadStateColors={leadStateColors}
          setLeadStateColors={setLeadStateColors}
          leadCategories={leadCategories}
          setLeadCategories={setLeadCategories}
          leadSourceColors={leadSourceColors}
          setLeadSourceColors={setLeadSourceColors}
          leadCategoryColors={leadCategoryColors}
          setLeadCategoryColors={setLeadCategoryColors}
          leadStageGroups={leadStageGroups}
          setLeadStageGroups={setLeadStageGroups}
          systemLanguage={systemLanguage}
          setSystemLanguage={setSystemLanguage}
          userLanguage={userLanguage}
          initialSelectedUserName={username}
          leadStateParents={leadStateParents}
          setLeadStateParents={setLeadStateParents}
          taskStates={taskStates}
          setTaskStates={setTaskStates}
          taskStateColors={taskStateColors}
          setTaskStateColors={setTaskStateColors}
          isDemoMode={isDemoMode}
          dbInfo={dbInfo || undefined}
        />
      );
    }

    if (activeTab.startsWith("client-")) {
      const clientName = decodeURIComponent(activeTab.replace("client-", ""));
      return (
        <ClientsView 
          leads={leads}
          setLeads={updateLeadsAndSync}
          projectManagers={projectManagers}
          leadSources={leadSources}
          initialSelectedClient={clientName}
          systemLanguage={userLanguage}
          tasks={tasks}
          setTasks={updateTasksAndSync}
          leadCategories={leadCategories}
          integrationsConfig={integrationsConfig}
          taskStates={taskStates}
        />
      );
    }

    if (activeTab.startsWith("lead-")) {
      const leadId = activeTab.replace("lead-", "");
      return (
        <LeadsDatagrid 
          systemName={systemName}
          leads={leads}
          setLeads={updateLeadsAndSync}
          leadStates={leadStates}
          leadSources={leadSources}
          projectManagers={projectManagers}
          leadStateColors={leadStateColors}
          leadStateParents={leadStateParents}
          initialSelectedLeadId={leadId}
          projectManagerColors={projectManagerColors}
          leadCategories={leadCategories}
          leadSourceColors={leadSourceColors}
          leadCategoryColors={leadCategoryColors}
          systemLanguage={userLanguage}
          tasks={tasks}
          setTasks={updateTasksAndSync}
          users={users}
          taskStates={taskStates}
          taskStateColors={taskStateColors}
          integrationsConfig={integrationsConfig}
        />
      );
    }

    switch (activeTab) {
      case "leads":
        return (
          <LeadsDatagrid 
            systemName={systemName}
            leads={leads}
            setLeads={updateLeadsAndSync}
            leadStates={leadStates}
            leadSources={leadSources}
            projectManagers={projectManagers}
            leadStateColors={leadStateColors}
            leadStateParents={leadStateParents}
            projectManagerColors={projectManagerColors}
            leadCategories={leadCategories}
            leadSourceColors={leadSourceColors}
            leadCategoryColors={leadCategoryColors}
            systemLanguage={userLanguage}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            users={users}
            taskStates={taskStates}
            taskStateColors={taskStateColors}
            integrationsConfig={integrationsConfig}
          />
        );
      case "clients":
        return (
          <ClientsView 
            leads={leads}
            setLeads={updateLeadsAndSync}
            projectManagers={projectManagers}
            projectManagerColors={projectManagerColors}
            leadSources={leadSources}
            systemLanguage={userLanguage}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leadCategories={leadCategories}
            taskStates={taskStates}
            integrationsConfig={integrationsConfig}
          />
        );
      case "files":
        return (
          <FilesView leads={leads} setLeads={updateLeadsAndSync} systemLanguage={userLanguage} />
        );
      case "personal-settings":
        return (
          <PersonalSettingsView
            currentUser={activeUser}
            users={users}
            setUsers={updateUsersAndSync}
            systemLanguage={systemLanguage}
            userLanguage={userLanguage}
            setUserLanguage={setUserLanguage}
            onSync={() => {}}
          />
        );
      case "email":
        return (
          <EmailView
            currentUser={activeUser}
            leads={leads}
            setLeads={updateLeadsAndSync}
            systemLanguage={userLanguage}
            projectManagerColors={projectManagerColors}
            integrationsConfig={integrationsConfig}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            users={users}
            taskStates={taskStates}
          />
        );
      case "settings":
        return (
          <SettingsView 
            systemName={systemName} 
            setSystemName={setSystemName} 
            leadStates={leadStates}
            setLeadStates={setLeadStates}
            leadSources={leadSources}
            setLeadSources={setLeadSources}
            users={users}
            setUsers={updateUsersAndSync}
            roles={roles}
            setRoles={updateRolesAndSync}
            getPermission={getPermission}
            currentUser={activeUser}
            leadStateColors={leadStateColors}
            setLeadStateColors={setLeadStateColors}
            leadCategories={leadCategories}
            setLeadCategories={setLeadCategories}
            leadSourceColors={leadSourceColors}
            setLeadSourceColors={setLeadSourceColors}
            leadCategoryColors={leadCategoryColors}
            setLeadCategoryColors={setLeadCategoryColors}
            leadStageGroups={leadStageGroups}
            setLeadStageGroups={setLeadStageGroups}
            systemLanguage={systemLanguage}
            setSystemLanguage={setSystemLanguage}
            userLanguage={userLanguage}
            leadStateParents={leadStateParents}
            setLeadStateParents={setLeadStateParents}
            isDemoMode={isDemoMode}
            integrationsConfig={integrationsConfig}
            updateIntegrationsConfig={updateIntegrationsConfigAndSync}
            dbInfo={dbInfo || undefined}
            taskStates={taskStates}
            setTaskStates={setTaskStates}
            taskStateColors={taskStateColors}
            setTaskStateColors={setTaskStateColors}
          />
        );
      case "overview":
        return (
          <Dashboard 
            systemName={systemName}
            leads={leads}
            leadSourceColors={leadSourceColors}
            leadCategoryColors={leadCategoryColors}
            leadStageGroups={leadStageGroups}
            leadStates={leadStates}
            leadStateColors={leadStateColors}
            systemLanguage={userLanguage}
            leadStateParents={leadStateParents}
            campaigns={integrationsConfig.campaigns}
          />
        );
      case "rag_ai":
        return (
          <RagAiView systemLanguage={userLanguage} currentUser={activeUser} leads={leads} />
        );
      case "meetings":
        return (
          <MeetingRoomView 
            leads={leads}
            users={users}
            systemLanguage={userLanguage}
            meetingNotes={meetingNotes}
            setMeetingNotes={updateMeetingNotesAndSync}
            initialView={meetingsAction}
            onClearInitialView={() => setMeetingsAction("list")}
            integrationsConfig={integrationsConfig}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            isSyncing={isSyncing}
            taskStates={taskStates}
          />
        );
      default:
        return (
          <TaskDashboardView 
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leads={leads}
            users={users}
            systemLanguage={userLanguage}
            currentUser={activeUser}
            taskStates={taskStates}
            taskStateColors={taskStateColors}
            autoOpenAddTask={autoOpenAddTask}
            setAutoOpenAddTask={setAutoOpenAddTask}
          />
        );
    }
  };

  // Redirect to InstallerWizard if not configured
  if (!isInstalled) {
    return (
      <InstallerWizard 
        onInstallSuccess={() => {
          setIsInstalled(true);
          window.location.reload();
        }}
        systemLanguage={userLanguage}
      />
    );
  }

  // While loading initial sync data from the database, show a premium glassmorphic loader
  if (isInstalled && !isInitialSyncResolved) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white relative font-sans overflow-hidden">
        {/* Modern radial gradients for premium depth */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.08),transparent_40%)]" />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
          {/* Pulsing CCRM logo icon */}
          <div className="relative mb-8">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 to-emerald-500 opacity-75 blur-md animate-pulse" />
            <div className="relative h-16 w-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-indigo-400">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
            </div>
          </div>
          
          <h2 className="text-lg font-black uppercase tracking-widest text-slate-100">
            CCRM
          </h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2 animate-pulse">
            Syncing database connection...
          </p>
        </div>
      </div>
    );
  }

  const displayUser = currentUser || users[0] || {
    id: "guest",
    name: "Guest User",
    email: "guest@example.com",
    role: "Viewer",
    color: "#6366f1",
    avatar: null,
    activityLog: [],
    metadata_json: "{}"
  };

  const showMailIcon = (() => {
    try {
      if (displayUser && displayUser.metadata_json) {
        const metadata = typeof displayUser.metadata_json === 'string' 
          ? JSON.parse(displayUser.metadata_json) 
          : displayUser.metadata_json;
        return metadata?.emailSettings?.isValidated === true;
      }
    } catch (e) {}
    return false;
  })();

  return (
    <div className="flex h-screen overflow-hidden relative font-sans antialiased text-slate-800 bg-slate-50/50">
      
      {/* Blurred application background layout if not logged in */}
      <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${!currentUser ? "filter blur-md pointer-events-none select-none" : ""}`}>
        {/* Sidebar navigation with role-gated settings visibility */}
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => { 
            if (tab === "settings" && !hasSettingsAccess) return;
            window.location.hash = tab; 
          }} 
          systemName={systemName}
          showSettings={hasSettingsAccess}
          onLogout={() => {
            fetch("/api/logout.php", { method: "POST" }).catch(() => {});
            setCurrentUser(null);
            window.location.hash = "dashboard";
          }}
          systemLanguage={userLanguage}
          showMailIcon={showMailIcon}
          integrationsConfig={integrationsConfig}
          showRagAi={getPermission("rag_view") !== "nothing"}
        />
        
        {/* Workspace Area - Add pb-20 on mobile viewports so that the bottom navigation bar never overlaps content */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          <Header 
            activeTab={activeTab} 
            systemName={systemName} 
            currentUser={displayUser}
            users={users}
            onSwitchUser={(user) => {
              setCurrentUser(user);
              if (user.role.toLowerCase() === "project manager" && activeTab === "settings") {
                setActiveTab("dashboard");
                window.location.hash = "dashboard";
              }
            }}
            onLogout={() => {
              fetch("/api/logout.php", { method: "POST" }).catch(() => {});
              setCurrentUser(null);
              window.location.hash = "dashboard";
            }}
            systemLanguage={userLanguage}
            setSystemLanguage={setUserLanguage}
            isDemoMode={isDemoMode}
            onOpenPersonalSettings={() => {
              setActiveTab("personal-settings");
              window.location.hash = "personal-settings";
            }}
            onNavigateMeetings={(action) => {
              setMeetingsAction(action);
              setActiveTab("meetings");
              window.location.hash = "meetings";
            }}
            onAddTask={() => {
              setActiveTab("tasks");
              window.location.hash = "tasks";
              setAutoOpenAddTask(true);
            }}
          />
          
          <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-[1600px] mx-auto w-full relative flex flex-col justify-between">
            <div className="shrink-0 w-full">
              {renderWorkspaceView()}
            </div>
            <footer className="mt-12 pt-4 border-t border-slate-200/50 flex justify-between items-center text-[10px] text-slate-400 select-none font-semibold uppercase tracking-wider">
              <span>{systemName} CRM &bull; Active Node</span>
              <span>v{VERSION} "Elderberry"</span>
            </footer>
          </main>
        </div>
      </div>
      
      {/* Login Popup Overlay if logged out */}
      {!currentUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-transparent rounded-[32px] shadow-2xl relative animate-in zoom-in-95 duration-300">
            <LoginView 
              users={users}
              systemName={systemName}
              onLoginSuccess={(user) => setCurrentUser(user)}
              systemLanguage={userLanguage}
              isDemoMode={isDemoMode}
              isModal={true}
            />
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs font-black uppercase tracking-wider border border-slate-800">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-[10px]"
              >
                {toast.action.label}
              </button>
            )}
            <button 
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white font-black ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {/* Global File Preview Modal overlay */}
      {previewFile && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-300">
          <div 
            className="fixed inset-0" 
            onClick={() => setPreviewFile(null)} 
          />
          <div className="w-full max-w-5xl h-[85vh] bg-white rounded-t-[32px] rounded-b-[32px] border border-slate-200/80 shadow-2xl p-6 flex flex-col justify-between text-left relative z-10 animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 shrink-0">
              <div className="min-w-0 pr-4">
                <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">File Preview</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight truncate">{previewFile.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={previewFile.url}
                  download={previewFile.name}
                  className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content preview pane */}
            <div className="flex-1 mt-4 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center">
              {(() => {
                const ext = previewFile.name.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext);
                const isPdf = ext === 'pdf';

                if (isImage) {
                  return (
                    <img 
                      src={previewFile.url} 
                      alt={previewFile.name} 
                      className="max-w-full max-h-full object-contain p-2"
                    />
                  );
                }

                if (isPdf) {
                  return (
                    <iframe 
                      src={previewFile.url} 
                      title={previewFile.name} 
                      className="w-full h-full border-none"
                    />
                  );
                }

                return (
                  <div className="text-center p-8 text-slate-500">
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-xs font-bold uppercase tracking-wider">Preview not supported for this file format.</p>
                    <p className="text-[10px] text-slate-400 mt-1">Please use the Download button above to view it offline.</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
