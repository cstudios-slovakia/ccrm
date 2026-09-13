import React, { useState, useRef, useEffect } from 'react';
import type { 
  SwarmAgentProfile, 
  SwarmPost, 
  StrategicReport 
} from '../../utils/swarm/types';
import { askChiefAnalyst, interviewAgent } from '../../utils/swarm/chatAssistant';
import { getDemoAnalystAnswer, getDemoAgentAnswer } from '../../utils/swarm/demoData';
import { Markdown } from '../../utils/markdown';
import { X, Send, Bot, User, Sparkles, RotateCcw } from 'lucide-react';

interface QaAssistantDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  report: StrategicReport | null;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  hypothesis: string;
  initialAgent?: SwarmAgentProfile | null;
  isDemoMode?: boolean;
  embedded?: boolean;
  systemLanguage?: string;
  className?: string;
}

export const QaAssistantDrawer: React.FC<QaAssistantDrawerProps> = ({
  isOpen = true,
  onClose,
  report,
  agents,
  posts,
  hypothesis,
  initialAgent = null,
  isDemoMode = false,
  embedded = false,
  className = ""
}) => {
  const [activeTab, setActiveTab] = useState<'analyst' | 'agent'>(initialAgent ? 'agent' : 'analyst');
  const [selectedAgent, setSelectedAgent] = useState<SwarmAgentProfile | null>(initialAgent || agents[0] || null);

  const [analystMessages, setAnalystMessages] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([
    {
      sender: 'assistant',
      text: "Dobrý deň! Som váš hlavný spravodajský analytik. Sledoval som celý priebeh trhovej simulácie a rád vám zodpoviem akékoľvek otázky týkajúce sa reakcií agentov, hlavných námietok a odporúčaných stratégií."
    }
  ]);
  const [agentMessages, setAgentMessages] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [analystMessages.length, agentMessages.length, isLoading]);

  if (!isOpen && !embedded) return null;

  const triggerSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    const userText = textToSend.trim();
    setInputValue('');

    if (activeTab === 'analyst') {
      const newHistory = [...analystMessages, { sender: 'user' as const, text: userText }];
      setAnalystMessages(newHistory);
      setIsLoading(true);

      try {
        if (isDemoMode) {
          await new Promise(r => setTimeout(r, 600));
          const response = getDemoAnalystAnswer(userText);
          setAnalystMessages([...newHistory, { sender: 'assistant', text: response }]);
        } else {
          const response = await askChiefAnalyst({
            userQuestion: userText,
            chatHistory: analystMessages,
            report,
            posts
          });
          setAnalystMessages([...newHistory, { sender: 'assistant', text: response }]);
        }
      } catch (err) {
        setAnalystMessages([...newHistory, { sender: 'assistant', text: `Chyba: ${(err as Error).message}` }]);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === 'agent' && selectedAgent) {
      const newHistory = [...agentMessages, { sender: 'user' as const, text: userText }];
      setAgentMessages(newHistory);
      setIsLoading(true);

      try {
        if (isDemoMode) {
          await new Promise(r => setTimeout(r, 600));
          const response = getDemoAgentAnswer(selectedAgent.displayName, userText);
          setAgentMessages([...newHistory, { sender: 'assistant', text: response }]);
        } else {
          const agentPosts = posts.filter(p => p.agentId === selectedAgent.id);
          const response = await interviewAgent({
            agent: selectedAgent,
            userQuestion: userText,
            chatHistory: agentMessages,
            agentPosts,
            hypothesis
          });
          setAgentMessages([...newHistory, { sender: 'assistant', text: response }]);
        }
      } catch (err) {
        setAgentMessages([...newHistory, { sender: 'assistant', text: `Chyba: ${(err as Error).message}` }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSend = () => {
    triggerSend(inputValue);
  };

  const handleResetChat = () => {
    if (activeTab === 'analyst') {
      setAnalystMessages([
        {
          sender: 'assistant',
          text: "Dobrý deň! Som váš hlavný spravodajský analytik. Sledoval som celý priebeh trhovej simulácie a rád vám zodpoviem akékoľvek otázky týkajúce sa reakcií agentov, hlavných námietok a odporúčaných stratégií."
        }
      ]);
    } else {
      setAgentMessages([]);
    }
  };

  return (
    <div className={
      embedded 
        ? `rounded-3xl bg-white border border-slate-200/80 shadow-md flex flex-col h-[calc(100vh-210px)] min-h-[500px] max-h-[820px] overflow-hidden ${className}`
        : `fixed inset-y-0 right-0 z-[1300] w-full max-w-lg bg-white shadow-2xl border-l border-slate-200/90 flex flex-col animate-in slide-in-from-right duration-300 ${className}`
    }>
      
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 truncate">Interrogačný hub simulácie</h3>
            <p className="text-[11px] text-slate-500 truncate">Krížový výsluch zistení analytika & motívov agentov</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            type="button"
            onClick={handleResetChat}
            title="Resetovať konverzáciu"
            className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 border-b border-slate-100 flex items-center gap-4 bg-white">
        <button
          onClick={() => setActiveTab('analyst')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'analyst' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Spýtať sa hlavného analytika
        </button>
        <button
          onClick={() => setActiveTab('agent')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'agent' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Výsluch agenta (1 na 1)
        </button>
      </div>

      {/* Agent Selector (If on Agent tab) */}
      {activeTab === 'agent' && (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/70 flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0">Agent:</span>
          <select
            value={selectedAgent?.id || ''}
            onChange={e => {
              const a = agents.find(ag => ag.id === Number(e.target.value));
              setSelectedAgent(a || null);
              setAgentMessages([]);
            }}
            className="flex-1 text-xs py-1 px-2.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-1 focus:ring-indigo-500 truncate"
          >
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.displayName} (@{a.username}) — {a.profession} [{a.stance}]
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Message History */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-200">
        {(activeTab === 'analyst' ? analystMessages : agentMessages).map((m, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              m.sender === 'user' 
                ? 'bg-indigo-600 text-white' 
                : (activeTab === 'analyst' ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white')
            }`}>
              {m.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
              m.sender === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none whitespace-pre-wrap' 
                : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200/80 shadow-xs'
            }`}>
              {m.sender === 'user' ? m.text : <Markdown content={m.text} className="space-y-1.5 text-xs text-slate-800 leading-relaxed" />}
            </div>
          </div>
        ))}

        {/* Quick Suggestion Chips for Chief Analyst */}
        {activeTab === 'analyst' && analystMessages.length <= 1 && (
          <div className="pt-2 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Odporúčané otázky:
            </span>
            <div className="space-y-1.5">
              {[
                "Aké boli hlavné námietky vznesené agentmi?",
                "Ako v simulácii reagovala konkurencia?",
                "Akú stratégiu by sme mali prioritizovať na dosiahnutie cieľa?"
              ].map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => triggerSend(prompt)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-indigo-50/70 hover:bg-indigo-100/90 border border-indigo-200/60 text-indigo-700 text-xs font-medium transition cursor-pointer flex items-center justify-between group"
                >
                  <span className="truncate">{prompt}</span>
                  <span className="text-[11px] opacity-60 group-hover:opacity-100 transition ml-2 shrink-0">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Interview Agent Welcome Banner */}
        {activeTab === 'agent' && agentMessages.length === 0 && selectedAgent && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 text-xs space-y-2">
            <div className="font-bold text-emerald-800 flex items-center gap-1.5">
              <span>Výsluch agenta: {selectedAgent.displayName} (@{selectedAgent.username})</span>
            </div>
            <p className="text-emerald-700 text-[11px] leading-relaxed">
              Opýtajte sa priamo tohto špecialistu ({selectedAgent.profession}), prečo zaujal postoj <strong>{selectedAgent.stance}</strong>, alebo čo by ho presvedčilo zmeniť názor.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                "Prečo ste mali námietky voči tejto ponuke?",
                "Aký ústupok by vás presvedčil k nákupu?",
                "Ako to porovnávate so súčasnými nástrojmi?"
              ].map((q, qIdx) => (
                <button
                  key={qIdx}
                  type="button"
                  onClick={() => triggerSend(q)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 transition cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs italic pl-9">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>Premýšľam...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <input
          id="sai-interrogation-input"
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={
            activeTab === 'analyst' 
              ? 'Opýtajte sa, prečo vznikla námietka, aké sú ďalšie kroky...' 
              : `Opýtajte sa agenta ${selectedAgent?.displayName || ''}, prečo zaujal daný postoj...`
          }
          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-sans"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-emerald-500 hover:opacity-95 disabled:opacity-40 text-white shadow-sm transition cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
