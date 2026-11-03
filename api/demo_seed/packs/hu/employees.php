<?php
/**
 * Pack `employees` (hu) - amit a company pack nem tartalmaz: munkaköri leírások, szabadságkeretek,
 * a telepítés hónapjának bérsorai és a hat munkatárs szabadságnaptára.
 * A személyes adatok (nevek, e-mailek, címek, fizetések) a packs/hu/company.php-ban vannak.
 *
 * Alakszabályok: demo_seed/index.php (2. rész). A `start` a mai naptól számított napeltolás,
 * a `days` MUNKANAPOT jelent; a modul a hétvégére vagy ünnepnapra eső kezdést a következő
 * munkanapra teszi.
 */
return [
    'staff' => [
        'E1' => ['notes' => 'Alapító és ügyvezető. Jóváhagyja az ajánlatokat, a nagyobb lapbeszerzéseket és a bérszámfejtést.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E2' => ['notes' => 'A gyártást és a projekteket irányítja: műhelyterv, szerelőcsapat, beszállítói szállítások és helyszíni ellenőrzések.', 'allowances' => ['annual' => 25, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E3' => ['notes' => 'Bemutatótermi értékesítés: tanácsadás, felmérések és ajánlatok magánügyfeleknek és partnerstúdióknak.', 'allowances' => ['annual' => 20, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E4' => ['notes' => 'A kétfős szerelőcsapatot vezeti; minden beépítést a helyszínen tervez és vesz át.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E5' => ['notes' => 'A CNC-t, a vízsugaras vágót és az élcsiszolót kezeli, és elkészíti minden lap vágási tervét.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
        'E6' => ['notes' => 'Iroda, számlázás, könyvelés és beszerzési ügyintézés; a telefonban az első hang.', 'allowances' => ['annual' => 22, 'sick' => 10, 'doctor' => 7, 'unpaid' => 0]],
    ],

    'payroll' => [
        'dueDay' => 15,
        'baseName' => 'Alapbér',
        'paidNote' => 'Banki átutalással kifizetve',
        'pendingNote' => 'A bér a kifizetés napjára tervezve',
        'extras' => [
            ['employee' => 'E3', 'category' => 'bonus', 'name' => 'Értékesítési jutalék', 'amountEur' => 380],
            ['employee' => 'E2', 'category' => 'reimbursement', 'name' => 'Utazási költség és napidíj', 'amountEur' => 85],
            ['employee' => 'E4', 'category' => 'overtime', 'name' => 'Túlóra', 'amountEur' => 150],
            ['employee' => 'E5', 'category' => 'overtime', 'name' => 'Túlóra', 'amountEur' => 120],
        ],
    ],

    'approvedBy' => '{user:owner}',
    'vacations' => [
        ['employee' => 'E1', 'type' => 'annual', 'start' => -64, 'days' => 5, 'status' => 'approved', 'note' => 'Családi nyaralás a tónál'],
        ['employee' => 'E1', 'type' => 'doctor', 'start' => -38, 'days' => 1, 'status' => 'approved', 'note' => 'Éves szűrővizsgálat'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 25, 'days' => 4, 'status' => 'approved', 'note' => 'Hosszú hétvége a hegyekben'],
        ['employee' => 'E1', 'type' => 'annual', 'start' => 61, 'days' => 5, 'status' => 'pending', 'note' => 'Téli szabadság'],

        ['employee' => 'E2', 'type' => 'annual', 'start' => -71, 'days' => 5, 'status' => 'approved', 'note' => 'Nyári szabadság'],
        ['employee' => 'E2', 'type' => 'sick', 'start' => -45, 'days' => 2, 'status' => 'approved', 'note' => 'Influenza'],
        ['employee' => 'E2', 'type' => 'doctor', 'start' => -36, 'days' => 1, 'status' => 'approved', 'note' => 'Fogorvos'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 14, 'days' => 3, 'status' => 'approved', 'note' => 'Hosszú hétvége'],
        ['employee' => 'E2', 'type' => 'annual', 'start' => 40, 'days' => 5, 'status' => 'pending', 'note' => 'Tervezett szabadság'],

        ['employee' => 'E3', 'type' => 'annual', 'start' => -55, 'days' => 4, 'status' => 'approved', 'note' => 'Családi kirándulás'],
        ['employee' => 'E3', 'type' => 'doctor', 'start' => -37, 'days' => 1, 'status' => 'approved', 'note' => 'Szemészeti vizsgálat'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 20, 'days' => 5, 'status' => 'approved', 'note' => 'Szabadság a bemutatótermi nyílt nap után'],
        ['employee' => 'E3', 'type' => 'annual', 'start' => 52, 'days' => 3, 'status' => 'pending', 'note' => 'Hosszú hétvége'],

        ['employee' => 'E4', 'type' => 'annual', 'start' => -48, 'days' => 3, 'status' => 'approved', 'note' => 'Őszi kikapcsolódás'],
        ['employee' => 'E4', 'type' => 'sick', 'start' => -30, 'days' => 3, 'status' => 'approved', 'note' => 'Hátfájás'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => -1, 'days' => 3, 'status' => 'approved', 'note' => 'Rövid szabadság, ezen a héten nincs a műhelyben'],
        ['employee' => 'E4', 'type' => 'doctor', 'start' => 9, 'days' => 1, 'status' => 'approved', 'note' => 'Orvosi vizsgálat'],
        ['employee' => 'E4', 'type' => 'annual', 'start' => 33, 'days' => 5, 'status' => 'pending', 'note' => 'Tervezett szabadság'],

        ['employee' => 'E5', 'type' => 'sick', 'start' => -52, 'days' => 2, 'status' => 'approved', 'note' => 'Megfázás'],
        ['employee' => 'E5', 'type' => 'doctor', 'start' => -12, 'days' => 1, 'status' => 'approved', 'note' => 'Orvosi kontroll'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 5, 'days' => 4, 'status' => 'approved', 'note' => 'Hosszú hétvége'],
        ['employee' => 'E5', 'type' => 'annual', 'start' => 44, 'days' => 5, 'status' => 'pending', 'note' => 'Tervezett szabadság'],

        ['employee' => 'E6', 'type' => 'annual', 'start' => -66, 'days' => 5, 'status' => 'approved', 'note' => 'Nyári szabadság'],
        ['employee' => 'E6', 'type' => 'doctor', 'start' => -22, 'days' => 1, 'status' => 'approved', 'note' => 'Orvosi kontroll'],
        ['employee' => 'E6', 'type' => 'annual', 'start' => 12, 'days' => 5, 'status' => 'approved', 'note' => 'Szabadság a gyerekekkel'],
        ['employee' => 'E6', 'type' => 'unpaid', 'start' => 30, 'days' => 1, 'status' => 'pending', 'note' => 'Személyes ügyintézés'],
    ],
];
