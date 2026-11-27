<?php
/**
 * Tasks pack, slovenská edícia: 14 úloh okolo dneška (docs/DEMO-MODE.md A4, fáza 4A).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/tasks.php). Ľudia, klienti a
 * projekty sú refy. POZÍCIA v zozname je id úlohy (demo-tasks-<n>) - iné moduly na ňu odkazujú, preto
 * len pridávať, nikdy nepreradiť: 1-4 owner, 5-9 pm, 10-14 sales. Rovnaké kľúče, dĺžky a čísla ako v en a hu
 * packu; líšia sa len texty. state: new | progress | blocked | done. day: posun termínu od dneška (záporný = po termíne).
 * Mená sa nesklonujú: v texte stoja v prvom páde (za pomlčkou alebo ako podmet).
 */
return [
    'tasks' => [
        // --- owner ------------------------------------------------------------------------------------
        ['title' => 'Objednať dosky pre projekt {project:P1}, 2. etapa',
            'description' => 'Potvrdiť množstvo podľa plánu CNC rezania a poslať objednávku importérovi. Dosky na podlahu lobby idú do tej istej objednávky.',
            'priority' => 'high', 'day' => 2, 'time' => '10:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => ['pm'], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Poslať rámcové podmienky – {client:L10}',
            'description' => 'Ponuka partnerstva je odoslaná, ale {contact:L10} stále čaká na dodacie podmienky do Nemecka a pevnú cenu za štvorcový meter. Pripraviť podmienky a poslať ich spolu so zoznamom vzoriek.',
            'priority' => 'high', 'day' => -2, 'time' => '16:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => ['sales'], 'client' => 'L10', 'project' => null, 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Upomenúť zálohu po splatnosti – {project:P3}',
            'description' => '40 % záloha ({m:18400}) je 12 dní po splatnosti. Zavolať do hotela ({contact:C6}), potvrdiť dátum platby a poslať priateľskú upomienku s faktúrou v prílohe skôr, než uvoľníme výrobný termín.',
            'priority' => 'high', 'day' => -1, 'time' => '15:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => [], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Prehodnotiť cenník dosiek na budúci štvrťrok',
            'description' => 'Porovnať nový cenník talianskeho výrobcu s lokálnym distribútorom a aktualizovať predajné ceny položiek {item:I1} a {item:I2} v sklade.',
            'priority' => 'low', 'day' => 9, 'time' => '14:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => [], 'client' => null, 'project' => null, 'locking' => false, 'createdBy' => 'owner'],

        // --- pm -----------------------------------------------------------------------------------------
        ['title' => 'Dodávka dosiek pre {project:P3} mešká – dohodnúť nový termín',
            'description' => 'Dosky na stenu wellness zdržujú u výrobcu. Získať pevný termín expedície, oznámiť ho písomne hotelu ({contact:C6}) a preveriť, či sa dá lobby podlaha namontovať ako prvá.',
            'priority' => 'high', 'day' => -2, 'time' => '11:00', 'state' => 'blocked', 'owner' => 'pm', 'assignees' => ['owner'], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'pm'],
        ['title' => 'Naplánovať montáž podlahy lobby',
            'description' => 'Dvaja montéri na dva dni; dosky musia byť na mieste deň vopred. Dohodnúť čas prístupu so stavbyvedúcim klienta ({client:C1}).',
            'priority' => 'medium', 'day' => 7, 'time' => '08:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Pripraviť plán rezania dosiek pod umývadlá',
            'description' => 'Rozložiť všetky dosky 1. série na čo najmenej tabúľ, aby odrezky ostali pod 8 %. Séria 1 sa začína približne o tri týždne.',
            'priority' => 'medium', 'day' => 14, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C5', 'project' => 'P5', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Dobropis za nesprávny profil hrany',
            'description' => 'Doska bola vyrobená znova so správnym profilom. Vystaviť dobropis na rozdiel a poslať ho štúdiu ({contact:C3}).',
            'priority' => 'medium', 'day' => -3, 'time' => '12:00', 'state' => 'done', 'owner' => 'pm', 'assignees' => [], 'client' => 'C3', 'project' => 'P4', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Reklamačná obhliadka: oprava odštiepku na hrane',
            'description' => 'Malý odštiepok pri umývačke. Vziať opravnú súpravu a tmel v odtieni dosky; {contact:C2} je doma doobeda.',
            'priority' => 'medium', 'day' => 3, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => ['sales'], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],

        // --- sales --------------------------------------------------------------------------------------------
        ['title' => 'Laserové zameranie kuchyne – {client:L9}',
            'description' => 'Navštíviť dom a zamerať kuchyňu laserom pre dosku z bieleho kremeňa, zástenu a výrez na drez. Odfotiť stenu za umývačkou.',
            'priority' => 'high', 'day' => 6, 'time' => '10:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Doriešiť upravenú ponuku – {client:L9}',
            'description' => 'Upravenú ponuku mala potvrdiť do {d:2}. Ak nepríde nič, zavolať, pripomenúť možnosť 4 cm zrezanej hrany ({m:180}) a podržať termín zamerania.',
            'priority' => 'high', 'day' => 2, 'time' => '11:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => true, 'createdBy' => 'sales'],
        ['title' => 'Telefonát – {client:L8}: termín zamerania terasy',
            'description' => 'Dohodnúť dátum zamerania terasy a pultu vonkajšej kuchyne a potom poslať koncept ponuky. Spomenúť mrazuvzdorné porcelánové dosky s hrúbkou 20 mm.',
            'priority' => 'medium', 'day' => 0, 'time' => '14:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L8', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Spätný telefonát k dopytu z webu – {client:L7}',
            'description' => 'Nový dopyt zo včerajšieho večera: doska pod umývadlo a obklad sprchy. Opýtať sa na rozmer kúpeľne, ponúknuť návštevu showroomu a poslať katalóg.',
            'priority' => 'medium', 'day' => 0, 'time' => '09:30', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L7', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Záverečné fotky hotovej kuchyne a žiadosť o recenziu',
            'description' => 'Hotovú dosku sme odfotili pre portfólio a klientku ({contact:C2}) sme požiadali o krátku online recenziu.',
            'priority' => 'low', 'day' => -9, 'time' => '14:00', 'state' => 'done', 'owner' => 'sales', 'assignees' => [], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],
    ],
];
