<?php
/**
 * Demo pack "email" (sk): the demo mailbox for about three weeks (module email.php).
 *
 * Senders and recipients are cast refs (owner, pm, sales, C1..C6, L9, S1, S2) or a key of
 * `parties`. `re` points at the `n` of the message a reply answers. Attachment shapes:
 * `rows` (csv), `title` + `lines` (pdf), `seed` (png), `ics` (invitation). `[[name:S1]]` and
 * `[[contact:S1]]` are filled by email.php for cast records demo_text() has no placeholder for.
 */
return [
    'quoteHead' => 'Dňa %1$s napísal(a) %2$s:',
    'parties' => [
        'news' => ['name' => 'Kamenárske noviny', 'email' => 'newsletter@stone-trade.example'],
        'courier' => ['name' => 'Packeta Business', 'email' => 'tracking@carrier.example'],
    ],
    'messages' => [
        [
            'n' => 1,
            'folder' => 'INBOX',
            'day' => -21,
            'time' => '16:20',
            'from' => 'S1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Cenník dosiek na ďalší štvrťrok a termín hovoru',
            'body' => 'Dobrý deň, {first:pm},

posielam cenník dosiek na nasledujúci štvrťrok. Ceny platia pri odbere nad 250 m² a dodaní na paletách z našej fabriky v Fiorano.

Zajtra o 10:00 si môžeme prejsť pridelenie dosiek a termíny nakládky. Vyhovuje vám to?

S pozdravom
[[contact:S1]]
[[name:S1]]',
            'att' => [
                [
                    'name' => 'cennik_dosiek_stvrtrok.csv',
                    'rows' => [
                        ['Položka', 'Hrúbka (mm)', 'Cena za m² (EUR)'],
                        ['Kremeň Calacatta „Aurelia“', 20, '{m:99}'],
                        ['Spekaný kameň Nero Marquina „Stratos“', 12, '{m:114}'],
                        ['Porcelánová doska Statuario „Lumina“', 6, '{m:74}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 2,
            'folder' => 'Sent',
            'day' => -20,
            'time' => '15:10',
            'from' => 'pm',
            'to' => 'S1',
            'seen' => true,
            're' => 1,
            'subject' => 'RE: Cenník dosiek na ďalší štvrťrok a termín hovoru',
            'body' => 'Dobrý deň,

ďakujem za dnešný hovor. Potvrdzujem pridelenie na budúci štvrťrok: 140 m² kremeňa Calacatta, 60 m² spekaného kameňa Nero Marquina a 80 m² porcelánu Statuario. Prvá nakládka v prvom týždni.

Prijímame ceny z cenníka. Prosím o potvrdenie objednávky a termínu expedície.

S pozdravom
{user:pm}
{company}',
        ],
        [
            'n' => 3,
            'folder' => 'INBOX',
            'day' => -18,
            'time' => '11:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Týždenný zoznam zákaziek – 44. týždeň',
            'body' => 'Dobrý deň, {first:pm},

v prílohe je zoznam kuchynských dosiek na tento týždeň: deväť zákaziek, spolu približne 31 m². Dve zákazky sú v spekanom kameni, tie majú požiadavku na rýchlejší termín.

Ďakujem a pekný deň
{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'zoznam_zakaziek_t44.csv',
                    'rows' => [
                        ['Zákazka', 'Materiál', 'Plocha (m²)', 'Termín'],
                        ['KL-4401', 'Kremeň Calacatta 20 mm', 3.8, '{d:5}'],
                        ['KL-4402', 'Spekaný kameň Nero Marquina 12 mm', 4.2, '{d:4}'],
                        ['KL-4403', 'Granit Absolute Black 30 mm', 3.1, '{d:7}'],
                        ['KL-4404', 'Kremeň Calacatta 20 mm', 2.9, '{d:7}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 4,
            'folder' => 'Sent',
            'day' => -17,
            'time' => '09:05',
            'from' => 'pm',
            'to' => 'C3',
            'seen' => true,
            're' => 3,
            'subject' => 'RE: Týždenný zoznam zákaziek – 44. týždeň',
            'body' => 'Dobrý deň,

zoznam sme prijali. Obe zákazky v spekanom kameni vieme dodať do štyroch pracovných dní, ostatné podľa rámcovej zmluvy do šiestich. Zameranie pri KL-4403 ešte potvrdí náš montážny tím.

S pozdravom
{user:pm}',
        ],
        [
            'n' => 5,
            'folder' => 'INBOX',
            'day' => -17,
            'time' => '07:00',
            'from' => 'news',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Kameň & dizajn: trendy v pracovných doskách na jeseň',
            'body' => 'Tento týždeň vo výbere:

• Spekaný kameň vytláča kremeň v kuchyniach nad {m:8000}
• Ako sa mení dopyt po hrane 4 cm a zvislom obklade
• Údržba povrchov: čo skutočne funguje

Celé číslo si prečítate na webe. Odhlásiť odber môžete kedykoľvek.',
        ],
        [
            'n' => 6,
            'folder' => 'INBOX',
            'day' => -12,
            'time' => '10:10',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Výrez pre drez – ako ďalej?',
            'body' => 'Dobrý deň,

písala som cez formulár na webe kvôli kuchynskej doske. Pri drezi mám podhľadovú montáž a bojím sa, že hrana okolo výrezu nebude dosť pevná. Posielam fotku miesta s rozmermi.

Stihli by ste ponuku do konca týždňa?

Ďakujem
{contact:L9}',
            'att' => [
                ['name' => 'vyrez_drez.png', 'seed' => 61],
            ],
        ],
        [
            'n' => 7,
            'folder' => 'Sent',
            'day' => -12,
            'time' => '14:20',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 6,
            'subject' => 'RE: Výrez pre drez – ako ďalej?',
            'body' => 'Dobrý deň,

ďakujem za fotku. Podhľadový drez je pri kremeni bežný, výrez opracujeme na CNC a hranu vystužíme zospodu. V prílohe je ponuka na dosku 2,4 × 0,6 m so zadným obkladom. Hrana 4 cm so šikmým spojom je za príplatok {m:180}.

Ak to dá zmysel, dohodneme zameranie priamo u vás.

S pozdravom
{user:sales}
{company}',
            'att' => [
                [
                    'name' => 'ponuka_kuchynska_doska.pdf',
                    'title' => 'Cenová ponuka – kuchynská doska',
                    'lines' => [
                        'Biela kremeňová doska 20 mm, 2,4 × 0,6 m',
                        'Zadný obklad 12 mm, výrez pre podhľadový drez',
                        'Voliteľne: hrana 4 cm so šikmým spojom +{m:180}',
                        '',
                        'Cena spolu: {m:8400}',
                    ],
                ],
            ],
        ],
        [
            'n' => 8,
            'folder' => 'INBOX',
            'day' => -11,
            'time' => '09:02',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            're' => 7,
            'subject' => 'RE: Výrez pre drez – ako ďalej?',
            'body' => 'Dobrý deň,

ponuka vyzerá dobre. Dá sa hrana 4 cm urobiť aj okolo drezu, alebo len na prednej strane?

{contact:L9}',
        ],
        [
            'n' => 9,
            'folder' => 'Sent',
            'day' => -11,
            'time' => '11:40',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 8,
            'subject' => 'RE: Výrez pre drez – ako ďalej?',
            'body' => 'Dobrý deň,

hrubá hrana ide aj okolo výrezu, je to na to ideálne riešenie. Zameranie navrhujem na {d:2} popoludní. Vyhovuje?

S pozdravom
{user:sales}',
        ],
        [
            'n' => 10,
            'folder' => 'INBOX',
            'day' => -10,
            'time' => '12:00',
            'from' => 'S2',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Jesenná ponuka zvyškových dosiek: –15 %',
            'body' => 'Dobrý deň,

ako každú jeseň ponúkame zvyškové dosky zo skladu so zľavou 15 %. Zoznam je v prílohe, platí do vypredania zásob. Zvyšky sa hodia na vanity dosky a parapety.

[[name:S2]]',
            'att' => [
                [
                    'name' => 'zvysky_dosiek.pdf',
                    'title' => 'Zvyškové dosky – jeseň',
                    'lines' => [
                        'Calacatta 20 mm, 1,6 × 0,7 m .......... {m:210}',
                        'Absolute Black 30 mm, 1,2 × 0,6 m ..... {m:160}',
                        '',
                        'Ceny bez DPH. Zľava 15 % je už zahrnutá.',
                    ],
                ],
            ],
        ],
        [
            'n' => 11,
            'folder' => 'Sent',
            'day' => -8,
            'time' => '09:30',
            'from' => 'pm',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Hotel Aurum – meškanie dosiek a nový termín',
            'body' => 'Dobrý deň,

ospravedlňujeme sa za meškanie. Dosky pre obklad wellness steny nám dodávateľ pustil z výroby o desať dní neskôr. Nový termín dodania do dielne je {d:4}, montáž na recepcii a v lobby začne {d:9}.

Vieme sa stretnúť a prejsť vzorky spár a splátkový kalendár. Ozvite sa, ak vám vyhovuje stretnutie v tomto týždni.

S pozdravom
{user:pm}
{company}',
        ],
        [
            'n' => 12,
            'folder' => 'INBOX',
            'day' => -7,
            'time' => '15:12',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => true,
            're' => 11,
            'subject' => 'RE: Hotel Aurum – meškanie dosiek a nový termín',
            'body' => 'Dobrý deň, {first:pm},

ďakujeme za otvorenú komunikáciu. Nový termín berieme, ale otvorenie wellness je pevné. Prosím držte sa {d:9} na montáž a pošlite mi farby spár na schválenie.

{contact:C6}
{client:C6}',
        ],
        [
            'n' => 13,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '08:30',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Pozvánka: obhliadka vzorky spáry na mieste',
            'body' => 'Dobrý deň, {first:owner},

posielam pozvánku na obhliadku vzorky spáry priamo v spa. Prosím potvrďte účasť.

{contact:C6}',
            'att' => [
                [
                    'name' => 'invite.ics',
                    'ics' => ['day' => 4, 'time' => '10:00', 'minutes' => 60, 'title' => 'Obhliadka vzorky spáry – Hotel Aurum', 'location' => 'Hotel Aurum, wellness'],
                ],
            ],
        ],
        [
            'n' => 14,
            'folder' => 'Sent',
            'day' => -3,
            'time' => '09:00',
            'from' => 'owner',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Pripomienka: záloha faktúra po splatnosti',
            'body' => 'Dobrý deň,

upozorňujeme, že zálohová faktúra za projekt {project:P3} bola splatná {d:-12}. Pravdepodobne ide o prehliadnutie. Prosíme o úhradu v najbližších dňoch, aby sme mohli držať termín dodávky dosiek.

Ak ste už platili, berte túto správu ako bezpredmetnú.

S pozdravom
{user:owner}
{company}',
        ],
        [
            'n' => 15,
            'folder' => 'INBOX',
            'day' => -2,
            'time' => '13:40',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            're' => 14,
            'subject' => 'RE: Pripomienka: záloha faktúra po splatnosti',
            'body' => 'Dobrý deň, {first:owner},

ospravedlňujeme sa, faktúra sa stratila medzi dvoma oddeleniami. Účtovníčka ju uhradí do {d:3}.

{contact:C6}',
        ],
        [
            'n' => 16,
            'folder' => 'Sent',
            'day' => -9,
            'time' => '14:00',
            'from' => 'owner',
            'to' => 'C1',
            'seen' => true,
            'subject' => '{project:P1} – druhá splátka',
            'body' => 'Dobrý deň,

v prílohe posielame faktúru za druhú splátku projektu {project:P1}. Zodpovedá dokončenému zameraniu a prvej fáze rezania. Splatnosť je 14 dní.

S pozdravom
{user:owner}
{company}',
            'att' => [
                [
                    'name' => 'faktura_druha_splatka.pdf',
                    'title' => 'Faktúra – druhá splátka',
                    'lines' => ['Odberateľ: {client:C1}', 'Projekt: {project:P1}', 'Dátum splatnosti: {d:5}'],
                ],
            ],
        ],
        [
            'n' => 17,
            'folder' => 'INBOX',
            'day' => -8,
            'time' => '10:25',
            'from' => 'C1',
            'to' => 'owner',
            'seen' => true,
            're' => 16,
            'subject' => 'RE: {project:P1} – druhá splátka',
            'body' => 'Dobrý deň, {first:owner},

faktúru sme prijali a postúpili účtovníctvu. Úhrada pôjde v termíne. Zároveň sa pýtam, či sa ešte tento mesiac stihne zameranie lobby.

{contact:C1}',
        ],
        [
            'n' => 18,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '10:05',
            'from' => 'C1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Fotky z fasády – 3. podlažie',
            'body' => 'Dobrý deň, {first:pm},

posielam dve fotky aktuálneho stavu fasády na treťom podlaží. Spoje vyzerajú dobre, rohy ešte kontrolujeme.

{contact:C1}',
            'att' => [
                ['name' => 'fasada_3np_a.png', 'seed' => 71],
                ['name' => 'fasada_3np_b.png', 'seed' => 72],
            ],
        ],
        [
            'n' => 19,
            'folder' => 'INBOX',
            'day' => -14,
            'time' => '17:45',
            'from' => 'C2',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Malá štrbina na hrane dosky',
            'body' => 'Dobrý deň,

pri umývačke riadu som si všimla malú štrbinu na hrane dosky. Je to záručný prípad? Posielam fotku.

Ďakujem
{contact:C2}',
            'att' => [
                ['name' => 'strbina_hrana.png', 'seed' => 81],
            ],
        ],
        [
            'n' => 20,
            'folder' => 'Sent',
            'day' => -13,
            'time' => '09:15',
            'from' => 'sales',
            'to' => 'C2',
            'seen' => true,
            're' => 19,
            'subject' => 'RE: Malá štrbina na hrane dosky',
            'body' => 'Dobrý deň,

ďakujem za fotku. Áno, je to záručný prípad, hranu opravíme bezplatne. Požiadavku sme založili v servise a ozve sa vám kolega s termínom návštevy.

S pozdravom
{user:sales}
{company}',
        ],
        [
            'n' => 21,
            'folder' => 'INBOX',
            'day' => -5,
            'time' => '11:25',
            'from' => 'sales',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Deň otvorených dverí v showroome – kontrolný zoznam',
            'body' => 'Ahoj {first:owner},

na deň otvorených dverí {d:10} máme pripravené vzorky, občerstvenie a demo rezania vodným lúčom. Chýba mi ešte schválenie rozpočtu na leták.

{user:sales}',
        ],
        [
            'n' => 22,
            'folder' => 'INBOX',
            'day' => -4,
            'time' => '08:50',
            'from' => 'courier',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Vaša zásielka so vzorkami bola doručená',
            'body' => 'Zásielka s vzorkami kameňa bola doručená príjemcovi. Prevzal ju podpisom.

Sledovanie: LP-554-2290',
        ],
        [
            'n' => 23,
            'folder' => 'INBOX',
            'day' => -1,
            'time' => '10:05',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Vlásočnicová medzera v spoji na wellness stene',
            'body' => 'Dobrý deň, {first:pm},

v jednom spoji na wellness stene sme si všimli vlásočnicovú medzeru. Je to naliehavé, lebo sa blíži otvorenie. Posielam fotku.

{contact:C6}',
            'att' => [
                ['name' => 'spoj_wellness.png', 'seed' => 91],
            ],
        ],
        [
            'n' => 24,
            'folder' => 'INBOX',
            'day' => 0,
            'time' => '07:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Týždenný zoznam zákaziek – 45. týždeň',
            'body' => 'Dobrý deň, {first:pm},

nový týždenný zoznam je v prílohe. Tentoraz desať zákaziek, z toho jedna nová s vanity doskou z granitu.

{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'zoznam_zakaziek_t45.csv',
                    'rows' => [
                        ['Zákazka', 'Materiál', 'Plocha (m²)', 'Termín'],
                        ['KL-4501', 'Granit Absolute Black 30 mm', 1.4, '{d:8}'],
                        ['KL-4502', 'Kremeň Calacatta 20 mm', 3.6, '{d:8}'],
                    ],
                ],
            ],
        ],
    ],
];
