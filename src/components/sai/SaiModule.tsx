import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Database 
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
  fetchSimulationDetails,
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
import { SimulationStepsBar } from './SimulationStepsBar';

interface SaiModuleProps {
  isDemoMode?: boolean;
  unifiedEntries?: any[];
}

export const SaiModule: React.FC<SaiModuleProps> = ({ isDemoMode = false, unifiedEntries = [] }) => {
  // Navigation & View State
  const [demoModeActive, setDemoModeActive] = useState<boolean>(isDemoMode);
  const [activeIsDemo, setActiveIsDemo] = useState<boolean>(isDemoMode);
  const [activeView, setActiveView] = useState<'list' | 'create' | 'running' | 'report'>('list');
  const [pastSimulations, setPastSimulations] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [editingDraftData, setEditingDraftData] = useState<DraftData | null>(null);
  const [isGuidedDemoOpen, setIsGuidedDemoOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isDemoMode) {
      setDemoModeActive(true);
      setActiveIsDemo(true);
    }
  }, [isDemoMode]);

  // Active Simulation Runtime State
  const [activeSimulationId, setActiveSimulationId] = useState<string>('');
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [activeHypothesis, setActiveHypothesis] = useState<string>('');
  const [activeSeed, setActiveSeed] = useState<string>('');
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

  // URL Hash Navigation Synchronizer
  const isInternalHashUpdateRef = useRef(false);

  const navigateView = (
    view: 'list' | 'create' | 'running' | 'report',
    opts?: { id?: string; draftId?: string; isDemo?: boolean; replace?: boolean }
  ) => {
    setActiveView(view);

    let newHash = 'sai';
    if (opts?.isDemo) {
      newHash = 'sai/demo';
    } else if (view === 'create') {
      newHash = opts?.draftId ? `sai/create?draftId=${opts.draftId}` : 'sai/create';
    } else if (view === 'running') {
      const targetId = opts?.id || activeSimulationId;
      newHash = targetId ? `sai/war-room?id=${targetId}` : 'sai/war-room';
    } else if (view === 'report') {
      const targetId = opts?.id || activeSimulationId;
      newHash = targetId ? `sai/report?id=${targetId}` : 'sai/report';
    } else {
      newHash = 'sai';
    }

    const currentHash = window.location.hash.replace(/^#/, '');
    if (currentHash !== newHash) {
      isInternalHashUpdateRef.current = true;
      if (opts?.replace) {
        window.history.replaceState(null, '', `#${newHash}`);
      } else {
        window.location.hash = newHash;
      }
    }
  };

  // Initial load
  useEffect(() => {
    loadSimulations();
  }, []);

  // Reset scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    });
    scrollables.forEach(el => el.scrollTo(0, 0));
  }, [activeView]);

  // Listen to hash changes for deep linking and browser Back/Forward navigation
  useEffect(() => {
    const syncFromHash = async () => {
      if (isInternalHashUpdateRef.current) {
        isInternalHashUpdateRef.current = false;
        return;
      }

      const rawHash = window.location.hash.replace(/^#/, '');
      if (!rawHash.startsWith('sai')) {
        return;
      }

      const [pathPart, queryPart] = rawHash.split('?');
      const segments = pathPart.split('/').filter(Boolean);
      const subView = segments[1] || 'list';
      const params = new URLSearchParams(queryPart || '');
      const id = params.get('id') || undefined;
      const draftId = params.get('draftId') || undefined;

      if (subView === 'demo') {
        setIsGuidedDemoOpen(true);
        return;
      } else {
        setIsGuidedDemoOpen(false);
      }

      if (subView === 'create' || subView === 'new') {
        const targetDraftId = draftId || (id && id !== 'create' && id !== 'new' ? id : '');
        if (targetDraftId) {
          try {
            const simDetails = await fetchSimulationDetails(targetDraftId);
            if (simDetails) {
              const cp = (simDetails.checkpoint && typeof simDetails.checkpoint === 'object' && !Array.isArray(simDetails.checkpoint))
                ? simDetails.checkpoint
                : {};
              setEditingDraftData({
                id: simDetails.id || targetDraftId,
                title: simDetails.title || cp.title,
                hypothesis: simDetails.hypothesis || cp.hypothesis,
                seed_document: simDetails.seed_document || cp.seed_document || '',
                lookback_months: simDetails.lookback_months ? Number(simDetails.lookback_months) : (cp.lookback_months ? Number(cp.lookback_months) : 12),
                crm_data_sources: Array.isArray(simDetails.crm_data_sources) ? simDetails.crm_data_sources : (Array.isArray(cp.crm_data_sources) ? cp.crm_data_sources : undefined),
                context_documents: Array.isArray(simDetails.context_documents) ? simDetails.context_documents : (Array.isArray(cp.context_documents) ? cp.context_documents : undefined),
                swarm_scale: simDetails.swarm_scale ? Number(simDetails.swarm_scale) : (cp.swarm_scale ? Number(cp.swarm_scale) : 30),
                total_rounds: simDetails.total_rounds ? Number(simDetails.total_rounds) : (cp.total_rounds ? Number(cp.total_rounds) : 8),
                model_name: simDetails.model_name || cp.model_name || 'gpt-5.6-luna',
                diurnal_cycle: simDetails.diurnal_cycle !== undefined ? simDetails.diurnal_cycle : (cp.diurnal_cycle ?? true),
                status: 'draft'
              });
            } else {
              setEditingDraftData(null);
            }
          } catch (e) {
            console.error('Error loading draft from hash:', e);
            setEditingDraftData(null);
          }
        } else {
          setEditingDraftData(null);
        }
        setActiveView('create');
      } else if (subView === 'war-room' || subView === 'running' || subView === 'live') {
        if (id && id !== activeSimulationId) {
          if (id === DEMO_SIMULATION_CHECKPOINT.simulationId || id.startsWith('demo-')) {
            handleLoadDemoSimulation(false);
            setActiveView('running');
          } else {
            await handleOpenPastSimulation({ id, title: 'Simulation', status: 'running' }, false);
          }
        } else if (!id && !activeSimulationId) {
          if (demoModeActive) {
            handleLoadDemoSimulation(false);
            setActiveView('running');
          } else {
            navigateView('list');
          }
        } else {
          setActiveView('running');
        }
      } else if (subView === 'report' || subView === 'briefing' || subView === 'results') {
        if (id && id !== activeSimulationId) {
          if (id === DEMO_SIMULATION_CHECKPOINT.simulationId || id.startsWith('demo-')) {
            handleLoadDemoSimulation(false);
            setActiveView('report');
          } else {
            await handleOpenPastSimulation({ id, title: 'Simulation', status: 'completed' }, false);
          }
        } else if (!id && !activeSimulationId) {
          if (demoModeActive) {
            handleLoadDemoSimulation(false);
            setActiveView('report');
          } else {
            navigateView('list');
          }
        } else {
          setActiveView('report');
        }
      } else {
        setActiveView('list');
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [activeSimulationId]);

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
  const handleLoadDemoSimulation = (shouldUpdateHash = true) => {
    setActiveIsDemo(true);
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
    if (shouldUpdateHash) {
      navigateView('report', { id: DEMO_SIMULATION_CHECKPOINT.simulationId });
    } else {
      setActiveView('report');
    }
  };

  // Start a fresh new rehearsal
  const handleStartNewRehearsal = () => {
    setEditingDraftData(null);
    navigateView('create');
  };

  // Open an existing draft in the create view
  const handleOpenDraft = (sim: any, shouldUpdateHash = true) => {
    const cp = (sim.checkpoint && typeof sim.checkpoint === 'object' && !Array.isArray(sim.checkpoint)) ? sim.checkpoint : {};
    setEditingDraftData({
      id: sim.id,
      title: sim.title || cp.title,
      hypothesis: sim.hypothesis || cp.hypothesis,
      seed_document: sim.seed_document || cp.seed_document || '',
      lookback_months: sim.lookback_months ? Number(sim.lookback_months) : (cp.lookback_months ? Number(cp.lookback_months) : 12),
      crm_data_sources: Array.isArray(sim.crm_data_sources) ? sim.crm_data_sources : (Array.isArray(cp.crm_data_sources) ? cp.crm_data_sources : undefined),
      context_documents: Array.isArray(sim.context_documents) ? sim.context_documents : (Array.isArray(cp.context_documents) ? cp.context_documents : undefined),
      swarm_scale: sim.swarm_scale ? Number(sim.swarm_scale) : (cp.swarm_scale ? Number(cp.swarm_scale) : 30),
      total_rounds: sim.total_rounds ? Number(sim.total_rounds) : (cp.total_rounds ? Number(cp.total_rounds) : 8),
      model_name: sim.model_name || cp.model_name || 'gpt-5.6-luna',
      diurnal_cycle: sim.diurnal_cycle !== undefined ? sim.diurnal_cycle : (cp.diurnal_cycle ?? true),
      status: 'draft'
    });
    if (shouldUpdateHash) {
      navigateView('create', { draftId: sim.id });
    } else {
      setActiveView('create');
    }
  };

  // Launch New Simulation Rehearsal (optionally continuing an existing draft)
  const handleLaunchSimulation = async (config: SimulationParameters, existingDraftId?: string) => {
    setEditingDraftData(null);
    setIsPreparing(true);

    const isLive = config.executionMode === 'live' || (!demoModeActive && config.executionMode !== 'demo');
    setActiveIsDemo(!isLive);

    // Demo Mode Fast Execution Path (Syntetický test)
    if (!isLive) {
      try {
        const demoSimId = existingDraftId || `demo-sim-${Date.now()}`;
        setActiveSimulationId(demoSimId);
        navigateView('running', { id: demoSimId });
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
        const activeSrcCount = config.crmDataSources ? config.crmDataSources.length : 8;
        setPrepStepMessage(`[Demo režim] Extrakcia CRM kontextu (${config.lookbackMonths}-mesačný horizont, ${activeSrcCount} aktívnych zdrojov)...`);
        await new Promise(r => setTimeout(r, 600));

        // Step 2: Prep phase 2
        setPrepStepMessage('[Demo režim] Syntéza dynamického grafu znalostí a entít stakeholderov...');
        await new Promise(r => setTimeout(r, 600));
        setGraph(DEMO_GRAPH);

        // Step 3: Prep phase 3
        setPrepStepMessage(`[Demo režim] Syntéza ${config.swarmScale} autonómnych persón nákupcov a konkurentov...`);
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
        setPrepStepMessage('[Demo režim] Hlavný spravodajský analytik zostavuje strategický briefing simulácie...');
        setIsPreparing(true);
        await new Promise(r => setTimeout(r, 800));

        setActiveReport(DEMO_STRATEGIC_REPORT);
        setIsPreparing(false);
        navigateView('report', { id: demoSimId });
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
      setPrepStepMessage('Inicializácia dedikovaného databázového shardu na serveri...');
      const initRes = await initServerSimulation({
        id: existingDraftId,
        title: config.title,
        hypothesis: config.hypothesis,
        seed_document: config.seedDocument,
        lookback_months: config.lookbackMonths,
        crm_data_sources: config.crmDataSources,
        context_documents: config.contextDocuments,
        swarm_scale: config.swarmScale,
        total_rounds: config.totalRounds,
        status: 'prepared'
      });
      const simId = initRes.id;
      setActiveSimulationId(simId);
      navigateView('running', { id: simId });
      setActiveTitle(config.title);
      setActiveHypothesis(config.hypothesis);
      setActiveSeed(config.seedDocument);
      setTotalRounds(config.totalRounds);
      setCurrentRound(0);
      setPosts([]);
      setMetricsHistory([]);
      setActiveReport(null);

      // Step 2: Extract CRM Context with Lookback Window & Selected Sources
      const activeSrcCount = config.crmDataSources ? config.crmDataSources.length : 8;
      const attachedDocsCount = config.contextDocuments ? config.contextDocuments.length : 0;
      setPrepStepMessage(
        attachedDocsCount > 0 
          ? `Extrakcia CRM dát (${config.lookbackMonths}-mes. horizont, ${activeSrcCount} zdrojov) a spracovanie ${attachedDocsCount} priložených dokumentov...`
          : activeSrcCount > 0
            ? `Extrakcia vybraných CRM dát (${config.lookbackMonths}-mesačný horizont, ${activeSrcCount} aktívnych zdrojov)...`
            : 'Založené výhradne na oznámení scenára (všetky CRM zdroje vypnuté)...'
      );
      const crmContext = await fetchCrmContext(config.lookbackMonths, config.crmDataSources);

      // Step 3: Extract Ontology & Graph Nodes
      setPrepStepMessage('Syntéza dynamického grafu znalostí a sociálnych entít stakeholderov...');
      const generatedGraph = await buildKnowledgeGraph(
        config.seedDocument,
        crmContext.formatted_context,
        config.hypothesis,
        config.llmModel,
        config.contextDocuments
      );
      setGraph(generatedGraph);

      // Step 4: Synthesize Agent Personas
      setPrepStepMessage(`Syntéza ${config.swarmScale} autonómnych persón nákupcov a konkurentov...`);
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
      setPrepStepMessage('Hlavný spravodajský analytik zostavuje strategický briefing simulácie...');
      setIsPreparing(true);

      const report = await generateStrategicReport({
        title: config.title,
        hypothesis: config.hypothesis,
        seedDocument: config.seedDocument,
        graph: generatedGraph,
        agents: generatedAgents,
        posts: engineRef.current ? (engineRef.current as any).posts : [],
        modelName: config.llmModel,
        contextDocuments: config.contextDocuments
      });

      setActiveReport(report);
      setIsPreparing(false);
      navigateView('report', { id: simId });

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
      alert(`Spustenie simulácie zlyhalo: ${err?.message || 'Chyba siete'}`);
      setIsPreparing(false);
      setIsEngineRunning(false);
    }
  };

  // Open past simulation
  const handleOpenPastSimulation = async (sim: any, shouldUpdateHash = true) => {
    if (!sim || !sim.id) return;

    // If demo simulation or demo ID, load demo state
    if (sim.id === DEMO_SIMULATION_CHECKPOINT.simulationId || (typeof sim.id === 'string' && sim.id.startsWith('demo-'))) {
      handleLoadDemoSimulation(shouldUpdateHash);
      return;
    }

    if (sim.status === 'draft') {
      handleOpenDraft(sim, shouldUpdateHash);
      return;
    }

    try {
      const details = await fetchSimulationDetails(sim.id);
      if (!details) {
        if (demoModeActive) {
          handleLoadDemoSimulation(shouldUpdateHash);
          return;
        }
        console.warn('Simulation details not found on server for ID:', sim.id);
        alert('Podrobnosti o simulácii sa nepodarilo načítať zo servera.');
        navigateView('list');
        return;
      }

      // If the simulation is actually a draft on server, open draft editor
      if (details.status === 'draft') {
        handleOpenDraft(details, shouldUpdateHash);
        return;
      }

      const cp = (details.checkpoint && typeof details.checkpoint === 'object' && !Array.isArray(details.checkpoint))
        ? details.checkpoint
        : {};
      const simId = details.id || sim.id;
      setActiveIsDemo(false);

      setActiveSimulationId(simId);
      setActiveTitle(details.title || cp.title || sim.title || 'Market Rehearsal');
      setActiveHypothesis(details.hypothesis || cp.hypothesis || sim.hypothesis || '');
      setActiveSeed(details.seed_document || cp.seed_document || '');
      setCurrentRound(details.current_round !== undefined ? details.current_round : (cp.currentRound || 0));
      setTotalRounds(details.total_rounds || cp.totalRounds || sim.total_rounds || 8);
      setGraph(cp.graph || { nodes: [], edges: [] });
      setAgents(cp.agents || []);
      setPosts(cp.posts || []);
      setMetricsHistory(cp.metricsHistory || []);
      setLatestMetrics(
        cp.metricsHistory && cp.metricsHistory.length > 0
          ? cp.metricsHistory[cp.metricsHistory.length - 1]
          : null
      );

      const finalReport = details.final_report || cp.finalReport || null;

      if (finalReport) {
        setActiveReport(finalReport);
        if (shouldUpdateHash) {
          navigateView('report', { id: simId });
        } else {
          setActiveView('report');
        }
      } else {
        setActiveReport(null);
        if (shouldUpdateHash) {
          navigateView('running', { id: simId });
        } else {
          setActiveView('running');
        }
      }
    } catch (err) {
      console.error('Error opening simulation:', err);
      alert('Chyba pri načítavaní simulácie: ' + ((err as any)?.message || 'Neznáma chyba'));
      navigateView('list');
    }
  };

  // Delete past simulation
  const handleDeleteSimulation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Naozaj chcete natrvalo odstrániť túto simuláciu a vymazať jej dáta z databázy?')) {
      return;
    }

    try {
      const ok = await deleteServerSimulation(id);
      if (ok) {
        setPastSimulations(prev => prev.filter(s => s.id !== id));
        if (activeSimulationId === id) {
          navigateView('list');
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

  // Derive current simulation step (1 to 6) for real simulation
  const currentSimulationStep = useMemo(() => {
    if (activeView === 'create') {
      return 1; // 1. Scenario
    }
    if (isPreparing) {
      if (currentRound === 0 && !activeReport) {
        return 3; // 3. Swarm Ingestion
      }
      return 5; // 5. Strategy Synthesis
    }
    if (isEngineRunning || activeView === 'running') {
      return 4; // 4. Live War Room
    }
    if (activeView === 'report' || activeReport) {
      return 6; // 6. Results & Chatbot
    }
    return 1;
  }, [activeView, isPreparing, isEngineRunning, currentRound, activeReport]);

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      
      {/* Top Navigation Bar: List Overview uses standard header; Real Simulation views use SimulationStepsBar */}
      {activeView === 'list' ? (
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
                Prediktívna simulácia trhu s autonómnymi agentmi založená na reálnej histórii CRM
              </p>
            </div>
          </div>

          {/* View Switcher & Action Buttons */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => navigateView('list')}
                className="px-3 py-1.5 rounded-xl bg-white text-slate-800 shadow-sm transition cursor-pointer"
              >
                Simulácie
              </button>
              {activeSimulationId && (
                <button
                  onClick={() => navigateView('running')}
                  className="px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-600" />
                  <span>War Room</span>
                </button>
              )}
              {activeSimulationId && activeReport && (
                <button
                  onClick={() => navigateView('report')}
                  className="px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Strategický briefing</span>
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
                <span>Spýtať sa analytika / agentov</span>
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
                title="Prepnúť interaktívny demo režim (lokálna simulácia bez nákladov na API)"
              >
                <Zap className={`w-3.5 h-3.5 ${demoModeActive ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'}`} />
                <span>Demo režim: {demoModeActive ? 'ZAP' : 'VYP'}</span>
              </button>

              {demoModeActive && (
                <button
                  onClick={() => {
                    setIsGuidedDemoOpen(true);
                    navigateView(activeView, { isDemo: true });
                  }}
                  className="px-3 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                  title="Pozrieť si animovanú ukážku celého procesu simulácie krok za krokom"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">Ukážka procesu</span>
                </button>
              )}
            </div>

            <button
              onClick={handleStartNewRehearsal}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nová simulácia</span>
            </button>
          </div>
        </header>
      ) : (
        <SimulationStepsBar
          currentStep={currentSimulationStep}
          title={activeTitle || (activeView === 'create' ? (editingDraftData?.title || 'Nová strategická simulácia') : 'Strategická simulácia')}
          hypothesis={activeHypothesis}
          seedDocument={activeSeed}
          isEngineRunning={isEngineRunning}
          isPreparing={isPreparing}
          prepStepMessage={prepStepMessage}
          currentRound={currentRound}
          totalRounds={totalRounds}
          simulatedHour={latestMetrics?.simulatedHour ?? (((currentRound - 1) * 3) % 24)}
          isDemoMode={activeView === 'create' ? demoModeActive : activeIsDemo}
          hasReport={Boolean(activeReport)}
          hasWarRoom={Boolean((graph && graph.nodes && graph.nodes.length > 0) || posts.length > 0)}
          activeView={activeView}
          onNavigateView={(targetView) => {
            navigateView(targetView, { id: activeSimulationId || undefined });
          }}
          onStopSimulation={handleStopSimulation}
          onOpenQaDrawer={() => {
            setInterviewAgent(null);
            setIsQaOpen(true);
          }}
          onStartNewRehearsal={handleStartNewRehearsal}
        />
      )}

      {/* Main Content Area */}
      <div className={`flex-1 p-6 ${activeView === 'running' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-visible'}`}>
        
        {/* Preparation Banner */}
        {isPreparing && (
          <div className="mb-6 p-6 rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white shadow-xl flex items-center gap-4 animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <BrainCircuit className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Orchestrácia kognitívneho roja
              </div>
              <div className="text-base font-bold text-white mt-0.5">
                {prepStepMessage || 'Pripravujú sa komponenty simulácie...'}
              </div>
              <div className="text-xs text-slate-300 mt-1">
                Prosím, zostaňte na tejto obrazovke. Klientsky stav synchronizuje kontrolné body jednotlivých kôl do databázy.
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
                  Podložené živou históriou leadov z CRM
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  Otestujte strategické kroky na trhu ešte pred ich zverejnením
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed font-normal">
                  SAI vygeneruje desiatky autonómnych persón nákupcov a konkurentov v reálnej sociálnej simulácii. 
                  Odhaľte polarizáciu trhu, námietky pri predaji a získajte konkrétny akčný plán na dosiahnutie cieľa.
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleStartNewRehearsal}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Spustiť novú simuláciu trhu</span>
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
                        Interaktívne demo: Reštrukturalizácia cien balíka Enterprise v Q4
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                        Nulové náklady na tokeny
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      Pozrite si predpripravenú simuláciu (+25% zvýšenie cien, 99.9% SLA garancia, priama podpora cez WhatsApp). Vyskúšajte War Room, Strategický briefing a interrogačný hub.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center shrink-0">
                  <button
                    onClick={() => {
                      setIsGuidedDemoOpen(true);
                      navigateView(activeView, { isDemo: true });
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-black text-xs shadow-lg transition flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Ukážka celého procesu (6 krokov)</span>
                  </button>
                  <button
                    onClick={() => handleLoadDemoSimulation()}
                    className="px-4 py-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Prejsť na konečné výsledky</span>
                  </button>
                </div>
              </div>
            )}

            {/* Past Rehearsals List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  Predchádzajúce strategické simulácie
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {pastSimulations.length} celkovo
                </span>
              </div>

              {loadingList ? (
                <div className="p-12 text-center text-slate-400">
                  <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                  <p className="text-xs font-medium">Načítavanie simulácií z databázy...</p>
                </div>
              ) : pastSimulations.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-300 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                    <FlockIcon size={24} className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">Zatiaľ žiadne simulácie</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Vytvorte svoju prvú simuláciu na otestovanie reakcie trhu na zmeny cien, nové balíky alebo pozíciu voči konkurencii.
                  </p>
                  <button
                    onClick={handleStartNewRehearsal}
                    className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow hover:bg-purple-700 transition cursor-pointer"
                  >
                    Vytvoriť simuláciu
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pastSimulations.map((sim) => {
                    const isDraft = sim.status === 'draft';
                    const statusLabel = sim.status === 'completed' ? 'Dokončená' : isDraft ? 'Koncept' : 'Prebieha';
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
                              {statusLabel}
                            </span>
                            <button
                              onClick={(e) => handleDeleteSimulation(e, sim.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title={isDraft ? "Zmazať koncept" : "Zmazať simuláciu"}
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
                              {sim.swarm_scale} agentov
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {sim.current_round} / {sim.total_rounds} kôl
                            </span>
                            {sim.crm_data_sources && Array.isArray(sim.crm_data_sources) && (
                              <span className="flex items-center gap-1 text-purple-600 font-semibold">
                                <Database className="w-3.5 h-3.5 text-purple-500" />
                                {sim.crm_data_sources.length} zdrojov
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={`pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold ${
                          isDraft ? 'text-amber-700 group-hover:text-amber-800' : 'text-purple-600 group-hover:text-purple-700'
                        }`}>
                          <span>{isDraft ? 'Pokračovať v úprave konceptu' : sim.status === 'completed' ? 'Zobraziť manažérsky briefing' : 'Vstúpiť do War Roomu'}</span>
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
              navigateView('list');
              setEditingDraftData(null);
            }}
            onLaunch={handleLaunchSimulation}
            onDraftSaved={() => {
              loadSimulations();
            }}
            isSubmitting={isPreparing}
            isDemoMode={demoModeActive}
            unifiedEntries={unifiedEntries}
          />
        )}

        {/* View 2: Live War Room */}
        {activeView === 'running' && (
          <div className="h-[calc(100vh-140px)] min-h-0 flex flex-col overflow-hidden">
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
            isDemoMode={activeIsDemo}
            onOpenQaDrawer={() => {
              const el = document.getElementById('sai-interrogation-input');
              if (el) {
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            onOpenAgentDirectory={() => {
              navigateView('running');
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
          isDemoMode={activeIsDemo}
        />
      )}

      {/* Interactive Guided Process Demo Walkthrough Modal */}
      <GuidedDemoWalkthrough
        isOpen={isGuidedDemoOpen}
        onClose={() => {
          setIsGuidedDemoOpen(false);
          navigateView(activeView);
        }}
        onStartRealRehearsal={() => {
          setIsGuidedDemoOpen(false);
          handleStartNewRehearsal();
        }}
      />

    </div>
  );
};

export default SaiModule;
