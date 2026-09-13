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

export const getSimulationSteps = (lang?: string): SimulationStepInfo[] => {
  if (lang === 'hu') {
    return [
      {
        id: 1,
        shortLabel: '1. Forgatókönyv',
        title: '1. Stratégiai forgatókönyv & Hipotézis',
        tagline: 'Határozza meg a stratégiai javaslatot, a what-if kérdést és a CRM forrásokat.'
      },
      {
        id: 2,
        shortLabel: '2. Előzetes becslés',
        title: '2. Költség- és biztonsági előzetes becslés',
        tagline: 'Token-fogyasztás előrejelzése és biztonsági korlátok ellenőrzése.'
      },
      {
        id: 3,
        shortLabel: '3. Adatok betöltése',
        title: '3. CRM adatok betöltése & Tudásgráf',
        tagline: 'CRM kontextus kinyerése, ontológia építése és ágens perszónák szintézise.'
      },
      {
        id: 4,
        shortLabel: '4. Élő War Room',
        title: '4. Autonóm szimuláció a War Roomban',
        tagline: 'Autonóm AI ágensek vitatkoznak, ellenérveket fogalmaznak meg és szavaznak.'
      },
      {
        id: 5,
        shortLabel: '5. Szintézis',
        title: '5. Vezető elemző stratégiai szintézise',
        tagline: 'Az AI összesíti az ágensek vitáját egy cselekvési vezetői összefoglalóba.'
      },
      {
        id: 6,
        shortLabel: '6. Eredmények & Chat',
        title: '6. Vezetői jelentés & Ágens interjú',
        tagline: 'Átfogó stratégiai terv és ágensek közvetlen kérdezése valós időben.'
      }
    ];
  }
  if (lang === 'sk') {
    return [
      {
        id: 1,
        shortLabel: '1. Scenár',
        title: '1. Strategický scenár & Definícia hypotézy',
        tagline: 'Definujte návrh, what-if otázku a podkladové zdroje z CRM.'
      },
      {
        id: 2,
        shortLabel: '2. Predbežný odhad',
        title: '2. Predbežný odhad nákladov a bezpečnosti',
        tagline: 'Predikcia spotreby tokenov a overenie bezpečnostných limitov.'
      },
      {
        id: 3,
        shortLabel: '3. Načítanie dát',
        title: '3. Načítanie CRM dát & Tvorba grafu znalostí',
        tagline: 'Extrakcia CRM kontextu, tvorba ontologického grafu a syntéza persón.'
      },
      {
        id: 4,
        shortLabel: '4. Live War Room',
        title: '4. Autonómna simulácia vo War Roome',
        tagline: 'Autonómni agenti diskutujú, formulujú protiargumenty a hlasujú.'
      },
      {
        id: 5,
        shortLabel: '5. Syntéza stratégie',
        title: '5. Syntéza hlavného analytika',
        tagline: 'AI spracováva debatu viacerých agentov a pripravuje manažérsky briefing.'
      },
      {
        id: 6,
        shortLabel: '6. Výsledky & Chatbot',
        title: '6. Výkonný briefing & Interrogačný hub',
        tagline: 'Strategický plán a priame dopytovanie agentov v reálnom čase.'
      }
    ];
  }
  return [
    {
      id: 1,
      shortLabel: '1. Scenario',
      title: '1. Strategic Scenario & Hypothesis Definition',
      tagline: 'Define your strategic proposal, what-if question, and CRM context sources.'
    },
    {
      id: 2,
      shortLabel: '2. Preflight Estimate',
      title: '2. Preflight Cost & Safety Estimate',
      tagline: 'Token expenditure prediction and safety guardrail verification.'
    },
    {
      id: 3,
      shortLabel: '3. Data Ingestion',
      title: '3. CRM Data Ingestion & Knowledge Graph',
      tagline: 'Context extraction, ontology graph construction, and agent persona synthesis.'
    },
    {
      id: 4,
      shortLabel: '4. Live War Room',
      title: '4. Autonomous War Room Simulation',
      tagline: 'Autonomous AI agents deliberate, debate counter-arguments, and vote.'
    },
    {
      id: 5,
      shortLabel: '5. Synthesis',
      title: '5. Lead Analyst Strategy Synthesis',
      tagline: 'AI synthesizes multi-agent deliberation into an actionable executive briefing.'
    },
    {
      id: 6,
      shortLabel: '6. Results & Q&A',
      title: '6. Executive Briefing & Interrogation Hub',
      tagline: 'Comprehensive strategic roadmap and direct real-time agent questioning.'
    }
  ];
};

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
  systemLanguage?: string;
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
  onStartNewRehearsal,
  systemLanguage = 'sk'
}) => {
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;
  const steps = getSimulationSteps(systemLanguage);
  const stepMeta = steps.find(s => s.id === currentStep) || steps[0];

  // Derive status badge
  let badgeText = t('ACTIVE REHEARSAL', 'AKTÍVNA SIMULÁCIA', 'AKTÍV SZIMULÁCIÓ');
  let badgeStyle = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

  if (isDemoMode) {
    badgeText = t('DEMO TEST ($0.00)', 'DEMO TEST (0 €)', 'DEMO TESZT (0 €)');
    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  } else if (isEngineRunning) {
    badgeText = t(`LIVE SIMULATION • R${currentRound}/${totalRounds}`, `ŽIVÁ SIMULÁCIA • K${currentRound}/${totalRounds}`, `ÉLES SZIMULÁCIÓ • ${currentRound}/${totalRounds}. KÖR`);
    badgeStyle = 'bg-purple-500/30 text-purple-200 border-purple-500/40 animate-pulse';
  } else if (isPreparing) {
    badgeText = currentStep === 5 
      ? t('GENERATING BRIEFING', 'GENEROVANIE BRIEFINGU', 'JELENTÉS KÉSZÍTÉSE')
      : t('LIVE SWARM INGESTION', 'ŽIVÁ PRÍPRAVA ROJU', 'RAJ ELŐKÉSZÍTÉSE');
    badgeStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse';
  } else if (hasReport || activeView === 'report') {
    badgeText = t('LIVE SIMULATION • COMPLETED', 'ŽIVÁ SIMULÁCIA • DOKONČENÁ', 'ÉLES SZIMULÁCIÓ • BEFEJEZŐDÖTT');
    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  } else if (activeView === 'create') {
    badgeText = t('NEW REHEARSAL', 'NOVÁ SIMULÁCIA', 'ÚJ SZIMULÁCIÓ');
    badgeStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  }

  // Handle clicking step pills
  const handleStepClick = (stepId: number) => {
    if (stepId === 1) {
      if (activeView !== 'create') {
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
                {title || t('SAI Autonomous Rehearsal', 'SAI Autonómna simulácia', 'SAI Autonóm szimuláció')}
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${badgeStyle}`}>
                {badgeText}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-1 flex items-center gap-1.5">
              <span>
                {t(`Step ${currentStep} of 6:`, `Krok ${currentStep} zo 6:`, `${currentStep}. lépés a 6-ból:`)} {isPreparing && prepStepMessage ? prepStepMessage : stepMeta.title}
              </span>
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
          {steps.map(s => {
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
                title={`${s.title} — ${s.tagline}${isClickable ? t(' (Click to review)', ' (Kliknutím skontrolujete)', ' (Kattintson az ellenőrzéshez)') : ''}`}
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
              title={t("Stop agent deliberation and synthesize early", "Zastaviť debatu agentov a vygenerovať záverečnú syntézu", "Ágensek vitájának leállítása és korai szintézis")}
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{t("End Early", "Ukončiť skôr", "Befejezés most")}</span>
            </button>
          )}

          {/* Ask Analyst / QA Drawer Trigger */}
          {activeView !== 'create' && onOpenQaDrawer && (
            <button
              type="button"
              onClick={onOpenQaDrawer}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">{t("Ask Analyst", "Spýtať sa analytika", "Kérdezze az elemzőt")}</span>
            </button>
          )}

          {/* Quick New Rehearsal Shortcut */}
          {onStartNewRehearsal && activeView !== 'create' && (
            <button
              type="button"
              onClick={onStartNewRehearsal}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t("New Simulation", "Nová simulácia", "Új szimuláció")}</span>
            </button>
          )}

          {/* Exit / Return to List */}
          <button
            type="button"
            onClick={() => onNavigateView('list')}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title={t("Simulation List", "Prehľad simulácií", "Szimulációk listája")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Step 1 Quick Scenario Review Modal */}
      {showScenarioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {t("Simulation Hypothesis & Input Scenario", "Vstupné zadanie a hypotéza simulácie", "Bemeneti feladat és hipotézis")}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowScenarioModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                  {t("Simulation Title", "Názov simulácie", "Szimuláció címe")}
                </span>
                <p className="font-bold text-slate-800 text-sm">{title}</p>
              </div>

              {hypothesis && (
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                    {t("Strategic Hypothesis", "Strategická hypotéza", "Stratégiai hipotézis")}
                  </span>
                  <div className="p-3 bg-purple-50 text-purple-950 font-medium rounded-2xl border border-purple-100">
                    &ldquo;{hypothesis}&rdquo;
                  </div>
                </div>
              )}

              {seedDocument && (
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block mb-1">
                    {t("Briefing Document / Announcement", "Text zadania / oznámenia", "Zadási dokumentum / Bejelentés")}
                  </span>
                  <div className="p-3 bg-slate-50 text-slate-700 font-mono text-[11px] rounded-2xl border border-slate-200 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {seedDocument}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowScenarioModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                {t("Close", "Zavrieť", "Bezárás")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
