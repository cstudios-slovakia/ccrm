import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  systemLanguage?: string;
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


export const GuidedDemoWalkthrough: React.FC<GuidedDemoWalkthroughProps> = ({
  isOpen,
  onClose,
  onStartRealRehearsal,
  systemLanguage = 'sk'
}) => {
  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;

  const demoSteps: DemoStepMeta[] = useMemo(() => [
    {
      id: 1,
      title: t("1. Strategic Scenario & Hypothesis Definition", "1. Strategický scenár & Definícia hypotézy", "1. Stratégiai forgatókönyv és hipotézismeghatározás"),
      shortLabel: t("1. Scenario", "1. Scenár", "1. Forgatókönyv"),
      tagline: t("Define strategic proposal, pricing adjustments, or market announcement.", "Definujte strategický návrh, úpravu cien alebo trhové oznámenie.", "Határozza meg a stratégiai javaslatot, árváltoztatást vagy piaci bejelentést."),
      userAction: t("Input business scenario, hypothesis, and proposal document. Select CRM history lookback window to ground the swarm.", "Zadáte obchodný scenár, hypotézu a dokument ponuky. Zvolíte počet mesiacov skutočnej CRM histórie na ukotvenie roju.", "Megadja az üzleti forgatókönyvet, hipotézist és ajánlati dokumentumot. Kiválasztja a raj lehorgonyzásához szükséges CRM előzmények időtávját."),
      engineAction: t("System analyzes proposal, identifies key value drivers, and compiles initial market participant categories.", "Systém analyzuje návrh, identifikuje kľúčové prínosy a zostaví počiatočné kategórie účastníkov trhu.", "A rendszer elemzi a javaslatot, azonosítja a kulcsfontosságú előnyöket és összeállítja a piaci résztvevők kezdőkategóriáit."),
      durationSec: 8
    },
    {
      id: 2,
      title: t("2. Preflight Cost & Safety Estimation", "2. Predbežný odhad nákladov a bezpečnosti", "2. Előzetes költség- és biztonságbecslés"),
      shortLabel: t("2. Estimation", "2. Predbežný odhad", "2. Előzetes becslés"),
      tagline: t("Predict token consumption and verify budget limits prior to launch.", "Predikcia spotreby tokenov a overenie rozpočtových limitov pred spustením.", "Tokenfogyasztás előrejelzése és költségvetési limitek ellenőrzése az indítás előtt."),
      userAction: t("Review estimated token volume, compare model costs, and verify budget caps before making API calls.", "Skontrolujete odhadovaný objem tokenov, porovnáte náklady modelov a overíte rozpočtové stropy pred uskutočnením API volaní.", "Áttekinti a becsült tokenmennyiséget, összehasonlítja a modellköltségeket, és ellenőrzi a költségkereteket az API-hívások előtt."),
      engineAction: t("Calculates exact input/output tokens (ontology + personas + multi-turn debate + synthesis) and checks limits.", "Vzorec vypočíta presné vstupné/výstupné tokeny (ontológia + persóny + viac-kolový dialóg + syntéza) a overí limity.", "Kiszámítja a pontos bemeneti/kimeneti tokeneket (ontológia + perszónák + többkörös vita + szintézis), és ellenőrzi a limiteket."),
      durationSec: 7
    },
    {
      id: 3,
      title: t("3. Data Ingestion & Knowledge Graph Assembly", "3. Načítanie dát & Zostavenie grafu znalostí", "3. Adatbetöltés és tudásgráf felépítése"),
      shortLabel: t("3. Data Ingestion", "3. Načítanie dát", "3. Adatbetöltés"),
      tagline: t("Synthesize realistic buying committees, auditors, and competitors from CRM records.", "Syntéza realistických nákupných výborov, audítorov a konkurencie z CRM záznamov.", "Valósághű beszerzési bizottságok, auditorok és versenytársak szintetizálása CRM rekordokból."),
      userAction: t("Inspect synthesized stakeholder personas (buyers, compliance auditors, legacy competitors, clients).", "Prezriete si syntetizované persóny účastníkov trhu (nákupcovia, compliance audítori, tradiční konkurenti, klienti).", "Megtekinti a szintetizált érintetti perszónákat (vásárlók, megfelelőségi auditorok, hagyományos versenytársak, ügyfelek)."),
      engineAction: t("Extracts closed deals, loss reasons, and customer profiles from CRM into an interconnected knowledge graph.", "Systém čerpá z CRM obchodov, dôvodov straty a klientskych persón na zostavenie prepojeného znalostného grafu.", "A rendszer a CRM üzletekből, elvesztési indokokból és ügyfélelőzményekből épít össze egy összefüggő tudásgráfot."),
      durationSec: 8
    },
    {
      id: 4,
      title: t("4. Autonomous Live War Room Simulation", "4. Autonómna simulácia vo War Roome", "4. Autonóm szimuláció a War Roomban"),
      shortLabel: t("4. Live War Room", "4. Live War Room", "4. Élő War Room"),
      tagline: t("Watch autonomous agents debate, raise objections, and cast votes across rounds.", "Sledujte, ako autonómni agenti diskutujú, vznášajú námietky a hlasujú naprieč kolami.", "Figyelje, ahogy az autonóm ágensek vitáznak, kifogásokat emelnek és szavaznak a körök során."),
      userAction: t("Observe real-time social feed, sentiment evolution, simulated time, and viral response index.", "Sledujete živý kanál príspevkov v reálnom čase, vývoj sentimentu, simulovaný čas a index virality.", "Kövesse a valós idejű bejegyzésfolyamot, a hangulat alakulását, a szimulált időt és a viralitási indexet."),
      engineAction: t("Agents publish asynchronously, respond to objections, launch counter-attacks, and converge toward consensus.", "Agenti publikujú asynchrónne, reagujú na námietky, vedú protiútoky konkurencie a dosahujú konsenzus na základe svojich persón.", "Az ágensek aszinkron módon publikálnak, reagálnak a kifogásokra, versenytársi ellentámadásokat indítanak, és konszenzusra törekednek."),
      durationSec: 10
    },
    {
      id: 5,
      title: t("5. Lead Intelligence Analyst Synthesis", "5. Syntéza hlavného spravodajského analytika", "5. Vezető hírszerzési elemző szintézise"),
      shortLabel: t("5. Strategy Synthesis", "5. Syntéza stratégie", "5. Stratégiai szintézis"),
      tagline: t("AI reveals critical vulnerabilities and formulates a strategic action plan.", "AI odhalí kritické zraniteľné miesta a vypracuje strategický akčný plán.", "Az AI feltárja a kritikus sebezhetőségeket, és kidolgoz egy stratégiai cselekvési tervet."),
      userAction: t("Watch the analytical engine parse simulation debates, uncover risks, and formulate objection scripts.", "Sledujete, ako analytický motor spracováva dialógy simulácie, odhaľuje riziká a formuluje odpovede na námietky.", "Figyelje, ahogy az elemzőmotor feldolgozza a szimulációs vitákat, feltárja a kockázatokat, és kifogáskezelő forgatókönyveket fogalmaz meg."),
      engineAction: t("Lead analyst parses 30+ agent interactions, calculates counter-measures, and generates executive briefing.", "Hlavný analytik analyzuje interakcie 30+ agentov, vyhodnocuje protiopatrenia a generuje manažérsky briefing.", "A vezető elemző több mint 30 ágens interakcióit elemzi, ellenlépéseket dolgoz ki, és vezetői eligazítást állít össze."),
      durationSec: 6
    },
    {
      id: 6,
      title: t("6. Strategic Briefing & Interrogation Hub", "6. Manažérsky briefing & Interrogačný hub", "6. Stratégiai eligazítás és kérdezőközpont"),
      shortLabel: t("6. Results & Chatbot", "6. Výsledky & Chatbot", "6. Eredmények és chatbot"),
      tagline: t("Study the action plan and cross-examine agents via the right-hand chatbot panel.", "Preštudujte si strategický plán a krížovo vypočúvajte agentov cez pravý chatbot panel.", "Tanulmányozza a cselekvési tervet, és kérdezze ki az ágenseket a jobb oldali chatbot panelen."),
      userAction: t("Read the executive briefing on the left and ask follow-up questions to the analyst or simulated clients on the right.", "Naľavo si prečítate manažérsky briefing a napravo môžete kedykoľvek klásť doplňujúce otázky analytikovi alebo simulovaným zákazníkom.", "Bal oldalon elolvassa a vezetői eligazítást, jobb oldalon pedig bármikor feltehet további kérdéseket az elemzőnek vagy a szimulált ügyfeleknek."),
      engineAction: t("Answers questions citing simulated debate evidence, explains objection roots, and advises how to close deals.", "Odpovedá na otázky s citáciami zo simulovanej debaty, vysvetľuje dôvody námietok a radí, ako úspešne uzatvoriť obchody.", "Válaszol a kérdésekre a szimulált vita idézeteivel, elmagyarázza a kifogások okait, és tanácsot ad az üzlet sikeres lezárásához."),
      durationSec: 12
    }
  ], [systemLanguage]);

  const [currentStep, setCurrentStep] = useState(1);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  // Interactive step simulation states
  const [warRoomRound, setWarRoomRound] = useState(1);
  const [typedProposal, setTypedProposal] = useState('');
  const [synthesisProgress, setSynthesisProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stepMeta = demoSteps[currentStep - 1];

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
          if (currentStep < demoSteps.length) {
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
  }, [isOpen, isPlaying, currentStep, stepMeta.durationSec, demoSteps.length]);

  // Step 1: Simulated typing effect for scenario
  useEffect(() => {
    if (currentStep === 1) {
      const fullText = systemLanguage === 'hu'
        ? "Enterprise csomag átszervezése: +25% áremelés, garantált 99.9% SLA rendelkezésre állás, dedikált WhatsApp mérnöki csatorna, EU hosting és 6 hónapos türelmi idő a korábbi árakon a meglévő ügyfeleknek."
        : systemLanguage === 'sk'
        ? "Reštrukturalizácia balíka Enterprise: +25% zvýšenie cien, garantované 99.9% SLA dostupnosti, dedikovaný WhatsApp komunikačný kanál s inžiniermi, hosting v EÚ a 6-mesačná ochranná lehota na pôvodných cenách pre súčasných zákazníkov."
        : "Enterprise tier restructuring: +25% price increase, 99.9% uptime SLA, dedicated WhatsApp engineer channel, EU hosting, and a 6-month grandfathering grace period on original rates.";
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
  }, [currentStep, systemLanguage]);

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
    if (currentStep < demoSteps.length) {
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
              <h2 className="text-body font-bold tracking-tight text-white">{t("Interactive SAI Process Walkthrough", "Interaktívna prehliadka procesu SAI", "Interaktív SAI folyamatbemutató")}</h2>
              <span className="px-2 py-0.5 rounded-full type-overline bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {t("Live Simulation Showcase", "Živá ukážka simulácie", "Élő szimulációs bemutató")}
              </span>
            </div>
            <p className="text-caption text-slate-400">{t("Step", "Krok", "Lépés")} {currentStep} {t("of", "zo", "/")}{demoSteps.length}: {stepMeta.title}</p>
          </div>
        </div>

        {/* Stepper Navigation Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-2xl border border-slate-800">
          {demoSteps.map(s => {
            const isActive = s.id === currentStep;
            const isPassed = s.id < currentStep;
            return (
              <button
                key={s.id}
                onClick={() => handleSelectStep(s.id)}
                className={`px-3 py-1.5 rounded-xl text-ui font-bold transition flex items-center gap-1.5 cursor-pointer ${
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
            className={`p-2 rounded-xl text-ui font-bold transition flex items-center gap-1.5 cursor-pointer ${
              isPlaying ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-emerald-600 text-white'
            }`}
            title={isPlaying ? t("Pause Walkthrough", "Pozastaviť prehliadku", "Bemutató szüneteltetése") : t("Resume Walkthrough", "Spustiť prehliadku", "Bemutató folytatása")}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-amber-300" /> : <Play className="w-4 h-4 fill-white" />}
            <span className="text-caption">{isPlaying ? t("Pause", "Pozastaviť", "Szünet") : t("Play", "Prehrať", "Lejátszás")}</span>
          </button>

          <button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
            title={t("Previous Step", "Predchádzajúci krok", "Előző lépés")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={handleNextStep}
            disabled={currentStep === demoSteps.length}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition cursor-pointer"
            title={t("Next Step", "Nasledujúci krok", "Következő lépés")}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleRestart}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title={t("Restart from Step 1", "Reštartovať od 1. kroku", "Újraindítás az 1. lépéstől")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1" />

          <button
            onClick={onStartRealRehearsal}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-ui shadow-md transition cursor-pointer"
          >
            {t("Launch Real Simulation", "Spustiť reálnu simuláciu", "Valós szimuláció indítása")}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition cursor-pointer ml-1"
            title={t("Exit Walkthrough", "Ukončiť ukážku", "Kilépés a bemutatóból")}
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
        <div className="flex flex-col ws-md:flex-row items-start ws-md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-ui font-bold text-emerald-300">{stepMeta.title}</span>
            </div>
            <p className="text-body font-semibold text-slate-200">{stepMeta.tagline}</p>
          </div>

          <div className="flex items-center gap-6 text-ui text-slate-300 bg-slate-950/60 px-4 py-2 rounded-2xl border border-slate-800/80">
            <div>
              <span className="type-overline text-indigo-400 block">👤 {t("User Action", "Akcia používateľa", "Felhasználói művelet")}</span>
              <span className="text-caption text-slate-200">{stepMeta.userAction}</span>
            </div>
            <div className="border-l border-slate-800 pl-4">
              <span className="type-overline text-emerald-400 block">⚡ {t("System Engine", "Činnosť systému", "Rendszerművelet")}</span>
              <span className="text-caption text-slate-200">{stepMeta.engineAction}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col">
        <div className="w-full flex-1 flex flex-col">
          
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
                      <h3 className="text-title-sm font-bold text-slate-900">{t("Define the strategic scenario & hypothesis", "Definujte strategický scenár a hypotézu", "Határozza meg a stratégiai forgatókönyvet és a hipotézist")}</h3>
                      <p className="text-ui text-slate-500">{t("Which business decision do you want to test before you publish it?", "Aké obchodné rozhodnutie si chcete otestovať pred jeho zverejnením?", "Melyik üzleti döntést szeretné tesztelni a közzététel előtt?")}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-ui font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    {t("Step 1 of 6", "Krok 1 zo 6", "1. lépés / 6")}
                  </span>
                </div>

                <div className="space-y-4 text-ui">
                  <div>
                    <label className="text-slate-700 block mb-1.5 type-overline">
                      {t("Strategic proposal title", "Názov strategického návrhu", "A stratégiai javaslat neve")}
                    </label>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-semibold text-slate-800">
                      {t("Enterprise tier restructuring (25% price-change simulation)", "Reštrukturalizácia balíka Enterprise (simulácia 25% úpravy cien)", "Enterprise csomag átszervezése (25%-os árváltozás szimulációja)")}
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-700 block mb-1.5 type-overline">
                      {t("Strategic hypothesis & decision", "Strategická hypotéza a rozhodnutie", "Stratégiai hipotézis és döntés")}
                    </label>
                    <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 font-medium text-indigo-900 leading-relaxed min-h-17.5">
                      {typedProposal || t("Writing the brief...", "Písanie zadania...", "A feladat írása...")}
                      <span className="inline-block w-1.5 h-4 bg-indigo-600 ml-1 animate-pulse align-middle" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-3 pt-2">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-caption mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{t("CRM time horizon", "Časový horizont CRM", "CRM időhorizont")}</span>
                      </div>
                      <span className="text-body font-bold text-slate-900">{t("12 months", "12 mesiacov", "12 hónap")}</span>
                      <span className="text-micro text-slate-400 block">{t("Drawn from past won and lost deals", "Čerpá z minulých vyhratých a prehratých obchodov", "Korábbi megnyert és elvesztett üzletekből")}</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-caption mb-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>{t("Swarm size", "Veľkosť roju", "Raj mérete")}</span>
                      </div>
                      <span className="text-body font-bold text-slate-900">{t("20 autonomous personas", "20 autonómnych persón", "20 autonóm perszóna")}</span>
                      <span className="text-micro text-slate-400 block">{t("Buyers, competitors & regulators", "Nákupcovia, konkurencia a regulátori", "Vevők, versenytársak és szabályozók")}</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-1.5 text-slate-500 font-bold text-caption mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t("Simulation rounds", "Simulačné kolá", "Szimulációs körök")}</span>
                      </div>
                      <span className="text-body font-bold text-slate-900">{t("3 rounds (24h cycle)", "3 kolá (24h cyklus)", "3 kör (24 órás ciklus)")}</span>
                      <span className="text-micro text-slate-400 block">{t("Models day and night behaviour", "Modeluje denný a nočný režim", "A nappali és éjszakai működést modellezi")}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={handleNextStep}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-ui shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>{t("Continue to the estimate", "Prejsť na predbežný odhad", "Tovább az előzetes becsléshez")}</span>
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
                      <h3 className="text-title-sm font-bold text-slate-900">{t("Preflight cost & safety estimate", "Predbežný odhad nákladov a bezpečnosti", "Előzetes költség- és biztonságbecslés")}</h3>
                      <p className="text-ui text-slate-500">{t("Token volume and safety limits before the model runs", "Výpočet objemu tokenov a overenie bezpečnostných limitov pred spustením modelu", "Tokenmennyiség és biztonsági limitek a modell indítása előtt")}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-ui font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {t("Step 2 of 6", "Krok 2 zo 6", "2. lépés / 6")}
                  </span>
                </div>

                <div className="grid grid-cols-2 ws-md:grid-cols-4 gap-3 text-ui">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-caption text-slate-500 font-bold block">{t("Input volume", "Objem vstupu", "Bemenet mennyisége")}</span>
                    <span className="text-title font-bold text-slate-900 mt-1 block">~42,500</span>
                    <span className="text-micro text-slate-400">{t("Ontology + personas", "Ontológia + persóny", "Ontológia + perszónák")}</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-caption text-slate-500 font-bold block">{t("Generated moves", "Generované ťahy", "Generált lépések")}</span>
                    <span className="text-title font-bold text-indigo-600 mt-1 block">{t("~48 calls", "~48 volaní", "~48 hívás")}</span>
                    <span className="text-micro text-slate-400">{t("Filtered by the night cycle", "Filtrované nočným cyklom", "Éjszakai ciklussal szűrve")}</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-caption text-slate-500 font-bold block">{t("GPT-5.6 Terra price", "Cena GPT-5.6 Terra", "GPT-5.6 Terra ára")}</span>
                    <span className="text-title font-bold text-indigo-600 mt-1 block">0.064 €</span>
                    <span className="text-micro text-slate-400">{t("1.50 € / 1M tokens (deep analysis)", "1.50 € / 1M tokenov (hĺbková analýza)", "1.50 € / 1M token (mély elemzés)")}</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-caption text-slate-500 font-bold block">{t("GPT-5.6 Luna price", "Cena GPT-5.6 Luna", "GPT-5.6 Luna ára")}</span>
                    <span className="text-title font-bold text-purple-600 mt-1 block">0.011 €</span>
                    <span className="text-micro text-slate-400">{t("0.25 € / 1M tokens (cost-optimised)", "0.25 € / 1M tokenov (cenovo optimalizovaný)", "0.25 € / 1M token (árra optimalizált)")}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-ui">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>{t("Safety checks passed", "Bezpečnostné overenia v poriadku", "A biztonsági ellenőrzések rendben")}</span>
                  </div>
                  <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-2 text-caption text-emerald-900">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{t("Budget cap limited to 5.00 €", "Rozpočtový strop obmedzený na 5.00 €", "Költségkeret 5.00 €-ra korlátozva")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{t("Personal data anonymised", "Osobné údaje anonymizované", "Személyes adatok anonimizálva")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{t("Circadian cycle active", "Cirkadiánny cyklus aktívny", "Cirkadián ciklus aktív")}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center">
                  <button
                    onClick={handlePrevStep}
                    className="px-4 py-2 rounded-xl text-ui font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    ← {t("Back to the scenario", "Späť na scenár", "Vissza a forgatókönyvhöz")}
                  </button>
                  <button
                    onClick={handleNextStep}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-ui shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>{t("Authorise & synthesise swarm personas", "Autorizovať a syntetizovať persóny roju", "Engedélyezés és a raj perszónáinak szintetizálása")}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 3: Swarm Persona Synthesis */}
          {currentStep === 3 && (
            <div className="flex-1 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-5 flex-1 min-h-0">
                
                {/* Persona Ingestion Feed */}
                <div className="ws-lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 flex flex-col h-130 min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-ui font-bold text-slate-800">
                        {t(
                          `CRM persona feed (${DEMO_AGENTS.length} agents)`,
                          `Prúd načítaných persón z CRM (${DEMO_AGENTS.length} agentov)`,
                          `CRM-ből betöltött perszónák (${DEMO_AGENTS.length} ágens)`,
                        )}
                      </h4>
                    </div>
                    <span className="text-micro font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {t("Grounded in CRM deals", "Ukotvené v obchodoch CRM", "CRM üzletekhez kötve")}
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
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-ui text-white shrink-0 ${
                              agent.stance === 'opposing' ? 'bg-rose-500' : agent.stance === 'supportive' ? 'bg-emerald-600' : 'bg-slate-600'
                            }`}>
                              {agent.displayName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-ui font-bold text-slate-900 truncate">{agent.displayName}</div>
                              <div className="text-micro text-slate-500 truncate">{agent.profession}</div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full type-overline shrink-0 ${
                            agent.stance === 'opposing' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : agent.stance === 'supportive'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {agent.stance === 'opposing' ? t('Opposing', 'Nesúhlasný', 'Ellenző') : agent.stance === 'supportive' ? t('Supportive', 'Podporujúci', 'Támogató') : t('Neutral', 'Neutrálny', 'Semleges')}
                          </span>
                        </div>
                        <p className="text-caption text-slate-600 pl-10 leading-relaxed italic">
                          "{agent.userChar}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dynamic Swarm Knowledge Graph */}
                <div className="ws-lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 flex flex-col h-130 min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <h4 className="text-ui font-bold text-slate-800">
                        {t("Dynamic knowledge graph & relationships", "Dynamický graf znalostí a vzájomné vzťahy", "Dinamikus tudásgráf és kapcsolatok")}
                      </h4>
                    </div>
                    <span className="text-micro font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                      {t("5 nodes / 4 dynamic links", "5 uzlov / 4 dynamické väzby", "5 csomópont / 4 dinamikus kapcsolat")}
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
                    <h3 className="text-body font-bold text-slate-900">{t("Step 4: autonomous market simulation in progress", "Krok 4: prebieha autonómna trhová simulácia", "4. lépés: autonóm piaci szimuláció folyamatban")}</h3>
                    <p className="text-ui text-slate-500">{t("Personas debate, raise objections and react to the proposed changes in real time", "Persóny diskutujú, vznášajú námietky a reagujú na navrhované zmeny v reálnom čase", "A perszónák vitatkoznak, kifogásokat emelnek, és valós időben reagálnak a javasolt változásokra")}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-ui">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="type-overline text-slate-400 block">{t("Simulated time", "Simulovaný čas", "Szimulált idő")}</span>
                    <span className="font-bold text-slate-700">14:00 CET</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="type-overline text-slate-400 block">{t("Viral response", "Virálna odozva", "Virális visszhang")}</span>
                    <span className="font-bold text-purple-600">{currentMetric.viralIndex}%</span>
                  </div>
                </div>
              </div>

              {/* Feed & Graph Columns */}
              <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-5 flex-1 min-h-0">
                {/* Live Feed Stream */}
                <div className="ws-lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex flex-col h-125 min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                    <span className="text-ui font-bold text-slate-800 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                      {t("Autonomous social feed", "Autonómny sociálny kanál", "Autonóm közösségi folyam")} ({warRoomPosts.length} {t("posts", "príspevkov", "bejegyzés")})
                    </span>
                    <span className="text-micro font-bold text-slate-400">{t("Live streaming", "Priebežné streamovanie", "Folyamatos közvetítés")}</span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pt-3 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                    {[...warRoomPosts].reverse().map(post => (
                      <div 
                        key={post.id} 
                        className="p-3.5 bg-slate-50/70 hover:bg-white border border-slate-200/80 rounded-2xl shadow-xs transition duration-200 animate-in fade-in slide-in-from-top-2 duration-300 group flex flex-col space-y-2"
                      >
                        <div className="flex items-center justify-between text-ui">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-ui flex items-center justify-center shrink-0">
                              {post.agentName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition truncate">{post.agentName}</span>
                              <span className="text-micro text-slate-400 font-mono ml-1.5 truncate">@{post.agentUsername}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full type-overline shrink-0 ${
                            post.sentimentScore > 0.2 ? 'bg-emerald-50 text-emerald-700' : post.sentimentScore < -0.2 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {post.sentimentScore > 0.2 ? t('Supportive', 'Podporujúci', 'Támogató') : post.sentimentScore < -0.2 ? t('Opposing', 'Nesúhlasný', 'Ellenző') : t('Neutral', 'Neutrálny', 'Semleges')}
                          </span>
                        </div>
                        <div className="text-ui text-slate-700 mt-1 leading-relaxed">
                          <Markdown content={post.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Graph Canvas */}
                <div className="ws-lg:col-span-6 bg-white rounded-3xl border border-slate-200 shadow-sm p-3 flex flex-col h-125 min-h-0 overflow-hidden">
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
                  <h3 className="text-title font-bold text-slate-900">{t("Lead intelligence analyst synthesis", "Syntéza hlavného spravodajského analytika", "Vezető hírszerzési elemző szintézise")}</h3>
                  <p className="text-ui text-slate-500">{t("Turning 3 rounds of debate into strategic findings and objection replies", "Spracovanie dialógu z 3 kôl do strategických zistení a odpovedí na námietky", "3 kör vita feldolgozása stratégiai megállapításokká és kifogásválaszokká")}</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200 p-0.5">
                  <div 
                    className="bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-200"
                    style={{ width: `${synthesisProgress}%` }}
                  />
                </div>

                <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-3 text-left text-ui">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>{t("Critical risks", "Kritické riziká", "Kritikus kockázatok")}</span>
                    </div>
                    <p className="text-caption text-slate-500 mt-1">{t("Identified outage penalties and an EU data-sovereignty requirement.", "Identifikované sankcie za výpadky a požiadavka na suverenitu dát v EÚ.", "Azonosított kiesési kötbérek és EU-s adatszuverenitási követelmény.")}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>{t("Competitor moves", "Ťahy konkurencie", "Versenytársi lépések")}</span>
                    </div>
                    <p className="text-caption text-slate-500 mt-1">{t("Mapped competitor counter-offers that include migration discounts.", "Zmapované protiútoky konkurencie ponúkajúcej migračné zľavy.", "Feltérképezett versenytársi ellentámadások migrációs kedvezményekkel.")}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>{t("Sales arguments", "Obchodné argumenty", "Értékesítési érvek")}</span>
                    </div>
                    <p className="text-caption text-slate-500 mt-1">{t("Objection replies prepared for the sales team.", "Pripravené odpovede na námietky pre obchodný tím.", "A kifogásokra kész válaszok az értékesítő csapatnak.")}</p>
                  </div>
                </div>

                <button
                  onClick={handleNextStep}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-ui shadow-md transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>{t("Show the executive briefing & chatbot", "Zobraziť manažérsky briefing a chatbota", "Vezetői eligazítás és chatbot megjelenítése")}</span>
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
                hypothesis={t(
                  "Enterprise tier restructuring: +25% price increase, 99.9% SLA and dedicated WhatsApp support.",
                  "Reštrukturalizácia balíka Enterprise: +25% zvýšenie cien, 99.9% SLA a dedikovaná podpora cez WhatsApp.",
                  "Enterprise csomag átszervezése: +25% áremelés, 99.9% SLA és dedikált WhatsApp támogatás."
                )}
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
