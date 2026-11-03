<?php
/**
 * Pack `time` (sk) - čo si traja používatelia zapisujú v časomiere (C10).
 * Každý používateľ má ZÁSOBNÍK činností, ktoré modul rozdelí na posledných 15 pracovných dní
 * (demo_seed/time.php): každá sa opakuje približne rovnako často. Podiely: majiteľ ~25 %
 * fakturovateľných, vedúca výroby ~70 %, predajca ~45 %; asi každý desiaty záznam je bez projektu.
 *
 *   title     čo človek napísal; zapíše sa len ak položka nie je prepojená s úlohou ani tiketom
 *   note      popis záznamu ('' = žiadny)
 *   project   referencia projektu alebo null
 *   link      null | 'task' | 'ticket': prepojenie na `pick`-tu ukážkovú úlohu (tiket) projektu
 *   billable  fakturuje sa klientovi
 */
return [
    'billableRateEur' => 45,

    'device' => ['name' => 'Chrome · macOS', 'browser' => 'Chrome', 'os' => 'macOS', 'version' => '1.0.0'],

    'pools' => [
        'owner' => [
            ['title' => 'Hotel: telefonát k termínu odovzdania a splátkam', 'note' => 'Nový termín potvrdený následne e-mailom.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Ceny fasády a ponuky dodávateľov', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Rámcová zmluva: objemy a ceny s partnerským štúdiom', 'note' => 'Ceny zafixované do konca štvrťroka.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Objednávka dosiek pre wellness stenu', 'note' => '', 'project' => 'P3', 'link' => 'task', 'pick' => 0, 'billable' => false],
            ['title' => 'Týždenná porada výroby a predaja', 'note' => 'Priority týždňa dohodnuté.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Schválenie výkresov fasády', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'Schválenie cenníka dodávateľa', 'note' => 'Cenník na budúci štvrťrok od talianskeho výrobcu.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Obhliadka stavby vily so stavbyvedúcim', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Kontrola ponúk s predajcom', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Škára vo wellness stene: odpoveď hotelu', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Návštevy showroomu, e-maily a telefonáty', 'note' => 'Treba zatriediť do projektov.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Kontrola cash flow a faktúr', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 2, 'billable' => false],
        ],
        'pm' => [
            ['title' => 'Rezný plán pre dosky fasády', 'note' => 'Odpad udržaný pod 8 %.', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'CNC rozloženie a alokácia dosiek', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Zameranie a šablóny pre wellness stenu', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Plán montážnych termínov, fasáda 1. etapa', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Profily hrán a výroba pracovných dosiek', 'note' => 'Zrezané hrany, 4 cm.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Kontrola kvality pred expedíciou', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Obhliadka stavby: obklad wellness steny', 'note' => 'Fotografie nahrané do projektu.', 'project' => 'P3', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Rozloženie podlahy lobby a plán škár', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Reklamácia: dodaný nesprávny profil hrany', 'note' => 'Dohodnutý dobropis.', 'project' => 'P4', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Škára vo wellness stene: kontrola', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Koordinácia dodávky dosiek s dodávateľom', 'note' => 'Dodávka sa posunula o týždeň.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Administratíva dielne a porada tímu', 'note' => '', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
        ],
        'sales' => [
            ['title' => 'Zameranie: podlaha lobby hotela', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Výber materiálu a odtieňa fasády', 'note' => 'Klient si vybral odtieň.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Konzultácia v showroome pre partnerské štúdio', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Ponuka na variant fasádneho obkladu', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Zameranie laserom', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Nadväzujúca ponuka na dopyt z webu', 'note' => 'Čaká sa, kým zákazník vyberie hranu.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Vzorkovníky do showroomu', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Aktualizácia zoznamu objednávok partnerského štúdia', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'Fotodokumentácia fasády', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Zmena výrezu varnej dosky: telefonát s klientom', 'note' => 'Výrez varnej dosky zmenený vo výkrese.', 'project' => 'P1', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Príprava dňa otvorených dverí v showroome', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
        ],
    ],

    'activity' => [
        ['domain' => 'marmi-fiorano.example', 'title' => 'Marmi Fiorano – cenník kremenných dosiek', 'from' => '10:12', 'minutes' => 14, 'project' => 'P3'],
        ['domain' => 'mail.lapidea.example', 'title' => 'Doručená pošta (4) – Lapidea Mail', 'from' => '11:05', 'minutes' => 9, 'project' => null],
        ['domain' => 'cad-viewer.example', 'title' => 'Sablona_wellness_stena.dwg – Prehliadač výkresov', 'from' => '13:40', 'minutes' => 23, 'project' => null],
        ['domain' => 'docs.lapidea.example', 'title' => 'Montážny zoznam úloh – projektové dokumenty', 'from' => '15:20', 'minutes' => 11, 'project' => null],
    ],
];
