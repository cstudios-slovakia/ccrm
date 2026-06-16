import React, { useState, useRef, useEffect } from "react";
import { Brain, Send, Bot, User, Sparkles, Database, Check, RotateCcw, Plus, X, FileText, Play, Clock } from "lucide-react";
import type { Language } from "../utils/translations";

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: Date;
}

interface Agent {
  id: string; // "durian" or number string
  name: string;
  position: string;
  color: string; // "purple" | "blue" | "green" | "amber" | "rose"
  skill_content: string;
  is_autonomous: boolean;
}

interface RagAiViewProps {
  systemLanguage: Language;
  currentUser?: any;
}

const DEFAULT_AGENT: Agent = {
  id: "durian",
  name: "Durian",
  position: "CRM Assistant & Consultant",
  color: "purple",
  skill_content: "You are Durian, the active CRM RAG AI assistant. Answer user queries based on context.",
  is_autonomous: false
};

const COLOR_MAP: Record<string, { bg: string; text: string; fill: string; border: string; activeRing: string }> = {
  purple: {
    bg: "from-purple-50 to-indigo-50/50",
    text: "text-purple-600",
    fill: "bg-purple-600",
    border: "border-purple-100 hover:border-purple-200",
    activeRing: "ring-2 ring-purple-600 ring-offset-2"
  },
  blue: {
    bg: "from-blue-50 to-indigo-50/50",
    text: "text-blue-600",
    fill: "bg-blue-600",
    border: "border-blue-100 hover:border-blue-200",
    activeRing: "ring-2 ring-blue-600 ring-offset-2"
  },
  green: {
    bg: "from-emerald-50 to-teal-50/50",
    text: "text-emerald-600",
    fill: "bg-emerald-600",
    border: "border-emerald-100 hover:border-emerald-200",
    activeRing: "ring-2 ring-emerald-600 ring-offset-2"
  },
  amber: {
    bg: "from-amber-50 to-orange-50/50",
    text: "text-amber-600",
    fill: "bg-amber-500",
    border: "border-amber-100 hover:border-amber-200",
    activeRing: "ring-2 ring-amber-500 ring-offset-2"
  },
  rose: {
    bg: "from-rose-50 to-red-50/50",
    text: "text-rose-600",
    fill: "bg-rose-500",
    border: "border-rose-100 hover:border-rose-200",
    activeRing: "ring-2 ring-rose-500 ring-offset-2"
  }
};

export const RagAiView: React.FC<RagAiViewProps> = ({ systemLanguage, currentUser }) => {
  const [customAgents, setCustomAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent>(DEFAULT_AGENT);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  // New Agent Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentPosition, setAgentPosition] = useState("");
  const [agentColor, setAgentColor] = useState("purple");
  const [agentSkillContent, setAgentSkillContent] = useState("");
  const [agentIsAutonomous, setAgentIsAutonomous] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allAgents = [DEFAULT_AGENT, ...customAgents];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch agents list
  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/chat_rag.php?action=get_agents");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.agents) {
          const parsedAgents = data.agents.map((a: any) => ({
            id: a.id.toString(),
            name: a.name,
            position: a.position,
            color: a.color || "purple",
            skill_content: a.skill_content || "",
            is_autonomous: a.is_autonomous === 1 || a.is_autonomous === "1" || a.is_autonomous === true
          }));
          setCustomAgents(parsedAgents);
          
          // Re-sync selected agent references if it exists in the fetched list
          const stillExists = parsedAgents.find((pa: any) => pa.id === selectedAgent.id);
          if (stillExists) {
            setSelectedAgent(stillExists);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch agents", err);
    }
  };

  // Fetch agent list on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  // Fetch chat history from RAG DB when selectedAgent changes
  useEffect(() => {
    const fetchHistory = async () => {
      const userId = currentUser?.email || 'default_user';
      try {
        const res = await fetch(
          `/api/chat_rag.php?user_id=${encodeURIComponent(userId)}&agent_id=${encodeURIComponent(selectedAgent.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.messages && data.messages.length > 0) {
            const formattedMessages = data.messages.map((m: any, idx: number) => ({
              id: idx.toString(),
              sender: m.sender,
              text: m.text,
              timestamp: new Date(m.timestamp || Date.now())
            }));
            setMessages(formattedMessages);
          } else {
            // Default initial message
            setMessages([
              {
                id: "initial",
                sender: "agent",
                text: getGreetingMessage(selectedAgent),
                timestamp: new Date()
              }
            ]);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch chat history from RAG DB", err);
      }
    };
    fetchHistory();
  }, [currentUser, selectedAgent]);

  const getGreetingMessage = (agent: Agent) => {
    if (agent.id === "durian") {
      return systemLanguage === "sk" 
        ? "Ahoj! Ja som RAG AI Asistent (Durian). Mám prístup k celej tvojej databáze leadov, klientov a poznámok. Ako ti dnes môžem pomôcť?" 
        : systemLanguage === "hu"
          ? "Szia! Én vagyok a RAG AI Asszisztens (Durian). Hozzáférésem van az összes leadhez, ügyfélhez és feljegyzéshez. Miben segíthetek ma?"
          : "Hello! I am the RAG AI Assistant (Durian). I have access to your database of leads, clients, and notes. How can I assist you today?";
    } else {
      return systemLanguage === "sk"
        ? `Ahoj! Ja som tvoj AI asistent ${agent.name} (${agent.position}). Môj systém bol vycvičený podľa tvojho skill.md súboru. Ako ti dnes môžem pomôcť?`
        : systemLanguage === "hu"
          ? `Szia! Én vagyok a(z) ${agent.name} (${agent.position}) AI asszisztensed. A képességeimet a skill.md dokumentum alapján sajátítottam el. Miben segíthetek ma?`
          : `Hello! I am your AI assistant ${agent.name} (${agent.position}). I have been configured based on your skill.md files. How can I assist you today?`;
    }
  };

  // Reset chat history in RAG DB
  const handleResetChat = async () => {
    const confirmationMsg = systemLanguage === "sk"
      ? "Naozaj chcete vymazať celú históriu tohto rozhovoru z databázy?"
      : systemLanguage === "hu"
        ? "Biztosan törölni szeretné ezt a beszélgetést a naptárból?"
        : "Are you sure you want to delete this conversation history from the database?";

    if (!confirm(confirmationMsg)) return;

    setIsLoading(true);
    const userId = currentUser?.email || 'default_user';

    try {
      const res = await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "reset",
          user_id: userId,
          agent_id: selectedAgent.id
        })
      });
      if (res.ok) {
        setMessages([
          {
            id: "reset-msg",
            sender: "agent",
            text: systemLanguage === "sk" 
              ? "Rozhovor bol úspešne vyčistený. Ako vám môžem pomôcť teraz?" 
              : systemLanguage === "hu"
                ? "A beszélgetés sikeresen kiürítve. Miben segíthetek most?"
                : "The conversation was successfully reset. How can I assist you now?",
            timestamp: new Date()
          }
        ]);
      }
    } catch (err) {
      console.warn("Failed to reset RAG conversation history", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual Trigger to Run Agent (for autonomous agents)
  const handleRunAgent = async () => {
    setIsLoading(true);
    const userId = currentUser?.email || 'default_user';
    try {
      const res = await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "run_agent",
          user_id: userId,
          agent_id: selectedAgent.id
        })
      });
      if (!res.ok) {
        throw new Error("HTTP connection error: " + res.status);
      }
      const data = await res.json();
      if (data.success) {
        const replyMsg: Message = {
          id: Date.now().toString(),
          sender: "agent",
          text: data.reply,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, replyMsg]);
      } else {
        throw new Error(data.message || "Failed to trigger manual run.");
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: Date.now().toString(),
        sender: "agent",
        text: `Run Error: ${err.message}.`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const textToSend = inputText;
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: textToSend,
          user_id: currentUser?.email || 'default_user',
          agent_id: selectedAgent.id
        })
      });
      if (!res.ok) {
        throw new Error("HTTP connection error: " + res.status);
      }
      const data = await res.json();
      if (data.success) {
        const replyMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "agent",
          text: data.reply,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, replyMsg]);
      } else {
        throw new Error(data.message || "Failed to process chat query.");
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        text: systemLanguage === "sk"
          ? `Chyba spojenia: ${err.message}. Skontrolujte konfiguráciu alebo skúste znova.`
          : systemLanguage === "hu"
            ? `Kapcsolódási hiba: ${err.message}. Kérjük, ellenőrizze a beállításokat.`
            : `Connection Error: ${err.message}. Please check configuration or try again.`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle skill.md file selection and text reading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setAgentSkillContent(content);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".md") || file.type === "text/markdown")) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setAgentSkillContent(content);
      };
      reader.readAsText(file);
    } else {
      alert("Please upload a valid markdown (.md) file.");
    }
  };

  // Create new Agent submit handler
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim() || !agentPosition.trim() || !agentSkillContent.trim()) {
      alert("Name, Position and skill.md file upload are required.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/chat_rag.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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
          // Reset form fields
          setAgentName("");
          setAgentPosition("");
          setAgentColor("purple");
          setAgentSkillContent("");
          setAgentIsAutonomous(false);
          setUploadedFileName("");
          // Refresh list
          await fetchAgents();
        } else {
          alert(data.message || "Failed to create agent.");
        }
      }
    } catch (err) {
      console.warn("Error creating agent", err);
    } finally {
      setIsLoading(false);
    }
  };

  const activeColorTheme = COLOR_MAP[selectedAgent.color] || COLOR_MAP.purple;

  return (
    <div className="glass-panel p-0 rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden flex flex-col md:flex-row h-[calc(100vh-12rem)] min-h-[500px] animate-slide-up">
      {/* Left Sidebar - Agent Selector */}
      <div className="w-full md:w-80 border-r border-slate-200/80 bg-slate-50/40 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200/80 bg-white/50 backdrop-blur flex items-center justify-between">
          <div>
            <h3 className="text-sm font-heading font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-purple-600 animate-pulse" />
              {systemLanguage === "sk" ? "AI Agenti" : systemLanguage === "hu" ? "AI Ügynökök" : "AI Agents"}
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
              {systemLanguage === "sk" ? "RAG Znalostná Báza" : systemLanguage === "hu" ? "RAG Tudásbázis" : "RAG Knowledge Base"}
            </p>
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 rounded-xl border border-purple-200 text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 cursor-pointer shadow-sm transition-all duration-200 active:scale-95"
            title={systemLanguage === "sk" ? "Nový agent" : systemLanguage === "hu" ? "Új ügynök" : "New Agent"}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          {allAgents.map((agent) => {
            const isSelected = selectedAgent.id === agent.id;
            const theme = COLOR_MAP[agent.color] || COLOR_MAP.purple;
            const cardBg = isSelected ? theme.bg : "bg-transparent";
            const borderCol = isSelected ? "border-purple-200" : "border-slate-100 hover:border-slate-200";
            
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`flex items-center gap-3.5 p-3.5 rounded-2xl border bg-white ${cardBg} ${borderCol} shadow-sm relative group cursor-pointer transition-all duration-250 hover:scale-[1.01]`}
              >
                <div className="relative shrink-0">
                  <div className={`h-10 w-10 rounded-xl ${theme.fill} flex items-center justify-center text-white shadow`}>
                    <Bot className="h-5.5 w-5.5" />
                  </div>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-xs text-slate-800">{agent.name}</span>
                    {agent.id === "durian" ? (
                      <span className="text-[8px] font-bold text-purple-600 bg-purple-100/80 px-1.5 py-0.5 rounded-md uppercase tracking-wider">v1.3.13</span>
                    ) : (
                      agent.is_autonomous && (
                        <span className="text-[7.5px] font-bold text-indigo-600 bg-indigo-100/80 px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-0.5">
                          <Clock className="h-2 w-2" /> Auto
                        </span>
                      )
                    )}
                  </div>
                  <p className={`text-[10px] ${theme.text} font-medium truncate mt-0.5`}>
                    {agent.position}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Knowledge Base Status Footer */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/50 text-[10px] text-slate-500 flex items-center justify-between font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-purple-500" />
            {systemLanguage === "sk" ? "Vektorová DB" : systemLanguage === "hu" ? "Vektor DB" : "Vector DB"}
          </span>
          <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
            <Check className="h-3 w-3" />
            {systemLanguage === "sk" ? "Pripojené" : systemLanguage === "hu" ? "Kapcsolódva" : "Connected"}
          </span>
        </div>
      </div>

      {/* Right Side - Chat Window */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50/30">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-xl ${activeColorTheme.fill} text-white flex items-center justify-center font-bold`}>
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-heading font-bold text-xs text-slate-800">{selectedAgent.name}</h4>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {selectedAgent.position}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedAgent.is_autonomous && (
              <button
                type="button"
                onClick={handleRunAgent}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[10px] font-black text-indigo-700 hover:text-indigo-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Trigger autonomous skill check now"
              >
                <Play className="h-3.5 w-3.5 fill-indigo-700" />
                {systemLanguage === "sk" ? "Spustiť agenta" : systemLanguage === "hu" ? "Futtatás" : "Run Agent"}
              </button>
            )}
            <button
              type="button"
              onClick={handleResetChat}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-black text-slate-500 hover:text-slate-800 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {systemLanguage === "sk" ? "Vyčistiť chat" : systemLanguage === "hu" ? "Chat törlése" : "Reset Chat"}
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin bg-slate-50/20">
          {messages.map((msg) => {
            const isAgent = msg.sender === "agent";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${isAgent ? "mr-auto" : "ml-auto flex-row-reverse"}`}
              >
                {/* Avatar */}
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isAgent ? `${activeColorTheme.fill} text-white` : "bg-slate-100 text-slate-600"
                }`}>
                  {isAgent ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                </div>

                {/* Bubble */}
                <div className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  isAgent 
                    ? "bg-white border border-slate-100 text-slate-700 rounded-tl-none" 
                    : `${activeColorTheme.fill} text-white rounded-tr-none font-medium`
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span className={`text-[8px] block mt-1.5 text-right ${
                    isAgent ? "text-slate-400" : "text-white/80"
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex gap-3 max-w-[85%] mr-auto">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${activeColorTheme.fill} text-white`}>
                <Bot className="h-4.5 w-4.5" />
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm flex items-center gap-1.5 min-w-[50px] justify-center">
                <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200/80 bg-slate-50/40">
          <div className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={systemLanguage === "sk" 
                ? "Napíšte svoju správu..." 
                : systemLanguage === "hu"
                  ? "Írja be az üzenetet..."
                  : "Type your message..."
              }
              className="w-full pl-4 pr-12 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 p-2 rounded-xl bg-purple-650 hover:bg-purple-700 text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {/* POPUP MODAL - NEW AGENT FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <div className="w-full max-w-md rounded-3xl border border-slate-150 bg-white p-6 shadow-2xl relative z-10 space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-heading font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4.5 w-4.5 text-purple-600 animate-pulse" />
                {systemLanguage === "sk" ? "Vytvoriť nového agenta" : systemLanguage === "hu" ? "Új ügynök létrehozása" : "Create New Agent"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-7 w-7 rounded-lg hover:bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-800 flex items-center justify-center transition-colors shadow-sm cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Agent Name *</label>
                <input
                  type="text"
                  required
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Lead Qualification Expert"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-550 focus:ring-1 focus:ring-purple-550"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Position / Role *</label>
                <input
                  type="text"
                  required
                  value={agentPosition}
                  onChange={(e) => setAgentPosition(e.target.value)}
                  placeholder="e.g. Analyzes and qualifications inbound pipeline"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-purple-550 focus:ring-1 focus:ring-purple-550"
                />
              </div>

              {/* Fixed Color Selection Circle Sections */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Theme Color *</label>
                <div className="flex items-center gap-3 bg-slate-50/50 p-2.5 rounded-2xl border border-slate-150 w-fit">
                  {Object.keys(COLOR_MAP).map((colorKey) => {
                    const colDetails = COLOR_MAP[colorKey];
                    const isSelected = agentColor === colorKey;
                    return (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setAgentColor(colorKey)}
                        className={`h-6.5 w-6.5 rounded-full ${colDetails.fill} cursor-pointer transition-all ${
                          isSelected ? colDetails.activeRing : "opacity-85 hover:opacity-100 hover:scale-105"
                        }`}
                        title={colorKey}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Skill file upload */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Skill Configuration (skill.md) *</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".md"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 ${
                    isDragging 
                      ? "border-purple-600 bg-purple-50/20 scale-[1.02]" 
                      : "border-slate-205 hover:border-purple-300 bg-slate-50/20 hover:bg-purple-50/10"
                  }`}
                >
                  <FileText className={`h-8 w-8 transition-colors ${isDragging ? "text-purple-600" : "text-slate-400 animate-pulse"}`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider transition-colors ${isDragging ? "text-purple-700" : "text-slate-500"}`}>
                    {uploadedFileName ? uploadedFileName : "Drag & Drop or Click to Upload skill.md"}
                  </span>
                  <span className="text-[9px] text-slate-400">Accepts .md instruction logs</span>
                </div>
              </div>

              {/* Autonomous Checkbox */}
              <label className="flex items-center gap-2.5 px-3 py-2 border border-slate-200/80 hover:border-purple-200 bg-slate-50/30 rounded-xl cursor-pointer select-none transition-all">
                <input
                  type="checkbox"
                  checked={agentIsAutonomous}
                  onChange={(e) => setAgentIsAutonomous(e.target.checked)}
                  className="rounded border-slate-300 text-purple-650 focus:ring-purple-500 h-4.5 w-4.5"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Set as Autonomous Agent
                  </span>
                  <span className="text-[8.5px] text-slate-450 mt-0.5">Executes automatically via cron scheduler and adds Run triggers</span>
                </div>
              </label>

              <div className="pt-2 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !agentName.trim() || !agentPosition.trim() || !agentSkillContent.trim()}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Create Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
