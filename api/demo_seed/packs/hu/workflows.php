<?php
/**
 * Workflows pack, magyar kiadás: a hét Automatizálás és workflow példa és a futási előzmények.
 *
 * Csak adat (lásd a szerződést a demo_seed/index.php-ban). Ugyanazok a kulcsok, listahosszok és
 * számok, mint a packs/en/workflows.php és packs/sk/workflows.php fájlban; csak a szövegek térnek el.
 *
 * Helyi tokenek (a workflows.php cseréli őket e példány beállításaira, nem demo_text helyőrzők):
 * %source% a weboldalas lead-forrás · %offer% az „ajánlat elküldve” állapot · %won% az „elfogadva” állapot ·
 * %cur% a pénznem kódja · %threshold% az AI-osztályozás formázott lead-érték küszöbe.
 * A `{{$trigger.x}}`, `{{$input.x}}` és `{{$ai.x}}` a motor saját változói: ne változtasd őket.
 */
return [
    'thresholdEur' => 2000,

    'workflows' => [

        'wf1' => [
            'name' => 'Üdvözlő e-mail weboldalról érkezett leadnek',
            'description' => 'Egyszerű. A weboldalról érkező lead azonnal megerősítő e-mailt kap annak nevével, aki felhívja. Trigger-szűrő a lead forrására + egy E-mail küldése művelet.',
            'nodes' => [
                'trigger' => ['name' => 'Új lead innen: %source%'],
                'welcome-mail' => [
                    'name' => 'Üdvözlő e-mail küldése',
                    'subject' => 'Köszönjük az érdeklődését, {{$trigger.name}}',
                    'body' => '<p>Tisztelt {{$trigger.name}}!</p><p>Köszönjük, hogy a {brand} céget kereste meg. Az érdeklődése rendszerünkben van, és <b>{{$trigger.owner}}</b> egy munkanapon belül jelentkezik Önnél.</p><p>Ezt kaptuk Öntől:</p><ul><li>Város: {{$trigger.city}}</li><li>Telefon: {{$trigger.phone}}</li><li>Forrás: {{$trigger.source}}</li></ul><p>Üdvözlettel,<br>A {brand} értékesítési csapata</p>',
                ],
            ],
        ],

        'wf2' => [
            'name' => 'Utánkövetés az ajánlat elküldése után',
            'description' => 'Egyszerű. Amint egy lead „%offer%” állapotba kerül, a tulajdonosának megnyílik egy utánkövetési feladat határidővel és időponttal. Trigger-szűrő az állapotváltásra + egy Feladat létrehozása művelet.',
            'nodes' => [
                'trigger' => ['name' => 'A lead állapota: „%offer%”'],
                'followup-task' => [
                    'name' => 'Utánkövetési feladat megnyitása',
                    'title' => 'Árajánlat követése: {{$trigger.name}}',
                    'description' => "A lead „{{\$trigger.oldStatus}}” állapotból „{{\$trigger.newStatus}}” állapotba került.\n\nÉrték: {{\$trigger.value}} %cur%\nVáros: {{\$trigger.city}}\nTelefon: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nHívd fel az ügyfelet, erősítsd meg, hogy az árajánlat megérkezett, és rögzítsd a választ az idővonalon.",
                ],
            ],
        ],

        'wf3' => [
            'name' => 'Telefonos érdeklődés rögzítése (gomb)',
            'description' => 'Közepes. A fejléc eszköztárában lévő gomb üres leadet hoz létre, feladatot nyit a minősítésére, és e-mailben értesíti: {user:owner}. Bemutatja a kézi triggert saját színnel, stílussal és ikonnal, valamint két műveletet, amelyek egy csomópontból ágaznak szét.',
            'nodes' => [
                'trigger' => ['name' => 'Kézi gomb a fejlécben'],
                'create-lead' => ['name' => 'Helyőrző lead létrehozása', 'leadName' => 'Új telefonos érdeklődés'],
                'qualify-task' => [
                    'name' => 'Feladat: az érdeklődés minősítése',
                    'title' => 'Az új telefonos érdeklődés minősítése',
                    'description' => "A fejléc gombjával rögzítette: {{\$trigger.triggered_by}}.\n\nÚj lead: {{\$input.name}} (ID {{\$input.id}}), állapot: {{\$input.status}}.\n\nHívd vissza, töltsd ki a nevet, a címet és a megrendelés részleteit, majd vidd tovább a leadet.",
                ],
                'notify-mail' => [
                    'name' => 'Tulajdonos értesítése',
                    'subject' => 'Új telefonos érdeklődés a CRM-ben',
                    'body' => '<p>{{$trigger.triggered_by}} új telefonos érdeklődést rögzített a fejléc gombjával.</p><p>Lead azonosító: <b>{{$input.id}}</b><br>Állapot: {{$input.status}}</p><p>Nyissa meg a CRM-et és minősítse.</p>',
                ],
            ],
        ],

        'wf4' => [
            'name' => 'Új lead AI-alapú osztályozása',
            'description' => 'Összetett. Minden új lead típus és érték szerint szétválik. A nagyobb céges leadek (%threshold% felett) AI minősítő jegyzetet kapnak, amely egy magas prioritású feladatba és egy e-mailbe kerül ({user:owner}); a többi az ápolási listára megy. Bemutat egy kétágú feltételt, egy AI-ügynököt és annak {{$ai.result}} kimenetét. AI-kulcsot és SMTP-t igényel, ezért ki van kapcsolva.',
            'nodes' => [
                'trigger' => ['name' => 'Bármely új lead'],
                'value-check' => ['name' => 'Céges lead %threshold% felett?'],
                'ai-note' => [
                    'name' => 'AI minősítő jegyzet',
                    'prompt' => "Te a {brand} CRM-asszisztense vagy, amely cég méretre készült kő munkalapokat gyárt. Írj az értékesítési csapatnak rövid minősítő jegyzetet (legfeljebb 4 mondat) erről az új leadről.\n\nNév: {{\$trigger.name}}\nTípus: {{\$trigger.clientType}}\nVáros: {{\$trigger.city}}\nBecsült érték: {{\$trigger.value}} %cur%\nForrás: {{\$trigger.source}}\nCégjegyzékszám: {{\$trigger.companyId}}\n\nÍrd le, mit érdemes megkérdezni az első hívásban, és mi a fő kockázat. Egyszerű szöveg, markdown nélkül.",
                ],
                'hot-task' => [
                    'name' => 'Feladat: a lead felhívása ma',
                    'title' => '{{$trigger.name}} minősítése: az AI jegyzet kész',
                    'description' => "{{\$ai.result}}\n\n---\nÉrték: {{\$trigger.value}} %cur% · Város: {{\$trigger.city}} · Forrás: {{\$trigger.source}}",
                ],
                'hot-mail' => [
                    'name' => 'AI jegyzet e-mailben a tulajdonosnak',
                    'subject' => 'AI osztályozás: {{$trigger.name}} ({{$trigger.value}} %cur%)',
                    'body' => '<p>Új céges lead érkezett innen: <b>{{$trigger.source}}</b>.</p><p><b>AI jegyzet:</b></p><p>{{$ai.summary}}</p><p>Tulajdonos: {{$trigger.owner}} · Város: {{$trigger.city}} · Telefon: {{$trigger.phone}}</p>',
                ],
                'nurture-task' => [
                    'name' => 'Feladat: ápolási lista',
                    'title' => 'Tájékoztató csomag küldése: {{$trigger.name}}',
                    'description' => "Kisebb vagy magán érdeklődés ({{\$trigger.value}} %cur%, {{\$trigger.clientType}}).\n\nKüldd el a szokásos tájékoztató csomagot, és egy hét múlva érdeklődj.\nE-mail: {{\$trigger.email}} · Telefon: {{\$trigger.phone}}",
                ],
            ],
        ],

        'wf5' => [
            'name' => 'Megnyert üzlet → ügyfél-bevezetés',
            'description' => 'Összetett. Amikor egy lead „%won%” állapotot ér el, azonnal megnyílik az átadási feladat; a cégek ezen felül teljes ügyfélrekordot, bevezetési feladatot és AI-val írt üdvözlő e-mailt kapnak, a magánügyfelek személyes hívást. Bemutat egy feltételt, láncolt műveleteket és egy AI-ügynököt, amely az utolsó e-mailt tölti. AI-kulcsot és SMTP-t igényel, ezért ki van kapcsolva.',
            'nodes' => [
                'trigger' => ['name' => 'A lead állapota: „%won%”'],
                'handover-task' => [
                    'name' => 'Feladat: átadás a gyártásnak',
                    'title' => 'A megnyert üzlet átadása: {{$trigger.name}}',
                    'description' => "Az üzletet megnyertük ({{\$trigger.oldStatus}} → {{\$trigger.newStatus}}).\n\nÉrték: {{\$trigger.value}} %cur%\nVáros: {{\$trigger.city}}\nTulajdonos: {{\$trigger.owner}}\n\nIktasd az aláírt árajánlatot, és add át a felmérést és a lapválasztást a műhelynek.",
                ],
                'company-check' => ['name' => 'Cégről van szó?'],
                'create-client' => ['name' => 'Ügyfélrekord létrehozása'],
                'onboarding-task' => [
                    'name' => 'Feladat: bevezetési csomag előkészítése',
                    'title' => 'Bevezetési csomag előkészítése: {{$trigger.name}}',
                    'description' => "A megnyert leadből ügyfélrekord készült.\n\nÜgyfélazonosító: {{\$input.id}}\nCégjegyzékszám: {{\$input.company_id}}\nE-mail: {{\$input.email}}\n\nKészítsd elő a szerződést és az ütemtervet, és egyeztess egy indító hívást.",
                ],
                'ai-onboarding' => [
                    'name' => 'AI bevezető e-mail',
                    'prompt' => "Írj rövid bevezető e-mailt (legfeljebb 150 szó) a {brand} új ügyfelének; a cég méretre készült kő munkalapokat gyárt. Magázódj.\n\nÜgyfél: {{\$trigger.name}}, {{\$trigger.city}}\nAz üzlet értéke: {{\$trigger.value}} %cur%\nÜgyfélmenedzser: {{\$trigger.owner}}\n\nKöszönd meg a bizalmat, említsd a következő lépéseket (szerződés, lézeres felmérés, gyártási időpont), és maradj barátságos, de szakmai. Csak egyszerű szöveget adj vissza, tárgysor nélkül.",
                ],
                'onboarding-mail' => [
                    'name' => 'Bevezető e-mail küldése',
                    'subject' => 'Üdvözöljük, {{$trigger.name}}',
                    'body' => '<p>{{$ai.result}}</p><p>Üdvözlettel,<br>{{$trigger.owner}}<br>{brand}</p>',
                ],
                'personal-task' => [
                    'name' => 'Feladat: személyes bevezető hívás',
                    'title' => 'Személyes bevezető hívás: {{$trigger.name}}',
                    'description' => "Magánügyfél: cégrekordra nincs szükség.\n\nTelefon: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\nÉrték: {{\$trigger.value}} %cur%\n\nHívd fel, egyeztesd a felmérés időpontját, és erősítsd meg írásban.",
                ],
            ],
        ],

        'wf6' => [
            'name' => 'Új lead → feladat a tulajdonosnak',
            'description' => 'Egyszerű. Minden új lead tulajdonosa feladatot kap, hogy egy napon belül visszahívja, így egy érdeklődés sem marad megválaszolatlanul. Egy trigger és egy Feladat létrehozása művelet, szűrő nélkül.',
            'nodes' => [
                'trigger' => ['name' => 'Bármely új lead'],
                'call-task' => [
                    'name' => 'Feladat: az új lead felhívása',
                    'title' => '{{$trigger.name}} felhívása 24 órán belül',
                    'description' => "Új érdeklődés innen: {{\$trigger.source}}.\n\nVáros: {{\$trigger.city}}\nTelefon: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nKérdezd meg, mit szeretnének megvalósítani, melyik követ kedvelik, és mikor lesz kész a helyszín, majd egyeztess lézeres felmérést.",
                ],
            ],
        ],

        'wf7' => [
            'name' => 'Ajánlat elfogadva → projekt és indító feladat',
            'description' => 'Közepes. Amikor egy lead „%won%” állapotot ér el (az árajánlatát elfogadták), létrejön egy hozzá párosított projekt, amelyet a lead tulajdonosa vezet, és a tulajdonos feladatot kap az indítás megtervezésére. Az a lead, amelynek már van ilyen projektje, kimarad.',
            'nodes' => [
                'trigger' => ['name' => 'A lead állapota: „%won%”'],
                'create-project' => ['name' => 'Projekt létrehozása'],
                'kickoff-task' => [
                    'name' => 'Feladat: az indítás megtervezése',
                    'title' => 'A projekt indításának megtervezése: {{$trigger.name}}',
                    'description' => "Az árajánlatot elfogadták, és létrejött a(z) {{\$input.project_id}} projekt.\n\nEgyeztess lézeres felmérést, rendeld meg a lapokat, és erősítsd meg az ügyféllel a gyártási időpontot.",
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
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:22', 'ms' => 96, 'email' => null, 'error' => 'A „Lead konvertálása projektté” műveletnél nincs projekttípus megadva. Válassz egyet a workflow-szerkesztőben.'],
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:34', 'ms' => 438, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 1675, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 176, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'owner', 'day' => -9, 'time' => '13:48', 'ms' => 251, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'L9', 'owner' => 'sales', 'day' => -8, 'time' => '10:05', 'ms' => 151, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L8', 'owner' => 'sales', 'day' => -6, 'time' => '09:54', 'ms' => 612, 'email' => 'meszaros.evamail.example', 'error' => 'Az üdvözlő e-mail nem ment el: a(z) „meszaros.evamail.example” nem érvényes e-mail-cím (hiányzik a @). Javítsd a címet a leaden, és futtasd újra a workflow-t.'],
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
