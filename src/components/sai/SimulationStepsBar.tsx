import React, { useState } from 'react';
import { 
  Zap, 
  CheckCircle2, 
  FileText, 
  MessageSquare, 
  Plus, 
  X, 
  Pause, 
  Clock 
} from 'lucide-react';

export interface SimulationStepInfo {
  id: number;
  shortLabel: string;
  title: string;
  tagline: string;
}

export const REAL_SIMULATION_STEPS: SimulationStepInfo[] = [
  {
    id: 1,
    shortLabel: '1. Scenario',
    title: '1. Strategic Scenario & Hypothesis Definition',
    tagline: 'Define proposal, what-if question, and CRM grounding sources.'
  },
  {
    id: 2,
    shortLabel: '2. Pre-Flight',
    title: '2. Pre-Flight Resource & Safety Estimator',
    tagline: 'Predict worst-case token spend and enforce safety guards.'
  },
  {
    id: 3,
    shortLabel: '3. Swarm Ingestion',
    title: '3. Swarm Ingestion & Knowledge Graph Assembly',
    tagline: 'Extract CRM context, build ontology graph, and synthesize personas.'
  },
  {
    id: 4,
    shortLabel: '4. Live War Room',
    title: '4. Autonomous Live War Room Simulation',
    tagline: 'Autonomous agents debate, post counter-arguments, and vote.'
  },
  {
    id: 5,
    shortLabel: '5. Strategy Synthesis',
    title: '5. Chief Intelligence Analyst Synthesis',
    tagline: 'AI processes multi-agent debate and compiles executive briefing.'
  },
  {
    id: 6,
    shortLabel: '6. Results & Chatbot',
    title: '6. Executive Briefing & Live AI Interrogation Hub',
    tagline: 'Executive strategic playbook and live multi-agent interrogation.'
  }
];

interface SimulationStepsBarProps {
  currentStep: number; // 1 to 6
  title: string;
  hypothesis?: string;
  seedDocument?: string;
  isEngineRunning?: boolean;
  isPreparing?: boolean;
  prepStepMessage?: string;
  currentRound?: number;
  totalRounds?: number;
  simulatedHour?: number;
  isDemoMode?: boolean;
  hasReport?: boolean;
  hasWarRoom?: boolean;
  activeView: 'list' | 'create' | 'running' | 'report';
  onNavigateView: (view: 'list' | 'create' | 'running' | 'report') => void;
  onStopSimulation?: () => void;
  onOpenQaDrawer?: () => void;
  onOpenPreflightModal?: () => void;
  onStartNewRehearsal?: () => void;
}

export const SimulationStepsBar: React.FC<SimulationStepsBarProps> = ({
  currentStep,
  title,
  hypothesis,
  seedDocument,
  isEngineRunning = false,
  isPreparing = false,
  prepStepMessage = '',
  currentRound = 0,
  totalRounds = 8,
  simulatedHour,
  isDemoMode = false,
  hasReport = false,
  hasWarRoom = false,
  activeView,
  onNavigateView,
  onStopSimulation,
  onOpenQaDrawer,
  onOpenPreflightModal,
  onStartNewRehearsal
}) => {
  const [showScenarioModal, setShowScenarioModal] = useState(false);

  const stepMeta = REAL_SIMULATION_STEPS.find(s => s.id === currentStep) || REAL_SIMULATION_STEPS[0];

  // Derive status badge
  let badgeText = 'ACTIVE SIMULATION';
  let badgeStyle = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

  if (isDemoMode) {
    badgeText = 'DEMO REHEARSAL';
    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  } else if (isEngineRunning) {
    badgeText = `LIVE SIMULATING • R${currentRound}/${totalRounds}`;
    badgeStyle = 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 animate-pulse';
  } else if (isPreparing) {
    badgeText = currentStep === 5 ? 'COMPILING BRIEFING' : 'ORCHESTRATING SWARM';
    badgeStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse';
  } else if (hasReport || activeView === 'report') {
    badgeText = 'REHEARSAL COMPLETED';
    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  } else if (activeView === 'create') {
    badgeText = 'NEW REHEARSAL';
    badgeStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  }

  // Handle clicking step pills
  const handleStepClick = (stepId: number) => {
    if (stepId === 1) {
      if (activeView === 'create') {
        // already on create
      } else {
        setShowScenarioModal(true);
      }
      return;
    }

    if (stepId === 2) {
      if (onOpenPreflightModal) {
        onOpenPreflightModal();
      }
      return;
    }

    if (stepId === 3) {
      // Swarm ingestion details or info
      if (activeView === 'create') return;
      onNavigateView('running');
      return;
    }

    if (stepId === 4) {
      if (hasWarRoom || activeView === 'report') {
        onNavigateView('running');
      }
      return;
    }

    if (stepId === 5 || stepId === 6) {
      if (hasReport) {
        onNavigateView('report');
      }
    }
  };

  return (
    <>
      {/* Sleek Dark Simulation Stepper Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 text-white flex flex-wrap items-center justify-between gap-4 shadow-xl shrink-0 sticky top-0 z-30">
        
        {/* Title & Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md shrink-0">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-white line-clamp-1 max-w-xs sm:max-w-sm md:max-w-md">
                {title || 'SAI Autonomous Rehearsal'}
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${badgeStyle}`}>
                {badgeText}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-1 flex items-center gap-1.5">
              <span>Step {currentStep} of 6: {isPreparing && prepStepMessage ? prepStepMessage : stepMeta.title}</span>
              {simulatedHour !== undefined && isEngineRunning && (
                <span className="text-amber-400/90 font-mono text-[10px] inline-flex items-center gap-1 ml-1 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
                  <Clock className="w-3 h-3 text-amber-400 inline" />
                  {String(simulatedHour).padStart(2, '0')}:00 CET
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Stepper Navigation Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto max-w-full">
          {REAL_SIMULATION_STEPS.map(s => {
            const isActive = s.id === currentStep;
            const isPassed = s.id < currentStep || (hasReport && s.id <= 5);
            const isClickable = 
              (s.id === 1 && (activeView !== 'create' || hypothesis)) ||
              (s.id === 2 && Boolean(onOpenPreflightModal)) ||
              (s.id === 4 && (hasWarRoom || hasReport)) ||
              (s.id === 6 && hasReport);

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStepClick(s.id)}
                disabled={!isClickable && !isActive}
                title={`${s.title} — ${s.tagline}${isClickable ? ' (Click to inspect)' : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                  isActive 
                    ? 'bg-gradient-to-r from-purple-600 to-emerald-500 text-white shadow-md' 
                    : isPassed
                      ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700 cursor-pointer'
                      : isClickable
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 cursor-pointer'
                        : 'text-slate-600 cursor-not-allowed opacity-60'
                }`}
              >
                {isPassed && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                <span className="truncate">{s.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Active Live War Room Controls */}
          {activeView === 'running' && isEngineRunning && onStopSimulation && (
            <button
              type="button"
              onClick={onStopSimulation}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Stop multi-agent debate and finalize synthesis"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Conclude Early</span>
            </button>
          )}

          {/* Ask Analyst / QA Drawer Trigger */}
          {activeView !== 'create' && onOpenQaDrawer && (
            <button
              type="button"
              onClick={onOpenQaDrawer}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Open AI Interrogation Drawer to cross-examine agents and report"
            >
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Ask Analyst</span>
            </button>
          )}

          {/* New Rehearsal Shortcut */}
          {activeView === 'report' && onStartNewRehearsal && (
            <button
              type="button"
              onClick={onStartNewRehearsal}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-700 hover:to-emerald-700 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">New Rehearsal</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-800 mx-1 hidden sm:block" />

          {/* Back to Rehearsals Overview / Exit */}
          <button
            type="button"
            onClick={() => onNavigateView('list')}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer flex items-center gap-1"
            title="Return to Rehearsals Overview"
          >
            <X className="w-4 h-4" />
          </button>

        </div>

      </div>

      {/* Scenario Details Popover Modal */}
      {showScenarioModal && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Step 1: Strategic Scenario Definition</h3>
                  <p className="text-xs text-slate-300">{title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowScenarioModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-slate-800 text-xs">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-purple-700 block mb-1">
                  Strategic Hypothesis / What-If Question
                </span>
                <p className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200/80 font-semibold text-purple-950 leading-relaxed">
                  {hypothesis || 'No explicit hypothesis recorded.'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 block mb-1">
                  Seed Scenario & Announcement Document
                </span>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 font-mono text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {seedDocument || 'No announcement memo text provided.'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowScenarioModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
