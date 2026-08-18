<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../api/schema.php';

$pdo = get_db_connection();
ccrm_apply_schema($pdo);

echo "Seeding Demo Warehouse Data...\n";

// 1. Seed Warehouses
$warehouses = [
    [
        'id' => 'wh-1',
        'name' => 'Hlavný sklad Bratislava',
        'code' => 'WH-BA-01',
        'address' => 'Vajnorská 142, 831 04 Bratislava',
        'manager_user_id' => 'u-9da1ba93ba1855def53d195377e68539', // Erik
        'is_default' => 1
    ],
    [
        'id' => 'wh-2',
        'name' => 'Výrobný sklad Trnava',
        'code' => 'WH-TT-01',
        'address' => 'Zavarská 11, 917 01 Trnava',
        'manager_user_id' => 'u-d2deb4749a37d0c8eee5c8f062926de7', // Roli
        'is_default' => 0
    ]
];

$insWh = $pdo->prepare("INSERT INTO `warehouses` (`id`, `name`, `code`, `address`, `manager_user_id`, `is_default`) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `code` = VALUES(`code`), `address` = VALUES(`address`), `manager_user_id` = VALUES(`manager_user_id`), `is_default` = VALUES(`is_default`)");

foreach ($warehouses as $w) {
    $insWh->execute([$w['id'], $w['name'], $w['code'], $w['address'], $w['manager_user_id'], $w['is_default']]);
}

// 2. Seed Suppliers
$suppliers = [
    [
        'id' => 'sup-1',
        'name' => 'Laminam Slovakia s.r.o.',
        'company_id' => '48123456',
        'tax_id' => '2120123456',
        'vat_id' => 'SK2120123456',
        'street' => 'Prievozská 4D',
        'city' => 'Bratislava',
        'postal_code' => '821 09',
        'country' => 'Slovakia',
        'email' => 'objednavky@laminam.sk',
        'phone' => '+421 905 111 222',
        'website' => 'https://laminam.sk',
        'iban' => 'SK8902000000001234567890',
        'swift' => 'SUBA SK BX',
        'payment_due_days' => 14,
        'notes' => 'Oficiálny distribútor veľkoformátových keramických a quartzových dosiek.',
        'contacts_json' => json_encode([
            ['name' => 'Peter Kováč', 'position' => 'Obchodný riaditeľ', 'phone' => '+421 905 111 222', 'email' => 'kovac@laminam.sk'],
            ['name' => 'Lucia Vargová', 'position' => 'Zákaznícky servis', 'phone' => '+421 905 111 223', 'email' => 'vargova@laminam.sk']
        ])
    ],
    [
        'id' => 'sup-2',
        'name' => 'Stone Import Verona S.r.l.',
        'company_id' => 'IT0987654321',
        'tax_id' => 'IT0987654321',
        'vat_id' => 'IT0987654321',
        'street' => 'Via del Marmo 45',
        'city' => 'Verona',
        'postal_code' => '37135',
        'country' => 'Italy',
        'email' => 'export@stoneverona.it',
        'phone' => '+39 045 889 900',
        'website' => 'https://stoneverona.it',
        'iban' => 'IT60X0542811101000000123456',
        'swift' => 'UNCRITM1VER',
        'payment_due_days' => 30,
        'notes' => 'Dodávateľ prírodného mramoru, žuly a kvarcitu priamo z talianskych lomov.',
        'contacts_json' => json_encode([
            ['name' => 'Marco Rossi', 'position' => 'Export Area Manager', 'phone' => '+39 340 123 4567', 'email' => 'm.rossi@stoneverona.it']
        ])
    ],
    [
        'id' => 'sup-3',
        'name' => 'Mapei Slovensko s.r.o.',
        'company_id' => '35890123',
        'tax_id' => '2021890123',
        'vat_id' => 'SK2021890123',
        'street' => 'Nádražná 39',
        'city' => 'Ivanka pri Dunaji',
        'postal_code' => '900 28',
        'country' => 'Slovakia',
        'email' => 'predaj@mapei.sk',
        'phone' => '+421 2 4020 4511',
        'website' => 'https://mapei.sk',
        'iban' => 'SK1211000000002621234567',
        'swift' => 'TATR SK BX',
        'payment_due_days' => 14,
        'notes' => 'Špičková stavebná chémia, lepidlá triedy S1/S2 a škárovacie hmoty.',
        'contacts_json' => json_encode([
            ['name' => 'Ing. Ján Novotný', 'position' => 'Technický zástupca', 'phone' => '+421 911 333 444', 'email' => 'j.novotny@mapei.sk']
        ])
    ]
];

$insSup = $pdo->prepare("INSERT INTO `suppliers` (`id`, `name`, `company_id`, `tax_id`, `vat_id`, `street`, `city`, `postal_code`, `country`, `email`, `phone`, `website`, `iban`, `swift`, `payment_due_days`, `notes`, `contacts_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `company_id` = VALUES(`company_id`), `tax_id` = VALUES(`tax_id`), `vat_id` = VALUES(`vat_id`), `street` = VALUES(`street`), `city` = VALUES(`city`), `postal_code` = VALUES(`postal_code`), `country` = VALUES(`country`), `email` = VALUES(`email`), `phone` = VALUES(`phone`), `website` = VALUES(`website`), `iban` = VALUES(`iban`), `swift` = VALUES(`swift`), `payment_due_days` = VALUES(`payment_due_days`), `notes` = VALUES(`notes`), `contacts_json` = VALUES(`contacts_json`)");

foreach ($suppliers as $s) {
    $insSup->execute([$s['id'], $s['name'], $s['company_id'], $s['tax_id'], $s['vat_id'], $s['street'], $s['city'], $s['postal_code'], $s['country'], $s['email'], $s['phone'], $s['website'], $s['iban'], $s['swift'], $s['payment_due_days'], $s['notes'], $s['contacts_json']]);
}

// 3. Seed Items
$items = [
    [
        'id' => 'item-1',
        'sku' => 'SKU-CQ-01',
        'barcode' => '858800123401',
        'name' => 'Calacatta Gold Quartz doska 20mm',
        'description' => 'Prémiový technický kameň so zlatistým žilkovaním, lesklý povrch, formát 3200x1600mm.',
        'category' => 'Veľkoformátové dosky',
        'unit' => 'm²',
        'min_stock' => 20.00,
        'optimal_stock' => 80.00,
        'default_location' => 'A-01-RACK',
        'has_expiration' => 0,
        'image_url' => 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&h=300&fit=crop',
        'default_sell_price' => 185.00,
        'avg_purchase_price' => 95.0000,
        'last_purchase_price' => 95.00
    ],
    [
        'id' => 'item-2',
        'sku' => 'SKU-NM-02',
        'barcode' => '858800123402',
        'name' => 'Nero Marquina mramor doska 30mm',
        'description' => 'Čierny španielsky mramor s výraznými bielymi žilami, leštený.',
        'category' => 'Prírodný kameň',
        'unit' => 'm²',
        'min_stock' => 15.00,
        'optimal_stock' => 50.00,
        'default_location' => 'A-03-RACK',
        'has_expiration' => 0,
        'image_url' => 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?w=300&h=300&fit=crop',
        'default_sell_price' => 210.00,
        'avg_purchase_price' => 110.0000,
        'last_purchase_price' => 110.00
    ],
    [
        'id' => 'item-3',
        'sku' => 'SKU-PQ-03',
        'barcode' => '858800123403',
        'name' => 'Patagonia Quartzite doska 20mm',
        'description' => 'Exkluzívny translucentný brazílsky kvarcit s kryštálmi živca a kremeňa.',
        'category' => 'Prírodný kameň',
        'unit' => 'm²',
        'min_stock' => 10.00,
        'optimal_stock' => 30.00,
        'default_location' => 'A-05-RACK',
        'has_expiration' => 0,
        'image_url' => 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=300&h=300&fit=crop',
        'default_sell_price' => 340.00,
        'avg_purchase_price' => 190.0000,
        'last_purchase_price' => 190.00
    ],
    [
        'id' => 'item-4',
        'sku' => 'SKU-MAP-04',
        'barcode' => '858800123404',
        'name' => 'Keraflex Maxi S1 cementové lepidlo 25kg',
        'description' => 'Deformovateľné cementové lepidlo so zníženým vertikálnym sklzom a predĺženou dobou zavädnutia na kamenné dosky.',
        'category' => 'Stavebná chémia',
        'unit' => 'balenie',
        'min_stock' => 30.00,
        'optimal_stock' => 100.00,
        'default_location' => 'CHEM-PAL-02',
        'has_expiration' => 1,
        'image_url' => 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&h=300&fit=crop',
        'default_sell_price' => 24.50,
        'avg_purchase_price' => 14.2000,
        'last_purchase_price' => 14.20
    ],
    [
        'id' => 'item-5',
        'sku' => 'SKU-TNX-05',
        'barcode' => '858800123405',
        'name' => 'Tenax Ager impregnácia a zvýrazňovač farby 1L',
        'description' => 'Vysokoúčinná impregnácia s mokrým efektom pre zvýraznenie štruktúry lešteného a matného kameňa.',
        'category' => 'Ošetrenie a údržba',
        'unit' => 'ks',
        'min_stock' => 10.00,
        'optimal_stock' => 40.00,
        'default_location' => 'CHEM-SHELF-01',
        'has_expiration' => 1,
        'image_url' => 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&h=300&fit=crop',
        'default_sell_price' => 42.00,
        'avg_purchase_price' => 22.8000,
        'last_purchase_price' => 22.80
    ]
];

$insItem = $pdo->prepare("INSERT INTO `warehouse_items` (`id`, `sku`, `barcode`, `name`, `description`, `category`, `unit`, `min_stock`, `optimal_stock`, `default_location`, `has_expiration`, `image_url`, `default_sell_price`, `avg_purchase_price`, `last_purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `sku` = VALUES(`sku`), `barcode` = VALUES(`barcode`), `name` = VALUES(`name`), `description` = VALUES(`description`), `category` = VALUES(`category`), `unit` = VALUES(`unit`), `min_stock` = VALUES(`min_stock`), `optimal_stock` = VALUES(`optimal_stock`), `default_location` = VALUES(`default_location`), `has_expiration` = VALUES(`has_expiration`), `image_url` = VALUES(`image_url`), `default_sell_price` = VALUES(`default_sell_price`), `avg_purchase_price` = VALUES(`avg_purchase_price`), `last_purchase_price` = VALUES(`last_purchase_price`)");

foreach ($items as $it) {
    $insItem->execute([$it['id'], $it['sku'], $it['barcode'], $it['name'], $it['description'], $it['category'], $it['unit'], $it['min_stock'], $it['optimal_stock'], $it['default_location'], $it['has_expiration'], $it['image_url'], $it['default_sell_price'], $it['avg_purchase_price'], $it['last_purchase_price']]);
}

// 4. Seed Stock
$stock = [
    ['warehouse_id' => 'wh-1', 'item_id' => 'item-1', 'quantity' => 45.00, 'reserved_quantity' => 12.00, 'location' => 'A-01-RACK'],
    ['warehouse_id' => 'wh-1', 'item_id' => 'item-2', 'quantity' => 28.00, 'reserved_quantity' => 0.00, 'location' => 'A-03-RACK'],
    ['warehouse_id' => 'wh-1', 'item_id' => 'item-4', 'quantity' => 65.00, 'reserved_quantity' => 10.00, 'location' => 'CHEM-PAL-02'],
    ['warehouse_id' => 'wh-1', 'item_id' => 'item-5', 'quantity' => 18.00, 'reserved_quantity' => 0.00, 'location' => 'CHEM-SHELF-01'],
    ['warehouse_id' => 'wh-2', 'item_id' => 'item-3', 'quantity' => 16.00, 'reserved_quantity' => 0.00, 'location' => 'TT-RACK-01'],
    ['warehouse_id' => 'wh-2', 'item_id' => 'item-4', 'quantity' => 20.00, 'reserved_quantity' => 0.00, 'location' => 'TT-CHEM-01']
];

$insStock = $pdo->prepare("INSERT INTO `warehouse_stock` (`warehouse_id`, `item_id`, `quantity`, `reserved_quantity`, `location`) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`), `reserved_quantity` = VALUES(`reserved_quantity`), `location` = VALUES(`location`)");

foreach ($stock as $st) {
    $insStock->execute([$st['warehouse_id'], $st['item_id'], $st['quantity'], $st['reserved_quantity'], $st['location']]);
}

// 5. Seed Batches & Expirations
$batches = [
    [
        'id' => 'bat-1',
        'item_id' => 'item-4',
        'warehouse_id' => 'wh-1',
        'batch_number' => 'BAT-2026-001',
        'expiration_date' => '2026-11-30',
        'initial_quantity' => 40.00,
        'current_quantity' => 40.00,
        'purchase_price' => 14.20
    ],
    [
        'id' => 'bat-2',
        'item_id' => 'item-4',
        'warehouse_id' => 'wh-1',
        'batch_number' => 'BAT-2025-089',
        'expiration_date' => '2026-09-05', // Expiring in ~2.5 weeks
        'initial_quantity' => 30.00,
        'current_quantity' => 25.00,
        'purchase_price' => 13.80
    ],
    [
        'id' => 'bat-3',
        'item_id' => 'item-5',
        'warehouse_id' => 'wh-1',
        'batch_number' => 'BAT-2026-TX1',
        'expiration_date' => '2027-06-15',
        'initial_quantity' => 20.00,
        'current_quantity' => 18.00,
        'purchase_price' => 22.80
    ]
];

$insBatch = $pdo->prepare("INSERT INTO `warehouse_batches` (`id`, `item_id`, `warehouse_id`, `batch_number`, `expiration_date`, `initial_quantity`, `current_quantity`, `purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `item_id` = VALUES(`item_id`), `warehouse_id` = VALUES(`warehouse_id`), `batch_number` = VALUES(`batch_number`), `expiration_date` = VALUES(`expiration_date`), `initial_quantity` = VALUES(`initial_quantity`), `current_quantity` = VALUES(`current_quantity`), `purchase_price` = VALUES(`purchase_price`)");

foreach ($batches as $b) {
    $insBatch->execute([$b['id'], $b['item_id'], $b['warehouse_id'], $b['batch_number'], $b['expiration_date'], $b['initial_quantity'], $b['current_quantity'], $b['purchase_price']]);
}

// 6. Seed Movements
$movements = [
    [
        'id' => 'mov-1',
        'document_number' => 'PRI-2026-0001',
        'type' => 'inward',
        'status' => 'confirmed',
        'warehouse_id' => 'wh-1',
        'target_warehouse_id' => null,
        'supplier_id' => 'sup-1',
        'lead_id' => null,
        'total_cost_value' => 4275.00,
        'total_sell_value' => 8325.00,
        'total_profit_value' => 4050.00,
        'created_by' => 'erik@crm.com',
        'note' => 'Príjem dodávky Calacatta Gold dosiek od Laminam SK podľa fa FA260012.',
        'file_name' => 'dodaci_list_laminam_001.pdf',
        'file_path' => null,
        'issued_at' => '2026-08-01 09:30:00',
        'items' => [
            [
                'id' => 'mvi-1',
                'item_id' => 'item-1',
                'batch_id' => null,
                'quantity' => 45.00,
                'unit_purchase_price' => 95.00,
                'unit_sell_price' => 185.00,
                'total_price' => 4275.00,
                'expiration_date' => null,
                'note' => 'Dosky v bezchybnom stave, skontrolované opticky.'
            ]
        ]
    ],
    [
        'id' => 'mov-2',
        'document_number' => 'PRI-2026-0002',
        'type' => 'inward',
        'status' => 'confirmed',
        'warehouse_id' => 'wh-1',
        'target_warehouse_id' => null,
        'supplier_id' => 'sup-3',
        'lead_id' => null,
        'total_cost_value' => 923.00,
        'total_sell_value' => 1592.50,
        'total_profit_value' => 669.50,
        'created_by' => 'erik@crm.com',
        'note' => 'Príjem palety Keraflex Maxi S1 z Mapei Ivanka.',
        'file_name' => 'dl_mapei_9812.pdf',
        'file_path' => null,
        'issued_at' => '2026-08-05 14:15:00',
        'items' => [
            [
                'id' => 'mvi-2',
                'item_id' => 'item-4',
                'batch_id' => 'bat-1',
                'quantity' => 65.00,
                'unit_purchase_price' => 14.20,
                'unit_sell_price' => 24.50,
                'total_price' => 923.00,
                'expiration_date' => '2026-11-30',
                'note' => 'Paleta 1/1, šarža BAT-2026-001.'
            ]
        ]
    ],
    [
        'id' => 'mov-3',
        'document_number' => 'VYD-2026-0001',
        'type' => 'outward',
        'status' => 'confirmed',
        'warehouse_id' => 'wh-1',
        'target_warehouse_id' => null,
        'supplier_id' => null,
        'lead_id' => 'lead-1', // Peter Kováč
        'total_cost_value' => 1140.00,
        'total_sell_value' => 2220.00,
        'total_profit_value' => 1080.00,
        'created_by' => 'erik@crm.com',
        'note' => 'Výdaj materiálu na zákazku kuchynskej dosky pre klienta Peter Kováč.',
        'file_name' => null,
        'file_path' => null,
        'issued_at' => '2026-08-10 11:00:00',
        'items' => [
            [
                'id' => 'mvi-3',
                'item_id' => 'item-1',
                'batch_id' => null,
                'quantity' => 12.00,
                'unit_purchase_price' => 95.00,
                'unit_sell_price' => 185.00,
                'total_price' => 2220.00,
                'expiration_date' => null,
                'note' => 'Vydané do výroby na CNC pílu.'
            ]
        ]
    ]
];

$insMov = $pdo->prepare("INSERT INTO `warehouse_movements` (`id`, `document_number`, `type`, `status`, `warehouse_id`, `target_warehouse_id`, `supplier_id`, `lead_id`, `total_cost_value`, `total_sell_value`, `total_profit_value`, `created_by`, `note`, `file_name`, `file_path`, `issued_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `document_number` = VALUES(`document_number`), `type` = VALUES(`type`), `status` = VALUES(`status`), `warehouse_id` = VALUES(`warehouse_id`), `target_warehouse_id` = VALUES(`target_warehouse_id`), `supplier_id` = VALUES(`supplier_id`), `lead_id` = VALUES(`lead_id`), `total_cost_value` = VALUES(`total_cost_value`), `total_sell_value` = VALUES(`total_sell_value`), `total_profit_value` = VALUES(`total_profit_value`), `created_by` = VALUES(`created_by`), `note` = VALUES(`note`), `file_name` = VALUES(`file_name`), `file_path` = VALUES(`file_path`), `issued_at` = VALUES(`issued_at`)");

$insMovItem = $pdo->prepare("INSERT INTO `warehouse_movement_items` (`id`, `movement_id`, `item_id`, `batch_id`, `quantity`, `unit_purchase_price`, `unit_sell_price`, `total_price`, `expiration_date`, `note`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `quantity` = VALUES(`quantity`), `unit_purchase_price` = VALUES(`unit_purchase_price`), `unit_sell_price` = VALUES(`unit_sell_price`), `total_price` = VALUES(`total_price`), `expiration_date` = VALUES(`expiration_date`), `note` = VALUES(`note`)");

foreach ($movements as $m) {
    $insMov->execute([$m['id'], $m['document_number'], $m['type'], $m['status'], $m['warehouse_id'], $m['target_warehouse_id'], $m['supplier_id'], $m['lead_id'], $m['total_cost_value'], $m['total_sell_value'], $m['total_profit_value'], $m['created_by'], $m['note'], $m['file_name'], $m['file_path'], $m['issued_at']]);

    foreach ($m['items'] as $it) {
        $insMovItem->execute([$it['id'], $m['id'], $it['item_id'], $it['batch_id'], $it['quantity'], $it['unit_purchase_price'], $it['unit_sell_price'], $it['total_price'], $it['expiration_date'], $it['note']]);
    }
}

echo "Successfully seeded Demo Warehouse Data!\n";
