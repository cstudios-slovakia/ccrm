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
    title: 'Aktívne leady v pipeline',
    category: 'Obchodný lievik',
    description: 'Rozpracované obchody, kvalifikované leady a aktívne účty vo fáze zisťovania potrieb.',
    icon: Users,
    badge: 'Leady',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'existing_clients',
    title: 'Existujúci klienti & Zmluvy',
    category: 'Klientska báza',
    description: 'Aktívne klientske účty, dlhodobí partneri a historicky uzatvorené zmluvy.',
    icon: Building2,
    badge: 'Klienti',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'lost_deal_objections',
    title: 'Stratené obchody & Námietky',
    category: 'Obchodné námietky',
    description: 'Zaznamenaný odpor pri predaji, cenová senzitivita, dôvody odmietnutia a námietky.',
    icon: AlertTriangle,
    badge: 'Námietky',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  {
    id: 'competitor_intel',
    title: 'Zmienky o konkurencii',
    category: 'Prieskum trhu',
    description: 'Poznámky v CRM odkazujúce na konkurenčné platformy, alternatívnych dodávateľov a porovnanie cien.',
    icon: Swords,
    badge: 'Konkurencia',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    id: 'meeting_notes',
    title: 'Zápisy zo stretnutí & Prepisy',
    category: 'Stretnutia & Hovory',
    description: 'Zápisy zo stretnutí, prepisy rozhovorov a priama verbálna spätná väzba od klientov.',
    icon: MessageSquare,
    badge: 'Stretnutia',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    id: 'client_emails',
    title: 'Prichádzajúce emaily klientov',
    category: 'Komunikácia',
    description: 'Prichádzajúce emaily, dopyty klientov, požiadavky na rozsah a emailová korešpondencia.',
    icon: Mail,
    badge: 'Emaily',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200'
  },
  {
    id: 'files',
    title: 'Nahrané súbory & Dokumenty',
    category: 'Dokumenty',
    description: 'Obchodné zmluvy, ponuky, faktúry, cenové kalkulácie a textové prílohy z CRM leadov.',
    icon: FolderOpen,
    badge: 'Súbory',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200'
  }
];

export const DEFAULT_CRM_SOURCES = CRM_SOURCE_OPTIONS.map(s => s.id);

export const MODEL_PRICING: Record<string, { ratePerM: number; label: string }> = {
  'gpt-5.6-luna': { ratePerM: 0.25, label: 'GPT-5.6 Luna' },
  'gpt-5.6-terra': { ratePerM: 1.50, label: 'GPT-5.6 Terra' },
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
    name: 'Zvýšenie cien Enterprise',
    title: 'Simulácia 25% úpravy cien v Q4',
    hypothesis: 'Čo ak zvýšime ceny balíka Enterprise CRM o 25%, no zároveň pridáme 99.9% SLA garanciu dostupnosti a dedikovaný Slack kanál podpory?',
    seed: `Pripravujeme oznámenie 25% zvýšenia cien pre všetky balíky Enterprise od budúceho mesiaca.
Aktuálna sadzba Enterprise: 199 €/mesiac. Navrhovaná sadzba: 249 €/mesiac.
Výmenou za to klienti získajú:
- Garantovaný reakčný čas SLA do 1 hodiny pri kritických incidentoch
- Priamy dedikovaný komunikačný kanál cez Slack/WhatsApp s naším tímom inžinierov
- Bezplatnú asistenciu pri migrácii starších databáz
Existujúci zákazníci získajú ochrannú lehotu 6 mesiacov na pôvodných cenách pred uplatnením novej sadzby.
Cieľová skupina: digitálne agentúry a výrobné SMB podniky s 20–200 zamestnancami.`
  },
  {
    name: 'Obrana voči reakcii konkurencie',
    title: 'Protiútok voči tradičnému poskytovateľovi CRM',
    hypothesis: 'Čo ak náš hlavný etablovaný konkurent spustí agresívnu kampaň útočiacu na chýbajúcu funkciu integrovaného telefónneho dialera?',
    seed: `Podľa indícií konkurent X pripravuje cielenú kampaň poukazujúcu na absenciu vstavanej VoIP telefónie v našom riešení.
Naša strategická proti-pozícia:
- Zameriavame sa na hĺbkovú automatizáciu pracovných postupov, okamžitú viackanálovú integráciu s WhatsAppom a modernú rýchlosť UI namiesto starých call-centier.
- Väčšina moderných obchodných tímov komunikuje asynchrónne cez správy, videohovory a email namiesto studených hovorov.
- Ponúkame bezproblémovú integráciu s PBX ústredňami a Twilio cez Webhooky.`
  },
  {
    name: 'Uvedenie novej funkcie (Samoobslužné SAI)',
    title: 'Simulácia spustenia verejnej bety Swarm AI',
    hypothesis: 'Čo ak uvedieme autonómnu prediktívnu simuláciu (SAI) ako prémiový doplnok za 49 €/mesiac?',
    seed: `Spúšťame funkciu Swarm Artificial Intelligence (SAI), ktorá firmám umožňuje simulovať trhové reakcie na nové produkty, PR oznámenia a obchodné stratégie ešte pred ich zverejnením.
Funkcia využíva sociálne roje autonómnych agentov podložené skutočnou históriou leadov a obchodných námietok z firemného CRM.
Cena: 49 €/mesiac za 10 simulácií mesačne, alebo priebežné platby za spotrebované proxy volania.
Chceme zistiť, či obchodní riaditelia považujú tento nástroj za presvedčivý, alebo či sú skeptickí voči validite AI simulácie.`
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
          title: `Zjednotený register: ${ue.name}`,
          category: 'Zjednotený register',
          description: `Zákaznícke záznamy a súbory zo zložky z registra ${ue.name} (${ue.entryName || 'Záznamy'}).`,
          icon: Database,
          badge: ue.entryName || 'Register',
          badgeColor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
        });
      });
    }

    return base;
  }, [activeUnifiedRegistries]);

  // Form State
  const [draftId, setDraftId] = useState<string | undefined>(initialData?.id);
  const [title, setTitle] = useState<string>(initialData?.title || 'Strategická trhová simulácia Q4');
  const [hypothesis, setHypothesis] = useState<string>(
    initialData?.hypothesis || 'Čo ak zavedieme ročnú fakturáciu s 20% zľavou a zrušíme mesačné plány pre nové účty?'
  );
  const [seedDocument, setSeedDocument] = useState<string>(
    initialData?.seed_document || `Zvažujeme reštrukturalizáciu nášho fakturačného modelu. Pre všetky nové účty budeme vyžadovať ročný záväzok, pričom ponúkneme 20% celkovú zľavu oproti pôvodným mesačným sadzbám. Súčasní klienti môžu zostať na mesačnej fakturácii. Našimi cieľovými klientmi sú B2B agentúry a poradenské firmy.`
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
        title: title.trim() || 'Koncept simulácie bez názvu',
        hypothesis: hypothesis.trim() || 'Nešpecifikovaná hypotéza',
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
      setValidationError('Nepodarilo sa uložiť koncept: ' + (err?.message || 'Sieťová chyba'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Open Estimator before Launch
  const handleOpenEstimator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Pred spustením zadajte názov simulácie.');
      return;
    }
    if (!hypothesis.trim()) {
      setValidationError('Zadajte hlavnú hypotézu alebo what-if otázku.');
      return;
    }
    if (!seedDocument.trim()) {
      setValidationError('Zadajte vstupné zadanie, scenár alebo text memoranda.');
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
            <span>Prehľad simulácií</span>
          </button>
          
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">SAI</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-800">
              {draftId ? 'Úprava konceptu simulácie' : 'Konfigurácia novej simulácie'}
            </span>

            {draftId && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-amber-600" />
                Koncept
              </span>
            )}

            {isDemoMode && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-600" />
                Demo režim
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
              <span>Koncept uložený o {lastSavedTimestamp}</span>
            </div>
          )}
          {isDirty && (
            <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Neuložené zmeny</span>
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
            <span>{isSavingDraft ? 'Ukladám koncept...' : 'Uložiť koncept'}</span>
          </button>

          {/* Primary Estimate & Launch Button */}
          <button
            type="button"
            onClick={handleOpenEstimator}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span>Skontrolovať & Odhadnúť tokeny</span>
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
              Rýchle šablóny & Strategické scenáre
            </label>
            <span className="text-[11px] text-slate-400 font-medium">Kliknutím na šablónu vyplníte polia</span>
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
              <span>Názov simulácie <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Manažérsky identifikátor pre reporty & kontrolné body</span>
            </label>
            <input 
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder="napr. Reštrukturalizácia cien balíka Enterprise v Q4"
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-semibold bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Hlavný manažérsky názov a identifikátor pre túto trhovú simuláciu.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Zobrazuje sa na prehľadoch simulácií, pri ukladaní kontrolných bodov, v reálnom čase vo War Roome a v exportovaných manažérskych reportoch.
              </span>
            </div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Strategická hypotéza / What-If premenná <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Kľúčová prediktívna otázka, o ktorej bude roj diskutovať</span>
            </label>
            <input 
              type="text"
              value={hypothesis}
              onChange={e => {
                setHypothesis(e.target.value);
                setIsDirty(true);
              }}
              placeholder="napr. Čo ak zvýšime ceny o 25% a zároveň ponúkneme 99.9% SLA dostupnosť?"
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-medium bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Kľúčová strategická zmena, zmena cenotvorby alebo smerovania, ktorá sa má otestovať.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Slúži ako ústredné zadanie pre agentov, riadi autonómnu tvorbu názorov, zmeny nálad a sledovanie námietok.
              </span>
            </div>
          </div>

          {/* Seed Scenario Document */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Vstupné zadanie & Text oznámenia <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">Tlačová správa, interné memorandum alebo cenový dokument</span>
            </label>
            <textarea 
              rows={6}
              value={seedDocument}
              onChange={e => {
                setSeedDocument(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Vložte text oznámenia, návrh tlačovej správy alebo cenové memorandum, ktoré budú agenti čítať a analyzovať..."
              required
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-800 font-normal resize-y leading-relaxed bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Kompletný text zadania, návrh oznámenia, interné memorandum alebo navrhované zmluvné podmienky.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Agenti čítajú tento text doslovne v 1. kole, citujú konkrétne podmienky, vyhodnocujú doložky podľa svojich záujmov a formulujú protiargumenty.
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
                  CRM podkladové zdroje dát
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                  selectedSources.length === allSourceOptions.length
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : selectedSources.length > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {selectedSources.length === allSourceOptions.length 
                    ? `Všetkých ${allSourceOptions.length} zdrojov aktívnych` 
                    : `${selectedSources.length} z ${allSourceOptions.length} aktívnych`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">
                Vyberte, ktoré historické CRM dáta naplnia graf znalostí a pamäť agentov. Vypnite nepodstatné zdroje pre užšie zameranie simulácie.
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
                <span>Vybrať všetko</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllSources}
                disabled={selectedSources.length === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>Zrušiť výber</span>
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
                      {isChecked ? 'Zahrnuté v simulácii' : 'Vypnuté'}
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
                Všetky CRM zdroje sú momentálne vypnuté. Simulácia bude vychádzať výhradne z vyššie zadaného textu bez importu histórie klientov alebo obchodných námietok.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Reálne dáta z CRM vybrané na ukotvenie simulovaného trhu v skutočnej obchodnej histórii vašej spoločnosti.{' '}
              <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Kontextový modul vyťaží minulé námietky z obchodov, spätnú väzbu zákazníkov a zmienky o konkurencii na dynamickú kalibráciu postojov agentov a zostavenie znalostného grafu.
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
                Časový horizont CRM dát
              </label>
              <span className="text-[11px] text-slate-400">Obdobie dát</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Extrahuje leady, aktívne účty a obchodné námietky z minulej histórie CRM:
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
                  {months} mes. {months === 12 && '⭐'}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-indigo-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Časové obdobie pre vyhľadávanie a analýzu vašich CRM leadov a interakcií s klientmi.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Kratšie horizonty (6 mes.) odrážajú aktuálne trhové podmienky; dlhšie horizonty (12–24 mes.) zachytávajú hlbšie vzorce zákazníckych námietok a lojalitu.
              </span>
            </div>
          </div>

          {/* Swarm Scale (Agents) */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" />
                Veľkosť roju (Agenti)
              </label>
              <span className="text-[11px] text-slate-400">Počet persón</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Počet syntetizovaných autonómnych nákupcov, klientov a profilov konkurencie:
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {[
                { count: 15, label: '15 (Rýchly)' },
                { count: 30, label: '30 (Štandard) ⭐' },
                { count: 60, label: '60 (Hĺbkový)' }
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
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Celkový počet autonómnych persón (nákupcovia, interní ambasádori, konkurenti, regulátori).{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Určuje hustotu komunikačnej siete a štatistickú šírku; vyššie hodnoty odhaľujú špecifické námietky a reťazové reakcie v subkomunitách.
              </span>
            </div>
          </div>

          {/* Simulation Rounds */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Simulačné kolá ({totalRounds} kôl)
              </label>
              <span className="text-[11px] text-emerald-600 font-bold">~{Math.round(totalRounds * 3)} hod. diskusie</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              Riadi hĺbku časového vývoja a konvergenciu diskusie:
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
                <span>5 (Rýchla sonda)</span>
                <span>8 (Vyvážené) ⭐</span>
                <span>20 (Kompletný naratív)</span>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Počet iteračných kôl debaty a komunikačných vĺn, ktoré sa vykonajú.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Každé kolo simuluje vlnu príspevkov a reakcií, kde agenti reagujú na ostatných, vytvárajú spojenectvá a ukazujú, či počiatočná nevôľa ustúpi alebo prerastie do odchodu zákazníkov.
              </span>
            </div>
          </div>

          {/* Intelligence Model & Diurnal Cycle */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-slate-700" />
                Kognitívny model
              </label>
              <span className="text-[11px] text-purple-600 font-bold">Neurónový motor</span>
            </div>
            
            <select 
              value={llmModel}
              onChange={e => {
                setLlmModel(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white"
            >
              <option value="gpt-5.6-luna">GPT-5.6 Luna (Cenovo optimalizovaný & Vysoká rýchlosť) ⭐</option>
              <option value="gpt-5.6-terra">GPT-5.6 Terra (Hĺbková kognitívna analýza & Komplexný roj)</option>
            </select>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Výber OpenAI neurónového modelu, ktorý poháňa každú autonómnu persónu.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Využívame výhradne podporované OpenAI modely. GPT-5.6 Luna nahradil starší 4o a poskytuje bleskovú, cenovo optimalizovanú debatu; GPT-5.6 Terra generuje hlboké strategické nuansy, protiťahy a komplexné uvažovanie účastníkov trhu.
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-700 font-bold block">Cirkadiánny cyklus spánku</span>
                <span className="text-[11px] text-slate-400 font-normal">Agenti oddychujú počas simulovanej noci</span>
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
                <strong className="text-slate-700 font-semibold">Na čo slúži:</strong> Simuluje prirodzenú nočnú a dennú pauzu medzi aktívnymi kolami.{' '}
                <strong className="text-slate-700 font-semibold">Ako sa používa:</strong> Cez noc dochádza k upokojeniu unáhlených emócií a reakcií, vďaka čomu sa na druhý deň prejavia uváženejšie dlhodobé postoje.
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
              Zrušiť
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5 text-purple-600" />
              <span>{isSavingDraft ? 'Ukladám koncept...' : 'Uložiť ako koncept'}</span>
            </button>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5">
            {/* Live Price & Resource Estimator */}
            <div
              onClick={() => setShowEstimatorModal(true)}
              className="group flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-50/95 hover:bg-purple-50/60 border border-slate-200/90 hover:border-purple-300 transition-all duration-200 shadow-xs cursor-pointer select-none"
              title={`Kliknite pre zobrazenie rozpisu tokenov (~${estimatedTokens.toLocaleString()} tokenov, ~${estimatedCalls} API volaní cez ${swarmScale} agentov a ${totalRounds} kôl s modelom ${MODEL_PRICING[llmModel]?.label || llmModel})`}
              role="button"
              tabIndex={0}
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100/90 group-hover:bg-purple-200/80 border border-purple-200/70 flex items-center justify-center text-purple-700 transition-transform duration-200 group-hover:scale-105 shrink-0 shadow-xs">
                <Coins className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                    Odhad ceny
                  </span>
                  {isDemoMode ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 rounded uppercase tracking-wider">
                      Demo zdarma
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-purple-600">
                      {MODEL_PRICING[llmModel]?.label || 'Model'}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-700 transition-colors">
                    {isDemoMode ? '0.000 €' : `~${estimatedCost.toFixed(3)} €`}
                  </span>
                  <span className="text-[11px] text-slate-400 font-semibold leading-none">
                    ~{(estimatedTokens / 1000).toFixed(0)}k tkn
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-7 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-extrabold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60 shrink-0"
            >
              <span>Prejsť na odhad tokenov & Spustiť</span>
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
