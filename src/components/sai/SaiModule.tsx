import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Plus, 
  Play, 
  Trash2, 
  FileText, 
  Activity, 
  Users, 
  Clock, 
  ChevronRight, 
  BrainCircuit, 
  MessageSquare,
  Zap,
  Bookmark,
  Edit3
} from 'lucide-react';
import FlockIcon from '../icons/FlockIcon';
import type { 
  SimulationParameters, 
  SwarmKnowledgeGraph, 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmRoundMetrics, 
  StrategicReport, 
  SimulationCheckpoint 
} from '../../utils/swarm/types';
import { fetchCrmContext } from '../../utils/swarm/crmContextService';
import { buildKnowledgeGraph } from '../../utils/swarm/ontologyBuilder';
import { synthesizeAgentProfiles } from '../../utils/swarm/personaSynthesizer';
import { SwarmSimulationEngine } from '../../utils/swarm/simulationLoop';
import { generateStrategicReport } from '../../utils/swarm/reportSynthesizer';
import { 
  initServerSimulation, 
  listPastSimulations, 
  fetchResumeCheckpoint, 
  deleteServerSimulation,
  saveRoundCheckpoint
} from '../../utils/swarm/checkpointClient';
import { 
  DEMO_SIMULATION_CHECKPOINT,
  DEMO_GRAPH,
  DEMO_AGENTS,
  DEMO_POSTS,
  DEMO_METRICS_HISTORY,
  DEMO_STRATEGIC_REPORT
} from '../../utils/swarm/demoData';
import { CreateRehearsalView, type DraftData } from './CreateRehearsalView';
import { LiveWarRoom } from './LiveWarRoom';
import { StrategicReportView } from './StrategicReportView';
import { QaAssistantDrawer } from './QaAssistantDrawer';
import { GuidedDemoWalkthrough } from './GuidedDemoWalkthrough';

interface SaiModuleProps {
  isDemoMode?: boolean;
}

export const SaiModule: React.FC<SaiModuleProps> = ({ isDemoMode = false }) => {
  // Navigation & View State
  const [demoModeActive, setDemoModeActive] = useState<boolean>(isDemoMode);
  const [activeView, setActiveView] = useState<'list' | 'create' | 'running' | 'report'>('list');
  const [pastSimulations, setPastSimulations] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [editingDraftData, setEditingDraftData] = useState<DraftData | null>(null);
  const [isGuidedDemoOpen, setIsGuidedDemoOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isDemoMode) {
      setDemoModeActive(true);
    }
  }, [isDemoMode]);

  // Active Simulation Runtime State
  const [activeSimulationId, setActiveSimulationId] = useState<string>('');
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [activeHypothesis, setActiveHypothesis] = useState<string>('');
  const [, setActiveSeed] = useState<string>('');
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [totalRounds, setTotalRounds] = useState<number>(8);
  const [graph, setGraph] = useState<SwarmKnowledgeGraph>({ nodes: [], edges: [] });
  const [agents, setAgents] = useState<SwarmAgentProfile[]>([]);
  const [posts, setPosts] = useState<SwarmPost[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<SwarmRoundMetrics | null>(null);
  const [, setMetricsHistory] = useState<SwarmRoundMetrics[]>([]);
  const [activeReport, setActiveReport] = useState<StrategicReport | null>(null);

  // Runtime Controls & Progress
  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(false);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [prepStepMessage, setPrepStepMessage] = useState<string>('');
  const engineRef = useRef<SwarmSimulationEngine | null>(null);

  // QA / Interrogation Drawer
  const [isQaOpen, setIsQaOpen] = useState<boolean>(false);
  const [interviewAgent, setInterviewAgent] = useState<SwarmAgentProfile | null>(null);

  // Initial load
  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    setLoadingList(true);
    try {
      const list = await listPastSimulations();
      setPastSimulations(list);
    } catch (err) {
      console.error('Failed to load past simulations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  // Load Pre-computed Demo Simulation
  const handleLoadDemoSimulation = () => {
    setActiveSimulationId(DEMO_SIMULATION_CHECKPOINT.simulationId);
    setActiveTitle(DEMO_SIMULATION_CHECKPOINT.title);
    setActiveHypothesis(DEMO_SIMULATION_CHECKPOINT.hypothesis);
    setActiveSeed(
      "Enterprise tier restructuring: +25% price increase, 99.9% uptime SLA, direct WhatsApp developer support, and 6-month grandfathering grace period."
    );
    setCurrentRound(DEMO_SIMULATION_CHECKPOINT.currentRound);
    setTotalRounds(DEMO_SIMULATION_CHECKPOINT.totalRounds);
    setGraph(DEMO_GRAPH);
    setAgents(DEMO_AGENTS);
    setPosts(DEMO_POSTS);
    setMetricsHistory(DEMO_METRICS_HISTORY);
    setLatestMetrics(DEMO_METRICS_HISTORY[DEMO_METRICS_HISTORY.length - 1]);
    setActiveReport(DEMO_STRATEGIC_REPORT);
    setActiveView('report');
  };

  // Start a fresh new rehearsal
  const handleStartNewRehearsal = () => {
    setEditingDraftData(null);
    setActiveView('create');
  };

  // Open an existing draft in the create view
  const handleOpenDraft = (sim: any) => {
    setEditingDraftData({
      id: sim.id,
      title: sim.title,
      hypothesis: sim.hypothesis,
      seed_document: sim.seed_document || '',
      lookback_months: sim.lookback_months ? Number(sim.lookback_months) : 12,
      swarm_scale: sim.swarm_scale ? Number(sim.swarm_scale) : 30,
      total_rounds: sim.total_rounds ? Number(sim.total_rounds) : 8,
      status: 'draft'
    });
    setActiveView('create');
  };

  // Launch New Simulation Rehearsal (optionally continuing an existing draft)
  const handleLaunchSimulation = async (config: SimulationParameters, existingDraftId?: string) => {
    setEditingDraftData(null);
    setIsPreparing(true);
    setActiveView('running');

    // Demo Mode Fast Execution Path
    if (demoModeActive) {
      try {
        const demoSimId = existingDraftId || `demo-sim-${Date.now()}`;
        setActiveSimulationId(demoSimId);
        setActiveTitle(config.title);
        setActiveHypothesis(config.hypothesis);
        setActiveSeed(config.seedDocument);
        setTotalRounds(config.totalRounds);
        setCurrentRound(0);
        setPosts([]);
        setMetricsHistory([]);
        setActiveReport(null);

        // Step 1: Prep phase 1
        setPrepStepMessage(`[Demo Mode] Extracting CRM context (${config.lookbackMonths}-month horizon)...`);
        await new Promise(r => setTimeout(r, 600));

        // Step 2: Prep phase 2
        setPrepStepMessage('[Demo Mode] Synthesizing dynamic knowledge graph & stakeholder entities...');
        await new Promise(r => setTimeout(r, 600));
        setGraph(DEMO_GRAPH);

        // Step 3: Prep phase 3
        setPrepStepMessage(`[Demo Mode] Synthesizing ${config.swarmScale} autonomous buyer & competitor personas...`);
        await new Promise(r => setTimeout(r, 600));
        setAgents(DEMO_AGENTS);

        setIsPreparing(false);
        setIsEngineRunning(true);

        // Step 4: Simulate rounds
        const roundsToRun = Math.min(config.totalRounds, 3);
        for (let r = 1; r <= roundsToRun; r++) {
          await new Promise(res => setTimeout(res, 1200));
          setCurrentRound(r);
          const roundPosts = DEMO_POSTS.filter(p => p.roundNum === r);
          setPosts(prev => [...prev, ...roundPosts]);
          const metrics = DEMO_METRICS_HISTORY[r - 1] || DEMO_METRICS_HISTORY[0];
          setLatestMetrics(metrics);
          setMetricsHistory(prev => [...prev, metrics]);
        }

        setIsEngineRunning(false);
        setPrepStepMessage('[Demo Mode] Chief Intelligence Analyst compiling Strategic Rehearsal Briefing...');
        setIsPreparing(true);
        await new Promise(r => setTimeout(r, 800));

        setActiveReport(DEMO_STRATEGIC_REPORT);
        setIsPreparing(false);
        setActiveView('report');
        return;
      } catch (err) {
        console.error('Demo simulation error:', err);
        setIsPreparing(false);
        setIsEngineRunning(false);
        return;
      }
    }

    try {
      // Step 1: Initialize record on server
      setPrepStepMessage('Initializing dedicated database shard on server...');
      const initRes = await initServerSimulation({
        id: existingDraftId,
        title: config.title,
        hypothesis: config.hypothesis,
        seed_document: config.seedDocument,
        lookback_months: config.lookbackMonths,
        swarm_scale: config.swarmScale,
        total_rounds: config.totalRounds,
        status: 'prepared'
      });
      const simId = initRes.id;
      setActiveSimulationId(simId);
      setActiveTitle(config.title);
      setActiveHypothesis(config.hypothesis);
      setActiveSeed(config.seedDocument);
      setTotalRounds(config.totalRounds);
      setCurrentRound(0);
      setPosts([]);
      setMetricsHistory([]);
      setActiveReport(null);

      // Step 2: Extract CRM Context with Lookback Window
      setPrepStepMessage(`Extracting leads & deal objections from CRM (${config.lookbackMonths}-month horizon)...`);
      const crmContext = await fetchCrmContext(config.lookbackMonths);

      // Step 3: Extract Ontology & Graph Nodes
      setPrepStepMessage('Synthesizing dynamic knowledge graph & social stakeholder entities...');
      const generatedGraph = await buildKnowledgeGraph(
        config.seedDocument,
        crmContext.formatted_context,
        config.hypothesis,
        config.llmModel
      );
      setGraph(generatedGraph);

      // Step 4: Synthesize Agent Personas
      setPrepStepMessage(`Synthesizing ${config.swarmScale} autonomous buyer & competitor personas...`);
      const generatedAgents = await synthesizeAgentProfiles(
        generatedGraph.nodes,
        config.swarmScale,
        config.hypothesis,
        config.llmModel
      );
      setAgents(generatedAgents);

      setIsPreparing(false);
      setIsEngineRunning(true);

      // Step 5: Instantiate and run the Simulation Engine
      const engine = new SwarmSimulationEngine({
        simulationId: simId,
        title: config.title,
        hypothesis: config.hypothesis,
        totalRounds: config.totalRounds,
        diurnalCycle: config.diurnalCycle,
        modelName: config.llmModel,
        initialGraph: generatedGraph,
        agents: generatedAgents
      });
      engineRef.current = engine;

      await engine.start(async (progress) => {
        setCurrentRound(progress.currentRound);
        setLatestMetrics(progress.metrics);
        setGraph({ ...progress.updatedGraph });
        setPosts(prev => [...prev, ...progress.newPosts]);
      });

      // Simulation finished, generate final ReAct strategic briefing
      setIsEngineRunning(false);
      setPrepStepMessage('Chief Intelligence Analyst compiling Strategic Rehearsal Briefing...');
      setIsPreparing(true);

      const report = await generateStrategicReport({
        title: config.title,
        hypothesis: config.hypothesis,
        seedDocument: config.seedDocument,
        graph: generatedGraph,
        agents: generatedAgents,
        posts: engineRef.current ? (engineRef.current as any).posts : [],
        modelName: config.llmModel
      });

      setActiveReport(report);
      setIsPreparing(false);
      setActiveView('report');

      // Final save of report into checkpoint
      const finalSnapshot: SimulationCheckpoint = {
        simulationId: simId,
        title: config.title,
        hypothesis: config.hypothesis,
        currentRound: config.totalRounds,
        totalRounds: config.totalRounds,
        status: 'completed',
        graph: generatedGraph,
        agents: generatedAgents,
        posts: engineRef.current ? (engineRef.current as any).posts : [],
        metricsHistory: engineRef.current ? (engineRef.current as any).metricsHistory : [],
        finalReport: report
      };
      await saveRoundCheckpoint(simId, config.totalRounds, finalSnapshot, []);
      loadSimulations();

    } catch (err: any) {
      console.error('Simulation execution failed:', err);
      alert(`Simulation failed: ${err?.message || 'Network error'}`);
      setIsPreparing(false);
      setIsEngineRunning(false);
    }
  };

  // Open past simulation
  const handleOpenPastSimulation = async (sim: any) => {
    if (sim.status === 'draft') {
      handleOpenDraft(sim);
      return;
    }

    try {
      const checkpoint = await fetchResumeCheckpoint(sim.id);
      if (!checkpoint) {
        alert('Could not load simulation details from server.');
        return;
      }

      setActiveSimulationId(checkpoint.simulationId || sim.id);
      setActiveTitle(checkpoint.title || sim.title);
      setActiveHypothesis(checkpoint.hypothesis || sim.hypothesis);
      setCurrentRound(checkpoint.currentRound || 0);
      setTotalRounds(checkpoint.totalRounds || sim.total_rounds || 8);
      setGraph(checkpoint.graph || { nodes: [], edges: [] });
      setAgents(checkpoint.agents || []);
      setPosts(checkpoint.posts || []);
      setMetricsHistory(checkpoint.metricsHistory || []);
      setLatestMetrics(
        checkpoint.metricsHistory && checkpoint.metricsHistory.length > 0
          ? checkpoint.metricsHistory[checkpoint.metricsHistory.length - 1]
          : null
      );

      if (checkpoint.finalReport) {
        setActiveReport(checkpoint.finalReport);
        setActiveView('report');
      } else {
        setActiveReport(null);
        setActiveView('running');
      }
    } catch (err) {
      console.error('Error opening simulation:', err);
    }
  };

  // Delete past simulation
  const handleDeleteSimulation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this rehearsal and drop its database tables?')) {
      return;
    }

    try {
      const ok = await deleteServerSimulation(id);
      if (ok) {
        setPastSimulations(prev => prev.filter(s => s.id !== id));
        if (activeSimulationId === id) {
          setActiveView('list');
        }
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleStopSimulation = () => {
    if (engineRef.current) {
      engineRef.current.stop();
      setIsEngineRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      
      {/* Top Navigation Bar */}
      <header className="px-6 py-4 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 via-indigo-600 to-emerald-400 flex items-center justify-center shadow-md text-white">
            <FlockIcon size={22} className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold bg-gradient-to-r from-purple-700 via-indigo-700 to-emerald-600 bg-clip-text text-transparent">
                SAI
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                Swarm Artificial Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Multi-Agent Predictive Market Rehearsal Grounded in Real CRM History
            </p>
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setActiveView('list')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                activeView === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Rehearsals
            </button>
            {activeView === 'create' && (
              <button
                className="px-3 py-1.5 rounded-xl bg-white text-purple-700 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                <span>{editingDraftData?.id ? 'Edit Draft' : 'New Rehearsal'}</span>
              </button>
            )}
            {activeSimulationId && (
              <button
                onClick={() => setActiveView('running')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                  activeView === 'running' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                <span>War Room</span>
              </button>
            )}
            {activeSimulationId && activeReport && (
              <button
                onClick={() => setActiveView('report')}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                  activeView === 'report' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Strategic Briefing</span>
              </button>
            )}
          </div>

          {activeSimulationId && (
            <button
              onClick={() => {
                setInterviewAgent(null);
                setIsQaOpen(true);
              }}
              className="px-3 py-2 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-purple-600" />
              <span>Ask Analyst / Agents</span>
            </button>
          )}

          {/* Demo Mode Toggle & Quick Loader */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDemoModeActive(!demoModeActive)}
              className={`px-3 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                demoModeActive
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
              title="Toggle interactive demonstration mode (runs local simulation with no API costs)"
            >
              <Zap className={`w-3.5 h-3.5 ${demoModeActive ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'}`} />
              <span>Demo Mode: {demoModeActive ? 'ON' : 'OFF'}</span>
            </button>

            {demoModeActive && (
              <button
                onClick={() => setIsGuidedDemoOpen(true)}
                className="px-3 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                title="Watch animated step-by-step demonstration of the full simulation workflow"
              >
                <Sparkles className="w-3.5 h-3.5 fill-white" />
                <span className="hidden sm:inline">Guided Process Demo</span>
              </button>
            )}
          </div>

          {activeView !== 'create' && (
            <button
              onClick={handleStartNewRehearsal}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Rehearsal</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        
        {/* Preparation Banner */}
        {isPreparing && (
          <div className="mb-6 p-6 rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white shadow-xl flex items-center gap-4 animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <BrainCircuit className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Cognitive Swarm Orchestration
              </div>
              <div className="text-base font-bold text-white mt-0.5">
                {prepStepMessage || 'Preparing simulation components...'}
              </div>
              <div className="text-xs text-slate-300 mt-1">
                Please remain on this screen. Client-side state is synchronizing round checkpoints to MySQL.
              </div>
            </div>
          </div>
        )}

        {/* View 1: Rehearsals List / Dashboard */}
        {activeView === 'list' && (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Hero Card */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-900 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-emerald-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  Grounded in Live CRM Lead History
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Rehearse Major Strategic Moves Before Announcing Them
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed font-normal">
                  SAI spawns dozens of autonomous buyer and competitor personas, populating a real-time social simulation. 
                  Identify market polarization, uncover sales objections, and get a step-by-step strategy to achieve your target goal.
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleStartNewRehearsal}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Launch New Market Rehearsal</span>
                  </button>
                </div>
              </div>
              <div className="absolute right-4 bottom-2 opacity-15 pointer-events-none">
                <FlockIcon size={320} className="w-80 h-80 text-white" />
              </div>
            </div>

            {/* Interactive Demo Showcase Card */}
            {demoModeActive && (
              <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white shadow-xl border border-emerald-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
                    <Zap className="w-6 h-6 fill-emerald-400 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">
                        Interactive Demo: Q4 Enterprise Pricing Restructuring
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                        Zero Token Cost
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      Examine a pre-computed multi-round rehearsal (+25% price increase, 99.9% uptime SLA, direct WhatsApp developer bridge). Test the War Room, Strategic Briefing, and Q&A Drawer.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center shrink-0">
                  <button
                    onClick={() => setIsGuidedDemoOpen(true)}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Watch Full Process Walkthrough (6 Steps)</span>
                  </button>
                  <button
                    onClick={handleLoadDemoSimulation}
                    className="px-4 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Jump to Final Results</span>
                  </button>
                </div>
              </div>
            )}

            {/* Past Rehearsals List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  Past Strategic Rehearsals
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {pastSimulations.length} total runs
                </span>
              </div>

              {loadingList ? (
                <div className="p-12 text-center text-slate-400">
                  <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                  <p className="text-xs font-medium">Loading rehearsals from database...</p>
                </div>
              ) : pastSimulations.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-300 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                    <FlockIcon size={24} className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No Simulations Yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Create your first rehearsal to simulate market reaction to price changes, new tier launches, or competitive positioning.
                  </p>
                  <button
                    onClick={handleStartNewRehearsal}
                    className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow hover:bg-purple-700 transition cursor-pointer"
                  >
                    Create Simulation
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pastSimulations.map((sim) => {
                    const isDraft = sim.status === 'draft';
                    return (
                      <div
                        key={sim.id}
                        onClick={() => isDraft ? handleOpenDraft(sim) : handleOpenPastSimulation(sim)}
                        className={`p-5 rounded-3xl bg-white border transition cursor-pointer flex flex-col justify-between group ${
                          isDraft 
                            ? 'border-amber-300 hover:border-amber-400 hover:shadow-lg bg-gradient-to-br from-white to-amber-50/20' 
                            : 'border-slate-200/90 hover:border-purple-400 hover:shadow-lg'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                              sim.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isDraft
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}>
                              {isDraft && <Bookmark className="w-3 h-3 text-amber-700" />}
                              {sim.status}
                            </span>
                            <button
                              onClick={(e) => handleDeleteSimulation(e, sim.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title={isDraft ? "Delete draft" : "Delete rehearsal"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div>
                            <h4 className={`text-sm font-bold transition line-clamp-1 ${
                              isDraft ? 'text-slate-900 group-hover:text-amber-700' : 'text-slate-900 group-hover:text-purple-600'
                            }`}>
                              {sim.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-normal">
                              {sim.hypothesis}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400 font-medium">
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {sim.swarm_scale} agents
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {sim.current_round} / {sim.total_rounds} rounds
                            </span>
                          </div>
                        </div>

                        <div className={`pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold ${
                          isDraft ? 'text-amber-700 group-hover:text-amber-800' : 'text-purple-600 group-hover:text-purple-700'
                        }`}>
                          <span>{isDraft ? 'Resume & Edit Draft' : sim.status === 'completed' ? 'View Executive Briefing' : 'Enter War Room'}</span>
                          <ChevronRight className="w-4 h-4 transition group-hover:translate-x-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* View: Create / Edit Rehearsal Full Page View */}
        {activeView === 'create' && (
          <CreateRehearsalView
            initialData={editingDraftData}
            onBack={() => {
              setActiveView('list');
              setEditingDraftData(null);
            }}
            onLaunch={handleLaunchSimulation}
            onDraftSaved={() => {
              loadSimulations();
            }}
            isSubmitting={isPreparing}
            isDemoMode={demoModeActive}
          />
        )}

        {/* View 2: Live War Room */}
        {activeView === 'running' && (
          <div className="h-[calc(100vh-140px)]">
            <LiveWarRoom
              title={activeTitle}
              currentRound={currentRound}
              totalRounds={totalRounds}
              graph={graph}
              agents={agents}
              posts={posts}
              latestMetrics={latestMetrics}
              isRunning={isEngineRunning}
              onStop={handleStopSimulation}
            />
          </div>
        )}

        {/* View 3: Strategic Report View */}
        {activeView === 'report' && activeReport && (
          <StrategicReportView
            report={activeReport}
            agents={agents}
            posts={posts}
            hypothesis={activeHypothesis}
            isDemoMode={demoModeActive}
            onOpenQaDrawer={() => {
              const el = document.getElementById('sai-interrogation-input');
              if (el) {
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            onOpenAgentDirectory={() => {
              setActiveView('running');
            }}
          />
        )}

      </div>

      {/* Slide-out QA Assistant Drawer (for War Room / other non-report views) */}
      {activeView !== 'report' && (
        <QaAssistantDrawer
          isOpen={isQaOpen}
          onClose={() => setIsQaOpen(false)}
          report={activeReport}
          agents={agents}
          posts={posts}
          hypothesis={activeHypothesis}
          initialAgent={interviewAgent}
          isDemoMode={demoModeActive}
        />
      )}

      {/* Interactive Guided Process Demo Walkthrough Modal */}
      <GuidedDemoWalkthrough
        isOpen={isGuidedDemoOpen}
        onClose={() => setIsGuidedDemoOpen(false)}
        onStartRealRehearsal={() => {
          setIsGuidedDemoOpen(false);
          handleStartNewRehearsal();
        }}
      />

    </div>
  );
};

export default SaiModule;
