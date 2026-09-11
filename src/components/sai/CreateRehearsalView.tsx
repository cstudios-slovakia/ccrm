import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRight, 
  Calendar, 
  Users, 
  Clock, 
  Bot, 
  FileText, 
  Bookmark, 
  Check, 
  ChevronLeft, 
  AlertCircle,
  Zap,
  Save,
  Database,
  Building2,
  AlertTriangle,
  Swords,
  MessageSquare,
  Mail,
  CheckSquare,
  Square,
  Info,
  FolderOpen,
  Coins
} from 'lucide-react';
import type { SimulationParameters } from '../../utils/swarm/types';
import { PreflightEstimatorModal } from './PreflightEstimatorModal';
import { initServerSimulation } from '../../utils/swarm/checkpointClient';

export interface DraftData {
  id?: string;
  title?: string;
  hypothesis?: string;
  seed_document?: string;
  lookback_months?: number;
  swarm_scale?: number;
  total_rounds?: number;
  model_name?: string;
  diurnal_cycle?: boolean;
  crm_data_sources?: string[];
  status?: string;
}

export interface CrmSourceOption {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  badgeColor: string;
}

export const CRM_SOURCE_OPTIONS: CrmSourceOption[] = [
  {
    id: 'active_leads',
    title: 'Active Pipeline Leads',
    category: 'Pipeline',
    description: 'In-progress deals, qualified leads, and active discovery accounts.',
    icon: Users,
    badge: 'Leads',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'existing_clients',
    title: 'Existing & Won Retainers',
    category: 'Client Base',
    description: 'Active client accounts, retained partners, and historical won contracts.',
    icon: Building2,
    badge: 'Clients',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'lost_deal_objections',
    title: 'Lost Deals & Objections',
    category: 'Sales Friction',
    description: 'Recorded sales resistance, price sensitivity, rejection reasons, and pushbacks.',
    icon: AlertTriangle,
    badge: 'Objections',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  {
    id: 'competitor_intel',
    title: 'Competitor Mentions & Intel',
    category: 'Market Intel',
    description: 'CRM notes referencing rival platforms, alternative vendors, and pricing comparisons.',
    icon: Swords,
    badge: 'Competitors',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    id: 'meeting_notes',
    title: 'Meeting Notes & Transcripts',
    category: 'Discovery Calls',
    description: 'Discovery call notes, meeting transcripts, and direct verbal client feedback.',
    icon: MessageSquare,
    badge: 'Meetings',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    id: 'client_emails',
    title: 'Client Inbound Emails',
    category: 'Communications',
    description: 'Inbound emails, client inquiries, scope requests, and email correspondence.',
    icon: Mail,
    badge: 'Emails',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200'
  },
  {
    id: 'files',
    title: 'Uploaded Files & Documents',
    category: 'Documents',
    description: 'Commercial contracts, proposals, invoices, quotes, and extracted text attachments from CRM leads.',
    icon: FolderOpen,
    badge: 'Files',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200'
  }
];

export const DEFAULT_CRM_SOURCES = CRM_SOURCE_OPTIONS.map(s => s.id);

export const MODEL_PRICING: Record<string, { ratePerM: number; label: string }> = {
  'gpt-5.6-luna': { ratePerM: 0.25, label: 'GPT-5.6 Luna' },
  'gpt-5.6-terra': { ratePerM: 1.50, label: 'GPT-5.6 Terra' },
  'deepseek-chat': { ratePerM: 0.28, label: 'DeepSeek Chat' },
  'gpt-4o-mini': { ratePerM: 0.20, label: 'GPT-4o Mini' },
};

interface CreateRehearsalViewProps {
  initialData?: DraftData | null;
  onBack: () => void;
  onLaunch: (params: SimulationParameters, existingDraftId?: string) => void;
  onDraftSaved?: (savedDraft: any) => void;
  isSubmitting?: boolean;
  isDemoMode?: boolean;
  unifiedEntries?: any[];
}

const PRESET_TEMPLATES = [
  {
    name: 'Enterprise Pricing Increase',
    title: 'Q4 25% Price Adjustment Rehearsal',
    hypothesis: 'What if we raise Enterprise CRM tier prices by 25% while adding 99.9% uptime SLA and dedicated Slack channel support?',
    seed: `We are preparing to announce a 25% price increase across all Enterprise plans starting next month.
Current Enterprise rate: €199/month. Proposed rate: €249/month.
In exchange, clients will receive:
- Guaranteed 1-hour SLA response time for critical issues
- Direct dedicated Slack/WhatsApp support channel with our engineering team
- Free migration assistance for legacy databases
Existing customers will receive a grandfathered 6-month grace period before the rate applies.
Target audience: 20-200 employee digital agencies and manufacturing SMBs.`
  },
  {
    name: 'Competitor Response Defense',
    title: 'Counter-Offensive vs Legacy CRM Vendor',
    hypothesis: 'What if our primary legacy competitor launches an aggressive ad campaign attacking our missing phone dialer feature?',
    seed: `Competitor X is rumored to launch a targeted campaign highlighting our current lack of built-in VoIP telephony.
Our strategic counter-positioning:
- We focus on deep workflow automation, instant multi-channel WhatsApp integration, and modern UI speed rather than legacy call centers.
- Most modern sales teams communicate via async messaging, video calls, and email rather than cold calling.
- We integrate seamlessly with third-party PBX/Twilio via Webhooks.`
  },
  {
    name: 'New Feature Rollout (Self-Service SAI)',
    title: 'Swarm AI Public Beta Launch Rehearsal',
    hypothesis: 'What if we launch autonomous predictive simulation (SAI) as a premium add-on at €49/month?',
    seed: `We are rolling out Swarm Artificial Intelligence (SAI), allowing businesses to simulate market reactions to new products, PR announcements, and sales strategies before going live.
The feature runs multi-agent social swarms grounded in the company's real CRM lead and objection history.
Pricing: €49/month for 10 rehearsals per month, or pay-as-you-go proxy usage.
We want to gauge whether sales executives find this compelling or if they are skeptical of AI simulation validity.`
  }
];

export const CreateRehearsalView: React.FC<CreateRehearsalViewProps> = ({
  initialData,
  onBack,
  onLaunch,
  onDraftSaved,
  isSubmitting = false,
  isDemoMode = false,
  unifiedEntries = []
}) => {
  const [localUnifiedEntries, setLocalUnifiedEntries] = useState<any[]>([]);

  useEffect(() => {
    // If unifiedEntries not supplied via props, fetch from /sync.php as fallback
    if (!unifiedEntries || unifiedEntries.length === 0) {
      fetch('/sync.php')
        .then(res => res.json())
        .then(data => {
          if (data?.unifiedEntries && Array.isArray(data.unifiedEntries)) {
            setLocalUnifiedEntries(data.unifiedEntries);
          }
        })
        .catch(() => {});
    }
  }, [unifiedEntries]);

  const activeUnifiedRegistries = useMemo(() => {
    const list = (unifiedEntries && unifiedEntries.length > 0) ? unifiedEntries : localUnifiedEntries;
    return list.filter((ue: any) => !ue.archived);
  }, [unifiedEntries, localUnifiedEntries]);

  // Dynamically compute full list of CRM sources: static sources + unified entries (if made)
  const allSourceOptions: CrmSourceOption[] = useMemo(() => {
    const base: CrmSourceOption[] = [...CRM_SOURCE_OPTIONS];

    if (activeUnifiedRegistries.length > 0) {
      activeUnifiedRegistries.forEach((ue: any) => {
        base.push({
          id: `ue_${ue.id}`,
          title: `Unified: ${ue.name}`,
          category: 'Unified Registry',
          description: `Custom records and folder files from the ${ue.name} registry (${ue.entryName || 'Records'}).`,
          icon: Database,
          badge: ue.entryName || 'Unified',
          badgeColor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
        });
      });
    }

    return base;
  }, [activeUnifiedRegistries]);

  // Form State
  const [draftId, setDraftId] = useState<string | undefined>(initialData?.id);
  const [title, setTitle] = useState<string>(initialData?.title || 'Q4 Strategy Market Rehearsal');
  const [hypothesis, setHypothesis] = useState<string>(
    initialData?.hypothesis || 'What if we introduce annual billing with a 20% discount and eliminate monthly plans for new accounts?'
  );
  const [seedDocument, setSeedDocument] = useState<string>(
    initialData?.seed_document || `We are considering restructuring our billing model. For all new accounts, we will require an annual commitment, offering a 20% total discount compared to our old monthly rates. Current clients may remain on monthly billing. Our target clients are B2B service agencies and consultancies.`
  );
  const [lookbackMonths, setLookbackMonths] = useState<6 | 12 | 24>(
    (initialData?.lookback_months as 6 | 12 | 24) || 12
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(() => {
    if (initialData?.crm_data_sources && Array.isArray(initialData.crm_data_sources)) {
      return initialData.crm_data_sources;
    }
    const defaultIds = CRM_SOURCE_OPTIONS.map(s => s.id);
    activeUnifiedRegistries.forEach((ue: any) => {
      defaultIds.push(`ue_${ue.id}`);
    });
    return defaultIds;
  });

  // When activeUnifiedRegistries load after initial render and there was no saved draft:
  useEffect(() => {
    if (activeUnifiedRegistries.length > 0 && !initialData?.crm_data_sources) {
      setSelectedSources(prev => {
        const next = [...prev];
        activeUnifiedRegistries.forEach((ue: any) => {
          const ueId = `ue_${ue.id}`;
          if (!next.includes(ueId)) {
            next.push(ueId);
          }
        });
        return next;
      });
    }
  }, [activeUnifiedRegistries, initialData]);
  const [swarmScale, setSwarmScale] = useState<number>(initialData?.swarm_scale || 30);
  const [totalRounds, setTotalRounds] = useState<number>(initialData?.total_rounds || 8);
  const [llmModel, setLlmModel] = useState<string>(initialData?.model_name || 'gpt-5.6-luna');
  const [diurnalCycle, setDiurnalCycle] = useState<boolean>(initialData?.diurnal_cycle ?? true);

  // Draft saving indicator & feedback
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Estimator Modal
  const [showEstimatorModal, setShowEstimatorModal] = useState<boolean>(false);

  // Dynamic real-time resource & price estimation
  const { estimatedTokens, estimatedCalls, estimatedCost } = useMemo(() => {
    const ontologyTokens = 3000;
    const profileTokens = swarmScale * 600;
    const turnsPerSim = Math.round(swarmScale * totalRounds * (diurnalCycle ? 0.7 : 1.0));
    const simulationTokens = turnsPerSim * 450;
    const reportTokens = 8000;
    const totalTokens = ontologyTokens + profileTokens + simulationTokens + reportTokens;
    const totalCalls = turnsPerSim + swarmScale + 6;
    const rate = MODEL_PRICING[llmModel]?.ratePerM ?? 0.25;
    const cost = (totalTokens / 1_000_000) * rate;

    return {
      estimatedTokens: totalTokens,
      estimatedCalls: totalCalls,
      estimatedCost: cost,
    };
  }, [swarmScale, totalRounds, diurnalCycle, llmModel]);

  // Re-sync if initialData changes
  useEffect(() => {
    if (initialData) {
      setDraftId(initialData.id);
      if (initialData.title) setTitle(initialData.title);
      if (initialData.hypothesis) setHypothesis(initialData.hypothesis);
      if (initialData.seed_document) setSeedDocument(initialData.seed_document);
      if (initialData.lookback_months) setLookbackMonths(initialData.lookback_months as 6 | 12 | 24);
      if (initialData.crm_data_sources && Array.isArray(initialData.crm_data_sources)) {
        setSelectedSources(initialData.crm_data_sources);
      }
      if (initialData.swarm_scale) setSwarmScale(initialData.swarm_scale);
      if (initialData.total_rounds) setTotalRounds(initialData.total_rounds);
      if (initialData.model_name) setLlmModel(initialData.model_name);
      if (initialData.diurnal_cycle !== undefined) setDiurnalCycle(initialData.diurnal_cycle);
      setIsDirty(false);
    }
  }, [initialData]);

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setTitle(preset.title);
    setHypothesis(preset.hypothesis);
    setSeedDocument(preset.seed);
    setIsDirty(true);
    setValidationError(null);
  };

  const handleToggleSource = (sourceId: string) => {
    setSelectedSources(prev => {
      const next = prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId];
      setIsDirty(true);
      return next;
    });
  };

  const handleSelectAllSources = () => {
    setSelectedSources(allSourceOptions.map(s => s.id));
    setIsDirty(true);
  };

  const handleClearAllSources = () => {
    setSelectedSources([]);
    setIsDirty(true);
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setValidationError(null);
    try {
      const draftPayload = {
        id: draftId,
        title: title.trim() || 'Untitled Rehearsal Draft',
        hypothesis: hypothesis.trim() || 'Unspecified hypothesis',
        seed_document: seedDocument.trim(),
        lookback_months: lookbackMonths,
        crm_data_sources: selectedSources,
        swarm_scale: swarmScale,
        total_rounds: totalRounds,
        status: 'draft' as const
      };

      const res = await initServerSimulation(draftPayload);
      if (res.success) {
        setDraftId(res.id);
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTimestamp(now);
        setIsDirty(false);
        if (onDraftSaved) {
          onDraftSaved({
            ...draftPayload,
            id: res.id,
            status: 'draft',
            created_at: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to save draft:', err);
      setValidationError('Failed to save draft: ' + (err?.message || 'Network error'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Open Estimator before Launch
  const handleOpenEstimator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Please enter a rehearsal title before launching.');
      return;
    }
    if (!hypothesis.trim()) {
      setValidationError('Please specify the core hypothesis or what-if question.');
      return;
    }
    if (!seedDocument.trim()) {
      setValidationError('Please provide the seed announcement scenario or memo text.');
      return;
    }
    setValidationError(null);
    setShowEstimatorModal(true);
  };

  const handleConfirmedLaunch = () => {
    setShowEstimatorModal(false);
    onLaunch({
      title: title.trim(),
      hypothesis: hypothesis.trim(),
      seedDocument: seedDocument.trim(),
      lookbackMonths,
      crmDataSources: selectedSources,
      swarmScale,
      totalRounds,
      platforms: 'dual',
      diurnalCycle,
      llmModel
    }, draftId);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
      
      {/* Top Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-2xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition shadow-sm flex items-center gap-1 text-xs font-bold cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Rehearsals Overview</span>
          </button>
          
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">SAI</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-800">
              {draftId ? 'Editing Rehearsal Draft' : 'Configure New Rehearsal'}
            </span>

            {draftId && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-amber-600" />
                Draft
              </span>
            )}

            {isDemoMode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-600" />
                Demo Mode
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Draft Save Status */}
          {lastSavedTimestamp && !isDirty && (
            <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Draft saved at {lastSavedTimestamp}</span>
            </div>
          )}
          {isDirty && (
            <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Unsaved changes</span>
            </div>
          )}

          {/* Save Draft Button */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            className="px-4 py-2 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 text-slate-700 font-bold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSavingDraft ? (
              <span className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4 text-purple-600" />
            )}
            <span>{isSavingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
          </button>

          {/* Primary Estimate & Launch Button */}
          <button
            type="button"
            onClick={handleOpenEstimator}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span>Review & Estimate Tokens</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {validationError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Main Form Container */}
      <form onSubmit={handleOpenEstimator} className="space-y-6">
        
        {/* Quick Presets Banner */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              Quick Templates & Strategic Scenarios
            </label>
            <span className="text-[11px] text-slate-400 font-medium">Click a preset to populate fields</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRESET_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(tmpl)}
                className="p-3.5 rounded-2xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/40 text-left transition group shadow-sm bg-slate-50/50 cursor-pointer"
              >
                <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700 truncate">
                  {tmpl.name}
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-2 mt-1 font-normal">
                  {tmpl.hypothesis}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Rehearsal Title & Core Hypothesis */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Rehearsal Title <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Executive identifier for reports & checkpoints</span>
            </label>
            <input 
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder="e.g. Q4 Enterprise Pricing Restructuring"
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-semibold bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> The primary executive name and identifier for this market simulation.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Displayed across rehearsal dashboards, checkpoint saves, war room live telemetry, and exported executive reports.
              </span>
            </div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>What-If Variable / Strategic Hypothesis <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Core predictive question the swarm will debate</span>
            </label>
            <input 
              type="text"
              value={hypothesis}
              onChange={e => {
                setHypothesis(e.target.value);
                setIsDirty(true);
              }}
              placeholder="e.g. What if we raise rates by 25% while offering a 99.9% uptime SLA?"
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-medium bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> The core strategic change, policy pivot, or pricing question being stress-tested.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Acts as the central debate prompt injected into persona agents, driving autonomous opinion formation, sentiment shifts, and pushback metrics.
              </span>
            </div>
          </div>

          {/* Seed Scenario Document */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Seed Scenario & Announcement Text <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Press release, internal memo, or pricing document</span>
            </label>
            <textarea 
              rows={6}
              value={seedDocument}
              onChange={e => {
                setSeedDocument(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Paste the announcement text, draft release, or proposed pricing memo that agents will read and debate..."
              required
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-800 font-normal resize-y leading-relaxed bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> The full briefing text, draft press release, internal memo, or proposed contractual changes.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Agents read this text word-for-word in Round 1, quoting specific terms, evaluating clauses against their persona goals, and crafting initial counter-arguments.
              </span>
            </div>
          </div>
        </div>

        {/* CRM Grounding Data Sources */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  CRM Grounding Data Sources
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                  selectedSources.length === allSourceOptions.length
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : selectedSources.length > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {selectedSources.length === allSourceOptions.length 
                    ? `All ${allSourceOptions.length} Sources Active` 
                    : `${selectedSources.length} of ${allSourceOptions.length} Active`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">
                Choose which historical CRM repositories feed into the simulation's knowledge graph and agent memory. Turn irrelevant sources off to focus the simulation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllSources}
                disabled={selectedSources.length === allSourceOptions.length}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <CheckSquare className="w-3.5 h-3.5 text-purple-600" />
                <span>Select All</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllSources}
                disabled={selectedSources.length === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          {/* Sources Checkbox Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allSourceOptions.map((src) => {
              const isChecked = selectedSources.includes(src.id);
              const IconComp = src.icon;

              return (
                <div
                  key={src.id}
                  onClick={() => handleToggleSource(src.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between group ${
                    isChecked
                      ? 'bg-purple-50/30 border-purple-300 ring-1 ring-purple-400/40 shadow-xs hover:border-purple-400'
                      : 'bg-slate-50/50 border-slate-200/80 text-slate-400 hover:border-slate-300 hover:bg-slate-50 opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition ${
                          isChecked ? 'bg-purple-100 text-purple-700' : 'bg-slate-200/60 text-slate-400'
                        }`}>
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${src.badgeColor}`}>
                          {src.badge}
                        </span>
                      </div>

                      {/* Checkbox Icon */}
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                        isChecked 
                          ? 'bg-purple-600 border-purple-600 text-white' 
                          : 'border-slate-300 bg-white group-hover:border-slate-400'
                      }`}>
                        {isChecked ? (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <h4 className={`text-xs font-bold transition ${
                        isChecked ? 'text-slate-900 group-hover:text-purple-700' : 'text-slate-600'
                      }`}>
                        {src.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-normal leading-relaxed mt-1">
                        {src.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 border-t border-slate-100/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">{src.category}</span>
                    <span className={`font-bold ${isChecked ? 'text-purple-600' : 'text-slate-400'}`}>
                      {isChecked ? 'Included in Grounding' : 'Turned Off'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zero Selected Safeguard Warning */}
          {selectedSources.length === 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                All CRM sources are currently turned off. The simulation will ground exclusively on your Seed Scenario text above without importing past client history or deal objections.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-700 font-semibold">What it is for:</strong> Real-world CRM datasets selected to ground the simulated market in your company's actual commercial history.{' '}
              <strong className="text-slate-700 font-semibold">How it is used:</strong> The context engine mines past deal objections, customer feedback, and rival platform mentions to dynamically calibrate agent persona biases and generate the stakeholder knowledge graph.
            </span>
          </div>
        </div>

        {/* Simulation Parameters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* CRM Lookback Horizon */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                CRM Lookback Horizon
              </label>
              <span className="text-[11px] text-slate-400">Grounding window</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Extracts leads, active accounts, and lost deal sales objections from past CRM history:
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {[6, 12, 24].map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() => {
                    setLookbackMonths(months as 6 | 12 | 24);
                    setIsDirty(true);
                  }}
                  className={`py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    lookbackMonths === months
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {months} Mo {months === 12 && '⭐'}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-indigo-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> Historical search timeframe for mining your CRM leads and client interactions.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Shorter horizons (6 mo) reflect current competitive conditions; longer horizons (12–24 mo) extract deep patterns of customer objections and retainer loyalty.
              </span>
            </div>
          </div>

          {/* Swarm Scale (Agents) */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" />
                Swarm Scale (Agents)
              </label>
              <span className="text-[11px] text-slate-400">Persona count</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Number of autonomous buyer, client, and competitor personas synthesized:
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {[
                { count: 15, label: '15 (Fast)' },
                { count: 30, label: '30 (Std) ⭐' },
                { count: 60, label: '60 (Deep)' }
              ].map(opt => (
                <button
                  key={opt.count}
                  type="button"
                  onClick={() => {
                    setSwarmScale(opt.count);
                    setIsDirty(true);
                  }}
                  className={`py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                    swarmScale === opt.count
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> The total population size of autonomous personas (buyers, champions, competitors, regulators).{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Determines network density and statistical breadth; higher scales reveal niche stakeholder pushbacks and emergent herd reactions across sub-communities.
              </span>
            </div>
          </div>

          {/* Simulation Rounds */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Simulation Rounds ({totalRounds} rounds)
              </label>
              <span className="text-[11px] text-emerald-600 font-bold">~{Math.round(totalRounds * 3)}h debate time</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Controls temporal evolution depth and narrative convergence:
            </p>
            <div className="pt-2">
              <input 
                type="range"
                min={5}
                max={20}
                step={1}
                value={totalRounds}
                onChange={e => {
                  setTotalRounds(parseInt(e.target.value));
                  setIsDirty(true);
                }}
                className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-100 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-2">
                <span>5 (Quick Probe)</span>
                <span>8 (Balanced) ⭐</span>
                <span>20 (Full Narrative)</span>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> The number of iterative debate cycles and narrative waves executed.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Each round simulates a wave of social dialogue where agents respond to peer posts, form consensus alliances, and show whether initial outrage normalizes or leads to permanent churn.
              </span>
            </div>
          </div>

          {/* Intelligence Model & Diurnal Cycle */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-slate-700" />
                Intelligence Model
              </label>
              <span className="text-[11px] text-purple-600 font-bold">Cognitive Engine</span>
            </div>
            
            <select 
              value={llmModel}
              onChange={e => {
                setLlmModel(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white"
            >
              <option value="gpt-5.6-luna">GPT-5.6 Luna (Cost-Optimized & High Speed) ⭐</option>
              <option value="gpt-5.6-terra">GPT-5.6 Terra (Heavy Cognitive Reasoning & Deep Swarm)</option>
              <option value="deepseek-chat">DeepSeek Chat (V3 Reasoning)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (Legacy Cost-Optimized)</option>
            </select>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> Selects the LLM cognitive reasoning engine powering each autonomous persona.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> GPT-5.6 Luna provides high-velocity, cost-optimized debates; GPT-5.6 Terra generates deep strategic nuance, counter-moves, and complex stakeholder reasoning.
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-700 font-bold block">Diurnal Sleep Cycle</span>
                <span className="text-[11px] text-slate-400 font-normal">Agents rest across simulated nights</span>
              </div>
              <input 
                type="checkbox"
                checked={diurnalCycle}
                onChange={e => {
                  setDiurnalCycle(e.target.checked);
                  setIsDirty(true);
                }}
                className="w-4 h-4 rounded text-purple-600 accent-purple-600 cursor-pointer"
              />
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">What it is for:</strong> Simulates natural circadian night-and-day pauses between active rounds.{' '}
                <strong className="text-slate-700 font-semibold">How it is used:</strong> Cools off reactionary anger overnight and decays transient emotional spikes, allowing more reasoned long-term perspectives to emerge the next day.
              </span>
            </div>
          </div>

        </div>

        {/* Bottom Action Bar */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5 text-purple-600" />
              <span>{isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
            </button>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5">
            {/* Live Price & Resource Estimator */}
            <div
              onClick={() => setShowEstimatorModal(true)}
              className="group flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-50/95 hover:bg-purple-50/60 border border-slate-200/90 hover:border-purple-300 transition-all duration-200 shadow-xs cursor-pointer select-none"
              title={`Click to preview full token breakdown (~${estimatedTokens.toLocaleString()} tokens, ~${estimatedCalls} API calls across ${swarmScale} agents and ${totalRounds} rounds with ${MODEL_PRICING[llmModel]?.label || llmModel})`}
              role="button"
              tabIndex={0}
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100/90 group-hover:bg-purple-200/80 border border-purple-200/70 flex items-center justify-center text-purple-700 transition-transform duration-200 group-hover:scale-105 shrink-0 shadow-xs">
                <Coins className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                    Est. Cost
                  </span>
                  {isDemoMode ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 rounded uppercase tracking-wider">
                      Demo Free
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-purple-600">
                      {MODEL_PRICING[llmModel]?.label || 'Model'}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-700 transition-colors">
                    {isDemoMode ? '€0.000' : `~€${estimatedCost.toFixed(3)}`}
                  </span>
                  <span className="text-[11px] text-slate-400 font-semibold leading-none">
                    ~{(estimatedTokens / 1000).toFixed(0)}k tkns
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-7 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-extrabold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60 shrink-0"
            >
              <span>Proceed to Token Estimation & Launch</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </form>

      {/* Mandatory Pre-Flight Resource Estimator Modal */}
      <PreflightEstimatorModal
        isOpen={showEstimatorModal}
        onClose={() => setShowEstimatorModal(false)}
        onConfirm={handleConfirmedLaunch}
        title={title}
        swarmScale={swarmScale}
        totalRounds={totalRounds}
        modelName={llmModel}
        isDemoMode={isDemoMode}
      />

    </div>
  );
};

export default CreateRehearsalView;
