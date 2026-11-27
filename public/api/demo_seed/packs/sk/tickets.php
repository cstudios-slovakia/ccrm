<?php
/**
 * Pack tickets, slovenské vydanie: zmluva o podpore pre C6 a päť servisných tiketov z D7.
 *
 * Len dáta (pozri kontrakt v demo_seed/index.php). Rovnaké kľúče, dĺžky zoznamov a čísla ako
 * packs/en/tickets.php a packs/hu/tickets.php; líšia sa len reťazce.
 *
 * Tikety T1..T5 sú demo-tickets-1..5 (iné moduly sa na ne odkazujú týmto id, napr. sledovanie času).
 * Voliteľné bloky sú null, ak chýbajú: 'response' (prvá odpoveď), 'resolved', 'closed',
 * 'satisfaction' (CSAT) a 'task' (úloha v CRM prepojená s tiketom).
 */
return [
    'contract' => [
        'client' => 'C6', 'project' => 'P3', 'tier' => 'pro', 'monthlyHours' => 2.0, 'hourlyRateEur' => 65.0,
        'fromDay' => -120, 'untilDay' => 245,
        'notes' => 'Ročná zmluva o údržbe pre hotel: dve návštevy na opätovnú impregnáciu podlahy v lobby a obkladu wellness steny, plus záručná podpora s prioritnou odozvou.',
    ],

    'tickets' => [

        'T1' => [
            'client' => 'C2', 'project' => 'P2', 'assignee' => 'pm', 'status' => 'open', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -3, 'createdTime' => '15:20',
            'response' => ['day' => -3, 'time' => '16:40'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Malý odštiepok na hrane dosky pri umývačke',
            'description' => 'Na prednej hrane bielej kremennej pracovnej dosky, hneď pri umývačke riadu, vznikol malý odštiepok, asi 5 mm. Nie je hlboký, ale chcela by som ho dať opraviť v rámci záruky.',
            'tags' => ['záruka', 'hrana', 'oprava'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -3, 'time' => '15:20', 'body' => 'Dobrý deň, na hrane dosky pri umývačke vznikol malý odštiepok. Posielam fotografiu. Dá sa to opraviť v rámci záruky?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -3, 'time' => '16:40', 'body' => 'Dobrý deň, pani {contact:C2}, ďakujeme za fotografiu. Na opravu sa vzťahuje záruka. Náš montér príde hranu opraviť v {wd:2}, trvá to asi hodinu a po oprave nebude nič vidieť.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -2, 'time' => '09:10', 'body' => 'Farebne zladená živica na kremeň Calacatta je v dielni. {user:pm} potvrdí termín s klientkou; súpravu vezme {user:E4}.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 0, 'day' => -3, 'note' => 'Posúdenie fotografie a kontrola záruky'],
                ['user' => 'pm', 'minutes' => 45, 'billable' => 0, 'day' => -2, 'note' => 'Živica zladená s doskou, návšteva naplánovaná'],
            ],
            'task' => ['owner' => 'pm', 'status' => 'progress', 'priority' => 'medium', 'deadlineDay' => 2, 'deadlineTime' => '10:00', 'title' => 'Opraviť odštiepok na hrane u klientky {client:C2}', 'description' => 'Záručná oprava: malý odštiepok na prednej hrane pri umývačke. Vziať súpravu so zladenou živicou, opraviť na mieste (asi 1 hodina) a výsledok vyfotiť do tiketu.'],
        ],

        'T2' => [
            'client' => 'C1', 'project' => 'P1', 'assignee' => 'pm', 'status' => 'closed', 'priority' => 'normal', 'type' => 'feature_request', 'source' => 'email',
            'createdDay' => -9, 'createdTime' => '08:50',
            'response' => ['day' => -9, 'time' => '09:20'], 'resolved' => ['day' => -8, 'time' => '14:30'], 'closed' => ['day' => -6, 'time' => '10:00'],
            'satisfaction' => ['score' => 5, 'comment' => 'Rýchlo a jasne, výkres bol opravený ešte v ten deň.'],
            'title' => 'Výrez pre varnú dosku treba na výkrese zmeniť z 560 na 564 mm',
            'description' => 'Výrobca spotrebiča poslal nový montážny list varnej dosky pre ukážkovú vilu. Prosíme o zmenu šírky výrezu na výkrese z 560 mm na 564 mm ešte pred rezaním dosky.',
            'tags' => ['výkres', 'výrez', 'výroba'],
            'watchers' => [],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -9, 'time' => '08:50', 'body' => 'Dobré ráno, v prílohe posielam nový montážny list varnej dosky. Prosím o zmenu výrezu z 560 na 564 mm a potvrdenie.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -8, 'time' => '14:30', 'body' => 'Dobrý deň, pán {contact:C1}, výkres je upravený na 564 mm a odišiel do CNC dielne. Opravené PDF je v prílohe tohto tiketu.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -7, 'time' => '09:05', 'body' => 'Ďakujem, z našej strany potvrdené.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 1, 'day' => -8, 'note' => 'Revízia výkresu, výrez 564 mm'],
            ],
            'task' => null,
        ],

        'T3' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'new', 'priority' => 'high', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -1, 'createdTime' => '16:10',
            'response' => ['day' => -1, 'time' => '16:50'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Wellness stena: vlasová škára v jednej špáre',
            'description' => 'Vo vertikálnej špáre obkladu wellness steny sa objavila vlasová škára, široká asi 1 mm a dlhá asi 40 cm. Pri osvetlení je viditeľná. Prosíme o obhliadku skôr, než prídu ďalší hostia.',
            'tags' => ['wellness', 'špára', 'obklad'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -1, 'time' => '16:10', 'body' => 'Dobrý deň, všimli sme si vlasovú škáru v jednej špáre wellness steny. Fotografie v prílohe. Mohol by sa na to niekto pozrieť ešte tento týždeň?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -1, 'time' => '16:50', 'body' => 'Dobrý deň, {contact:C6}, ďakujeme za fotografie. Zapísali sme to s vysokou prioritou a špáru obhliadneme na mieste ešte tento týždeň. Presný čas potvrdíme zajtra.'],
            ],
            'time' => [],
            'task' => null,
        ],

        'T4' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'scheduled', 'priority' => 'normal', 'type' => 'question', 'source' => 'manual',
            'createdDay' => -9, 'createdTime' => '11:00',
            'response' => ['day' => -9, 'time' => '11:00'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Plánované opätovné napustenie podlahy v lobby',
            'description' => 'Prvá z dvoch návštev opätovného napustenia, ktoré zahŕňa ročná zmluva o údržbe: vyčistenie a nové napustenie podlahy v lobby.',
            'tags' => ['zmluva', 'napustenie', 'údržba'],
            'watchers' => [],
            'messages' => [
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -9, 'time' => '11:05', 'body' => 'Dobrý deň, {contact:C6}, prvá návšteva opätovného napustenia podľa Vašej zmluvy o údržbe je naplánovaná na {d:6} o 8:00. Lobby by malo byť asi tri hodiny bez hostí.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -8, 'time' => '10:40', 'body' => 'Ďakujeme, vyhovuje nám to. Bočný vchod do lobby ten deň ráno uzavrieme.'],
            ],
            'time' => [],
            'task' => ['owner' => 'pm', 'status' => 'new', 'priority' => 'medium', 'deadlineDay' => 6, 'deadlineTime' => '08:00', 'title' => 'Napustiť podlahu v lobby v hoteli {client:C6}', 'description' => 'Návšteva údržby 1 z 2 podľa zmluvy. Vziať čistič a dve fľaše {item:I6}; po napustení nechať podlahu zatvorenú 3 hodiny.'],
        ],

        'T5' => [
            'client' => 'C3', 'project' => 'P4', 'assignee' => 'sales', 'status' => 'resolved', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -14, 'createdTime' => '09:15',
            'response' => ['day' => -14, 'time' => '10:30'], 'resolved' => ['day' => -11, 'time' => '16:00'], 'closed' => null, 'satisfaction' => null,
            'title' => 'Dodaný nesprávny profil hrany na jednej doske',
            'description' => 'Jedna pracovná doska z minulotýždňovej objednávky bola dodaná s rímsovou hranou namiesto jemne zaoblenej hrany z objednávky. Štúdio ju nemôže namontovať.',
            'tags' => ['výroba', 'hrana', 'dobropis'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -14, 'time' => '09:15', 'body' => 'Dobrý deň, jedna doska z poslednej dodávky má rímsovú hranu, ale objednali sme jemne zaoblenú. Nemôžeme ju namontovať. Poraďte, prosím.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -14, 'time' => '10:30', 'body' => 'Dobrý deň, {contact:C3}, ospravedlňujeme sa za zámenu. Dosku vyrobíme znova so správnou hranou a privezieme Vám ju bez poplatku.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -13, 'time' => '08:45', 'body' => 'V objednávke bol profil správne, CNC program bol starý. Nová doska ide vo štvrtok na vodný lúč; {user:E5} pred expedíciou skontroluje profil podľa výkresu.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -11, 'time' => '16:00', 'body' => 'Nová doska bola dnes dodaná. Dobropis na {m:180} za dopravu navyše pošleme s najbližšou faktúrou.'],
            ],
            'time' => [
                ['user' => 'sales', 'minutes' => 40, 'billable' => 0, 'day' => -14, 'note' => 'Telefonát so štúdiom a opätovná objednávka'],
                ['user' => 'pm', 'minutes' => 90, 'billable' => 0, 'day' => -12, 'note' => 'Plán novej výroby, oprava programu'],
            ],
            'task' => null,
        ],
    ],
];
