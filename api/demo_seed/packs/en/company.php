<?php
/**
 * Company pack, English (US) edition: Lapidea Stone Inc. - the cast every other pack points at by ref.
 *
 * Data only (see the contract in demo_seed/index.php). Same keys, list lengths and numbers
 * as packs/sk/company.php and packs/hu/company.php; only strings differ. US conventions (B11):
 * EIN instead of a VAT ID, sales tax modelled as the VAT field (8 %), phone numbers in the
 * reserved 555-01xx range, 'city' carries the state ('Denver, CO'). Amounts are EUR before
 * conversion (…Eur keys). Fictional contact data only (B12).
 */
return [
    'brand' => 'Lapidea',

    /*
     * Sidebar of the three logins: the modules sorted into labelled groups (a user preference,
     * see src/utils/sidebarLayout.ts). Items are sidebar item ids; custom dashboards are not
     * listed and land in the first group.
     */
    'sidebarGroups' => [
        ['id' => 'group_overview', 'title' => 'Overview', 'items' => ['dashboard', 'overview', 'tasks', 'time-tracking']],
        ['id' => 'group_sales', 'title' => 'Sales', 'items' => ['leads', 'clients', 'invoices', 'orders']],
        ['id' => 'group_operations', 'title' => 'Operations', 'items' => ['projects', 'tickets', 'warehouse', 'financial']],
        ['id' => 'group_communication', 'title' => 'Communication', 'items' => ['whatsapp', 'email', 'meetings', 'social_media']],
        ['id' => 'group_ai', 'title' => 'AI & Automation', 'items' => ['rag_ai', 'sai', 'automation']],
        ['id' => 'group_workspace', 'title' => 'Workspace', 'items' => ['employees', 'files', 'updates']],
    ],

    'company' => [
        'name' => 'Lapidea Stone Inc.',
        'subtitle' => 'Custom quartz, stone and sintered stone',
        'street' => '2150 Larimer St',
        'city' => 'Denver, CO',
        'postalCode' => '80205',
        'country' => 'United States',
        'companyId' => '84-2917365',
        'taxId' => '',
        'vatId' => '',
        'email' => 'info@lapidea.example',
        'phone' => '+1 303 555 0142',
        'phoneSecondary' => '+1 720 555 0142',
        'website' => 'https://lapidea.example',
        'iban' => '',
        'swift' => 'Routing 991000054',
        'bankName' => 'Front Range Bank',
    ],

    'billing' => [
        'paymentDueDays' => 14,
        'shippingMethods' => ['UPS', 'FedEx', 'USPS', 'Pickup at the showroom'],
        'paymentMethods' => ['Bank transfer (ACH)', 'Card payment', 'Cash on delivery'],
        'defaultPaymentMethod' => 'Bank transfer (ACH)',
        'warrantyText' => '10-year warranty on material, 5 years on fabrication and installation.',
        'durationText' => '3-4 weeks from sample approval',
        'startDateText' => 'Within 10 business days of the deposit',
        'nextSteps' => 'Accept the quote, pay the 40 % deposit and we will schedule the exact measuring visit.',
        'socialProof' => 'Our clients: {client:C6}, {client:C3}, {client:C1}',
        'usp' => [
            ['title' => 'Laser measuring', 'subtitle' => 'Accurate to the millimeter'],
            ['title' => 'In-house CNC workshop', 'subtitle' => 'Waterjet cutting and edge polishing on site'],
            ['title' => 'Installation included', 'subtitle' => 'Our own installation crew'],
            ['title' => '10-year warranty', 'subtitle' => 'On material and workmanship'],
        ],
    ],

    'divisions' => [
        ['name' => 'Lapidea Denver', 'color' => '#3b82f6'],
        ['name' => 'Lapidea Boulder', 'color' => '#8b5cf6'],
    ],

    // The three logins. Password "password" for all. 'role' is the system role.
    'users' => [
        'owner' => ['name' => 'Alex Morgan', 'first' => 'Alex', 'last' => 'Morgan', 'email' => 'alex.morgan@lapidea.example', 'role' => 'admin', 'color' => '#10b981', 'title' => 'Owner & managing director'],
        'pm' => ['name' => 'Samantha Reed', 'first' => 'Samantha', 'last' => 'Reed', 'email' => 'samantha.reed@lapidea.example', 'role' => 'project_manager', 'color' => '#6366f1', 'title' => 'Production & project manager'],
        'sales' => ['name' => 'Jordan Hayes', 'first' => 'Jordan', 'last' => 'Hayes', 'email' => 'jordan.hayes@lapidea.example', 'role' => 'project_manager', 'color' => '#f59e0b', 'title' => 'Showroom sales consultant'],
    ],

    // E1-E3 are the three logins ('user' = their role ref); E4-E6 have no login.
    // 'pin' is a Social Security number from the never-issued 9xx range (fictional).
    'employees' => [
        'E1' => ['name' => 'Alex Morgan', 'first' => 'Alex', 'last' => 'Morgan', 'user' => 'owner', 'email' => 'alex.morgan@lapidea.example', 'phone' => '+1 303 555 0101', 'title' => 'Owner & managing director', 'department' => 'Management', 'street' => '1450 Pearl Pkwy', 'city' => 'Denver, CO', 'zip' => '80203', 'country' => 'United States', 'pin' => '912-55-0101', 'salaryEur' => 4200],
        'E2' => ['name' => 'Samantha Reed', 'first' => 'Samantha', 'last' => 'Reed', 'user' => 'pm', 'email' => 'samantha.reed@lapidea.example', 'phone' => '+1 303 555 0102', 'title' => 'Production & project manager', 'department' => 'Production', 'street' => '820 Humboldt St', 'city' => 'Denver, CO', 'zip' => '80218', 'country' => 'United States', 'pin' => '912-55-0102', 'salaryEur' => 3100],
        'E3' => ['name' => 'Jordan Hayes', 'first' => 'Jordan', 'last' => 'Hayes', 'user' => 'sales', 'email' => 'jordan.hayes@lapidea.example', 'phone' => '+1 303 555 0103', 'title' => 'Showroom sales consultant', 'department' => 'Sales', 'street' => '2210 Blake St', 'city' => 'Denver, CO', 'zip' => '80205', 'country' => 'United States', 'pin' => '912-55-0103', 'salaryEur' => 2400],
        'E4' => ['name' => 'Mike Russo', 'first' => 'Mike', 'last' => 'Russo', 'user' => null, 'email' => 'mike.russo@lapidea.example', 'phone' => '+1 303 555 0104', 'title' => 'Installation crew lead', 'department' => 'Installation', 'street' => '640 Kalamath St', 'city' => 'Denver, CO', 'zip' => '80204', 'country' => 'United States', 'pin' => '912-55-0104', 'salaryEur' => 2300],
        'E5' => ['name' => 'Tyler Brooks', 'first' => 'Tyler', 'last' => 'Brooks', 'user' => null, 'email' => 'tyler.brooks@lapidea.example', 'phone' => '+1 303 555 0105', 'title' => 'CNC & waterjet operator', 'department' => 'Production', 'street' => '1175 Osage St', 'city' => 'Denver, CO', 'zip' => '80204', 'country' => 'United States', 'pin' => '912-55-0105', 'salaryEur' => 2100],
        'E6' => ['name' => 'Kate Collins', 'first' => 'Kate', 'last' => 'Collins', 'user' => null, 'email' => 'kate.collins@lapidea.example', 'phone' => '+1 303 555 0106', 'title' => 'Office & accounting', 'department' => 'Administration', 'street' => '3045 Zuni St', 'city' => 'Denver, CO', 'zip' => '80211', 'country' => 'United States', 'pin' => '912-55-0106', 'salaryEur' => 1900],
    ],

    // Clients C1-C6 (stage 'won') and leads L7-L11 (stage = the lead-state role of lookup.php).
    // 'type' is leads.client_type. 'name' is what the CRM shows, 'legalName' the invoicing entity,
    // 'short' how people say it in text, 'contact' the person (a private client: themselves).
    'clients' => [
        'C1' => ['name' => 'Highland Park Residences LLC', 'legalName' => 'Highland Park Residences LLC', 'short' => 'Highland Park', 'type' => 'business', 'stage' => 'won', 'contact' => 'Mark Fisher', 'email' => 'mark.fisher@highlandpark-residences.example', 'phone' => '+1 303 555 0201', 'street' => '1480 Wazee St', 'city' => 'Denver, CO', 'postalCode' => '80202', 'country' => 'United States', 'companyId' => '47-3015892', 'taxId' => '', 'vatId' => '', 'website' => 'https://highlandpark-residences.example', 'brief' => 'Facade cladding and lobby floor for a 12-villa residence', 'valueEur' => 24600, 'rating' => 5],
        'C2' => ['name' => 'Andrea Wilson', 'legalName' => 'Andrea Wilson', 'short' => 'Andrea', 'type' => 'person', 'stage' => 'won', 'contact' => 'Andrea Wilson', 'email' => 'andrea.wilson@mail.example', 'phone' => '+1 720 555 0202', 'street' => '1128 W Powers Ave', 'city' => 'Littleton, CO', 'postalCode' => '80120', 'country' => 'United States', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Kitchen worktop and backsplash in white quartz', 'valueEur' => 5900, 'rating' => 5],
        'C3' => ['name' => 'KitchenLine Studio Inc.', 'legalName' => 'KitchenLine Studio Inc.', 'short' => 'KitchenLine', 'type' => 'partner', 'stage' => 'won', 'contact' => 'Lucy Meyer', 'email' => 'lucy.meyer@kitchenline.example', 'phone' => '+1 303 555 0203', 'street' => '14200 E Alameda Ave', 'city' => 'Aurora, CO', 'postalCode' => '80012', 'country' => 'United States', 'companyId' => '82-1946037', 'taxId' => '', 'vatId' => '', 'website' => 'https://kitchenline.example', 'brief' => 'Framework deal: 8-10 kitchen worktops a month', 'valueEur' => 38000, 'rating' => 5],
        'C4' => ['_foreign' => true, 'name' => 'Maple & Stone Interiors Ltd.', 'legalName' => 'Maple & Stone Interiors Ltd.', 'short' => 'Maple & Stone', 'type' => 'business', 'stage' => 'won', 'contact' => 'Daniel Fraser', 'email' => 'daniel.fraser@maplestone.example', 'phone' => '+1 604 555 0204', 'street' => '1450 W Georgia St', 'city' => 'Vancouver, BC', 'postalCode' => 'V6G 2T7', 'country' => 'Canada', 'companyId' => 'BC1294738', 'taxId' => '817243995 RT0001', 'vatId' => '', 'website' => 'https://maplestone.example', 'brief' => 'Showroom tables and window sills in sintered stone', 'valueEur' => 17200, 'rating' => 4],
        'C5' => ['name' => 'Southside Property Management LLC', 'legalName' => 'Southside Property Management LLC', 'short' => 'Southside', 'type' => 'business', 'stage' => 'won', 'contact' => 'Dana Kuhn', 'email' => 'dana.kuhn@southside-pm.example', 'phone' => '+1 719 555 0205', 'street' => '2230 E Platte Ave', 'city' => 'Colorado Springs, CO', 'postalCode' => '80909', 'country' => 'United States', 'companyId' => '85-2231904', 'taxId' => '', 'vatId' => '', 'website' => 'https://southside-pm.example', 'brief' => 'Bathroom vanity tops for a series of apartment refurbishments', 'valueEur' => 21000, 'rating' => 4],
        'C6' => ['name' => 'Hotel Aurum', 'legalName' => 'Aurum Hospitality Inc.', 'short' => 'Hotel Aurum', 'type' => 'business', 'stage' => 'won', 'contact' => 'Beth Lucas', 'email' => 'beth.lucas@hotel-aurum.example', 'phone' => '+1 970 555 0206', 'street' => '420 E Hyman Ave', 'city' => 'Aspen, CO', 'postalCode' => '81611', 'country' => 'United States', 'companyId' => '83-4471206', 'taxId' => '', 'vatId' => '', 'website' => 'https://hotel-aurum.example', 'brief' => 'Reception desk, spa wall cladding and lobby floor; service contract', 'valueEur' => 46000, 'rating' => 5],
        'L7' => ['name' => 'Peter Collins', 'legalName' => 'Peter Collins', 'short' => 'Peter', 'type' => 'person', 'stage' => 'new', 'contact' => 'Peter Collins', 'email' => 'peter.collins@mail.example', 'phone' => '+1 720 555 0207', 'street' => '1180 Washington Ave', 'city' => 'Golden, CO', 'postalCode' => '80401', 'country' => 'United States', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Bathroom vanity and shower wall (web form)', 'valueEur' => 3200, 'rating' => 3],
        'L8' => ['name' => 'Eva Martinez', 'legalName' => 'Eva Martinez', 'short' => 'Eva', 'type' => 'person', 'stage' => 'contacted', 'contact' => 'Eva Martinez', 'email' => 'eva.martinez@mail.example', 'phone' => '+1 303 555 0208', 'street' => '9020 W Colfax Ave', 'city' => 'Lakewood, CO', 'postalCode' => '80215', 'country' => 'United States', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Terrace paving and outdoor kitchen counter', 'valueEur' => 7800, 'rating' => 4],
        'L9' => ['name' => 'Martina Novak', 'legalName' => 'Martina Novak', 'short' => 'Martina', 'type' => 'person', 'stage' => 'offer', 'contact' => 'Martina Novak', 'email' => 'martina.novak@mail.example', 'phone' => '+1 720 555 0209', 'street' => '7410 Ralston Rd', 'city' => 'Arvada, CO', 'postalCode' => '80002', 'country' => 'United States', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Kitchen worktop from the web form; question about the sink cutout', 'valueEur' => 8400, 'rating' => 4],
        'L10' => ['_foreign' => true, 'name' => 'Müller Architekten GmbH', 'legalName' => 'Müller Architekten GmbH', 'short' => 'Müller', 'type' => 'partner', 'stage' => 'offer', 'contact' => 'Thomas Müller', 'email' => 't.mueller@mueller-architekten.example', 'phone' => '+49 89 5550 0210', 'street' => 'Maximilianstraße 14', 'city' => 'München', 'postalCode' => '80539', 'country' => 'Germany', 'companyId' => 'HRB 241389', 'taxId' => '143/118/20713', 'vatId' => 'DE298416750', 'website' => 'https://mueller-architekten.example', 'brief' => 'Partnership for 6 villa projects a year', 'valueEur' => 45000, 'rating' => 3],
        'L11' => ['name' => 'Ryan Thompson', 'legalName' => 'Ryan Thompson', 'short' => 'Ryan', 'type' => 'person', 'stage' => 'lost', 'contact' => 'Ryan Thompson', 'email' => 'ryan.thompson@mail.example', 'phone' => '+1 303 555 0211', 'street' => '3450 S Broadway', 'city' => 'Englewood, CO', 'postalCode' => '80113', 'country' => 'United States', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Lost on price to a cheaper workshop', 'valueEur' => 2900, 'rating' => 2],
    ],

    'projects' => [
        'P1' => ['name' => 'Highland Park – facade & lobby', 'code' => 'LP-2026-01', 'client' => 'C1', 'valueEur' => 24600],
        'P2' => ['name' => 'Kitchen worktop – white quartz', 'code' => 'LP-2026-02', 'client' => 'C2', 'valueEur' => 5900],
        'P3' => ['name' => 'Hotel Aurum – reception & spa', 'code' => 'LP-2026-03', 'client' => 'C6', 'valueEur' => 46000],
        'P4' => ['name' => 'KitchenLine – framework 2026', 'code' => 'LP-2026-04', 'client' => 'C3', 'valueEur' => 38000],
        'P5' => ['name' => 'Apartment bathrooms – series 1', 'code' => 'LP-2026-05', 'client' => 'C5', 'valueEur' => 21000],
    ],

    // Prices and costs are EUR per unit before conversion (demo_money()).
    'items' => [
        'I1' => ['name' => 'Calacatta quartz slab 20 mm (Aurelia Quartz)', 'sku' => 'LP-AQ-001', 'category' => 'Slabs', 'unit' => 'm²', 'priceEur' => 185.0, 'costEur' => 95.0],
        'I2' => ['name' => 'Nero Marquina sintered stone 12 mm (Stratos)', 'sku' => 'LP-ST-002', 'category' => 'Slabs', 'unit' => 'm²', 'priceEur' => 210.0, 'costEur' => 110.0],
        'I3' => ['name' => 'Statuario porcelain slab 6 mm (Lumina)', 'sku' => 'LP-LU-003', 'category' => 'Slabs', 'unit' => 'm²', 'priceEur' => 140.0, 'costEur' => 72.0],
        'I4' => ['name' => 'Absolute Black granite 30 mm', 'sku' => 'LP-GR-004', 'category' => 'Slabs', 'unit' => 'm²', 'priceEur' => 240.0, 'costEur' => 130.0],
        'I5' => ['name' => 'Two-part stone adhesive Stonefix 5 kg', 'sku' => 'LP-SF-005', 'category' => 'Chemicals', 'unit' => 'pcs', 'priceEur' => 24.5, 'costEur' => 14.2],
        'I6' => ['name' => 'Penetrating sealer Stonefix Seal 1 l', 'sku' => 'LP-SS-006', 'category' => 'Chemicals', 'unit' => 'pcs', 'priceEur' => 42.0, 'costEur' => 22.8],
        'I7' => ['name' => 'Worktop care kit (cleaner + polish)', 'sku' => 'LP-CK-007', 'category' => 'E-shop', 'unit' => 'pcs', 'priceEur' => 29.9, 'costEur' => 12.4],
        'I8' => ['name' => 'Laser measuring visit', 'sku' => 'LP-SV-008', 'category' => 'Services', 'unit' => 'visit', 'priceEur' => 90.0, 'costEur' => 0.0],
    ],

    'suppliers' => [
        'S1' => ['_foreign' => true, 'name' => 'Marmi Fiorano S.p.A.', 'contact' => 'Giulia Bianchi', 'email' => 'ordini@marmi-fiorano.example', 'phone' => '+39 0536 555 0123', 'street' => 'Via Statale 45', 'city' => 'Fiorano Modenese', 'postalCode' => '41042', 'country' => 'Italy', 'companyId' => 'MO-348792', 'taxId' => '03487920364', 'vatId' => 'IT03487920364', 'website' => 'https://marmi-fiorano.example', 'iban' => 'IT60 X054 2811 1010 0000 0123 456', 'swift' => 'MRFOITMM', 'paymentDueDays' => 30],
        'S2' => ['name' => 'Rocky Mountain Slab Supply LLC', 'contact' => 'Ray Hall', 'email' => 'orders@rockymountain-slab.example', 'phone' => '+1 303 555 0231', 'street' => '4700 Brighton Blvd', 'city' => 'Denver, CO', 'postalCode' => '80216', 'country' => 'United States', 'companyId' => '84-6102945', 'taxId' => '', 'vatId' => '', 'website' => 'https://rockymountain-slab.example', 'iban' => '', 'swift' => 'Routing 991000106', 'paymentDueDays' => 21],
        'S3' => ['name' => 'BuildChem Supply Inc.', 'contact' => 'Susan Pace', 'email' => 'sales@buildchem-supply.example', 'phone' => '+1 719 555 0312', 'street' => '1810 Santa Fe Ave', 'city' => 'Pueblo, CO', 'postalCode' => '81003', 'country' => 'United States', 'companyId' => '86-7710253', 'taxId' => '', 'vatId' => '', 'website' => 'https://buildchem-supply.example', 'iban' => '', 'swift' => 'Routing 991000203', 'paymentDueDays' => 14],
    ],

    // 'owner' = the login who manages it (role ref).
    'warehouses' => [
        'W1' => ['name' => 'Main warehouse – Denver', 'code' => 'WH-DEN-01', 'address' => '2150 Larimer St, Denver, CO 80205', 'owner' => 'pm'],
        'W2' => ['name' => 'Boulder showroom stock', 'code' => 'WH-BOU-01', 'address' => '1840 Pearl St, Boulder, CO 80302', 'owner' => 'pm'],
    ],
];
