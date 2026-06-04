import { useState, useEffect } from "react";
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
import type { Lead, UserProfile, RolePermission, Task } from "./types";
import { VERSION } from "./utils/version";
import { getTranslation } from "./utils/translations";
import { InstallerWizard } from "./components/InstallerWizard";
import { RefreshCw } from "lucide-react";

function App() {
  const [isInstalled, setIsInstalled] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const getTabFromHash = () => {
    const rawHash = window.location.hash.replace("#", "");
    const hashLower = rawHash.toLowerCase();
    if (hashLower.startsWith("client-") || hashLower.startsWith("lead-") || hashLower.startsWith("user-")) {
      return rawHash; // Keep case sensitivity
    }
    const validTabs = ["dashboard", "overview", "leads", "clients", "tasks", "files", "settings", "personal-settings", "email"];
    return validTabs.includes(hashLower) ? hashLower : "dashboard";
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [isInitialSyncResolved, setIsInitialSyncResolved] = useState(false);
  const [systemName, setSystemName] = useState("CCRM");
  const [systemLanguage, setSystemLanguage] = useState<"en" | "sk" | "hu">("sk");
  const [userLanguage, setUserLanguage] = useState<"en" | "sk" | "hu">("sk");

  // Initial states set to empty / defaults without localStorage or mockData loaders
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [leadStates, setLeadStates] = useState<string[]>([
    "new", "contacted", "offer sent", "accepted", "rejected"
  ]);

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
    smtpHost: "smtp.laminam.sk",
    smtpPort: "465",
    smtpSecure: "ssl",
    smtpAuth: true,
    smtpUser: "crm@laminam.sk",
    smtpPassword: "••••••••••••",
    senderName: "Geely CRM Portal",
    senderEmail: "crm@laminam.sk",
    exchUrl: "https://outlook.office365.com/EWS/Exchange.asmx",
    exchDomain: "LAMINAM",
    exchAuth: "oauth",
    exchClientId: "00000000-0000-0000-0000-000000000000",
    exchTenantId: "00000000-0000-0000-0000-000000000000",
    exchClientSecret: "••••••••••••",
    exchPassword: "",
    exchMailbox: "crm@laminam.sk",
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
    getPermission("system_reset") !== "nothing";

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
    nextIntegrationsConfig?: any
  ) => {
    if (!isInstalled) return;
    const payload = {
      leads: nextLeads || leads,
      tasks: nextTasks || tasks,
      users: users,
      roles: nextRoles || roles,
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
        integrationsConfig: nextIntegrationsConfig || integrationsConfig
      }
    };
    try {
      await fetch("/sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("Failed immediate push to sync.php", err);
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

  // Sync settings when modified (only AFTER the initial database sync is resolved to prevent overwriting with defaults)
  useEffect(() => {
    const syncSettingsToServer = async () => {
      if (!isInstalled || !isInitialSyncResolved) return;
      pushStateToServer(leads, tasks);
    };
    syncSettingsToServer();
  }, [leadStates, leadSources, leadCategories, systemName, systemLanguage, leadStateColors, leadSourceColors, leadCategoryColors, leadStageGroups, leadStateParents, isInitialSyncResolved]);

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
      try {
        const res = await fetch(`/sync.php?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.installed === false) {
            setIsInstalled(false);
            return;
          }
          
          if (data && data.installed === true) {
            setIsInstalled(true);
            setIsDemoMode(data.demoMode === true);
            if (data.leads && Array.isArray(data.leads)) {
              setLeads(data.leads);
            }
            if (data.tasks && Array.isArray(data.tasks)) {
              setTasks(data.tasks);
            }
            if (data.users && Array.isArray(data.users)) {
              setUsers(data.users);
            }
            if (data.roles && Array.isArray(data.roles)) {
              setRoles(data.roles);
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
      try {
        const res = await fetch(`/sync.php?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
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
            }
            if (data.roles && Array.isArray(data.roles)) {
              setRoles((prev) => {
                if (JSON.stringify(data.roles) !== JSON.stringify(prev)) {
                  return data.roles;
                }
                return prev;
              });
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

  // View router
  const renderWorkspaceView = () => {
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
          currentUser={currentUser!}
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
          isDemoMode={isDemoMode}
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
          />
        );
      case "clients":
        return (
          <ClientsView 
            leads={leads}
            setLeads={updateLeadsAndSync}
            projectManagers={projectManagers}
            leadSources={leadSources}
            systemLanguage={userLanguage}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leadCategories={leadCategories}
          />
        );
      case "files":
        return (
          <FilesView leads={leads} systemLanguage={userLanguage} />
        );
      case "personal-settings":
        return (
          <PersonalSettingsView
            currentUser={currentUser!}
            users={users}
            setUsers={setUsers}
            systemLanguage={systemLanguage}
            userLanguage={userLanguage}
            setUserLanguage={setUserLanguage}
            onSync={() => pushStateToServer()}
          />
        );
      case "email":
        return (
          <EmailView
            currentUser={currentUser!}
            leads={leads}
            setLeads={updateLeadsAndSync}
            systemLanguage={userLanguage}
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
            setUsers={setUsers}
            roles={roles}
            setRoles={updateRolesAndSync}
            getPermission={getPermission}
            currentUser={currentUser!}
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
      default:
        return (
          <TaskDashboardView 
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leads={leads}
            users={users}
            systemLanguage={userLanguage}
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

  // Lock workspace if user is logged out (render credentials gate page)
  if (!currentUser) {
    return (
      <LoginView 
        users={users}
        systemName={systemName}
        onLoginSuccess={(user) => setCurrentUser(user)}
        systemLanguage={userLanguage}
        isDemoMode={isDemoMode}
      />
    );
  }

  const showMailIcon = (() => {
    try {
      if (currentUser && currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        return metadata?.emailSettings?.isValidated === true;
      }
    } catch (e) {}
    return false;
  })();

  return (
    <div className="flex min-h-screen relative font-sans overflow-x-hidden antialiased text-slate-800 bg-slate-50/50">
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
          setCurrentUser(null);
          window.location.hash = "dashboard";
        }}
        systemLanguage={userLanguage}
        showMailIcon={showMailIcon}
      />
      
      {/* Workspace Area - Add pb-20 on mobile viewports so that the bottom navigation bar never overlaps content */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <Header 
          activeTab={activeTab} 
          systemName={systemName} 
          currentUser={currentUser}
          users={users}
          onSwitchUser={(user) => {
            setCurrentUser(user);
            if (user.role.toLowerCase() === "project manager" && activeTab === "settings") {
              setActiveTab("dashboard");
              window.location.hash = "dashboard";
            }
          }}
          onLogout={() => {
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
        />
        
        <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-[1600px] mx-auto w-full relative z-40 flex flex-col justify-between">
          <div>
            {renderWorkspaceView()}
          </div>
          <footer className="mt-12 pt-4 border-t border-slate-200/50 flex justify-between items-center text-[10px] text-slate-400 select-none font-semibold uppercase tracking-wider">
            <span>{systemName} CRM &bull; Active Node</span>
            <span>v{VERSION} "Clementine"</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
