<?php
/**
 * Installation wizard endpoint.
 *
 * Hardening vs. the original:
 *  - Same-origin only (no wildcard CORS).
 *  - Refuses to run once the CRM is already installed, so it can no longer be
 *    used by an anonymous caller to overwrite config.php / re-provision the DB.
 *  - `type: "test_only"` ONLY tests the connection — it never writes config.php
 *    or seeds data.
 *  - All seeded/admin passwords are stored as bcrypt hashes.
 *  - Schema comes from the shared schema.php (single source of truth).
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json');
ccrm_send_cors('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

$configFile = dirname(__DIR__) . '/config.php';

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON input']);
    exit;
}

$host        = trim((string)($data['host'] ?? ''));
$port        = trim((string)($data['port'] ?? '3306'));
$dbname      = trim((string)($data['dbname'] ?? ''));
$user        = trim((string)($data['user'] ?? ''));
$pass        = (string)($data['pass'] ?? '');
$installType = $data['type'] ?? 'fresh'; // 'fresh' | 'demo' | 'test_only'
$systemLanguage = $data['systemLanguage'] ?? 'sk';
if (!in_array($systemLanguage, ['en', 'sk', 'hu'], true)) { $systemLanguage = 'sk'; }

if (empty($host) || empty($dbname) || empty($user)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required connection specifications']);
    exit;
}

// Once installed, the wizard is closed. Reconfiguration must be done by editing
// config.php on the server — an anonymous request can no longer overwrite it.
//
// `test_only` was exempt from this, which left an unauthenticated endpoint on
// every installed instance that opens a MySQL connection to any host:port the
// caller names — a network probe into whatever the server can reach, and an
// oracle for guessing database credentials. It is still allowed before install
// (the wizard needs it) and for admins afterwards.
$isInstalled = file_exists($configFile) && @filesize($configFile) > 100;
if ($isInstalled) {
    if ($installType !== 'test_only') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'CRM is already installed. Setup is disabled.']);
        exit;
    }
    require_once $configFile;
    ccrm_require_admin();
}

// 1. Attempt connection test via PDO
try {
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    error_log('[ccrm setup] DB connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed. Check the host, database name and credentials.']);
    exit;
}

// A connection test stops here without touching the filesystem or the database.
if ($installType === 'test_only') {
    echo json_encode(['success' => true, 'message' => 'Connection OK']);
    exit;
}

// 2. Prepare credentials for config.php (will be written upon successful migration and seeding)
$configContent = "<?php
// Database credentials file
// Automatically created by the CCRM Installation Wizard

date_default_timezone_set('Europe/Bratislava');

define('DB_HOST', " . var_export($host, true) . ");
define('DB_PORT', " . var_export($port, true) . ");
define('DB_NAME', " . var_export($dbname, true) . ");
define('DB_USER', " . var_export($user, true) . ");
define('DB_PASS', " . var_export($pass, true) . ");

// Symmetric key for encrypting integration/mailbox secrets at rest.
// Generated once at install; keep it secret and out of the database.
define('CCRM_SECRET_KEY', " . var_export(bin2hex(random_bytes(32)), true) . ");

try {
    \$dsn = \"mysql:host=\" . DB_HOST . \";port=\" . DB_PORT . \";dbname=\" . DB_NAME . \";charset=utf8mb4\";
    \$options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    \$pdo = new PDO(\$dsn, DB_USER, DB_PASS, \$options);
} catch (\\PDOException \$e) {
    \$pdo = null;
    \$db_connection_error = \$e->getMessage();
}

function get_db_connection() {
    global \$pdo, \$db_connection_error;
    if (\$pdo === null) {
        throw new \\Exception(\"Database connection failed: \" . (\$db_connection_error ?? \"Unknown error\"));
    }
    return \$pdo;
}
";


// 3. Apply schema (single source of truth) and seed.
try {
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    $tables = ['meeting_tasks', 'meeting_notes', 'plugins', 'system_settings', 'task_assignees', 'tasks', 'timeline_events', 'lead_categories', 'leads', 'role_permissions', 'permissions', 'users'];
    foreach ($tables as $table) {
        $pdo->exec("DROP TABLE IF EXISTS `$table` CASCADE");
    }
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

    ccrm_apply_schema($pdo);
} catch (\Exception $e) {
    error_log('[ccrm setup] Schema migration failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Schema migration failed.']);
    exit;
}

try {
    $pdo->beginTransaction();

    // Seed Permissions slugs
    $permissionsSlugs = [
        ['leads.view', 'View leads and pipeline data'],
        ['leads.create', 'Create new leads'],
        ['leads.edit', 'Modify existing leads details'],
        ['tasks.view', 'Inspect tasks board'],
        ['tasks.create', 'Create new checklist tasks'],
        ['tasks.edit', 'Modify tasks assignees and statuses'],
        ['tasks.delete', 'Permanently delete task records'],
        ['tasks.view_all', 'See the whole team workload in Global Tasks (on unless revoked)'],
        ['timeline.log', 'Log custom timeline phone calls, emails, and notes'],
        ['calendar.view', 'Access appointment calendar slots'],
        ['calendar.create', 'Create bookings'],
        ['calendar.edit', 'Adjust calendar configurations'],
        ['time_records.log', 'Log work stopwatch sessions'],
        ['newsletter.view', 'Inspect email campaigns list'],
        ['newsletter.edit', 'Create/edit email newsletter campaigns'],
        ['hr.view', 'View employee records list'],
        ['files.view', 'Browse files database'],
        ['files.create', 'Upload contract proposals'],
        ['general_config', 'Configure system name and languages'],
        ['pm_managers', 'Manage PM manager users directories'],
        ['pipeline_stages', 'Rearrange Kanban pipelines stages'],
        ['traffic_sources', 'Manage lead marketing sources and color badges'],
        ['ai_config', 'Configure OpenAI API credentials and settings'],
        ['system_reset', 'Truncate database or restore mock seeders'],
        ['nav_edit', 'Configure navigation sidebar layouts and visibility'],
    ];

    $checkPerm = $pdo->query("SELECT COUNT(*) FROM `permissions`")->fetchColumn();
    if ($checkPerm == 0) {
        $insPerm = $pdo->prepare("INSERT INTO `permissions` (`slug`, `description`) VALUES (?, ?)");
        foreach ($permissionsSlugs as $p) {
            $insPerm->execute($p);
        }
    }

    // Pipeline stages, lead categories and task states are persisted values, so
    // seed them in the language chosen (see ccrm_default_lists in schema.php).
    $defaultLists = ccrm_default_lists($systemLanguage);
    $leadStates = $defaultLists['leadStates'];
    $leadCategories = $defaultLists['leadCategories'];

    $baseSettings = ccrm_default_settings_for_language($systemLanguage);

    $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");

    // User ids use the same deterministic scheme as sync.php so that later
    // syncs from the client update (rather than duplicate or orphan) these rows.
    $userId = static function (string $email): string {
        return 'u-' . md5(strtolower(trim($email)));
    };

    $insUser = $pdo->prepare("INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `role`=VALUES(`role`)");

    if ($installType === 'demo') {
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'true']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        // Demo accounts (password: "password"), stored hashed.
        $demoUsers = [
            ['Alex', 'alex@crm.com', 'password', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop', '#10b981'],
            ['Sam', 'sam@crm.com', 'password', 'project_manager', null, '#6366f1'],
            ['Jordan', 'jordan@crm.com', 'password', 'project_manager', null, '#f59e0b'],
        ];
        foreach ($demoUsers as $u) {
            $insUser->execute([$userId($u[1]), $u[0], $u[1], password_hash($u[2], PASSWORD_DEFAULT), $u[3], $u[4], $u[5]]);
        }

        // Demo copy follows the installation language too — a Slovak demo that
        // opens on English sample records looks like a broken translation.
        $demoTextByLanguage = [
            'en' => [
                'ev1_title' => 'Discovery Call Logged',
                'ev1_body' => 'Discussed interior stone cladding options for the main showroom. Client is highly interested in thin porcelain slate slabs.',
                'ev2_title' => 'Sent Digital Catalog & Pricing',
                'ev2_body' => 'Emailed complete porcelain slate stone catalog and basic thickness pricing guidelines.',
                'ev3_title' => 'Showroom Meeting Bratislava',
                'ev3_body' => 'Met at our main showroom. Selected grey marble slab variants. Sam compiled official technical logistics requirements.',
                'ev4_title' => 'Official Price Offer Sent',
                'ev4_body' => 'Drafted and emailed formal budget quote detailing complete slabs cutting & assembly pricing.',
                'ev5_subject' => 'Kitchen countertop drawings + sink cutout',
                'ev5_body' => "Hello Jordan,\n\nthank you for the showroom visit last week. I am attaching the kitchen drawings from our architect — the worktop is 2.4 m long and 60 cm deep, with a 20 cm overhang above the dishwasher.\n\nThere are three things I would like to confirm before we go ahead:\n\n1. The sink is an undermount Blanco 500x400 mm, so the cutout has to be polished on all four sides.\n2. We would like the same stone for the 60 cm backsplash, in 12 mm thickness.\n3. Is a 4 cm mitred edge possible on the front side, or does it change the price significantly?\n\nDelivery would ideally fall in the second half of June — the kitchen units are being installed on 14 June.\n\nThank you and have a nice day,\nMartina Kováčová",
                'ev6_subject' => 'RE: Kitchen countertop drawings + sink cutout',
                'ev6_body' => "Hello Mrs. Kováčová,\n\nthank you for the drawings, everything is clear.\n\n1. The undermount cutout including the polishing of all four edges is part of the standard fabrication price, no surcharge.\n2. The 60 cm backsplash in 12 mm is no problem — I have added it to the quote as a separate item.\n3. The 4 cm mitred edge is possible; it adds roughly 180 EUR to the total because of the extra cutting and gluing.\n\nThe revised quote is attached. If you confirm it by Friday, we can book the laser measurement for 2 June and deliver in the week of 15 June, so you would be on time for the kitchen units.\n\nBest regards,\nJordan",
                'ev7_message' => 'Good afternoon, we are renovating the kitchen of a family house in Trnava. I would need a price for a 2.4 x 0.6 m worktop in white quartz, including the sink cutout and a matching backsplash. Please send the estimate by e-mail, I am reachable in the afternoons.',
                'task1_title' => 'Draft SLA contract for wholesale partner',
                'task1_body' => 'Prepare standard wholesale SLA layout including slab delivery timelines.',
                'task2_title' => 'Onsite laser measurement for kitchen countertop',
                'task2_body' => 'Visit the property in Trnava to take precise Proliner measurements for Calacatta Quartz.',
                'task3_title' => 'Slab delivery coordination from Italy',
                'task3_body' => 'Coordinate with logistics for the 12mm thickness slabs arriving from Fiorano Modenese.',
            ],
            'sk' => [
                'ev1_title' => 'Zaznamenaný úvodný hovor',
                'ev1_body' => 'Prebrali sme možnosti interiérového kamenného obkladu pre hlavný showroom. Klient má veľký záujem o tenké porcelánové bridlicové dosky.',
                'ev2_title' => 'Odoslaný digitálny katalóg a cenník',
                'ev2_body' => 'E-mailom sme poslali kompletný katalóg porcelánového kameňa a základný cenník podľa hrúbky.',
                'ev3_title' => 'Stretnutie v showroome Bratislava',
                'ev3_body' => 'Stretli sme sa v našom hlavnom showroome. Klient si vybral sivé mramorové dosky. Sam spísal technické a logistické požiadavky.',
                'ev4_title' => 'Odoslaná oficiálna cenová ponuka',
                'ev4_body' => 'Pripravili a e-mailom odoslali formálnu cenovú ponuku vrátane rezania a montáže dosiek.',
                'ev5_subject' => 'Nákresy kuchynskej dosky + výrez na drez',
                'ev5_body' => "Dobrý deň Jordan,\n\nďakujem za návštevu showroomu minulý týždeň. Posielam v prílohe nákresy kuchyne od nášho architekta — doska má 2,4 m na dĺžku a 60 cm na hĺbku, s 20 cm presahom nad umývačkou.\n\nPred objednaním by som si rada potvrdila tri veci:\n\n1. Drez je podstavný Blanco 500x400 mm, takže výrez musí byť leštený zo všetkých štyroch strán.\n2. Rovnaký kameň by sme chceli aj na 60 cm zástenu, v hrúbke 12 mm.\n3. Je možná 4 cm zrezaná hrana vpredu, alebo to výrazne mení cenu?\n\nDodanie by sme ideálne potrebovali v druhej polovici júna — kuchynskú linku montujú 14. júna.\n\nĎakujem a prajem pekný deň,\nMartina Kováčová",
                'ev6_subject' => 'RE: Nákresy kuchynskej dosky + výrez na drez',
                'ev6_body' => "Dobrý deň pani Kováčová,\n\nďakujem za nákresy, všetko je zrozumiteľné.\n\n1. Výrez pre podstavný drez vrátane leštenia všetkých štyroch hrán je súčasťou štandardnej ceny opracovania, bez príplatku.\n2. Zástena 60 cm v hrúbke 12 mm nie je problém — pridal som ju do ponuky ako samostatnú položku.\n3. Zrezaná hrana 4 cm je možná; kvôli rezaniu a lepeniu navyšuje cenu približne o 180 EUR.\n\nUpravenú ponuku posielam v prílohe. Ak ju potvrdíte do piatku, laserové zameranie stihneme 2. júna a dodanie v týždni od 15. júna, takže by ste boli včas pred montážou linky.\n\nS pozdravom,\nJordan",
                'ev7_message' => 'Dobrý deň, rekonštruujeme kuchyňu v rodinnom dome v Trnave. Potrebovala by som cenu na pracovnú dosku 2,4 x 0,6 m z bieleho kremeňa vrátane výrezu na drez a zodpovedajúcej zásteny. Odhad mi prosím pošlite e-mailom, dostupná som popoludní.',
                'task1_title' => 'Pripraviť SLA zmluvu pre veľkoobchodného partnera',
                'task1_body' => 'Pripraviť štandardnú veľkoobchodnú SLA vrátane termínov dodania dosiek.',
                'task2_title' => 'Laserové zameranie kuchynskej dosky u klienta',
                'task2_body' => 'Navštíviť nehnuteľnosť v Trnave a presne zamerať Prolinerom dosku Calacatta Quartz.',
                'task3_title' => 'Koordinácia dodávky dosiek z Talianska',
                'task3_body' => 'Dohodnúť s logistikou dodanie 12 mm dosiek prichádzajúcich z Fiorano Modenese.',
            ],
            'hu' => [
                'ev1_title' => 'Rögzített bemutatkozó hívás',
                'ev1_body' => 'Átbeszéltük a fő bemutatóterem belső kőburkolati lehetőségeit. Az ügyfelet erősen érdeklik a vékony porcelán palalapok.',
                'ev2_title' => 'Digitális katalógus és árlista elküldve',
                'ev2_body' => 'E-mailben elküldtük a teljes porcelán kő katalógust és a vastagság szerinti alapárakat.',
                'ev3_title' => 'Találkozó a pozsonyi bemutatóteremben',
                'ev3_body' => 'A fő bemutatóteremben találkoztunk. Az ügyfél szürke márványlapokat választott. Sam összeállította a műszaki és logisztikai követelményeket.',
                'ev4_title' => 'Hivatalos árajánlat elküldve',
                'ev4_body' => 'Elkészítettük és e-mailben elküldtük a hivatalos árajánlatot a lapok vágásával és szerelésével együtt.',
                'ev5_subject' => 'Konyhapult rajzok + mosogató kivágás',
                'ev5_body' => "Jó napot Jordan,\n\nköszönöm a múlt heti bemutatótermi látogatást. Csatolom az építészünk konyharajzait — a munkalap 2,4 m hosszú és 60 cm mély, a mosogatógép fölött 20 cm túlnyúlással.\n\nA megrendelés előtt három dolgot szeretnék megerősíteni:\n\n1. A mosogató alulról beépített Blanco 500x400 mm, tehát a kivágást mind a négy oldalon políroznod kell.\n2. Ugyanezt a követ szeretnénk a 60 cm-es hátfalra is, 12 mm vastagságban.\n3. Lehetséges elöl a 4 cm-es gérvágott él, vagy az jelentősen módosítja az árat?\n\nA szállítás ideális esetben június második felében lenne — a konyhabútort június 14-én szerelik.\n\nKöszönöm és szép napot,\nMartina Kováčová",
                'ev6_subject' => 'RE: Konyhapult rajzok + mosogató kivágás',
                'ev6_body' => "Jó napot Kováčová asszony,\n\nköszönöm a rajzokat, minden világos.\n\n1. Az alulról beépített mosogató kivágása mind a négy él polírozásával együtt a megmunkálás alapárának része, felár nélkül.\n2. A 60 cm-es hátfal 12 mm-ben nem probléma — külön tételként hozzáadtam az ajánlathoz.\n3. A 4 cm-es gérvágott él megoldható; a többletvágás és ragasztás miatt nagyjából 180 EUR-val növeli a végösszeget.\n\nA módosított ajánlatot csatolom. Ha péntekig visszaigazolja, a lézeres felmérést június 2-ra tudjuk ütemezni, a szállítást pedig a június 15-i hétre, így időben lenne a bútorszereléshez.\n\nÜdvözlettel,\nJordan",
                'ev7_message' => 'Jó napot, egy nagyszombati családi ház konyháját újítjuk fel. Szeretnék árat kérni egy 2,4 x 0,6 m-es fehér kvarc munkalapra, a mosogató kivágásával és a hozzá illő hátfallal együtt. A becslést kérem e-mailben küldjék, délutánonként vagyok elérhető.',
                'task1_title' => 'SLA szerződés előkészítése a nagykereskedelmi partnernek',
                'task1_body' => 'Készítsd elő a szokásos nagykereskedelmi SLA-t a lapok szállítási határidőivel együtt.',
                'task2_title' => 'Helyszíni lézeres felmérés a konyhapulthoz',
                'task2_body' => 'Látogasd meg a nagyszombati ingatlant, és mérd fel Prolinerrel a Calacatta Quartz pultot.',
                'task3_title' => 'Lapszállítás egyeztetése Olaszországból',
                'task3_body' => 'Egyeztess a logisztikával a Fiorano Modenese-ből érkező 12 mm-es lapokról.',
            ],
        ];
        $demoText = $demoTextByLanguage[$systemLanguage];
        $leadSources = $defaultLists['leadSources'];
        $taskStates = $defaultLists['taskStates'];

        // Seed default leads
        $leads = [
            ['lead-1', 'Ján Novák', 'Bratislava', 'business', $leadStates[0], $leadSources[3], 'Sam', 12500, 5, '+421 905 123 456', 'novak@example.com', '36123456', '2021234567', 'SK2021234567', 'Ing. Ján Novák', 'https://example.com', 'Mlynské Nivy 42', '821 09', 'Slovakia', '2026-05-15'],
            ['lead-2', 'Martina Kováčová', 'Trnava', 'person', $leadStates[1], $leadSources[2], 'Jordan', 8400, 4, '+421 911 987 654', 'm.kovacova@example.com', null, null, null, null, null, 'Kukučínova 15', '917 01', 'Slovakia', '2026-05-18'],
            ['lead-3', 'Thomas Müller', 'Košice', 'partner', $leadStates[2], $leadSources[0], 'Alex', 45000, 3, '+49 172 888 999', 't.mueller@example.de', 'DE98765432', '115/908/332', null, 'Thomas Müller', 'https://example.de', 'Hauptstrasse 102', '040 01', 'Germany', '2026-05-10'],
        ];
        $insLead = $pdo->prepare("INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `value`, `rating`, `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($leads as $l) {
            $insLead->execute($l);
        }

        $leadCats = [
            ['lead-1', $leadCategories[0]],
            ['lead-1', $leadCategories[1]],
            ['lead-2', $leadCategories[1]],
            ['lead-3', $leadCategories[0]],
        ];
        $insLeadCat = $pdo->prepare("INSERT INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");
        foreach ($leadCats as $lc) {
            $insLeadCat->execute($lc);
        }

        // The lead-2 entries reproduce the two ways the CRM files events on its
        // own, so the demo shows the real automatic cards instead of hand-typed
        // notes:
        //   * `ev-5` is what pipeline.php writes when a web form matches an
        //     already active lead — a note titled "Form Inquiry (Existing
        //     Active Lead)" whose body is the submitted fields, one per line.
        //   * `email-*` is what mail_broker.php writes when a mailbox message
        //     matches a lead — an `email-<uid>` id, the subject as the title
        //     and the headers flattened above the message body.
        $formBody = function (array $lines): string {
            return implode("\n", $lines);
        };
        $mailBody = function (string $fromName, string $fromAddress, string $toName, string $toAddress, string $subject, string $body = ''): string {
            $headers = "From: {$fromName} <{$fromAddress}>\nTo: {$toName} <{$toAddress}>\nSubject: {$subject}";
            return $body === '' ? $headers : $headers . "\n\n" . $body;
        };
        $timelineEvents = [
            ['ev-1', 'lead-1', 'phone', '2026-05-15 10:00', $demoText['ev1_title'], $demoText['ev1_body'], null, null, null, null, null, 0],
            ['ev-2', 'lead-1', 'email', '2026-05-16 11:30', $demoText['ev2_title'], $demoText['ev2_body'], null, null, null, null, null, 1],
            ['ev-3', 'lead-1', 'appointment', '2026-05-20 14:00', $demoText['ev3_title'], $demoText['ev3_body'], null, null, null, null, '14:00', 0],
            ['ev-4', 'lead-1', 'offer', '2026-05-22 15:45', $demoText['ev4_title'], $demoText['ev4_body'], 12500.00, 'novak_slabs_proposal.pdf', '1.45 MB', 'offer', null, 0],
            ['ev-5', 'lead-2', 'note', '2026-05-18 08:15', 'Form Inquiry (Existing Active Lead)',
                $formBody([
                    'Form submission received from source: ' . $leadSources[2],
                    'Name: Martina Kováčová',
                    'Email: m.kovacova@example.com',
                    'Phone: +421 911 987 654',
                    'City: Trnava',
                    'Categories: ' . $leadCategories[1],
                    'Value: 8400 EUR',
                    'Message: ' . $demoText['ev7_message'],
                ]),
                null, null, null, null, null, 0],
            ['email-10412', 'lead-2', 'email', '2026-05-19 09:12', $demoText['ev5_subject'],
                $mailBody('Martina Kováčová', 'm.kovacova@example.com', 'Jordan', 'jordan@crm.com', $demoText['ev5_subject'], $demoText['ev5_body']),
                null, null, null, null, null, 0],
            ['email-10457', 'lead-2', 'email', '2026-05-20 16:40', $demoText['ev6_subject'],
                $mailBody('Jordan', 'jordan@crm.com', 'Martina Kováčová', 'm.kovacova@example.com', $demoText['ev6_subject'], $demoText['ev6_body']),
                null, null, null, null, null, 1],
        ];
        $insTimeline = $pdo->prepare("INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_name`, `file_size`, `file_type`, `extra_time`, `is_outgoing`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($timelineEvents as $te) {
            $insTimeline->execute($te);
        }

        // Demo tasks carry an explicit deadline_time; leaving it NULL made every
        // seeded task render with the 23:59 end-of-day fallback.
        $tasks = [
            ['task-1', $demoText['task1_title'], $demoText['task1_body'], 'high', '2026-05-30', '16:00', $taskStates[1], 'Alex', 'lead-3', 1],
            ['task-2', $demoText['task2_title'], $demoText['task2_body'], 'high', '2026-05-31', '10:00', $taskStates[0], 'Sam', 'lead-2', 1],
            ['task-3', $demoText['task3_title'], $demoText['task3_body'], 'medium', '2026-06-02', '12:00', $taskStates[0], 'Jordan', 'lead-1', 0],
        ];
        $insTask = $pdo->prepare("INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `deadline`, `deadline_time`, `status`, `owner`, `related_lead_id`, `is_locking`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($tasks as $t) {
            $insTask->execute($t);
        }

        $taskAssignees = [
            ['task-1', 'Alex'],
            ['task-1', 'Jordan'],
            ['task-2', 'Sam'],
            ['task-3', 'Jordan'],
        ];
        $insAssignee = $pdo->prepare("INSERT INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");
        foreach ($taskAssignees as $ta) {
            $insAssignee->execute($ta);
        }

    } else {
        // Fresh setup: a single administrator account with operator-supplied
        // credentials (falls back to a sensible default only if none provided).
        $settings = array_merge($baseSettings, ['DEMO_MODE' => 'false']);
        foreach ($settings as $k => $v) {
            $insSet->execute([$k, $v]);
        }

        $adminName  = trim((string)($data['adminName'] ?? '')) ?: 'Admin';
        $adminEmail = trim((string)($data['adminEmail'] ?? '')) ?: 'admin@crm.com';
        $adminPass  = (string)($data['adminPassword'] ?? '');
        $generatedPassword = null;
        if ($adminPass === '') {
            // No password supplied: generate a random one and return it once so
            // the operator is never left without a way in.
            $adminPass = bin2hex(random_bytes(6));
            $generatedPassword = $adminPass;
        }

        $insUser->execute([
            $userId($adminEmail),
            $adminName,
            $adminEmail,
            password_hash($adminPass, PASSWORD_DEFAULT),
            'admin',
            null,
            '#f43f5e',
        ]);
    }

    $pdo->commit();

    if (file_put_contents($configFile, $configContent) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write config.php file. Check directory permissions.']);
        exit;
    }

    $response = ['success' => true, 'message' => 'CCRM successfully provisioned!'];
    if (!empty($generatedPassword)) {
        $response['adminEmail'] = $adminEmail;
        $response['generatedPassword'] = $generatedPassword;
        $response['message'] = 'CCRM provisioned. Save these admin credentials now — they will not be shown again.';
    }
    echo json_encode($response);
} catch (\Exception $e) {
    $errorMsg = $e->getMessage();
    try {
        if (isset($pdo) && $pdo && $pdo->inTransaction()) {
            @$pdo->rollBack();
        }
    } catch (\Exception $rollbackEx) {
        // Ignore rollback failure to preserve original exception
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Migrations or seeding failed: ' . $errorMsg]);
}
