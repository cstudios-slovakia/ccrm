import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Briefcase,
  AlertTriangle,
  Swords,
  MessageSquare,
  Mail,
  CheckSquare,
  Square,
  Info,
  FolderOpen,
  Coins,
  UploadCloud,
  FileCode,
  Trash2,
  Paperclip,
  Eye,
  Loader2,
  X,
  Sparkles,
  Compass
} from 'lucide-react';
import type { SimulationParameters, SwarmContextDocument } from '../../utils/swarm/types';
import { PreflightEstimatorModal } from './PreflightEstimatorModal';
import { TemplateCatalogueModal } from './TemplateCatalogueModal';
import type { UseCaseTemplate } from './useCasesCatalogue';
import { initServerSimulation } from '../../utils/swarm/checkpointClient';
import { formatBytes } from '../../utils/formatBytes';

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
  context_documents?: SwarmContextDocument[];
  status?: string;
}

export interface CrmSourceOption {
  id: string;
  title: string;
  titleEn?: string;
  category: string;
  categoryEn?: string;
  description: string;
  descriptionEn?: string;
  icon: React.ElementType;
  badge: string;
  badgeEn?: string;
  badgeColor: string;
}

export const CRM_SOURCE_OPTIONS: CrmSourceOption[] = [
  {
    id: 'active_leads',
    title: 'Aktívne leady v pipeline',
    titleEn: 'Active Pipeline Leads',
    category: 'Obchodný lievik',
    categoryEn: 'Sales Pipeline',
    description: 'Rozpracované obchody, kvalifikované leady a aktívne účty vo fáze zisťovania potrieb.',
    descriptionEn: 'Deals in progress, qualified leads, and accounts in the discovery phase.',
    icon: Users,
    badge: 'Leady',
    badgeEn: 'Leads',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'existing_clients',
    title: 'Existujúci klienti & Zmluvy',
    titleEn: 'Existing Clients & Accounts',
    category: 'Klientska báza',
    categoryEn: 'Client Base',
    description: 'Aktívne klientske účty, dlhodobí partneri a historicky uzatvorené zmluvy.',
    descriptionEn: 'Active customer accounts, long-term partners, and executed agreements.',
    icon: Building2,
    badge: 'Klienti',
    badgeEn: 'Clients',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'projects',
    title: 'Klientske projekty & Zákazky',
    titleEn: 'Client Projects & Deliverables',
    category: 'Realizácia & Zákazky',
    categoryEn: 'Delivery & Projects',
    description: 'Aktívne a dokončené klientske projekty, rozsah zákaziek, harmonogramy a termíny dodania.',
    descriptionEn: 'Active and completed client projects, scope of work, timelines, and milestones.',
    icon: Briefcase,
    badge: 'Projekty',
    badgeEn: 'Projects',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200'
  },
  {
    id: 'lost_deal_objections',
    title: 'Stratené obchody & Námietky',
    titleEn: 'Lost Deals & Objections',
    category: 'Obchodné námietky',
    categoryEn: 'Sales Objections',
    description: 'Zaznamenaný odpor pri predaji, cenová senzitivita, dôvody odmietnutia a námietky.',
    descriptionEn: 'Recorded sales resistance, price sensitivity, rejection reasons, and pushback.',
    icon: AlertTriangle,
    badge: 'Námietky',
    badgeEn: 'Objections',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  {
    id: 'competitor_intel',
    title: 'Zmienky o konkurencii',
    titleEn: 'Competitor Intelligence',
    category: 'Prieskum trhu',
    categoryEn: 'Market Research',
    description: 'Poznámky v CRM odkazujúce na konkurenčné platformy, alternatívnych dodávateľov a porovnanie cien.',
    descriptionEn: 'CRM notes referencing competing platforms, alternative vendors, and pricing comparisons.',
    icon: Swords,
    badge: 'Konkurencia',
    badgeEn: 'Competitors',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    id: 'meeting_notes',
    title: 'Zápisy zo stretnutí & Prepisy',
    titleEn: 'Meeting Notes & Transcripts',
    category: 'Stretnutia & Hovory',
    categoryEn: 'Meetings & Calls',
    description: 'Zápisy zo stretnutí, prepisy rozhovorov a priama verbálna spätná väzba od klientov.',
    descriptionEn: 'Meeting logs, call summaries, transcripts, and direct verbal client feedback.',
    icon: MessageSquare,
    badge: 'Stretnutia',
    badgeEn: 'Meetings',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  {
    id: 'client_emails',
    title: 'Prichádzajúce emaily klientov',
    titleEn: 'Client Email Correspondence',
    category: 'Komunikácia',
    categoryEn: 'Communications',
    description: 'Prichádzajúce emaily, dopyty klientov, požiadavky na rozsah a emailová korešpondencia.',
    descriptionEn: 'Inbound email inquiries, scope requests, clarifications, and message threads.',
    icon: Mail,
    badge: 'Emaily',
    badgeEn: 'Emails',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200'
  },
  {
    id: 'files',
    title: 'Nahrané súbory & Dokumenty',
    titleEn: 'CRM Attachments & Files',
    category: 'Dokumenty',
    categoryEn: 'Documents',
    description: 'Obchodné zmluvy, ponuky, faktúry, cenové kalkulácie a textové prílohy z CRM leadov.',
    descriptionEn: 'Contracts, proposals, invoices, rate calculations, and uploaded text attachments.',
    icon: FolderOpen,
    badge: 'Súbory',
    badgeEn: 'Files',
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
  systemLanguage?: string;
}

const PRESET_TEMPLATES = [
  {
    name: 'Zvýšenie cien Enterprise',
    nameEn: 'Enterprise Price Increase',
    title: 'Simulácia 25% úpravy cien v Q4',
    titleEn: 'Q4 Enterprise 25% Price Increase Simulation',
    hypothesis: 'Čo ak zvýšime ceny balíka Enterprise CRM o 25%, no zároveň pridáme 99.9% SLA garanciu dostupnosti a dedikovaný Slack kanál podpory?',
    hypothesisEn: 'What if we raise Enterprise CRM prices by 25% while adding guaranteed 99.9% SLA availability and a dedicated Slack support channel?',
    seed: `Pripravujeme oznámenie 25% zvýšenia cien pre všetky balíky Enterprise od budúceho mesiaca.
Aktuálna sadzba Enterprise: 199 €/mesiac. Navrhovaná sadzba: 249 €/mesiac.
Výmenou za to klienti získajú:
- Garantovaný reakčný čas SLA do 1 hodiny pri kritických incidentoch
- Priamy dedikovaný komunikačný kanál cez Slack/WhatsApp s naším tímom inžinierov
- Bezplatnú asistenciu pri migrácii starších databáz
Existujúci zákazníci získajú ochrannú lehotu 6 mesiacov na pôvodných cenách pred uplatnením novej sadzby.
Cieľová skupina: digitálne agentúry a výrobné SMB podniky s 20–200 zamestnancami.`,
    seedEn: `We are announcing a 25% price increase across all Enterprise plans starting next month.
Current Enterprise rate: €199/month. Proposed rate: €249/month.
In exchange, clients receive:
- Guaranteed 1-hour SLA response time for critical incidents
- Direct dedicated Slack/WhatsApp bridge with our senior engineers
- Complimentary migration assistance for legacy databases
Existing clients receive a 6-month grandfathering price lock before the new rate applies.
Target segment: digital agencies and manufacturing SMBs with 20–200 employees.`
  },
  {
    name: 'Obrana voči reakcii konkurencie',
    nameEn: 'Competitor Counter-Positioning',
    title: 'Protiútok voči tradičnému poskytovateľovi CRM',
    titleEn: 'Counter-Positioning Against Legacy CRM Competitor',
    hypothesis: 'Čo ak náš hlavný etablovaný konkurent spustí agresívnu kampaň útočiacu na chýbajúcu funkciu integrovaného telefónneho dialera?',
    hypothesisEn: 'What if our main established competitor launches an aggressive campaign attacking our lack of an integrated phone dialer?',
    seed: `Podľa indícií konkurent X pripravuje cielenú kampaň poukazujúcu na absenciu vstavanej VoIP telefónie v našom riešení.
Naša strategická proti-pozícia:
- Zameriavame sa na hĺbkovú automatizáciu pracovných postupov, okamžitú viackanálovú integráciu s WhatsAppom a modernú rýchlosť UI namiesto starých call-centier.
- Väčšina moderných obchodných tímov komunikuje asynchrónne cez správy, videohovory a email namiesto studených hovorov.
- Ponúkame bezproblémovú integráciu s PBX ústredňami a Twilio cez Webhooky.`,
    seedEn: `Intelligence indicates Competitor X is launching a targeted campaign focusing on the lack of built-in VoIP telephony in our platform.
Our strategic counter-position:
- We double down on deep workflow automation, instant multi-channel WhatsApp messaging, and modern sub-100ms UI speed over antiquated call center stacks.
- Modern enterprise sales forces communicate asynchronously via messaging, video calls, and email rather than blind cold calling.
- We offer seamless webhooks and PBX integrations with Twilio and modern VoIP gateways.`
  },
  {
    name: 'Uvedenie novej funkcie (Samoobslužné SAI)',
    nameEn: 'Feature Launch (Self-Service SAI)',
    title: 'Simulácia spustenia verejnej bety Swarm AI',
    titleEn: 'Swarm AI Public Beta Launch Simulation',
    hypothesis: 'Čo ak uvedieme autonómnu prediktívnu simuláciu (SAI) ako prémiový doplnok za 49 €/mesiac?',
    hypothesisEn: 'What if we introduce autonomous predictive simulation (SAI) as a premium add-on at €49/month?',
    seed: `Spúšťame funkciu Swarm Artificial Intelligence (SAI), ktorá firmám umožňuje simulovať trhové reakcie na nové produkty, PR oznámenia a obchodné stratégie ešte pred ich zverejnením.
Funkcia využíva sociálne roje autonómnych agentov podložené skutočnou históriou leadov a obchodných námietok z firemného CRM.
Cena: 49 €/mesiac za 10 simulácií mesačne, alebo priebežné platby za spotrebované proxy volania.
Chceme zistiť, či obchodní riaditelia považujú tento nástroj za presvedčivý, alebo či sú skeptickí voči validite AI simulácie.`,
    seedEn: `We are launching Swarm Artificial Intelligence (SAI), enabling businesses to simulate market reactions to new product lines, PR announcements, and commercial packaging prior to launch.
The capability leverages autonomous multi-agent social swarms grounded in live CRM lead history and objections.
Pricing: €49/month for 10 rehearsals per month, or pay-as-you-go proxy tokens.
Goal: determine if commercial directors perceive high ROI and trust agent validity, or remain skeptical of synthetic simulation.`
  }
];

export const CreateRehearsalView: React.FC<CreateRehearsalViewProps> = ({
  initialData,
  onBack,
  onLaunch,
  onDraftSaved,
  isSubmitting = false,
  isDemoMode = false,
  unifiedEntries = [],
  systemLanguage = 'sk'
}) => {
  const isSk = systemLanguage === 'sk';
  const [localUnifiedEntries, setLocalUnifiedEntries] = useState<any[]>([]);
  const [isCatalogueOpen, setIsCatalogueOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
          title: isSk ? `Zjednotený register: ${ue.name}` : `Unified Registry: ${ue.name}`,
          titleEn: `Unified Registry: ${ue.name}`,
          category: isSk ? 'Zjednotený register' : 'Unified Registry',
          categoryEn: 'Unified Registry',
          description: isSk 
            ? `Zákaznícke záznamy a súbory zo zložky z registra ${ue.name} (${ue.entryName || 'Záznamy'}).`
            : `Customer records and attachments from registry ${ue.name} (${ue.entryName || 'Records'}).`,
          descriptionEn: `Customer records and attachments from registry ${ue.name} (${ue.entryName || 'Records'}).`,
          icon: Database,
          badge: ue.entryName || (isSk ? 'Register' : 'Registry'),
          badgeEn: ue.entryName || 'Registry',
          badgeColor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
        });
      });
    }

    return base;
  }, [activeUnifiedRegistries, isSk]);

  // Form State
  const [draftId, setDraftId] = useState<string | undefined>(initialData?.id);
  const [title, setTitle] = useState<string>(
    initialData?.title || (isSk ? 'Strategická trhová simulácia Q4' : 'Q4 Strategic Market Simulation')
  );
  const [hypothesis, setHypothesis] = useState<string>(
    initialData?.hypothesis || (isSk 
      ? 'Čo ak zavedieme ročnú fakturáciu s 20% zľavou a zrušíme mesačné plány pre nové účty?' 
      : 'What if we introduce annual billing with a 20% discount and eliminate monthly plans for new accounts?')
  );
  const [seedDocument, setSeedDocument] = useState<string>(
    initialData?.seed_document || (isSk 
      ? `Zvažujeme reštrukturalizáciu nášho fakturačného modelu. Pre všetky nové účty budeme vyžadovať ročný záväzok, pričom ponúkneme 20% celkovú zľavu oproti pôvodným mesačným sadzbám. Súčasní klienti môžu zostať na mesačnej fakturácii. Našimi cieľovými klientmi sú B2B agentúry a poradenské firmy.`
      : `We are considering restructuring our billing model. For all new accounts, we will require an annual commitment, offering a 20% overall discount compared to standard monthly rates. Existing clients may remain on monthly billing. Our target customers are B2B agencies and consulting firms.`)
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

  // Execution Mode: 'demo' (fast synthetic, 0 €) vs 'live' (real LLM calls)
  const [executionMode, setExecutionMode] = useState<'demo' | 'live'>(isDemoMode ? 'demo' : 'live');

  useEffect(() => {
    if (isDemoMode) {
      setExecutionMode('demo');
    }
  }, [isDemoMode]);

  // Context Documents (PDF / Markdown / Text)
  const [contextDocuments, setContextDocuments] = useState<SwarmContextDocument[]>(initialData?.context_documents || []);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [uploadDocProgress, setUploadDocProgress] = useState<string | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<SwarmContextDocument | null>(null);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Attached document tokens: approx 1 token per 4 characters
    const attachedDocTokens = contextDocuments.reduce((acc, doc) => {
      const textLen = (doc.content || '').length;
      return acc + Math.ceil(textLen / 4);
    }, 0);
    const totalTokens = ontologyTokens + profileTokens + simulationTokens + reportTokens + attachedDocTokens;
    const totalCalls = turnsPerSim + swarmScale + 6;
    const rate = MODEL_PRICING[llmModel]?.ratePerM ?? 0.25;
    const cost = (totalTokens / 1_000_000) * rate;

    return {
      estimatedTokens: totalTokens,
      estimatedCalls: totalCalls,
      estimatedCost: cost,
    };
  }, [swarmScale, totalRounds, diurnalCycle, llmModel, contextDocuments]);

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
      if (initialData.context_documents && Array.isArray(initialData.context_documents)) {
        setContextDocuments(initialData.context_documents);
      }
      setIsDirty(false);
    }
  }, [initialData]);

  // Document Upload Handlers
  const processUploadedFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploadingDoc(true);
    setDocUploadError(null);

    const validExtensions = ['pdf', 'md', 'markdown', 'txt'];
    const addedDocs: SwarmContextDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!validExtensions.includes(ext)) {
        setDocUploadError(
          isSk 
            ? `Nepodporovaný formát súboru "${file.name}". Podporované sú len .pdf, .md, .markdown a .txt.`
            : `Unsupported file format "${file.name}". Supported: .pdf, .md, .markdown, .txt`
        );
        continue;
      }

      setUploadDocProgress(
        isSk 
          ? `Spracovávam ${file.name} (${i + 1}/${files.length})...`
          : `Processing ${file.name} (${i + 1}/${files.length})...`
      );

      try {
        let clientExtractedText = '';
        // If markdown or text, read client-side immediately as UTF-8
        if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
          clientExtractedText = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsText(file);
          });
        }

        // Upload to /upload.php to persist and extract server-side text
        const formData = new FormData();
        const eventId = 'swarm_doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        formData.append('file', file);
        formData.append('eventId', eventId);

        const res = await fetch('/upload.php', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (data.success) {
          const finalExtractedText = clientExtractedText || data.extractedText || '';
          const docType: 'pdf' | 'markdown' | 'text' = 
            ext === 'pdf' ? 'pdf' : (ext === 'md' || ext === 'markdown') ? 'markdown' : 'text';

          const newDoc: SwarmContextDocument = {
            id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            name: data.fileName || file.name,
            size: file.size,
            type: docType,
            filePath: data.filePath || '',
            content: finalExtractedText,
            extractedChars: finalExtractedText.length,
            uploadedAt: new Date().toISOString()
          };

          addedDocs.push(newDoc);
        } else {
          setDocUploadError(
            isSk 
              ? `Chyba pri nahrávaní súboru ${file.name}: ${data.error || 'Neznáma chyba'}`
              : `Error uploading ${file.name}: ${data.error || 'Unknown error'}`
          );
        }
      } catch (err: any) {
        console.error('Error uploading swarm doc:', err);
        setDocUploadError(
          isSk 
            ? `Nepodarilo sa nahrať súbor ${file.name}: ${err?.message || 'Sieťová chyba'}`
            : `Failed to upload ${file.name}: ${err?.message || 'Network error'}`
        );
      }
    }

    if (addedDocs.length > 0) {
      setContextDocuments(prev => [...prev, ...addedDocs]);
      setIsDirty(true);
    }
    setIsUploadingDoc(false);
    setUploadDocProgress(null);
  };

  const handleRemoveDoc = (docId: string) => {
    setContextDocuments(prev => prev.filter(d => d.id !== docId));
    setIsDirty(true);
  };

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setTitle(isSk ? preset.title : preset.titleEn);
    setHypothesis(isSk ? preset.hypothesis : preset.hypothesisEn);
    setSeedDocument(isSk ? preset.seed : preset.seedEn);
    setIsDirty(true);
    setValidationError(null);
  };

  const handleApplyCatalogueTemplate = (template: UseCaseTemplate) => {
    const chosenTitle = isSk ? (template.nameSk || template.name) : template.name;
    const chosenHypothesis = isSk ? (template.hypothesisSk || template.hypothesis) : template.hypothesis;
    const chosenSeed = isSk ? (template.seedDocumentSk || template.seedDocument) : template.seedDocument;

    setTitle(chosenTitle);
    setHypothesis(chosenHypothesis);
    setSeedDocument(chosenSeed);

    if (template.recommendedSources && template.recommendedSources.length > 0) {
      setSelectedSources(template.recommendedSources);
    }
    setIsDirty(true);
    setValidationError(null);
    setIsCatalogueOpen(false);

    const msg = isSk 
      ? `Šablóna „${chosenTitle}“ bola načítaná do polí.` 
      : `Template "${chosenTitle}" applied to simulation!`;
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
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
        title: title.trim() || (isSk ? 'Koncept simulácie bez názvu' : 'Untitled Simulation Draft'),
        hypothesis: hypothesis.trim() || (isSk ? 'Nešpecifikovaná hypotéza' : 'Unspecified hypothesis'),
        seed_document: seedDocument.trim(),
        lookback_months: lookbackMonths,
        crm_data_sources: selectedSources,
        swarm_scale: swarmScale,
        total_rounds: totalRounds,
        model_name: llmModel,
        diurnal_cycle: diurnalCycle,
        context_documents: contextDocuments,
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
      setValidationError(isSk 
        ? ('Nepodarilo sa uložiť koncept: ' + (err?.message || 'Sieťová chyba'))
        : ('Failed to save draft: ' + (err?.message || 'Network error'))
      );
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Open Estimator before Launch
  const handleOpenEstimator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError(isSk ? 'Zadajte názov strategickej simulácie.' : 'Please enter a simulation title.');
      return;
    }
    if (!hypothesis.trim()) {
      setValidationError(isSk ? 'Zadajte hlavnú hypotézu alebo what-if otázku.' : 'Please enter a strategic hypothesis or what-if question.');
      return;
    }
    if (!seedDocument.trim()) {
      setValidationError(isSk ? 'Zadajte vstupné zadanie, scenár alebo text memoranda.' : 'Please enter the input briefing, scenario, or announcement text.');
      return;
    }
    setValidationError(null);
    setShowEstimatorModal(true);
  };

  const handleConfirmedLaunch = (selectedMode?: 'demo' | 'live') => {
    const finalMode = selectedMode || executionMode;
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
      llmModel,
      contextDocuments,
      executionMode: finalMode
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
            <span>{isSk ? 'Prehľad simulácií' : 'Simulations List'}</span>
          </button>
          
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">SAI</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-800">
              {draftId 
                ? (isSk ? 'Úprava konceptu simulácie' : 'Edit Simulation Draft') 
                : (isSk ? 'Konfigurácia novej simulácie' : 'New Simulation Setup')}
            </span>

            {draftId && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-amber-600" />
                {isSk ? 'Koncept' : 'Draft'}
              </span>
            )}

            {/* Execution Mode Interactive Breadcrumb Badge */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-full border border-slate-200">
              <button
                type="button"
                onClick={() => setExecutionMode('demo')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1 cursor-pointer ${
                  executionMode === 'demo'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title={isSk ? 'Kliknutím zvolíte syntetický Demo test' : 'Click to select synthetic Demo test'}
              >
                <Zap className="w-3 h-3" />
                {isSk ? 'Demo test (0 €)' : 'Demo test ($0.00)'}
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('live')}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1 cursor-pointer ${
                  executionMode === 'live'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title={isSk ? 'Kliknutím zvolíte skutočnú živú simuláciu' : 'Click to select real live simulation'}
              >
                <Sparkles className="w-3 h-3" />
                {isSk ? 'Živý test (Live)' : 'Live test (Live API)'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Draft Save Status */}
          {lastSavedTimestamp && !isDirty && (
            <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isSk ? `Koncept uložený o ${lastSavedTimestamp}` : `Draft saved at ${lastSavedTimestamp}`}</span>
            </div>
          )}
          {isDirty && (
            <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{isSk ? 'Neuložené zmeny' : 'Unsaved changes'}</span>
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
            <span>{isSavingDraft ? (isSk ? 'Ukladám koncept...' : 'Saving draft...') : (isSk ? 'Uložiť koncept' : 'Save Draft')}</span>
          </button>

          {/* Primary Estimate & Launch Button */}
          <button
            type="button"
            onClick={handleOpenEstimator}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span>{isSk ? 'Skontrolovať & Odhadnúť tokeny' : 'Review & Estimate Tokens'}</span>
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

        {/* Prominent Execution Mode Selector Card (Demo vs Live) */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-600" />
                {isSk ? 'Režim vykonania simulácie' : 'Simulation Execution Mode'}
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isSk 
                  ? 'Vyberte si medzi okamžitou bezplatnou ukážkou a ostrou simuláciou cez OpenAI.'
                  : 'Choose between an instant free demonstration or a live production simulation via OpenAI.'}
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
              executionMode === 'live' 
                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${executionMode === 'live' ? 'bg-purple-500 animate-pulse' : 'bg-emerald-500'}`} />
              {executionMode === 'live' 
                ? (isSk ? 'Zvolený: Živý test (Live API)' : 'Selected: Live Test (Live API)') 
                : (isSk ? 'Zvolený: Demo test (0 €)' : 'Selected: Demo Test ($0.00)')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Demo Option Card */}
            <div
              onClick={() => setExecutionMode('demo')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
                executionMode === 'demo'
                  ? 'bg-emerald-50/60 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                  : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-50 opacity-75'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                executionMode === 'demo'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                <Zap className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    ⚡ Demo test
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {isSk ? '0.00 €' : '$0.00'}
                    </span>
                  </h4>
                  {executionMode === 'demo' && (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-600" />
                      {isSk ? 'Zvolené' : 'Selected'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {isSk 
                    ? 'Blesková syntetická simulácia na demonštračných dátach. Nulové náklady na OpenAI API, trvá iba pár sekúnd.'
                    : 'Instant synthetic simulation on demonstration data. Zero OpenAI API costs, completes in seconds.'}
                </p>
              </div>
            </div>

            {/* Live Option Card */}
            <div
              onClick={() => setExecutionMode('live')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3.5 ${
                executionMode === 'live'
                  ? 'bg-purple-50/60 border-purple-600 shadow-sm ring-2 ring-purple-600/20'
                  : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-50 opacity-75'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                executionMode === 'live'
                  ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    🚀 {isSk ? 'Živý test (Live API)' : 'Live Test (Live API)'}
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                      ~{estimatedCost.toFixed(3)} €
                    </span>
                  </h4>
                  {executionMode === 'live' && (
                    <span className="text-xs font-bold text-purple-600 flex items-center gap-1">
                      <Check className="w-4 h-4 text-purple-600" />
                      {isSk ? 'Zvolené' : 'Selected'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {isSk 
                    ? 'Skutočná AI simulácia s reálnymi OpenAI volaniami, extrakciou kontextu z CRM a plnohodnotným ReAct cyklom agentov.'
                    : 'Real AI simulation with live OpenAI calls, CRM context extraction, and complete agent ReAct cycles.'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Quick Presets & Full Catalogue Banner */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              <span>{isSk ? 'Rýchle šablóny & Strategické scenáre' : 'Quick Templates & Strategic Scenarios'}</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                {isSk ? 'Kliknutím na šablónu vyplníte polia' : 'Click a template to auto-fill fields'}
              </span>
              <button
                type="button"
                onClick={() => setIsCatalogueOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>{isSk ? 'Otvoriť katalóg šablón (105)' : 'Browse Template Catalogue (105)'}</span>
              </button>
            </div>
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
                  {isSk ? tmpl.name : tmpl.nameEn}
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-2 mt-1 font-normal">
                  {isSk ? tmpl.hypothesis : tmpl.hypothesisEn}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Rehearsal Title & Core Hypothesis */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>{isSk ? 'Názov simulácie' : 'Simulation Title'} <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">
                {isSk ? 'Manažérsky identifikátor pre reporty & kontrolné body' : 'Executive identifier for reports & checkpoints'}
              </span>
            </label>
            <input 
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              placeholder={isSk ? 'napr. Reštrukturalizácia cien balíka Enterprise v Q4' : 'e.g. Q4 Enterprise Pricing Restructuring'}
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-semibold bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Hlavný manažérsky názov a identifikátor pre túto trhovú simuláciu.' 
                  : 'Primary executive title and identifier for this market simulation.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Zobrazuje sa na prehľadoch simulácií, pri ukladaní kontrolných bodov, v reálnom čase vo War Roome a v exportovaných manažérskych reportoch.'
                  : 'Displayed across simulation lists, checkpoints, live War Room, and exported executive reports.'}
              </span>
            </div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>{isSk ? 'Strategická hypotéza / What-If premenná' : 'Strategic Hypothesis / What-If Variable'} <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">
                {isSk ? 'Kľúčová prediktívna otázka, o ktorej bude roj diskutovať' : 'Core predictive question deliberated by the swarm'}
              </span>
            </label>
            <input 
              type="text"
              value={hypothesis}
              onChange={e => {
                setHypothesis(e.target.value);
                setIsDirty(true);
              }}
              placeholder={isSk ? 'napr. Čo ak zvýšime ceny o 25% a zároveň ponúkneme 99.9% SLA dostupnosť?' : 'e.g. What if we raise prices by 25% while offering 99.9% SLA availability?'}
              required
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-900 font-medium bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Kľúčová strategická zmena, zmena cenotvorby alebo smerovania, ktorá sa má otestovať.'
                  : 'Key strategic change, pricing shift, or directional move being stress-tested.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Slúži ako ústredné zadanie pre agentov, riadi autonómnu tvorbu názorov, zmeny nálad a sledovanie námietok.'
                  : 'Serves as the central mission prompt for agents, guiding autonomous opinion formulation, sentiment shifts, and objection tracking.'}
              </span>
            </div>
          </div>

          {/* Seed Scenario Document */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>{isSk ? 'Vstupné zadanie & Text oznámenia' : 'Input Briefing & Announcement Text'} <span className="text-rose-500">*</span></span>
              <span className="text-[11px] text-slate-400 font-normal">
                {isSk ? 'Tlačová správa, interné memorandum alebo cenový dokument' : 'Press release, internal memo, or pricing document'}
              </span>
            </label>
            <textarea 
              rows={6}
              value={seedDocument}
              onChange={e => {
                setSeedDocument(e.target.value);
                setIsDirty(true);
              }}
              placeholder={isSk 
                ? 'Vložte text oznámenia, návrh tlačovej správy alebo cenové memorandum, ktoré budú agenti čítať a analyzovať...'
                : 'Enter the proposed announcement text, changes, new terms, or market move that agents will read and analyze...'}
              required
              className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-slate-800 font-normal resize-y leading-relaxed bg-white"
            />
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Kompletný text zadania, návrh oznámenia, interné memorandum alebo navrhované zmluvné podmienky.'
                  : 'Full briefing text, draft announcement, internal memo, or proposed contractual terms.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Agenti čítajú tento text doslovne v 1. kole, citujú konkrétne podmienky, vyhodnocujú doložky podľa svojich záujmov a formulujú protiargumenty.'
                  : 'Agents inspect this briefing verbatim in Round 1, quote exact clauses, assess terms against their persona interests, and formulate counterarguments.'}
              </span>
            </div>
          </div>

          {/* Context Documents Upload (PDF & Markdown) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                <span>{isSk ? 'Doplnková dokumentácia pre roj (PDF & Markdown)' : 'Supplementary Knowledge Base (PDF & Markdown)'}</span>
                {contextDocuments.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                    {contextDocuments.length} {isSk ? (contextDocuments.length === 1 ? 'súbor' : contextDocuments.length < 5 ? 'súbory' : 'súborov') : (contextDocuments.length === 1 ? 'file' : 'files')}
                  </span>
                )}
              </label>
              <span className="text-[11px] text-slate-400 font-normal">
                {isSk ? 'Podporované formáty: ' : 'Supported formats: '}
                <strong className="text-slate-600 font-semibold">.pdf</strong>, <strong className="text-slate-600 font-semibold">.md</strong>, <strong className="text-slate-600 font-semibold">.txt</strong>
              </span>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingDoc(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingDoc(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingDoc(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  processUploadedFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-4 sm:p-5 transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDraggingDoc
                  ? 'border-purple-500 bg-purple-50/80 ring-4 ring-purple-100'
                  : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50/60 bg-slate-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processUploadedFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />

              <div className="w-10 h-10 rounded-2xl bg-purple-100/80 text-purple-600 flex items-center justify-center shadow-xs">
                {isUploadingDoc ? (
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                ) : (
                  <UploadCloud className="w-5 h-5" />
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">
                  {isUploadingDoc
                    ? uploadDocProgress || (isSk ? 'Nahrávam a analyzujem súbory...' : 'Uploading and parsing files...')
                    : (isSk ? 'Kliknite pre nahratie dokumentov alebo ich presuňte sem' : 'Click to upload documents or drag & drop files here')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isSk 
                    ? 'Zmluvy, cenové smernice, technické špecifikácie, odpovede na námietky alebo poznámky k produktu'
                    : 'Contracts, pricing policies, specs, objection battlecards, or product notes'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <FileText className="w-3 h-3" /> PDF ({isSk ? 'extrakcia textu' : 'text extraction'})
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  <FileCode className="w-3 h-3" /> MARKDOWN (.md)
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  TEXT (.txt)
                </span>
              </div>
            </div>

            {/* Error banner if upload failed */}
            {docUploadError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{docUploadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocUploadError(null)}
                  className="p-1 hover:bg-rose-100 rounded-lg text-rose-500 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Uploaded Documents List */}
            {contextDocuments.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
                  <span>{isSk ? `Priložené dokumenty pripravené na simuláciu (${contextDocuments.length}):` : `Attached context documents ready for simulation (${contextDocuments.length}):`}</span>
                  <span>
                    {isSk 
                      ? `Spolu ~${contextDocuments.reduce((acc, d) => acc + Math.ceil((d.content?.length || 0) / 4), 0).toLocaleString()} tokenov kontextu`
                      : `Total ~${contextDocuments.reduce((acc, d) => acc + Math.ceil((d.content?.length || 0) / 4), 0).toLocaleString()} context tokens`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {contextDocuments.map((doc) => {
                    const isPdf = doc.type === 'pdf';
                    const isMd = doc.type === 'markdown';
                    const approxTokens = Math.ceil((doc.content?.length || 0) / 4);

                    return (
                      <div
                        key={doc.id}
                        className="p-3 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-200 transition shadow-xs flex items-start justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isPdf
                                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                : isMd
                                ? 'bg-purple-50 text-purple-600 border border-purple-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isPdf ? (
                              <FileText className="w-4 h-4" />
                            ) : isMd ? (
                              <FileCode className="w-4 h-4" />
                            ) : (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate" title={doc.name}>
                              {doc.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                              <span>{formatBytes(doc.size)}</span>
                              <span>•</span>
                              {doc.extractedChars && doc.extractedChars > 0 ? (
                                <span className="text-emerald-700 font-medium">
                                  {doc.extractedChars.toLocaleString()} {isSk ? 'znakov' : 'chars'} (~{approxTokens} tkn)
                                </span>
                              ) : (
                                <span className="text-amber-600 font-medium">
                                  {isSk ? 'Nenašiel sa text' : 'No text extracted'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {doc.content && doc.content.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              title={isSk ? 'Zobraziť extrahovaný text' : 'View extracted text'}
                              className="p-1.5 rounded-lg hover:bg-purple-50 text-slate-400 hover:text-purple-600 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(doc.id)}
                            title={isSk ? 'Odstrániť dokument' : 'Remove document'}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako to funguje:' : 'How it works:'}</strong>{' '}
                {isSk 
                  ? 'Z priložených PDF a Markdown súborov sa automaticky vyextrahuje čistý text. Tento text je zahrnutý do tvorby ontologického grafu simulačného sveta a agenti v roji môžu citovať presné klauzuly, porovnávať parametre a formulovať cielené reakcie.'
                  : 'Clean text is automatically extracted from attached PDF and Markdown files. This content is integrated into the world ontology graph so swarm agents can reference specific clauses, compare terms, and formulate tailored reactions.'}
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
                  {isSk ? 'CRM podkladové zdroje dát' : 'CRM Grounding Data Sources'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                  selectedSources.length === allSourceOptions.length
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : selectedSources.length > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {selectedSources.length === allSourceOptions.length 
                    ? (isSk ? `Všetkých ${allSourceOptions.length} zdrojov aktívnych` : `All ${allSourceOptions.length} sources active`) 
                    : (isSk ? `${selectedSources.length} z ${allSourceOptions.length} aktívnych` : `${selectedSources.length} of ${allSourceOptions.length} active`)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">
                {isSk 
                  ? 'Vyberte, ktoré historické CRM dáta naplnia graf znalostí a pamäť agentov. Vypnite nepodstatné zdroje pre užšie zameranie simulácie.'
                  : 'Select which historical CRM intelligence populates the knowledge graph and agent memory. Disable non-essential sources to focus the rehearsal.'}
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
                <span>{isSk ? 'Vybrať všetko' : 'Select All'}</span>
              </button>
              <button
                type="button"
                onClick={handleClearAllSources}
                disabled={selectedSources.length === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>{isSk ? 'Zrušiť výber' : 'Deselect All'}</span>
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
                          {isSk ? src.badge : (src.badgeEn || src.badge)}
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
                        {isSk ? src.title : (src.titleEn || src.title)}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-normal leading-relaxed mt-1">
                        {isSk ? src.description : (src.descriptionEn || src.description)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 mt-2.5 border-t border-slate-100/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-medium">{isSk ? src.category : (src.categoryEn || src.category)}</span>
                    <span className={`font-bold ${isChecked ? 'text-purple-600' : 'text-slate-400'}`}>
                      {isChecked ? (isSk ? 'Zahrnuté v simulácii' : 'Included in simulation') : (isSk ? 'Vypnuté' : 'Disabled')}
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
                {isSk 
                  ? 'Všetky CRM zdroje sú momentálne vypnuté. Simulácia bude vychádzať výhradne z vyššie zadaného textu bez importu histórie klientov alebo obchodných námietok.'
                  : 'All CRM sources are currently disabled. The simulation will rely strictly on the text provided above without importing past client history or deal objections.'}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
              {isSk 
                ? 'Reálne dáta z CRM vybrané na ukotvenie simulovaného trhu v skutočnej obchodnej histórii vašej spoločnosti.'
                : 'Real CRM records selected to ground the simulated market in your company\'s actual commercial history.'}{' '}
              <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
              {isSk 
                ? 'Kontextový modul vyťaží minulé námietky z obchodov, spätnú väzbu zákazníkov a zmienky o konkurencii na dynamickú kalibráciu postojov agentov a zostavenie znalostného grafu.'
                : 'The context engine extracts past deal objections, customer feedback, and competitor mentions to calibrate agent biases and build the knowledge ontology.'}
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
                {isSk ? 'Časový horizont CRM dát' : 'CRM Data Lookback Horizon'}
              </label>
              <span className="text-[11px] text-slate-400">{isSk ? 'Obdobie dát' : 'Data Period'}</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              {isSk 
                ? 'Extrahuje leady, aktívne účty a obchodné námietky z minulej histórie CRM:'
                : 'Extracts leads, active accounts, and sales objections from historical CRM data:'}
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
                  {months} {isSk ? 'mes.' : 'mo.'} {months === 12 && '⭐'}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-indigo-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Časové obdobie pre vyhľadávanie a analýzu vašich CRM leadov a interakcií s klientmi.'
                  : 'Time window for scanning and analyzing CRM leads and customer interactions.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Kratšie horizonty (6 mes.) odrážajú aktuálne trhové podmienky; dlhšie horizonty (12–24 mes.) zachytávajú hlbšie vzorce zákazníckych námietok a lojalitu.'
                  : 'Shorter horizons (6 mo.) reflect immediate market conditions; longer horizons (12–24 mo.) capture deeper objection patterns and customer loyalty.'}
              </span>
            </div>
          </div>

          {/* Swarm Scale (Agents) */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" />
                {isSk ? 'Veľkosť roju (Agenti)' : 'Swarm Scale (Agents)'}
              </label>
              <span className="text-[11px] text-slate-400">{isSk ? 'Počet persón' : 'Persona Count'}</span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              {isSk 
                ? 'Počet syntetizovaných autonómnych nákupcov, klientov a profilov konkurencie:'
                : 'Number of synthesized autonomous buyers, client accounts, and competitor profiles:'}
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {[
                { count: 15, label: isSk ? '15 (Rýchly)' : '15 (Fast)' },
                { count: 30, label: isSk ? '30 (Štandard) ⭐' : '30 (Standard) ⭐' },
                { count: 60, label: isSk ? '60 (Hĺbkový)' : '60 (Deep)' }
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
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Celkový počet autonómnych persón (nákupcovia, interní ambasádori, konkurenti, regulátori).'
                  : 'Total count of autonomous personas (buyers, internal champions, competitors, regulators).'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Určuje hustotu komunikačnej siete a štatistickú šírku; vyššie hodnoty odhaľujú špecifické námietky a reťazové reakcie v subkomunitách.'
                  : 'Determines communication network density and statistical breadth; higher counts reveal niche objections and multi-hop community cascades.'}
              </span>
            </div>
          </div>

          {/* Simulation Rounds */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                {isSk ? `Simulačné kolá (${totalRounds} kôl)` : `Simulation Rounds (${totalRounds} rounds)`}
              </label>
              <span className="text-[11px] text-emerald-600 font-bold">
                {isSk ? `~${Math.round(totalRounds * 3)} hod. diskusie` : `~${Math.round(totalRounds * 3)} hrs deliberation`}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-normal">
              {isSk ? 'Riadi hĺbku časového vývoja a konvergenciu diskusie:' : 'Controls temporal depth and consensus convergence:'}
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
                <span>{isSk ? '5 (Rýchla sonda)' : '5 (Rapid probe)'}</span>
                <span>{isSk ? '8 (Vyvážené) ⭐' : '8 (Balanced) ⭐'}</span>
                <span>{isSk ? '20 (Kompletný naratív)' : '20 (Full narrative)'}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-emerald-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Počet iteračných kôl debaty a komunikačných vĺn, ktoré sa vykonajú.'
                  : 'Number of iterative deliberation rounds and discussion waves executed.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Každé kolo simuluje vlnu príspevkov a reakcií, kde agenti reagujú na ostatných, vytvárajú spojenectvá a ukazujú, či počiatočná nevôľa ustúpi alebo prerastie do odchodu zákazníkov.'
                  : 'Each round simulates a wave of posts and reactions where agents debate, forge coalitions, and determine whether initial resistance dissolves or solidifies into churn.'}
              </span>
            </div>
          </div>

          {/* Intelligence Model & Diurnal Cycle */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-slate-700" />
                {isSk ? 'Kognitívny model' : 'Reasoning Model'}
              </label>
              <span className="text-[11px] text-purple-600 font-bold">{isSk ? 'Neurónový motor' : 'Neural Engine'}</span>
            </div>
            
            <select 
              value={llmModel}
              onChange={e => {
                setLlmModel(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-purple-500 focus:bg-white"
            >
              <option value="gpt-5.6-luna">
                {isSk ? 'GPT-5.6 Luna (Cenovo optimalizovaný & Vysoká rýchlosť) ⭐' : 'GPT-5.6 Luna (Cost-optimized & High Speed) ⭐'}
              </option>
              <option value="gpt-5.6-terra">
                {isSk ? 'GPT-5.6 Terra (Hĺbková kognitívna analýza & Komplexný roj)' : 'GPT-5.6 Terra (Deep Cognitive Analysis & Complex Swarm)'}
              </option>
            </select>
            <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-purple-500/80 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Výber OpenAI neurónového modelu, ktorý poháňa každú autonómnu persónu.'
                  : 'Selection of neural model powering each autonomous persona.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Využívame výhradne podporované OpenAI modely. GPT-5.6 Luna nahradil starší 4o a poskytuje bleskovú, cenovo optimalizovanú debatu; GPT-5.6 Terra generuje hlboké strategické nuansy, protiťahy a komplexné uvažovanie účastníkov trhu.'
                  : 'We exclusively use supported OpenAI models. GPT-5.6 Luna delivers fast, budget-conscious deliberation; GPT-5.6 Terra generates deep strategic nuances, countermoves, and complex market behavior.'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-700 font-bold block">{isSk ? 'Cirkadiánny cyklus spánku' : 'Circadian Sleep Cycle'}</span>
                <span className="text-[11px] text-slate-400 font-normal">{isSk ? 'Agenti oddychujú počas simulovanej noci' : 'Agents pause during simulated night hours'}</span>
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
                <strong className="text-slate-700 font-semibold">{isSk ? 'Na čo slúži:' : 'Purpose:'}</strong>{' '}
                {isSk 
                  ? 'Simuluje prirodzenú nočnú a dennú pauzu medzi aktívnymi kolami.'
                  : 'Simulates natural day/night resting intervals between active rounds.'}{' '}
                <strong className="text-slate-700 font-semibold">{isSk ? 'Ako sa používa:' : 'How it\'s used:'}</strong>{' '}
                {isSk 
                  ? 'Cez noc dochádza k upokojeniu unáhlených emócií a reakcií, vďaka čomu sa na druhý deň prejavia uváženejšie dlhodobé postoje.'
                  : 'Overnight breaks dissipate impulsive emotional reactions, revealing consolidated, durable long-term sentiment on the following day.'}
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
              {isSk ? 'Zrušiť' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5 text-purple-600" />
              <span>{isSavingDraft ? (isSk ? 'Ukladám koncept...' : 'Saving draft...') : (isSk ? 'Uložiť ako koncept' : 'Save as Draft')}</span>
            </button>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5">
            {/* Live Price & Resource Estimator */}
            <div
              onClick={() => setShowEstimatorModal(true)}
              className="group flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-50/95 hover:bg-purple-50/60 border border-slate-200/90 hover:border-purple-300 transition-all duration-200 shadow-xs cursor-pointer select-none"
              title={isSk 
                ? `Kliknite pre zobrazenie rozpisu tokenov (~${estimatedTokens.toLocaleString()} tokenov, ~${estimatedCalls} API volaní cez ${swarmScale} agentov a ${totalRounds} kôl s modelom ${MODEL_PRICING[llmModel]?.label || llmModel})`
                : `Click to view token breakdown (~${estimatedTokens.toLocaleString()} tokens, ~${estimatedCalls} API calls across ${swarmScale} agents and ${totalRounds} rounds with ${MODEL_PRICING[llmModel]?.label || llmModel})`}
              role="button"
              tabIndex={0}
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100/90 group-hover:bg-purple-200/80 border border-purple-200/70 flex items-center justify-center text-purple-700 transition-transform duration-200 group-hover:scale-105 shrink-0 shadow-xs">
                <Coins className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                    {isSk ? 'Odhad ceny' : 'Cost Estimate'}
                  </span>
                  {executionMode === 'demo' ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-black bg-emerald-100 text-emerald-800 rounded uppercase tracking-wider">
                      {isSk ? 'Demo test (0 €)' : 'Demo test ($0.00)'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-purple-600">
                      {MODEL_PRICING[llmModel]?.label || 'Model'}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-none group-hover:text-purple-700 transition-colors">
                    {executionMode === 'demo' ? (isSk ? '0.000 €' : '$0.000') : `~${estimatedCost.toFixed(3)} €`}
                  </span>
                  <span className="text-[11px] text-slate-400 font-semibold leading-none">
                    {executionMode === 'demo' ? (isSk ? 'Bez spotreby tokenov' : 'Zero token usage') : `~${(estimatedTokens / 1000).toFixed(0)}k tkn`}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-7 py-3 rounded-2xl text-white font-extrabold text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-60 shrink-0 ${
                executionMode === 'demo'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                  : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:from-purple-700 hover:to-emerald-600'
              }`}
            >
              <span>
                {executionMode === 'demo'
                  ? (isSk ? 'Spustiť Demo test (0 €)' : 'Launch Demo Test ($0.00)')
                  : (isSk ? 'Prejsť na odhad tokenov & Spustiť naživo (Live)' : 'Review Token Estimate & Launch Live')}
              </span>
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
        initialMode={executionMode}
        onModeChange={setExecutionMode}
        contextDocuments={contextDocuments}
        systemLanguage={systemLanguage}
      />

      {/* Interactive Template Catalogue Modal (105 Use Cases from Mirofish) */}
      <TemplateCatalogueModal
        isOpen={isCatalogueOpen}
        onClose={() => setIsCatalogueOpen(false)}
        onSelectTemplate={handleApplyCatalogueTemplate}
        systemLanguage={systemLanguage}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-purple-500/30 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
          <button 
            type="button"
            onClick={() => setToastMessage(null)} 
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Extracted Document Text Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  previewDoc.type === 'pdf'
                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                    : previewDoc.type === 'markdown'
                    ? 'bg-purple-50 text-purple-600 border border-purple-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {previewDoc.type === 'pdf' ? (
                    <FileText className="w-4 h-4" />
                  ) : previewDoc.type === 'markdown' ? (
                    <FileCode className="w-4 h-4" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate max-w-md">
                    {previewDoc.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isSk ? 'Extrahovaný text' : 'Extracted text'} • {previewDoc.extractedChars?.toLocaleString() || 0} {isSk ? 'znakov' : 'chars'} (~{Math.ceil((previewDoc.content?.length || 0) / 4)} tokenov)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/40 select-text">
              {previewDoc.content || (isSk ? 'Žiadny text sa z tohto súboru nepodarilo vyextrahovať.' : 'No text could be extracted from this file.')}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500">
              <span>{isSk ? 'Tento text bude vložený do zadania pre agentov a ontologického grafu.' : 'This text will be embedded into the agent briefing and knowledge graph.'}</span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs cursor-pointer"
              >
                {isSk ? 'Zavrieť' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CreateRehearsalView;
