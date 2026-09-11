import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Zap, 
  ShieldCheck, 
  Clock, 
  Users, 
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
  Brain
} from 'lucide-react';
import { 
  DEMO_GRAPH, 
  DEMO_AGENTS, 
  DEMO_POSTS, 
  DEMO_METRICS_HISTORY, 
  DEMO_STRATEGIC_REPORT 
} from '../../utils/swarm/demoData';
import { SwarmGraphCanvas } from './SwarmGraphCanvas';
import { StrategicReportView } from './StrategicReportView';
import { Markdown } from '../../utils/markdown';

interface GuidedDemoWalkthroughProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRealRehearsal: () => void;
}

interface DemoStepMeta {
  id: number;
  title: string;
  shortLabel: string;
  tagline: string;
  userAction: string;
  engineAction: string;
  durationSec: number;
}

const DEMO_STEPS: DemoStepMeta[] = [
  {
    id: 1,
    title: "1. Strategic Scenario & Hypothesis Definition",
    shortLabel: "1. Scenario",
    tagline: "Define your strategic proposal, pricing change, or market announcement.",
    userAction: "You enter the business scenario, hypothesis, and proposal document. You select how many months of real CRM history to ground the swarm in.",
    engineAction: "The engine parses the proposal, identifies core value propositions, and establishes initial stakeholder categories.",
    durationSec: 8
  },
  {
    id: 2,
    title: "2. Pre-Flight Resource & Safety Estimator",
    shortLabel: "2. Pre-Flight",
    tagline: "Predict worst-case token spend and enforce budget guards before launching.",
    userAction: "You inspect the calculated token volume, compare model costs, and verify budget caps before any API call is made.",
    engineAction: "Formula calculates exact input/output tokens (ontology + profiles + multi-round dialogue + synthesis) and validates safety quotas.",
    durationSec: 7
  },
  {
    id: 3,
    title: "3. Swarm Ingestion & Knowledge Graph Assembly",
    shortLabel: "3. Swarm Ingestion",
    tagline: "Synthesize realistic buyer committees, auditors, and competitors from CRM records.",
    userAction: "You review the synthesized stakeholder personas (procurement gatekeepers, compliance auditors, legacy competitors, agency clients).",
    engineAction: "The engine samples CRM deals, lost reasons, and client personas to assemble an interconnected dynamic Knowledge Graph.",
    durationSec: 8
  },
  {
    id: 4,
    title: "4. Autonomous Live War Room Simulation",
    shortLabel: "4. Live War Room",
    tagline: "Watch autonomous agents debate, counter-attack, and vote across rounds.",
    userAction: "You monitor the real-time social stream, sentiment trajectory, circadian simulated time, and viral heat index.",
    engineAction: "Agents post asynchronously, reply to objections, wage competitor counter-campaigns, and reach consensus based on psychological personas.",
    durationSec: 10
  },
  {
    id: 5,
    title: "5. Chief Intelligence Analyst Synthesis",
    shortLabel: "5. Strategy Synthesis",
    tagline: "AI extracts critical failure points and formulates the strategic playbook.",
    userAction: "You watch the synthesis engine process simulation dialogue, detect fatal flaws, and build sales objection scripts.",
    engineAction: "Chief Analyst analyzes 30+ agent interactions, evaluates counter-measures, and generates the executive briefing.",
    durationSec: 6
  },
  {
    id: 6,
    title: "6. Executive Briefing & Live AI Interrogation Hub",
    shortLabel: "6. Results & Chatbot",
    tagline: "Read the strategic playbook and cross-examine findings via the right-side chatbot.",
    userAction: "You review the executive briefing on the left and continuously interrogate the Chief Analyst or simulated buyers via the persistent right-side card.",
    engineAction: "Answers questions with citations from simulation dialogue, explaining why specific agents objected and how to close deals.",
    durationSec: 12
  }
];

export const GuidedDemoWalkthrough: React.FC<GuidedDemoWalkthroughProps> = ({
  isOpen,
  onClose,
  onStartRealRehearsal
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  // Interactive step simulation states
  const [warRoomRound, setWarRoomRound] = useState(1);
  const [typedProposal, setTypedProposal] = useState('');
  const [synthesisProgress, setSynthesisProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepMeta = DEMO_STEPS[currentStep - 1];

  // Auto-progression timer
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const durationMs = stepMeta.durationSec * 1000;
    const intervalMs = 100;
    const increment = (intervalMs / durationMs) * 100;

    setProgress(0);

    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          if (currentStep < DEMO_STEPS.length) {
            setCurrentStep(s => s + 1);
          } else {
            setIsPlaying(false);
          }
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isPlaying, currentStep, stepMeta.durationSec]);

  // Step 1: Simulated typing effect for scenario
  useEffect(() => {
    if (currentStep === 1) {
      const fullText = "Enterprise Tier Restructuring: +25% price increase, guaranteed 99.9% uptime SLA, dedicated engineer WhatsApp channels, Frankfurt/EU data residency, and a 6-month grandfathering grace period for existing accounts.";
      let idx = 0;
      setTypedProposal('');
      const interval = setInterval(() => {
        if (idx <= fullText.length) {
          setTypedProposal(fullText.slice(0, idx));
          idx += 3;
        } else {
          clearInterval(interval);
        }
      }, 30);
      return () => clearInterval(interval);
    }
  }, [currentStep]);

  // Step 4: War room round progression
  useEffect(() => {
    if (currentStep === 4) {
      setWarRoomRound(1);
      const t1 = setTimeout(() => setWarRoomRound(2), 3200);
      const t2 = setTimeout(() => setWarRoomRound(3), 6500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [currentStep]);

  // Step 5: Synthesis progress animation
  useEffect(() => {
    if (currentStep === 5) {
      setSynthesisProgress(0);
      const interval = setInterval(() => {
        setSynthesisProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 5;
        });
      }, 200);
      return () => clearInterval(interval);
    }
  }, [currentStep]);

  if (!isOpen) return null;

  const handleNextStep = () => {
    if (currentStep < DEMO_STEPS.length) {
      setCurrentStep(prev => prev + 1);
      setProgress(0);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setProgress(0);
    }
  };

  const handleSelectStep = (stepNum: number) => {
    setCurrentStep(stepNum);
    setProgress(0);
    setIsPlaying(false);
  };

  const handleRestart = () => {
    setCurrentStep(1);
    setProgress(0);
    setIsPlaying(true);
  };

  const warRoomPosts = DEMO_POSTS.filter(p => p.roundNum <= warRoomRound);
  const currentMetric = DEMO_METRICS_HISTORY[warRoomRound - 1] || DEMO_METRICS_HISTORY[0];

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-md flex flex-col overflow-hidden text-slate-900 animate-in fade-in duration-300">
      
      {/* Top Demo Control Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 text-white flex flex-wrap items-center justify-between gap-4 shadow-xl shrink-0">
        
        {/* Title & Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-white">SAI Interactive Process Walkthrough</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Rehearsal Demo
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Step {currentStep} of {DEMO_STEPS.length}: {stepMeta.title}</p>
          </div>
        </div>

        {/* Stepper Navigation Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-2xl border border-slate-800">
          {DEMO_STEPS.map(s => {
            const isActive = s.id === currentStep;
            const isPassed = s.id < currentStep;
            return (
              <button
                key={s.id}
                onClick={() => handleSelectStep(s.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isActive 
                    ? 'bg-gradient-to-r from-purple-600 to-emerald-500 text-white shadow-md' 
                    : isPassed
                      ? 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {isPassed && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                <span className="truncate">{s.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              isPlaying ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-emerald-600 text-white'
            }`}
            title={isPlaying ? 'Pause auto-tour' : 'Resume auto-tour'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-amber-300" /> : <Play className="w-4 h-4 fill-white" />}
            <span className="text-[11px]">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
            title="Previous step"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handleNextStep}
            disabled={currentStep === DEMO_STEPS.length}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
            title="Next step"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleRestart}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Restart demo from Step 1"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1" />

          <button
            onClick={onStartRealRehearsal}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition cursor-pointer"
          >
            Launch Real Rehearsal
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer ml-1"
            title="Exit demo walkthrough"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      </div>

      {/* Step Auto-Progress Bar */}
      <div className="w-full bg-slate-800 h-1">
        <div 
          className="bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 h-1 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Guided Educational Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-indigo-900/40 px-8 py-3 text-white shrink-0 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">{stepMeta.title}</span>
            </div>
            <p className="text-sm font-semibold text-slate-200">{stepMeta.tagline}</p>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-300 bg-slate-950/60 px-4 py-2 rounded-2xl border border-slate-800/80">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">👤 User Action</span>
              <span className="text-[11.5px] text-slate-200">{stepMeta.userAction}</span>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">⚡ Engine Action</span>
              <span className="text-[11.5px] text-slate-200">{stepMeta.engineAction}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col">
        <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col">
          
          {/* STAGE 1: Scenario Definition */}
          {currentStep === 1 && (
            <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300 py-6">
              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">Define Strategic Scenario & Hypothesis</h3>
                      <p className="text-xs text-slate-500">What business decision do you want to rehearse before going live?</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Step 1 of 6
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1.5 uppercase tracking-wider text-[11px]">
                      Strategic Proposal Title
                    </label>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-semibold text-slate-800">
                      Enterprise Tier Restructuring (+25% Price Adjustment Rehearsal)
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1.5 uppercase tracking-wider text-[11px]">
                      Strategic Hypothesis & Decision
                    </label>
                    <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 font-medium text-indigo-900 leading-relaxed min-h-[70px]">
                      {typedProposal || "Typing proposal..."}
                      <span className="inline-block w-1.5 h-4 bg-indigo-600 ml-1 animate-pulse align-middle" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>CRM Lookback Horizon</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">12 Months</span>
                      <span className="text-[10px] text-slate-400 block">Samples past won/lost deals</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] mb-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>Swarm Scale</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">20 Autonomous Personas</span>
                      <span className="text-[10px] text-slate-400 block">Buyers, competitors & regulators</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Simulation Rounds</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">3 Rounds (24h Diurnal)</span>
                      <span className="text-[10px] text-slate-400 block">Models day-to-night cycles</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={handleNextStep}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to Pre-Flight Estimator</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: Pre-Flight Safety Estimator */}
          {currentStep === 2 && (
            <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300 py-6">
              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">Pre-Flight Resource & Safety Estimator</h3>
                      <p className="text-xs text-slate-500">Calculate token volume & verify safety caps before any LLM execution</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Step 2 of 6
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block">Input Volume</span>
                    <span className="text-lg font-black text-slate-900 mt-1 block">~42,500</span>
                    <span className="text-[10px] text-slate-400">Ontology + Personas</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block">Turns Generated</span>
                    <span className="text-lg font-black text-indigo-600 mt-1 block">~48 Calls</span>
                    <span className="text-[10px] text-slate-400">Filtered by diurnal sleep</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block">DeepSeek Cost</span>
                    <span className="text-lg font-black text-emerald-600 mt-1 block">€0.012</span>
                    <span className="text-[10px] text-slate-400">€0.28 / 1M tokens</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block">GPT-5.6 Luna Cost</span>
                    <span className="text-lg font-black text-purple-600 mt-1 block">€0.011</span>
                    <span className="text-[10px] text-slate-400">Cost-optimized speed</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Pre-Flight Safety Checks Verified</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-emerald-900">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Budget Quota Capped at €5.00</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>PII Stripped & Anonymized</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Diurnal Sleep Filter Active</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center">
                  <button
                    onClick={handlePrevStep}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    ← Back to Scenario
                  </button>
                  <button
                    onClick={handleNextStep}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>Authorize & Synthesize Swarm Personas</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 3: Swarm Persona Synthesis */}
          {currentStep === 3 && (
            <div className="flex-1 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
                
                {/* Persona Ingestion Feed */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 flex flex-col h-[520px] min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        CRM Persona Ingestion Stream ({DEMO_AGENTS.length} Agents)
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Grounded in Deals
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pt-3 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                    {DEMO_AGENTS.map((agent, i) => (
                      <div 
                        key={agent.id} 
                        className="p-3 bg-slate-50/70 hover:bg-white border border-slate-200/80 rounded-2xl shadow-xs transition duration-200 animate-in fade-in slide-in-from-left duration-300 flex flex-col space-y-1.5"
                        style={{ animationDelay: `${i * 120}ms` }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                              agent.stance === 'opposing' ? 'bg-rose-500' : agent.stance === 'supportive' ? 'bg-emerald-600' : 'bg-slate-600'
                            }`}>
                              {agent.displayName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{agent.displayName}</div>
                              <div className="text-[10.5px] text-slate-500 truncate">{agent.profession}</div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase shrink-0 ${
                            agent.stance === 'opposing' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : agent.stance === 'supportive'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {agent.stance}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 pl-10 leading-relaxed italic">
                          "{agent.userChar}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dynamic Swarm Knowledge Graph */}
                <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 flex flex-col h-[520px] min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Dynamic Knowledge Graph & Relationship Edges
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                      5 Nodes / 4 Dynamic Edges
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 mt-3 rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50 flex flex-col">
                    <SwarmGraphCanvas graph={DEMO_GRAPH} activeEntityId="node_procurement" className="w-full h-full min-h-0" />
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* STAGE 4: Autonomous Live War Room */}
          {currentStep === 4 && (
            <div className="flex-1 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
              {/* Simulation Header Status Bar */}
              <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
                    <Play className="w-5 h-5 fill-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Stage 4: Autonomous Market Rehearsal Running</h3>
                    <p className="text-xs text-slate-500">Personas interact, debate, and react to proposed changes in real-time</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Simulation Time</span>
                    <span className="font-bold text-slate-700">14:00 CET</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Viral Index</span>
                    <span className="font-bold text-purple-600">{currentMetric.viralIndex}%</span>
                  </div>
                </div>
              </div>

              {/* Feed & Graph Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
                {/* Live Feed Stream */}
                <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex flex-col h-[500px] min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                      Autonomous Social Stream ({warRoomPosts.length} Posts)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">Auto-streaming</span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pt-3 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                    {[...warRoomPosts].reverse().map(post => (
                      <div 
                        key={post.id} 
                        className="p-3.5 bg-slate-50/70 hover:bg-white border border-slate-200/80 rounded-2xl shadow-xs transition duration-200 animate-in fade-in slide-in-from-top-2 duration-300 group flex flex-col space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {post.agentName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition truncate">{post.agentName}</span>
                              <span className="text-[10px] text-slate-400 font-mono ml-1.5 truncate">@{post.agentUsername}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                            post.sentimentScore > 0.2 ? 'bg-emerald-50 text-emerald-700' : post.sentimentScore < -0.2 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {post.sentimentScore > 0.2 ? 'Supportive' : post.sentimentScore < -0.2 ? 'Opposing' : 'Neutral'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 mt-1 leading-relaxed">
                          <Markdown content={post.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Graph Canvas */}
                <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-3 flex flex-col h-[500px] min-h-0 overflow-hidden">
                  <SwarmGraphCanvas graph={DEMO_GRAPH} activeEntityId="node_procurement" className="w-full h-full min-h-0" />
                </div>
              </div>
            </div>
          )}

          {/* STAGE 5: Strategy Synthesis */}
          {currentStep === 5 && (
            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300 py-10 text-center">
              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-500 mx-auto flex items-center justify-center text-white shadow-xl">
                  <Brain className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900">Chief Intelligence Analyst Synthesis</h3>
                  <p className="text-xs text-slate-500">Synthesizing dialogue across 3 rounds into strategic insights & rebuttals</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200 p-0.5">
                  <div 
                    className="bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-200"
                    style={{ width: `${synthesisProgress}%` }}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left text-xs">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Failure Points</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Downtime penalties & Frankfurt data sovereignty identified.</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Competitor Moves</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">David Chen FUD migration discount retaliations mapped.</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Sales Scripts</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Turn-key sales rebuttals synthesized for account reps.</p>
                  </div>
                </div>

                <button
                  onClick={handleNextStep}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>View Executive Results & Chatbot</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 6: Complete Results & Persistent Right-Side Chatbot */}
          {currentStep === 6 && (
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <StrategicReportView
                report={DEMO_STRATEGIC_REPORT}
                agents={DEMO_AGENTS}
                posts={DEMO_POSTS}
                hypothesis="Enterprise tier restructuring with +25% price increase, 99.9% SLA, and dedicated WhatsApp support."
                isDemoMode={true}
                onOpenAgentDirectory={() => handleSelectStep(4)}
              />
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
