<?php
/**
 * Pack `employees` (sk) - to, čo company pack neobsahuje: popisy práce, nároky na voľno,
 * mzdové riadky inštalačného mesiaca a kalendár voľna šiestich zamestnancov.
 * Osobné údaje (mená, e-maily, adresy, platy) sú v packs/sk/company.php.
 *
 * Pravidlá tvaru: demo_seed/index.php (časť 2). `start` je posun v dňoch od dneška, `days` sú
 * PRACOVNÉ dni; modul posunie začiatok z víkendu či sviatku na najbližší pracovný deň.
 */
return [
    'staff' => [
        'E1' => ['notes' => 'Zakladateľ a konateľ. Schvaľuje ponuky, väčšie nákupy dosiek a výplaty.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E2' => ['notes' => 'Riadi výrobu a projekty: plán dielne, montážnu čatu, dodávky od dodávateľov a kontroly na stavbe.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E3' => ['notes' => 'Predaj v showroome: konzultácie, zamerania a ponuky pre súkromných klientov a partnerské štúdiá.', 'allowances' => ['annual' => 20, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E4' => ['notes' => 'Vedie dvojčlennú montážnu čatu; plánuje a preberá každú montáž na mieste.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E5' => ['notes' => 'Obsluhuje CNC a vodný lúč, brúsku hrán a pripravuje rezný plán každej dosky.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E6' => ['notes' => 'Kancelária, fakturácia, účtovníctvo a nákupná administratíva; prvý hlas v telefóne.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
    ],

    'payroll' => [
        'dueDay' => 15,
        'baseName' => 'Základná mzda',
        'paidNote' => 'Uhradené bankovým prevodom',
        'pendingNote' => 'Mzda naplánovaná na deň výplaty',
        'extras' => [
            ['employee' => 'E3', 'category' => 'bonus', 'name' => 'Provízia z predaja', 'amountEur' => 380],
            ['employee' => 'E2', 'category' => 'reimbursement', 'name' => 'Cestovné a diéty', 'amountEur' => 85],
            ['employee' => 'E4', 'category' => 'overtime', 'name' => 'Nadčasy', 'amountEur' => 150],
            ['employee' => 'E5', 'category' => 'overtime', 'name' => 'Nadčasy', 'amountEur' => 120],
        ],
    ],

    'approvedBy' => '{user:owner}',
    'vacations' => [
        ['employee' => 'E1', 'type' => 'annual', 'start' => -64, 'days' => 5, 'status' => 'approved', 'note' => 'Rodinná dovolenka pri jazere'],
        ['employee' => 'E1', 'type' => 'doctor', 'start' => -38, 'days' => 1, 'status' => 'approved', 'note' => 'Preventívna prehliadka'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 25, 'days' => 4, 'status' => 'approved', 'note' => 'Predĺžený víkend v horách'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 61, 'days' => 5, 'status' => 'pending', 'note' => 'Zimná dovolenka'],

        ['employee' => 'E2', 'type' => 'annual', 'start' => -71, 'days' => 5, 'status' => 'approved', 'note' => 'Letná dovolenka'],
        ['employee' => 'E2', 'type' => 'sick', 'start' => -45, 'days' => 2, 'status' => 'approved', 'note' => 'Chrípka'],
        ['employee' => 'E2', 'type' => 'doctor', 'start' => -36, 'days' => 1, 'status' => 'approved', 'note' => 'Zubár'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 14, 'days' => 3, 'status' => 'approved', 'note' => 'Predĺžený víkend'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 40, 'days' => 5, 'status' => 'pending', 'note' => 'Plánovaná dovolenka'],

        ['employee' => 'E3', 'type' => 'annual', 'start' => -55, 'days' => 4, 'status' => 'approved', 'note' => 'Výlet s rodinou'],
        ['employee' => 'E3', 'type' => 'doctor', 'start' => -37, 'days' => 1, 'status' => 'approved', 'note' => 'Očné vyšetrenie'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 20, 'days' => 5, 'status' => 'approved', 'note' => 'Dovolenka po dni otvorených dverí v showroome'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 52, 'days' => 3, 'status' => 'pending', 'note' => 'Predĺžený víkend'],

        ['employee' => 'E4', 'type' => 'annual', 'start' => -48, 'days' => 3, 'status' => 'approved', 'note' => 'Jesenný oddych'],
        ['employee' => 'E4', 'type' => 'sick', 'start' => -30, 'days' => 3, 'status' => 'approved', 'note' => 'Bolesť chrbta'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => -1, 'days' => 3, 'status' => 'approved', 'note' => 'Krátke voľno, tento týždeň mimo dielne'],
        ['employee' => 'E4', 'type' => 'doctor', 'start' => 9, 'days' => 1, 'status' => 'approved', 'note' => 'Návšteva lekára'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => 33, 'days' => 5, 'status' => 'pending', 'note' => 'Plánovaná dovolenka'],

        ['employee' => 'E5', 'type' => 'sick', 'start' => -52, 'days' => 2, 'status' => 'approved', 'note' => 'Nachladnutie'],
        ['employee' => 'E5', 'type' => 'doctor', 'start' => -12, 'days' => 1, 'status' => 'approved', 'note' => 'Kontrola u lekára'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 5, 'days' => 4, 'status' => 'approved', 'note' => 'Predĺžený víkend'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 44, 'days' => 5, 'status' => 'pending', 'note' => 'Plánovaná dovolenka'],

        ['employee' => 'E6', 'type' => 'annual', 'start' => -66, 'days' => 5, 'status' => 'approved', 'note' => 'Letná dovolenka'],
        ['employee' => 'E6', 'type' => 'doctor', 'start' => -22, 'days' => 1, 'status' => 'approved', 'note' => 'Kontrola u lekára'],
        ['employee' => 'E6', 'type' => 'annual', 'start' => 12, 'days' => 5, 'status' => 'approved', 'note' => 'Dovolenka s deťmi'],
        ['employee' => 'E6', 'type' => 'unpaid', 'start' => 30, 'days' => 1, 'status' => 'pending', 'note' => 'Súkromné vybavovanie'],
    ],
];
