import type { DemoBundle } from './demoData.types.ts';

/**
 * Beépített interaktív demó, magyar kiadás: Lapidea Kft.
 * A nevek a docs/DEMO-MODE.md D részéből valók (C1, C2, C3, C6, L10); a versenytárs kitalált.
 * Forgatókönyv: 15 éves garancia a prémium szinterezett kőre, +12 %-os áron (C12).
 */

const YES = 'Elfogadom (írásos garanciával)';
const MAYBE = 'Bizonytalan / projektárat kér';
const NO = 'Elutasítom (olcsóbb műhely)';

const graph: DemoBundle['graph'] = {
  nodes: [
    { id: 'node_premium', name: 'Szállodák és fejlesztők', type: 'Buyer', summary: 'Nagy prémium felületeket specifikálnak, és dokumentált garanciát kell továbbadniuk a vendégeknek vagy a vevőknek. Az épület teljes élettartamára számolnak, nem a lap áraként.' },
    { id: 'node_studios', name: 'Partner konyhastúdiók', type: 'Partner', summary: 'Havonta 8–10 konyhában értékesítik a Lapidea munkalapjait. Minden áremelést meg kell védeniük az ügyfél előtt, egy reklamáció pedig egy brigádnapjukba kerül.' },
    { id: 'node_homeowners', name: 'Magánszemély lakástulajdonosok', type: 'Client', summary: '15 évente egyszer vesznek konyhát. Az árnál jobban aggasztja őket a kicsorbult él és a homályos garancia.' },
    { id: 'node_rival', name: 'Fapados kőfaragó műhelyek', type: 'Competitor', summary: 'Behozott lapokat árulnak 15 %-kal olcsóbban, 5 éves garanciával, és jutalékkal csábítják a stúdiókat minden átadott munkáért.' },
    { id: 'node_supplier', name: 'Lapgyártók', type: 'Supplier', summary: 'A 15 éves ígéret csak akkor hiteles, ha az anyag részéért a lapgyártó áll jót; az olasz gyártó ezt még nem erősítette meg.' }
  ],
  edges: [
    { id: 'edge_1', source: 'node_rival', target: 'node_studios', relation: 'ALÁÍGÉR', fact: 'A műhelyek 5 % jutalékot és 15 %-kal alacsonyabb árat kínálnak a stúdióknak hasonló szinterezett kőre.', validFromRound: 1 },
    { id: 'edge_2', source: 'node_studios', target: 'node_homeowners', relation: 'AJÁNLJA', fact: 'A stúdiók döntenek arról, melyik műhely készíti a munkalapot a konyhák többségében.', validFromRound: 1 },
    { id: 'edge_3', source: 'node_premium', target: 'node_rival', relation: 'ÖSSZEHASONLÍTJA', fact: 'A szállodai és fejlesztői beszerzők egymás mellé teszik a 15 éves tanúsítványt és a versenytárs 5 éves garanciáját.', validFromRound: 2 },
    { id: 'edge_4', source: 'node_supplier', target: 'node_premium', relation: 'JÓTÁLL', fact: 'A gyártó anyagra vonatkozó garanciája teszi a 15 éves vállalást a vevő számára érvényesíthetővé.', validFromRound: 2 },
    { id: 'edge_5', source: 'node_homeowners', target: 'node_rival', relation: 'KÉTELKEDIK', fact: 'A tulajdonosok fórumokon osztanak meg fotókat kicsorbult élekről az olcsóbb műhelyek szerelései után.', validFromRound: 3 }
  ]
};

const agents: DemoBundle['agents'] = [
  {
    id: 1, username: 'lucia_konyhavonal', displayName: 'Major Lúcia', profession: 'Tulajdonos, KonyhaVonal Stúdió', mbti: 'ESTJ', stance: 'opposing',
    userChar: 'Pragmatikus stúdiótulajdonos. Minden áremelést meg kell magyaráznia az ügyfeleinek, ezért a +12 %-ot elutasítja, ha nem kap átmeneti időszakot és valami kézzelfoghatót is.',
    publicBio: 'Egyedi konyhák 2009 óta | Győr', followerCount: 1840, karma: 390, sourceEntityId: 'node_studios',
    interestedTopics: ['árak', 'határidők', 'jutalék', 'garancia']
  },
  {
    id: 2, username: 'andrea_horvath', displayName: 'Horváth Andrea', profession: 'Lakástulajdonos, felújította a konyháját', mbti: 'ISFJ', stance: 'supportive',
    userChar: 'Óvatos vásárló. Egy kicsorbult él egy hónap várakozásába került, ezért a hosszú, írásos garancia fontosabb neki az árnál.',
    publicBio: 'Szeretek otthon főzni | Mosonmagyaróvár', followerCount: 320, karma: 140, sourceEntityId: 'node_homeowners',
    interestedTopics: ['garancia', 'megbízhatóság', 'ápolás']
  },
  {
    id: 3, username: 'denes_kodiszkont', displayName: 'Gáspár Dénes', profession: 'Ügyvezető, KőDiszkont', mbti: 'ENTJ', stance: 'opposing',
    userChar: 'Árban versenyző rivális. Az emelést túlárazásnak nevezi, és jutalékkal csábítja a stúdiókat.',
    publicBio: 'Ugyanaz a kő, alacsonyabb áron | Nyugat-Dunántúl', followerCount: 2650, karma: 210, sourceEntityId: 'node_rival',
    interestedTopics: ['árak', 'jutalék', 'verseny']
  },
  {
    id: 4, username: 'thomas_architekten', displayName: 'Thomas Müller', profession: 'Irodavezető, Müller Architekten (München)', mbti: 'ISTJ', stance: 'neutral',
    userChar: 'Pontos és szkeptikus. Évente hat villához specifikál szinterezett követ, és tudni akarja, ki viseli valójában a garanciakockázatot.',
    publicBio: 'Építészet és belsőépítészet | München', followerCount: 2980, karma: 560, sourceEntityId: 'node_supplier',
    interestedTopics: ['garancia', 'anyag', 'specifikáció']
  },
  {
    id: 5, username: 'mark_hegyvidek', displayName: 'Dr. Fekete Márk', profession: 'Fejlesztési vezető, Hegyvidék Rezidencia', mbti: 'ENTP', stance: 'neutral',
    userChar: 'Tizenkét villa teljes költségét számolja. Egy reklamáció egy brigádnap és késve történő átadás; az átruházható garancia érv a vevői felé.',
    publicBio: 'Lakóingatlan-fejlesztés | Győr', followerCount: 1510, karma: 300, sourceEntityId: 'node_premium',
    interestedTopics: ['teljes költség', 'átadás', 'garancia']
  },
  {
    id: 6, username: 'beata_aurum', displayName: 'Lukács Beáta', profession: 'Igazgató, Aurum Hotel', mbti: 'INFJ', stance: 'supportive',
    userChar: 'Butikszállodát vezet. Egy szezonban megrepedt recepciós pult katasztrófa, ezért fizet a tanúsítványért, amely 15 évig fedezi az éleket, illesztéseket és kivágásokat.',
    publicBio: 'Vendéglátás | Sopron', followerCount: 4120, karma: 480, sourceEntityId: 'node_premium',
    interestedTopics: ['vendégélmény', 'garancia', 'karbantartás']
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
  mk(101, 1, 1, 'chitchat', 'POST', 'A prémium szinterezett kő 12 %-kal drágább, a szezon közepén? Az ügyfeleim megkérdezik, miért. Ha a futó ajánlatokra nem kapok átmeneti időszakot, nem fogom eladni.', 28, 7, 14, -0.6, '09:12', NO),
  mk(102, 1, 3, 'chitchat', 'POST', 'Ugyanaz a szinterezett kő 15 %-kal olcsóbban, és a stúdiók megtartanak 5 % jutalékot. A „15 éves garancia" marketingszó. Senki sincs itt ilyen régóta.', 45, 12, 19, -0.8, '09:34', NO),
  mk(103, 1, 2, 'chitchat', 'QUOTE', 'Marketing? Egy kicsorbult él egy hónap várakozásomba került. Ha a 15 év írásban van, és fedezi az éleket, illesztéseket és kivágásokat, a 12 % semmi.', 62, 15, 22, 0.7, '10:15', YES, 101),
  mk(104, 2, 4, 'forum', 'POST', 'A kulcskérdés a tervezőnek: ki viseli a 15 év anyagrészét? Ha a lapgyártó jótáll, és a tanúsítvány átruházható, specifikálhatjuk.', 89, 18, 31, 0.3, '12:40', MAYBE),
  mk(105, 2, 6, 'forum', 'POST', 'Egy szállodának a tanúsítvány értékesítési érv, nem költség. Egy recepciós pult és wellnessfal, amely 15 évig tökéletes marad – ezért kifizetem a 12 %-ot, és beteszem a prospektusunkba.', 54, 6, 8, 0.8, '13:10', YES),
  mk(106, 3, 5, 'forum', 'POST', 'Kiszámoltam 12 villára: egy reklamáció egy brigádnap és csúszó átadás. A vevőknek átruházható garanciával a 12 % az első elkerült reklamációnál megtérül.', 112, 24, 42, 0.7, '15:45', YES),
  mk(107, 3, 1, 'chitchat', 'QUOTE', 'Megerősítették: a futó ajánlatok a negyedév végéig a régi áron maradnak, és megmutathatom az ügyfeleknek a tanúsítványt. Ilyen feltételekkel benne vagyok.', 94, 19, 17, 0.55, '16:30', YES, 103),
  mk(108, 3, 3, 'chitchat', 'POST', 'Meglátjuk, meddig tart az a „15 éves garancia". Mi legalább nem ígérünk olyat, amit nem tudunk betartani.', 19, 3, 11, -0.45, '18:10', NO)
];

const metricsHistory: DemoBundle['metricsHistory'] = [
  { round: 1, simulatedHour: 9, averageSentiment: -0.32, supportiveCount: 1, opposingCount: 3, neutralCount: 2, totalInteractions: 140, viralIndex: 35,
    answerDistribution: { [YES]: 1, [MAYBE]: 2, [NO]: 3 }, leadingAnswer: NO, consensusPercentage: 50 },
  { round: 2, simulatedHour: 12, averageSentiment: 0.08, supportiveCount: 2, opposingCount: 2, neutralCount: 2, totalInteractions: 290, viralIndex: 64,
    answerDistribution: { [YES]: 3, [MAYBE]: 1, [NO]: 2 }, leadingAnswer: YES, consensusPercentage: 50 },
  { round: 3, simulatedHour: 15, averageSentiment: 0.42, supportiveCount: 4, opposingCount: 1, neutralCount: 1, totalInteractions: 480, viralIndex: 82,
    answerDistribution: { [YES]: 4, [MAYBE]: 1, [NO]: 1 }, leadingAnswer: YES, consensusPercentage: 71 }
];

const QUESTION = 'Elfogadják-e prémium ügyfeleink a szinterezett kő 12 %-os áremelését, ha írásos, átruházható 15 éves garanciát adunk mellé?';

const report: DemoBundle['report'] = {
  title: 'Stratégiai eligazítás: 15 éves garancia a prémium szinterezett kőre, +12 %-os áron',
  summary: 'A szimuláció a prémium szinterezett kő (Stratos Nero Marquina, Lumina Statuario) 12 %-os áremelését vizsgálta, írásos 15 éves garanciával az élekre, illesztésekre és kivágásokra. A piac az első reakciótól – a stúdiók és a fapados versenytárs ellenezte – 71 %-os konszenzusig jutott, amikor kiderült, hogy a garancia átruházható, és a futó ajánlatok védettek.',
  generatedAt: new Date().toISOString(),
  executiveVerdict: {
    question: QUESTION,
    directAnswer: 'IGEN, ha a garancia írásos és átruházható (71 % támogatás)',
    confidenceScore: 86,
    summary: 'A kézzelfogható védelem döntött: a szállodák és fejlesztők a tanúsítványt továbbadható értéknek tekintik, a stúdiók pedig maradnak, ha a futó ajánlatok a régi áron maradnak.',
    answerBreakdown: [
      { answer: YES, sharePercentage: 71, count: 4, sentiment: 0.65 },
      { answer: MAYBE, sharePercentage: 19, count: 1, sentiment: 0.1 },
      { answer: NO, sharePercentage: 10, count: 1, sentiment: -0.8 }
    ],
    keyDrivers: [
      { title: '1. Az épülettel együtt vándorló garancia', explanation: 'A szállodák és fejlesztők megmutathatják a tanúsítványt a vendégeknek és vevőknek, így a 12 % olyasmit vásárol, amit tovább tudnak adni.', quotes: ['Egy szállodának a tanúsítvány értékesítési érv, nem költség.'] },
      { title: '2. Kevesebb reklamáció a stúdióknak és fejlesztőknek', explanation: 'Egy reklamáció brigádnapba és késő átadásba kerül; akik ezt a költséget számolják, a 12 %-ot olcsó biztosításnak látják.', quotes: ['A 12 % az első elkerült reklamációnál megtérül.'] },
      { title: '3. Prémium pozíció az 5 éves versenytárssal szemben', explanation: 'Az 5 éves garancia mellett a 15 év már nem árverseny, hanem minőségi összehasonlítás.', quotes: ['Ha a 15 év írásban van, a 12 % semmi.'] }
    ],
    tippingPoints: [
      { round: 3, description: 'A futó ajánlatok régi áron tartásának megerősítése a negyedév végéig a stúdiótulajdonost az ellenzéktől a támogatásba billentette.', impact: 'A stúdiók szegmense az ellenzésből a támogatásba váltott.' }
    ],
    whatWouldChangeOutcome: [
      'A futó ajánlatokra adott átmeneti időszak nélkül a stúdiók becslés szerint a munkáik 30 %-át a fapados versenytárshoz vinnék.',
      'Ha a lapgyártó nem vállalja az anyag részét, a müncheni irodához hasonló tervezők nem írnák be a 15 évet a specifikációba.'
    ],
    actionableRecommendations: [
      'A bejelentés előtt hívja fel a tíz legnagyobb stúdiót, és erősítse meg a régi árat a már kiadott ajánlatokra.',
      'Az első tanúsítvány aláírása előtt szerezze meg a lapgyártó írásos, háttérgaranciáját.',
      'Minden prémium megrendeléshez mellékelje a garanciát sorszámozott, átruházható tanúsítványként.'
    ]
  },
  sections: [
    { title: '1. Konszenzus és piaci polarizáció', content: `A bejelentés két részre osztotta a piacot: a **közvetítőkre** (stúdiók), akiknek meg kell védeniük az árat, és a **végső vevőkre** (szállodák, fejlesztők, lakástulajdonosok), akik az élettartam-költséget mérlegelik.

Főbb megállapítások:
- **Hangulatváltás**: az 1. kör **-0,32** értékéről a 3. körre **+0,42**-re.
- **A tanúsítvány számít a legtöbbet**: akik átruházható értéknek látták, elsőként mozdultak.
- **A stúdiók az árvédelmet követik**: maradtak, amikor a futó ajánlatok megtartották a régi árat.` },
    { title: '2. Sebezhetőségek és fő kifogások', content: `Két gyenge pontot kell megoldani a bejelentés előtt:

1. **Ki viseli az anyagkockázatot** (*Thomas Müller*): a gyártónak írásban kell vállalnia a 15 évet.
2. **Átmenet a futó ajánlatokra** (*Major Lúcia*): enélkül a stúdiók elvből nemet mondanak.` },
    { title: '3. A versenytárs ellenstratégiája', content: `A fapados műhely 5 % jutalékot és 15 %-kal alacsonyabb árat kínált a stúdióknak, a garanciát pedig marketingszónak nevezte.

- **Miért bukott el**: az ügyfelek fotókat osztottak meg kicsorbult élekről az olcsóbb szerelések után, a tanúsítvány pedig ellenőrizhetővé tette az ígéretet.` },
    { title: '4. 🎯 MELYIK STRATÉGIA VEZET A CÉLHOZ?', content: 'Az áremelés stúdiók elvesztése nélküli bevezetéséhez kövesse az alábbi tervet.' }
  ],
  strategicPlaybook: {
    keyVulnerabilities: [
      'A 15 év anyagrészét a lapgyártó még nem vállalta írásban.',
      'A futó ajánlatokkal rendelkező stúdiók meglepetésként élik meg az emelést.',
      'A versenytárs „puszta marketingnek" nevezheti a garanciát, amíg az első tanúsítvány meg nem jelenik.'
    ],
    actionableCounterMeasures: [
      'Háttérgaranciában állapodjon meg a lapgyártóval, és nevezze meg a tanúsítványon.',
      'A bejelentés előtt kiadott minden ajánlaton tartsa a régi árat a negyedév végéig.',
      'Tegyen közzé mintatanúsítványt és rövid ápolási útmutatót a weboldalon.'
    ],
    salesObjectionPlaybook: [
      { objection: 'Tizenkét százalékkal több ugyanazért a lapért túl sok.', rebuttal: 'Nem ugyanaz a lap: sorszámozott 15 éves tanúsítvány jár hozzá az élekre, illesztésekre és kivágásokra, amelyet továbbadhat a vevőjének.' },
      { objection: 'Senki sem ígérhet 15 évet.', rebuttal: 'A tanúsítvány megnevezi, ki áll jót az anyagért és ki a kivitelezésért, és átruházható, tehát ellenőrizheti.' },
      { objection: 'A másik műhely 15 százalékkal olcsóbb.', rebuttal: 'Adjon hozzá egy reklamációt és egy brigádnapot, és a különbség eltűnik; a tanúsítványunk fedezi ezt a reklamációt.' }
    ],
    recommendedGtmSequence: [
      '1. nap: magántelefon a tíz legnagyobb stúdiónak, a futó ajánlatokra a régi ár megerősítve.',
      '7. nap: mintatanúsítvány bemutatása a szállodai és fejlesztői ügyfeleknek.',
      '14. nap: nyilvános bejelentés a tanúsítvánnyal és az ápolási útmutatóval.',
      '30. nap: „5 év vs. 15 év" összehasonlító oldal tervezőknek és lakástulajdonosoknak.'
    ]
  }
};

const SEED = 'Prémium szinterezett kő termékvonal (Stratos, Lumina): ár +12 %, sorszámozott, átruházható 15 éves garancia az élekre, illesztésekre és kivágásokra, a futó ajánlatokra a régi ár a negyedév végéig.';

export const DEMO_HU: DemoBundle = {
  graph,
  agents,
  posts,
  metricsHistory,
  report,
  checkpoint: {
    simulationId: 'demo-pricing-rehearsal',
    title: '15 éves garancia a prémium szinterezett kőre, +12 %-os áron',
    hypothesis: 'Mi lenne, ha a prémium szinterezett követ 12 %-kal drágítanánk, de sorszámozott, átruházható 15 éves garanciát adnánk az élekre, illesztésekre és kivágásokra, a futó ajánlatokra pedig a negyedév végéig megtartanánk a régi árat?',
    strategicQuestion: QUESTION,
    currentRound: 3,
    totalRounds: 3,
    status: 'completed',
    graph, agents, posts, metricsHistory, finalReport: report
  },
  activeNodeId: 'node_premium',
  seedDocument: SEED,
  proposalText: SEED,
  scenarioLabel: '15 éves garancia a prémium szinterezett kőre (+12 %-os ár)',
  cardTitle: 'Interaktív demó: 15 éves garancia a prémium szinterezett kőre, +12 %-os áron',
  cardDescription: 'Tekintse meg az előre konfigurált szimulációt (+12 % ár, sorszámozott, átruházható 15 éves garancia, régi ár a futó ajánlatokra). Próbálja ki a War Roomot, a Stratégiai eligazítást és a kérdezőközpontot.',
  analystAnswers: [
    { keywords: ['ár', 'drága', 'drag', '12', 'költség', 'koltseg', 'emelés', 'emeles'], answer: 'A 12 %-os emelés azért sikerült, mert kézzelfogható értékkel járt: sorszámozott 15 éves garanciával, amelyet a szállodák és fejlesztők továbbadnak a saját vevőiknek. A fejlesztő ágens kiszámolta, hogy egyetlen elkerült reklamáció (egy brigádnap és késő átadás) megtéríti az emelést, így az ár megszűnt fő érv lenni.' },
    { keywords: ['verseny', 'rivális', 'rivalis', 'dénes', 'denes', 'olcsóbb', 'olcsobb', 'kedvezmény'], answer: 'A fapados versenytárs a garanciát „marketingszónak" nevezte, és 5 % jutalékot kínált a stúdióknak. Nem járt sikerrel, amikor az ügyfelek fotókat osztottak meg kicsorbult élekről az olcsóbb szerelések után, a tanúsítvány pedig ellenőrizhetővé tette a Lapidea ígéretét.' },
    { keywords: ['kifogás', 'kifogas', 'értékesít', 'ertekesit', 'válasz', 'valasz'], answer: 'A fő kifogás az volt, hogy „senki sem ígérhet 15 évet". Az eligazítás azt javasolja, hogy a tanúsítványon nevezzék meg, ki áll jót az anyagért és ki a kivitelezésért, és a vevő átruházhassa. A terv három kész választ tartalmaz.' },
    { keywords: ['stratégia', 'strategia', 'javaslat', 'cél', 'cel', 'terv', 'lépés', 'lepes'], answer: `Az áremelés stúdiók elvesztése nélküli bevezetéséhez:
1. Először hívja fel a tíz legnagyobb stúdiót, és erősítse meg a régi árat a már kiadott ajánlatokra.
2. Az első tanúsítvány aláírása előtt szerezze meg a lapgyártó írásos háttérgaranciáját.
3. Minden prémium megrendeléshez adjon sorszámozott, átruházható tanúsítványt.` }
  ],
  analystFallback: 'A 3. körre a szimulált piac 71 %-os pozitív konszenzusra jutott. A legerősebb érv az átruházható 15 éves tanúsítvány volt; a leggyengébb pont továbbra is az, ki viseli a garancia anyagrészét. Kérdezzen a versenytársról, a kifogásokról vagy a javasolt tervről.',
  agentAnswers: [
    { keywords: ['lúcia', 'lucia', 'major', 'konyhavonal'], answer: 'Stúdiót vezetek, ezért a 12 %-os emelésre az első reakcióm a nem: minden ügyfélnek meg kell magyaráznom. A régi ár a már kint lévő ajánlatokon és egy tanúsítvány, amelyet a konyhaasztalnál megmutathatok – ez megváltoztatta a véleményemet. Ezt el tudom adni.' },
    { keywords: ['andrea', 'horváth', 'horvath'], answer: 'A legutóbbi munkalapom kicsorbult éle után egy hónapot vártam a javításra. Az éleket, illesztéseket és kivágásokat 15 évre fedező írásos garancia pontosan az, amiért szívesen fizetek egy kicsit többet.' },
    { keywords: ['dénes', 'denes', 'gáspár', 'gaspar', 'kodiszkont'], answer: 'Figyeljük, mit csinálnak. Egy 15 éves ígéretet könnyű kinyomtatni. Mi továbbra is ugyanazt a követ kínáljuk olcsóbban, és hagyjuk, hogy az ügyfelek kiszámolják.' },
    { keywords: ['thomas', 'müller', 'muller', 'architekten'], answer: 'A kérdésem egyszerű: ki viseli az anyagkockázatot 15 évig? Ha a lapgyártó írásban megerősíti, és a tanúsítvány átruházható, beírom a villaprojektjeim specifikációjába.' },
    { keywords: ['márk', 'mark', 'fekete', 'hegyvid'], answer: 'Tizenkét villánál a teljes költséget nézem. Egy reklamáció egy brigádnap és késő átadás. Az átruházható garancia a villák eladásában is segít, ezért a 12 %-ot biztosításnak tekintem, nem áremelésnek.' },
    { keywords: ['beáta', 'beata', 'lukács', 'lukacs', 'aurum'], answer: 'Egy szezonban megrepedő recepciós pult katasztrófa nekünk. A 15 éves tanúsítvány egyenesen a prospektusunkba kerül. Igen, ezért kifizetem a 12 %-ot.' }
  ],
  agentFallback: 'A szimuláció során a javasolt bejelentés az asztalon volt. Az átruházható tanúsítvány és a futó ajánlatokra adott régi ár elég biztonságot adott ahhoz, hogy a prémium szinterezett kővel folytassuk.'
};
