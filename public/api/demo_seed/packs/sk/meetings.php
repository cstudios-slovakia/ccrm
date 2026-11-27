<?php
/**
 * Demo pack "meetings" (sk): the three meetings of the AI meeting room (C11).
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
            'title' => 'Týždenná porada – výroba a obchod',
            'day' => -2,
            'duration' => 45,
            'archived' => false,
            'lead' => null,
            'clients' => ['C1', 'C3', 'C6'],
            'users' => ['owner', 'pm', 'sales'],
            'notes' => [
                ['h2', 'Body porady'],
                ['bullet', '{project:P3}: meškanie dosiek a nový termín'],
                ['bullet', 'Záloha: {client:C6} po splatnosti'],
                ['bullet', '{project:P1}: zameranie lobby a druhá splátka'],
                ['bullet', 'Cenník dosiek od dodávateľa na ďalší štvrťrok'],
                ['bullet', 'Ponuky: {client:L9} a {client:L10}'],
            ],
            'transcript' => [
                [
                    'owner',
                    'Dobre, poďme na to. Mám päť bodov: Aurum, záloha od hotela, Horský park, cenník dosiek a ponuky. {first:pm}, začni Aurumom.',
                ],
                [
                    'pm',
                    'Dosky na wellness stenu vyšli z fabriky o desať dní neskôr. Do dielne prídu {d:4}, rezanie trvá štyri dni a montáž v hoteli môžeme začať {d:9}. Riaditeľke som napísala, termín prijala, ale otvorenie je pevné.',
                ],
                ['owner', 'Takže rezerva nie je žiadna. Dá sa podlaha lobby rezať paralelne, aby partia nestála?'],
                ['pm', 'Áno, porcelán Lumina na lobby už máme na sklade. Na vodný lúč dám na tri dni druhého operátora.'],
                ['owner', 'Výborne. K zálohe: pripomienku som poslal včera, hotel sľúbil platbu do {d:3}. Uvidíme.'],
                [
                    'sales',
                    'Horský park sa pýtal, či sa zameranie lobby stihne ešte tento mesiac. Navrhujem budúci utorok, dohodnem to s ich stavbyvedúcim.',
                ],
                ['owner', 'Dobre. Druhú splátku už majú, termín platby je za päť dní. Čo cenník dosiek?'],
                [
                    'pm',
                    'Dodávateľ ide v priemere o štyri percentá hore. Pridelenie som potvrdila: 140 m² kremeňa, 60 m² spekaného kameňa, 80 m² porcelánu. Kremeň Calacatta bude stáť {m:99} za meter štvorcový.',
                ],
                [
                    'owner',
                    'To sa dá uniesť, ale mrzne mi to maržu. Na cenníku pre partnerov to zatiaľ nemeníme, vrátime sa k tomu v januári.',
                ],
                [
                    'sales',
                    'Ponuky: {contact:L9} sa pýtala na hranu 4 cm okolo drezu, odpovedala som, že to ide. Zameranie som jej navrhla na {d:2}. Pre Müllera máte hotový rámec?',
                ],
                ['owner', 'Dokončím ho dnes, ide v nej šesť vilových projektov ročne. Potom mu zavolám.'],
                [
                    'owner',
                    'Ešte jedna vec: v {d:10} máme v showroome deň otvorených dverí. {first:sales}, máš všetko pripravené?',
                ],
                ['sales', 'Vzorky aj ukážka vodného lúča sú pripravené, chýba len schválenie rozpočtu na leták.'],
                [
                    'owner',
                    'Schvaľujem. Zhrniem: {first:pm} potvrdí s dodávateľom nový termín dosiek a pošle hotelu vzorky spár, {first:sales} dohodne zameranie ({contact:L9}), ja dokončím ponuku pre Müllera. Faktúru hotelu som už pripomenul. Ďakujem.',
                ],
            ],
            'minutes' => '### Týždenná porada – výroba a obchod

**Účastníci:** {user:owner}, {user:pm}, {user:sales}  
**Trvanie:** 45 min

#### 1. {project:P3}
- Dosky na wellness stenu meškajú o desať dní; do dielne prídu {d:4}, montáž v hoteli od {d:9}.
- Podlahu lobby rezať paralelne (porcelán Lumina je na sklade), druhý operátor na vodnom lúči tri dni.

#### 2. Záloha: {client:C6}
- Pripomienka odoslaná, hotel sľúbil platbu do {d:3}.

#### 3. {project:P1}
- Druhá splátka vystavená, splatná za päť dní.
- Zameranie lobby navrhnuté na budúci utorok.

#### 4. Cenník dosiek
- Dodávateľ v priemere +4 %; pridelenie na štvrťrok potvrdené (140 / 60 / 80 m²).
- Cenník pre partnerov sa nemení, návrat v januári.

#### 5. Ponuky a showroom
- {client:L9}: hrana 4 cm okolo drezu, zameranie {d:2}.
- {client:L10}: rámcová ponuka sa dokončí dnes.
- Deň otvorených dverí {d:10}: rozpočet na leták schválený.',
            'summary' => [
                'summary' => 'Tím prebral desaťdňové meškanie dosiek pre {project:P3}: dosky prídu do dielne {d:4}, podlaha lobby sa reže paralelne a montáž v hoteli sa začne {d:9}. Záloha hotela je po splatnosti a pripomienka už odišla. Dodávateľ zdražuje o štyri percenty; cenník pre partnerov sa nemení. Ponuky ({client:L9}, {client:L10}) idú do finále a na {d:10} je naplánovaný deň otvorených dverí.',
                'sentiment' => 'neutral',
                'topics' => ['Meškanie dodávateľa', 'Pohľadávky', 'Cenník dosiek', 'Ponuky', 'Deň otvorených dverí'],
                'actionItems' => [
                    '{first:pm}: potvrdiť s dodávateľom nový termín dosiek a poslať hotelu vzorky spár.',
                    '{first:sales}: dohodnúť zameranie ({contact:L9}) a pripomenúť ponuku.',
                    '{first:owner}: poslať pripomienku zálohy hotelu.',
                    '{first:owner}: dokončiť rámcovú ponuku pre {client:L10}.',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Potvrdiť nový termín dosiek a poslať hotelu vzorky spár',
                    'description' => 'Dodávateľ posunul expedíciu o desať dní; hotel potrebuje farby spár na schválenie.',
                    'assignee' => 'pm',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'high',
                    'status' => 'in_progress',
                ],
                [
                    'n' => 2,
                    'title' => 'Zameranie ({client:L9}) a pripomenutie ponuky',
                    'description' => 'Potvrdiť hranu 4 cm okolo drezu a dohodnúť termín zamerania.',
                    'assignee' => 'sales',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'medium',
                    'status' => 'todo',
                ],
                [
                    'n' => 3,
                    'title' => 'Pripomienka zálohovej faktúry hotelu',
                    'description' => 'Faktúra za {project:P3} je po splatnosti; poslať jemnú pripomienku.',
                    'assignee' => 'owner',
                    'startDay' => -2,
                    'dueDay' => -2,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 4,
                    'title' => 'Dokončiť rámcovú ponuku pre {client:L10}',
                    'description' => 'Šesť vilových projektov ročne, pevná cena na polrok.',
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
            'title' => 'Stretnutie s hotelom – {project:P3}',
            'day' => -6,
            'duration' => 60,
            'archived' => false,
            'lead' => 'C6',
            'clients' => ['C6'],
            'users' => ['owner', 'pm'],
            'notes' => [
                ['h2', 'Body stretnutia'],
                ['bullet', 'Meškanie dosiek na wellness stenu'],
                ['bullet', 'Schválenie vzorky farby spár'],
                ['bullet', 'Splátkový kalendár projektu {project:P3}'],
                ['todo', 'Poslať vzorky farieb spár do troch dní'],
                ['quote', 'Otvorenie wellness je pevné – po novom termíne už nechceme žiadne ďalšie posuny.'],
            ],
            'transcript' => [
                [
                    'pm',
                    'Ďakujem, že ste si našli čas. Začnem tým najdôležitejším: dosky na wellness stenu meškajú desať dní, pozrite sa na nový harmonogram.',
                ],
                ['C6', 'Čítam to. Je to veľmi tesné, otvorenie wellness je už oznámené hosťom. Čo ak sa dosky oneskoria znova?'],
                [
                    'owner',
                    'Dosky už vyšli z fabriky a sú na ceste, nový termín sme potvrdili s dodávateľom písomne. Navyše budeme rezať podlahu lobby paralelne, aby sme získali čas.',
                ],
                ['C6', 'Dobre. Ďalšia vec je farba spár. Videli sme vzorku a v spa osvetlení je príliš tmavá.'],
                [
                    'pm',
                    'Pošlem vám tri svetlejšie odtiene a môžeme ich spolu posúdiť priamo na stene, keď bude prvý panel osadený.',
                ],
                ['C6', 'A ešte splátky. Záloha je po splatnosti, ospravedlňujem sa, pošlem to našej účtovníčke ešte dnes.'],
                [
                    'owner',
                    'Vďaka. Druhú splátku fakturujeme po osadení wellness steny a zvyšok po odovzdaní. Splatnosť zostáva 14 dní.',
                ],
                ['C6', 'Platí. Zavolajte mi, keď budú dosky v dielni.'],
            ],
            'minutes' => '### Stretnutie s hotelom – {project:P3}

**Účastníci:** {user:owner}, {user:pm}, {contact:C6}  
**Trvanie:** 60 min

#### 1. Meškanie
- Dosky meškajú desať dní, nový termín potvrdený písomne od dodávateľa.
- Podlaha lobby sa reže paralelne.

#### 2. Vzorka spár
- Aktuálna vzorka je v spa osvetlení príliš tmavá; tri svetlejšie odtiene do troch dní, rozhodnutie priamo na stene.

#### 3. Splátky
- Záloha po splatnosti, hotel ju postúpi účtovníctvu ešte dnes.
- Druhá splátka po osadení wellness steny, zvyšok pri odovzdaní, splatnosť 14 dní.',
            'summary' => [
                'summary' => 'Hotel prijal nový termín dosiek, ale otvorenie wellness je pevné, preto žiada písomné potvrdenie od dodávateľa a paralelné rezanie podlahy. Vzorka spár je v spa osvetlení príliš tmavá; dodáme tri svetlejšie odtiene. Záloha je po splatnosti a hotel ju uhradí; ďalšie splátky sú naviazané na osadenie wellness steny a odovzdanie.',
                'sentiment' => 'negative',
                'topics' => ['Meškanie dosiek', 'Vzorka spár', 'Splátkový kalendár'],
                'actionItems' => [
                    'Poslať hotelu tri svetlejšie vzorky spár do troch dní.',
                    'Získať písomné potvrdenie termínu od dodávateľa.',
                    'Zavolať hotelu, keď budú dosky v dielni.',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Tri svetlejšie vzorky spár pre hotel',
                    'description' => 'Vzorky na schválenie priamo na wellness stene.',
                    'assignee' => 'pm',
                    'startDay' => -6,
                    'dueDay' => -3,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 2,
                    'title' => 'Písomné potvrdenie termínu od dodávateľa',
                    'description' => 'Hotel to požaduje ako podmienku pre pokračovanie.',
                    'assignee' => 'owner',
                    'startDay' => -6,
                    'dueDay' => -4,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 3,
                    'title' => 'Zavolať hotelu po príchode dosiek do dielne',
                    'description' => 'Oznámiť skutočný dátum začiatku montáže.',
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
            'title' => 'Hovor s dodávateľom – dosky na ďalší štvrťrok',
            'day' => -20,
            'duration' => 30,
            'archived' => true,
            'lead' => null,
            'clients' => [],
            'users' => ['owner', 'pm'],
            'supplier' => 'S1',
            'notes' => [
                ['h2', 'Program'],
                ['number', 'Pridelenie dosiek na ďalší štvrťrok'],
                ['number', 'Cenník a podmienky nakládky'],
                ['quote', 'Ceny platia pri odbere nad 250 m² v štvrťroku.'],
            ],
            'transcript' => [
                ['S1', 'Dobrý deň, posielala som cenník včera. Ceny idú v priemere o štyri percentá hore kvôli energiám.'],
                [
                    'pm',
                    'Rozumieme. Potrebujeme potvrdiť pridelenie: 140 m² kremeňa Calacatta, 60 m² spekaného kameňa a 80 m² porcelánu.',
                ],
                ['S1', 'To je v poriadku, rezervujem to na prvú nakládku v prvom týždni štvrťroka.'],
                ['owner', 'Dôležité pre nás je, aby sa už neopakovalo desaťdňové meškanie. Môžete dať termín nakládky písomne?'],
                ['S1', 'Samozrejme, potvrdenie dostanete ešte dnes.'],
            ],
            'minutes' => '### Hovor s dodávateľom – dosky na ďalší štvrťrok

**Účastníci:** {user:owner}, {user:pm}, [[contact:S1]]  
**Trvanie:** 30 min

- Ceny dosiek idú v priemere o 4 % hore.
- Pridelenie potvrdené: 140 m² kremeň, 60 m² spekaný kameň, 80 m² porcelán.
- Nakládka v prvom týždni štvrťroka; termín dodávateľ potvrdí písomne.',
            'summary' => [
                'summary' => 'Dodávateľ zvyšuje ceny dosiek v priemere o štyri percentá. Pridelenie na ďalší štvrťrok (140 m² kremeň, 60 m² spekaný kameň, 80 m² porcelán) je potvrdené na prvú nakládku a termín nakládky príde písomne.',
                'sentiment' => 'neutral',
                'topics' => ['Ceny dosiek', 'Pridelenie', 'Nakládka'],
                'actionItems' => ['Potvrdiť objednávku podľa cenníka.'],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Potvrdiť objednávku dosiek podľa nového cenníka',
                    'description' => 'Pridelenie na štvrťrok, prvá nakládka v prvom týždni.',
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
