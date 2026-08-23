<?php
if (file_exists(__DIR__ . '/schema.php')) {
    require_once __DIR__ . '/schema.php';
} elseif (file_exists('/var/www/html/api/schema.php')) {
    require_once '/var/www/html/api/schema.php';
}

if (file_exists(dirname(__DIR__) . '/config.php')) {
    require_once dirname(__DIR__) . '/config.php';
} elseif (file_exists('/var/www/html/config.php')) {
    require_once '/var/www/html/config.php';
}

$pdo = get_db_connection();
ccrm_apply_schema($pdo);

$pdo->beginTransaction();

try {
    // 1. Seed Rich Financial Categories (3-level hierarchy)
    $categories = [
        // Level 1: Incomes
        ['id' => 'cat-inc-proj', 'name' => 'Klientské zákazky a projekty', 'type' => 'income', 'parent_id' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Briefcase'],
        ['id' => 'cat-inc-serv', 'name' => 'Pravidelný servis a údržba', 'type' => 'income', 'parent_id' => null, 'level' => 1, 'color' => '#06b6d4', 'icon' => 'RefreshCw'],
        ['id' => 'cat-inc-other', 'name' => 'Ostatné firemné výnosy', 'type' => 'income', 'parent_id' => null, 'level' => 1, 'color' => '#6366f1', 'icon' => 'TrendingUp'],

        // Level 2: Project Income Subcategories
        ['id' => 'cat-inc-proj-kitchen', 'name' => 'Kuchynské dosky a ostrovy', 'type' => 'income', 'parent_id' => 'cat-inc-proj', 'level' => 2, 'color' => '#10b981', 'icon' => 'Home'],
        ['id' => 'cat-inc-proj-cladding', 'name' => 'Fasády a kamenné obklady', 'type' => 'income', 'parent_id' => 'cat-inc-proj', 'level' => 2, 'color' => '#059669', 'icon' => 'Layers'],
        ['id' => 'cat-inc-proj-bath', 'name' => 'Kúpeľňové dosky a dlažba', 'type' => 'income', 'parent_id' => 'cat-inc-proj', 'level' => 2, 'color' => '#14b8a6', 'icon' => 'Droplet'],

        // Level 3: Kitchen Sub-subcategories
        ['id' => 'cat-inc-proj-kitch-slab', 'name' => 'Dodávka dosky a rezanie', 'type' => 'income', 'parent_id' => 'cat-inc-proj-kitchen', 'level' => 3, 'color' => '#10b981', 'icon' => 'Box'],
        ['id' => 'cat-inc-proj-kitch-inst', 'name' => 'Montáž a zameranie na stavbe', 'type' => 'income', 'parent_id' => 'cat-inc-proj-kitchen', 'level' => 3, 'color' => '#34d399', 'icon' => 'Tool'],
        ['id' => 'cat-inc-proj-kitch-mitre', 'name' => 'Gérvágott és leštené hrany', 'type' => 'income', 'parent_id' => 'cat-inc-proj-kitchen', 'level' => 3, 'color' => '#6ee7b7', 'icon' => 'Sparkles'],

        // Level 1: Expenses
        ['id' => 'cat-exp-mat', 'name' => 'Priamy materiál a dosky', 'type' => 'expense', 'parent_id' => null, 'level' => 1, 'color' => '#ef4444', 'icon' => 'Boxes'],
        ['id' => 'cat-exp-sub', 'name' => 'Subdodávatelia a externé služby', 'type' => 'expense', 'parent_id' => null, 'level' => 1, 'color' => '#f97316', 'icon' => 'Truck'],
        ['id' => 'cat-exp-over', 'name' => 'Fixná réžia a priestory', 'type' => 'expense', 'parent_id' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Building'],
        ['id' => 'cat-exp-tools', 'name' => 'Nástroje, software a licencie', 'type' => 'expense', 'parent_id' => null, 'level' => 1, 'color' => '#ec4899', 'icon' => 'Cpu'],

        // Level 2: Direct Materials Subcategories
        ['id' => 'cat-exp-mat-porc', 'name' => 'Porcelánové a keramické platne', 'type' => 'expense', 'parent_id' => 'cat-exp-mat', 'level' => 2, 'color' => '#ef4444', 'icon' => 'Layers'],
        ['id' => 'cat-exp-mat-quartz', 'name' => 'Kremenný kompozit a mramor', 'type' => 'expense', 'parent_id' => 'cat-exp-mat', 'level' => 2, 'color' => '#dc2626', 'icon' => 'Box'],
        ['id' => 'cat-exp-mat-chem', 'name' => 'Lepidlá, chémia a spotrebný materiál', 'type' => 'expense', 'parent_id' => 'cat-exp-mat', 'level' => 2, 'color' => '#b91c1c', 'icon' => 'Droplet'],

        // Level 2: Subcontractors Subcategories
        ['id' => 'cat-exp-sub-laser', 'name' => '3D Laserové Proliner zameranie', 'type' => 'expense', 'parent_id' => 'cat-exp-sub', 'level' => 2, 'color' => '#f97316', 'icon' => 'Compass'],
        ['id' => 'cat-exp-sub-waterjet', 'name' => 'CNC Vodný lúč kooperácia', 'type' => 'expense', 'parent_id' => 'cat-exp-sub', 'level' => 2, 'color' => '#ea580c', 'icon' => 'Cpu'],
        ['id' => 'cat-exp-sub-crane', 'name' => 'Žeriav a špeciálna doprava', 'type' => 'expense', 'parent_id' => 'cat-exp-sub', 'level' => 2, 'color' => '#c2410c', 'icon' => 'Truck'],

        // Level 2: Overhead Subcategories
        ['id' => 'cat-exp-over-rent', 'name' => 'Nájom showroom & dielňa', 'type' => 'expense', 'parent_id' => 'cat-exp-over', 'level' => 2, 'color' => '#8b5cf6', 'icon' => 'Building'],
        ['id' => 'cat-exp-over-util', 'name' => 'Vysokonapäťová elektrina a plyn', 'type' => 'expense', 'parent_id' => 'cat-exp-over', 'level' => 2, 'color' => '#7c3aed', 'icon' => 'Zap'],
        ['id' => 'cat-exp-over-ins', 'name' => 'Poistenie majetku a zodpovednosti', 'type' => 'expense', 'parent_id' => 'cat-exp-over', 'level' => 2, 'color' => '#6d28d9', 'icon' => 'Shield'],
    ];

    $stmtCat = $pdo->prepare("INSERT INTO `financial_categories` (`id`, `name`, `type`, `parent_id`, `level`, `color`, `icon`, `created_at`, `updated_at`)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `type`=VALUES(`type`), `parent_id`=VALUES(`parent_id`), `level`=VALUES(`level`), `color`=VALUES(`color`), `icon`=VALUES(`icon`)");

    foreach ($categories as $c) {
        $stmtCat->execute([$c['id'], $c['name'], $c['type'], $c['parent_id'], $c['level'], $c['color'], $c['icon']]);
    }

    // 2. Ensure Sample Project Types & Projects
    $ptId = 'pt_luxury_stone';
    $stmtPt = $pdo->prepare("INSERT INTO `project_types` (`id`, `name`, `color`, `icon`, `attributes_json`, `has_timeline`, `has_gantt`, `timeline_event_types_json`, `timeline_attributes_json`, `created_at`, `updated_at`)
        VALUES (?, ?, ?, ?, '[]', 1, 1, '[]', '[]', NOW(), NOW())
        ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `color`=VALUES(`color`)");
    $stmtPt->execute([$ptId, 'Zákazková kamenná výroba', '#10b981', 'Boxes']);

    $proj1Id = 'proj-vila-slavin';
    $proj2Id = 'proj-kuchyna-neolith';
    $stmtProj = $pdo->prepare("INSERT INTO `projects` (`id`, `project_type_id`, `lead_id`, `client_id`, `status`, `created_at`, `updated_at`)
        VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
        ON DUPLICATE KEY UPDATE `project_type_id`=VALUES(`project_type_id`), `lead_id`=VALUES(`lead_id`), `client_id`=VALUES(`client_id`)");
    $stmtProj->execute([$proj1Id, $ptId, 'lead-10', 'lead-10']);
    $stmtProj->execute([$proj2Id, $ptId, 'lead-14', 'lead-14']);

    // 3. Clear and insert comprehensive Financial Records
    $pdo->exec("DELETE FROM `financial_records` WHERE `id` LIKE 'demo-fin-%'");

    $records = [
        // --- INCOMES / INVOICES (Linked to Clients & Projects) ---
        [
            'id' => 'demo-fin-inc-1',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Kuchynská doska Martina Kováčová - Zálohová faktúra',
            'description' => 'Záloha 50% na dodávku a opracovanie Calacatta Quartz dosky s podstavným drezom.',
            'category_id' => 'cat-inc-proj-kitch-slab',
            'category_path' => 'Klientské zákazky a projekty > Kuchynské dosky a ostrovy > Dodávka dosky a rezanie',
            'amount_planned' => 3450.00,
            'amount_real' => 3450.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-05',
            'due_date' => '2026-08-15',
            'paid_date' => '2026-08-08',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => null,
            'client_id' => 'lead-1',
            'invoice_number' => 'FA-2026-1042',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-2',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Vila Slavín - 1. Etapa Obklad stien a terasy',
            'description' => 'Dodávka veľkoformátových platní 1600x3200 mm pre fasádu a vstupnú halu vily.',
            'category_id' => 'cat-inc-proj-cladding',
            'category_path' => 'Klientské zákazky a projekty > Fasády a kamenné obklady',
            'amount_planned' => 8900.00,
            'amount_real' => 8900.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-10',
            'due_date' => '2026-08-20',
            'paid_date' => '2026-08-12',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'FA-2026-1043',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-3',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Vila Slavín - 2. Etapa Finálna montáž a zameranie',
            'description' => 'Ukončenie montáže, leštenie škár a impregnácia kamenného obkladu.',
            'category_id' => 'cat-inc-proj-cladding',
            'category_path' => 'Klientské zákazky a projekty > Fasády a kamenné obklady',
            'amount_planned' => 11200.00,
            'amount_real' => 0.00,
            'currency' => 'EUR',
            'status' => 'pending',
            'issue_date' => '2026-08-18',
            'due_date' => '2026-09-05',
            'paid_date' => null,
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'FA-2026-1044',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-4',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Barový pult Andrej Švec - Masívna bridlica',
            'description' => 'Realizácia oblúkového pultu so zrezanou 4cm hranou.',
            'category_id' => 'cat-inc-proj-kitch-mitre',
            'category_path' => 'Klientské zákazky a projekty > Kuchynské dosky a ostrovy > Gérvágott és leštené hrany',
            'amount_planned' => 2800.00,
            'amount_real' => 0.00,
            'currency' => 'EUR',
            'status' => 'overdue',
            'issue_date' => '2026-07-20',
            'due_date' => '2026-08-10',
            'paid_date' => null,
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => null,
            'client_id' => 'lead-11',
            'invoice_number' => 'FA-2026-1045',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-5',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Veselý Krokus a.s. - Reprezentatívna recepcia',
            'description' => 'Dodávka mramorového stola a obkladu recepcie.',
            'category_id' => 'cat-inc-proj',
            'category_path' => 'Klientské zákazky a projekty',
            'amount_planned' => 14500.00,
            'amount_real' => 7250.00,
            'currency' => 'EUR',
            'status' => 'partially_paid',
            'issue_date' => '2026-08-01',
            'due_date' => '2026-08-25',
            'paid_date' => '2026-08-10',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => null,
            'client_id' => 'lead-12',
            'invoice_number' => 'FA-2026-1046',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-6',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Pravidelná údržba a kryštalizácia mramoru Q3',
            'description' => 'Kvartálna zmluvná údržba podláh v bytovom dome Apex Development.',
            'category_id' => 'cat-inc-serv',
            'category_path' => 'Pravidelný servis a údržba',
            'amount_planned' => 1800.00,
            'amount_real' => 1800.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-02',
            'due_date' => '2026-08-12',
            'paid_date' => '2026-08-02',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 1,
            'recurring_frequency' => 'monthly',
            'recurring_config' => json_encode(['type' => 'monthly_day', 'dayOfMonth' => 2]),
            'project_id' => null,
            'client_id' => 'lead-16',
            'invoice_number' => 'FA-2026-1047',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-inc-7',
            'type' => 'income',
            'subtype' => 'invoice',
            'title' => 'Kuchyňa Neolith Silvia Tóthová - Naplánovaná faktúra',
            'description' => 'Plánované vyúčtovanie po dokončení laserového zamerania.',
            'category_id' => 'cat-inc-proj-kitchen',
            'category_path' => 'Klientské zákazky a projekty > Kuchynské dosky a ostrovy',
            'amount_planned' => 5600.00,
            'amount_real' => 0.00,
            'currency' => 'EUR',
            'status' => 'planned',
            'issue_date' => '2026-09-01',
            'due_date' => '2026-09-20',
            'paid_date' => null,
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj2Id,
            'client_id' => 'lead-14',
            'invoice_number' => 'FA-2026-1048',
            'tax_rate' => 20
        ],

        // --- DIRECT EXPENSES (Linked to Projects) ---
        [
            'id' => 'demo-fin-exp-1',
            'type' => 'expense',
            'subtype' => 'vendor_bill',
            'title' => 'Dovoz porcelánových platní z Talianska (Fiorano)',
            'description' => '3x veľkoformátové platne 3200x1600mm pre projekt Vila Slavín.',
            'category_id' => 'cat-exp-mat-porc',
            'category_path' => 'Priamy materiál a dosky > Porcelánové a keramické platne',
            'amount_planned' => 4200.00,
            'amount_real' => 4200.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-04',
            'due_date' => '2026-08-14',
            'paid_date' => '2026-08-04',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'DF-2026-881',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-2',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Proliner 3D Laserové zameranie na stavbe Slavín',
            'description' => 'Presné digitálne zameranie nerovností fasády technikom.',
            'category_id' => 'cat-exp-sub-laser',
            'category_path' => 'Subdodávatelia a externé služby > 3D Laserové Proliner zameranie',
            'amount_planned' => 350.00,
            'amount_real' => 350.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-07',
            'due_date' => '2026-08-14',
            'paid_date' => '2026-08-07',
            'payment_method' => 'card',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'BL-2026-109',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-3',
            'type' => 'expense',
            'subtype' => 'vendor_bill',
            'title' => 'CNC Rezanie vodným lúčom a opracovanie otvorov',
            'description' => 'Výrezy na osvetlenie a kotviace prvky v platniach.',
            'category_id' => 'cat-exp-sub-waterjet',
            'category_path' => 'Subdodávatelia a externé služby > CNC Vodný lúč kooperácia',
            'amount_planned' => 1150.00,
            'amount_real' => 1150.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-12',
            'due_date' => '2026-08-22',
            'paid_date' => '2026-08-13',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'DF-2026-895',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-4',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Dvojzložkové epoxidové lepidlá Tenax a impregnácia',
            'description' => 'Špeciálna chémia odolná voči UV žiareniu.',
            'category_id' => 'cat-exp-mat-chem',
            'category_path' => 'Priamy materiál a dosky > Lepidlá, chémia a spotrebný materiál',
            'amount_planned' => 280.00,
            'amount_real' => 260.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-14',
            'due_date' => '2026-08-14',
            'paid_date' => '2026-08-14',
            'payment_method' => 'card',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'BL-2026-118',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-5',
            'type' => 'expense',
            'subtype' => 'vendor_bill',
            'title' => 'Mobilný žeriav a vykládka na 2. poschodie',
            'description' => 'Plánované nasadenie žeriavu pre montáž 2. etapy.',
            'category_id' => 'cat-exp-sub-crane',
            'category_path' => 'Subdodávatelia a externé služby > Žeriav a špeciálna doprava',
            'amount_planned' => 950.00,
            'amount_real' => 0.00,
            'currency' => 'EUR',
            'status' => 'planned',
            'issue_date' => '2026-08-28',
            'due_date' => '2026-09-05',
            'paid_date' => null,
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj1Id,
            'client_id' => 'lead-10',
            'invoice_number' => 'OBJ-2026-044',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-6',
            'type' => 'expense',
            'subtype' => 'vendor_bill',
            'title' => 'Neolith Calatorao doska 20mm + rezanie',
            'description' => 'Materiál na kuchyňu pre Silviu Tóthovú.',
            'category_id' => 'cat-exp-mat-porc',
            'category_path' => 'Priamy materiál a dosky > Porcelánové a keramické platne',
            'amount_planned' => 1950.00,
            'amount_real' => 0.00,
            'currency' => 'EUR',
            'status' => 'planned',
            'issue_date' => '2026-09-02',
            'due_date' => '2026-09-15',
            'paid_date' => null,
            'payment_method' => 'bank_transfer',
            'is_recurring' => 0,
            'project_id' => $proj2Id,
            'client_id' => 'lead-14',
            'invoice_number' => 'OBJ-2026-048',
            'tax_rate' => 20
        ],

        // --- GLOBAL OVERHEAD & RECURRING MOVEMENTS ---
        [
            'id' => 'demo-fin-exp-rec-1',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Nájomné - Showroom Bratislava & Výrobná dielňa',
            'description' => 'Mesačný fixný nájom priestorov centrály a dielne.',
            'category_id' => 'cat-exp-over-rent',
            'category_path' => 'Fixná réžia a priestory > Nájom showroom & dielňa',
            'amount_planned' => 3200.00,
            'amount_real' => 3200.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-01',
            'due_date' => '2026-08-05',
            'paid_date' => '2026-08-01',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 1,
            'recurring_frequency' => 'monthly',
            'recurring_config' => json_encode(['type' => 'monthly_day', 'dayOfMonth' => 1]),
            'project_id' => null,
            'client_id' => null,
            'invoice_number' => 'REC-NAJ-0826',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-rec-2',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Vysokonapäťová elektrina pre CNC stroje a kompresory',
            'description' => 'ZSE Energie mesačná zálohová platba.',
            'category_id' => 'cat-exp-over-util',
            'category_path' => 'Fixná réžia a priestory > Vysokonapäťová elektrina a plyn',
            'amount_planned' => 680.00,
            'amount_real' => 680.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-05',
            'due_date' => '2026-08-15',
            'paid_date' => '2026-08-05',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 1,
            'recurring_frequency' => 'monthly',
            'recurring_config' => json_encode(['type' => 'monthly_day', 'dayOfMonth' => 5]),
            'project_id' => null,
            'client_id' => null,
            'invoice_number' => 'REC-EN-0826',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-rec-3',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'CAD/CAM SolidWorks & AlphaCAM cloudové licencie',
            'description' => 'Mesačné predplatné 3D softvéru pre výrobu.',
            'category_id' => 'cat-exp-tools',
            'category_path' => 'Nástroje, software a licencie',
            'amount_planned' => 420.00,
            'amount_real' => 420.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-10',
            'due_date' => '2026-08-10',
            'paid_date' => '2026-08-10',
            'payment_method' => 'card',
            'is_recurring' => 1,
            'recurring_frequency' => 'monthly',
            'recurring_config' => json_encode(['type' => 'monthly_day', 'dayOfMonth' => 10]),
            'project_id' => null,
            'client_id' => null,
            'invoice_number' => 'SW-2026-AUG',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-rec-4',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Diamantové kotúče a dielenský spotrebný balík',
            'description' => 'Týždenné dopĺňanie ochranných pomôcok a brúsnych kotúčov.',
            'category_id' => 'cat-exp-tools',
            'category_path' => 'Nástroje, software a licencie',
            'amount_planned' => 190.00,
            'amount_real' => 190.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-08-17',
            'due_date' => '2026-08-17',
            'paid_date' => '2026-08-17',
            'payment_method' => 'card',
            'is_recurring' => 1,
            'recurring_frequency' => 'weekly',
            'recurring_config' => json_encode(['type' => 'weekly', 'dayOfWeek' => 1]),
            'project_id' => null,
            'client_id' => null,
            'invoice_number' => 'TYZ-2026-W33',
            'tax_rate' => 20
        ],
        [
            'id' => 'demo-fin-exp-rec-5',
            'type' => 'expense',
            'subtype' => 'other',
            'title' => 'Komplexné firemné a strojové poistenie Allianz',
            'description' => 'Ročná poistka na CNC stroje a poistenie zodpovednosti.',
            'category_id' => 'cat-exp-over-ins',
            'category_path' => 'Fixná réžia a priestory > Poistenie majetku a zodpovednosti',
            'amount_planned' => 2400.00,
            'amount_real' => 2400.00,
            'currency' => 'EUR',
            'status' => 'paid',
            'issue_date' => '2026-01-15',
            'due_date' => '2026-01-30',
            'paid_date' => '2026-01-20',
            'payment_method' => 'bank_transfer',
            'is_recurring' => 1,
            'recurring_frequency' => 'yearly',
            'recurring_config' => json_encode(['type' => 'yearly', 'month' => 1, 'day' => 15]),
            'project_id' => null,
            'client_id' => null,
            'invoice_number' => 'POIS-2026-ALL',
            'tax_rate' => 0
        ]
    ];

    $stmtRec = $pdo->prepare("INSERT INTO `financial_records` (
        `id`, `type`, `subtype`, `title`, `description`, `category_id`, `category_path`,
        `amount_planned`, `amount_real`, `currency`, `status`, `issue_date`, `due_date`,
        `paid_date`, `payment_method`, `is_recurring`, `recurring_frequency`, `recurring_config_json`,
        `project_id`, `client_id`, `invoice_number`, `tax_rate`, `created_by`, `created_at`, `updated_at`
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'Alex', NOW(), NOW()
    ) ON DUPLICATE KEY UPDATE
        `title`=VALUES(`title`), `amount_planned`=VALUES(`amount_planned`), `amount_real`=VALUES(`amount_real`),
        `status`=VALUES(`status`), `issue_date`=VALUES(`issue_date`), `due_date`=VALUES(`due_date`),
        `paid_date`=VALUES(`paid_date`), `project_id`=VALUES(`project_id`), `client_id`=VALUES(`client_id`),
        `category_id`=VALUES(`category_id`), `category_path`=VALUES(`category_path`), `updated_at`=NOW()");

    foreach ($records as $r) {
        $stmtRec->execute([
            $r['id'],
            $r['type'],
            $r['subtype'],
            $r['title'],
            $r['description'],
            $r['category_id'],
            $r['category_path'],
            $r['amount_planned'],
            $r['amount_real'],
            $r['currency'],
            $r['status'],
            $r['issue_date'],
            $r['due_date'],
            $r['paid_date'],
            $r['payment_method'],
            $r['is_recurring'],
            $r['recurring_frequency'] ?? null,
            $r['recurring_config'] ?? null,
            $r['project_id'],
            $r['client_id'],
            $r['invoice_number'],
            $r['tax_rate']
        ]);
    }

    $pdo->commit();
    echo "SUCCESS: Seeded " . count($categories) . " categories and " . count($records) . " financial records.\n";
} catch (\Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
