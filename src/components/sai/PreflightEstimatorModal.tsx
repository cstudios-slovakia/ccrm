import React, { useState } from 'react';
import { ShieldAlert, Zap, X, ArrowRight, Coins } from 'lucide-react';

interface PreflightEstimatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  swarmScale: number;
  totalRounds: number;
  modelName: string;
  isDemoMode?: boolean;
}

export const PreflightEstimatorModal: React.FC<PreflightEstimatorModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  swarmScale,
  totalRounds,
  modelName: _modelName,
  isDemoMode = false
}) => {
  const [acknowledged, setAcknowledged] = useState(isDemoMode);

  if (!isOpen) return null;

  // Formula calculations
  const ontologyTokens = 3000;
  const profileTokens = swarmScale * 600;
  const turnsPerSim = Math.round(swarmScale * totalRounds * 0.7); // 70% average activity due to diurnal cycle
  const simulationTokens = turnsPerSim * 450;
  const reportTokens = 8000;

  const totalTokens = ontologyTokens + profileTokens + simulationTokens + reportTokens;
  const totalCalls = turnsPerSim + swarmScale + 6; // sim turns + profiles + ontology & report

  // Pricing estimators per 1M tokens
  const costGpt4oMini = (totalTokens / 1_000_000) * 0.60; // ~$0.15 in, $0.60 out blended
  const costDeepSeek = (totalTokens / 1_000_000) * 0.28;
  const costQwenPlus = (totalTokens / 1_000_000) * 0.40;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-emerald-50 border-b border-slate-200/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pre-Flight Resource Estimator</h3>
              <p className="text-xs text-slate-500 font-medium">Rehearsal: {title || 'Untitled'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium block">Swarm Scale</span>
              <span className="text-lg font-bold text-slate-800">{swarmScale} Agents</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">{totalRounds} simulated rounds</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
              <span className="text-xs text-slate-500 font-medium block">Estimated Calls</span>
              <span className="text-lg font-bold text-indigo-600">~{totalCalls} API calls</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">~{totalTokens.toLocaleString()} tokens</span>
            </div>
          </div>

          {/* Pricing Comparison Cards */}
          <div className={`p-4 rounded-2xl border ${isDemoMode ? 'bg-emerald-50/70 border-emerald-200' : 'bg-purple-50/50 border-purple-100'}`}>
            <span className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${isDemoMode ? 'text-emerald-900' : 'text-purple-900'}`}>
              {isDemoMode ? 'Demo Mode Active (No API Tokens Consumed)' : 'Projected Quota Cost'}
            </span>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="font-medium text-slate-700">DeepSeek V3</span>
                <span className="font-bold text-emerald-600">{isDemoMode ? '€0.000 (Demo)' : `€${costDeepSeek.toFixed(3)}`}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="font-medium text-slate-700">Qwen Plus (DashScope)</span>
                <span className="font-bold text-indigo-600">{isDemoMode ? '€0.000 (Demo)' : `€${costQwenPlus.toFixed(3)}`}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="font-medium text-slate-700">GPT-4o-mini (OpenAI)</span>
                <span className="font-bold text-slate-800">{isDemoMode ? '€0.000 (Demo)' : `€${costGpt4oMini.toFixed(3)}`}</span>
              </div>
            </div>
          </div>

          {/* Safety Notice */}
          {isDemoMode ? (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <Zap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>Interactive Demonstration Mode:</strong> Runs locally with instant round streaming, animated graph nodes, and pre-computed ReAct briefings for UX evaluation.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                This simulation will make parallel LLM calls in your browser. Ensure your OpenAI or proxy balance has adequate quota.
              </p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <label className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={acknowledged} 
              onChange={e => setAcknowledged(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <span className="text-xs font-semibold text-slate-700">
              {isDemoMode 
                ? 'I understand this simulation will run in Demo Mode with simulated responses.'
                : 'I understand this simulation will consume API quota and take ~2–4 minutes.'}
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="p-5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-200/70 transition"
          >
            Cancel / Edit Config
          </button>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition ${
              acknowledged 
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:opacity-95 cursor-pointer active:scale-95' 
                : 'bg-slate-300 cursor-not-allowed opacity-60'
            }`}
          >
            <span>Confirm & Launch</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
