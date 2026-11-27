<?php
/**
 * Clients pack, slovenská edícia: čo sa deje s klientmi C1-C6 a leadmi L7-L11 (Part D3).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/clients.php). Ľudia a firmy sú
 * v company.php a odkazuje sa na ne refom / {placeholderom}. Rovnaké kľúče, dĺžky zoznamov a čísla ako
 * packs/en/clients.php a packs/hu/clients.php; líšia sa len texty. Sumy v texte sú {m:EUR}, dátumy {d:posun}.
 */
return [
    'categories' => [
        'private' => ['name' => 'Súkromné domácnosti', 'parent' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Home'],
        'commercial' => ['name' => 'Komerční klienti a developeri', 'parent' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Building'],
        'trade' => ['name' => 'Obchodní partneri a štúdiá', 'parent' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
        'hospitality' => ['name' => 'Hotely a gastro', 'parent' => 'commercial', 'level' => 2, 'color' => '#0ea5e9', 'icon' => 'Coffee'],
    ],

    'statusTitle' => 'Stav zmenený na „%s“',

    // source: showroom | facebook | instagram | website. division: index do dvoch divízií edície.
    // adjustmentEur: hodnota doterajších zákaziek - kladné číslo robí zo záznamu klienta.
    // leadCategories: indexy do LEAD_CATEGORIES (0 produkty, 1 služby).
    'leads' => [
        'C1' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 0, 'adjustmentEur' => 6800, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -150, 'legalForm' => 's.r.o.',
            'interest' => 'Kamenný obklad fasády a podlaha lobby novej rezidencie s 12 vilami (približne 180 m² veľkoformátových porcelánových a kremenných dosiek).'],
        'C2' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 1850, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C3', 'day' => -110, 'legalForm' => '',
            'interest' => 'Kuchynská pracovná doska a 60 cm zástena z bieleho kremeňa, výrez na podstavný drez.'],
        'C3' => ['source' => 'showroom', 'owner' => 'pm', 'division' => 0, 'adjustmentEur' => 12400, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -190, 'legalForm' => 's.r.o.',
            'interest' => 'Partnerské kuchynské štúdio: výroba pracovných dosiek pre jeho kuchynské zákazky, približne 8 – 10 zákaziek mesačne.'],
        'C4' => ['source' => 'website', 'owner' => 'pm', 'division' => 1, 'adjustmentEur' => 3900, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -95, 'legalForm' => 's.r.o.',
            'interest' => 'Showroomové stoly a parapety zo spekaného kameňa pre predajcu nábytku v Česku.'],
        'C5' => ['source' => 'facebook', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 5200, 'leadCategories' => [0], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -70, 'legalForm' => 's.r.o.',
            'interest' => 'Dosky pod umývadlá a obklad stien kúpeľní pre sériu rekonštrukcií bytov.'],
        'C6' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 9500, 'leadCategories' => [0, 1], 'clientCategory' => 'hospitality', 'referral' => 'L10', 'day' => -60, 'legalForm' => 's.r.o.',
            'interest' => 'Recepčný pult, obklad steny wellness a podlaha lobby pre butikový hotel; ročná zmluva o údržbe.'],
        'L7' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -1, 'legalForm' => '',
            'interest' => 'Doska pod umývadlo a obklad sprchovacieho kúta v rodinnom dome.'],
        'L8' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C2', 'day' => -8, 'legalForm' => '',
            'interest' => 'Dlažba terasy a pult vonkajšej kuchyne z 20 mm porcelánových dosiek.'],
        'L9' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -4, 'legalForm' => '',
            'interest' => 'Kuchynská pracovná doska z bieleho kremeňa s výrezom na podstavný drez a možnosťou 4 cm zrezanej hrany.'],
        'L10' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 0, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -75, 'legalForm' => 'GmbH',
            'interest' => 'Partnerstvo s architektonickým štúdiom: pracovné dosky, obklady a podlahy pre približne šesť vilových projektov ročne.'],
        'L11' => ['source' => 'facebook', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -40, 'legalForm' => '',
            'interest' => 'Malá kúpeľňová doska; klient sa rozhodol pre lacnejšiu dielňu.'],
    ],

    // headers = true: karta sa ukladá tak, ako ju ukladá mail_broker.php (From/To/Subject nad telom správy).
    // user = používateľ CRM, ktorému záznam patrí; null = nikto ho tu nespustil (webový formulár, prichádzajúci e-mail).
    'timeline' => [
        // --- C1 Horský park (developer) ----------------------------------------------------------
        ['client' => 'C1', 'day' => -150, 'time' => '10:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => '{contact:C1} zavolal po návšteve nášho showroomu: nová rezidencia s 12 vilami potrebuje obklad fasády a podlahu lobby z veľkoformátových dosiek. Dohodli sme obhliadku a ďalšie kroky.'],
        ['client' => 'C1', 'day' => -147, 'time' => '09:40', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslaný katalóg a vzorkovník',
            'content' => 'Poslali sme katalóg dosiek, cenník a vzorkovník poštou.'],
        ['client' => 'C1', 'day' => -138, 'time' => '14:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Obhliadka a laserové zameranie',
            'content' => 'Fasádu aj lobby sme zamerali laserom, fotky a nákresy sú uložené v priečinku projektu. Tri fázy: zameranie, výroba, montáž.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:20', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Objednávka potvrdená',
            'content' => 'Developer potvrdil ponuku ({m:24600}) e-mailom; vystavuje sa 40 % záloha a výrobný termín je rezervovaný.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:21', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C1', 'day' => -12, 'time' => '16:10', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Fasáda: 1. etapa hotová',
            'content' => '{contact:C1} potvrdil, že 1. etapa fasády je hotová a lešenie je odstránené. Objednávka dosiek na 2. etapu je na rade tento týždeň.'],

        // --- C2 Andrea Horváthová (súkromná klientka, projekt hotový) ----------------------------
        ['client' => 'C2', 'day' => -110, 'time' => '15:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => 'Našla nás na Instagrame a odporučil nás {client:C3}. Chce bielu kremennú dosku a zástenu. Dohodli sme návštevu showroomu.'],
        ['client' => 'C2', 'day' => -104, 'time' => '13:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Návšteva showroomu a laserové zameranie',
            'content' => 'Dosku si vybrala v showroome, kuchyňu sme jej zamerali laserom ešte v ten istý deň popoludní.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:05', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Objednávka potvrdená',
            'content' => 'Klientka potvrdila ponuku ({m:5900}) e-mailom; výroba sa začína budúci týždeň.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:06', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C2', 'day' => -45, 'time' => '17:20', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Namontované a zaplatené',
            'content' => 'Dosku sme namontovali za jeden deň a konečná faktúra je zaplatená. Klientka súhlasila so záverečnými fotkami do nášho portfólia.'],
        ['client' => 'C2', 'day' => -6, 'time' => '11:15', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Reklamácia: malý odštiepok na hrane',
            'content' => '{contact:C2} našla malý odštiepok na hrane dosky pri umývačke a poslala fotku. Reklamačný tiket je otvorený a oprava na mieste je naplánovaná.'],

        // --- C3 KuchyneLine (partnerské štúdio) ----------------------------------------------------
        ['client' => 'C3', 'day' => -190, 'time' => '09:00', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => '{contact:C3} vedie kuchynské štúdio a hľadá spoľahlivú dielňu na pracovné dosky: 8 – 10 zákaziek mesačne. Dohodli sme návštevu našej dielne.'],
        ['client' => 'C3', 'day' => -183, 'time' => '16:10', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslaný rámcový cenník',
            'content' => 'Poslali sme partnerský cenník so stupňami podľa objemu a štandardnými dodacími lehotami.'],
        ['client' => 'C3', 'day' => -170, 'time' => '12:00', 'type' => 'note', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Poznámka ku klientovi',
            'content' => 'Štúdio posiela zoznam dosiek každý pondelok; zameriavajú si ich vlastní montéri. Uprednostňuje e-mail, rozhoduje {contact:C3}.'],
        ['client' => 'C3', 'day' => -160, 'time' => '10:00', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C3', 'day' => -9, 'time' => '14:25', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Nesprávny profil hrany na jednej doske',
            'content' => '{contact:C3} nahlásila, že jedna doska prišla s nesprávnym profilom hrany. Dohodli sme jej opätovnú výrobu a dobropis na rozdiel.'],

        // --- C4 Interiéry Dvořák (zahraničný predajca) ------------------------------------------------
        ['client' => 'C4', 'day' => -95, 'time' => '14:20', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => '{contact:C4} nás našiel cez web. Predajca chce showroomové stoly a parapety zo spekaného kameňa a pýta sa na dodanie do Česka.'],
        ['client' => 'C4', 'day' => -88, 'time' => '09:30', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslaná ponuka a dodacie podmienky',
            'content' => 'Poslali sme ponuku s rozmermi dosiek, balením a dodacími podmienkami do Brna.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:00', 'type' => 'order', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Objednávka potvrdená',
            'content' => 'Predajca potvrdil ponuku e-mailom; pred rezaním sme si vyžiadali 50 % zálohu.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:01', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],

        // --- C5 Správa bytov Juh (séria bytov) ----------------------------------------------------------
        ['client' => 'C5', 'day' => -70, 'time' => '11:00', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => '{contact:C5} spravuje bytový dom, ktorého byty sa rekonštruujú jeden po druhom, a potrebuje v každej kúpeľni rovnakú dosku pod umývadlo.'],
        ['client' => 'C5', 'day' => -62, 'time' => '13:45', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Obhliadka',
            'content' => 'Pozreli sme si tri vzorové kúpeľne a dohodli jeden štandardný rozmer, aby sa celá séria dala rezať v jednej dávke.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:30', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Objednávka potvrdená',
            'content' => 'Správca potvrdil 1. sériu ({m:21000}); montáž sa začína približne o tri týždne.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:31', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C5', 'day' => -3, 'time' => '09:20', 'type' => 'note', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Začiatok 1. série',
            'content' => '{contact:C5} odovzdá prvé byty {d:21}. Rezanie plánujeme na týždeň pred tým.'],

        // --- C6 Hotel Aurum (butikový hotel) -----------------------------------------------------------------
        ['client' => 'C6', 'day' => -60, 'time' => '10:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => '{contact:C6} rekonštruuje recepciu, wellness a lobby hotela; odporučil nás architekt. Dohodli sme obhliadku.'],
        ['client' => 'C6', 'day' => -52, 'time' => '15:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Obhliadka a laserové zameranie',
            'content' => 'Zamerali sme recepciu, stenu wellness aj lobby. Stena wellness chce veľkoformátový spekaný kameň; recepčný pult je 30 mm kremeň so zrezanými rohmi.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:15', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Objednávka potvrdená',
            'content' => 'Hotel podpísal ponuku ({m:46000}) aj ročnú zmluvu o údržbe; 40 % záloha je splatná podľa faktúry.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:16', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C6', 'day' => -14, 'time' => '16:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Dodávka dosiek mešká – ospravedlnenie',
            'content' => 'Oznámili sme {contact:C6}, že dosky z Talianska prídu neskôr, než sme plánovali, a stena wellness sa posúva. Nový termín pošleme písomne.'],
        ['client' => 'C6', 'day' => -6, 'time' => '14:00', 'type' => 'appointment', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Stretnutie s klientom: oneskorenie steny wellness',
            'content' => 'Stretli sme sa s {contact:C6} v hoteli: nový termín dodania, schválenie vzorky dosky a platobný kalendár. Zápis zo stretnutia je v AI zasadačke.'],

        // --- L7 Peter Kováč (nový, webový formulár včera) -----------------------------------------------------
        ['client' => 'L7', 'day' => -1, 'time' => '19:42', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Dopyt z webového formulára',
            'content' => "Odoslaný formulár zo zdroja: web\nMeno: {contact:L7}\nKategória: Produkty\nHodnota: {m:3200}\nSpráva: Rekonštruujeme hlavnú kúpeľňu a chceli by sme kremennú dosku pod umývadlo a kamenný obklad sprchy. Pošlete nám prosím ponuku a termín dodania?"],

        // --- L8 Eva Mináriková (kontaktovaná) --------------------------------------------------------------------
        ['client' => 'L8', 'day' => -8, 'time' => '20:05', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Správa z Instagramu',
            'content' => '{contact:L8} nám napísala po tom, čo videla hotovú kuchyňu klientky {contact:C2}, ktorá nás odporučila: chce novú dlažbu terasy a pult vonkajšej kuchyne.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Prvý hovor',
            'content' => 'Terasa má približne 26 m², pult 2,4 m. Porcelánové dosky s hrúbkou 20 mm sú mrazuvzdorné, takže sa hodia do exteriéru. Dohodli sme obhliadku a zameranie.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'contacted', 'title' => null, 'content' => null],
        ['client' => 'L8', 'day' => -2, 'time' => '12:30', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslaný katalóg a vzorkovník',
            'content' => 'Poslali sme katalóg dosiek do exteriéru a cenník; konceptu ponuky sa dočkáte po zameraní.'],

        // --- L9 Martina Kováčová (ponuka odoslaná): webový formulár a mailové vlákno o výreze na drez -------
        ['client' => 'L9', 'day' => -4, 'time' => '08:15', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Dopyt z webového formulára',
            'content' => "Odoslaný formulár zo zdroja: web\nMeno: {contact:L9}\nKategória: Produkty\nHodnota: {m:8400}\nSpráva: Hľadám kuchynskú dosku z bieleho kremeňa, dlhú 2,4 m. Kuchynskú linku nám montujú o pár týždňov. Minulý týždeň som bola u vás v showroome a prosila by som o ponuku."],
        ['client' => 'L9', 'day' => -3, 'time' => '09:12', 'type' => 'email', 'user' => 'sales', 'outgoing' => false, 'headers' => true, 'status' => null,
            'title' => 'Nákresy kuchynskej dosky + výrez na drez',
            'content' => "Dobrý deň {first:sales},\n\nďakujem za návštevu showroomu minulý týždeň. Posielam v prílohe nákresy kuchyne od nášho architekta - doska má 2,4 m na dĺžku a 60 cm na hĺbku, s 20 cm presahom nad umývačkou.\n\nPred objednaním by som si rada potvrdila tri veci:\n\n1. Drez je podstavný Sinkra 500x400 mm, takže výrez musí byť leštený zo všetkých štyroch strán.\n2. Rovnaký kameň by sme chceli aj na 60 cm zástenu, v hrúbke 12 mm.\n3. Je možná 4 cm zrezaná hrana vpredu, alebo to výrazne mení cenu?\n\nDodanie by sme ideálne potrebovali v týždni od {d:20} - kuchynskú linku montujú {d:24}.\n\nĎakujem a prajem pekný deň,\n{contact:L9}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:40', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => true, 'status' => null,
            'title' => 'RE: Nákresy kuchynskej dosky + výrez na drez',
            'content' => "Dobrý deň,\n\nďakujem za nákresy, všetko je zrozumiteľné.\n\n1. Výrez pre podstavný drez vrátane leštenia všetkých štyroch hrán je súčasťou štandardnej ceny opracovania, bez príplatku.\n2. Zástena 60 cm v hrúbke 12 mm nie je problém - pridal som ju do ponuky ako samostatnú položku.\n3. Zrezaná hrana 4 cm je možná; kvôli rezaniu a lepeniu navyšuje cenu približne o {m:180}.\n\nUpravenú ponuku posielam v prílohe. Ak ju potvrdíte do {d:2}, laserové zameranie stihneme {d:6} a dodanie v týždni od {d:20}, takže by ste boli včas pred montážou linky.\n\nS pozdravom,\n{user:sales}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L10 Müller Architekten (zahraničné architektonické štúdio, ponuka odoslaná) ---------------------
        ['client' => 'L10', 'day' => -75, 'time' => '11:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Návšteva v showroome',
            'content' => '{contact:L10} prišiel do showroomu s klientom a zaujali ho vzorky spekaného kameňa. Jeho štúdio navrhuje približne šesť víl ročne; hovorili sme o partnerstve.'],
        ['client' => 'L10', 'day' => -68, 'time' => '09:50', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslané vzorky a zoznam referencií',
            'content' => 'Poslali sme sadu troch vzoriek spekaného kameňa a zoznam našich referenčných projektov vrátane {client:C6}.'],
        ['client' => 'L10', 'day' => -45, 'time' => '15:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Hovor o doprave do Nemecka',
            'content' => 'Štúdio potrebuje dodanie na paletách do Bavorska a pevnú cenu za štvorcový meter v rámcovej zmluve. Pripravujeme ponuku partnerstva.'],
        ['client' => 'L10', 'day' => -30, 'time' => '10:20', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L11 Roman Tóth (prehraný na cene) -------------------------------------------------------------------
        ['client' => 'L11', 'day' => -40, 'time' => '17:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Úvodný hovor',
            'content' => 'Klient potrebuje malú kúpeľňovú dosku a porovnáva viacero dielní. Sľúbili sme ponuku do dvoch dní.'],
        ['client' => 'L11', 'day' => -36, 'time' => '10:10', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Odoslaná ponuka',
            'content' => 'Poslali sme ponuku na {m:2900}. Navrhli sme tenší kremeň, aby cena klesla.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:40', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Odmietnuté: iná dielňa je lacnejšia',
            'content' => 'Klient sa rozhodol pre lacnejšiu dielňu, približne o 15 % pod našou cenou. Kontakt si necháme na neskorší projekt.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:41', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'lost', 'title' => null, 'content' => null],
    ],
];
