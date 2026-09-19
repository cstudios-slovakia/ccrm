/**
 * OpenExecutive C-Suite Roster & Domain Specialists
 * Provides rich metadata, color mappings, and domain suggestions for each role.
 */

import {
  EXECUTIVE_ORCHESTRATOR_PROMPT,
  CSO_PROMPT,
  CFO_PROMPT,
  CHRO_PROMPT,
  GC_PROMPT,
  COO_PROMPT,
  CMO_PROMPT,
  CPO_PROMPT,
  BOARD_COMMS_PROMPT,
} from "./executivePrompts";
import { VERSION_CODENAME } from "../version";

export interface ExecutiveRole {
  id: string;
  key: string;
  name: string;
  position: string;
  positionSk: string;
  positionHu: string;
  roleCategory: "orchestrator" | "strategy" | "finance" | "people" | "legal" | "operations" | "marketing" | "product" | "governance" | "custom";
  color: "purple" | "emerald" | "amber" | "rose" | "slate" | "cyan" | "orange" | "indigo" | "blue";
  badge: string;
  isOrchestrator: boolean;
  isAutonomous: boolean;
  skillContent: string;
  suggestedPrompts: {
    en: string[];
    sk: string[];
    hu: string[];
  };
  description: {
    en: string;
    sk: string;
    hu: string;
  };
}

export const DEFAULT_EXECUTIVE_ROSTER: ExecutiveRole[] = [
  {
    id: "orchestrator",
    key: "orchestrator",
    name: `Executive Leader (${VERSION_CODENAME})`,
    position: "Executive Orchestrator & Principal Advisor",
    positionSk: "Výkonný riaditeľ a hlavný poradca",
    positionHu: "Vezérigazgató és Főtanácsadó",
    roleCategory: "orchestrator",
    color: "purple",
    badge: "Flagship AI Leader",
    isOrchestrator: true,
    isAutonomous: false,
    skillContent: EXECUTIVE_ORCHESTRATOR_PROMPT,
    suggestedPrompts: {
      en: [
        "Synthesize our quarterly performance and identify our #1 risk.",
        "What are the top 3 strategic priorities we should execute this month?",
        "How should we allocate capital and hiring resources for next quarter?"
      ],
      sk: [
        "Zosumarizuj náš kvartálny výkon a identifikuj naše #1 najväčšie riziko.",
        "Aké sú 3 najdôležitejšie strategické priority na tento mesiac?",
        "Ako by sme mali rozdeliť rozpočet a náborové kapacity na ďalší kvartál?"
      ],
      hu: [
        "Foglald össze a negyedéves teljesítményünket és nevezd meg a legfőbb kockázatot.",
        "Mi az a 3 legfontosabb stratégiai prioritás, amit ebben a hónapban meg kell lépnünk?",
        "Hogyan osszuk el a tőkét és a toborzási kapacitásokat a következő negyedévre?"
      ]
    },
    description: {
      en: "25-year veteran operator with Harvard MBA rigor. Synthesizes all functional domains into unified executive direction.",
      sk: "Skúsený líder s 25-ročnou praxou a prístupom z Harvard MBA. Spája všetky oblasti do jednotného vedenia firmy.",
      hu: "25 éves vezetői tapasztalattal és Harvard MBA szemlélettel rendelkező operátor, aki egységes döntéssé gyúrja az összes szakterületet."
    }
  },
  {
    id: "cso",
    key: "cso",
    name: "Chief Strategy Officer (CSO)",
    position: "Competitive Strategy & Market Positioning",
    positionSk: "Konkurenčná stratégia a trhové poziciovanie",
    positionHu: "Versenystratégia és Piaci Pozicionálás",
    roleCategory: "strategy",
    color: "emerald",
    badge: "Strategy & Moats",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: CSO_PROMPT,
    suggestedPrompts: {
      en: [
        "Analyze our competitive moat and counter-positioning in the market.",
        "Evaluate a beachhead strategy for entering a new client segment.",
        "Review our OKR alignment across 3-year horizons (70/20/10 rule)."
      ],
      sk: [
        "Analyzuj našu konkurenčnú výhodu (moat) a poziciovanie na trhu.",
        "Zhodnoť beachhead stratégiu pre vstup do nového zákazníckeho segmentu.",
        "Skontroluj zarovnanie našich OKR cieľov podľa pravidla 70/20/10."
      ],
      hu: [
        "Elemezd a versenyelőnyünket (moat) és piaci pozíciónkat.",
        "Értékeld a hídfőállás-stratégiánkat (beachhead) egy új ügyfélszegmens meghódításához.",
        "Vizsgáld felül az OKR céljainkat a 3 horizontos (70/20/10) modell alapján."
      ]
    },
    description: {
      en: "Specialist in competitive positioning, TAM/SAM/SOM, moat engineering, and long-horizon OKRs.",
      sk: "Špecialista na konkurenčné výhody, analýzu trhu, moats a dlhodobé strategické plánovanie.",
      hu: "Versenystratégiai szakértő: piaci méretezés, védvonalak (moat) és stratégiai OKR-ek."
    }
  },
  {
    id: "cfo",
    key: "cfo",
    name: "Chief Financial Officer (CFO)",
    position: "Financial Modeling, Runway & Unit Economics",
    positionSk: "Finančné modelovanie, runway a unit economics",
    positionHu: "Pénzügyi Modellezés, Kifutási Idő és Megtérülés",
    roleCategory: "finance",
    color: "amber",
    badge: "Unit Economics & Cash",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: CFO_PROMPT,
    suggestedPrompts: {
      en: [
        "Review our invoice collections, overdue aging, and cashflow health.",
        "Calculate our CAC payback period and assess if our LTV:CAC is sustainable.",
        "Assess our current burn multiple and determine if we are 'Default Alive'."
      ],
      sk: [
        "Analyzuj stav našich faktúr, nezaplatené pohľadávky a cash flow.",
        "Prepočítaj návratnosť CAC a over, či je náš pomer LTV:CAC udržateľný.",
        "Zhodnoť náš burn multiple a over, či je firma 'Default Alive'."
      ],
      hu: [
        "Elemezd a kintlévőségeinket, a lejárt számlákat és a cash flow egészségét.",
        "Számítsd ki a CAC megtérülési időnket és a LTV:CAC arány fenntarthatóságát.",
        "Értékeld a burn multiple rátánkat és a 'Default Alive' pályánkat."
      ]
    },
    description: {
      en: "Financial steward focusing on unit economics, cash runway, gross margin health, and capital allocation.",
      sk: "Finančný riaditeľ zameraný na unit economics, cash runway, ziskové marže a alokáciu kapitálu.",
      hu: "Pénzügyi vezető: unit economics, kifutási idő (runway), fedezeti hányad és tőkeallokáció."
    }
  },
  {
    id: "chro",
    key: "chro",
    name: "Chief HR Officer (CHRO)",
    position: "Talent Strategy, Comp Bands & Org Design",
    positionSk: "Talentová stratégia, odmeňovanie a dizajn organizácie",
    positionHu: "HR Vezető: Tehetség, Juttatási Sávok és Szervezet",
    roleCategory: "people",
    color: "rose",
    badge: "People & Culture",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: CHRO_PROMPT,
    suggestedPrompts: {
      en: [
        "Design a 90-day onboarding scorecard for a new key executive hire.",
        "How should we structure compensation bands (50th-75th percentile) to retain top performers?",
        "Review our organizational spans and layers: do we have over-management or bottlenecks?"
      ],
      sk: [
        "Navrhni 90-dňový scorecard pre onboarding kľúčovej vedúcej pozície.",
        "Ako nastaviť platové pásma (50.-75. percentil) na udržanie kľúčových ľudí?",
        "Zhodnoť organizačnú štruktúru: nemáme príliš veľa úrovní riadenia (spans & layers)?"
      ],
      hu: [
        "Készíts egy 90 napos onboarding scorecardot egy új vezetői pozícióhoz.",
        "Hogyan alakítsuk ki a fizetési sávokat a kulcsemberek megtartásához?",
        "Vizsgáld meg a szervezeti rétegződést (spans and layers): nincs túlbonyolítva a hierarchia?"
      ]
    },
    description: {
      en: "Architect of high-performance culture, executive scorecards, comp frameworks, and org design.",
      sk: "Tvorca firemnej kultúry, hodnotenia výkonu, odmeňovania a organizačnej štruktúry.",
      hu: "Szervezetfejlesztési és HR vezető: juttatási modellek, vezetőkiválasztás és csúcsteljesítmény."
    }
  },
  {
    id: "gc",
    key: "gc",
    name: "General Counsel (GC)",
    position: "Contracts, IP Protection & Risk Mitigation",
    positionSk: "Zmluvy, ochrana duševného vlastníctva a riziká",
    positionHu: "Jogi Főtanácsadó: Szerződések, IP és Kockázatok",
    roleCategory: "legal",
    color: "slate",
    badge: "Legal & Compliance",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: GC_PROMPT,
    suggestedPrompts: {
      en: [
        "What are the standard liability caps and indemnification terms we should enforce in client MSAs?",
        "How do we protect proprietary CRM data and IP assignment in contractor agreements?",
        "Analyze the legal and termination risks in our standard client agreement template."
      ],
      sk: [
        "Aké limity zodpovednosti (liability caps) a záruky máme vyžadovať v klientskych zmluvách?",
        "Ako najlepšie ochrániť duševné vlastníctvo (IP) a know-how pri externých dodávateľoch?",
        "Aké sú kľúčové riziká pri vypovedaní zmluvy s meškajúcim klientom?"
      ],
      hu: [
        "Milyen felelősségkorlátozási (liability cap) és kártalanítási záradékokat alkalmazzunk az ügyfélszerződésekben?",
        "Hogyan biztosítsuk a szellemi tulajdon (IP) védelmét alvállalkozói szerződésekben?",
        "Milyen jogi és felmondási kockázatokkal kell számolnunk késedelmes fizetés esetén?"
      ]
    },
    description: {
      en: "Corporate legal strategist overseeing MSAs, SLAs, intellectual property, and commercial risk mitigation.",
      sk: "Právny poradca pre klientske zmluvy, licencie, duševné vlastníctvo a zmierňovanie rizík.",
      hu: "Vállalati jogi tanácsadó: szerződéses struktúrák, IP-védelem és kereskedelmi kockázatkezelés."
    }
  },
  {
    id: "coo",
    key: "coo",
    name: "Chief Operating Officer (COO)",
    position: "Operations, Process Architecture & Scaling",
    positionSk: "Operatíva, procesná architektúra a škálovanie",
    positionHu: "Operatív Vezető: Folyamatok, Hatékonyság és Skálázás",
    roleCategory: "operations",
    color: "cyan",
    badge: "Execution & Scaling",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: COO_PROMPT,
    suggestedPrompts: {
      en: [
        "Identify delivery bottlenecks across our active projects and open tasks.",
        "How can we streamline client onboarding and reduce time-to-first-value?",
        "Audit our vendor costs and tooling stack for consolidation opportunities."
      ],
      sk: [
        "Identifikuj úzke miesta (bottlenecks) v našich rozpracovaných projektoch a úlohách.",
        "Ako môžeme zrýchliť onboarding nových klientov a skrátiť čas dodania?",
        "Zhodnoť naše náklady na externé nástroje a nájdi priestor na optimalizáciu."
      ],
      hu: [
        "Azonosítsd a szűk keresztmetszeteket (bottlenecks) az aktív projektjeinkben és feladatainkban.",
        "Hogyan gyorsíthatjuk az új ügyfelek bevezetését (onboarding) és a projektátadást?",
        "Vizsgáld felül az előfizetéseinket és eszközköltségeinket konszolidációs lehetőségekért."
      ]
    },
    description: {
      en: "Operational engine driving process discipline, delivery velocity, resource utilization, and vendor ROI.",
      sk: "Riaditeľ operatívy zameraný na procesnú disciplínu, rýchlosť dodávok a efektívnosť.",
      hu: "Operatív vezető: folyamatstandardok (SOP), szűk keresztmetszetek felszámolása és kapacitástervezés."
    }
  },
  {
    id: "cmo",
    key: "cmo",
    name: "Chief Marketing Officer (CMO)",
    position: "GTM Strategy, Positioning & Demand Gen",
    positionSk: "GTM stratégia, positioning a generovanie dopytu",
    positionHu: "Marketing Vezető: Piacra Lépés, Pozicionálás és Értékesítés",
    roleCategory: "marketing",
    color: "orange",
    badge: "GTM & Demand",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: CMO_PROMPT,
    suggestedPrompts: {
      en: [
        "Analyze our lead conversion funnel and diagnose where leads are dropping off.",
        "Refine our core value proposition to differentiate sharply from direct competitors.",
        "What are the highest-ROI acquisition channels for our B2B agency services?"
      ],
      sk: [
        "Analyzuj konverzný lievik našich leadov a zisti, kde prichádzame o potenciálnych klientov.",
        "Prepracuj našu hlavnú hodnotovú ponuku (value proposition) voči konkurencii.",
        "Ktoré akvizičné kanály majú najvyššiu návratnosť (ROI) pre naše B2B služby?"
      ],
      hu: [
        "Elemezd a lead-konverziós tölcsérünket: hol akadnak el a potenciális ügyfelek?",
        "Finomhangold az értékajánlatunkat (value proposition) a versenytársakkal szemben.",
        "Melyek a legmagasabb megtérülésű (ROI) ügyfélszerzési csatornák a szolgáltatásainkhoz?"
      ]
    },
    description: {
      en: "Growth and brand architect driving ICP definition, conversion velocity, positioning, and CAC reduction.",
      sk: "Marketingový stratég pre definovanie ICP zákazníkov, konverzie a rast dopytu.",
      hu: "Növekedési és marketing vezető: célcsoport-pozicionálás, keresletgenerálás és márkaérték."
    }
  },
  {
    id: "cpo",
    key: "cpo",
    name: "Chief Product Officer (CPO)",
    position: "Product Roadmap, Feature RICE & PLG",
    positionSk: "Produktový roadmap, RICE prioritizácia a PLG",
    positionHu: "Termékvezető: Útiterv, RICE Prioritizálás és Termékstratégia",
    roleCategory: "product",
    color: "indigo",
    badge: "Product & Roadmap",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: CPO_PROMPT,
    suggestedPrompts: {
      en: [
        "Score our upcoming feature backlog using the RICE prioritization framework.",
        "How do we balance technical debt refactoring vs. client-requested custom features?",
        "What core product loop can increase client retention and expansion revenue?"
      ],
      sk: [
        "Ohodnoť náš backlog nových funkcií pomocou RICE prioritizácie.",
        "Ako vyvážiť technický dlh voči požiadavkám klientov na nové funkcie?",
        "Aká produktová vlastnosť nám prinesie najvyššiu retenciu a expanziu klientov?"
      ],
      hu: [
        "Értékeld a tervezett funkciókat a RICE prioritizációs keretrendszerrel.",
        "Hogyan találjuk meg az egyensúlyt a technikai adósság és az új funkciók között?",
        "Mely termékfunkciók növelik leginkább az ügyfélmegtartást és az elégedettséget?"
      ]
    },
    description: {
      en: "Product visionary leveraging RICE scoring, product-led growth loops, and customer discovery insights.",
      sk: "Produktový riaditeľ pre RICE prioritizáciu, roadmap a orientáciu na reálne potreby zákazníkov.",
      hu: "Termékstratéga: RICE prioritizálás, termékútiterv és ügyfélközpontú fejlesztés."
    }
  },
  {
    id: "board_comms",
    key: "board_comms",
    name: "Board Communications Director",
    position: "Investor Relations, Board Decks & Governance",
    positionSk: "Vzťahy s investormi, board prezentácie a governance",
    positionHu: "Igazgatótanácsi és Befektetői Kapcsolatok Igazgatója",
    roleCategory: "governance",
    color: "blue",
    badge: "Board & Governance",
    isOrchestrator: false,
    isAutonomous: false,
    skillContent: BOARD_COMMS_PROMPT,
    suggestedPrompts: {
      en: [
        "Draft an executive briefing slide narrative on our revenue trajectory and margin variance.",
        "How should we structure our quarterly board memo to address our primary strategic dilemma?",
        "Prepare a high-signal monthly investor update summarizing wins, metrics, and asks."
      ],
      sk: [
        "Priprav text pre manažérsku prezentáciu o vývoji tržieb a marží.",
        "Ako štruktúrovať kvartálnu správu pre vedenie s riešením našej hlavnej strategickej dilemy?",
        "Priprav vysoko-informačný mesačný update pre investorov s kľúčovými metrikami."
      ],
      hu: [
        "Készíts egy vezetői összefoglaló narratívát a bevételeink alakulásáról és árréseinkről.",
        "Hogyan építsük fel a negyedéves igazgatótanácsi emlékeztetőt a stratégiai dilemmánk kapcsán?",
        "Fogalmazz meg egy tömör, magas információértékű havi befektetői tájékoztatót."
      ]
    },
    description: {
      en: "Governance and narrative director crafting high-signal board memos, investor letters, and KPI narratives.",
      sk: "Riaditeľ pre komunikáciu s investormi, board materiály a strategické reportovanie.",
      hu: "Igazgatótanácsi és befektetői kommunikációs szakértő: tiszta, transzparens vezetői narratívák."
    }
  }
];

export const EXECUTIVE_COLOR_MAP: Record<string, {
  bg: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  fill: string;
  text: string;
  activeRing: string;
  glow: string;
}> = {
  purple: {
    bg: "from-purple-500/10 via-indigo-500/5 to-transparent",
    badgeBg: "bg-purple-100 text-purple-700 border-purple-200",
    badgeText: "text-purple-700",
    border: "border-purple-200 hover:border-purple-300",
    fill: "bg-purple-600",
    text: "text-purple-600",
    activeRing: "ring-2 ring-purple-600 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(147,51,234,0.15)]"
  },
  emerald: {
    bg: "from-emerald-500/10 via-teal-500/5 to-transparent",
    badgeBg: "bg-emerald-100 text-emerald-700 border-emerald-200",
    badgeText: "text-emerald-700",
    border: "border-emerald-200 hover:border-emerald-300",
    fill: "bg-emerald-600",
    text: "text-emerald-600",
    activeRing: "ring-2 ring-emerald-600 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]"
  },
  amber: {
    bg: "from-amber-500/10 via-yellow-500/5 to-transparent",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-200",
    badgeText: "text-amber-700",
    border: "border-amber-200 hover:border-amber-300",
    fill: "bg-amber-500",
    text: "text-amber-600",
    activeRing: "ring-2 ring-amber-500 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]"
  },
  rose: {
    bg: "from-rose-500/10 via-pink-500/5 to-transparent",
    badgeBg: "bg-rose-100 text-rose-700 border-rose-200",
    badgeText: "text-rose-700",
    border: "border-rose-200 hover:border-rose-300",
    fill: "bg-rose-500",
    text: "text-rose-600",
    activeRing: "ring-2 ring-rose-500 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]"
  },
  slate: {
    bg: "from-slate-500/10 via-slate-400/5 to-transparent",
    badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
    badgeText: "text-slate-700",
    border: "border-slate-300 hover:border-slate-400",
    fill: "bg-slate-700",
    text: "text-slate-700",
    activeRing: "ring-2 ring-slate-700 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(71,85,105,0.15)]"
  },
  cyan: {
    bg: "from-cyan-500/10 via-sky-500/5 to-transparent",
    badgeBg: "bg-cyan-100 text-cyan-800 border-cyan-200",
    badgeText: "text-cyan-700",
    border: "border-cyan-200 hover:border-cyan-300",
    fill: "bg-cyan-600",
    text: "text-cyan-600",
    activeRing: "ring-2 ring-cyan-600 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(8,145,178,0.15)]"
  },
  orange: {
    bg: "from-orange-500/10 via-amber-500/5 to-transparent",
    badgeBg: "bg-orange-100 text-orange-800 border-orange-200",
    badgeText: "text-orange-700",
    border: "border-orange-200 hover:border-orange-300",
    fill: "bg-orange-500",
    text: "text-orange-600",
    activeRing: "ring-2 ring-orange-500 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(249,115,22,0.15)]"
  },
  indigo: {
    bg: "from-indigo-500/10 via-violet-500/5 to-transparent",
    badgeBg: "bg-indigo-100 text-indigo-800 border-indigo-200",
    badgeText: "text-indigo-700",
    border: "border-indigo-200 hover:border-indigo-300",
    fill: "bg-indigo-600",
    text: "text-indigo-600",
    activeRing: "ring-2 ring-indigo-600 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(99,102,241,0.15)]"
  },
  blue: {
    bg: "from-blue-500/10 via-sky-500/5 to-transparent",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-200",
    badgeText: "text-blue-700",
    border: "border-blue-200 hover:border-blue-300",
    fill: "bg-blue-600",
    text: "text-blue-600",
    activeRing: "ring-2 ring-blue-600 ring-offset-2",
    glow: "shadow-[0_0_20px_rgba(37,99,235,0.15)]"
  }
};
