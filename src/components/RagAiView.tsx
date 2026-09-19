import React, { useState, useRef, useEffect, useMemo } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  Brain,
  Send,
  Bot,
  User,
  Sparkles,
  Database,
  Check,
  RotateCcw,
  Plus,
  X,
  FileText,
  Play,
  Clock,
  Trash2,
  Edit,
  Users,
  Shield,
  Briefcase,
  DollarSign,
  Layers,
  Scale,
  Megaphone,
  Box,
  Compass,
  Bookmark
} from "lucide-react";
import type { Language } from "../utils/translations";
import { Markdown } from "../utils/markdown";
import { localeCodeFor } from "../utils/localTime";
import { useUserPref } from "../utils/userPrefs";
import { VERSION, VERSION_CODENAME } from "../utils/version";
import type { Lead } from "../types";
import {
  DEFAULT_EXECUTIVE_ROSTER,
  EXECUTIVE_COLOR_MAP,
  type ExecutiveRole
} from "../utils/executive/defaultExecutives";

export interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: Date;
  isCouncil?: boolean;
}

export interface CustomAgent {
  id: string;
  name: string;
  position: string;
  color: string;
  skill_content: string;
  is_autonomous: boolean;
}

export interface EpisodicDecision {
  id: string | number;
  user_id?: string;
  domain: string;
  title: string;
  summary: string;
  rationale?: string;
  action_items?: string;
  owner?: string;
  deadline?: string;
  tags?: string;
  created_at?: string;
}

interface RagAiViewProps {
  systemLanguage: Language;
  currentUser?: any;
  leads?: Lead[];
}

export const RagAiView: React.FC<RagAiViewProps> = ({ systemLanguage, currentUser, leads: _leads }) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Custom DB Agents
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);

  // User preference for orchestrator custom name/prompt if modified
  const [customDefaultAgent, setCustomDefaultAgent] = useUserPref("ragDefaultAgent");

  // Roster preparation: Incorporate default executives + custom agents
  const flagshipOrchestrator: ExecutiveRole = useMemo(() => {
    const base = DEFAULT_EXECUTIVE_ROSTER[0];
    if (!customDefaultAgent) return base;
    return {
      ...base,
      name: customDefaultAgent.name || `Executive Leader (${VERSION_CODENAME})`,
      position: customDefaultAgent.position || base.position,
      skillContent: customDefaultAgent.skill_content || base.skillContent
    };
  }, [customDefaultAgent]);

  const specialistExecutives: ExecutiveRole[] = useMemo(() => {
    return DEFAULT_EXECUTIVE_ROSTER.slice(1);
  }, []);

  // Selected agent state (can be executive role or custom agent)
  const [selectedAgentId, setSelectedAgentId] = useState<string>("orchestrator");
  const [isCouncilMode, setIsCouncilMode] = useState<boolean>(false);

  // Active selected role / agent resolution
  const selectedRole = useMemo(() => {
    if (selectedAgentId === "orchestrator" || selectedAgentId === "durian") {
      return flagshipOrchestrator;
    }
    const foundSpecialist = specialistExecutives.find((s) => s.id === selectedAgentId);
    if (foundSpecialist) return foundSpecialist;

    const foundCustom = customAgents.find((c) => c.id === selectedAgentId);
    if (foundCustom) {
      const mappedRole: ExecutiveRole = {
        id: foundCustom.id,
        key: foundCustom.id,
        name: foundCustom.name,
        position: foundCustom.position,
        positionSk: foundCustom.position,
        positionHu: foundCustom.position,
        roleCategory: "custom",
        color: (foundCustom.color as any) || "purple",
        badge: "Custom Agent",
        isOrchestrator: false,
        isAutonomous: foundCustom.is_autonomous,
        skillContent: foundCustom.skill_content,
        suggestedPrompts: {
          en: ["Provide your strategic domain assessment based on CRM records."],
          sk: ["Poskytni svoje strategické zhodnotenie na základe dát v CRM."],
          hu: ["Add meg a stratégiai értékelésedet a CRM adatok alapján."]
        },
        description: {
          en: "Custom configured AI agent.",
          sk: "Vlastne nakonfigurovaný AI agent.",
          hu: "Egyénileg konfigurált AI ügynök."
        }
      };
      return mappedRole;
    }
    return flagshipOrchestrator;
  }, [selectedAgentId, flagshipOrchestrator, specialistExecutives, customAgents]);

  // Chat messages & UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>({});
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "csuite" | "custom">("all");

  // Active key for current conversation thread
  const activeChatKey = isCouncilMode ? "council" : selectedRole.id;
  const activeTargetAgentId = isCouncilMode ? "orchestrator" : selectedRole.id;

  // Episodic Decisions State
  const [decisions, setDecisions] = useState<EpisodicDecision[]>([]);
  const [isDecisionsDrawerOpen, setIsDecisionsDrawerOpen] = useState(false);
  const [isNewDecisionModalOpen, setIsNewDecisionModalOpen] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionSummary, setDecisionSummary] = useState("");
  const [decisionDomain, setDecisionDomain] = useState("strategy");
  const [decisionOwner, setDecisionOwner] = useState("");
  const [decisionDeadline, setDecisionDeadline] = useState("");

  // Create Agent Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentPosition, setAgentPosition] = useState("");
  const [agentColor, setAgentColor] = useState("purple");
  const [agentSkillContent, setAgentSkillContent] = useState("");
  const [agentIsAutonomous, setAgentIsAutonomous] = useState(false);

  // Edit Agent / Skill Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ExecutiveRole | CustomAgent | null>(null);
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editColor, setEditColor] = useState("purple");
  const [editSkillContent, setEditSkillContent] = useState("");
  const [editIsAutonomous, setEditIsAutonomous] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Fetch custom agents from RAG DB
  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/chat_rag.php?action=get_agents");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.agents)) {
          const parsedAgents: CustomAgent[] = data.agents.map((a: any) => ({
            id: a.id.toString(),
            name: a.name,
            position: a.position,
            color: a.color || "purple",
            skill_content: a.skill_content || "",
            is_autonomous: a.is_autonomous === 1 || a.is_autonomous === "1" || a.is_autonomous === true
          }));
          setCustomAgents(parsedAgents);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch custom agents", err);
    }
  };

  // Fetch episodic decisions
  const fetchDecisions = async () => {
    const userId = currentUser?.email || "default_user";
    try {
      const res = await fetch(`/api/chat_rag.php?action=get_decisions&user_id=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.decisions)) {
          setDecisions(data.decisions);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch decisions", err);
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchDecisions();
  }, []);

  const getGreetingMessage = (role: ExecutiveRole, council: boolean) => {
    if (council) {
      return systemLanguage === "sk"
        ? `🏛️ **Výkonná rada (Executive Council) je pripravená.**\n\nPredložte strategickú otázku alebo dilemu (napr. expanzia na trhu, cenotvorba, investície, zmluvné riziká). Rada zozbiera pohľady od CSO, CFO, GC, CMO a COO a poskytne jednotný verdikt.`
        : systemLanguage === "hu"
          ? `🏛️ **Az Igazgatótanácsi Tanács (Executive Council) összeült.**\n\nTegyen fel stratégiai kérdést vagy dilemmát (pl. piacbővülés, árazás, beruházások, jogi kockázatok). A Tanács összegyűjti a CSO, CFO, GC, CMO és COO szakterületi véleményét, majd egységes döntést hoz.`
          : `🏛️ **The Executive Council is assembled.**\n\nPresent any high-stakes strategic dilemma (e.g. market expansion, pricing strategy, capital runway, contract risks). The Council will gather inputs from your CSO, CFO, GC, CMO, and COO, and synthesize a definitive executive verdict.`;
    }

    if (role.isOrchestrator) {
      return systemLanguage === "sk"
        ? `Vitajte. Som **${role.name}** (${role.positionSk}). Ako hlavný poradca syntetizujem všetky oblasti riadenia firmy do konkrétnych exekutívnych rozhodnutí. Akú strategickú výzvu dnes riešime?`
        : systemLanguage === "hu"
          ? `Üdvözlöm. Én vagyok **${role.name}** (${role.positionHu}). Főtanácsadóként az összes szakterületet egységes vezetői döntésekké szintetizálom. Milyen stratégiai kérdést oldunk meg ma?`
          : `Welcome. I am **${role.name}** (${role.position}). As your Executive Orchestrator, I synthesize inputs across all business functions into decisive execution plans. What strategic challenge are we addressing today?`;
    }

    const pos = systemLanguage === "sk" ? role.positionSk : systemLanguage === "hu" ? role.positionHu : role.position;
    return systemLanguage === "sk"
      ? `Ahoj! Ja som **${role.name}** — ${pos}. Som pripravený analyzovať vaše dáta a navrhnúť konkrétne riešenia. V čom vám môžem pomôcť?`
      : systemLanguage === "hu"
        ? `Üdvözlöm! Én vagyok a(z) **${role.name}** — ${pos}. Készen állok a CRM adatok elemzésére és a konkrét javaslatok kidolgozására. Miben segíthetek?`
        : `Hello! I am **${role.name}** — ${pos}. I am grounded in your CRM data and ready to provide specialized domain guidance. How can I assist you?`;
  };

  // Fetch chat history for selected agent or council mode with client cache
  useEffect(() => {
    // If we already have cached history in memory, switch to it immediately
    if (chatHistories[activeChatKey] && chatHistories[activeChatKey].length > 0) {
      setMessages(chatHistories[activeChatKey]);
    } else {
      setMessages([
        {
          id: "initial",
          sender: "agent",
          text: getGreetingMessage(selectedRole, isCouncilMode),
          timestamp: new Date()
        }
      ]);
    }

    let isSubscribed = true;
    const fetchHistory = async () => {
      const userId = currentUser?.email || "default_user";

      try {
        const res = await fetch(
          `/api/chat_rag.php?user_id=${encodeURIComponent(userId)}&agent_id=${encodeURIComponent(activeTargetAgentId)}`
        );
        if (res.ok && isSubscribed) {
          const data = await res.json();
          if (data.success && data.messages && data.messages.length > 0) {
            const formattedMessages: Message[] = data.messages.map((m: any, idx: number) => ({
              id: idx.toString(),
              sender: m.sender,
              text: m.text,
              timestamp: new Date(m.timestamp || Date.now()),
              isCouncil: m.text.includes("Executive Council") || m.text.includes("🏛️")
            }));
            setMessages(formattedMessages);
            setChatHistories((prev) => ({
              ...prev,
              [activeChatKey]: formattedMessages
            }));
          }
        }
      } catch (err) {
        console.warn("Failed to fetch chat history from RAG DB", err);
      }
    };

    fetchHistory();

    return () => {
      isSubscribed = false;
    };
  }, [currentUser, activeChatKey, activeTargetAgentId]);

  // Reset chat history
  const handleResetChat = async () => {
    const confirmationMsg = systemLanguage === "sk"
      ? "Naozaj chcete vymazať históriu tohto rozhovoru z databázy?"
      : systemLanguage === "hu"
        ? "Biztosan törölni szeretné a beszélgetés előzményeit?"
        : "Are you sure you want to clear this conversation history?";

    if (!confirm(confirmationMsg)) return;

    setIsLoading(true);
    const userId = currentUser?.email || "default_user";

    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          user_id: userId,
          agent_id: activeTargetAgentId
        })
      });
      if (res.ok) {
        const greeting = [
          {
            id: "reset-msg",
            sender: "agent" as const,
            text: getGreetingMessage(selectedRole, isCouncilMode),
            timestamp: new Date()
          }
        ];
        setMessages(greeting);
        setChatHistories((prev) => ({
          ...prev,
          [activeChatKey]: greeting
        }));
      }
    } catch (err) {
      console.warn("Failed to reset conversation history", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run autonomous check
  const handleRunAgent = async () => {
    setIsLoading(true);
    const userId = currentUser?.email || "default_user";
    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_agent",
          user_id: userId,
          agent_id: selectedRole.id
        })
      });
      if (!res.ok) throw new Error("HTTP error: " + res.status);
      const data = await res.json();
      if (data.success) {
        const replyMsg: Message = {
          id: Date.now().toString(),
          sender: "agent",
          text: data.reply,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, replyMsg]);
        setChatHistories((prev) => ({
          ...prev,
          [activeChatKey]: [...(prev[activeChatKey] || []), replyMsg]
        }));
      } else {
        throw new Error(data.message || "Failed to trigger autonomous run");
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        sender: "agent",
        text: `Run Error: ${err.message}.`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
      setChatHistories((prev) => ({
        ...prev,
        [activeChatKey]: [...(prev[activeChatKey] || []), errorMsg]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Send query (Standard chat or Council deliberation)
  const handleSendText = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: isCouncilMode ? `[🏛️ Executive Council] ${textToSend}` : textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatHistories((prev) => ({
      ...prev,
      [activeChatKey]: [...(prev[activeChatKey] || []), userMsg]
    }));
    setInputText("");
    setIsLoading(true);

    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isCouncilMode ? "convene_council" : "chat",
          message: textToSend,
          query: textToSend,
          user_id: currentUser?.email || "default_user",
          agent_id: selectedRole.id
        })
      });
      if (!res.ok) throw new Error("HTTP connection error: " + res.status);
      const data = await res.json();
      if (data.success) {
        const replyMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "agent",
          text: data.reply,
          timestamp: new Date(),
          isCouncil: isCouncilMode || data.is_council
        };
        setMessages((prev) => [...prev, replyMsg]);
        setChatHistories((prev) => ({
          ...prev,
          [activeChatKey]: [...(prev[activeChatKey] || []), replyMsg]
        }));
      } else {
        throw new Error(data.message || "Failed to process chat query.");
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: `Connection Error: ${err.message}. Please check configuration or OpenAI API key.`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
      setChatHistories((prev) => ({
        ...prev,
        [activeChatKey]: [...(prev[activeChatKey] || []), errorMsg]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendText(inputText);
  };

  // Save decision helper
  const handleSaveDecision = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!decisionTitle.trim() || !decisionSummary.trim()) {
      alert(t("Title and Summary are required.", "Názov a zhrnutie sú povinné.", "A cím és az összefoglaló kötelező."));
      return;
    }

    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_decision",
          user_id: currentUser?.email || "default_user",
          decision: {
            title: decisionTitle,
            summary: decisionSummary,
            domain: decisionDomain,
            owner: decisionOwner,
            deadline: decisionDeadline
          }
        })
      });
      if (res.ok) {
        setIsNewDecisionModalOpen(false);
        setDecisionTitle("");
        setDecisionSummary("");
        setDecisionOwner("");
        setDecisionDeadline("");
        await fetchDecisions();
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Strategic decision saved!", "Strategické rozhodnutie uložené!", "Stratégiai döntés elmentve!"));
        }
      }
    } catch (err) {
      console.warn("Failed to save decision", err);
    }
  };

  const handleDeleteDecision = async (id: string | number) => {
    if (!confirm(t("Delete this decision from strategic memory?", "Zmazať toto rozhodnutie zo strategickej pamäte?", "Törli ezt a döntést a stratégiai memóriából?"))) return;
    try {
      await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_decision",
          user_id: currentUser?.email || "default_user",
          decision_id: id
        })
      });
      await fetchDecisions();
    } catch (err) {
      console.warn("Failed to delete decision", err);
    }
  };

  // Quick save message to decision log
  const quickSaveMessageAsDecision = (msgText: string) => {
    setDecisionTitle("Executive Decision: " + selectedRole.name);
    setDecisionSummary(msgText.slice(0, 500) + (msgText.length > 500 ? "..." : ""));
    setDecisionDomain(selectedRole.roleCategory === "custom" ? "general" : selectedRole.roleCategory);
    setIsNewDecisionModalOpen(true);
  };

  // Open Edit Modal for a role
  const openEditModal = (e: React.MouseEvent, role: ExecutiveRole | CustomAgent) => {
    e.stopPropagation();
    setEditingAgent(role);
    setEditName(role.name);
    setEditPosition((role as any).position || "");
    setEditColor((role as any).color || "purple");
    setEditSkillContent((role as any).skillContent || (role as any).skill_content || "");
    setEditIsAutonomous(Boolean((role as any).isAutonomous || (role as any).is_autonomous));
    setIsEditModalOpen(true);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;

    if (!editName.trim() || !editPosition.trim() || !editSkillContent.trim()) {
      alert(t("Name, Position and Skill Prompt are required.", "Meno, Pozícia a Inštrukcie sú povinné.", "A név, pozíció és a prompt megadása kötelező."));
      return;
    }

    setIsLoading(true);

    // If editing the orchestrator
    if (editingAgent.id === "orchestrator" || editingAgent.id === "durian") {
      const updatedDefault: CustomAgent = {
        id: "durian",
        name: editName,
        position: editPosition,
        color: editColor,
        skill_content: editSkillContent,
        is_autonomous: editIsAutonomous
      };
      setCustomDefaultAgent(updatedDefault);
      setIsEditModalOpen(false);
      setEditingAgent(null);
      setIsLoading(false);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Executive Orchestrator updated!", "Výkonný riaditeľ upravený!", "Vezérigazgató frissítve!"));
      }
      return;
    }

    // Custom agent in DB
    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_agent",
          id: editingAgent.id,
          name: editName,
          position: editPosition,
          color: editColor,
          skill_content: editSkillContent,
          is_autonomous: editIsAutonomous
        })
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        setEditingAgent(null);
        await fetchAgents();
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Agent updated successfully!", "Agent bol upravený!", "Az ügynök sikeresen frissítve!"));
        }
      }
    } catch (err) {
      console.warn("Failed to edit agent", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Create Agent Submit
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim() || !agentPosition.trim() || !agentSkillContent.trim()) {
      alert(t("Name, Position and skill prompt are required.", "Meno, Pozícia a inštrukcie sú povinné.", "A név, a pozíció és a leírás kötelező."));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_agent",
          name: agentName,
          position: agentPosition,
          color: agentColor,
          skill_content: agentSkillContent,
          is_autonomous: agentIsAutonomous
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          setAgentName("");
          setAgentPosition("");
          setAgentColor("purple");
          setAgentSkillContent("");
          setAgentIsAutonomous(false);
          await fetchAgents();
        }
      }
    } catch (err) {
      console.warn("Error creating agent", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Agent
  const handleDeleteAgent = async (id: string) => {
    if (id === "orchestrator" || id === "durian") return;
    if (!confirm(t("Delete this agent and chat history?", "Zmazať tohto agenta a jeho históriu?", "Törli ezt az ügynököt és a chat előzményeit?"))) return;

    setIsLoading(true);
    try {
      const res = await fetchWithTimeout("/api/chat_rag.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_agent", id })
      });
      if (res.ok) {
        if (selectedAgentId === id) setSelectedAgentId("orchestrator");
        await fetchAgents();
      }
    } catch (err) {
      console.warn("Error deleting agent", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Render Icon based on role category
  const renderRoleIcon = (roleCat: string, isFlagship = false) => {
    if (isFlagship) {
      return (
        <div className={`h-11 w-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 ring-2 ring-purple-400/40 relative`}>
          <Brain className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border border-white"></span>
          </span>
        </div>
      );
    }

    switch (roleCat) {
      case "strategy":
        return <Compass className="h-5 w-5" />;
      case "finance":
        return <DollarSign className="h-5 w-5" />;
      case "people":
        return <Users className="h-5 w-5" />;
      case "legal":
        return <Scale className="h-5 w-5" />;
      case "operations":
        return <Layers className="h-5 w-5" />;
      case "marketing":
        return <Megaphone className="h-5 w-5" />;
      case "product":
        return <Box className="h-5 w-5" />;
      case "governance":
        return <Briefcase className="h-5 w-5" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
  };

  const activeTheme = EXECUTIVE_COLOR_MAP[selectedRole.color] || EXECUTIVE_COLOR_MAP.purple;

  // Filtered lists
  const filteredSpecialists = useMemo(() => {
    if (sidebarFilter === "custom") return [];
    return specialistExecutives;
  }, [sidebarFilter, specialistExecutives]);

  const filteredCustomAgents = useMemo(() => {
    if (sidebarFilter === "csuite") return [];
    return customAgents;
  }, [sidebarFilter, customAgents]);

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4 gap-3">
        <div>
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Brain className="h-6 w-6 text-purple-600" />
            {t("Virtual Executive Team & RAG Suite", "Virtuálny tím vedenia & RAG AI", "Virtuális Vezetői Csapat és RAG AI")}
          </h2>
          <p className="text-xs text-slate-500 font-semibold tracking-wider mt-0.5">
            {t(
              "OpenExecutive C-Suite architecture grounded in your live CRM records & episodic decisions",
              "OpenExecutive architektúra C-Suite napojená na reálne CRM dáta a strategickú pamäť",
              "OpenExecutive C-Suite architektúra a valós CRM adatokra és stratégiai döntésekre építve"
            )}
          </p>
        </div>

        {/* Global Action Chips */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsCouncilMode((prev) => !prev);
              if (!isCouncilMode) setSelectedAgentId("orchestrator");
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
              isCouncilMode
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-amber-500/25 ring-2 ring-amber-400"
                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>{t("Executive Council", "Výkonná rada", "Igazgatótanács")}</span>
            {isCouncilMode && (
              <span className="text-[9px] bg-white/25 px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold">Active</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsDecisionsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all shadow-sm cursor-pointer"
            title={t("Open Strategic Decision Log", "Otvoriť zoznam strategických rozhodnutí", "Stratégiai döntési napló")}
          >
            <Bookmark className="h-4 w-4 text-purple-600" />
            <span>{t("Decisions", "Rozhodnutia", "Döntések")}</span>
            {decisions.length > 0 && (
              <span className="text-[10px] bg-purple-100 text-purple-700 font-black px-1.5 py-0.2 rounded-full">
                {decisions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Glass Workspace */}
      <div className="glass-panel p-0 rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden flex flex-col md:flex-row h-[calc(100vh-16rem)] min-h-[580px] animate-slide-up">
        
        {/* LEFT SIDEBAR: Executive Roster */}
        <div className="w-full md:w-84 border-r border-slate-200/80 bg-slate-50/40 flex flex-col shrink-0">
          
          {/* 1. HIGHLIGHTED FLAGSHIP: Executive Orchestrator */}
          <div className="p-3.5 border-b border-purple-100/80 bg-gradient-to-b from-purple-50/80 via-indigo-50/40 to-white/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-full border border-purple-200/60 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                {t("Flagship AI Leader", "Hlavný AI líder", "Kiemelt AI Vezető")}
              </span>
              <span className="text-[9px] font-bold text-slate-400">v{VERSION}</span>
            </div>

            <div
              onClick={() => {
                setSelectedAgentId("orchestrator");
                setIsCouncilMode(false);
              }}
              className={`p-3 rounded-2xl border transition-all duration-200 cursor-pointer relative group ${
                selectedAgentId === "orchestrator" && !isCouncilMode
                  ? "bg-white border-purple-300 shadow-md shadow-purple-500/10 ring-2 ring-purple-600 ring-offset-1"
                  : "bg-white/80 border-purple-100 hover:border-purple-200 hover:bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {renderRoleIcon("orchestrator", true)}
                <div className="flex-1 min-w-0">
                  <h4 className="font-heading font-extrabold text-xs text-slate-900 truncate">
                    {flagshipOrchestrator.name}
                  </h4>
                  <p className="text-[10px] text-purple-700 font-semibold truncate mt-0.5">
                    {systemLanguage === "sk" ? flagshipOrchestrator.positionSk : systemLanguage === "hu" ? flagshipOrchestrator.positionHu : flagshipOrchestrator.position}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1 line-clamp-1">
                    {systemLanguage === "sk" ? flagshipOrchestrator.description.sk : systemLanguage === "hu" ? flagshipOrchestrator.description.hu : flagshipOrchestrator.description.en}
                  </p>
                </div>
              </div>

              {/* Hover Actions */}
              <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-white/95 p-1 rounded-xl shadow border border-slate-100">
                <button
                  type="button"
                  onClick={(e) => openEditModal(e, flagshipOrchestrator)}
                  className="p-1 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                  title={t("Edit Orchestrator Prompt", "Upraviť inštrukcie", "Prompt szerkesztése")}
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 2. Roster Filter Tabs & New Agent Button */}
          <div className="px-3.5 py-2 border-b border-slate-200/70 bg-white/40 flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                onClick={() => setSidebarFilter("all")}
                className={`px-2 py-1 rounded-lg transition-all ${
                  sidebarFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("All (9)", "Všetci (9)", "Mind (9)")}
              </button>
              <button
                onClick={() => setSidebarFilter("csuite")}
                className={`px-2 py-1 rounded-lg transition-all ${
                  sidebarFilter === "csuite" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                C-Suite
              </button>
              <button
                onClick={() => setSidebarFilter("custom")}
                className={`px-2 py-1 rounded-lg transition-all ${
                  sidebarFilter === "custom" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t("Custom", "Vlastní", "Egyéni")}
              </button>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 rounded-xl border border-purple-200 text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 cursor-pointer shadow-sm transition-all active:scale-95"
              title={t("Create Custom Agent", "Vytvoriť nového agenta", "Új ügynök létrehozása")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 3. DIRECT ACCESS TO EVERY C-SUITE POSITION */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
            {/* Specialists Section */}
            {filteredSpecialists.map((role) => {
              const isSelected = selectedAgentId === role.id && !isCouncilMode;
              const theme = EXECUTIVE_COLOR_MAP[role.color] || EXECUTIVE_COLOR_MAP.purple;
              const posLabel = systemLanguage === "sk" ? role.positionSk : systemLanguage === "hu" ? role.positionHu : role.position;

              return (
                <div
                  key={role.id}
                  onClick={() => {
                    setSelectedAgentId(role.id);
                    setIsCouncilMode(false);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all duration-200 relative group cursor-pointer ${
                    isSelected
                      ? `bg-white ${theme.border} ${theme.activeRing} shadow-sm`
                      : "bg-white/70 border-slate-100 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-xl ${theme.fill} flex items-center justify-center text-white shadow-sm shrink-0`}>
                    {renderRoleIcon(role.roleCategory)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-xs text-slate-800 truncate">{role.name}</span>
                    </div>
                    <p className={`text-[10px] ${theme.text} font-semibold truncate`}>
                      {posLabel}
                    </p>
                  </div>

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white/95 p-1 rounded-xl shadow-sm border border-slate-100">
                    <button
                      type="button"
                      onClick={(e) => openEditModal(e, role)}
                      className="p-1 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                      title={t("View & Edit Skill", "Zobraziť zručnosť", "Képesség szerkesztése")}
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Custom DB Agents */}
            {filteredCustomAgents.map((custom) => {
              const isSelected = selectedAgentId === custom.id && !isCouncilMode;
              const theme = EXECUTIVE_COLOR_MAP[custom.color] || EXECUTIVE_COLOR_MAP.purple;

              return (
                <div
                  key={custom.id}
                  onClick={() => {
                    setSelectedAgentId(custom.id);
                    setIsCouncilMode(false);
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all duration-200 relative group cursor-pointer ${
                    isSelected
                      ? `bg-white ${theme.border} ${theme.activeRing} shadow-sm`
                      : "bg-white/70 border-slate-100 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-xl ${theme.fill} flex items-center justify-center text-white shadow-sm shrink-0`}>
                    <Bot className="h-4.5 w-4.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-xs text-slate-800 truncate">{custom.name}</span>
                      {custom.is_autonomous && (
                        <span className="text-[7.5px] font-bold text-indigo-600 bg-indigo-100 px-1 py-0.5 rounded flex items-center gap-0.5">
                          <Clock className="h-2 w-2" /> Auto
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] ${theme.text} font-semibold truncate`}>
                      {custom.position}
                    </p>
                  </div>

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-white/95 p-1 rounded-xl shadow-sm border border-slate-100">
                    <button
                      type="button"
                      onClick={(e) => openEditModal(e, custom as any)}
                      className="p-1 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                      title={t("Edit", "Upraviť", "Szerkesztés")}
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAgent(custom.id);
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                      title={t("Delete", "Zmazať", "Törlés")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-200/80 bg-slate-50/50 text-[10px] text-slate-500 flex items-center justify-between font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-purple-500" />
              {t("Episodic Memory", "Strategická pamäť", "Epizodikus Memória")}
            </span>
            <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
              <Check className="h-3 w-3" />
              {t("Active", "Aktívna", "Aktív")}
            </span>
          </div>
        </div>

        {/* RIGHT SIDE: Main Workspace & Chat Pane */}
        <div className="flex-1 flex flex-col bg-white">
          
          {/* Header Bar */}
          <div className="p-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50/30">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl ${isCouncilMode ? "bg-amber-500" : activeTheme.fill} text-white flex items-center justify-center font-bold shadow-sm`}>
                {isCouncilMode ? <Shield className="h-5.5 w-5.5" /> : renderRoleIcon(selectedRole.roleCategory)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-heading font-extrabold text-sm text-slate-900">
                    {isCouncilMode ? t("Executive Council Boardroom", "Výkonná rada vedenia", "Igazgatótanácsi Tárgyaló") : selectedRole.name}
                  </h4>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isCouncilMode ? "bg-amber-100 text-amber-800 border-amber-200" : activeTheme.badgeBg}`}>
                    {isCouncilMode ? t("Multi-Agent Deliberation", "Deliberácia rady", "Többügynökös Tanácskozás") : selectedRole.badge}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                  {isCouncilMode
                    ? t("Consolidated C-Suite advisory & unified strategic synthesis", "Spoločné stanovisko vedenia a finálna syntéza", "Konzolidált vezetői állásfoglalás és döntési javaslat")
                    : (systemLanguage === "sk" ? selectedRole.positionSk : systemLanguage === "hu" ? selectedRole.positionHu : selectedRole.position)}
                </p>
              </div>
            </div>

            {/* Top Action Buttons */}
            <div className="flex items-center gap-2">
              {selectedRole.isAutonomous && !isCouncilMode && (
                <button
                  type="button"
                  onClick={handleRunAgent}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[10px] font-black text-indigo-700 transition-all cursor-pointer disabled:opacity-50"
                  title={t("Trigger autonomous check now", "Spustiť autonómnu kontrolu", "Autonóm futtatás")}
                >
                  <Play className="h-3.5 w-3.5 fill-indigo-700" />
                  {t("Run Check", "Spustiť kontrolu", "Futtatás")}
                </button>
              )}

              <button
                type="button"
                onClick={() => openEditModal({ stopPropagation: () => {} } as any, selectedRole)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-600 transition-all cursor-pointer"
                title={t("Inspect MBA Skill Prompt", "Zobraziť MBA inštrukcie", "MBA Prompt megtekintése")}
              >
                <FileText className="h-3.5 w-3.5 text-purple-600" />
                <span>{t("Skill.md", "Zručnosti", "Képességek")}</span>
              </button>

              <button
                type="button"
                onClick={handleResetChat}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("Reset Chat", "Vyčistiť chat", "Chat törlése")}
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              {t("Strategic Prompts:", "Strategické témy:", "Stratégiai kérdések:")}
            </span>
            {(isCouncilMode
              ? [
                  t("Synthesize our quarterly performance and identify our #1 risk.", "Zosumarizuj náš kvartálny výkon a identifikuj naše #1 najväčšie riziko.", "Foglald össze a negyedéves teljesítményünket és nevezd meg a legfőbb kockázatot."),
                  t("Should we introduce performance-based pricing next quarter?", "Máme v ďalšom kvartáli zaviesť výkonnostné oceňovanie?", "Vezessünk be teljesítményalapú árazást a következő negyedévben?"),
                  t("Evaluate our cash runway against our growth and hiring plans.", "Zhodnoť náš cash runway voči plánom rastu a náboru.", "Értékeld a kifutási időnket a növekedési és toborzási tervekkel szemben.")
                ]
              : selectedRole.suggestedPrompts[systemLanguage] || selectedRole.suggestedPrompts.en
            ).map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendText(prompt)}
                disabled={isLoading}
                className="text-[10px] bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200/80 hover:border-purple-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin bg-slate-50/20">
            {messages.map((msg) => {
              const isAgent = msg.sender === "agent";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[88%] ${isAgent ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  {/* Avatar */}
                  <div
                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      isAgent
                        ? msg.isCouncil
                          ? "bg-amber-500 text-white"
                          : `${activeTheme.fill} text-white`
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {isAgent ? (
                      msg.isCouncil ? <Shield className="h-4 w-4" /> : <Bot className="h-4.5 w-4.5" />
                    ) : (
                      <User className="h-4.5 w-4.5" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed shadow-sm relative group ${
                      isAgent
                        ? "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                        : `${activeTheme.fill} text-white rounded-tr-none font-medium`
                    }`}
                  >
                    {isAgent ? (
                      <div>
                        <Markdown content={msg.text} />
                        
                        {/* Quick Save as Strategic Decision Button */}
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400">
                          <span>
                            {msg.timestamp.toLocaleTimeString(localeCodeFor(systemLanguage), {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                          <button
                            type="button"
                            onClick={() => quickSaveMessageAsDecision(msg.text)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md cursor-pointer"
                            title={t("Save to Episodic Decision Memory", "Uložiť do strategickej pamäte", "Mentés a döntési naplóba")}
                          >
                            <Bookmark className="h-3 w-3" />
                            {t("Save Decision", "Uložiť rozhodnutie", "Döntés mentése")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <span className="text-[8px] block mt-1.5 text-right text-white/80">
                          {msg.timestamp.toLocaleTimeString(localeCodeFor(systemLanguage), {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${isCouncilMode ? "bg-amber-500" : activeTheme.fill} text-white shadow-sm`}>
                  {isCouncilMode ? <Shield className="h-4 w-4 animate-pulse" /> : <Bot className="h-4.5 w-4.5" />}
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {isCouncilMode
                      ? t("Convening C-Suite specialists & synthesizing verdict...", "Zvolávam vedenie a syntetizujem verdikt...", "A tanács összehívása és döntési javaslat generálása...")
                      : t("Analyzing context & grounding response...", "Analyzujem dáta a generujem odpoveď...", "Adatok elemzése és válasz generálása...")}
                  </span>
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-3.5 border-t border-slate-200/80 bg-slate-50/40">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isCouncilMode
                    ? t("Pose a strategic dilemma to the Executive Council...", "Položte strategickú otázku Výkonnej rade...", "Tegyen fel stratégiai kérdést a Tanácsnak...")
                    : systemLanguage === "sk"
                      ? `Položte otázku pre ${selectedRole.name}...`
                      : systemLanguage === "hu"
                        ? `Kérdezzen a(z) ${selectedRole.name} pozíciótól...`
                        : `Ask ${selectedRole.name}...`
                }
                className="w-full pl-4 pr-12 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs transition-all shadow-xs"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading}
                className={`absolute right-2 p-2 rounded-xl text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isCouncilMode ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20 shadow-md" : "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20 shadow-md"
                }`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EPISODIC DECISIONS DRAWER / MODAL */}
      {isDecisionsDrawerOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
          <div className="absolute inset-0" onClick={() => setIsDecisionsDrawerOpen(false)} />
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl relative z-10 flex flex-col space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="text-sm font-heading font-bold text-slate-800 uppercase tracking-wider">
                    {t("Strategic Decision Log & Episodic Memory", "Záznam strategických rozhodnutí", "Stratégiai Döntési Napló")}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {t("Preserved across sessions and injected as <past_decisions> into C-Suite context", "Uchovávané medzi reláciami a automaticky vkladané do kontextu AI", "Munkameneteken átívelő döntések, melyek beépülnek az AI kontextusába")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsNewDecisionModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 text-white text-[10px] font-bold hover:bg-purple-700 shadow-sm cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Log Decision", "Zapísať rozhodnutie", "Új döntés")}
                </button>
                <button
                  onClick={() => setIsDecisionsDrawerOpen(false)}
                  className="h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800 flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Decisions List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {decisions.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Bookmark className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">
                    {t("No recorded decisions yet. Save key takeaways from your chats to build long-term memory.", "Zatiaľ žiadne uložené rozhodnutia. Uložte závery z konverzácií pre vytvorenie dlhodobej pamäte.", "Még nincsenek rögzített döntések. Mentsen le kulcsfontosságú határozatokat a hosszú távú memóriához.")}
                  </p>
                </div>
              ) : (
                decisions.map((d) => (
                  <div key={d.id} className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                          {d.domain || "strategy"}
                        </span>
                        <h4 className="font-heading font-bold text-xs text-slate-900">{d.title}</h4>
                      </div>
                      <button
                        onClick={() => handleDeleteDecision(d.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                        title={t("Delete Decision", "Zmazať", "Törlés")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{d.summary}</p>

                    {(d.owner || d.deadline) && (
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold pt-1 border-t border-slate-100">
                        {d.owner && <span>👤 Owner: {d.owner}</span>}
                        {d.deadline && <span>📅 Deadline: {d.deadline}</span>}
                        {d.created_at && <span className="ml-auto text-slate-400">{d.created_at.slice(0, 10)}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOG NEW DECISION POPUP */}
      {isNewDecisionModalOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Bookmark className="h-4 w-4 text-purple-600" />
                {t("Log Strategic Decision", "Zapísať strategické rozhodnutie", "Stratégiai döntés rögzítése")}
              </h3>
              <button
                onClick={() => setIsNewDecisionModalOpen(false)}
                className="h-6 w-6 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDecision} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Title", "Názov", "Cím")} *</label>
                <input
                  type="text"
                  required
                  value={decisionTitle}
                  onChange={(e) => setDecisionTitle(e.target.value)}
                  placeholder={t("e.g. Q4 Market Expansion in B2B Services", "napr. Expanzia v B2B segmente v Q4", "pl. Q4 piaci expanzió B2B szektorban")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Domain", "Oblasť", "Szakterület")}</label>
                  <select
                    value={decisionDomain}
                    onChange={(e) => setDecisionDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500 bg-white"
                  >
                    <option value="strategy">Strategy / CSO</option>
                    <option value="finance">Finance / CFO</option>
                    <option value="people">People & HR / CHRO</option>
                    <option value="legal">Legal & GC</option>
                    <option value="operations">Operations / COO</option>
                    <option value="marketing">Marketing / CMO</option>
                    <option value="product">Product / CPO</option>
                    <option value="governance">Board & Governance</option>
                    <option value="general">General Executive</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Owner", "Zodpovedná osoba", "Felelős")}</label>
                  <input
                    type="text"
                    value={decisionOwner}
                    onChange={(e) => setDecisionOwner(e.target.value)}
                    placeholder={t("e.g. Erik, Peti", "napr. Erik, Peti", "pl. Erik, Peti")}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Summary & Core Takeaway", "Zhrnutie a hlavný záver", "Összefoglaló")} *</label>
                <textarea
                  required
                  rows={4}
                  value={decisionSummary}
                  onChange={(e) => setDecisionSummary(e.target.value)}
                  placeholder={t("What was decided, what is the trade-off, and why?", "Čo bolo rozhodnuté, aké sú kompromisy a prečo?", "Mi a döntés lényege és a fő kompromisszum?")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Target Deadline", "Termín", "Határidő")}</label>
                <input
                  type="text"
                  value={decisionDeadline}
                  onChange={(e) => setDecisionDeadline(e.target.value)}
                  placeholder={t("e.g. 2026-10-31, Next QBR", "napr. 2026-10-31, Ďalší QBR", "pl. 2026-10-31")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewDecisionModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow-md shadow-purple-500/20"
                >
                  {t("Save Decision", "Uložiť rozhodnutie", "Döntés mentése")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT AGENT / MBA SKILL MODAL */}
      {isEditModalOpen && editingAgent && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
          <div className="absolute inset-0" onClick={() => setIsEditModalOpen(false)} />
          <div className="w-full max-w-xl max-h-[90vh] rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl relative z-10 flex flex-col space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-heading font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-4.5 w-4.5 text-purple-600" />
                {t("Inspect & Edit MBA Skill (skill.md)", "Prezrieť a upraviť MBA zručnosť (skill.md)", "MBA Képesség megtekintése és szerkesztése")}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="h-7 w-7 rounded-lg hover:bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-800 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Agent Name", "Meno", "Név")} *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Position / Role", "Pozícia", "Pozíció")} *</label>
                  <input
                    type="text"
                    required
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("MBA System Prompt & Domain Frameworks", "MBA systémový prompt a doménové rámce", "MBA Rendszerprompt és Szakterületi Keretrendszerek")} *</label>
                <textarea
                  required
                  rows={10}
                  value={editSkillContent}
                  onChange={(e) => setEditSkillContent(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[11px] font-mono leading-relaxed focus:outline-none focus:border-purple-500 bg-slate-50/50"
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <p className="text-[9px] text-slate-400">
                  {t("Grounded in OpenExecutive MBA advisory benchmarks", "Postavené na MBA princípoch OpenExecutive", "OpenExecutive MBA tanácsadási elvekre építve")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {t("Cancel", "Zrušiť", "Mégse")}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow-md shadow-purple-500/20"
                  >
                    {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW AGENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl relative z-10 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-heading font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4.5 w-4.5 text-purple-600 animate-pulse" />
                {t("Create New Custom Specialist", "Vytvoriť nového špecialistu", "Új egyéni szakértő létrehozása")}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-7 w-7 rounded-lg hover:bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-800 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Agent Name", "Meno agenta", "Ügynök neve")} *</label>
                <input
                  type="text"
                  required
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder={t("e.g. Lead Qualification Expert", "napr. Expert na kvalifikáciu leadov", "pl. Lead minősítési szakértő")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Position / Role", "Pozícia / Rola", "Pozíció / Szerepkör")} *</label>
                <input
                  type="text"
                  required
                  value={agentPosition}
                  onChange={(e) => setAgentPosition(e.target.value)}
                  placeholder={t("e.g. Inbound Pipeline Qualifier", "napr. Hodnotiteľ prichádzajúcich leadov", "pl. Bejövő leadek minősítője")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t("Skill Prompt (skill.md)", "Inštrukcie (skill.md)", "Utasítások (skill.md)")} *</label>
                <textarea
                  required
                  rows={4}
                  value={agentSkillContent}
                  onChange={(e) => setAgentSkillContent(e.target.value)}
                  placeholder={t("Paste instructions or framework rules...", "Vložte inštrukcie alebo pravidlá...", "Illessze be az utasításokat...")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow-md shadow-purple-500/20"
                >
                  {t("Create Agent", "Vytvoriť agenta", "Létrehozás")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
