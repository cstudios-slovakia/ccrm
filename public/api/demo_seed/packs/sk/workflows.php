<?php
/**
 * Pack workflows, slovenské vydanie: sedem ukážok Automatizácií a workflowov a história behov.
 *
 * Len dáta (pozri kontrakt v demo_seed/index.php). Rovnaké kľúče, dĺžky zoznamov a čísla ako
 * packs/en/workflows.php a packs/hu/workflows.php; líšia sa len reťazce.
 *
 * Lokálne tokeny (workflows.php ich nahradí údajmi tejto inštancie, nie sú to demo_text zástupné znaky):
 * %source% zdroj leadov z webu · %offer% stav „ponuka odoslaná“ · %won% stav „prijatý“ ·
 * %cur% kód meny · %threshold% formátovaný limit hodnoty leadu pri AI triedení.
 * `{{$trigger.x}}`, `{{$input.x}}` a `{{$ai.x}}` sú premenné enginu: nemeniť.
 */
return [
    'thresholdEur' => 2000,

    'workflows' => [

        'wf1' => [
            'name' => 'Uvítací e-mail pre lead z webu',
            'description' => 'Jednoduché. Lead príde z webu a hneď dostane potvrdzujúci e-mail s menom osoby, ktorá mu zavolá. Filter triggera na zdroj leadu + jedna akcia Odoslať e-mail.',
            'nodes' => [
                'trigger' => ['name' => 'Nový lead zo zdroja %source%'],
                'welcome-mail' => [
                    'name' => 'Odoslať uvítací e-mail',
                    'subject' => 'Ďakujeme za Váš dopyt, {{$trigger.name}}',
                    'body' => '<p>Dobrý deň, {{$trigger.name}},</p><p>ďakujeme, že ste oslovili {brand}. Váš dopyt je v našom systéme a <b>{{$trigger.owner}}</b> sa Vám ozve do jedného pracovného dňa.</p><p>Toto sme od Vás dostali:</p><ul><li>Mesto: {{$trigger.city}}</li><li>Telefón: {{$trigger.phone}}</li><li>Zdroj: {{$trigger.source}}</li></ul><p>S pozdravom,<br>Obchodný tím {brand}</p>',
                ],
            ],
        ],

        'wf2' => [
            'name' => 'Doťahovanie po odoslaní ponuky',
            'description' => 'Jednoduché. Keď sa lead presunie do stavu „%offer%“, jeho vlastníkovi sa otvorí úloha na doťahovanie s termínom a časom. Filter triggera na zmenu stavu + jedna akcia Vytvoriť úlohu.',
            'nodes' => [
                'trigger' => ['name' => 'Lead presunutý do „%offer%“'],
                'followup-task' => [
                    'name' => 'Otvoriť úlohu na doťahovanie',
                    'title' => 'Doťahnúť cenovú ponuku pre {{$trigger.name}}',
                    'description' => "Lead sa presunul zo stavu „{{\$trigger.oldStatus}}“ do „{{\$trigger.newStatus}}“.\n\nHodnota: {{\$trigger.value}} %cur%\nMesto: {{\$trigger.city}}\nTelefón: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nZavolať klientovi, potvrdiť doručenie ponuky a odpoveď zapísať do časovej osi.",
                ],
            ],
        ],

        'wf3' => [
            'name' => 'Zaznamenať telefonický dopyt (tlačidlo)',
            'description' => 'Stredne zložité. Štylizované tlačidlo v hlavičke vytvorí prázdny lead, otvorí úlohu na jeho kvalifikáciu a e-mailom upozorní používateľa {user:owner}. Ukazuje manuálny trigger s vlastnou farbou, štýlom a ikonou a dve akcie vetviace sa z jedného uzla.',
            'nodes' => [
                'trigger' => ['name' => 'Manuálne tlačidlo v hlavičke'],
                'create-lead' => ['name' => 'Vytvoriť zástupný lead', 'leadName' => 'Nový telefonický dopyt'],
                'qualify-task' => [
                    'name' => 'Úloha: kvalifikovať dopyt',
                    'title' => 'Kvalifikovať nový telefonický dopyt',
                    'description' => "Zaznamenané tlačidlom v hlavičke používateľom {{\$trigger.triggered_by}}.\n\nNový záznam leadu: {{\$input.name}} (ID {{\$input.id}}), stav {{\$input.status}}.\n\nZavolať späť, doplniť meno, adresu a podrobnosti zákazky a posunúť lead ďalej.",
                ],
                'notify-mail' => [
                    'name' => 'Upozorniť vlastníka',
                    'subject' => 'Nový telefonický dopyt zaznamenaný v CRM',
                    'body' => '<p>{{$trigger.triggered_by}} zaznamenal nový telefonický dopyt tlačidlom v hlavičke.</p><p>ID leadu: <b>{{$input.id}}</b><br>Stav: {{$input.status}}</p><p>Otvorte CRM a kvalifikujte ho.</p>',
                ],
            ],
        ],

        'wf4' => [
            'name' => 'AI triedenie nového leadu',
            'description' => 'Zložité. Každý nový lead sa rozdelí podľa typu a hodnoty. Väčšie firemné leady (nad %threshold%) dostanú AI kvalifikačnú poznámku, ktorá skončí v úlohe s vysokou prioritou aj v e-maile pre {user:owner}; ostatné idú do zoznamu na rozvíjanie. Ukazuje podmienku s oboma vetvami, AI agenta a jeho výstup {{$ai.result}}. Vyžaduje AI kľúč a SMTP, preto je vypnuté.',
            'nodes' => [
                'trigger' => ['name' => 'Akýkoľvek nový lead'],
                'value-check' => ['name' => 'Firemný lead nad %threshold%?'],
                'ai-note' => [
                    'name' => 'AI kvalifikačná poznámka',
                    'prompt' => "Si CRM asistent firmy {brand}, ktorá vyrába kamenné pracovné dosky na mieru. Napíš pre obchodný tím krátku kvalifikačnú poznámku (najviac 4 vety) o tomto novom leade.\n\nMeno: {{\$trigger.name}}\nTyp: {{\$trigger.clientType}}\nMesto: {{\$trigger.city}}\nOdhadovaná hodnota: {{\$trigger.value}} %cur%\nZdroj: {{\$trigger.source}}\nIČO: {{\$trigger.companyId}}\n\nUveď, na čo sa opýtať pri prvom hovore a aké je hlavné riziko. Čistý text, bez markdownu.",
                ],
                'hot-task' => [
                    'name' => 'Úloha: dnes zavolať leadu',
                    'title' => 'Kvalifikovať {{$trigger.name}}: AI poznámka pripravená',
                    'description' => "{{\$ai.result}}\n\n---\nHodnota: {{\$trigger.value}} %cur% · Mesto: {{\$trigger.city}} · Zdroj: {{\$trigger.source}}",
                ],
                'hot-mail' => [
                    'name' => 'Poslať AI poznámku vlastníkovi e-mailom',
                    'subject' => 'AI triedenie: {{$trigger.name}} ({{$trigger.value}} %cur%)',
                    'body' => '<p>Nový firemný lead prišiel zo zdroja <b>{{$trigger.source}}</b>.</p><p><b>AI poznámka:</b></p><p>{{$ai.summary}}</p><p>Vlastník: {{$trigger.owner}} · Mesto: {{$trigger.city}} · Telefón: {{$trigger.phone}}</p>',
                ],
                'nurture-task' => [
                    'name' => 'Úloha: zoznam na rozvíjanie',
                    'title' => 'Poslať informačný balík pre {{$trigger.name}}',
                    'description' => "Menší alebo súkromný dopyt ({{\$trigger.value}} %cur%, {{\$trigger.clientType}}).\n\nPoslať štandardný informačný balík a o týždeň sa ozvať.\nE-mail: {{\$trigger.email}} · Telefón: {{\$trigger.phone}}",
                ],
            ],
        ],

        'wf5' => [
            'name' => 'Vyhraný obchod → onboarding klienta',
            'description' => 'Zložité. Keď lead dosiahne stav „%won%“, ihneď sa otvorí úloha na odovzdanie; firmy navyše dostanú plný záznam klienta, úlohu na onboarding a uvítací e-mail napísaný AI, súkromní klienti namiesto toho osobný telefonát. Ukazuje podmienku, reťazené akcie a AI agenta, ktorý plní posledný e-mail. Vyžaduje AI kľúč a SMTP, preto je vypnuté.',
            'nodes' => [
                'trigger' => ['name' => 'Lead presunutý do „%won%“'],
                'handover-task' => [
                    'name' => 'Úloha: odovzdať do výroby',
                    'title' => 'Odovzdať vyhraný obchod pre {{$trigger.name}}',
                    'description' => "Obchod bol vyhraný ({{\$trigger.oldStatus}} → {{\$trigger.newStatus}}).\n\nHodnota: {{\$trigger.value}} %cur%\nMesto: {{\$trigger.city}}\nVlastník: {{\$trigger.owner}}\n\nZaložiť podpísanú ponuku a odovzdať dielni zameranie a výber dosky.",
                ],
                'company-check' => ['name' => 'Je to firma?'],
                'create-client' => ['name' => 'Vytvoriť záznam klienta'],
                'onboarding-task' => [
                    'name' => 'Úloha: pripraviť onboardingový balík',
                    'title' => 'Pripraviť onboardingový balík pre {{$trigger.name}}',
                    'description' => "Z vyhraného leadu vznikol záznam klienta.\n\nID klienta: {{\$input.id}}\nIČO: {{\$input.company_id}}\nE-mail: {{\$input.email}}\n\nPripraviť zmluvu a harmonogram a dohodnúť úvodný hovor.",
                ],
                'ai-onboarding' => [
                    'name' => 'AI onboardingový e-mail',
                    'prompt' => "Napíš krátky onboardingový e-mail (najviac 150 slov) pre nového klienta firmy {brand}, ktorá vyrába kamenné pracovné dosky na mieru. Vykaj.\n\nKlient: {{\$trigger.name}}, {{\$trigger.city}}\nHodnota obchodu: {{\$trigger.value}} %cur%\nObchodný zástupca: {{\$trigger.owner}}\n\nPoďakuj, uveď ďalšie kroky (zmluva, laserové zameranie, výrobný termín) a drž sa vľúdneho, ale profesionálneho tónu. Vráť len čistý text, bez predmetu správy.",
                ],
                'onboarding-mail' => [
                    'name' => 'Odoslať onboardingový e-mail',
                    'subject' => 'Vitajte u nás, {{$trigger.name}}',
                    'body' => '<p>{{$ai.result}}</p><p>S pozdravom,<br>{{$trigger.owner}}<br>{brand}</p>',
                ],
                'personal-task' => [
                    'name' => 'Úloha: osobný onboardingový telefonát',
                    'title' => 'Osobný onboardingový telefonát s {{$trigger.name}}',
                    'description' => "Súkromný klient: záznam firmy netreba.\n\nTelefón: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\nHodnota: {{\$trigger.value}} %cur%\n\nZavolať, dohodnúť termín zamerania a potvrdiť ho písomne.",
                ],
            ],
        ],

        'wf6' => [
            'name' => 'Nový lead → úloha pre vlastníka',
            'description' => 'Jednoduché. Pri vytvorení každého leadu dostane jeho vlastník úlohu zavolať späť do jedného dňa, takže žiadny dopyt nezostane bez odpovede. Jeden trigger a jedna akcia Vytvoriť úlohu, bez filtra.',
            'nodes' => [
                'trigger' => ['name' => 'Akýkoľvek nový lead'],
                'call-task' => [
                    'name' => 'Úloha: zavolať novému leadu',
                    'title' => 'Zavolať {{$trigger.name}} do 24 hodín',
                    'description' => "Nový dopyt zo zdroja {{\$trigger.source}}.\n\nMesto: {{\$trigger.city}}\nTelefón: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nOpýtať sa, čo chcú realizovať, aký kameň preferujú a kedy bude stavba pripravená, potom dohodnúť laserové zameranie.",
                ],
            ],
        ],

        'wf7' => [
            'name' => 'Ponuka prijatá → projekt a úloha na štart',
            'description' => 'Stredne zložité. Keď lead dosiahne stav „%won%“ (jeho cenová ponuka bola prijatá), vytvorí sa a spáruje s ním projekt, ktorý riadi vlastník leadu, a vlastník dostane úlohu naplánovať štart. Lead, ktorý už takýto projekt má, sa preskočí.',
            'nodes' => [
                'trigger' => ['name' => 'Lead presunutý do „%won%“'],
                'create-project' => ['name' => 'Vytvoriť projekt'],
                'kickoff-task' => [
                    'name' => 'Úloha: naplánovať štart',
                    'title' => 'Naplánovať štart projektu pre {{$trigger.name}}',
                    'description' => "Cenová ponuka bola prijatá a vznikol projekt {{\$input.project_id}}.\n\nDohodnúť laserové zameranie, objednať dosky a potvrdiť s klientom výrobný termín.",
                ],
            ],
        ],
    ],

    'logs' => [
        ['wf' => 'wf1', 'client' => 'L10', 'owner' => 'sales', 'day' => -12, 'time' => '08:41', 'ms' => 1840, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L10', 'owner' => 'sales', 'day' => -12, 'time' => '08:41', 'ms' => 182, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'sales', 'day' => -13, 'time' => '10:17', 'ms' => 264, 'email' => null, 'error' => null],
        ['wf' => 'wf7', 'client' => 'C6', 'owner' => 'owner', 'day' => -12, 'time' => '14:06', 'ms' => 412, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'L10', 'owner' => 'sales', 'day' => -11, 'time' => '09:30', 'ms' => 143, 'email' => null, 'error' => null],
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:22', 'ms' => 96, 'email' => null, 'error' => 'Akcia „Konvertovať lead na projekt“ nemá nastavený typ projektu. Vyberte ho v editore workflowu.'],
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:34', 'ms' => 438, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 1675, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 176, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'owner', 'day' => -9, 'time' => '13:48', 'ms' => 251, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'L9', 'owner' => 'sales', 'day' => -8, 'time' => '10:05', 'ms' => 151, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L8', 'owner' => 'sales', 'day' => -6, 'time' => '09:54', 'ms' => 612, 'email' => 'eva.minarikovamail.example', 'error' => 'Uvítací e-mail sa neodoslal: „eva.minarikovamail.example“ nie je platná e-mailová adresa (chýba @). Opravte adresu v leade a spustite workflow znova.'],
        ['wf' => 'wf6', 'client' => 'L8', 'owner' => 'sales', 'day' => -6, 'time' => '09:54', 'ms' => 169, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'pm', 'day' => -5, 'time' => '15:21', 'ms' => 238, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'C3', 'owner' => 'sales', 'day' => -3, 'time' => '08:58', 'ms' => 139, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'sales', 'day' => -2, 'time' => '11:09', 'ms' => 247, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L7', 'owner' => 'sales', 'day' => -1, 'time' => '19:26', 'ms' => 1592, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L7', 'owner' => 'sales', 'day' => -1, 'time' => '19:26', 'ms' => 171, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L11', 'owner' => 'sales', 'day' => -14, 'time' => '09:03', 'ms' => 1710, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L11', 'owner' => 'sales', 'day' => -14, 'time' => '09:03', 'ms' => 188, 'email' => null, 'error' => null],
    ],
];
