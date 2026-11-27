import type { DemoBundle } from './demoData.types.ts';

/**
 * Vstavané interaktívne demo, slovenské vydanie: Lapidea s.r.o.
 * Mená z docs/DEMO-MODE.md časť D (C1, C2, C3, C6, L10); konkurent je vymyslený.
 * Scenár: 15-ročná záruka na prémiový spekaný kameň s cenou +12 % (C12).
 */

const YES = 'Akceptujem (záruka písomne)';
const MAYBE = 'Váham / chcem projektovú cenu';
const NO = 'Odmietam (lacnejšia dielňa)';

const graph: DemoBundle['graph'] = {
  nodes: [
    { id: 'node_premium', name: 'Hotely a developeri', type: 'Buyer', summary: 'Špecifikujú veľké prémiové plochy a musia hosťom či kupujúcim odovzdať zdokumentovanú záruku. Posudzujú náklady za celý život stavby, nie cenu za dosku.' },
    { id: 'node_studios', name: 'Partnerské kuchynské štúdiá', type: 'Partner', summary: 'Predávajú pracovné dosky Lapidea v 8 – 10 kuchyniach mesačne. Každé zdraženie musia obhájiť pred klientom a reklamácia ich stojí deň partie.' },
    { id: 'node_homeowners', name: 'Súkromní majitelia domov', type: 'Client', summary: 'Kuchyňu kupujú raz za 15 rokov. Viac než cena ich trápi vylomená hrana a nejasná záruka.' },
    { id: 'node_rival', name: 'Nízkonákladové kamenárske dielne', type: 'Competitor', summary: 'Predávajú dovážané dosky o 15 % lacnejšie s 5-ročnou zárukou a štúdiá lákajú províziou za každú odovzdanú zákazku.' },
    { id: 'node_supplier', name: 'Výrobcovia dosiek', type: 'Supplier', summary: '15-ročný sľub je dôveryhodný, len ak za materiálovú časť ručí výrobca dosiek; taliansky výrobca to zatiaľ nepotvrdil.' }
  ],
  edges: [
    { id: 'edge_1', source: 'node_rival', target: 'node_studios', relation: 'PODLIEZA', fact: 'Dielne ponúkajú štúdiám províziu 5 % a cenu o 15 % nižšiu pri porovnateľnom spekanom kameni.', validFromRound: 1 },
    { id: 'edge_2', source: 'node_studios', target: 'node_homeowners', relation: 'ODPORÚČA', fact: 'Štúdiá rozhodujú o tom, ktorá dielňa vyrobí dosku vo väčšine ich kuchýň.', validFromRound: 1 },
    { id: 'edge_3', source: 'node_premium', target: 'node_rival', relation: 'POROVNÁVA', fact: 'Nákupcovia hotelov a developerov dávajú 15-ročný certifikát vedľa 5-ročnej záruky konkurencie.', validFromRound: 2 },
    { id: 'edge_4', source: 'node_supplier', target: 'node_premium', relation: 'RUČÍ', fact: 'Záruka výrobcu na materiál je to, čo robí 15-ročnú záruku pre kupujúceho vymáhateľnou.', validFromRound: 2 },
    { id: 'edge_5', source: 'node_homeowners', target: 'node_rival', relation: 'POCHYBUJE', fact: 'Majitelia zdieľajú na fórach fotky vylomených hrán po montáži lacnejších dielní.', validFromRound: 3 }
  ]
};

const agents: DemoBundle['agents'] = [
  {
    id: 1, username: 'lucia_kuchyneline', displayName: 'Lucia Majerová', profession: 'Majiteľka, KuchyneLine Studio', mbti: 'ESTJ', stance: 'opposing',
    userChar: 'Pragmatická majiteľka štúdia. Každé zdraženie musí vysvetliť klientom, preto +12 % odmietne, ak nedostane prechodné obdobie a niečo hmatateľné navyše.',
    publicBio: 'Kuchyne na mieru od 2009 | Trnava', followerCount: 1840, karma: 390, sourceEntityId: 'node_studios',
    interestedTopics: ['ceny', 'termíny', 'provízie', 'záruka']
  },
  {
    id: 2, username: 'andrea_horvathova', displayName: 'Andrea Horváthová', profession: 'Majiteľka, zrekonštruovala si kuchyňu', mbti: 'ISFJ', stance: 'supportive',
    userChar: 'Opatrná kupujúca. Vylomená hrana ju stála mesiac čakania, takže dlhá písomná záruka je pre ňu dôležitejšia než cena.',
    publicBio: 'Varím rada a doma | Nitra', followerCount: 320, karma: 140, sourceEntityId: 'node_homeowners',
    interestedTopics: ['záruka', 'spoľahlivosť', 'starostlivosť']
  },
  {
    id: 3, username: 'dusan_kamendiskont', displayName: 'Dušan Hric', profession: 'Konateľ, KameňDiskont', mbti: 'ENTJ', stance: 'opposing',
    userChar: 'Konkurent, ktorý súťaží cenou. Zdraženie označuje za predražovanie a štúdiá láka províziou.',
    publicBio: 'Rovnaký kameň, nižšia cena | Západné Slovensko', followerCount: 2650, karma: 210, sourceEntityId: 'node_rival',
    interestedTopics: ['ceny', 'provízie', 'konkurencia']
  },
  {
    id: 4, username: 'thomas_architekten', displayName: 'Thomas Müller', profession: 'Vedúci ateliéru, Müller Architekten (Mníchov)', mbti: 'ISTJ', stance: 'neutral',
    userChar: 'Presný a skeptický. Špecifikuje spekaný kameň pre šesť víl ročne a chce vedieť, kto skutočne nesie riziko záruky.',
    publicBio: 'Architektúra a interiéry | Mníchov', followerCount: 2980, karma: 560, sourceEntityId: 'node_supplier',
    interestedTopics: ['záruka', 'materiál', 'špecifikácia']
  },
  {
    id: 5, username: 'marek_horskypark', displayName: 'Ing. Marek Šimko', profession: 'Vedúci developmentu, Rezidencia Horský park', mbti: 'ENTP', stance: 'neutral',
    userChar: 'Počíta celkové náklady 12 víl. Reklamácia ho stojí deň partie a meškanie odovzdania; prenosná záruka je pre jeho kupujúcich argument.',
    publicBio: 'Rezidenčný development | Bratislava', followerCount: 1510, karma: 300, sourceEntityId: 'node_premium',
    interestedTopics: ['celkové náklady', 'odovzdanie', 'záruka']
  },
  {
    id: 6, username: 'beata_aurum', displayName: 'Beáta Lukáčová', profession: 'Riaditeľka, Hotel Aurum', mbti: 'INFJ', stance: 'supportive',
    userChar: 'Vedie butikový hotel. Prasknutý recepčný pult v sezóne je katastrofa, preto zaplatí za certifikát, ktorý pokrýva hrany, spoje a výrezy na 15 rokov.',
    publicBio: 'Hotelierstvo | Banská Štiavnica', followerCount: 4120, karma: 480, sourceEntityId: 'node_premium',
    interestedTopics: ['zážitok hosťa', 'záruka', 'údržba']
  }
];

const mk = (id: number, round: number, agentIdx: number, platform: 'chitchat' | 'forum', actionType: 'POST' | 'QUOTE' | 'COMMENT', content: string,
  likes: number, quotes: number, comments: number, sentiment: number, createdAt: string, supportedAnswer: string, targetPostId?: number): DemoBundle['posts'][number] => {
  const a = agents[agentIdx - 1];
  const p: DemoBundle['posts'][number] = {
    id, roundNum: round, agentId: agentIdx, agentName: a.displayName, agentUsername: a.username, agentProfession: a.profession,
    platform, actionType, content, likesCount: likes, quotesCount: quotes, commentsCount: comments, sentimentScore: sentiment, createdAt, supportedAnswer
  };
  if (targetPostId !== undefined) p.targetPostId = targetPostId;
  return p;
};

const posts: DemoBundle['posts'] = [
  mk(101, 1, 1, 'chitchat', 'POST', 'Prémiový spekaný kameň o 12 % drahší, uprostred sezóny? Klienti sa opýtajú prečo. Ak nedostanem prechodné obdobie na rozbehnuté ponuky, nepredám to.', 28, 7, 14, -0.6, '09:12', NO),
  mk(102, 1, 3, 'chitchat', 'POST', 'Rovnaký spekaný kameň o 15 % lacnejšie a štúdiá si nechajú 5 % províziu. „15-ročná záruka" je marketingové slovo. Nikto tu nie je tak dlho.', 45, 12, 19, -0.8, '09:34', NO),
  mk(103, 1, 2, 'chitchat', 'QUOTE', 'Marketing? Vylomená hrana ma stála mesiac čakania. Ak je 15 rokov písomne a pokrýva hrany, spoje aj výrezy, 12 % je nič.', 62, 15, 22, 0.7, '10:15', YES, 101),
  mk(104, 2, 4, 'forum', 'POST', 'Kľúčová otázka pre projektanta: kto nesie materiálovú časť tých 15 rokov? Ak výrobca dosky ručí a certifikát je prenosný, môžeme to špecifikovať.', 89, 18, 31, 0.3, '12:40', MAYBE),
  mk(105, 2, 6, 'forum', 'POST', 'Pre hotel je certifikát predajný argument, nie náklad. Recepčný pult a wellness stena, ktoré 15 rokov zostanú dokonalé – za to zaplatím 12 % a dám to do brožúry.', 54, 6, 8, 0.8, '13:10', YES),
  mk(106, 3, 5, 'forum', 'POST', 'Prepočítal som to na 12 víl: jedna reklamácia stojí deň partie a posúva odovzdanie. S prenosnou zárukou pre kupujúcich sa tých 12 % zaplatí pri prvej odvrátenej reklamácii.', 112, 24, 42, 0.7, '15:45', YES),
  mk(107, 3, 1, 'chitchat', 'QUOTE', 'Potvrdené: rozbehnuté ponuky ostávajú za starú cenu do konca štvrťroka a certifikát môžem ukázať klientom. Za týchto podmienok som v tom.', 94, 19, 17, 0.55, '16:30', YES, 103),
  mk(108, 3, 3, 'chitchat', 'POST', 'Uvidíme, ako dlho vydrží tá „15-ročná záruka". My aspoň nesľubujeme, čo nevieme splniť.', 19, 3, 11, -0.45, '18:10', NO)
];

const metricsHistory: DemoBundle['metricsHistory'] = [
  { round: 1, simulatedHour: 9, averageSentiment: -0.32, supportiveCount: 1, opposingCount: 3, neutralCount: 2, totalInteractions: 140, viralIndex: 35,
    answerDistribution: { [YES]: 1, [MAYBE]: 2, [NO]: 3 }, leadingAnswer: NO, consensusPercentage: 50 },
  { round: 2, simulatedHour: 12, averageSentiment: 0.08, supportiveCount: 2, opposingCount: 2, neutralCount: 2, totalInteractions: 290, viralIndex: 64,
    answerDistribution: { [YES]: 3, [MAYBE]: 1, [NO]: 2 }, leadingAnswer: YES, consensusPercentage: 50 },
  { round: 3, simulatedHour: 15, averageSentiment: 0.42, supportiveCount: 4, opposingCount: 1, neutralCount: 1, totalInteractions: 480, viralIndex: 82,
    answerDistribution: { [YES]: 4, [MAYBE]: 1, [NO]: 1 }, leadingAnswer: YES, consensusPercentage: 71 }
];

const QUESTION = 'Akceptujú naši prémioví zákazníci 12 % zdraženie spekaného kameňa, ak pridáme písomnú, prenosnú 15-ročnú záruku?';

const report: DemoBundle['report'] = {
  title: 'Strategický briefing: 15-ročná záruka na prémiový spekaný kameň s cenou +12 %',
  summary: 'Simulácia preverila zdraženie prémiového spekaného kameňa (Stratos Nero Marquina, Lumina Statuario) o 12 % spojené s písomnou 15-ročnou zárukou na hrany, spoje a výrezy. Trh sa od prvej reakcie – štúdiá a nízkonákladová konkurencia proti – posunul k 71 % konsenzu, keď sa ukázalo, že záruka je prenosná a rozbehnuté ponuky sú chránené.',
  generatedAt: new Date().toISOString(),
  executiveVerdict: {
    question: QUESTION,
    directAnswer: 'ÁNO, ak je záruka písomná a prenosná (71 % súhlas)',
    confidenceScore: 86,
    summary: 'Rozhodla hmatateľná ochrana: hotely a developeri berú certifikát ako majetok, ktorý môžu odovzdať ďalej, a štúdiá ostávajú, keď rozbehnuté ponuky držia starú cenu.',
    answerBreakdown: [
      { answer: YES, sharePercentage: 71, count: 4, sentiment: 0.65 },
      { answer: MAYBE, sharePercentage: 19, count: 1, sentiment: 0.1 },
      { answer: NO, sharePercentage: 10, count: 1, sentiment: -0.8 }
    ],
    keyDrivers: [
      { title: '1. Záruka, ktorá ide s budovou', explanation: 'Hotely a developeri môžu certifikát ukázať hosťom a kupujúcim, takže 12 % im kupuje niečo, čo vedia ďalej predať.', quotes: ['Pre hotel je certifikát predajný argument, nie náklad.'] },
      { title: '2. Menej reklamácií pre štúdiá a developerov', explanation: 'Reklamácia stojí deň partie a meškanie odovzdania; kupujúci, ktorí tento náklad počítajú, vidia 12 % ako lacné poistenie.', quotes: ['Tých 12 % sa zaplatí pri prvej odvrátenej reklamácii.'] },
      { title: '3. Prémiové postavenie voči 5-ročnej konkurencii', explanation: 'Vedľa 5-ročnej záruky prestáva 15 rokov byť cenovým porovnaním a stáva sa porovnaním kvality.', quotes: ['Ak je 15 rokov písomne, 12 % je nič.'] }
    ],
    tippingPoints: [
      { round: 3, description: 'Potvrdenie starej ceny pre rozbehnuté ponuky do konca štvrťroka preklopilo majiteľku štúdia z odporu do podpory.', impact: 'Segment štúdií prešiel z odporu do podpory.' }
    ],
    whatWouldChangeOutcome: [
      'Bez prechodného obdobia pre rozbehnuté ponuky by štúdiá presunuli odhadom 30 % zákaziek ku konkurencii.',
      'Ak výrobca dosiek materiálovú časť nepotvrdí, projektanti ako mníchovský ateliér nezapíšu 15 rokov do špecifikácie.'
    ],
    actionableRecommendations: [
      'Pred oznámením zavolať desiatim najväčším štúdiám a potvrdiť starú cenu pre už vystavené ponuky.',
      'Pred podpisom prvého certifikátu získať písomnú záruku výrobcu dosiek „späť na späť".',
      'Ku každej prémiovej objednávke priložiť záruku ako číslovaný prenosný certifikát.'
    ]
  },
  sections: [
    { title: '1. Konsenzus a polarizácia trhu', content: `Oznámenie rozdelilo trh na **sprostredkovateľov** (štúdiá), ktorí musia cenu obhájiť, a **koncových kupujúcich** (hotely, developeri, majitelia domov), ktorí zvažujú náklady za celý život.

Kľúčové zistenia:
- **Obrat sentimentu**: z **-0,32** v 1. kole na **+0,42** v 3. kole.
- **Najviac rozhoduje certifikát**: kupujúci, ktorí ho vnímali ako prenosný majetok, sa posunuli prví.
- **Štúdiá nasledujú ochranu ceny**: zostali, keď rozbehnuté ponuky držali starú cenu.` },
    { title: '2. Zraniteľnosti a hlavné námietky', content: `Dve slabé miesta treba vyriešiť pred oznámením:

1. **Kto nesie materiálové riziko** (*Thomas Müller*): výrobca musí 15 rokov písomne potvrdiť.
2. **Prechod pre rozbehnuté ponuky** (*Lucia Majerová*): bez neho štúdiá povedia nie z princípu.` },
    { title: '3. Protistratégia konkurencie', content: `Nízkonákladová dielňa ponúkla štúdiám províziu 5 % a cenu o 15 % nižšiu a záruku nazvala marketingovým slovom.

- **Prečo to zlyhalo**: zákazníci zdieľali fotky vylomených hrán po lacnejších montážach a certifikát urobil sľub overiteľným.` },
    { title: '4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?', content: 'Na zavedenie zdraženia bez straty štúdií postupujte podľa plánu nižšie.' }
  ],
  strategicPlaybook: {
    keyVulnerabilities: [
      'Materiálovú časť 15 rokov zatiaľ výrobca dosiek písomne nepotvrdil.',
      'Štúdiá s rozbehnutými ponukami vnímajú zdraženie ako prekvapenie.',
      'Konkurencia môže záruku nazývať „iba marketingom", kým sa neukáže prvý certifikát.'
    ],
    actionableCounterMeasures: [
      'Dohodnúť s výrobcom dosiek záruku „späť na späť" a uviesť ho na certifikáte.',
      'Na všetkých ponukách vystavených pred oznámením ponechať starú cenu do konca štvrťroka.',
      'Na webe zverejniť vzorový certifikát a krátky návod na starostlivosť.'
    ],
    salesObjectionPlaybook: [
      { objection: 'Dvanásť percent navyše za rovnakú dosku je veľa.', rebuttal: 'Nie je to rovnaká doska: prichádza s číslovaným 15-ročným certifikátom na hrany, spoje a výrezy, ktorý môžete odovzdať svojmu kupujúcemu.' },
      { objection: 'Nikto nemôže sľúbiť 15 rokov.', rebuttal: 'Certifikát uvádza, kto ručí za materiál a kto za prácu, a je prenosný, takže si to viete overiť.' },
      { objection: 'Iná dielňa je o 15 percent lacnejšia.', rebuttal: 'Pripočítajte jednu reklamáciu a deň partie a rozdiel zmizne; náš certifikát túto reklamáciu pokrýva.' }
    ],
    recommendedGtmSequence: [
      '1. deň: súkromný telefonát desiatim najväčším štúdiám, stará cena pre rozbehnuté ponuky potvrdená.',
      '7. deň: ukázať vzorový certifikát hotelovým a developerským klientom.',
      '14. deň: verejné oznámenie s certifikátom a návodom na starostlivosť.',
      '30. deň: porovnávacia stránka „5 rokov vs. 15 rokov" pre projektantov a majiteľov domov.'
    ]
  }
};

const SEED = 'Línia prémiového spekaného kameňa (Stratos, Lumina): cena +12 %, číslovaná prenosná 15-ročná záruka na hrany, spoje a výrezy, stará cena pre rozbehnuté ponuky do konca štvrťroka.';

export const DEMO_SK: DemoBundle = {
  graph,
  agents,
  posts,
  metricsHistory,
  report,
  checkpoint: {
    simulationId: 'demo-pricing-rehearsal',
    title: '15-ročná záruka na prémiový spekaný kameň s cenou +12 %',
    hypothesis: 'Čo ak zdražíme prémiový spekaný kameň o 12 %, ale pridáme číslovanú, prenosnú 15-ročnú záruku na hrany, spoje a výrezy a ponecháme starú cenu pre rozbehnuté ponuky do konca štvrťroka?',
    strategicQuestion: QUESTION,
    currentRound: 3,
    totalRounds: 3,
    status: 'completed',
    graph, agents, posts, metricsHistory, finalReport: report
  },
  activeNodeId: 'node_premium',
  seedDocument: SEED,
  proposalText: SEED,
  scenarioLabel: '15-ročná záruka na prémiový spekaný kameň (cena +12 %)',
  cardTitle: 'Interaktívne demo: 15-ročná záruka na prémiový spekaný kameň s cenou +12 %',
  cardDescription: 'Pozrite si predpripravenú simuláciu (cena +12 %, číslovaná prenosná 15-ročná záruka, stará cena pre rozbehnuté ponuky). Vyskúšajte War Room, Strategický briefing a centrum otázok a odpovedí.',
  analystAnswers: [
    { keywords: ['cen', 'zdraž', '12', 'náklad', 'naklad'], answer: 'Zdraženie o 12 % uspelo, lebo prišlo s niečím hmatateľným: číslovanou 15-ročnou zárukou, ktorú hotely a developeri odovzdajú svojim kupujúcim. Agent developera vypočítal, že jedna odvrátená reklamácia (deň partie a meškanie odovzdania) zdraženie zaplatí, takže cena prestala byť hlavným argumentom.' },
    { keywords: ['konkuren', 'dušan', 'dusan', 'lacnejš', 'lacnejs', 'zľav', 'zlav'], answer: 'Nízkonákladová konkurencia sa pokúsila záruku označiť za „marketingové slovo" a ponúkla štúdiám províziu 5 %. Neuspela, keď zákazníci zdieľali fotky vylomených hrán po lacnejších montážach a certifikát urobil sľub Lapidey overiteľným.' },
    { keywords: ['námietk', 'namietk', 'predaj', 'odpoveď', 'odpoved'], answer: 'Hlavnou námietkou bolo „nikto nemôže sľúbiť 15 rokov". Briefing odporúča uviesť na certifikáte, kto ručí za materiál a kto za prácu, a umožniť kupujúcemu ho previesť. Plán obsahuje tri pripravené odpovede.' },
    { keywords: ['stratégi', 'strategi', 'odporúč', 'odporuc', 'cieľ', 'ciel', 'postup', 'plán', 'plan'], answer: `Na zavedenie zdraženia bez straty štúdií:
1. Najprv zavolať desiatim najväčším štúdiám a potvrdiť starú cenu pre už vystavené ponuky.
2. Pred podpisom prvého certifikátu získať písomnú záruku výrobcu dosiek „späť na späť".
3. Ku každej prémiovej objednávke odovzdať číslovaný prenosný certifikát.` }
  ],
  analystFallback: 'Do 3. kola dosiahol simulovaný trh 71 % pozitívny konsenzus. Najsilnejším argumentom bol prenosný 15-ročný certifikát; najslabším miestom ostáva, kto nesie materiálovú časť záruky. Opýtajte sa ma na konkurenciu, námietky alebo odporúčaný plán.',
  agentAnswers: [
    { keywords: ['lucia', 'majerov', 'kuchyneline'], answer: 'Vediem štúdio, takže moja prvá reakcia na zdraženie o 12 % je nie: musím to vysvetliť každému klientovi. Zmenila ma stará cena na ponukách, ktoré už sú vonku, a certifikát, ktorý môžem ukázať pri stole v kuchyni. To viem predať.' },
    { keywords: ['andrea', 'horv'], answer: 'Po vylomenej hrane na minulej doske som mesiac čakala na opravu. Písomná záruka na hrany, spoje a výrezy na 15 rokov je presne to, za čo by som si rada trochu priplatila.' },
    { keywords: ['dušan', 'dusan', 'hric', 'kamendiskont'], answer: 'Sledujeme, čo robia. 15-ročný sľub sa dá ľahko vytlačiť. My budeme ďalej ponúkať rovnaký kameň lacnejšie a nechať zákazníkov, nech si to prepočítajú.' },
    { keywords: ['thomas', 'müller', 'muller', 'architekten'], answer: 'Moja otázka je jednoduchá: kto nesie materiálové riziko 15 rokov? Ak to výrobca dosky potvrdí písomne a certifikát je prenosný, zapíšem to do špecifikácie svojich víl.' },
    { keywords: ['marek', 'šimko', 'simko', 'horsk'], answer: 'Pri 12 vilách počítam celkové náklady. Jedna reklamácia je deň partie a meškanie odovzdania. Prenosná záruka mi pomáha aj predať vily, takže 12 % beriem ako poistenie, nie ako zdraženie.' },
    { keywords: ['beáta', 'beata', 'lukáč', 'lukac', 'aurum'], answer: 'Recepčný pult, ktorý praskne v sezóne, je pre nás katastrofa. Certifikát na 15 rokov ide rovno do našej brožúry. Áno, 12 % za to zaplatím.' }
  ],
  agentFallback: 'Návrh oznámenia bol počas simulácie na stole. Prenosný certifikát a stará cena pre rozbehnuté ponuky nám dali dosť istoty pokračovať s prémiovým spekaným kameňom.'
};
