<?php
/**
 * Demo pack "meetings" (hu): the three meetings of the AI meeting room (C11).
 *
 * `lead`/`clients` are client refs, `users` and `assignee` are login roles, `supplier` is a
 * supplier ref (only on the archived supplier call). `transcript` turns are [speaker, text]
 * with a login role or a cast ref as speaker; `[[contact:S1]]` is filled by meetings.php (a supplier has no demo_text placeholder); the module spreads the timestamps over the
 * meeting's duration. `notes` blocks are [type, text]; `startDay`/`dueDay` are day offsets.
 */
return [
    'meetings' => [
        [
            'n' => 1,
            'title' => 'Heti értekezlet – gyártás és értékesítés',
            'day' => -2,
            'duration' => 45,
            'archived' => false,
            'lead' => null,
            'clients' => ['C1', 'C3', 'C6'],
            'users' => ['owner', 'pm', 'sales'],
            'notes' => [
                ['h2', 'Napirend'],
                ['bullet', '{project:P3}: lapok késése és új határidő'],
                ['bullet', '{client:C6} lejárt előlegszámlája'],
                ['bullet', '{project:P1}: az előcsarnok felmérése és a második részlet'],
                ['bullet', 'A beszállító lapárlistája a következő negyedévre'],
                ['bullet', 'Ajánlatok: {client:L9} és {client:L10}'],
            ],
            'transcript' => [
                [
                    'owner',
                    'Rendben, vágjunk bele. Öt pontom van: Aurum, a szálloda előlege, Hegyvidék, a lapárlista és az ajánlatok. {first:pm}, kezdd az Aurummal.',
                ],
                [
                    'pm',
                    'A wellnessfal lapjai tíz nappal később hagyták el a gyárat. a műhelybe {d:2} napján érkeznek meg, a vágás négy nap, a szerelést a szállodában {d:9} napján kezdhetjük. Megírtam az igazgatónőnek, elfogadta az új időpontot, de a megnyitás fix.',
                ],
                ['owner', 'Vagyis tartalék nincs. Lehet párhuzamosan vágni az előcsarnok padlóját, hogy a brigád ne álljon?'],
                [
                    'pm',
                    'Igen, az előcsarnokhoz a Lumina porcelán már raktáron van. Három napra odateszem a második operátort a vízsugárra.',
                ],
                [
                    'owner',
                    'Kiváló. Az előlegről: az emlékeztetőt tegnap elküldtem, a szálloda ezt ígérte a fizetés határidejének: {d:3}. Meglátjuk.',
                ],
                [
                    'sales',
                    'A Hegyvidék azt kérdezte, hogy az előcsarnok felmérése még ebben a hónapban belefér-e. Jövő keddet javaslom, egyeztetem az építésvezetővel.',
                ],
                [
                    'owner',
                    'Jó. A második részletet megkapták, a fizetési határidő öt nap múlva jár le. Mi a helyzet a lapárlistával?',
                ],
                [
                    'pm',
                    'A beszállító átlagosan négy százalékkal emel. A kiosztást megerősítettem: 140 m² kvarc, 60 m² szinterezett kő, 80 m² porcelán. A Calacatta kvarc négyzetméterenként {m:99} lesz.',
                ],
                [
                    'owner',
                    'Ez még elviselhető, de az árrést szorítja. A partnerek árlistáját egyelőre nem módosítjuk, januárban visszatérünk rá.',
                ],
                [
                    'sales',
                    'Ajánlatok: {contact:L9} a mosogató körüli 4 cm-es élről kérdezett, azt válaszoltam, hogy megoldható. A felmérésre {d:2} napját javasoltam neki. Müllernek kész a keretajánlat?',
                ],
                ['owner', 'Ma befejezem, évi hat villaprojektről szól. Utána felhívom.'],
                ['owner', 'Még egy dolog: {d:10} napján nyílt napot tartunk a szalonban. {first:sales}, minden kész?'],
                [
                    'sales',
                    'A minták és a vízsugaras bemutató készen vannak, csak a szórólap költségvetésének jóváhagyása hiányzik.',
                ],
                [
                    'owner',
                    'Jóváhagyom. Összefoglalom: {first:pm} megerősíti a beszállítóval a lapok új határidejét és elküldi a hézagmintákat a szállodának, {first:sales} egyezteti a felmérést az ügyfélnél ({contact:L9}), én befejezem a Müller-ajánlatot. A szálloda számláját már sürgettem. Köszönöm.',
                ],
            ],
            'minutes' => '### Heti értekezlet – gyártás és értékesítés

**Résztvevők:** {user:owner}, {user:pm}, {user:sales}  
**Időtartam:** 45 perc

#### 1. {project:P3}
- A wellnessfal lapjai tíz napot késnek; a műhelybe {d:2} napján érkeznek, a szerelés a szállodában {d:9} napjától kezdődik.
- Az előcsarnok padlóját párhuzamosan vágjuk (a Lumina porcelán raktáron van), a második operátor három napig a vízsugárnál.

#### 2. {client:C6} előlege
- Az emlékeztető elment, a szálloda a fizetést {d:3} napjára ígérte.

#### 3. {project:P1}
- A második részlet kiállítva, öt nap múlva esedékes.
- Az előcsarnok felmérését jövő keddre javasoltuk.

#### 4. Lapárlista
- A beszállító átlagosan +4 %; a negyedéves kiosztás megerősítve (140 / 60 / 80 m²).
- A partnerek árlistája nem változik, januárban visszatérünk rá.

#### 5. Ajánlatok és szalon
- {client:L9}: 4 cm-es él a mosogató körül, felmérés {d:2}.
- {client:L10}: a keretajánlat ma készül el.
- Nyílt nap {d:10}: a szórólap költségvetése jóváhagyva.',
            'summary' => [
                'summary' => 'A csapat átbeszélte a lapok tíznapos késését ({project:P3}): a lapok {d:2} napján érkeznek a műhelybe, az előcsarnok padlóját párhuzamosan vágják, a szerelés a szállodában {d:9} napján kezdődik. A szálloda előlege lejárt, az emlékeztető elment. A beszállító négy százalékkal emel; a partnerek árlistája nem változik. Az ajánlatok ({client:L9}, {client:L10}) a végéhez közelednek, a nyílt nap időpontja: {d:10}.',
                'sentiment' => 'neutral',
                'topics' => ['Beszállítói késés', 'Követelések', 'Lapárlista', 'Ajánlatok', 'Nyílt nap'],
                'actionItems' => [
                    '{first:pm}: megerősíteni a beszállítóval a lapok új határidejét, és elküldeni a hézagmintákat a szállodának.',
                    '{first:sales}: egyeztetni a felmérést az ügyfélnél ({contact:L9}), és emlékeztetni az ajánlatra.',
                    '{first:owner}: elküldeni a szállodának az előleg emlékeztetőjét.',
                    '{first:owner}: befejezni a keretajánlatot ({client:L10}).',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'A lapok új határidejének megerősítése és hézagminták küldése a szállodának',
                    'description' => 'A beszállító tíz nappal tolta a feladást; a szállodának jóváhagyásra kellenek a hézagszínek.',
                    'assignee' => 'pm',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'high',
                    'status' => 'in_progress',
                ],
                [
                    'n' => 2,
                    'title' => 'Felmérés {client:L9} otthonában és az ajánlat sürgetése',
                    'description' => 'Megerősíteni a mosogató körüli 4 cm-es élet és egyeztetni a felmérés időpontját.',
                    'assignee' => 'sales',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'medium',
                    'status' => 'todo',
                ],
                [
                    'n' => 3,
                    'title' => 'Emlékeztető a szálloda előlegszámlájáról',
                    'description' => 'Az előlegszámla ({project:P3}) lejárt; kérjük, küldjön udvarias emlékeztetőt.',
                    'assignee' => 'owner',
                    'startDay' => -2,
                    'dueDay' => -2,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 4,
                    'title' => 'Keretajánlat befejezése: {client:L10}',
                    'description' => 'Évi hat villaprojekt, féléves fix ár.',
                    'assignee' => 'owner',
                    'startDay' => -2,
                    'dueDay' => 1,
                    'priority' => 'medium',
                    'status' => 'in_progress',
                ],
            ],
        ],
        [
            'n' => 2,
            'title' => 'Egyeztetés a szállodával – {project:P3}',
            'day' => -6,
            'duration' => 60,
            'archived' => false,
            'lead' => 'C6',
            'clients' => ['C6'],
            'users' => ['owner', 'pm'],
            'notes' => [
                ['h2', 'Napirend'],
                ['bullet', 'A wellnessfal lapjainak késése'],
                ['bullet', 'A hézagszín mintájának jóváhagyása'],
                ['bullet', 'Részletfizetési ütemezés: {project:P3}'],
                ['todo', 'Három napon belül hézagszín-mintákat küldeni'],
                ['quote', 'A wellness megnyitása fix – az új határidő után nem kérünk újabb csúszást.'],
            ],
            'transcript' => [
                [
                    'pm',
                    'Köszönöm, hogy időt szakítottak ránk. A legfontosabbal kezdem: a wellnessfal lapjai tíz napot késnek, kérem, nézzék meg az új ütemtervet.',
                ],
                [
                    'C6',
                    'Olvasom. Nagyon szoros, a wellness megnyitását már meghirdettük a vendégeknek. Mi lesz, ha a lapok még egyszer késnek?',
                ],
                [
                    'owner',
                    'A lapok elhagyták a gyárat és úton vannak, az új határidőt írásban megerősítettük a beszállítóval. Emellett az előcsarnok padlóját párhuzamosan vágjuk, hogy időt nyerjünk.',
                ],
                ['C6', 'Rendben. A következő a hézagszín. Láttuk a mintát, és a spa megvilágításában túl sötétnek tűnik.'],
                ['pm', 'Három világosabb árnyalatot küldök, és együtt megnézhetjük őket a falon, amikor az első panel felkerül.'],
                ['C6', 'És még a részletek. Az előleg lejárt, elnézést kérek, még ma továbbítom a könyvelőnknek.'],
                [
                    'owner',
                    'Köszönöm. A második részletet a wellnessfal felszerelése után számlázzuk, a maradékot az átadáskor. A fizetési határidő marad 14 nap.',
                ],
                ['C6', 'Rendben. Hívjon, amint a lapok a műhelyben vannak.'],
            ],
            'minutes' => '### Egyeztetés a szállodával – {project:P3}

**Résztvevők:** {user:owner}, {user:pm}, {contact:C6}  
**Időtartam:** 60 perc

#### 1. Késés
- A lapok tíz napot késnek, az új határidőt a beszállító írásban megerősítette.
- Az előcsarnok padlóját párhuzamosan vágjuk.

#### 2. Hézagminta
- A mostani minta a spa megvilágításában túl sötét; három világosabb árnyalat három napon belül, a döntés közvetlenül a falon.

#### 3. Részletek
- Az előleg lejárt, a szálloda még ma továbbítja a könyvelésnek.
- A második részlet a wellnessfal felszerelése után, a maradék átadáskor, fizetési határidő 14 nap.',
            'summary' => [
                'summary' => 'A szálloda elfogadta a lapok új határidejét, de a wellness megnyitása fix, ezért írásos megerősítést kért a beszállítótól és a padló párhuzamos vágását. A hézagminta a spa megvilágításában túl sötét; három világosabb árnyalatot küldünk. Az előleg lejárt, a szálloda kiegyenlíti; a további részletek a wellnessfal felszereléséhez és az átadáshoz kötődnek.',
                'sentiment' => 'negative',
                'topics' => ['Lapok késése', 'Hézagminta', 'Részletfizetés'],
                'actionItems' => [
                    'Három napon belül három világosabb hézagmintát küldeni a szállodának.',
                    'Írásos határidő-megerősítést kérni a beszállítótól.',
                    'Felhívni a szállodát, amint a lapok a műhelyben vannak.',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Három világosabb hézagminta a szállodának',
                    'description' => 'Minták jóváhagyásra, közvetlenül a wellnessfalon.',
                    'assignee' => 'pm',
                    'startDay' => -6,
                    'dueDay' => -3,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 2,
                    'title' => 'Írásos határidő-megerősítés a beszállítótól',
                    'description' => 'A szálloda ezt kéri a folytatás feltételéül.',
                    'assignee' => 'owner',
                    'startDay' => -6,
                    'dueDay' => -4,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 3,
                    'title' => 'Felhívni a szállodát a lapok műhelybe érkezése után',
                    'description' => 'Közölni a szerelés tényleges kezdési dátumát.',
                    'assignee' => 'pm',
                    'startDay' => -6,
                    'dueDay' => 3,
                    'priority' => 'medium',
                    'status' => 'todo',
                ],
            ],
        ],
        [
            'n' => 3,
            'title' => 'Hívás a beszállítóval – lapok a következő negyedévre',
            'day' => -20,
            'duration' => 30,
            'archived' => true,
            'lead' => null,
            'clients' => [],
            'users' => ['owner', 'pm'],
            'supplier' => 'S1',
            'notes' => [
                ['h2', 'Napirend'],
                ['number', 'Lapkiosztás a következő negyedévre'],
                ['number', 'Árlista és berakodási feltételek'],
                ['quote', 'Az árak negyedévenként 250 m² feletti vásárlásnál érvényesek.'],
            ],
            'transcript' => [
                [
                    'S1',
                    'Jó napot, tegnap küldtem az árlistát. Az árak átlagosan négy százalékkal emelkednek az energiaárak miatt.',
                ],
                [
                    'pm',
                    'Értjük. Meg kell erősítenünk a kiosztást: 140 m² Calacatta kvarc, 60 m² szinterezett kő és 80 m² porcelán.',
                ],
                ['S1', 'Ez rendben van, lefoglalom az első berakodásra a negyedév első hetében.'],
                [
                    'owner',
                    'Számunkra fontos, hogy a tíznapos késés ne ismétlődjön meg. Meg tudják adni írásban a berakodási időpontot?',
                ],
                ['S1', 'Természetesen, a visszaigazolást még ma megkapják.'],
            ],
            'minutes' => '### Hívás a beszállítóval – lapok a következő negyedévre

**Résztvevők:** {user:owner}, {user:pm}, [[contact:S1]]  
**Időtartam:** 30 perc

- A lapárak átlagosan 4 %-kal emelkednek.
- A kiosztás megerősítve: 140 m² kvarc, 60 m² szinterezett kő, 80 m² porcelán.
- Berakodás a negyedév első hetében; a határidőt a beszállító írásban visszaigazolja.',
            'summary' => [
                'summary' => 'A beszállító átlagosan négy százalékkal emeli a lapárakat. A következő negyedéves kiosztás (140 m² kvarc, 60 m² szinterezett kő, 80 m² porcelán) az első berakodásra megerősítve, a berakodási időpont írásban érkezik.',
                'sentiment' => 'neutral',
                'topics' => ['Lapárak', 'Kiosztás', 'Berakodás'],
                'actionItems' => ['Az árlista szerinti rendelés visszaigazolása.'],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'A lapok megrendelésének visszaigazolása az új árlista szerint',
                    'description' => 'Negyedéves kiosztás, az első berakodás az első héten.',
                    'assignee' => 'pm',
                    'startDay' => -20,
                    'dueDay' => -19,
                    'priority' => 'medium',
                    'status' => 'done',
                ],
            ],
        ],
    ],
];
