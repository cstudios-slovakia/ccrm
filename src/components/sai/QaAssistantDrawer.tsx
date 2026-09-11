import React, { useState } from 'react';
import { 
  SwarmAgentProfile, 
  SwarmPost, 
  StrategicReport 
} from '../../utils/swarm/types';
import { askChiefAnalyst, interviewAgent } from '../../utils/swarm/chatAssistant';
import { X, Send, Bot, User, Sparkles, MessageCircle } from 'lucide-react';

interface QaAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: StrategicReport | null;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  hypothesis: string;
  initialAgent?: SwarmAgentProfile | null;
}

export const QaAssistantDrawer: React.FC<QaAssistantDrawerProps> = ({
  isOpen,
  onClose,
  report,
  agents,
  posts,
  hypothesis,
  initialAgent = null
}) => {
  const [activeTab, setActiveTab] = useState<'analyst' | 'agent'>(initialAgent ? 'agent' : 'analyst');
  const [selectedAgent, setSelectedAgent] = useState<SwarmAgentProfile | null>(initialAgent || agents[0] || null);

  const [analystMessages, setAnalystMessages] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([
    {
      sender: 'assistant',
      text: "Hello! I am your Chief Intelligence Analyst. I observed the entire market simulation and can answer any questions regarding agent reactions, primary objections, and competitive strategies."
    }
  ]);
  const [agentMessages, setAgentMessages] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const userText = inputValue.trim();
    setInputValue('');

    if (activeTab === 'analyst') {
      const newHistory = [...analystMessages, { sender: 'user' as const, text: userText }];
      setAnalystMessages(newHistory);
      setIsLoading(true);

      try {
        const response = await askChiefAnalyst({
          userQuestion: userText,
          chatHistory: analystMessages,
          report,
          posts
        });
        setAnalystMessages([...newHistory, { sender: 'assistant', text: response }]);
      } catch (err) {
        setAnalystMessages([...newHistory, { sender: 'assistant', text: `Error: ${(err as Error).message}` }]);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === 'agent' && selectedAgent) {
      const newHistory = [...agentMessages, { sender: 'user' as const, text: userText }];
      setAgentMessages(newHistory);
      setIsLoading(true);

      try {
        const agentPosts = posts.filter(p => p.agentId === selectedAgent.id);
        const response = await interviewAgent({
          agent: selectedAgent,
          userQuestion: userText,
          chatHistory: agentMessages,
          agentPosts,
          hypothesis
        });
        setAgentMessages([...newHistory, { sender: 'assistant', text: response }]);
      } catch (err) {
        setAgentMessages([...newHistory, { sender: 'assistant', text: `Error: ${(err as Error).message}` }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[1300] w-full max-w-lg bg-white shadow-2xl border-l border-slate-200/90 flex flex-col animate-in slide-in-from-right duration-300">
      
      {/* Drawer Header */}
      <div className="p-5 bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-emerald-500 text-white flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Simulation Interrogation Hub</h3>
            <p className="text-[11px] text-slate-500">Cross-examine analyst findings & agent motives</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 border-b border-slate-100 flex items-center gap-4">
        <button
          onClick={() => setActiveTab('analyst')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'analyst' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Ask Chief Analyst
        </button>
        <button
          onClick={() => setActiveTab('agent')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'agent' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Interview Agent (1-on-1)
        </button>
      </div>

      {/* Agent Selector (If on Agent tab) */}
      {activeTab === 'agent' && (
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200/70 flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 uppercase">Agent:</span>
          <select
            value={selectedAgent?.id || ''}
            onChange={e => {
              const a = agents.find(ag => ag.id === Number(e.target.value));
              setSelectedAgent(a || null);
              setAgentMessages([]);
            }}
            className="flex-1 text-xs py-1 px-2.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-1 focus:ring-indigo-500"
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
      <div className="flex-1 overflow-y-auto p-5 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-200">
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
            <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[80%] whitespace-pre-wrap ${
              m.sender === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/70'
            }`}>
              {m.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs italic pl-9">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={
            activeTab === 'analyst' 
              ? 'Ask why a specific objection arose...' 
              : `Ask ${selectedAgent?.displayName || 'agent'} why they took that stance...`
          }
          className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
