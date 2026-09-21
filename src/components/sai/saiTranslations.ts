/**
 * Unified Bilingual (EN / SK / HU) Translations for the SAI Module
 */

export const SAI_TRANSLATIONS = {
  // Navigation & Steps
  steps: {
    s1: { en: '1. Scenario', sk: '1. Scenár', hu: '1. Forgatókönyv' },
    s2: { en: '2. Preflight Estimate', sk: '2. Predbežný odhad', hu: '2. Becslés' },
    s3: { en: '3. Data Ingestion', sk: '3. Načítanie dát', hu: '3. Adatok betöltése' },
    s4: { en: '4. Live War Room', sk: '4. Live War Room', hu: '4. Élő War Room' },
    s5: { en: '5. Synthesis', sk: '5. Syntéza stratégie', hu: '5. Szintézis' },
    s6: { en: '6. Report & Q&A', sk: '6. Výsledky & Chatbot', hu: '6. Eredmények & Chat' },
  },

  // Execution modes
  modes: {
    title: { en: 'SIMULATION EXECUTION MODE', sk: 'REŽIM VYKONANIA SIMULÁCIE', hu: 'SZIMULÁCIÓS MÓD' },
    subtitle: { 
      en: 'Choose between an instant free demonstration or a live production simulation via OpenAI.',
      sk: 'Vyberte si medzi okamžitou bezplatnou ukážkou a ostrou simuláciou cez OpenAI.',
      hu: 'Válasszon az azonnali ingyenes bemutató vagy az éles OpenAI szimuláció között.'
    },
    demoTitle: { en: 'Demo Test', sk: 'Demo test', hu: 'Demo teszt' },
    demoCost: { en: '$0.00', sk: '0.00 €', hu: '0.00 €' },
    demoDesc: { 
      en: 'Instant synthetic simulation on demonstration data. Zero OpenAI API costs, completes in seconds.',
      sk: 'Blesková syntetická simulácia na demonštračných dátach. Nulové náklady na OpenAI API, trvá iba pár sekúnd.',
      hu: 'Villámgyors szintetikus szimuláció demo adatokon. Nulla OpenAI költség, másodpercek alatt kész.'
    },
    liveTitle: { en: 'Live Test (Live API)', sk: 'Živý test (Live API)', hu: 'Éles teszt (Live API)' },
    liveCost: { en: '~0.026 €', sk: '~0.026 €', hu: '~0.026 €' },
    liveDesc: {
      en: 'Real AI simulation with live OpenAI calls, CRM context extraction, and complete agent ReAct cycles.',
      sk: 'Skutočná AI simulácia s reálnymi OpenAI volaniami, extrakciou kontextu z CRM a plnohodnotným ReAct cyklom agentov.',
      hu: 'Valódi AI szimuláció élő OpenAI hívásokkal, CRM kontextus kinyeréssel és teljes ágens ReAct ciklussal.'
    },
    selectedBadgeDemo: { en: 'SELECTED: DEMO TEST ($0.00)', sk: 'ZVOLENÝ: DEMO TEST (0 €)', hu: 'KIVÁLASZTVA: DEMO TESZT (0 €)' },
    selectedBadgeLive: { en: 'SELECTED: LIVE TEST (LIVE API)', sk: 'ZVOLENÝ: ŽIVÝ TEST (LIVE API)', hu: 'KIVÁLASZTVA: ÉLES TESZT (LIVE API)' },
    selectedPill: { en: 'Selected', sk: 'Zvolené', hu: 'Kiválasztva' },
  },

  // Templates banner
  templates: {
    sectionTitle: { en: 'QUICK TEMPLATES & STRATEGIC SCENARIOS', sk: 'RÝCHLE ŠABLÓNY & STRATEGICKÉ SCENÁRE', hu: 'GYORS SABLONOK & FORGATÓKÖNYVEK' },
    hint: { en: 'Click a template to auto-fill fields', sk: 'Kliknutím na šablónu vyplníte polia', hu: 'Kattintson a mezők kitöltéséhez' },
    browseCatalogueBtn: { en: 'Browse Template Catalogue (105)', sk: 'Otvoriť katalóg šablón (105)', hu: 'Sablonkatalógus megnyitása (105)' },
    templateApplied: { en: 'Template applied:', sk: 'Šablóna aplikovaná:', hu: 'Sablon alkalmazva:' },
  },

  // Form Fields
  form: {
    titleLabel: { en: 'Simulation Title', sk: 'Názov simulácie', hu: 'Szimuláció neve' },
    titleHint: { en: 'Executive identifier for reports & checkpoints', sk: 'Manažérsky identifikátor pre reporty & kontrolné body', hu: 'Vezetői azonosító jelentésekhez' },
    titlePlaceholder: { en: 'e.g. Q4 Enterprise Pricing Restructuring', sk: 'napr. Reštrukturalizácia cien balíka Enterprise v Q4', hu: 'pl. Q4 Enterprise árazási átalakítás' },
    titlePurpose: {
      en: 'Primary executive title for this market simulation. Displayed across dashboards, war rooms, and export reports.',
      sk: 'Hlavný manažérsky názov a identifikátor pre túto trhovú simuláciu. Zobrazuje sa na prehľadoch, vo War Roome a v exportovaných reportoch.',
      hu: 'A piaci szimuláció fő vezetői címe. Megjelenik a dashboardokon, a war roomban és a jelentésekben.'
    },

    hypothesisLabel: { en: 'Strategic Hypothesis / What-If Variable', sk: 'Strategická hypotéza / What-If premenná', hu: 'Stratégiai hipotézis / What-If változó' },
    hypothesisHint: { en: 'Core predictive question the swarm will deliberate', sk: 'Kľúčová prediktívna otázka, o ktorej bude roj diskutovať', hu: 'A szimuláció fő prediktív kérdése' },
    hypothesisPlaceholder: { en: 'e.g. What if we raise Enterprise prices by 25% while adding guaranteed 99.9% SLA?', sk: 'napr. Čo ak zvýšime ceny o 25% a zároveň ponúkneme 99.9% SLA dostupnosť?', hu: 'pl. Mi történik, ha 25%-kal emeljük az árakat 99.9% SLA garanciával?' },
    hypothesisPurpose: {
      en: 'The core change or strategic pivot under test. Drives autonomous opinion formulation and objection tracking.',
      sk: 'Kľúčová strategická zmena alebo cenový krok, ktorý sa má otestovať. Riadi autonómnu tvorbu názorov a sledovanie námietok.',
      hu: 'A tesztelt stratégiai változás. Irányítja a véleményformálást és kifogások követését.'
    },

    seedLabel: { en: 'Input Briefing & Announcement Text', sk: 'Vstupné zadanie & Text oznámenia', hu: 'Bemeneti feladat & Bejelentés szövege' },
    seedHint: { en: 'Press release, internal memo, or pricing document', sk: 'Tlačová správa, interné memorandum alebo cenový dokument', hu: 'Sajtóközlemény, belső feljegyzés vagy árazási dokumentum' },
    seedPlaceholder: { en: 'Enter the proposed announcement text, changes, new terms, or market move...', sk: 'Zadajte text navrhovaného oznámenia, zmeny, nové podmienky...', hu: 'Adja meg a bejelentés szövegét, változásokat, új feltételeket...' },

    crmSourcesTitle: { en: 'CRM Context & Ingestion Sources', sk: 'Zdroje kontextu a dáta z CRM', hu: 'CRM kontextus és adatforrások' },
    crmSourcesHint: { en: 'Select which historical CRM intelligence and records feed the swarm ontology', sk: 'Vyberte, ktoré historické CRM záznamy a poznatky budú napájať ontológiu roja', hu: 'Válassza ki a szimulációhoz felhasznált CRM forrásokat' },

    contextDocsTitle: { en: 'Context Documents & Knowledge Base', sk: 'Kontextové dokumenty & Znalostná báza', hu: 'Kontextus dokumentumok & Tudásbázis' },
    contextDocsHint: { en: 'Upload PDF, DOCX, TXT, CSV or paste market research notes', sk: 'Nahrajte PDF, DOCX, TXT, CSV alebo vložte textové poznatky', hu: 'Töltsön fel PDF, DOCX, TXT, CSV fájlokat' },
    uploadBtn: { en: 'Upload Document', sk: 'Nahrať dokument', hu: 'Dokumentum feltöltése' },
    pasteBtn: { en: 'Paste Text', sk: 'Vložiť text', hu: 'Szöveg beillesztése' },

    audienceTitle: { en: 'Audience & Swarm Agent Personas', sk: 'Cieľové publikum & Persóny agentov', hu: 'Célközönség & Ágens személyiségek' },
    audienceHint: { en: 'Configure the distribution of personas participating in the rehearsal', sk: 'Nastavte rozloženie persón zúčastňujúcich sa simulácie', hu: 'Állítsa be a szimulációban résztvevő ágenseket' },

    budgetTitle: { en: 'Simulation Bounds & Token Budget', sk: 'Limity simulácie & Rozpočet tokenov', hu: 'Szimulációs korlátok & Token keret' },
    budgetHint: { en: 'Choose reasoning model tier, rounds, and token safety caps', sk: 'Zvoľte úroveň modelu, počet kôl a bezpečnostné limity', hu: 'Modellszint, körök száma és korlátok kiválasztása' },

    saveDraftBtn: { en: 'Save Draft', sk: 'Uložiť koncept', hu: 'Piszkozat mentése' },
    reviewLaunchBtn: { en: 'Review & Estimate Tokens', sk: 'Skontrolovať & Odhadnúť tokeny', hu: 'Ellenőrzés & Becslés' },
    backToSimsBtn: { en: 'Simulation List', sk: 'Prehľad simulácií', hu: 'Szimulációk listája' },
  },

  // War Room
  warRoom: {
    statusLive: { en: 'WAR ROOM LIVE', sk: 'WAR ROOM NAŽIVO', hu: 'WAR ROOM ÉLŐ' },
    statusFinished: { en: 'SIMULATION COMPLETE', sk: 'SIMULÁCIA DOKONČENÁ', hu: 'SZIMULÁCIÓ KÉSZ' },
    round: { en: 'Round', sk: 'Kolo', hu: 'Kör' },
    chitchatTab: { en: 'Chitchat Stream', sk: 'Chitchat kanál', hu: 'Chitchat csatorna' },
    forumTab: { en: 'Forum Discussions', sk: 'Fórum diskusie', hu: 'Fórum viták' },
    sentimentBreakdown: { en: 'Sentiment & Consensus Meter', sk: 'Rozdelenie nálad a konsenzu', hu: 'Hangulat & Konszenzus mérő' },
    pause: { en: 'Pause Simulation', sk: 'Pozastaviť simuláciu', hu: 'Szimuláció szüneteltetése' },
    resume: { en: 'Resume Simulation', sk: 'Pokračovať v simulácii', hu: 'Szimuláció folytatása' },
    proceedToReport: { en: 'Generate Strategic Report', sk: 'Vygenerovať strategický report', hu: 'Stratégiai jelentés készítése' },
  },

  // Estimator Modal
  estimator: {
    modalTitle: { en: 'Simulation Preflight Estimate & Model Configuration', sk: 'Predbežná kalkulácia a konfigurácia modelu simulácie', hu: 'Előzetes becslés és modell konfiguráció' },
    liveBadge: { en: 'LIVE RUN (REAL API CALLS)', sk: 'ŽIVÝ BEH (REÁLNE API VOLANIA)', hu: 'ÉLES FUTÁS (VALÓDI API)' },
    demoBadge: { en: 'DEMO RUN (SYNTHETIC)', sk: 'DEMO BEH (SYNTETICKÝ)', hu: 'DEMO FUTÁS (SZINTETIKUS)' },
    modelSelectTitle: { en: 'Reasoning AI Model Tier', sk: 'Úroveň AI modelu pre usudzovanie', hu: 'AI modell szint' },
    personaBudgetTitle: { en: 'Agent & Knowledge Graph Configuration', sk: 'Konfigurácia agentov a grafu znalostí', hu: 'Ágensek és tudásgráf' },
    ackLabel: { 
      en: 'I acknowledge the token expenditure and confirm starting the simulation.',
      sk: 'Beriem na vedomie spotrebu tokenov a potvrdzujem spustenie simulácie.',
      hu: 'Tudomásul veszem a token fogyasztást és elindítom a szimulációt.'
    },
    launchLiveBtn: { en: 'Launch Live Simulation', sk: 'Spustiť ostrú simuláciu', hu: 'Éles szimuláció indítása' },
    launchDemoBtn: { en: 'Launch Demo Simulation', sk: 'Spustiť demo simuláciu', hu: 'Demo szimuláció indítása' },
    cancelBtn: { en: 'Cancel & Edit', sk: 'Zrušiť a upraviť', hu: 'Mégse' },
  },

  // General buttons
  common: {
    close: { en: 'Close', sk: 'Zavrieť', hu: 'Bezárás' },
    save: { en: 'Save', sk: 'Uložiť', hu: 'Mentés' },
    cancel: { en: 'Cancel', sk: 'Zrušiť', hu: 'Mégse' },
    delete: { en: 'Delete', sk: 'Vymazať', hu: 'Törlés' },
    edit: { en: 'Edit', sk: 'Upraviť', hu: 'Szerkesztés' },
    search: { en: 'Search...', sk: 'Hľadať...', hu: 'Keresés...' },
    filter: { en: 'Filter', sk: 'Filter', hu: 'Szűrő' },
  }
};

export function getSaiTranslation(lang: string = 'sk', category: keyof typeof SAI_TRANSLATIONS, key: string, fallback?: string): string {
  const cat = (SAI_TRANSLATIONS as any)[category];
  if (!cat) return fallback || key;
  const item = cat[key];
  if (!item) return fallback || key;
  
  if (lang === 'sk') return item.sk || item.en || fallback || key;
  if (lang === 'hu') return item.hu || item.en || fallback || key;
  return item.en || item.sk || fallback || key;
}

export function createSaiTranslator(lang: string = 'sk') {
  return (category: keyof typeof SAI_TRANSLATIONS, key: string, fallback?: string) => {
    return getSaiTranslation(lang, category, key, fallback);
  };
}

export function tr(lang: string = 'sk', en: string, sk: string, hu: string): string {
  if (lang === 'sk') return sk;
  if (lang === 'hu') return hu;
  return en;
}

export function createTr(lang: string = 'sk') {
  return (en: string, sk: string, hu: string) => {
    if (lang === 'sk') return sk;
    if (lang === 'hu') return hu;
    return en;
  };
}
