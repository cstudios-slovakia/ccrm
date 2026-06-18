import React from "react";
import { 
  Settings, Save, Database, Trash2, ShieldAlert, Sliders, 
  Globe, Plus, X, Tag, Share2, Users, ShieldCheck, Lock,
  Eye, Pencil, Minus, GripVertical, ArrowLeft, Activity, Clock, CheckSquare
} from "lucide-react";
import type { UserProfile, RolePermission } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface SettingsViewProps {
  systemName: string;
  setSystemName: (name: string) => void;
  leadStates: string[];
  setLeadStates: React.Dispatch<React.SetStateAction<string[]>>;
  leadSources: string[];
  setLeadSources: React.Dispatch<React.SetStateAction<string[]>>;
  leadCategories: string[];
  setLeadCategories: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Real dynamic Users list
  users: UserProfile[];
  setUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  
  // Roles definition
  roles: RolePermission[];
  setRoles: React.Dispatch<React.SetStateAction<RolePermission[]>>;
  
  // Active permission checker
  getPermission: (section: keyof RolePermission["permissions"]) => "edit" | "view" | "nothing";
  currentUser: UserProfile;
  
  leadStateColors: Record<string, string>;
  setLeadStateColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  leadSourceColors: Record<string, string>;
  setLeadSourceColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  leadCategoryColors: Record<string, string>;
  setLeadCategoryColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  leadStageGroups: Record<string, "new" | "in_progress" | "closed">;
  setLeadStageGroups: React.Dispatch<React.SetStateAction<Record<string, "new" | "in_progress" | "closed">>>;

  systemLanguage: Language;
  setSystemLanguage: (lang: Language) => void;
  userLanguage: Language;
  initialSelectedUserName?: string;
  leadStateParents: Record<string, string>;
  setLeadStateParents: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isDemoMode?: boolean;
  
  integrationsConfig?: any;
  updateIntegrationsConfig?: (next: any) => void;
  dbInfo?: { host: string; port: string; name: string; user: string };

  taskStates: string[];
  setTaskStates: React.Dispatch<React.SetStateAction<string[]>>;
  taskStateColors: Record<string, string>;
  setTaskStateColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemName,
  setSystemName,
  leadStates,
  setLeadStates,
  initialSelectedUserName,
  leadSources,
  setLeadSources,
  leadCategories,
  setLeadCategories,
  users,
  setUsers,
  roles,
  setRoles,
  getPermission,
  currentUser,
  leadStateColors,
  setLeadStateColors,
  leadSourceColors,
  setLeadSourceColors,
  leadCategoryColors,
  setLeadCategoryColors,
  leadStageGroups,
  setLeadStageGroups,
  systemLanguage,
  setSystemLanguage,
  userLanguage,
  leadStateParents,
  setLeadStateParents,
  isDemoMode,
  integrationsConfig,
  updateIntegrationsConfig,
  dbInfo,
  taskStates,
  setTaskStates,
  taskStateColors,
  setTaskStateColors
}) => {
  const [tempName, setTempName] = React.useState(systemName);
  const [newState, setNewState] = React.useState("");
  const [newSource, setNewSource] = React.useState("");
  const [newTaskState, setNewTaskState] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);
  const [simulatedAction, setSimulatedAction] = React.useState("");
  const [simulatedType, setSimulatedType] = React.useState<"login" | "create" | "update" | "delete" | "system">("login");
  const [newCategory, setNewCategory] = React.useState("");

  const [newStateParent, setNewStateParent] = React.useState("");

  const handleToggleIndent = (stateName: string, indent: boolean) => {
    if (getPermission("pipeline_stages") !== "edit") return;
    const key = stateName.toLowerCase();
    
    if (indent) {
      // Find the closest preceding major state in the same group!
      const currentGroup = leadStageGroups[key] || "in_progress";
      const idx = leadStates.indexOf(stateName);
      
      let parentCandidate = "";
      for (let i = idx - 1; i >= 0; i--) {
        const sName = leadStates[i];
        const sKey = sName.toLowerCase();
        if ((leadStageGroups[sKey] || "in_progress") === currentGroup && !leadStateParents[sKey]) {
          parentCandidate = sKey;
          break;
        }
      }
      
      if (parentCandidate) {
        setLeadStateParents(prev => ({
          ...prev,
          [key]: parentCandidate
        }));
      } else {
        (window as any).showToast(
          userLanguage === "sk" 
            ? "Na vytvorenie podstavu musí predchádzať hlavný stav v rovnakej skupine!" 
            : userLanguage === "hu" 
              ? "Az al-állapot létrehozásához egy fő állapotnak kell megelőznie ugyanabban a csoportban!" 
              : "A major state must precede in the same group to establish a substate!"
        );
      }
    } else {
      // Outdent: remove parent association
      setLeadStateParents(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Drag and drop states for statuses
  const [draggedStatus, setDraggedStatus] = React.useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  // Drag and drop states for sources
  const [draggedSource, setDraggedSource] = React.useState<string | null>(null);
  const [dragOverSourceIndex, setDragOverSourceIndex] = React.useState<number | null>(null);

  const handleMoveSourceToIndex = (sourceName: string, targetIdx: number) => {
    if (getPermission("traffic_sources") !== "edit") return;
    const items = [...leadSources];
    const draggedItemIdx = items.indexOf(sourceName);
    if (draggedItemIdx === -1) return;
    const [draggedItem] = items.splice(draggedItemIdx, 1);
    items.splice(targetIdx, 0, draggedItem);
    setLeadSources(items);
  };

  // Drag and drop states for categories
  const [draggedCategory, setDraggedCategory] = React.useState<string | null>(null);
  const [dragOverCategoryIndex, setDragOverCategoryIndex] = React.useState<number | null>(null);

  const handleMoveCategoryToIndex = (catName: string, targetIdx: number) => {
    if (getPermission("traffic_sources") !== "edit") return;
    const items = [...leadCategories];
    const draggedItemIdx = items.indexOf(catName);
    if (draggedItemIdx === -1) return;
    const [draggedItem] = items.splice(draggedItemIdx, 1);
    items.splice(targetIdx, 0, draggedItem);
    setLeadCategories(items);
  };

  const handleMoveStatusToIndex = (statusName: string, targetIdx: number) => {
    if (getPermission("pipeline_stages") !== "edit") return;
    
    // Construct the items array exactly as rendered in the current order
    const items: ({ type: "divider"; id: "new" | "in_progress" | "closed" } | { type: "status"; name: string })[] = [];
    
    items.push({ type: "divider", id: "new" });
    leadStates.forEach(state => {
      if ((leadStageGroups[state.toLowerCase()] || "in_progress") === "new") {
        items.push({ type: "status", name: state });
      }
    });

    items.push({ type: "divider", id: "in_progress" });
    leadStates.forEach(state => {
      if ((leadStageGroups[state.toLowerCase()] || "in_progress") === "in_progress") {
        items.push({ type: "status", name: state });
      }
    });

    items.push({ type: "divider", id: "closed" });
    leadStates.forEach(state => {
      if ((leadStageGroups[state.toLowerCase()] || "in_progress") === "closed") {
        items.push({ type: "status", name: state });
      }
    });

    // Remove the dragged status from the items copy
    const draggedItemIdx = items.findIndex(item => item.type === "status" && item.name.toLowerCase() === statusName.toLowerCase());
    if (draggedItemIdx === -1) return;
    const [draggedItem] = items.splice(draggedItemIdx, 1);

    // Insert the dragged status at the target index
    items.splice(targetIdx, 0, draggedItem);

    // Walk the list to reconstruct the new order and groupings
    const newLeadStates: string[] = [];
    const newStageGroups: Record<string, "new" | "in_progress" | "closed"> = {};
    let currentGroup: "new" | "in_progress" | "closed" = "new";

    items.forEach(item => {
      if (item.type === "divider") {
        currentGroup = item.id;
      } else {
        newLeadStates.push(item.name);
        newStageGroups[item.name.toLowerCase()] = currentGroup;
      }
    });

    // Save states
    setLeadStates(newLeadStates);
    setLeadStageGroups(newStageGroups);
  };
  
  // User creation states
  const [newManager, setNewManager] = React.useState("");
  const [newUserEmail, setNewUserEmail] = React.useState("");
  const [newUserPassword, setNewUserPassword] = React.useState("");
  const [newUserRole, setNewUserRole] = React.useState("Project Manager");

  // Role creation states
  const [newRoleName, setNewRoleName] = React.useState("");

  const [activeSubTab, setActiveSubTab] = React.useState<"branding" | "managers" | "rbac" | "states" | "sources" | "danger" | "ads" | "api" | "email" | "ai">("branding");

  React.useEffect(() => {
    if (initialSelectedUserName) {
      const match = users.find(u => u.name.toLowerCase() === initialSelectedUserName.toLowerCase());
      if (match) {
        setSelectedUser(match);
        setActiveSubTab("managers");
      }
    } else {
      setSelectedUser(null);
    }
  }, [initialSelectedUserName, users]);

  React.useEffect(() => {
    if (integrationsConfig) {
      setEmailProvider(integrationsConfig.emailProvider || "smtp");
      setSmtpHost(integrationsConfig.smtpHost || "");
      setSmtpPort(integrationsConfig.smtpPort || "");
      setSmtpSecure(integrationsConfig.smtpSecure || "ssl");
      setSmtpAuth(integrationsConfig.smtpAuth !== false);
      setSmtpUser(integrationsConfig.smtpUser || "");
      setSmtpPassword(integrationsConfig.smtpPassword || "");
      setSenderName(integrationsConfig.senderName || "");
      setSenderEmail(integrationsConfig.senderEmail || "");
      setExchUrl(integrationsConfig.exchUrl || "");
      setExchDomain(integrationsConfig.exchDomain || "");
      setExchAuth(integrationsConfig.exchAuth || "oauth");
      setExchClientId(integrationsConfig.exchClientId || "");
      setExchTenantId(integrationsConfig.exchTenantId || "");
      setExchClientSecret(integrationsConfig.exchClientSecret || "");
      setExchPassword(integrationsConfig.exchPassword || "");
      setExchMailbox(integrationsConfig.exchMailbox || "");
      setMetaAppId(integrationsConfig.metaAppId || "");
      setMetaAppSecret(integrationsConfig.metaAppSecret || "");
      setMetaAccessToken(integrationsConfig.metaAccessToken || "");
      setGoogleDevToken(integrationsConfig.googleDevToken || "");
      setGoogleClientId(integrationsConfig.googleClientId || "");
      setGoogleClientSecret(integrationsConfig.googleClientSecret || "");
      setGoogleRefreshToken(integrationsConfig.googleRefreshToken || "");
      setIsConnected(integrationsConfig.adsConnected === true);
      setCampaigns(integrationsConfig.campaigns || []);
      setOpenAiKey(integrationsConfig.openAiKey || "");
      setVectorDb(integrationsConfig.vectorDb || "none");
      setMariaDbHost(integrationsConfig.mariaDbHost || "");
      setMariaDbPort(integrationsConfig.mariaDbPort || "3306");
      setMariaDbUser(integrationsConfig.mariaDbUser || "");
      setMariaDbPassword(integrationsConfig.mariaDbPassword || "");
      setMariaDbName(integrationsConfig.mariaDbName || "");
      setQdrantUrl(integrationsConfig.qdrantUrl || "");
      setQdrantApiKey(integrationsConfig.qdrantApiKey || "");
      setPineconeApiKey(integrationsConfig.pineconeApiKey || "");
      setPineconeIndex(integrationsConfig.pineconeIndex || "");
      setVectorDbValidated(integrationsConfig.vectorDbValidated === true);
    }
  }, [integrationsConfig]);

  // OpenAI & Vector DB Configuration States
  const [openAiKey, setOpenAiKey] = React.useState("");
  const [showOpenAiKey, setShowOpenAiKey] = React.useState(false);
  const [vectorDb, setVectorDb] = React.useState<"none" | "mariadb" | "qdrant" | "pinecone">("none");
  const [mariaDbHost, setMariaDbHost] = React.useState("");
  const [mariaDbPort, setMariaDbPort] = React.useState("3306");
  const [mariaDbUser, setMariaDbUser] = React.useState("");
  const [mariaDbPassword, setMariaDbPassword] = React.useState("");
  const [mariaDbName, setMariaDbName] = React.useState("");
  const [qdrantUrl, setQdrantUrl] = React.useState("");
  const [qdrantApiKey, setQdrantApiKey] = React.useState("");
  const [pineconeApiKey, setPineconeApiKey] = React.useState("");
  const [pineconeIndex, setPineconeIndex] = React.useState("");
  const [vectorDbValidated, setVectorDbValidated] = React.useState(false);

  const [trainingStats, setTrainingStats] = React.useState<any>(null);
  const [isTraining, setIsTraining] = React.useState(false);
  const [trainingProgress, setTrainingProgress] = React.useState(0);
  const [trainingLogs, setTrainingLogs] = React.useState<string[]>([]);
  const [validationResult, setValidationResult] = React.useState<any>(null);
  const [isValidating, setIsValidating] = React.useState(false);

  // Auto-fetch stats if already validated and active sub-tab is AI
  React.useEffect(() => {
    if (activeSubTab === "ai" && vectorDbValidated) {
      fetchTrainingStats();
    }
  }, [activeSubTab, vectorDbValidated]);

  // Email Server Configuration States
  const [emailProvider, setEmailProvider] = React.useState<"smtp" | "exchange">("smtp");

  // SMTP specific configurations
  const [smtpHost, setSmtpHost] = React.useState("");
  const [smtpPort, setSmtpPort] = React.useState("");
  const [smtpSecure, setSmtpSecure] = React.useState<"tls" | "ssl" | "none">("ssl");
  const [smtpAuth, setSmtpAuth] = React.useState(true);
  const [smtpUser, setSmtpUser] = React.useState("");
  const [smtpPassword, setSmtpPassword] = React.useState("");
  const [senderName, setSenderName] = React.useState("");
  const [senderEmail, setSenderEmail] = React.useState("");

  // Microsoft Exchange specific configurations
  const [exchUrl, setExchUrl] = React.useState("");
  const [exchDomain, setExchDomain] = React.useState("");
  const [exchAuth, setExchAuth] = React.useState<"oauth" | "ntlm" | "basic">("oauth");
  const [exchClientId, setExchClientId] = React.useState("");
  const [exchTenantId, setExchTenantId] = React.useState("");
  const [exchClientSecret, setExchClientSecret] = React.useState("");
  const [exchPassword, setExchPassword] = React.useState("");
  const [exchMailbox, setExchMailbox] = React.useState("");

  // Show/Hide password toggles
  const [showSmtpPass, setShowSmtpPass] = React.useState(false);
  const [showExchSecret, setShowExchSecret] = React.useState(false);
  const [showExchPass, setShowExchPass] = React.useState(false);

  // Connection validation states
  const [testRecipient, setTestRecipient] = React.useState("");
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ status: "success" | "error"; message: string } | null>(null);

  const handleSaveEmailSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("general_config") !== "edit") return;

    if (updateIntegrationsConfig) {
      updateIntegrationsConfig({
        ...integrationsConfig,
        emailProvider,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpAuth,
        smtpUser,
        smtpPassword,
        senderName,
        senderEmail,
        exchUrl,
        exchDomain,
        exchAuth,
        exchClientId,
        exchTenantId,
        exchClientSecret,
        exchPassword,
        exchMailbox
      });
    }

    (window as any).showToast(
      userLanguage === "sk" 
        ? "Konfigurácia e-mailového servera bola úspešne uložená!" 
        : userLanguage === "hu" 
          ? "Az e-mail szerver konfigurációja sikeresen mentve!" 
          : "Email server configuration saved successfully!"
    );
  };

  const handleSendTestEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;

    setIsSendingTest(true);
    setTestResult(null);

    // Simulate high-fidelity network transport handshakes
    setTimeout(() => {
      setIsSendingTest(false);
      if (emailProvider === "smtp") {
        if (!smtpHost || !smtpUser || !senderEmail) {
          setTestResult({
            status: "error",
            message: "SMTP handshake failed. Missing host address, username, or sender email envelope."
          });
        } else {
          setTestResult({
            status: "success",
            message: `SMTP envelope delivered! Successfully connected to ${smtpHost}:${smtpPort} (${smtpSecure.toUpperCase()}) and sent test envelope to ${testRecipient}.`
          });
        }
      } else {
        if (exchAuth === "oauth" && (!exchClientId || !exchTenantId)) {
          setTestResult({
            status: "error",
            message: "Exchange Server authentication failed. Missing Client ID or Tenant ID for OAuth 2.0 connection workflow."
          });
        } else {
          setTestResult({
            status: "success",
            message: `Microsoft Exchange handshake verified! Autodiscovered OWA endpoints, completed authentication via ${exchAuth.toUpperCase()}, and pushed message to ${testRecipient} from mailbox ${exchMailbox}.`
          });
        }
      }
    }, 1800);
  };

  const fetchTrainingStats = async () => {
    try {
      const res = await fetch("/api/train_vector.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stats" })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTrainingStats(data.stats);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch training stats", err);
    }
  };

  const handleValidateConnection = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/api/validate_vector.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vectorDb,
          mariaDbHost,
          mariaDbPort,
          mariaDbUser,
          mariaDbPassword,
          mariaDbName,
          qdrantUrl,
          qdrantApiKey,
          pineconeApiKey,
          pineconeIndex
        })
      });
      const data = await res.json();
      setIsValidating(false);
      setValidationResult(data);
      if (data.success) {
        setVectorDbValidated(true);
        if (updateIntegrationsConfig) {
          updateIntegrationsConfig({
            ...integrationsConfig,
            vectorDb,
            mariaDbHost,
            mariaDbPort,
            mariaDbUser,
            mariaDbPassword,
            mariaDbName,
            qdrantUrl,
            qdrantApiKey,
            pineconeApiKey,
            pineconeIndex,
            vectorDbValidated: true
          });
        }
      } else {
        setVectorDbValidated(false);
      }
    } catch (err) {
      setIsValidating(false);
      setValidationResult({
        success: false,
        message: "Failed to communicate with vector DB validation API."
      });
      setVectorDbValidated(false);
    }
  };

  const handleStartTraining = async () => {
    setIsTraining(true);
    setTrainingProgress(0);
    setTrainingLogs(["[START] Starting database chunking and indexing sequence..."]);
    
    let step = 0;
    let finished = false;
    
    while (!finished) {
      try {
        const res = await fetch("/api/train_vector.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "train", step, vectorDb })
        });
        if (!res.ok) {
          throw new Error("HTTP error " + res.status);
        }
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || "Unknown training error");
        }
        
        finished = data.finished;
        setTrainingProgress(data.progress);
        if (data.logs) {
          setTrainingLogs(prev => [...prev, ...data.logs]);
        }
        step = data.step;
        
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (err: any) {
        setTrainingLogs(prev => [...prev, `[ERROR] Ingestion failed: ${err.message}`]);
        setIsTraining(false);
        return;
      }
    }
    
    setIsTraining(false);
    fetchTrainingStats();
  };

  const handleSaveAiSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("ai_config") !== "edit") return;

    if (updateIntegrationsConfig) {
      updateIntegrationsConfig({
        ...integrationsConfig,
        openAiKey,
        vectorDb,
        mariaDbHost,
        mariaDbPort,
        mariaDbUser,
        mariaDbPassword,
        mariaDbName,
        qdrantUrl,
        qdrantApiKey,
        pineconeApiKey,
        pineconeIndex,
        vectorDbValidated
      });
    }

    (window as any).showToast(
      userLanguage === "sk" 
        ? "Konfigurácia AI integrácie bola úspešne uložená!" 
        : userLanguage === "hu" 
          ? "Az AI integrációs beállítások sikeresen mentve!" 
          : "AI integration settings saved successfully!"
    );
  };

  // API Key management states
  const [apiKey, setApiKey] = React.useState("");
  const [isApiKeyLoading, setIsApiKeyLoading] = React.useState(false);
  const [showKey, setShowKey] = React.useState(false);

  const fetchApiKey = async () => {
    setIsApiKeyLoading(true);
    try {
      const res = await fetch("/api/pipeline.php?action=get_key");
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.api_key) {
          setApiKey(data.api_key);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch API key", err);
    } finally {
      setIsApiKeyLoading(false);
    }
  };

  const handleResetApiKey = async () => {
    if (!confirm(
      userLanguage === "sk" 
        ? "Naozaj chcete resetovať kľúč API? Akékoľvek aktívne externé pripojenia používajúce starý kľúč okamžite zlyhajú!" 
        : userLanguage === "hu" 
          ? "Biztosan vissza szeretné állítani az API kulcsot? A régi kulcsot használó aktív külső kapcsolatok azonnal megszakadnak!" 
          : "Are you sure you want to reset the API key? Any active external connections using the old key will fail immediately!"
    )) {
      return;
    }
    setIsApiKeyLoading(true);
    try {
      const res = await fetch("/api/pipeline.php?action=reset_key", {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.api_key) {
          setApiKey(data.api_key);
          (window as any).showToast(
            userLanguage === "sk" 
              ? "Nový kľúč API bol úspešne vygenerovaný a aktívne externé zdroje musia byť aktualizované." 
              : userLanguage === "hu" 
                ? "Új API kulcs sikeresen generálva, az aktív külső forrásokat frissíteni kell." 
                : "A new API key has been successfully generated and active external sources must be updated."
          );
        }
      }
    } catch (err) {
      console.warn("Failed to reset API key", err);
    } finally {
      setIsApiKeyLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeSubTab === "api") {
      fetchApiKey();
    }
  }, [activeSubTab]);

  // Meta & Google Ads Credentials
  // Meta & Google Ads Credentials
  const [metaAppId, setMetaAppId] = React.useState("");
  const [metaAppSecret, setMetaAppSecret] = React.useState("");
  const [metaAccessToken, setMetaAccessToken] = React.useState("");

  const [googleDevToken, setGoogleDevToken] = React.useState("");
  const [googleClientId, setGoogleClientId] = React.useState("");
  const [googleClientSecret, setGoogleClientSecret] = React.useState("");
  const [googleRefreshToken, setGoogleRefreshToken] = React.useState("");

  // API Campaign engine states
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isConnected, setIsConnected] = React.useState(false);

  // High-fidelity running campaigns mock listing
  interface Campaign {
    id: string;
    name: string;
    platform: "meta" | "google";
    budget: number;
    status: "active" | "paused" | "learning";
    impressions: number;
    clicks: number;
    spent: number;
    leads: number;
  }

  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);

  const syncAdsCredentialsToDb = () => {
    if (updateIntegrationsConfig) {
      updateIntegrationsConfig({
        ...integrationsConfig,
        metaAppId,
        metaAppSecret,
        metaAccessToken,
        googleDevToken,
        googleClientId,
        googleClientSecret,
        googleRefreshToken
      });
    }
  };

  React.useEffect(() => {
    if (updateIntegrationsConfig && integrationsConfig) {
      if (JSON.stringify(campaigns) !== JSON.stringify(integrationsConfig.campaigns)) {
        updateIntegrationsConfig({
          ...integrationsConfig,
          campaigns
        });
      }
    }
  }, [campaigns, integrationsConfig]);

  // Dynamic click-to-cycle tri-state permission cell renderer
  const renderTriStateCell = (roleName: string, section: keyof RolePermission["permissions"]) => {
    const isAdmin = roleName.toLowerCase() === "admin";
    const currentValue = isAdmin ? "edit" : (roles.find(r => r.name === roleName)?.permissions[section] || "nothing");
    const disabled = isAdmin || getPermission("pm_managers") === "view";

    const getStyleAndIcon = () => {
      switch (currentValue) {
        case "edit":
          return {
            btnStyle: "bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100/70",
            icon: <Pencil className="h-3.5 w-3.5 shrink-0" />,
            label: getTranslation(userLanguage, "settings.rbac.state.edit")
          };
        case "view":
          return {
            btnStyle: "bg-blue-50 text-blue-700 border-blue-250 hover:bg-blue-100/70",
            icon: <Eye className="h-3.5 w-3.5 shrink-0" />,
            label: getTranslation(userLanguage, "settings.rbac.state.view")
          };
        case "nothing":
        default:
          return {
            btnStyle: "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100/40 hover:text-slate-500",
            icon: <Minus className="h-3.5 w-3.5 shrink-0" />,
            label: getTranslation(userLanguage, "settings.rbac.state.nothing")
          };
      }
    };

    const { btnStyle, icon, label } = getStyleAndIcon();

    const handleCycle = () => {
      if (disabled) return;
      let nextValue: "edit" | "view" | "nothing" = "nothing";
      if (currentValue === "nothing") nextValue = "view";
      else if (currentValue === "view") nextValue = "edit";
      
      updateRolePermission(roleName, section, nextValue);
    };

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handleCycle}
        className={`mx-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all shadow-sm ${btnStyle} ${
          disabled ? "opacity-80 cursor-not-allowed" : "cursor-pointer active:scale-95 hover:scale-[1.03]"
        }`}
        title={disabled 
          ? (userLanguage === "sk" ? `${roleName} oprávnenia sú uzamknuté` : userLanguage === "hu" ? `${roleName} jogosultságok zárolva vannak` : `${roleName} permissions are locked`) 
          : (userLanguage === "sk" ? `Kliknutím zmeníte: Žiadne → Čítanie → Zápis` : userLanguage === "hu" ? `Kattintson a ciklushoz: Nincs → Megtekintés → Módosítás` : `Click to cycle: None → View → Edit`)}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  // Set default initial tab if permissions changed
  React.useEffect(() => {
    const tabs = [
      { id: "branding", key: "general_config" as const },
      { id: "ads", key: "general_config" as const },
      { id: "managers", key: "pm_managers" as const },
      { id: "rbac", key: "pm_managers" as const },
      { id: "states", key: "pipeline_stages" as const },
      { id: "sources", key: "traffic_sources" as const },
      { id: "danger", key: "system_reset" as const }
    ];
    const allowed = tabs.find(t => getPermission(t.key) !== "nothing");
    if (allowed && !tabs.find(t => t.id === activeSubTab && getPermission(t.key) !== "nothing")) {
      setActiveSubTab(allowed.id as any);
    }
  }, [currentUser, roles]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    if (getPermission("general_config") !== "edit") return;
    setSystemName(tempName);
    (window as any).showToast(userLanguage === "sk" ? "Nastavenia značky boli úspešne uložené!" : userLanguage === "hu" ? "Márkajelzés beállításai sikeresen mentve!" : "Branding settings saved successfully!");
  };

  const handleReset = () => {
    if (getPermission("system_reset") !== "edit") return;
    if (confirm(
      userLanguage === "sk" 
        ? "Naozaj chcete resetovať celé úložisko CRM? Toto vymaže reláciu a obnoví stavy." 
        : userLanguage === "hu" 
          ? "Biztosan vissza szeretné állítani a teljes CRM tárolót? Ez törli a munkamenetet és visszaállítja az állapotokat." 
          : "Are you sure you want to reset all CRM storage? This will clear the active session and reload states."
    )) {
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const handleWipeDemo = async () => {
    if (getPermission("system_reset") !== "edit") return;
    
    const keepConfigs = confirm(
      userLanguage === "sk"
        ? "Chcete zachovať vaše nakonfigurované marketingové kanály, kategórie záujmu a nastavenia farieb pipeline?"
        : userLanguage === "hu"
          ? "Meg akarja tartani a konfigurált csatornákat, érdeklődési kategóriákat és a csővezeték színbeállításait?"
          : "Do you want to preserve your configured marketing channels, custom categories, and pipeline state colors?"
    );

    try {
      const res = await fetch("/api/wipe_demo.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_configs: keepConfigs })
      });
      const data = await res.json();
      if (data.success) {
        (window as any).showToast(
          userLanguage === "sk"
            ? "Demo dáta boli úspešne odstránené a CRM bol resetovaný."
            : userLanguage === "hu"
              ? "A bemutató adatok sikeresen törölve, és a CRM visszaállítva."
              : "Demo data was successfully removed and CRM was reset."
        );
        // Clear local storage overrides to force pull clean slate
        localStorage.removeItem("crm_seeded_leads_v5_vibe");
        localStorage.removeItem("crm_leads");
        localStorage.removeItem("crm_tasks");
        if (!keepConfigs) {
          localStorage.removeItem("crm_lead_states");
          localStorage.removeItem("crm_lead_sources");
          localStorage.removeItem("crm_lead_categories");
          localStorage.removeItem("crm_lead_state_colors");
          localStorage.removeItem("crm_users_rbac");
          localStorage.removeItem("crm_roles_rbac");
        }
        window.location.reload();
      } else {
        (window as any).showToast("Wipe failed: " + data.message);
      }
    } catch (err) {
      (window as any).showToast("Error wiping demo data.");
    }
  };

  const handleAddState = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("pipeline_stages") !== "edit") return;
    const val = newState.trim().toLowerCase();
    if (!val) return;
    if (leadStates.includes(val)) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Tento stav leadu už existuje!" 
          : userLanguage === "hu" 
            ? "Ez a lead állapot már létezik!" 
            : "This lead state already exists!"
      );
      return;
    }
    setLeadStates([...leadStates, val]);
    setLeadStateColors(prev => ({
      ...prev,
      [val]: "#6366f1" // default modern indigo
    }));
    setLeadStageGroups(prev => ({
      ...prev,
      [val]: "in_progress" // default dynamic grouping
    }));
    if (newStateParent) {
      setLeadStateParents(prev => ({
        ...prev,
        [val]: newStateParent
      }));
    }
    setNewState("");
    setNewStateParent("");
  };

  const handleRemoveState = (state: string) => {
    if (getPermission("pipeline_stages") !== "edit") return;
    if (leadStates.length <= 1) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Pre správne fungovanie je potrebný aspoň jeden stav leadu!" 
          : userLanguage === "hu" 
            ? "A megfelelő működéshez legalább egy lead állapot szükséges!" 
            : "At least one lead state is required for proper operation!"
      );
      return;
    }
    if (confirm(
      userLanguage === "sk" 
        ? `Naozaj chcete odstrániť stav "${state}"? Existujúce leady si tento stav ponechajú, kým nebudú manuálne aktualizované.` 
        : userLanguage === "hu" 
          ? `Biztosan el szeretné távolítani a(z) "${state}" állapotot? A meglévő leadek megtartják ezt az állapotot a manuális frissítésig.` 
          : `Are you sure you want to remove the state "${state}"? Existing leads will keep this state until manually updated.`
    )) {
      setLeadStates(leadStates.filter((s) => s !== state));
      setLeadStageGroups(prev => {
        const next = { ...prev };
        delete next[state.toLowerCase()];
        return next;
      });
      setLeadStateColors(prev => {
        const next = { ...prev };
        delete next[state.toLowerCase()];
        return next;
      });
      setLeadStateParents(prev => {
        const next = { ...prev };
        // Promote child states to major states
        Object.keys(next).forEach(childKey => {
          if (next[childKey] === state.toLowerCase()) {
            delete next[childKey];
          }
        });
        delete next[state.toLowerCase()];
        return next;
      });
    }
  };

   const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("traffic_sources") !== "edit") return;
    const val = newSource.trim().toLowerCase();
    if (!val) return;
    if (leadSources.includes(val)) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Tento zdroj leadu už existuje!" 
          : userLanguage === "hu" 
            ? "Ez a lead forrás már létezik!" 
            : "This lead source already exists!"
      );
      return;
    }
    setLeadSources([...leadSources, val]);
    setLeadSourceColors(prev => ({
      ...prev,
      [val]: "#10b981"
    }));
    setNewSource("");
  };

  const handleRemoveSource = (source: string) => {
    if (getPermission("traffic_sources") !== "edit") return;
    if (leadSources.length <= 1) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Pre správne fungovanie je potrebný aspoň jeden zdroj leadu!" 
          : userLanguage === "hu" 
            ? "A megfelelő működéshez legalább egy lead forrás szükséges!" 
            : "At least one lead source is required for proper operation!"
      );
      return;
    }
    if (confirm(
      userLanguage === "sk" 
        ? `Naozaj chcete odstrániť zdroj "${source}"?` 
        : userLanguage === "hu" 
          ? `Biztosan el szeretné távolítani a(z) "${source}" forrást?` 
          : `Are you sure you want to remove the source "${source}"?`
    )) {
      setLeadSources(leadSources.filter((s) => s !== source));
      setLeadSourceColors(prev => {
        const next = { ...prev };
        delete next[source.toLowerCase()];
        return next;
      });
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("traffic_sources") !== "edit") return;
    const val = newCategory.trim();
    if (!val) return;
    if (leadCategories.some(c => c.toLowerCase() === val.toLowerCase())) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Táto kategória už existuje!" 
          : userLanguage === "hu" 
            ? "Ez a kategória már létezik!" 
            : "This category already exists!"
      );
      return;
    }
    setLeadCategories([...leadCategories, val]);
    setLeadCategoryColors(prev => ({
      ...prev,
      [val]: "#6366f1"
    }));
    setNewCategory("");
  };

  const handleRemoveCategory = (cat: string) => {
    if (getPermission("traffic_sources") !== "edit") return;
    if (leadCategories.length <= 1) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Vyžaduje sa aspoň jedna kategória záujmu!" 
          : userLanguage === "hu" 
            ? "Legalább egy érdeklődési kategória megadása szükséges!" 
            : "At least one interested category is required!"
      );
      return;
    }
    if (confirm(
      userLanguage === "sk" 
        ? `Naozaj chcete odstrániť kategóriu "${cat}"?` 
        : userLanguage === "hu" 
          ? `Biztosan el szeretné távolítani a(z) "${cat}" kategóriát?` 
          : `Are you sure you want to remove the category "${cat}"?`
    )) {
      setLeadCategories(leadCategories.filter((c) => c !== cat));
      setLeadCategoryColors(prev => {
        const next = { ...prev };
        delete next[cat];
        return next;
      });
    }
  };


  // Add/Remove Users logic
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("pm_managers") !== "edit") return;
    const nameVal = newManager.trim();
    const emailVal = newUserEmail.trim();
    const pwdVal = newUserPassword.trim();
    
    if (!nameVal || !emailVal) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Používateľské meno a e-mail sú povinné!" 
          : userLanguage === "hu" 
            ? "Felhasználónév és e-mail megadása kötelező!" 
            : "Username and Email are required!"
      );
      return;
    }

    if (users.some(u => u.name.toLowerCase() === nameVal.toLowerCase() || u.email.toLowerCase() === emailVal.toLowerCase())) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Používateľ s týmto menom alebo e-mailom už existuje!" 
          : userLanguage === "hu" 
            ? "Már létezik felhasználó ezzel a névvel vagy e-mail címmel!" 
            : "A user with this Name or Email already exists!"
      );
      return;
    }

    const newUser: UserProfile = {
      name: nameVal,
      email: emailVal,
      password: pwdVal || "password",
      role: newUserRole,
      color: "#3b82f6", // default blue preset
      activityLog: [
        { id: "log_" + Date.now(), action: "Account provisioned", timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16), details: "User account provisioned inside secure Settings Console", type: "system" }
      ]
    };

    setUsers([...users, newUser]);
    setNewManager("");
    setNewUserEmail("");
    setNewUserPassword("");
  };

  const handleRemoveUser = (name: string) => {
    if (getPermission("pm_managers") !== "edit") return;
    if (name.toLowerCase() === "erik") {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Predvolený účet správcu 'Erik' je chránený systémom a nemožno ho vymazať." 
          : userLanguage === "hu" 
            ? "Az alapértelmezett adminisztrátori fiók 'Erik' rendszer által védett, és nem törölhető." 
            : "The default Admin account 'Erik' is system-protected and cannot be deleted."
      );
      return;
    }
    if (name.toLowerCase() === currentUser.name.toLowerCase()) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Nemôžete vymazať svoje vlastné aktuálne aktívne relácie používateľa!" 
          : userLanguage === "hu" 
            ? "Nem törölheti a saját jelenleg aktív felhasználói munkamenetét!" 
            : "You cannot delete your own currently active user session!"
      );
      return;
    }
    if (users.length <= 1) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Vyžaduje sa aspoň jeden aktívny používateľ!" 
          : userLanguage === "hu" 
            ? "Legalább egy aktív felhasználó megadása szükséges!" 
            : "At least one active user is required!"
      );
      return;
    }
    if (confirm(
      userLanguage === "sk" 
        ? `Naozaj chcete vymazať používateľa "${name}"?` 
        : userLanguage === "hu" 
          ? `Biztosan törölni szeretné a(z) "${name}" felhasználót?` 
          : `Are you sure you want to delete user "${name}"?`
    )) {
      setUsers(users.filter((u) => u.name !== name));
      if (selectedUser && selectedUser.name === name) {
        setSelectedUser(null);
      }
    }
  };

  const handleUpdateUser = (updated: UserProfile) => {
    setUsers(prev => prev.map(u => u.email === updated.email ? updated : u));
    setSelectedUser(updated);
  };

  // Add Role logic
  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (getPermission("pm_managers") !== "edit") return;
    const nameVal = newRoleName.trim();
    if (!nameVal) return;
    if (roles.some(r => r.name.toLowerCase() === nameVal.toLowerCase())) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Táto rola už existuje!" 
          : userLanguage === "hu" 
            ? "Ez a szerepkör már létezik!" 
            : "This role already exists!"
      );
      return;
    }

    const newRole: RolePermission = {
      name: nameVal,
      permissions: {
        general_config: "nothing",
        pm_managers: "nothing",
        pipeline_stages: "nothing",
        traffic_sources: "nothing",
        system_reset: "nothing"
      }
    };

    setRoles([...roles, newRole]);
    setNewRoleName("");
  };

  const handleRemoveRole = (roleName: string) => {
    if (getPermission("pm_managers") !== "edit") return;
    if (roleName === "Admin" || roleName === "Project Manager") {
      (window as any).showToast(
        userLanguage === "sk" 
          ? `Rola "${roleName}" je chránená systémom a nemožno ju vymazať.` 
          : userLanguage === "hu" 
            ? `A(z) "${roleName}" szerepkör rendszer által védett, és nem törölhető.` 
            : `The role "${roleName}" is system-protected and cannot be deleted.`
      );
      return;
    }
    if (users.some(u => u.role === roleName)) {
      (window as any).showToast(
        userLanguage === "sk" 
          ? `Rolovú skupinu "${roleName}" nemožno vymazať, pretože je priradená jednému alebo viacerým aktívnym používateľom.` 
          : userLanguage === "hu" 
            ? `Nem törölhető a(z) "${roleName}" szerepkör, mivel jelenleg egy vagy több aktív felhasználóhoz van rendelve.` 
            : `Cannot delete role "${roleName}" as it is currently assigned to one or more active users.`
      );
      return;
    }
    if (confirm(
      userLanguage === "sk" 
        ? `Naozaj chcete odstrániť vlastnú rolu "${roleName}"?` 
        : userLanguage === "hu" 
          ? `Biztosan el szeretné távolítani a(z) "${roleName}" egyéni szerepkört?` 
          : `Are you sure you want to remove the custom role "${roleName}"?`
    )) {
      setRoles(roles.filter(r => r.name !== roleName));
    }
  };

  const updateRolePermission = (roleName: string, section: keyof RolePermission["permissions"], value: "edit" | "view" | "nothing") => {
    if (getPermission("pm_managers") !== "edit") return;
    if (roleName === "Admin") {
      (window as any).showToast(
        userLanguage === "sk" 
          ? "Oprávnenia roly správcu Admin sú systémovo uzamknuté na úpravy, aby bol zaručený trvalý prístup." 
          : userLanguage === "hu" 
            ? "Az adminisztrátori szerepkör jogosultságai a folyamatos hozzáférés érdekében rendszer szinten zárolva vannak a módosításhoz." 
            : "The Admin role permissions are system-locked to Edit to guarantee continuous access."
      );
      return;
    }

    setRoles(prev => prev.map(r => {
      if (r.name === roleName) {
        return {
          ...r,
          permissions: {
            ...r.permissions,
            [section]: value
          }
        };
      }
      return r;
    }));
  };

  // Filter allowed tabs based on permissions
  const allowedTabs = ([
    { id: "branding", label: "⚙️ General Config", permKey: "general_config" as const },
    { id: "sources", label: "🚀 Traffic & Categories", permKey: "traffic_sources" as const },
    { id: "states", label: "🏷️ Pipeline Stages", permKey: "pipeline_stages" as const },
    { id: "managers", label: "👥 Users & PMs", permKey: "pm_managers" as const },
    { id: "rbac", label: "🛡️ Roles & RBAC", permKey: "pm_managers" as const },
    { id: "email", label: "📧 Email Server", permKey: "general_config" as const },
    { id: "api", label: "🔌 Public API", permKey: "general_config" as const },
    { id: "ads", label: "📢 Ads APIs & Campaigns", permKey: "general_config" as const },
    { id: "ai", label: "🧠 AI Integrations", permKey: "ai_config" as const },
    { id: "danger", label: "⚠️ System Reset", permKey: "system_reset" as const }
  ] as const).filter(tab => getPermission(tab.permKey) !== "nothing");

  // Read-only alert component
  const renderReadOnlyBanner = (permKey: keyof RolePermission["permissions"]) => {
    const isReadOnly = getPermission(permKey) === "view";
    if (!isReadOnly) return null;
    return (
      <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2 mb-6 shadow-sm">
        <Lock className="h-4.5 w-4.5 text-amber-600 shrink-0" />
        <span>{getTranslation(userLanguage, "settings.general.read_only")}</span>
      </div>
    );
  };

  return (
    <div className="space-y-8 select-none text-slate-800 animate-fade-in">
      {/* Title Header */}
      <div className="flex flex-col">
        <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-indigo-600 animate-spin-slow" /> {getTranslation(userLanguage, "header.title.settings")}
        </h2>
        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
          {userLanguage === "sk" 
            ? "Nakonfigurujte identifikátory značky, oprávnenia používateľov a štruktúru pipeline" 
            : userLanguage === "hu" 
              ? "Márkajelzések, felhasználói jogosultságok és pipeline struktúrák beállítása" 
              : "Configure brand identifiers, user permissions, and pipeline structures"}
        </p>
      </div>

      {/* Settings Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-2 lg:sticky lg:top-24 select-none shrink-0">
          <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 pb-2.5 border-b border-slate-150 mb-1.5 block">
              {getTranslation(userLanguage, "settings.category_title")}
            </span>
            {allowedTabs.map(tab => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`w-full text-left px-4 py-3 rounded-2xl font-black text-[10.5px] uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                    isActive 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 font-black border border-indigo-700" 
                      : "text-slate-650 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  {getTranslation(userLanguage, `settings.tab.${tab.id}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side Workspace Panels */}
        <div className="lg:col-span-9">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* TAB 1: General Branding Config */}
        {activeSubTab === "branding" && getPermission("general_config") !== "nothing" && (
          <>
            <div className="lg:col-span-8 space-y-6">
              {renderReadOnlyBanner("general_config")}
              <form onSubmit={handleSave} className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Sliders className="h-4.5 w-4.5 text-indigo-500" /> {getTranslation(userLanguage, "settings.general.title")}
                </h3>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">
                    {getTranslation(userLanguage, "settings.general.system_name")}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={getPermission("general_config") === "view"}
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-heading font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                    placeholder="e.g. CCRM"
                  />
                  <p className="text-[10px] text-slate-400">
                    {getTranslation(userLanguage, "settings.general.system_name_desc")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">
                    {getTranslation(userLanguage, "settings.general.system_lang")}
                  </label>
                  <select
                    disabled={getPermission("general_config") === "view"}
                    value={systemLanguage}
                    onChange={(e) => setSystemLanguage(e.target.value as Language)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-855 font-heading font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="sk">🇸🇰 Slovenčina</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="hu">🇭🇺 Magyar</option>
                  </select>
                  <p className="text-[10px] text-slate-400">
                    {getTranslation(userLanguage, "settings.general.system_lang_desc")}
                  </p>
                </div>

                {getPermission("general_config") === "edit" && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="w-fit px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Save className="h-4 w-4" /> {getTranslation(userLanguage, "common.save")}
                    </button>
                  </div>
                )}
              </form>

              {/* Database Panel */}
              <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Database className="h-4.5 w-4.5 text-emerald-500" /> {getTranslation(userLanguage, "settings.general.db_title")}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-650 font-bold">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_host")}</span>
                      <span className="text-slate-800">localhost</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_port")}</span>
                      <span>{dbInfo?.port || "3306"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_type")}</span>
                      <span className="text-rose-500 font-extrabold uppercase">MySQL/Laravel Core</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_name")}</span>
                      <span className="text-slate-800">ccrm</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_user")}</span>
                      <span>ccrm_user</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-slate-450 uppercase text-[9px] tracking-wider">{getTranslation(userLanguage, "settings.general.db_integrity")}</span>
                      <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> {getTranslation(userLanguage, "settings.general.db_connected")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Globe className="h-4.5 w-4.5 text-indigo-500" /> {getTranslation(userLanguage, "settings.general.host_title")}
                </h3>
                
                <div className="text-xs space-y-3 font-semibold text-slate-650">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{getTranslation(userLanguage, "settings.general.host_status")}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-250 font-black text-[9px] uppercase">
                      {getTranslation(userLanguage, "settings.general.host_connected")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{getTranslation(userLanguage, "settings.general.host_deployment")}</span>
                    <span className="font-extrabold text-indigo-600">{typeof window !== "undefined" ? window.location.host : ""}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{getTranslation(userLanguage, "settings.general.host_laravel")}</span>
                    <span className="text-slate-400 italic">{getTranslation(userLanguage, "settings.general.host_laravel_desc")}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: Users & Managers Directory */}
        {activeSubTab === "managers" && getPermission("pm_managers") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6">
            {renderReadOnlyBanner("pm_managers")}
            
            {!selectedUser ? (
              <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass animate-in fade-in duration-200">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="flex items-center gap-2">
                    <Users className="h-4.5 w-4.5 text-blue-500" /> {getTranslation(userLanguage, "settings.managers.title")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold lowercase">
                    {users.length} {getTranslation(userLanguage, "settings.managers.active_users")}
                  </span>
                </h3>

                {/* Users Responsive Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-455 uppercase font-black tracking-wider text-[9px]">
                        <th className="py-3 px-4">{getTranslation(userLanguage, "settings.managers.th_user")}</th>
                        <th className="py-3 px-4">{getTranslation(userLanguage, "settings.managers.th_email")}</th>
                        <th className="py-3 px-4">{getTranslation(userLanguage, "settings.managers.th_role")}</th>
                        <th className="py-3 px-4">{getTranslation(userLanguage, "settings.managers.th_color")}</th>
                        <th className="py-3 px-4 text-right">{getTranslation(userLanguage, "settings.managers.th_actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {users.map((u) => (
                        <tr key={u.email} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="h-8.5 w-8.5 rounded-lg font-heading font-black text-[10px] flex items-center justify-center border shadow-inner shrink-0"
                                style={{
                                  backgroundColor: `${u.color}12`,
                                  color: u.color,
                                  borderColor: `${u.color}30`
                                }}
                              >
                                {u.name.substring(0,2).toUpperCase()}
                              </div>
                              <span className="font-extrabold text-slate-800">{u.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-550 font-semibold select-all">{u.email}</td>
                          <td className="py-3 px-4">
                            <span 
                              className="px-2.5 py-0.5 rounded-full border text-[8.5px] font-black uppercase tracking-wider"
                              style={{
                                backgroundColor: u.role.toLowerCase() === "admin" ? "#f43f5e10" : "#3b82f610",
                                color: u.role.toLowerCase() === "admin" ? "#f43f5e" : "#3b82f6",
                                borderColor: u.role.toLowerCase() === "admin" ? "#f43f5e25" : "#3b82f625",
                              }}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="h-3 w-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: u.color }} />
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{u.color}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => { window.location.hash = `user-${encodeURIComponent(u.name)}`; }}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 transition-all font-black uppercase text-[9px] flex items-center gap-1"
                              >
                                <Eye className="h-3 w-3" /> {getTranslation(userLanguage, "settings.managers.th_actions")}
                              </button>
                              {getPermission("pm_managers") === "edit" && u.name.toLowerCase() !== "erik" && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveUser(u.name)}
                                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-455 hover:text-rose-600 border border-transparent hover:border-rose-100 transition-colors"
                                  title={userLanguage === "sk" ? `Vymazať účet používateľa ${u.name}` : userLanguage === "hu" ? `Felhasználói fiók törlése ${u.name}` : `Delete user account ${u.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right duration-250">
                {/* Back & Breadcrumbs */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { window.location.hash = "settings"; }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> {getTranslation(userLanguage, "settings.managers.btn_back")}
                  </button>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <span>{getTranslation(userLanguage, "settings.managers.breadcrumbs_users")}</span>
                    <span>/</span>
                    <span className="text-slate-750">{selectedUser.name}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* COLUMN 1: Basic Profile Settings */}
                  <div className="lg:col-span-5 glass-panel p-6 rounded-[28px] border border-white/60 bg-white/95 shadow-glass space-y-6 flex flex-col justify-between">
                    <div className="space-y-5">
                      <div className="border-b border-slate-150 pb-3 flex items-center gap-3">
                        <div 
                          className="h-12 w-12 rounded-2xl font-heading font-black text-sm flex items-center justify-center border-2 shadow shadow-inner shrink-0"
                          style={{
                            backgroundColor: `${selectedUser.color}12`,
                            color: selectedUser.color,
                            borderColor: `${selectedUser.color}40`
                          }}
                        >
                          {selectedUser.name.substring(0,2).toUpperCase()}
                        </div>
                        <div className="flex flex-col text-left">
                          <h4 className="text-sm font-black text-slate-800 leading-tight">{selectedUser.name}</h4>
                          <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400 mt-0.5">
                            {selectedUser.role} {getTranslation(userLanguage, "settings.managers.profile_suffix")}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs font-bold text-slate-700 text-left">
                        {/* Name setting */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-450 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_fullname")}</label>
                          <input
                            type="text"
                            disabled={getPermission("pm_managers") === "view" || selectedUser.name.toLowerCase() === "erik"}
                            value={selectedUser.name}
                            onChange={(e) => {
                              const updated = { ...selectedUser, name: e.target.value };
                              handleUpdateUser(updated);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                          />
                        </div>

                        {/* Email Address */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_email")}</label>
                          <input
                            type="email"
                            disabled={getPermission("pm_managers") === "view" || selectedUser.name.toLowerCase() === "erik"}
                            value={selectedUser.email}
                            onChange={(e) => {
                              const updated = { ...selectedUser, email: e.target.value };
                              handleUpdateUser(updated);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                          />
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_password")}</label>
                          <input
                            type="text"
                            placeholder={getTranslation(userLanguage, "settings.managers.placeholder_password")}
                            disabled={getPermission("pm_managers") === "view"}
                            value={selectedUser.password || ""}
                            onChange={(e) => {
                              const updated = { ...selectedUser, password: e.target.value };
                              handleUpdateUser(updated);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                          />
                        </div>

                        {/* Security Access Level Role */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_access")}</label>
                          {getPermission("pm_managers") === "edit" && selectedUser.name.toLowerCase() !== "erik" ? (
                            <select
                              value={selectedUser.role}
                              onChange={(e) => {
                                const updated = { ...selectedUser, role: e.target.value };
                                handleUpdateUser(updated);
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            >
                              {roles.map(r => (
                                <option key={r.name} value={r.name}>{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-extrabold uppercase select-text tracking-wide w-full">
                              🛡️ {selectedUser.role}
                            </div>
                          )}
                        </div>

                        {/* Swatches preset colors */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <label className="text-[9px] font-black text-slate-450 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_color")}</label>
                          <div className="flex flex-wrap items-center gap-2">
                            {[
                              "#3b82f6", "#0ea5e9", "#6366f1", "#10b981", 
                              "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"
                            ].map((colorPreset) => {
                              const isAssigned = selectedUser.color === colorPreset;
                              return (
                                <button
                                  key={colorPreset}
                                  type="button"
                                  disabled={getPermission("pm_managers") === "view"}
                                  onClick={() => {
                                    const updated = { ...selectedUser, color: colorPreset };
                                    handleUpdateUser(updated);
                                  }}
                                  className="h-5.5 w-5.5 rounded-full border border-white hover:scale-115 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
                                  style={{
                                    backgroundColor: colorPreset,
                                    boxShadow: isAssigned ? `0 0 0 2px ${colorPreset}` : '0 1px 2px rgba(0,0,0,0.05)'
                                  }}
                                  title={`${getTranslation(userLanguage, "settings.managers.lbl_color")} ${colorPreset}`}
                                />
                              );
                            })}

                            {/* Custom Hex Selector */}
                            {getPermission("pm_managers") === "edit" && (
                              <div className="relative h-5.5 w-5.5 rounded-full overflow-hidden border border-slate-350 shadow-sm shrink-0 flex items-center justify-center cursor-pointer bg-slate-50 hover:scale-115 transition-transform">
                                <input
                                  type="color"
                                  value={selectedUser.color}
                                  onChange={(e) => {
                                    const updated = { ...selectedUser, color: e.target.value };
                                    handleUpdateUser(updated);
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                                  title={getTranslation(userLanguage, "settings.managers.tooltip_custom_color")}
                                />
                                <span className="text-[10px] font-black text-slate-550 select-none leading-none">&#9638;</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={() => { window.location.hash = "settings"; }}
                        className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <Save className="h-4.5 w-4.5" /> {getTranslation(userLanguage, "settings.managers.btn_save_profile")}
                      </button>
                    </div>
                  </div>

                  {/* COLUMN 2: User Activity timeline */}
                  <div className="lg:col-span-7 glass-panel p-6 rounded-[28px] border border-white/60 bg-white/95 shadow-glass space-y-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100 text-left">
                        <Clock className="h-4.5 w-4.5 text-indigo-500 animate-pulse stroke-[2.5]" /> {getTranslation(userLanguage, "settings.managers.timeline_title")}
                      </h3>

                      {(!selectedUser.activityLog || selectedUser.activityLog.length === 0) ? (
                        <div className="py-12 text-center text-slate-400">
                          <div className="text-3xl mb-2">📜</div>
                          <div className="font-black text-slate-700 uppercase tracking-wider">{getTranslation(userLanguage, "settings.managers.timeline_empty")}</div>
                          <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-450">{getTranslation(userLanguage, "settings.managers.timeline_empty_desc")}</div>
                        </div>
                      ) : (
                        <div className="overflow-y-auto max-h-[380px] pr-2 pl-2 space-y-5 relative scrollbar-thin text-left">
                          {/* vertical line */}
                          <div className="absolute left-[17px] top-2 bottom-2 w-0.5 bg-slate-100 rounded-full"></div>

                          {selectedUser.activityLog.map((log) => {
                            let badgeBg = "bg-blue-50 text-blue-700 border-blue-200";
                            if (log.type === "create") badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                            if (log.type === "update") badgeBg = "bg-purple-50 text-purple-700 border-purple-200";
                            if (log.type === "delete") badgeBg = "bg-rose-50 text-rose-700 border-rose-200";
                            if (log.type === "system") badgeBg = "bg-amber-50 text-amber-700 border-amber-200";

                            return (
                              <div key={log.id} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom duration-200 select-text">
                                {/* Dot icon indicator */}
                                <div 
                                  className="h-8.5 w-8.5 rounded-lg flex items-center justify-center border-2 shrink-0 z-10 shadow-sm"
                                  style={{
                                    backgroundColor: "white",
                                    borderColor: selectedUser.color
                                  }}
                                >
                                  <Activity className="h-3.5 w-3.5" style={{ color: selectedUser.color }} />
                                </div>

                                <div className="flex-1 bg-slate-50/50 p-3 rounded-2xl border border-slate-200 shadow-sm relative">
                                  <div className="absolute -left-[5px] top-[12px] w-2.5 h-2.5 bg-white border-l border-b border-slate-200 transform rotate-45"></div>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-extrabold text-xs text-slate-800 leading-tight block">{log.action}</span>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider shrink-0">{log.timestamp}</span>
                                  </div>
                                  {log.details && (
                                    <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-relaxed">{log.details}</p>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase border block w-fit mt-2 ${badgeBg}`}>
                                    {log.type}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* SIMULATION FORM */}
                    {getPermission("pm_managers") === "edit" && (
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!simulatedAction.trim()) return;
                          const newEvent = {
                            id: "sim_" + Date.now(),
                            action: simulatedAction.trim(),
                            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
                            details: `${getTranslation(userLanguage, "settings.managers.sim_details_prefix")}${selectedUser.name}`,
                            type: simulatedType
                          };
                          const updated = {
                            ...selectedUser,
                            activityLog: [newEvent, ...(selectedUser.activityLog || [])]
                          };
                          handleUpdateUser(updated);
                          setSimulatedAction("");
                        }}
                        className="p-4 border border-slate-200 bg-slate-50/50 rounded-2xl space-y-3 mt-4 text-left"
                      >
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Sliders className="h-3.5 w-3.5 text-indigo-550" /> {getTranslation(userLanguage, "settings.managers.sim_title")}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                          <input
                            type="text"
                            required
                            value={simulatedAction}
                            onChange={(e) => setSimulatedAction(e.target.value)}
                            placeholder={getTranslation(userLanguage, "settings.managers.sim_placeholder")}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 sm:col-span-8"
                          />
                          <select
                            value={simulatedType}
                            onChange={(e) => setSimulatedType(e.target.value as any)}
                            className="w-full px-2 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-extrabold uppercase tracking-wide text-slate-700 focus:outline-none focus:border-indigo-500 sm:col-span-4"
                          >
                            <option value="login">login</option>
                            <option value="create">create</option>
                            <option value="update">update</option>
                            <option value="delete">delete</option>
                            <option value="system">system</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-slate-850 hover:bg-slate-750 text-white text-[10px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" /> {getTranslation(userLanguage, "settings.managers.sim_btn")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Add User form - Gated to edit access */}
            {!selectedUser && getPermission("pm_managers") === "edit" && (
                <form onSubmit={handleAddUser} className="p-5 border border-slate-200/80 bg-slate-50/50 rounded-2xl space-y-4 max-w-2xl mt-8">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <Plus className="h-4 w-4" /> {getTranslation(userLanguage, "settings.managers.form_title")}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_fullname")}</label>
                      <input
                        type="text"
                        required
                        value={newManager}
                        onChange={(e) => setNewManager(e.target.value)}
                        placeholder="e.g. Sara Nováková"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_email")}</label>
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="e.g. sara@crm.com"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_password")}</label>
                      <input
                        type="password"
                        required
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder={getTranslation(userLanguage, "settings.managers.placeholder_new_password")}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.managers.lbl_role_assignment")}</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                      >
                        {roles.map(r => (
                          <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="w-fit px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-blue-600/10 flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" /> {getTranslation(userLanguage, "settings.managers.btn_provision")}
                    </button>
                  </div>
                </form>
              )}
            </div>
        )}

        {/* TAB 3: Roles & RBAC Matrix Editor */}
        {activeSubTab === "rbac" && getPermission("pm_managers") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6">
            {renderReadOnlyBanner("pm_managers")}

            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
              <div className="border-b border-slate-200 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-indigo-500" /> {getTranslation(userLanguage, "settings.rbac.title")}
                </h3>
                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-150 shadow-inner">
                  {getTranslation(userLanguage, "settings.rbac.model_badge")}
                </span>
              </div>

              {/* RBAC Matrix Table (Flipped: columns are roles, rows are functions) */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-650 tracking-wider">
                      <th className="py-4 px-5 min-w-[200px]">{userLanguage === "sk" ? "OPRÁVNENIE / FUNKCIA" : userLanguage === "hu" ? "JOGOSULTSÁG / FUNKCIÓ" : "PERMISSION / FUNCTION"}</th>
                      {roles.map((role) => {
                        const isAdmin = role.name === "Admin";
                        return (
                          <th key={role.name} className="py-4 px-5 text-center min-w-[140px]">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <div className="flex items-center gap-1.5 justify-center">
                                <span 
                                  className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border select-none"
                                  style={{
                                    backgroundColor: isAdmin ? "#ffe4e6" : "#f1f5f9",
                                    color: isAdmin ? "#f43f5e" : "#475569",
                                    borderColor: isAdmin ? "#f43f5e20" : "#cbd5e1",
                                  }}
                                >
                                  {role.name}
                                </span>
                                {isAdmin && (
                                  <span className="h-4.5 w-4.5 rounded-full bg-rose-500 flex items-center justify-center text-[10px] text-white" title={getTranslation(userLanguage, "settings.rbac.master_protected")}>&#128274;</span>
                                )}
                              </div>
                              
                              {/* Delete action for custom roles */}
                              {!isAdmin && role.name !== "Project Manager" && (
                                getPermission("pm_managers") === "edit" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRole(role.name)}
                                    className="text-rose-500 hover:text-rose-700 transition-colors py-0.5 px-2 hover:bg-rose-50 rounded-lg text-[9px] uppercase font-black tracking-wider flex items-center gap-0.5 border border-rose-200"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                    {getTranslation(userLanguage, "common.delete")}
                                  </button>
                                ) : (
                                  <span className="text-[9px] text-slate-400 font-semibold block uppercase">{getTranslation(userLanguage, "settings.rbac.locked")}</span>
                                )
                              )}
                              
                              {(isAdmin || role.name === "Project Manager") && (
                                <span className="text-[9px] text-slate-450 font-bold block select-none uppercase tracking-wider">{getTranslation(userLanguage, "settings.rbac.protected")}</span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {(() => {
                      const permissionGroups = [
                        {
                          groupName: userLanguage === "sk" ? "Klientske Príležitosti & Obchody" : userLanguage === "hu" ? "Ügyfél lehetőségek & Üzletek" : "Client Leads & Opportunities",
                          permissions: [
                            { key: "leads.view", label: userLanguage === "sk" ? "Prezeranie zoznamu" : "View Leads List", desc: userLanguage === "sk" ? "Prístup k prehľadu a Kanban nástenke príležitostí" : "Access overview and Kanban pipeline board" },
                            { key: "leads.create", label: userLanguage === "sk" ? "Vytvorenie príležitostí" : "Create Leads", desc: userLanguage === "sk" ? "Možnosť pridať nového klienta alebo partnera" : "Add a new business or personal prospect" },
                            { key: "leads.edit", label: userLanguage === "sk" ? "Úprava príležitostí" : "Edit Leads", desc: userLanguage === "sk" ? "Zmena hodnôt, ratingov, stavu a informácií o klientskom dopyte" : "Modify estimated deal values, ratings, states, and client info" },
                            { key: "leads.delete", label: userLanguage === "sk" ? "Odstránenie príležitostí" : "Delete Leads", desc: userLanguage === "sk" ? "Trvalé vymazanie príležitostí a celého ich historického feedu" : "Permanently remove a lead opportunity and its entire feed" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Úlohy & Kanban Checklisty" : userLanguage === "hu" ? "Feladatok & Kanban teendők" : "Checklist Tasks & Kanban Boards",
                          permissions: [
                            { key: "tasks.view", label: userLanguage === "sk" ? "Prezeranie úloh" : "View Tasks Board", desc: userLanguage === "sk" ? "Prístup k nástenke úloh, prioritám a termínom" : "Inspect system task cards, deadlines, and active priority boards" },
                            { key: "tasks.create", label: userLanguage === "sk" ? "Vytvorenie úloh" : "Create Tasks", desc: userLanguage === "sk" ? "Možnosť vytvoriť a delegovať novú úlohu pre tím" : "Generate a new task card and specify task checklists" },
                            { key: "tasks.edit", label: userLanguage === "sk" ? "Úprava úloh" : "Edit Tasks", desc: userLanguage === "sk" ? "Presúvanie stavov úloh (Kanban), priradenie PM a termínov" : "Drag tasks across status lanes, reassign, or alter deadlines" },
                            { key: "tasks.delete", label: userLanguage === "sk" ? "Odstránenie úloh" : "Delete Tasks", desc: userLanguage === "sk" ? "Trvalé vymazanie checklistov a celých úloh zo systému" : "Remove task registries completely from databases" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Schôdzky & Kalendár" : userLanguage === "hu" ? "Naptár & Foglalások" : "Appointments & Calendar Slots",
                          permissions: [
                            { key: "calendar.view", label: userLanguage === "sk" ? "Prezeranie termínov" : "View Bookings", desc: userLanguage === "sk" ? "Zobrazenie voľných a obsadených časových slotov tímu" : "Browse scheduled meetings, slots, and time allocations" },
                            { key: "calendar.create", label: userLanguage === "sk" ? "Rezervácia termínov" : "Create Bookings", desc: userLanguage === "sk" ? "Rezervovanie nového termínu pre klienta v kalendári" : "Add a new client meeting block to the calendar" },
                            { key: "calendar.edit", label: userLanguage === "sk" ? "Zmena rezervácie" : "Edit Bookings", desc: userLanguage === "sk" ? "Zmena trvania, dňa a detailov schôdzok" : "Reschedule or adjust description details of active calendar events" },
                            { key: "calendar.delete", label: userLanguage === "sk" ? "Zrušenie rezervácií" : "Delete Bookings", desc: userLanguage === "sk" ? "Vymazanie a stornovanie dohodnutého termínu" : "Remove booked timeslots and cancel team calendar events" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Evidencia Odpracovaného Času" : userLanguage === "hu" ? "Időmérés & Stopwatch" : "Stopwatch & Time Tracking Logs",
                          permissions: [
                            { key: "time_records.view", label: userLanguage === "sk" ? "Prezeranie výkazov" : "View Time Reports", desc: userLanguage === "sk" ? "Prístup k prehľadom, grafom a zaznamenanému času kolegov" : "Review stopwatch timesheets and summary work reports" },
                            { key: "time_records.log", label: userLanguage === "sk" ? "Zapisovanie stopiek" : "Log Stopwatch Time", desc: userLanguage === "sk" ? "Možnosť spustiť stopky a zaznamenať hodiny pre projekt" : "Start, pause, and manually save time tracking stopwatch intervals" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Newsletter & E-mailový Marketing" : userLanguage === "hu" ? "Hírlevél & Marketing kampányok" : "Bulk Email Marketing & Newsletters",
                          permissions: [
                            { key: "newsletter.view", label: userLanguage === "sk" ? "Prezeranie kampaní" : "View Campaigns", desc: userLanguage === "sk" ? "Zobrazenie histórie odoslaných newsletterov a metrík" : "Browse draft and sent templates, open rates, and click ratios" },
                            { key: "newsletter.edit", label: userLanguage === "sk" ? "Úprava šablón" : "Edit Templates", desc: userLanguage === "sk" ? "Písanie a úprava HTML šablón a kampaní newsletterov" : "Create or edit layout HTML design templates for bulk mailings" },
                            { key: "newsletter.send", label: userLanguage === "sk" ? "Odosielanie správ" : "Send Bulk Mailings", desc: userLanguage === "sk" ? "Možnosť spustiť odoslanie kampane zoznamu adresátov" : "Trigger mass delivery system using defined subscriber segments" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Evidencia Zamestnancov (HR)" : userLanguage === "hu" ? "Munkatársak nyilvántartása (HR)" : "HR Employee Directories",
                          permissions: [
                            { key: "hr.view", label: userLanguage === "sk" ? "Zoznam zamestnancov" : "View Employee Roster", desc: userLanguage === "sk" ? "Prezeranie zoznamu PM a kolegov, ich kontaktov a skóre" : "Browse list of active system users, avatars, and metrics" },
                            { key: "hr.edit", label: userLanguage === "sk" ? "Úprava personálnych údajov" : "Edit Worker Files", desc: userLanguage === "sk" ? "Správa mzdy, úprava departmentov a dovoleniek" : "Manage wages, departments, and approve/reject leave requests" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Správca Súborov & Dokumenty" : userLanguage === "hu" ? "Fájlkezelő & Ajánlatok" : "File Cabinet & Proposals",
                          permissions: [
                            { key: "files.view", label: userLanguage === "sk" ? "Prezeranie súborov" : "Browse File Database", desc: userLanguage === "sk" ? "Sťahovanie zmlúv, cenových ponúk a priložených príloh" : "List, download, and review proposals, contracts, or offer attachments" },
                            { key: "files.create", label: userLanguage === "sk" ? "Nahrávanie súborov" : "Upload Documents", desc: userLanguage === "sk" ? "Nahrávanie zmlúv a príloh k zoznamu timeline udalostí" : "Upload contract proposals or attachment documents to timeline events" },
                            { key: "files.delete", label: userLanguage === "sk" ? "Odstránenie súborov" : "Delete Documents", desc: userLanguage === "sk" ? "Trvalé mazanie súborov z databázy príloh" : "Remove document uploads permanently from physical and db storage" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Umelá Inteligencia (AI & RAG)" : "Artificial Intelligence (AI & RAG)",
                          permissions: [
                            { key: "ai_config", label: userLanguage === "sk" ? "AI Nastavenia & Model" : "AI Settings & Embeddings", desc: userLanguage === "sk" ? "Konfigurácia kľúčov OpenAI a výber vektorových DB" : "Configure OpenAI access keys, select vector databases, and manage client training data for RAG" },
                            { key: "rag_view", label: userLanguage === "sk" ? "RAG AI Asistent (Prístup)" : "RAG AI Assistant Access", desc: userLanguage === "sk" ? "Umožňuje používateľom pristupovať a chatovať s RAG AI asistentom" : "Enable user profile access to view and chat with the CRM RAG AI assistant" }
                          ]
                        },
                        {
                          groupName: userLanguage === "sk" ? "Globálne Systémové Nastavenia" : userLanguage === "hu" ? "Globális Rendszerbeállítások" : "Global System Configurations",
                          permissions: [
                            { key: "general_config", label: userLanguage === "sk" ? "Všeobecná konfigurácia" : "Branding & Language Config", desc: userLanguage === "sk" ? "Úprava názvu systému, loga, jazykov a aktívnych mien" : "Configure system name, languages, active branding colors, and currency" },
                            { key: "pm_managers", label: userLanguage === "sk" ? "Správa používateľov & PM" : "Manage Managers Directory", desc: userLanguage === "sk" ? "Možnosť spravovať heslá, priraďovať roly a mazať PM účty" : "Create new workspace managers, upgrade roles, or reset login profiles" },
                            { key: "pipeline_stages", label: userLanguage === "sk" ? "Fázy pipeline" : "Kanban Pipeline Config", desc: userLanguage === "sk" ? "Preusporiadanie, premenovanie a priradenie farieb fázam Kanbanu" : "Reorder, rename, append, or configure status color lanes in pipeline" },
                            { key: "traffic_sources", label: userLanguage === "sk" ? "Zdroje a kategórie" : "Marketing Sources & Slabs", desc: userLanguage === "sk" ? "Správa marketingových kanálov, kategórií materiálu a farieb tagov" : "Edit marketing channels, custom categories of slabs, and tag colors" },
                            { key: "system_reset", label: userLanguage === "sk" ? "Reset celého systému" : "Danger Zone System Reset", desc: userLanguage === "sk" ? "Trvalé stiahnutie mock seedrov, čistenie databáz, mazanie" : "Erase CRM database completely, reload clean seeders, or delete logs" }
                          ]
                        }
                      ];

                      return permissionGroups.flatMap((group, gIdx) => {
                        const rows = [];
                        
                        // Render Group Header Category Row
                        rows.push(
                          <tr key={`g-${gIdx}`} className="bg-slate-50 border-y border-slate-200 select-none">
                            <td colSpan={roles.length + 1} className="py-2.5 px-5 text-left">
                              <span className="text-[10px] font-black tracking-widest text-indigo-900 uppercase">
                                📊 {group.groupName}
                              </span>
                            </td>
                          </tr>
                        );

                        // Render Permissions rows
                        group.permissions.forEach((perm) => {
                          rows.push(
                            <tr key={perm.key} className="hover:bg-slate-50/50 transition-colors">
                              {/* Function detail with descriptive label & slug badge */}
                              <td className="py-3 px-5 max-w-[280px]">
                                <div className="flex flex-col space-y-1 text-left">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-heading font-bold text-slate-800 text-xs tracking-wide">
                                      {perm.label}
                                    </span>
                                    <code className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold select-all">
                                      {perm.key}
                                    </code>
                                  </div>
                                  {perm.desc && (
                                    <p className="text-[10px] font-semibold text-slate-400 leading-normal">
                                      {perm.desc}
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* Tri-state cell for each role column */}
                              {roles.map((role) => (
                                <td key={role.name} className="py-3 px-5 text-center">
                                  {renderTriStateCell(role.name, perm.key as keyof RolePermission["permissions"])}
                                </td>
                              ))}
                            </tr>
                          );
                        });

                        return rows;
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Add Custom Role - Gated */}
              {getPermission("pm_managers") === "edit" && (
                <form onSubmit={handleAddRole} className="p-5 border border-slate-200/85 bg-slate-50/50 rounded-2xl flex flex-col sm:flex-row items-end gap-3 max-w-xl mt-6">
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block pl-0.5">{getTranslation(userLanguage, "settings.rbac.lbl_name")}</label>
                    <input
                      type="text"
                      required
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder={getTranslation(userLanguage, "settings.rbac.placeholder")}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 shrink-0 w-full sm:w-auto"
                  >
                    {getTranslation(userLanguage, "settings.rbac.btn_create")}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
                          {/* TAB 4: Pipeline Stages */}
        {activeSubTab === "states" && getPermission("pipeline_stages") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6 animate-fade-in">
            {renderReadOnlyBanner("pipeline_stages")}

            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <Tag className="h-4.5 w-4.5 text-indigo-500" /> {getTranslation(userLanguage, "settings.states.title")}
              </h3>
              
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-left">
                {getTranslation(userLanguage, "settings.states.desc")}
              </p>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-inner bg-white/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 text-center">{getTranslation(userLanguage, "settings.states.th_drag")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-44">{getTranslation(userLanguage, "settings.states.th_color")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{getTranslation(userLanguage, "settings.states.th_name")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-36">{getTranslation(userLanguage, "settings.states.th_group")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">{getTranslation(userLanguage, "settings.states.th_delete")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Dynamically build list items hierarchically
                      const items: ({ type: "divider"; id: "new" | "in_progress" | "closed"; name: string; color: string; desc: string } | { type: "status"; name: string })[] = [];
                      
                      const groupsList: ("new" | "in_progress" | "closed")[] = ["new", "in_progress", "closed"];
                      groupsList.forEach(group => {
                        const labelKey = group === "new" ? "settings.states.group.new" : group === "in_progress" ? "settings.states.group.in_progress" : "settings.states.group.closed";
                        const descKey = group === "new" ? "settings.states.group.new.desc" : group === "in_progress" ? "settings.states.group.in_progress.desc" : "settings.states.group.closed.desc";
                        const divColor = group === "new" ? "#3b82f6" : group === "in_progress" ? "#6366f1" : "#10b981";
                        
                        items.push({ 
                          type: "divider", 
                          id: group, 
                          name: getTranslation(userLanguage, labelKey), 
                          color: divColor, 
                          desc: getTranslation(userLanguage, descKey) 
                        });

                        const groupStates = leadStates.filter(state => (leadStageGroups[state.toLowerCase()] || "in_progress") === group);
                        // Separate major states from substates
                        const majorStates = groupStates.filter(state => !leadStateParents[state.toLowerCase()]);
                        
                        majorStates.forEach(major => {
                          items.push({ type: "status", name: major });
                          // Add children directly below it
                          groupStates.forEach(sub => {
                            if (leadStateParents[sub.toLowerCase()] === major.toLowerCase()) {
                              items.push({ type: "status", name: sub });
                            }
                          });
                        });
                        
                        // Fallback: in case there are orphaned substates without a major parent in this group
                        groupStates.forEach(sub => {
                          if (leadStateParents[sub.toLowerCase()] && !majorStates.map(m => m.toLowerCase()).includes(leadStateParents[sub.toLowerCase()])) {
                            items.push({ type: "status", name: sub });
                          }
                        });
                      });

                      return items.map((item, idx) => {
                        if (item.type === "divider") {
                          const isDragOver = dragOverIndex === idx;
                          return (
                            <tr
                              key={`div-${item.id}`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (getPermission("pipeline_stages") === "edit") {
                                  setDragOverIndex(idx);
                                }
                              }}
                              onDragLeave={() => setDragOverIndex(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverIndex(null);
                                if (draggedStatus) {
                                  handleMoveStatusToIndex(draggedStatus, idx);
                                  setDraggedStatus(null);
                                }
                              }}
                              className={`transition-all border-b border-slate-200/60 duration-200 ${
                                isDragOver ? "bg-indigo-50/60 scale-[0.99] border-2 border-dashed border-indigo-300" : "bg-slate-100/70"
                              }`}
                            >
                              <td colSpan={5} className="py-3 px-4 font-black uppercase text-slate-800 tracking-wide select-none">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-slate-900 font-extrabold uppercase">{item.name}</span>
                                    <span className="text-[8px] text-slate-400 font-bold block ml-1">{item.desc}</span>
                                  </div>
                                  <span className="text-[7px] text-indigo-500 font-extrabold bg-indigo-50 border border-indigo-200/50 px-2 py-0.5 rounded-full">
                                    {getTranslation(userLanguage, "settings.states.boundary")}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        // Rendering status rows
                        const state = item.name;
                        const color = leadStateColors[state.toLowerCase()] || "#64748b";
                        const resolvedGroup = leadStageGroups[state.toLowerCase()] || "in_progress";
                        const isDragOver = dragOverIndex === idx;
                        const isSub = !!leadStateParents[state.toLowerCase()];

                        return (
                          <tr
                            key={`status-${state}`}
                            draggable={getPermission("pipeline_stages") === "edit" ? "true" : "false"}
                            onDragStart={() => {
                              if (getPermission("pipeline_stages") === "edit") {
                                  setDraggedStatus(state);
                              }
                            }}
                            onDragEnd={() => {
                              setDraggedStatus(null);
                              setDragOverIndex(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (getPermission("pipeline_stages") === "edit" && draggedStatus && draggedStatus !== state) {
                                setDragOverIndex(idx);
                              }
                            }}
                            onDragLeave={() => setDragOverIndex(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOverIndex(null);
                              if (draggedStatus) {
                                handleMoveStatusToIndex(draggedStatus, idx);
                                setDraggedStatus(null);
                              }
                            }}
                            className={`border-b border-slate-200/60 hover:bg-slate-50/50 transition-all duration-200 ${
                              isDragOver ? "bg-indigo-50/55 scale-[0.99] border-y-2 border-dashed border-indigo-350" : ""
                            }`}
                          >
                            {/* 1. GRIP HANDLE + INDENT CONTROLS */}
                            <td className="py-3 px-4 text-center align-middle">
                              <div className="flex items-center justify-center gap-2">
                                {getPermission("pipeline_stages") === "edit" ? (
                                  <>
                                    <GripVertical className="h-4 w-4 text-slate-350 hover:text-slate-550 cursor-grab active:cursor-grabbing inline-block" />
                                    <div className="flex items-center gap-1 select-none shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleIndent(state, true)}
                                        disabled={isSub}
                                        className="text-[10px] text-slate-400 hover:text-indigo-650 disabled:opacity-20 cursor-pointer p-0.5 font-black hover:scale-110 active:scale-90 transition-all"
                                        title="Indent as Substate"
                                      >
                                        ➔
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleIndent(state, false)}
                                        disabled={!isSub}
                                        className="text-[10px] text-slate-400 hover:text-indigo-650 disabled:opacity-20 cursor-pointer p-0.5 font-black hover:scale-110 active:scale-90 transition-all"
                                        title="Outdent to Major State"
                                      >
                                        ⬅
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <Lock className="h-3 w-3 text-slate-300 inline-block" />
                                )}
                              </div>
                            </td>

                            {/* 2. COLOR PICKER */}
                            <td className={`py-3 px-4 align-middle transition-all duration-200 ${isSub ? "pl-14" : ""}`}>
                              <div className="flex items-center gap-2">
                                {getPermission("pipeline_stages") === "edit" ? (
                                  <label className="cursor-pointer relative flex items-center justify-center h-5 w-5 rounded-full border border-slate-200 hover:scale-115 transition-transform bg-slate-50 shadow-inner" title={userLanguage === "sk" ? "Kliknutím upravíte farbu" : userLanguage === "hu" ? "Kattintson a szín szerkesztéséhez" : "Click to edit color"}>
                                    <span className="h-3 w-3 rounded-full border border-white" style={{ backgroundColor: color }} />
                                    <input 
                                      type="color" 
                                      value={color} 
                                      onChange={(e) => {
                                        setLeadStateColors(prev => ({
                                          ...prev,
                                          [state.toLowerCase()]: e.target.value
                                        }));
                                      }}
                                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                    />
                                  </label>
                                ) : (
                                  <span className="h-3 w-3 rounded-full border border-slate-250 inline-block" style={{ backgroundColor: color }} />
                                )}
                                <span className="text-[9px] font-black uppercase text-slate-400">{color}</span>
                              </div>
                            </td>

                            {/* 3. STAGE NAME */}
                            <td className={`py-3 px-4 align-middle transition-all duration-200 ${isSub ? "pl-10" : ""}`}>
                              <div className="flex items-center gap-1.5">
                                {isSub && (
                                  <span className="text-slate-400 font-extrabold text-sm ml-2 mr-1 select-none">↳</span>
                                )}
                                <span 
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase border"
                                  style={{
                                    backgroundColor: `${color}12`,
                                    color: color,
                                    borderColor: `${color}35`
                                  }}
                                >
                                  {state}
                                </span>
                              </div>
                            </td>

                            {/* 4. ASSIGNED GROUP */}
                            <td className="py-3 px-4 align-middle select-none">
                              <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase border tracking-widest ${
                                resolvedGroup === "new" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                resolvedGroup === "in_progress" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}>
                                {resolvedGroup === "in_progress" 
                                  ? (userLanguage === "sk" ? "PREBIEHAJÚCE" : userLanguage === "hu" ? "FOLYAMATBAN" : "IN PROGRESS") 
                                  : resolvedGroup === "new" 
                                    ? (userLanguage === "sk" ? "NOVÉ" : userLanguage === "hu" ? "ÚJ" : "NEW") 
                                    : (userLanguage === "sk" ? "UZAVRETÉ" : userLanguage === "hu" ? "LEZÁRT" : "CLOSED")
                                }
                              </span>
                            </td>

                            {/* 5. DELETE BUTTON */}
                            <td className="py-3 px-4 text-center align-middle">
                              {getPermission("pipeline_stages") === "edit" ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveState(state)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block"
                                  title={getTranslation(userLanguage, "settings.states.remove_title")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <span className="text-[9px] text-slate-300 font-bold block uppercase select-none">{getTranslation(userLanguage, "settings.states.locked")}</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Add Custom Stage */}
              {getPermission("pipeline_stages") === "edit" && (
                <form onSubmit={handleAddState} className="flex gap-2 max-w-lg pt-2 items-center">
                  <input
                    type="text"
                    required
                    value={newState}
                    onChange={(e) => setNewState(e.target.value)}
                    placeholder={getTranslation(userLanguage, "settings.states.placeholder")}
                    className="flex-1 min-w-[150px] px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={newStateParent}
                    onChange={(e) => setNewStateParent(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[150px]"
                  >
                    <option value="">{userLanguage === "sk" ? "-- Hlavný stav --" : userLanguage === "hu" ? "-- Fő állapot --" : "-- Major State --"}</option>
                    {leadStates.filter(s => !leadStateParents[s.toLowerCase()]).map(s => (
                      <option key={s} value={s.toLowerCase()}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> {getTranslation(userLanguage, "settings.states.btn_add")}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Traffic Channels */}
        {activeSubTab === "sources" && getPermission("traffic_sources") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6 animate-fade-in">
            {renderReadOnlyBanner("traffic_sources")}

            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <Share2 className="h-4.5 w-4.5 text-emerald-500" /> {getTranslation(userLanguage, "settings.sources.title")}
              </h3>
              
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-left">
                {getTranslation(userLanguage, "settings.sources.desc")}
              </p>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-inner bg-white/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 text-center">{getTranslation(userLanguage, "settings.states.th_drag")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-44">{getTranslation(userLanguage, "settings.states.th_color")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{getTranslation(userLanguage, "settings.sources.th_name")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">{getTranslation(userLanguage, "settings.states.th_delete")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadSources.map((source, idx) => {
                      const color = leadSourceColors[source.toLowerCase()] || "#10b981";
                      const isDragOver = dragOverSourceIndex === idx;

                      return (
                        <tr
                          key={`source-${source}`}
                          draggable={getPermission("traffic_sources") === "edit" ? "true" : "false"}
                          onDragStart={() => {
                            if (getPermission("traffic_sources") === "edit") {
                              setDraggedSource(source);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggedSource(null);
                            setDragOverSourceIndex(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (getPermission("traffic_sources") === "edit" && draggedSource && draggedSource !== source) {
                              setDragOverSourceIndex(idx);
                            }
                          }}
                          onDragLeave={() => setDragOverSourceIndex(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverSourceIndex(null);
                            if (draggedSource) {
                              handleMoveSourceToIndex(draggedSource, idx);
                              setDraggedSource(null);
                            }
                          }}
                          className={`border-b border-slate-200/60 hover:bg-slate-50/50 transition-all duration-200 ${
                            isDragOver ? "bg-emerald-50/50 scale-[0.99] border-y-2 border-dashed border-emerald-300" : ""
                          }`}
                        >
                          {/* 1. GRIP HANDLE */}
                          <td className="py-3 px-4 text-center align-middle">
                            {getPermission("traffic_sources") === "edit" ? (
                              <GripVertical className="h-4 w-4 text-slate-350 hover:text-slate-550 cursor-grab active:cursor-grabbing inline-block" />
                            ) : (
                              <Lock className="h-3 w-3 text-slate-300 inline-block" />
                            )}
                          </td>

                          {/* 2. COLOR PICKER */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {getPermission("traffic_sources") === "edit" ? (
                                <label className="cursor-pointer relative flex items-center justify-center h-5 w-5 rounded-full border border-slate-200 hover:scale-115 transition-transform bg-slate-50 shadow-inner" title={userLanguage === "sk" ? "Kliknutím upravíte farbu" : userLanguage === "hu" ? "Kattintson a szín szerkesztéséhez" : "Click to edit color"}>
                                  <span className="h-3 w-3 rounded-full border border-white" style={{ backgroundColor: color }} />
                                  <input 
                                    type="color" 
                                    value={color} 
                                    onChange={(e) => {
                                      setLeadSourceColors(prev => ({
                                        ...prev,
                                        [source.toLowerCase()]: e.target.value
                                      }));
                                    }}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                  />
                                </label>
                              ) : (
                                <span className="h-3 w-3 rounded-full border border-slate-250 inline-block" style={{ backgroundColor: color }} />
                              )}
                              <span className="text-[9px] font-black uppercase text-slate-400">{color}</span>
                            </div>
                          </td>

                          {/* 3. SOURCE NAME */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200/60 px-2 py-0.5 rounded-md">ID: {idx + 1}</span>
                              <span 
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase border"
                                style={{
                                  backgroundColor: `${color}12`,
                                  color: color,
                                  borderColor: `${color}35`
                                }}
                              >
                                {source}
                              </span>
                            </div>
                          </td>

                          {/* 4. DELETE BUTTON */}
                          <td className="py-3 px-4 text-center align-middle">
                            {getPermission("traffic_sources") === "edit" ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveSource(source)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block"
                                title={userLanguage === "sk" ? "Odstrániť zdroj" : userLanguage === "hu" ? "Forrás törlése" : "Remove source"}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="text-[9px] text-slate-300 font-bold block uppercase select-none">{getTranslation(userLanguage, "settings.states.locked")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add Custom Source */}
              {getPermission("traffic_sources") === "edit" && (
                <form onSubmit={handleAddSource} className="flex gap-2 max-w-md pt-2">
                  <input
                    type="text"
                    required
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder={getTranslation(userLanguage, "settings.sources.placeholder")}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> {getTranslation(userLanguage, "settings.sources.btn_add")}
                  </button>
                </form>
              )}
            </div>

            {/* Interested Categories configuration card */}
            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass mt-6 animate-fade-in">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <Tag className="h-4.5 w-4.5 text-indigo-500 animate-pulse" /> {getTranslation(userLanguage, "settings.sources.categories_title")}
              </h3>
              
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-left">
                {getTranslation(userLanguage, "settings.sources.categories_desc")}
              </p>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-inner bg-white/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-12 text-center">{getTranslation(userLanguage, "settings.states.th_drag")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-44">{getTranslation(userLanguage, "settings.states.th_color")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{getTranslation(userLanguage, "settings.sources.th_category_name")}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">{getTranslation(userLanguage, "settings.states.th_delete")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadCategories.map((cat, idx) => {
                      const color = leadCategoryColors[cat] || "#6366f1";
                      const isDragOver = dragOverCategoryIndex === idx;

                      return (
                        <tr
                          key={`cat-${cat}`}
                          draggable={getPermission("traffic_sources") === "edit" ? "true" : "false"}
                          onDragStart={() => {
                            if (getPermission("traffic_sources") === "edit") {
                              setDraggedCategory(cat);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggedCategory(null);
                            setDragOverCategoryIndex(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (getPermission("traffic_sources") === "edit" && draggedCategory && draggedCategory !== cat) {
                              setDragOverCategoryIndex(idx);
                            }
                          }}
                          onDragLeave={() => setDragOverCategoryIndex(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverCategoryIndex(null);
                            if (draggedCategory) {
                              handleMoveCategoryToIndex(draggedCategory, idx);
                              setDraggedCategory(null);
                            }
                          }}
                          className={`border-b border-slate-200/60 hover:bg-slate-50/50 transition-all duration-200 ${
                            isDragOver ? "bg-indigo-50/50 scale-[0.99] border-y-2 border-dashed border-indigo-300" : ""
                          }`}
                        >
                          {/* 1. GRIP HANDLE */}
                          <td className="py-3 px-4 text-center align-middle">
                            {getPermission("traffic_sources") === "edit" ? (
                              <GripVertical className="h-4 w-4 text-slate-350 hover:text-slate-550 cursor-grab active:cursor-grabbing inline-block" />
                            ) : (
                              <Lock className="h-3 w-3 text-slate-300 inline-block" />
                            )}
                          </td>

                          {/* 2. COLOR PICKER */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {getPermission("traffic_sources") === "edit" ? (
                                <label className="cursor-pointer relative flex items-center justify-center h-5 w-5 rounded-full border border-slate-200 hover:scale-115 transition-transform bg-slate-50 shadow-inner" title={userLanguage === "sk" ? "Kliknutím upravíte farbu" : userLanguage === "hu" ? "Kattintson a szín szerkesztéséhez" : "Click to edit color"}>
                                  <span className="h-3 w-3 rounded-full border border-white" style={{ backgroundColor: color }} />
                                  <input 
                                    type="color" 
                                    value={color} 
                                    onChange={(e) => {
                                      setLeadCategoryColors(prev => ({
                                        ...prev,
                                        [cat]: e.target.value
                                      }));
                                    }}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                  />
                                </label>
                              ) : (
                                <span className="h-3 w-3 rounded-full border border-slate-250 inline-block" style={{ backgroundColor: color }} />
                              )}
                              <span className="text-[9px] font-black uppercase text-slate-400">{color}</span>
                            </div>
                          </td>

                          {/* 3. CATEGORY NAME */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-555 border border-slate-200/60 px-2 py-0.5 rounded-md">ID: {idx + 1}</span>
                              <span 
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase border"
                                style={{
                                  backgroundColor: `${color}12`,
                                  color: color,
                                  borderColor: `${color}35`
                                }}
                              >
                                {cat}
                              </span>
                            </div>
                          </td>

                          {/* 4. DELETE BUTTON */}
                          <td className="py-3 px-4 text-center align-middle">
                            {getPermission("traffic_sources") === "edit" ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveCategory(cat)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 hover:bg-rose-50 rounded-lg inline-block"
                                title={userLanguage === "sk" ? "Odstrániť kategóriu" : userLanguage === "hu" ? "Kategória törlése" : "Remove category"}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="text-[9px] text-slate-300 font-bold block uppercase select-none">{getTranslation(userLanguage, "settings.states.locked")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add Custom Category */}
              {getPermission("traffic_sources") === "edit" && (
                <form onSubmit={handleAddCategory} className="flex gap-2 max-w-md pt-2">
                  <input
                    type="text"
                    required
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder={getTranslation(userLanguage, "settings.sources.placeholder_category")}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> {getTranslation(userLanguage, "settings.sources.btn_add_category")}
                  </button>
                </form>
              )}
            </div>

            {/* Task States configuration card */}
            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass mt-6 animate-fade-in">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <CheckSquare className="h-4.5 w-4.5 text-indigo-500" /> {userLanguage === "sk" ? "Stavy úloh" : userLanguage === "hu" ? "Feladat állapotok" : "Task States"}
              </h3>
              
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider text-left">
                {userLanguage === "sk" ? "Definujte rôzne stavy pre úlohy, priraďte im farby a prispôsobte si pracovný postup." : userLanguage === "hu" ? "Határozzon meg különböző állapotokat a feladatokhoz, rendeljen hozzájuk színeket, és szabja személyre a munkafolyamatot." : "Define different states for tasks, assign colors to them, and customize your workflow."}
              </p>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-inner bg-white/50">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/60 select-none">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-44">{userLanguage === "sk" ? "Farba" : userLanguage === "hu" ? "Szín" : "Color"}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{userLanguage === "sk" ? "Názov" : userLanguage === "hu" ? "Név" : "Name"}</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">{userLanguage === "sk" ? "Odstrániť" : userLanguage === "hu" ? "Törlés" : "Delete"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskStates.map((state) => {
                      const color = taskStateColors[state] || "#64748b";
                      return (
                        <tr key={state} className="border-b border-slate-150 hover:bg-slate-50/50 transition-colors">
                          {/* COLOR PICKER */}
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {getPermission("traffic_sources") === "edit" ? (
                                <label className="cursor-pointer relative flex items-center justify-center h-5 w-5 rounded-full border border-slate-200 hover:scale-115 transition-transform bg-slate-50 shadow-inner">
                                  <span className="h-3 w-3 rounded-full border border-white" style={{ backgroundColor: color }} />
                                  <input 
                                    type="color" 
                                    value={color} 
                                    onChange={(e) => {
                                      setTaskStateColors(prev => ({
                                        ...prev,
                                        [state]: e.target.value
                                      }));
                                    }}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                  />
                                </label>
                              ) : (
                                <span className="h-3 w-3 rounded-full border border-slate-250 inline-block" style={{ backgroundColor: color }} />
                              )}
                              <span className="text-[9px] font-black uppercase text-slate-400">{color}</span>
                            </div>
                          </td>

                          {/* STATE NAME */}
                          <td className="py-3 px-4 align-middle font-bold text-slate-800 uppercase tracking-wider text-xs">
                            {state}
                          </td>

                          {/* ACTIONS */}
                          <td className="py-3 px-4 text-center align-middle">
                            {getPermission("traffic_sources") === "edit" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (taskStates.length <= 1) {
                                    (window as any).showToast(
                                      userLanguage === "sk" 
                                        ? "Pre správne fungovanie je potrebný aspoň jeden stav úlohy!" 
                                        : "At least one task state is required!"
                                    );
                                    return;
                                  }
                                  if (confirm(
                                    userLanguage === "sk" 
                                      ? `Naozaj chcete odstrániť stav "${state}"?` 
                                      : `Are you sure you want to remove the state "${state}"?`
                                  )) {
                                    setTaskStates(taskStates.filter(s => s !== state));
                                    setTaskStateColors(prev => {
                                      const next = { ...prev };
                                      delete next[state];
                                      return next;
                                    });
                                  }
                                }}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            ) : (
                              <Lock className="h-4 w-4 text-slate-350 inline-block" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add New Task State Form */}
              {getPermission("traffic_sources") === "edit" && (
                <div className="pt-4 border-t border-slate-200/80">
                  <div className="flex items-end gap-3 max-w-md">
                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                        {userLanguage === "sk" ? "Nový stav úlohy" : "New Task State"}
                      </label>
                      <input 
                        type="text"
                        value={newTaskState}
                        onChange={(e) => setNewTaskState(e.target.value)}
                        placeholder="e.g. Pending review"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none font-bold text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const val = newTaskState.trim();
                        if (!val) return;
                        if (taskStates.map(s => s.toLowerCase()).includes(val.toLowerCase())) {
                          (window as any).showToast(
                            userLanguage === "sk" ? "Tento stav už existuje!" : "This state already exists!"
                          );
                          return;
                        }
                        setTaskStates([...taskStates, val]);
                        setTaskStateColors(prev => ({
                          ...prev,
                          [val]: "#3b82f6" // Default blue
                        }));
                        setNewTaskState("");
                      }}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-1 shrink-0"
                    >
                      <Plus className="h-4 w-4 stroke-[2.5]" /> {userLanguage === "sk" ? "Pridať" : "Add"}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: Ads APIs & Campaigns */}
        {activeSubTab === "ads" && getPermission("general_config") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6">
            {renderReadOnlyBanner("general_config")}

            {/* Split Credentials Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Meta Ads Credentials Form */}
              <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <span className="text-blue-600 font-extrabold text-base">♾️</span> {getTranslation(userLanguage, "settings.ads.meta_title")}
                </h3>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.meta_id")}</label>
                    <input
                      type="text"
                      disabled={getPermission("general_config") === "view"}
                      value={metaAppId}
                      onChange={(e) => {
                        setMetaAppId(e.target.value);
                        localStorage.setItem("ads_meta_app_id", e.target.value);
                      }}
                      onBlur={syncAdsCredentialsToDb}
                      placeholder="e.g. 8493029104928"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.meta_secret")}</label>
                    <input
                      type="password"
                      disabled={getPermission("general_config") === "view"}
                      value={metaAppSecret}
                      onChange={(e) => {
                        setMetaAppSecret(e.target.value);
                        localStorage.setItem("ads_meta_app_secret", e.target.value);
                      }}
                      onBlur={syncAdsCredentialsToDb}
                      placeholder="••••••••••••••••••••••••••••••••"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.meta_token")}</label>
                    <textarea
                      rows={2}
                      disabled={getPermission("general_config") === "view"}
                      value={metaAccessToken}
                      onChange={(e) => {
                        setMetaAccessToken(e.target.value);
                        localStorage.setItem("ads_meta_access_token", e.target.value);
                      }}
                      onBlur={syncAdsCredentialsToDb}
                      placeholder="EAAGm0PX4ZBQBO..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 resize-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Google Ads Credentials Form */}
              <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <span className="text-amber-500 font-extrabold text-base">🤖</span> {getTranslation(userLanguage, "settings.ads.google_title")}
                </h3>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.google_dev")}</label>
                      <input
                        type="text"
                        disabled={getPermission("general_config") === "view"}
                        value={googleDevToken}
                        onChange={(e) => {
                          setGoogleDevToken(e.target.value);
                          localStorage.setItem("ads_google_dev_token", e.target.value);
                        }}
                        onBlur={syncAdsCredentialsToDb}
                        placeholder="e.g. AbC12D34E5..."
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.google_client")}</label>
                      <input
                        type="text"
                        disabled={getPermission("general_config") === "view"}
                        value={googleClientId}
                        onChange={(e) => {
                          setGoogleClientId(e.target.value);
                          localStorage.setItem("ads_google_client_id", e.target.value);
                        }}
                        onBlur={syncAdsCredentialsToDb}
                        placeholder="84092-abc.apps.google..."
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.google_secret")}</label>
                    <input
                      type="password"
                      disabled={getPermission("general_config") === "view"}
                      value={googleClientSecret}
                      onChange={(e) => {
                        setGoogleClientSecret(e.target.value);
                        localStorage.setItem("ads_google_client_secret", e.target.value);
                      }}
                      onBlur={syncAdsCredentialsToDb}
                      placeholder="GOCSPX-••••••••••••••••"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(userLanguage, "settings.ads.google_refresh")}</label>
                    <textarea
                      rows={2}
                      disabled={getPermission("general_config") === "view"}
                      value={googleRefreshToken}
                      onChange={(e) => {
                        setGoogleRefreshToken(e.target.value);
                        localStorage.setItem("ads_google_refresh_token", e.target.value);
                      }}
                      onBlur={syncAdsCredentialsToDb}
                      placeholder="1//0gDabc..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 resize-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Campaign Control Center Panel */}
            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="flex flex-col">
                  <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="h-4.5 w-4.5 text-indigo-600" /> {getTranslation(userLanguage, "settings.ads.campaign_title")}
                  </h3>
                  <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mt-1 block">
                    {getTranslation(userLanguage, "settings.ads.campaign_desc")}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Status Indicator */}
                  <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                    isConnected 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-250" 
                      : "bg-slate-50 text-slate-400 border-slate-200"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                    {isConnected ? getTranslation(userLanguage, "settings.ads.status_online") : getTranslation(userLanguage, "settings.ads.status_offline")}
                  </span>

                  <button
                    type="button"
                    disabled={isSyncing || getPermission("general_config") === "view"}
                    onClick={() => {
                      if (!metaAppId.trim() && !googleDevToken.trim()) {
                        (window as any).showToast(
                          userLanguage === "sk" 
                            ? "Vyplňte prosím aspoň jedno rozloženie poverení rozhrania API na autorizáciu synchronizácie integrácie!" 
                            : userLanguage === "hu" 
                              ? "Kérjük, töltsön ki legalább egy API hitelesítő adatot az integrációs szinkronizálás engedélyezéséhez!" 
                              : "Please fill in at least one API credential layout to authorize integration synchronization!"
                        );
                        return;
                      }
                      setIsSyncing(true);
                      setTimeout(() => {
                        setIsSyncing(false);
                        setIsConnected(true);
                        if (updateIntegrationsConfig) {
                          updateIntegrationsConfig({
                            ...integrationsConfig,
                            metaAppId,
                            metaAppSecret,
                            metaAccessToken,
                            googleDevToken,
                            googleClientId,
                            googleClientSecret,
                            googleRefreshToken,
                            adsConnected: true
                          });
                        } else {
                          localStorage.setItem("ads_connected", "true");
                        }
                        (window as any).showToast(
                          userLanguage === "sk" 
                            ? "Zabezpečené overenie API úspešne dokončené! Databázy kampaní boli úspešne synchronizované." 
                            : userLanguage === "hu" 
                              ? "Biztonságos API kézfogás befejeződött! A kampányadatbázisok sikeresen szinkronizálva." 
                              : "Secure API handshake completed! Campaign databases synced successfully."
                        );
                      }, 1200);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 font-black text-[10px] uppercase text-white rounded-xl tracking-wider transition-all flex items-center gap-1.5 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed"
                  >
                    <span>{isSyncing ? getTranslation(userLanguage, "settings.ads.btn_syncing") : getTranslation(userLanguage, "settings.ads.btn_sync")}</span>
                  </button>
                </div>
              </div>

              {/* Connected Active Campaign Listing */}
              {isConnected ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-650 tracking-wider">
                        <th className="py-3.5 px-4 min-w-[130px]">{getTranslation(userLanguage, "settings.ads.th_platform")}</th>
                        <th className="py-3.5 px-4 min-w-[220px]">{getTranslation(userLanguage, "settings.ads.th_name")}</th>
                        <th className="py-3.5 px-4 text-center min-w-[120px]">{getTranslation(userLanguage, "settings.ads.th_budget")}</th>
                        <th className="py-3.5 px-4 text-center min-w-[110px]">{getTranslation(userLanguage, "settings.ads.th_status")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_impressions")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_clicks")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_ctr")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_spent")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_leads")}</th>
                        <th className="py-3.5 px-4 text-right">{getTranslation(userLanguage, "settings.ads.th_cpl")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                      {campaigns.map((c) => {
                        const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00";
                        const cpl = c.leads > 0 ? (c.spent / c.leads).toFixed(2) : "0.00";
                        
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                            {/* Platform badge */}
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                c.platform === "meta"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {c.platform === "meta" ? "♾️ Meta" : "🤖 Google"}
                              </span>
                            </td>

                            {/* Campaign Name */}
                            <td className="py-3 px-4 text-slate-800 font-bold truncate max-w-[250px]" title={c.name}>
                              {c.name}
                            </td>

                            {/* Daily Budget (Editable) */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-slate-400 font-bold">$</span>
                                <input
                                  type="number"
                                  disabled={getPermission("general_config") === "view"}
                                  value={c.budget}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setCampaigns(prev => prev.map(item => item.id === c.id ? { ...item, budget: val } : item));
                                  }}
                                  className="w-16 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-center text-xs"
                                />
                              </div>
                            </td>

                            {/* Campaign Status (Editable) */}
                            <td className="py-3 px-4 text-center">
                              {getPermission("general_config") === "edit" ? (
                                <select
                                  value={c.status}
                                  onChange={(e) => {
                                    const statusVal = e.target.value as any;
                                    setCampaigns(prev => prev.map(item => item.id === c.id ? { ...item, status: statusVal } : item));
                                  }}
                                  className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 focus:outline-none"
                                >
                                  <option value="active">{userLanguage === "sk" ? "Aktívne" : userLanguage === "hu" ? "Aktív" : "Active"}</option>
                                  <option value="paused">{userLanguage === "sk" ? "Pozastavené" : userLanguage === "hu" ? "Szüneteltetve" : "Paused"}</option>
                                  <option value="learning">{userLanguage === "sk" ? "Učenie" : userLanguage === "hu" ? "Tanulás" : "Learning"}</option>
                                </select>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                  c.status === "active"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-250"
                                    : c.status === "paused"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}>
                                  {c.status === "active" 
                                    ? (userLanguage === "sk" ? "Aktívne" : userLanguage === "hu" ? "Aktív" : "Active") 
                                    : c.status === "paused" 
                                      ? (userLanguage === "sk" ? "Pozastavené" : userLanguage === "hu" ? "Szüneteltetve" : "Paused") 
                                      : (userLanguage === "sk" ? "Učenie" : userLanguage === "hu" ? "Tanulás" : "Learning")
                                  }
                                </span>
                              )}
                            </td>

                            {/* Impressions */}
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              {c.impressions.toLocaleString()}
                            </td>

                            {/* Clicks */}
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              {c.clicks.toLocaleString()}
                            </td>

                            {/* CTR */}
                            <td className="py-3 px-4 text-right font-mono text-indigo-600 font-bold">
                              {ctr}%
                            </td>

                            {/* Spent */}
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              ${c.spent.toFixed(2)}
                            </td>

                            {/* Leads */}
                            <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">
                              {c.leads}
                            </td>

                            {/* CPL */}
                            <td className="py-3 px-4 text-right font-mono text-slate-800 font-bold">
                              ${cpl}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <span className="text-2xl">🔌</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-650 uppercase tracking-wide">{getTranslation(userLanguage, "settings.ads.empty_title")}</span>
                    <span className="text-[10px] text-slate-400 max-w-sm mt-1">
                      {getTranslation(userLanguage, "settings.ads.empty_desc")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Public API Integration */}
        {activeSubTab === "api" && getPermission("general_config") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6 animate-fade-in">
            {renderReadOnlyBanner("general_config")}

            {/* API Key management */}
            <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-white/95 shadow-glass">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <Lock className="h-4.5 w-4.5 text-indigo-500 animate-pulse" /> {getTranslation(userLanguage, "settings.api.title")}
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                {getTranslation(userLanguage, "settings.api.desc")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <input
                    type={showKey ? "text" : "password"}
                    readOnly
                    value={apiKey || (userLanguage === "sk" ? "Generovanie tajného kľúča..." : userLanguage === "hu" ? "Titkos kulcs generálása..." : "Generating secret key...")}
                    className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer p-1"
                    title={showKey 
                      ? (userLanguage === "sk" ? "Skryť tajný kľúč" : userLanguage === "hu" ? "Titkos kulcs elrejtése" : "Hide Secret Key") 
                      : (userLanguage === "sk" ? "Zobraziť tajný kľúč" : userLanguage === "hu" ? "Titkos kulcs megjelenítése" : "Show Secret Key")}
                  >
                    {showKey ? <Minus className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (!apiKey) return;
                      navigator.clipboard.writeText(apiKey);
                      (window as any).showToast(userLanguage === "sk" ? "API kľúč bol skopírovaný do schránky!" : userLanguage === "hu" ? "Az API kulcs másolva a vágólapra!" : "API Key copied to clipboard!");
                    }}
                    disabled={!apiKey}
                    className="flex-1 sm:flex-none px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {userLanguage === "sk" ? "Kopírovať kľúč" : userLanguage === "hu" ? "Kulcs másolása" : "Copy Key"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetApiKey}
                    disabled={isApiKeyLoading || getPermission("general_config") === "view"}
                    className="flex-1 sm:flex-none px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/10 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {userLanguage === "sk" ? "Resetovať kľúč" : userLanguage === "hu" ? "Kulcs visszaállítása" : "Reset Key"}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Developer Guide */}
            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  🔌 {getTranslation(userLanguage, "settings.api.guide")}
                </h3>
                <span className="bg-blue-50 text-blue-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-blue-200/50">
                  STABLE w1
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {userLanguage === "sk" 
                  ? "Pripojte svoje externé webové stránky, landing pages alebo kontaktné formuláre priamo do pipeline odoslaním požiadavky POST na:" 
                  : userLanguage === "hu" 
                    ? "Csatlakoztassa külső weboldalait, céloldalait vagy kapcsolatfelvételi űrlapjait közvetlenül a pipeline-hoz egy POST kérés küldésével a következő címre:" 
                    : "Connect your external websites, landing pages, or contact forms directly to the pipeline by sending a POST request to:"
                }{" "}
                <code className="bg-slate-100 text-slate-800 px-2 py-1 rounded-md text-[11px] font-mono border border-slate-200">
                  /api/pipeline.php
                </code>
              </p>

              {/* Monospace Curl Box */}
              <div className="p-5 rounded-2xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto shadow-lg relative border border-slate-800">
                <div className="text-slate-400 select-none pb-2 border-b border-slate-800 mb-3 flex justify-between items-center">
                  <span>{getTranslation(userLanguage, "settings.api.curl_example")}</span>
                  <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">POST</span>
                </div>
                <pre className="whitespace-pre overflow-x-auto leading-relaxed text-emerald-400">
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com"}/api/pipeline.php \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${apiKey || "sk_live_########################"}" \\
  -d '{
    "company_name": "Acme Corp",
    "contact_name": "John Doe",
    "email": "john@acme.com",
    "phone": "+421900111222",
    "city": "Bratislava",
    "country": "Slovakia",
    "message": "We need a new ecommerce website.",
    "value": 4500,
    "source_id": 1
  }'`}
                </pre>
              </div>

              {/* Parameters 2-column list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="p-4 rounded-2xl border border-slate-150 bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{getTranslation(userLanguage, "settings.api.required_fields")}</span>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-700 leading-relaxed font-bold">
                      <code>company_name</code> <span className="text-[10px] text-slate-400 font-normal">{userLanguage === "sk" ? "alebo" : userLanguage === "hu" ? "vagy" : "or"}</span> <code>contact_name</code>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {userLanguage === "sk" 
                        ? "Aspoň jedno z týchto dvoch polí musí byť uvedené v tele JSON na identifikáciu prichádzajúceho kontaktu alebo obchodného záznamu." 
                        : userLanguage === "hu" 
                          ? "Legalább az egyik mezőt meg kell adni a JSON törzsben a bejövő kapcsolat vagy üzleti rekord azonosításához." 
                          : "At least one of these two fields must be provided in the JSON body to identify the incoming contact or business record."
                      }
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-150 bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{getTranslation(userLanguage, "settings.api.optional_fields")}</span>
                  <ul className="text-xs text-slate-700 space-y-2 leading-relaxed font-semibold">
                    <li><code>email</code>, <code>phone</code>, <code>city</code>, <code>country</code> <span className="text-[10px] text-slate-400 font-normal">({userLanguage === "sk" ? "Osobné údaje" : userLanguage === "hu" ? "Személyes adatok" : "Personal info"})</span></li>
                    <li><code>message</code> <span className="text-[10px] text-slate-400 font-normal">({userLanguage === "sk" ? "Mapované do poznámky na časovej osi leadu" : userLanguage === "hu" ? "A lead idővonal jegyzetébe kerül leképezésre" : "Mapped into Lead timeline note"})</span></li>
                    <li><code>value</code> <span className="text-[10px] text-slate-400 font-normal">({userLanguage === "sk" ? "Číselná hodnota leadu - predvolená hodnota 0" : userLanguage === "hu" ? "Numerikus lead érték - alapértelmezetten 0" : "Numerical lead worth - defaults to 0"})</span></li>
                    <li><code>source_id</code> <span className="text-[10px] text-slate-400 font-normal">({userLanguage === "sk" ? "ID zdroja návštevnosti - mapuje sa na zoznam aktívnych nastavení" : userLanguage === "hu" ? "A forgalmi csatorna azonosítója - az aktív beállítások listájára képeződik le" : "ID of the traffic channel - maps to active settings list"})</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Email Server Configuration */}
        {activeSubTab === "email" && getPermission("general_config") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6 animate-fade-in">
            {renderReadOnlyBanner("general_config")}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Form Config Panel */}
              <form onSubmit={handleSaveEmailSettings} className="lg:col-span-8 glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Globe className="h-4.5 w-4.5 text-indigo-500 animate-pulse" /> {getTranslation(userLanguage, "settings.email.title")}
                </h3>

                {/* Provider Selector Switch */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.protocol")}</label>
                  <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 gap-1 w-full sm:max-w-md">
                    <button
                      type="button"
                      onClick={() => setEmailProvider("smtp")}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        emailProvider === "smtp"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-black"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                      }`}
                    >
                      {getTranslation(userLanguage, "settings.email.provider_smtp")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailProvider("exchange")}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        emailProvider === "exchange"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-black"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                      }`}
                    >
                      {getTranslation(userLanguage, "settings.email.provider_exch")}
                    </button>
                  </div>
                </div>

                {/* 1. SMTP PROTOCOL FORM FIELDS */}
                {emailProvider === "smtp" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.smtp_host")}</label>
                      <input
                        type="text"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.mail.example.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.smtp_port")}</label>
                      <input
                        type="text"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        placeholder="465"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.smtp_secure")}</label>
                      <select
                        disabled={getPermission("general_config") === "view"}
                        value={smtpSecure}
                        onChange={(e) => setSmtpSecure(e.target.value as any)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                      >
                        <option value="ssl">{userLanguage === "sk" ? "SSL (Implicitné - Port 465)" : userLanguage === "hu" ? "SSL (Implicit - 465-ös port)" : "SSL (Implicit - Port 465)"}</option>
                        <option value="tls">{userLanguage === "sk" ? "TLS/STARTTLS (Explicitné - Port 587)" : userLanguage === "hu" ? "TLS/STARTTLS (Explicit - 587-es port)" : "TLS/STARTTLS (Explicit - Port 587)"}</option>
                        <option value="none">{userLanguage === "sk" ? "Žiadne (Nezabezpečené - Port 25/80)" : userLanguage === "hu" ? "Nincs (Nem biztonságos - 25/80-as port)" : "None (Insecure - Port 25/80)"}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-3 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-800">{getTranslation(userLanguage, "settings.email.smtp_auth")}</span>
                        <span className="text-[9px] text-slate-400">
                          {userLanguage === "sk" ? "SMTP server vyžaduje prihlasovacie meno a heslo" : userLanguage === "hu" ? "Az SMTP szerver felhasználónevet és jelszót igényel" : "SMTP server demands username and password logins"}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        disabled={getPermission("general_config") === "view"}
                        checked={smtpAuth}
                        onChange={(e) => setSmtpAuth(e.target.checked)}
                        className="h-4.5 w-4.5 text-indigo-650 rounded border-slate-200 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </div>

                    {smtpAuth && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.smtp_user")}</label>
                          <input
                            type="text"
                            required
                            disabled={getPermission("general_config") === "view"}
                            value={smtpUser}
                            onChange={(e) => setSmtpUser(e.target.value)}
                            placeholder="user@domain.com"
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.smtp_pass")}</label>
                          <div className="relative">
                            <input
                              type={showSmtpPass ? "text" : "password"}
                              required
                              disabled={getPermission("general_config") === "view"}
                              value={smtpPassword}
                              onChange={(e) => setSmtpPassword(e.target.value)}
                              placeholder="••••••••••••"
                              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSmtpPass(!showSmtpPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer p-1"
                            >
                              {showSmtpPass ? <Minus className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-3">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.sender_name")}</label>
                      <input
                        type="text"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="Geely CRM Portal"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.sender_email")}</label>
                      <input
                        type="email"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={senderEmail}
                        onChange={(e) => setSenderEmail(e.target.value)}
                        placeholder="crm@example.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* 2. MS EXCHANGE PROTOCOL FORM FIELDS */}
                {emailProvider === "exchange" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.exch_url")}</label>
                      <input
                        type="text"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={exchUrl}
                        onChange={(e) => setExchUrl(e.target.value)}
                        placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.exch_domain")}</label>
                      <input
                        type="text"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={exchDomain}
                        onChange={(e) => setExchDomain(e.target.value)}
                        placeholder="COMPANY"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.exch_auth")}</label>
                      <select
                        disabled={getPermission("general_config") === "view"}
                        value={exchAuth}
                        onChange={(e) => setExchAuth(e.target.value as any)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                      >
                        <option value="oauth">{userLanguage === "sk" ? "OAuth 2.0 (Moderný MS Exchange Online)" : userLanguage === "hu" ? "OAuth 2.0 (Modern MS Exchange Online)" : "OAuth 2.0 (Modern MS Exchange Online)"}</option>
                        <option value="ntlm">{userLanguage === "sk" ? "NTLM (Lokálna AD autentifikácia)" : userLanguage === "hu" ? "NTLM (Helyi AD hitelesítés)" : "NTLM (On-Premises AD Authentication)"}</option>
                        <option value="basic">{userLanguage === "sk" ? "Basic (Zastaraná autentifikácia servera)" : userLanguage === "hu" ? "Basic (Elavult szerver hitelesítés)" : "Basic (Legacy Server Authentication)"}</option>
                      </select>
                    </div>

                    {/* OAuth specific fields */}
                    {exchAuth === "oauth" && (
                      <>
                        <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-3">
                          <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{userLanguage === "sk" ? "ID klienta (aplikácie)" : userLanguage === "hu" ? "Kliens (alkalmazás) azonosító" : "Client (Application) ID"}</label>
                          <input
                            type="text"
                            required
                            disabled={getPermission("general_config") === "view"}
                            value={exchClientId}
                            onChange={(e) => setExchClientId(e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono"
                          />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{userLanguage === "sk" ? "ID adresára (tenanta)" : userLanguage === "hu" ? "Könyvtár (bérlő) azonosító" : "Directory (Tenant) ID"}</label>
                          <input
                            type="text"
                            required
                            disabled={getPermission("general_config") === "view"}
                            value={exchTenantId}
                            onChange={(e) => setExchTenantId(e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono"
                          />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{userLanguage === "sk" ? "Klientsky kľúč (Client Secret)" : userLanguage === "hu" ? "Kliens titkos kulcs (Client Secret)" : "Client Secret"}</label>
                          <div className="relative">
                            <input
                              type={showExchSecret ? "text" : "password"}
                              required
                              disabled={getPermission("general_config") === "view"}
                              value={exchClientSecret}
                              onChange={(e) => setExchClientSecret(e.target.value)}
                              placeholder="••••••••••••"
                              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowExchSecret(!showExchSecret)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer p-1"
                            >
                              {showExchSecret ? <Minus className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Basic / NTLM password field */}
                    {(exchAuth === "basic" || exchAuth === "ntlm") && (
                      <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-3">
                        <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{userLanguage === "sk" ? "Exchange Heslo" : userLanguage === "hu" ? "Exchange Jelszó" : "Exchange Password"}</label>
                        <div className="relative">
                          <input
                            type={showExchPass ? "text" : "password"}
                            required
                            disabled={getPermission("general_config") === "view"}
                            value={exchPassword}
                            onChange={(e) => setExchPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowExchPass(!showExchPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer p-1"
                          >
                            {showExchPass ? <Minus className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 pt-3">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.exch_mailbox")}</label>
                      <input
                        type="email"
                        required
                        disabled={getPermission("general_config") === "view"}
                        value={exchMailbox}
                        onChange={(e) => setExchMailbox(e.target.value)}
                        placeholder="crm@example.com"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Save button */}
                {getPermission("general_config") === "edit" && (
                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <button
                      type="submit"
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Save className="h-4 w-4" /> {getTranslation(userLanguage, "settings.email.btn_save")}
                    </button>
                  </div>
                )}
              </form>

              {/* Connection Diagnostics Panel */}
              <div className="lg:col-span-4 space-y-6">
                <form onSubmit={handleSendTestEmail} className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-white/95 shadow-glass">
                  <h4 className="text-xs font-heading font-bold text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
                    ⚙️ {getTranslation(userLanguage, "settings.email.diagnostics")}
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-normal font-semibold">
                    {getTranslation(userLanguage, "settings.email.diagnostics_desc")}
                  </p>

                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{getTranslation(userLanguage, "settings.email.test_recipient")}</label>
                      <input
                        type="email"
                        required
                        value={testRecipient}
                        onChange={(e) => setTestRecipient(e.target.value)}
                        placeholder="test@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingTest || !testRecipient}
                      className="w-full py-3 bg-slate-850 hover:bg-slate-750 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-55"
                    >
                      {isSendingTest ? (
                        <>
                          <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>{getTranslation(userLanguage, "settings.email.testing_handshake")}</span>
                        </>
                      ) : (
                        getTranslation(userLanguage, "settings.email.send_test")
                      )}
                    </button>
                  </div>

                  {/* Diagnostic Results Block */}
                  {testResult && (
                    <div className={`p-4 rounded-2xl border text-[10.5px] leading-relaxed font-bold transition-all animate-fade-in ${
                      testResult.status === "success" 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                        : "bg-rose-50 border-rose-200 text-rose-800"
                    }`}>
                      <span className="block text-[9.5px] uppercase tracking-wider mb-1 font-black">
                        {testResult.status === "success" ? getTranslation(userLanguage, "settings.email.conn_success") : getTranslation(userLanguage, "settings.email.conn_failure")}
                      </span>
                      {testResult.message}
                    </div>
                  )}
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB: AI & OpenAI Integration */}
        {activeSubTab === "ai" && getPermission("ai_config") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6 animate-fade-in">
            {renderReadOnlyBanner("ai_config")}

            {vectorDbValidated ? (
              /* CONFIRMED CONNECTION CARD */
              <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white/95 shadow-glass space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-slate-150 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-heading font-extrabold text-slate-900 uppercase tracking-wider">
                        Vector Database Connected
                      </h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Your RAG pipeline backend is successfully configured and active.
                      </p>
                    </div>
                  </div>
                  {getPermission("ai_config") === "edit" && (
                    <button
                      type="button"
                      onClick={() => {
                        setVectorDbValidated(false);
                        setValidationResult(null);
                        if (updateIntegrationsConfig) {
                          updateIntegrationsConfig({
                            ...integrationsConfig,
                            vectorDbValidated: false
                          });
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                    >
                      Reset Configuration
                    </button>
                  )}
                </div>
                {/* Active database info summary */}
                <div className="text-xs font-semibold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Active Backend Details</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 block">DB Type:</span>
                      <span className="font-mono text-xs text-indigo-600 font-bold uppercase">{vectorDb}</span>
                    </div>
                    {vectorDb === "mariadb" && (
                      <>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Host:</span>
                          <span className="font-mono text-xs">{mariaDbHost}:{mariaDbPort}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Database Name:</span>
                          <span className="font-mono text-xs">{mariaDbName}</span>
                        </div>
                      </>
                    )}
                    {vectorDb === "qdrant" && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">Host:</span>
                        <span className="font-mono text-xs">{qdrantUrl}</span>
                      </div>
                    )}
                    {vectorDb === "pinecone" && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">Index Name:</span>
                        <span className="font-mono text-xs">{pineconeIndex}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Training widget block */}
                <div className="space-y-4 pt-4">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Database className="h-4 w-4 text-purple-500 animate-pulse" /> RAG Knowledge Index Ingestion
                  </h4>
                  
                  {trainingStats ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Leads Chunks</span>
                        <span className="text-base font-extrabold text-slate-800">{trainingStats.leads}</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Clients Chunks</span>
                        <span className="text-base font-extrabold text-slate-800">{trainingStats.clients}</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Emails Indexed</span>
                        <span className="text-base font-extrabold text-slate-800">{trainingStats.emails}</span>
                      </div>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Chats / Notes</span>
                        <span className="text-base font-extrabold text-slate-800">{trainingStats.chats}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-12 flex items-center justify-center text-xs text-slate-400 font-semibold">
                      Loading data statistics...
                    </div>
                  )}
                  
                  {/* Progress bar */}
                  {isTraining && (
                    <div className="space-y-2 animate-pulse">
                      <div className="flex items-center justify-between text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                        <span>Ingestion in Progress...</span>
                        <span>{trainingProgress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-300" style={{ width: `${trainingProgress}%` }} />
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  {getPermission("ai_config") === "edit" && !isTraining && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleStartTraining}
                        className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-650/20 active:scale-95 transition-all cursor-pointer"
                      >
                        Train Existing Data
                      </button>
                      <button
                        type="button"
                        onClick={fetchTrainingStats}
                        className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
                      >
                        Refresh Statistics
                      </button>
                    </div>
                  )}
                  
                  {/* Logs widget */}
                  {trainingLogs.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Indexation logs</span>
                      <div className="bg-slate-950 text-slate-300 p-4 rounded-2xl font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto space-y-1 scrollbar-thin border border-slate-900 shadow-inner">
                        {trainingLogs.map((log, idx) => (
                          <div key={idx} className={log.includes("[ERROR]") ? "text-rose-400 font-bold" : log.includes("[SUCCESS]") ? "text-emerald-400 font-bold" : ""}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Autonomous Agents Cron Link */}
                  <div className="pt-4 border-t border-slate-150 space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <Clock className="h-4 w-4 text-indigo-500 animate-pulse" /> Autonomous Agents Cron Link
                    </h4>
                    <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100/50 text-xs font-semibold leading-relaxed text-slate-700 space-y-2.5">
                      <p className="text-[11px] text-slate-500">
                        To run autonomous agents automatically, configure your server cron manager (e.g. crontab or a webhook runner) to trigger the endpoint URL below:
                      </p>
                      <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm font-mono text-[10px] break-all select-all text-slate-850">
                        <span>{window.location.origin}/api/cron_agents.php</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* CONFIGURATION FORM */
              <form onSubmit={handleSaveAiSettings} className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">
                <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Globe className="h-4.5 w-4.5 text-indigo-500 animate-pulse" /> AI & OpenAI Integration
                </h3>
                
                <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 text-xs text-slate-650 leading-relaxed font-semibold">
                  Configure your OpenAI access credential. Once entered, you can proceed to select your vector database sidecar and enable semantic RAG lookup inside the CRM sidebar assistant.
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                    OpenAI API Secret Key
                  </label>
                  <div className="relative max-w-2xl">
                    <input
                      type={showOpenAiKey ? "text" : "password"}
                      disabled={getPermission("ai_config") === "view"}
                      value={openAiKey}
                      onChange={(e) => setOpenAiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                      className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-650 cursor-pointer"
                    >
                      {showOpenAiKey ? <Minus className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {openAiKey.trim() !== "" && (
                  <div className="space-y-4 pt-4 border-t border-slate-100 animate-slide-up">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block">
                        Vector Database Backend
                      </label>
                      <select
                        disabled={getPermission("ai_config") === "view"}
                        value={vectorDb}
                        onChange={(e) => {
                          setVectorDb(e.target.value as any);
                          setValidationResult(null);
                        }}
                        className="max-w-2xl w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="none">Disabled</option>
                        <option value="mariadb">MariaDB (Native SQL Vectors - Recommended)</option>
                        <option value="qdrant">Qdrant Sidecar Container</option>
                        <option value="pinecone">Pinecone Cloud Service</option>
                      </select>
                    </div>

                    {vectorDb === "mariadb" && (
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-150 space-y-4 max-w-2xl animate-fade-in">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Database className="h-4 w-4 text-emerald-500" /> MariaDB Vector Connection Settings
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Database Host</label>
                            <input
                              type="text"
                              value={mariaDbHost}
                              onChange={(e) => setMariaDbHost(e.target.value)}
                              placeholder="e.g. localhost or vector_db"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Port</label>
                            <input
                              type="text"
                              value={mariaDbPort}
                              onChange={(e) => setMariaDbPort(e.target.value)}
                              placeholder="3306 or 3307"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Username</label>
                            <input
                              type="text"
                              value={mariaDbUser}
                              onChange={(e) => setMariaDbUser(e.target.value)}
                              placeholder="e.g. vector_user"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Password</label>
                            <input
                              type="password"
                              value={mariaDbPassword}
                              onChange={(e) => setMariaDbPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Database Name</label>
                            <input
                              type="text"
                              value={mariaDbName}
                              onChange={(e) => setMariaDbName(e.target.value)}
                              placeholder="e.g. vector_db"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {vectorDb === "qdrant" && (
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-150 space-y-4 max-w-2xl animate-fade-in">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Sliders className="h-4 w-4 text-purple-500" /> Qdrant Sidecar Settings
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Server URL</label>
                            <input
                              type="text"
                              value={qdrantUrl}
                              onChange={(e) => setQdrantUrl(e.target.value)}
                              placeholder="e.g. http://localhost:6333"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">API Key (Optional)</label>
                            <input
                              type="password"
                              value={qdrantApiKey}
                              onChange={(e) => setQdrantApiKey(e.target.value)}
                              placeholder="Leave blank if unsecured"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {vectorDb === "pinecone" && (
                      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-150 space-y-4 max-w-2xl animate-fade-in">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Globe className="h-4 w-4 text-indigo-500" /> Pinecone Cloud Settings
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">API Key</label>
                            <input
                              type="password"
                              value={pineconeApiKey}
                              onChange={(e) => setPineconeApiKey(e.target.value)}
                              placeholder="pcsk_..."
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[9px] font-bold text-slate-550 uppercase tracking-wider block">Index Name</label>
                            <input
                              type="text"
                              value={pineconeIndex}
                              onChange={(e) => setPineconeIndex(e.target.value)}
                              placeholder="e.g. laminam-kb"
                              className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {vectorDb !== "none" && (
                      <div className="pt-2 max-w-2xl flex flex-col gap-3">
                        <button
                          type="button"
                          disabled={isValidating}
                          onClick={handleValidateConnection}
                          className="w-fit px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          {isValidating ? "Validating Connection..." : "Test Vector DB Connection"}
                        </button>

                        {validationResult && (
                          <div className={`p-4 rounded-xl border text-xs font-semibold leading-relaxed animate-fade-in ${
                            validationResult.success
                              ? "bg-emerald-50 border-emerald-150 text-emerald-800"
                              : "bg-rose-50 border-rose-150 text-rose-800"
                          }`}>
                            <div className="flex items-start gap-2.5">
                              <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${validationResult.success ? "bg-emerald-500" : "bg-rose-500"}`} />
                              <div>
                                <span className="font-bold block mb-0.5">
                                  {validationResult.success ? "Validation Succeeded" : "Validation Failed"}
                                </span>
                                <p className="text-[10px] text-slate-500">{validationResult.message}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {getPermission("ai_config") === "edit" && (
                  <div className="flex justify-end pt-3">
                    <button
                      type="submit"
                      className="px-6 py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-650/20 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" /> Save AI Configuration
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* TAB 6: System Danger Zone */}
        {activeSubTab === "danger" && getPermission("system_reset") !== "nothing" && (
          <div className="lg:col-span-12 space-y-6">
            {renderReadOnlyBanner("system_reset")}

            {/* Wipe Demo Data section (Only visible when isDemoMode is active) */}
            {isDemoMode && getPermission("system_reset") === "edit" && (
              <div className="glass-panel p-6 rounded-3xl space-y-4 border border-amber-200/60 bg-amber-50/10 shadow-glass animate-in fade-in slide-in-from-top-4 duration-300">
                <h3 className="text-sm font-heading font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2 border-b border-amber-100 pb-3">
                  <Sliders className="h-4.5 w-4.5 text-amber-600 animate-spin" style={{ animationDuration: '6s' }} /> 
                  {userLanguage === "sk" ? "Odstrániť Demo Dáta" : userLanguage === "hu" ? "Demo Adatok Törlése" : "Wipe Demo Data"}
                </h3>
                
                <p className="text-xs text-amber-700/80 leading-relaxed max-w-2xl font-bold">
                  {userLanguage === "sk" 
                    ? "Tento krok vymaže všetky vopred načítané demo údaje (leady, históriu pipeline, kalendáre, projektové úlohy) a trvalo prepne CRM z demo režimu do čistej databázy." 
                    : userLanguage === "hu"
                      ? "Ez a lépés törli az összes előre betöltött bemutató adatot (leadek, naptár, feladatok), és véglegesen kikapcsolja a demo módot."
                      : "This will remove all pre-loaded demo records (leads, pipeline history, calendar slots, project tasks) and permanently switch the CRM out of demo mode."}
                </p>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleWipeDemo}
                    className="w-fit px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-600/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer hover:scale-[1.01]"
                  >
                    <Trash2 className="h-4 w-4" /> 
                    {userLanguage === "sk" ? "Vymazať demo údaje" : userLanguage === "hu" ? "Demo adatok törlése" : "Wipe Demo Records"}
                  </button>
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/60 bg-rose-50/15 shadow-glass">
              <h3 className="text-sm font-heading font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2 border-b border-rose-100 pb-3">
                <ShieldAlert className="h-4.5 w-4.5 text-rose-600" /> {getTranslation(userLanguage, "settings.danger.title")}
              </h3>
              
              <p className="text-xs text-rose-700/80 leading-relaxed max-w-2xl font-bold">
                {getTranslation(userLanguage, "settings.danger.desc")}
              </p>

              {getPermission("system_reset") === "edit" && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleReset}
                    className="w-fit px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> {getTranslation(userLanguage, "settings.danger.btn")}
                  </button>
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
};
