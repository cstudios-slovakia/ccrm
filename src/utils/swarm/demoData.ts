import type { 
  SimulationCheckpoint, 
  SwarmKnowledgeGraph, 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmRoundMetrics, 
  StrategicReport
} from './types';

export const DEMO_GRAPH: SwarmKnowledgeGraph = {
  nodes: [
    {
      id: "node_procurement",
      name: "Nákupný výbor pre Enterprise SaaS",
      type: "Buyer",
      summary: "Podnikový nákupný výbor spravujúci schvaľovanie rozpočtov, bezpečnostné previerky GDPR a vymáhateľnosť zmluvných SLA."
    },
    {
      id: "node_scaleup",
      name: "Rýchlo rastúce digitálne agentúry",
      type: "Client",
      summary: "Tímy s 20 až 80 zamestnancami závislé od rýchleho sledovania úloh a viackanálovej tímovej komunikácie."
    },
    {
      id: "node_legacy_crm",
      name: "Tradičný CRM konkurent (Legacy)",
      type: "Competitor",
      summary: "Zavedený trhový hráč účtujúci vysoké poplatky za používateľa (per-seat) a presadzujúci viacročné viazanosti."
    },
    {
      id: "node_smb",
      name: "Butikové konzultácie a malé firmy (SMB)",
      type: "Client",
      summary: "Menšie organizácie citlivé na rozpočet a mimoriadne obozretné voči nečakanému nárastu nákladov."
    },
    {
      id: "node_auditor",
      name: "Audítor dátovej suverenity a GDPR v EÚ",
      type: "Regulator",
      summary: "Odborníci na zhodu posudzujúci spracovanie údajov podľa článku 28 GDPR a hosting na serveroch v EÚ."
    }
  ],
  edges: [
    {
      id: "edge_1",
      source: "node_legacy_crm",
      target: "node_procurement",
      relation: "KRITIZUJE",
      fact: "Obchodní zástupcovia konkurencie tvrdia nákupcom, že moderným rastúcim CRM systémom chýbajú formálne SLA sankcie.",
      validFromRound: 1
    },
    {
      id: "edge_2",
      source: "node_procurement",
      target: "node_scaleup",
      relation: "HODNOTÍ",
      fact: "Podnikoví nákupcovia overujú recenzie dodávateľov a reálnu spokojnosť zákazníkov z radov partnerských agentúr.",
      validFromRound: 1
    },
    {
      id: "edge_3",
      source: "node_scaleup",
      target: "node_legacy_crm",
      relation: "SPYTHUJE",
      fact: "Agentúry vyjadrujú frustráciu z poplatkov za sedadlá v starých systémoch a vítajú integrovaný WhatsApp kanál s inžiniermi.",
      validFromRound: 2
    },
    {
      id: "edge_4",
      source: "node_auditor",
      target: "node_procurement",
      relation: "REGULUJE",
      fact: "Bezpečnostná zhoda vyžaduje overené doložky o umiestnení dát vo Frankfurte (AWS / Hetzner).",
      validFromRound: 2
    }
  ]
};

export const DEMO_AGENTS: SwarmAgentProfile[] = [
  {
    id: 1,
    username: "sarah_procure_eu",
    displayName: "Sarah Jenkins",
    profession: "Riaditeľka podnikového nákupu",
    mbti: "ESTJ",
    stance: "opposing",
    userChar: "Nekompromisná B2B nákupkyňa. Okamžite odmietne zvýšenie cien, pokiaľ nie je podložené zmluvnými pokutami za výpadok a auditovanými správami SOC2.",
    publicBio: "Riaditeľka globálneho nákupu | Optimalizácia nákladov na SaaS | Členka predstavenstva",
    followerCount: 2410,
    karma: 412,
    sourceEntityId: "node_procurement",
    interestedTopics: ["ceny", "SLA", "obstarávanie", "zmluvy"]
  },
  {
    id: 2,
    username: "marcus_scaleup",
    displayName: "Marcus Vance",
    profession: "VP prevádzky @ Hyperion Media",
    mbti: "ENTP",
    stance: "supportive",
    userChar: "Rýchlo sa rozhodujúci riaditeľ agentúry. Vidí obrovskú hodnotu v priamom WhatsApp kanáli na inžinierov, ktorý eliminuje potrebu externých konzultantov.",
    publicBio: "Škálovanie agentúr na 8-ciferné obraty | Efektivita procesov | Zástanca asynchrónnej práce",
    followerCount: 5820,
    karma: 890,
    sourceEntityId: "node_scaleup",
    interestedTopics: ["efektivita", "WhatsApp", "automatizácia", "SLA"]
  },
  {
    id: 3,
    username: "david_nexacore",
    displayName: "David Chen",
    profession: "Obchodný riaditeľ (CCO) @ LegacyCRM",
    mbti: "ENTJ",
    stance: "opposing",
    userChar: "Manažér konkurenčnej spoločnosti snažiaci sa zasiať pochybnosti o stabilite a vymáhateľnosti SLA medzi enterprise zákazníkmi.",
    publicBio: "Líder v oblasti podnikového softvéru | 20+ rokov budovania odolných systémov",
    followerCount: 8430,
    karma: 340,
    sourceEntityId: "node_legacy_crm",
    interestedTopics: ["CRM", "konkurencia", "spoľahlivosť", "enterprise"]
  },
  {
    id: 4,
    username: "elena_compliance",
    displayName: "Dr. Elena Rostova",
    profession: "Hlavná audítorka GDPR a cloudovej bezpečnosti",
    mbti: "INTJ",
    stance: "neutral",
    userChar: "Precízna posudzovateľka právnych a bezpečnostných aspektov. Zameriava sa prísne na garancie rezidencie dát a zmluvy so sprostredkovateľmi.",
    publicBio: "Výskumníčka ochrany súkromia v cloude | Audítorka GDPR | Mníchov / Viedeň",
    followerCount: 3190,
    karma: 620,
    sourceEntityId: "node_auditor",
    interestedTopics: ["GDPR", "bezpečnosť", "rezidencia dát", "compliance"]
  },
  {
    id: 5,
    username: "tomas_founder",
    displayName: "Tomáš Horváth",
    profession: "Zakladateľ @ Studio Kvantum",
    mbti: "INFP",
    stance: "supportive",
    userChar: "Dlhoročný zákazník, ktorý si cení osobnú komunikáciu. 6-mesačná ochranná lehota pôvodných cien (grandfathering) v ňom vyvoláva pocit férovosti a bezpečia.",
    publicBio: "Produktový dizajnér & zakladateľ agentúry | Bratislava | Technologický nadšenec",
    followerCount: 1420,
    karma: 480,
    sourceEntityId: "node_smb",
    interestedTopics: ["ceny", "ochranná lehota", "podpora", "komunita"]
  },
  {
    id: 6,
    username: "alex_revops",
    displayName: "Alex Mercer",
    profession: "Vedúci oddelenia tržieb a operácií (RevOps)",
    mbti: "ISTJ",
    stance: "neutral",
    userChar: "Analytik riadiaci sa tabuľkami, ktorý porovnáva celkové náklady na vlastníctvo (TCO) u jednotlivých konkurentov.",
    publicBio: "RevOps špecialista | B2B metriky | Optimalizácia predajných lievikov",
    followerCount: 2890,
    karma: 510,
    sourceEntityId: "node_procurement",
    interestedTopics: ["TCO", "cenotvorba", "ROI", "zmluvy"]
  }
];

export const DEMO_POSTS: SwarmPost[] = [
  // Round 1: Initial reactions & skepticism
  {
    id: 101,
    roundNum: 1,
    agentId: 1,
    agentName: "Sarah Jenkins",
    agentUsername: "sarah_procure_eu",
    agentProfession: "Riaditeľka podnikového nákupu",
    platform: "chitchat",
    actionType: "POST",
    content: "Zaznamenávam správy o 25% zvýšení cien pre enterprise CRM balíky. Pokiaľ to nepríde s nepriestrelnými zmluvnými poukážkami na pokuty za výpadky, cez naše nákupné oddelenie to neprejde.",
    likesCount: 28,
    quotesCount: 7,
    commentsCount: 14,
    sentimentScore: -0.65,
    createdAt: "09:12"
  },
  {
    id: 102,
    roundNum: 1,
    agentId: 3,
    agentName: "David Chen",
    agentUsername: "david_nexacore",
    agentProfession: "CCO @ LegacyCRM",
    platform: "chitchat",
    actionType: "POST",
    content: "Klasická taktika návnady a pasce. Ľahké nástroje nasadia nízke ceny na získanie klientov a pri obnove zmlúv ich šokujú 25% zdražením. Pozrite si našu garanciu fixácie cien ešte dnes.",
    likesCount: 45,
    quotesCount: 12,
    commentsCount: 19,
    sentimentScore: -0.85,
    createdAt: "09:34"
  },
  {
    id: 103,
    roundNum: 1,
    agentId: 2,
    agentName: "Marcus Vance",
    agentUsername: "marcus_scaleup",
    agentProfession: "VP prevádzky @ Hyperion",
    platform: "chitchat",
    actionType: "QUOTE",
    targetPostId: 101,
    content: "Počkaj Sarah. Pozrela si sa, čo je v cene? Priama WhatsApp podpora s ich hlavnými inžiniermi + 99.9% dostupnosť SLA. V súčasnosti platíme externej agentúre 400 €/mesiac len za údržbu integrácií. Toto nám v skutočnosti peniaze ušetrí.",
    likesCount: 62,
    quotesCount: 15,
    commentsCount: 22,
    sentimentScore: 0.75,
    createdAt: "10:15"
  },

  // Round 2: Market debate & competitor counter-tactics
  {
    id: 104,
    roundNum: 2,
    agentId: 4,
    agentName: "Dr. Elena Rostova",
    agentUsername: "elena_compliance",
    agentProfession: "GDPR & Cloud audítorka",
    platform: "forum",
    actionType: "POST",
    content: "K aktualizácii enterprise balíka: kľúčovou otázkou je, či SLA špecifikuje uloženie dát vo Frankfurte/EÚ a dedikované databázové inštancie. Ak áno, 25% navýšenie je hlboko pod trhovým štandardom pre dedikovaný zvrchovaný hosting v EÚ.",
    likesCount: 89,
    quotesCount: 18,
    commentsCount: 31,
    sentimentScore: 0.35,
    createdAt: "12:40"
  },
  {
    id: 105,
    roundNum: 2,
    agentId: 5,
    agentName: "Tomáš Horváth",
    agentUsername: "tomas_founder",
    agentProfession: "Zakladateľ @ Studio Kvantum",
    platform: "chitchat",
    actionType: "POST",
    content: "Treba uznať férovosť: 6-mesačná ochranná lehota na pôvodných cenách pre existujúcich zákazníkov je prejavom skutočného rešpektu. Žiadna nepríjemná faktúra na konci mesiaca.",
    likesCount: 54,
    quotesCount: 6,
    commentsCount: 8,
    sentimentScore: 0.80,
    createdAt: "13:10"
  },

  // Round 3: Consensus crystallization
  {
    id: 106,
    roundNum: 3,
    agentId: 6,
    agentName: "Alex Mercer",
    agentUsername: "alex_revops",
    agentProfession: "Vedúci oddelenia RevOps",
    platform: "forum",
    actionType: "POST",
    content: "Prepočítal som celkové náklady na vlastníctvo (TCO): Pri cene 249 €/mesiac s nulovým poplatkom za používateľa a bezplatnou migráciou databázy je to stále o 60 % lacnejšie než enterprise plány Salesforce alebo HubSpot s porovnateľnými SLA.",
    likesCount: 112,
    quotesCount: 24,
    commentsCount: 42,
    sentimentScore: 0.70,
    createdAt: "15:45"
  },
  {
    id: 107,
    roundNum: 3,
    agentId: 1,
    agentName: "Sarah Jenkins",
    agentUsername: "sarah_procure_eu",
    agentProfession: "Riaditeľka podnikového nákupu",
    platform: "chitchat",
    actionType: "QUOTE",
    targetPostId: 103,
    content: "Aktualizácia: Preskúmala som revidované podmienky SLA s automatickými kreditnými poukážkami, ak čas odozvy prekročí 60 minút. So 6-mesačným prechodným obdobím je to prijateľné. Dobré rokovanie.",
    likesCount: 94,
    quotesCount: 19,
    commentsCount: 17,
    sentimentScore: 0.55,
    createdAt: "16:30"
  },
  {
    id: 108,
    roundNum: 3,
    agentId: 3,
    agentName: "David Chen",
    agentUsername: "david_nexacore",
    agentProfession: "CCO @ LegacyCRM",
    platform: "chitchat",
    actionType: "POST",
    content: "Všimnite si, ako rýchlo sa dnes zmobilizovali ich obhajcovia. Podnikové riziko však nespočíva len v cene. Uvidíme, ako obstojí ich fronta podpory počas najbližšieho výpadku zóny dostupnosti na AWS.",
    likesCount: 19,
    quotesCount: 3,
    commentsCount: 11,
    sentimentScore: -0.45,
    createdAt: "18:10"
  }
];

export const DEMO_METRICS_HISTORY: SwarmRoundMetrics[] = [
  {
    round: 1,
    simulatedHour: 9,
    averageSentiment: -0.32,
    supportiveCount: 1,
    opposingCount: 4,
    neutralCount: 1,
    totalInteractions: 145,
    viralIndex: 38
  },
  {
    round: 2,
    simulatedHour: 12,
    averageSentiment: 0.08,
    supportiveCount: 2,
    opposingCount: 2,
    neutralCount: 2,
    totalInteractions: 290,
    viralIndex: 64
  },
  {
    round: 3,
    simulatedHour: 15,
    averageSentiment: 0.42,
    supportiveCount: 4,
    opposingCount: 1,
    neutralCount: 1,
    totalInteractions: 480,
    viralIndex: 82
  }
];

export const DEMO_STRATEGIC_REPORT: StrategicReport = {
  title: "Strategický briefing trhovej simulácie: Reštrukturalizácia cien balíka Enterprise & SLA v Q4",
  summary: "Simulované zavedenie 25% zvýšenia ceny enterprise balíka spojeného s 99.9% garanciou SLA a priamou WhatsApp podporou hlavných inžinierov. Trh sa posunul od počiatočnej skepsy nákupcov k 72% konsenzuálnemu schváleniu po vyjasnení automatických zľavových kreditov za výpadok a 6-mesačnej ochrannej lehoty pôvodných cien.",
  generatedAt: new Date().toISOString(),
  sections: [
    {
      title: "1. Výkonný konsenzus a polarizácia trhu",
      content: `Pôvodné oznámenie vyvolalo okamžité rozdelenie táborov medzi **nákupnými manažérmi** (ktorí označili zvýšenie cien za neopodstatnené) a **prevádzkovými lídrami agentúr** (ktorí s nadšením privítali priame spojenie s vývojármi cez WhatsApp).
      
Kľúčové zistenia:
- **Obrat čistého sentimentu**: Začínal na hodnote **-0.32** v 1. kole a do 3. kola sa vyšplhal na **+0.42**.
- **Efekt ochrannej lehoty (Grandfathering)**: 6-mesačné prechodné obdobie pre existujúce účty úplne eliminovalo odpor malých a stredných firiem (SMB) a premenilo prvotných kritikov na verejných obhajcov značky.
- **Formulácia TCO (Celkové náklady)**: Nezávislí analytici tržieb a operácií potvrdili, že cena 249 €/mesiac bez poplatkov za používateľa zostáva o viac ako 60 % výhodnejšia v porovnaní s tradičnými etablovanými konkurentmi.`
    },
    {
      title: "2. Kritické zraniteľnosti a hlavné námietky",
      content: `Simulovaní agenti poukázali na dva zásadné rizikové body, ktoré je nutné vyriešiť pred oficiálnym zverejnením:
      
1. **Vymáhateľnosť kompenzácií za výpadky** (*Sarah Jenkins, Nákup*):
   > *"Zaznamenávam správy o 25% zvýšení cien... Pokiaľ to nepríde s nepriestrelnými zmluvnými poukážkami na pokuty za výpadky, cez naše nákupné oddelenie to neprejde."*
   - Nákupcovia požadujú automatické zľavové kredity (napr. 5% zľava z faktúry za každých 30 minút výpadku) namiesto pasívnych ospravedlnení na stavovej stránke.
2. **Overenie dátovej suverenity** (*Dr. Elena Rostova, Audítorka GDPR*):
   > *"Kľúčovou otázkou je, či SLA špecifikuje uloženie dát vo Frankfurte/EÚ a dedikované databázové inštancie."*
   - Výslovné potvrdenie hostingu v EÚ a súladu s článkom 28 GDPR musí byť uvedené priamo v záhlaví oznámenia.`
    },
    {
      title: "3. Analýza protistratégie konkurencie",
      content: `Tradičný etablovaný konkurent (*David Chen / LegacyCRM*) sa pokúsil spustiť rýchlu očierňujúcu kampaň (FUD):
      
- **Taktika**: Označil úpravu cien za „fintu s návnadou a pascou“ a začal ponúkať agresívne zľavy na prechod pre cenovo citlivé menšie firmy.
- **Prečo to v simulácii zlyhalo**: Prítomnosť 6-mesačnej ochrannej lehoty jeho útok úplne neutralizovala. Zákazníci sa verejne zastali značky s poukázaním na to, že tradiční dodávatelia účtujú 4-násobne viac na poplatkoch za licencie pre jednotlivcov.`
    },
    {
      title: "4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?",
      content: `Pre úspešné presadenie tohto zvýšenia cien s nulovým odchodom zákazníkov a zrýchlenou adopciou v enterprise segmente zvoľte nasledujúci postup:`
    }
  ],
  strategicPlaybook: {
    keyVulnerabilities: [
      "Absencia výslovných automatických zľavových poukážok pri nedodržaní 1-hodinového SLA.",
      "Pokus konkurencie zasiať neistotu medzi SMB zákazníkmi ohľadom postupného navyšovania cien.",
      "Bezpečnostní audítori požadujúci zmluvný dôkaz o umiestnení dát vo Frankfurte/EÚ."
    ],
    actionableCounterMeasures: [
      "Zaveďte automatickú 'Garanciu nulových výpadkov' s predpočítanými kreditmi priamo na faktúre.",
      "Zverejnite záväzný prísľub 'Doživotnej fixácie cien' pre všetky základné balíky pre menšie firmy.",
      "Pridajte na stránku s cenníkom prehľadný dokument 'Biela kniha dátovej suverenity a bezpečnosti' na stiahnutie."
    ],
    salesObjectionPlaybook: [
      {
        objection: "25% zvýšenie cien je v súčasnom makroekonomickom prostredí príliš prudké.",
        rebuttal: "Náš enterprise balík zahŕňa dedikovaný WhatsApp prístup priamo k inžinierom, čo priamo nahrádza poplatky externým vývojárom za údržbu integrácií, ktoré bežne stoja vyše 400 € mesačne."
      },
      {
        objection: "Ako máme vedieť, že vaša 99.9% garancia SLA nie je iba marketingová fráza?",
        rebuttal: "Naše zmluvy obsahujú automatické zľavové kredity uplatnené bez akejkoľvek administratívy, pokiaľ dostupnosť klesne pod 99.9% v danom kalendárnom mesiaci."
      },
      {
        objection: "Obávame sa, že pri migrácii na vyšší balík prídeme o historické dáta.",
        rebuttal: "Každý enterprise prechod zahŕňa dedikovaného migračného špecialistu, ktorý skontroluje každý databázový záznam a automatizáciu ešte pred ostrým prepnutím."
      }
    ],
    recommendedGtmSequence: [
      "1. deň: Neverejný VIP briefing pre 20 najväčších firemných klientov s ponukou predĺženej 12-mesačnej ochrannej lehoty.",
      "7. deň: Zverejnenie jednostranového prehľadu o dátovej suverenite v EÚ a automatických zmluvných podmienkach SLA.",
      "14. deň: Verejné oznámenie nového balíka s vyzdvihnutím WhatsApp vývojárskej podpory a bezplatnej asistovanej migrácie.",
      "30. deň: Spustenie porovnávacej marketingovej kampane TCO voči tradičným CRM systémom účtujúcim poplatky za sedadlá."
    ]
  }
};

export const DEMO_SIMULATION_CHECKPOINT: SimulationCheckpoint = {
  simulationId: "demo-pricing-rehearsal",
  title: "Reštrukturalizácia cien balíka Enterprise v Q4 (Simulácia 25% úpravy cien)",
  hypothesis: "Čo ak zvýšime ročné enterprise poplatky o 25%, ale pridáme 99.9% SLA garanciu, priamu podporu vývojárov cez WhatsApp a 6-mesačnú ochrannú lehotu na pôvodných cenách?",
  currentRound: 3,
  totalRounds: 3,
  status: "completed",
  graph: DEMO_GRAPH,
  agents: DEMO_AGENTS,
  posts: DEMO_POSTS,
  metricsHistory: DEMO_METRICS_HISTORY,
  finalReport: DEMO_STRATEGIC_REPORT
};

export function getDemoAnalystAnswer(question: string): string {
  const q = question.toLowerCase();

  if (q.includes('cen') || q.includes('zvýš') || q.includes('25%') || q.includes('náklad') || q.includes('price') || q.includes('cost')) {
    return `Na základe prepisu simulácie 25% zvýšenie cien uspelo, pretože bolo spojené s vysoko hodnotnými prevádzkovými benefitmi (priamy prístup k vývojárom cez WhatsApp a 99.9% SLA). Nezávislí RevOps agenti vypočítali, že eliminácia poplatkov pre externých integrátorov ušetrila klientom viac než rozdiel 50 €/mesiac v cene. Hlavným rizikom bola počiatočná skepsa nákupkyne Sarah Jenkins, ktorá opadla po zaručení zmluvných kreditov za prípadné výpadky.`;
  }

  if (q.includes('konkuren') || q.includes('david') || q.includes('legacy') || q.includes('útok') || q.includes('competitor')) {
    return `Obchodný riaditeľ konkurencie David Chen sa pokúsil vytvoriť naratív o „falošnej návnade a pasci“ a presvedčiť enterprise klientov na prechod k LegacyCRM. Jeho kampaň však nezískala podporu, pretože existujúci klienti poukázali na to, že LegacyCRM účtuje agresívne licenčné poplatky na používateľa, ktoré sú v konečnom dôsledku o 60 % drahšie.`;
  }

  if (q.includes('námietk') || q.includes('odpoveď') || q.includes('predaj') || q.includes('objection') || q.includes('sales')) {
    return `Hlavnou obchodnou námietkou bola vymáhateľnosť kompenzácií pri výpadkoch. Nákupcom nestačil bežný sľub vysokej dostupnosti, požadovali finančné záruky. V našom strategickom pláne odporúčame vybaviť obchodníkov argumentom o „automatických zľavách z faktúry“, čo premenilo Sarah Jenkins z aktívnej odporkyne na podporovateľku.`;
  }

  if (q.includes('stratégi') || q.includes('odporúč') || q.includes('cieľ') || q.includes('postup') || q.includes('strategy') || q.includes('gtm')) {
    return `Na dosiahnutie cieľa s nulovým odchodom klientov odporúčame:
1. Osobne kontaktovať 20 najväčších firemných zákazníkov ešte pred verejným oznámením.
2. Jasne komunikovať 6-mesačnú ochrannú lehotu na pôvodných cenách pre existujúce zmluvy.
3. V tlačovej správe viditeľne zdôrazniť uloženie dát vo Frankfurte a automatické SLA kredity pri výpadku.`;
  }

  return `V tejto simulácii dosiahol trh do 3. kola 72% pozitívny konsenzus. Najsilnejším tromfom bol priamy WhatsApp komunikačný kanál na inžinierov, ktorý zákazníci ocenili oveľa viac než klasické e-mailové tickety podpory. Chcete preskúmať reakcie konkrétnych agentov alebo rozobrať protitaktiku konkurencie?`;
}

export function getDemoAgentAnswer(agentName: string, _question?: string): string {
  const name = agentName.toLowerCase();
  
  if (name.includes('sarah') || name.includes('jenkins') || name.includes('procure')) {
    return `Počúvajte, ako riaditeľka nákupu mám jedinú úlohu: minimalizovať riziká. Keď dodávateľ pýta o 25 % viac peňazí, moja predvolená odpoveď je „nie“. Ale keď ste pridali automatické zľavové kredity za porušenie SLA a zaručili uloženie dát vo Frankfurte, vyriešili ste moje zmluvné obavy. Dajte mi to na papieri a obnovenie zmluvy podpíšem.`;
  }

  if (name.includes('marcus') || name.includes('vance') || name.includes('scaleup')) {
    return `Úprimne, ten WhatsApp kanál na vašich hlavných vývojárov je pre nás obrovská výhoda. Minulý mesiac sme pri starom CRM čakali 3 dni na vybavenie požiadavky, kým naši klienti nervózne čakali. Ak môže môj tím napísať priamo inžinierovi na WhatsApp, 249 € mesačne je jednoznačná voľba.`;
  }

  if (name.includes('david') || name.includes('chen') || name.includes('nexacore') || name.includes('legacy')) {
    return `Pozorne sledujeme vaše kroky. Sľubovať 99.9% dostupnosť je jednoduché, kým ste malí, no firemní klienti rýchlo zistia, že menšie nástroje sa nemôžu rovnať globálnej infraštruktúre LegacyCRM. Budeme pripravení privítať každého zákazníka, ktorý zažije prieťahy na podpore.`;
  }

  if (name.includes('elena') || name.includes('rostova') || name.includes('compliance')) {
    return `Mojou prioritou je súlad s článkom 28 GDPR a zvrchovaný európsky hosting. Za predpokladu, že vaše SLA zmluvne garantuje spracovanie dát výhradne v dátových centrách AWS Frankfurt / Hetzner bez rizík prenosu do tretích krajín, je zvýšenie ceny plne opodstatnené.`;
  }

  return `Oboznámil som sa s navrhovaným strategickým oznámením počas simulácie. Ochranná lehota pôvodných cien a transparentná komunikácia dali nášmu tímu istotu pokračovať v rozvoji podnikania na vašej platforme.`;
}
