<?php
/**
 * Demo seed module: finance.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('finance', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * This is the single implementation behind api/seed_demo_data.php (the
 * standalone script runs the prerequisite modules and then this function).
 *
 * About six months of `financial_records`:
 *  - Recurring rules (rent, electricity, software, accounting, bank fees,
 *    advertising, weekly consumables, yearly insurance, a service contract that
 *    earns money). A recurring movement is ONE row — the reports derive every
 *    past charge from the rule — so each rule starts ~6 months back.
 *  - Monthly payroll and employer contributions (amounts taken from the seeded
 *    employee_salaries when they exist).
 *  - Income invoices: the proforma/invoice documents of offers.php appear here
 *    with matching numbers and amounts; plus partner invoices, a partially paid
 *    one, an overdue one and planned future invoices that, together with the
 *    issued ones, add up to each project's contract value.
 *  - Expenses: vendor bills derived from the warehouse receipts (supplier due
 *    days decide paid / pending / overdue), project costs, a VAT settlement.
 * Every amount is gross (VAT included) like the offers; tax_rate says how much.
 *
 * Categories are the instance's own `fc-*` tree; it is created here if the
 * table is empty. Id plan: sequential from 1.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_finance(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    if (!function_exists('ccrm_default_financial_categories')) {
        require_once dirname(__DIR__) . '/schema.php';
    }
    [$alex, $sam, $jordan] = demo_user_names();
    $c = static fn(int $n): string => demo_id('clients', $n);
    $p = static fn(int $n): string => demo_id('projects', $n);

    // Salaries linked to a record about to be deleted are re-linked below.
    $pdo->exec("UPDATE `employee_salaries` SET `financial_record_id` = NULL WHERE `financial_record_id` LIKE 'demo-finance-%'");
    $pdo->exec("DELETE FROM `financial_records` WHERE `id` LIKE 'demo-finance-%'");

    // --- Categories: use the instance's tree, create it when there is none ---------------
    if ((int)$pdo->query("SELECT COUNT(*) FROM `financial_categories`")->fetchColumn() === 0) {
        $insCat = $pdo->prepare("INSERT INTO `financial_categories` (`id`, `type`, `name`, `parent_id`, `level`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach (ccrm_default_financial_categories($lang) as $cat) {
            $insCat->execute([$cat['id'], $cat['type'], $cat['name'], $cat['parent_id'], $cat['level'], $cat['color'], $cat['icon']]);
        }
    }
    $cats = [];
    foreach ($pdo->query("SELECT `id`, `name`, `parent_id` FROM `financial_categories`")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $cats[$row['id']] = $row;
    }
    $catOf = static function (string $id) use ($cats): array {
        if (!isset($cats[$id])) {
            return [null, null];
        }
        $names = [];
        $cur = $cats[$id];
        for ($i = 0; $cur && $i < 5; $i++) {
            array_unshift($names, $cur['name']);
            $cur = $cur['parent_id'] !== null ? ($cats[$cur['parent_id']] ?? null) : null;
        }
        return [$id, implode(' > ', $names)];
    };

    $records = [];
    $today = demo_d(0);
    $add = static function (array $r) use (&$records): void {
        $records[] = $r + [
            'subtype' => 'invoice', 'description' => null, 'real' => 0.0, 'status' => 'planned', 'due' => null, 'paid' => null,
            'payment_method' => 'bank_transfer', 'recurring' => null, 'project_id' => null, 'client_id' => null, 'invoice_number' => null,
            'tax_rate' => 20, 'created_by' => 'Alex',
        ];
    };
    /** A date n months back (0 = this month) on the given day, clamped to the month's length. */
    $monthDay = static function (int $monthsBack, int $day): string {
        $first = (new \DateTimeImmutable('today'))->modify('first day of this month')->modify(sprintf('-%d months', $monthsBack));
        $day = min($day, (int)$first->format('t'));
        return $first->setDate((int)$first->format('Y'), (int)$first->format('n'), $day)->format('Y-m-d');
    };
    $isPast = static fn(string $date): bool => $date <= $today;

    // --- 1. Recurring rules --------------------------------------------------------------------
    $startRec = demo_d(-185);
    $rules = [
        // [title, description, category, amount, frequency, config, tax, type, subtype]
        [['Rent – showroom and workshop', 'Nájomné – showroom a dielňa', 'Bérleti díj – bemutatóterem és műhely'],
            ['Monthly fixed rent of the headquarters and the workshop.', 'Mesačný fixný nájom centrály a dielne.', 'A központ és a műhely havi fix bérleti díja.'],
            'fc-exp-ovh-rent', 3200.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 1], 20, 'expense', 'other'],
        [['Electricity for CNC machines and compressors', 'Elektrina pre CNC stroje a kompresory', 'Áram a CNC gépekhez és kompresszorokhoz'],
            ['Monthly advance payment to the energy supplier.', 'Mesačná zálohová platba dodávateľovi energií.', 'Havi előlegfizetés az energiaszolgáltatónak.'],
            'fc-exp-ovh-util', 680.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 5], 20, 'expense', 'other'],
        [['CAD/CAM software licences', 'Licencie CAD/CAM softvéru', 'CAD/CAM szoftverlicencek'],
            ['Monthly subscription for the 3D design and CNC software.', 'Mesačné predplatné 3D návrhového a CNC softvéru.', 'A 3D tervező és CNC szoftver havi előfizetése.'],
            'fc-exp-ovh-software', 420.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 10], 20, 'expense', 'other'],
        [['Accounting and payroll service', 'Účtovníctvo a mzdy', 'Könyvelés és bérszámfejtés'],
            ['External accountant, monthly paušál.', 'Externá účtovníčka, mesačný paušál.', 'Külső könyvelő, havi átalánydíj.'],
            'fc-exp-adm-accounting', 380.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 28], 20, 'expense', 'other'],
        [['Bank account fees', 'Poplatky za bankový účet', 'Bankszámla díjak'],
            ['Account maintenance and payment fees.', 'Vedenie účtu a poplatky za platby.', 'Számlavezetés és fizetési díjak.'],
            'fc-exp-adm-bank', 38.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 30], 0, 'expense', 'other'],
        [['Online advertising – Meta', 'Online reklama – Meta', 'Online hirdetés – Meta'],
            ['Facebook and Instagram campaigns for kitchen worktops.', 'Kampane na Facebooku a Instagrame pre kuchynské dosky.', 'Facebook- és Instagram-kampányok konyhai munkalapokra.'],
            'fc-exp-mkt-meta', 350.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 12], 20, 'expense', 'other'],
        [['Online advertising – Google Ads', 'Online reklama – Google Ads', 'Online hirdetés – Google Ads'],
            ['Search campaigns for "kitchen countertop" and "stone cladding".', 'Vyhľadávacie kampane na „kuchynská doska“ a „kamenný obklad“.', 'Keresőkampányok a „konyhai munkalap” és „kőburkolat” kifejezésekre.'],
            'fc-exp-mkt-google', 450.00, 'monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => 14], 20, 'expense', 'other'],
        [['Diamond blades and workshop consumables', 'Diamantové kotúče a dielenský spotrebný materiál', 'Gyémánttárcsák és műhelyi fogyóeszközök'],
            ['Weekly top-up of blades, pads and protective gear.', 'Týždenné dopĺňanie kotúčov, brúsnych kotúčov a ochranných pomôcok.', 'Tárcsák, csiszolókorongok és védőfelszerelés heti utánpótlása.'],
            'fc-exp-cogs-materials', 190.00, 'weekly', ['dayOfWeek' => 1], 20, 'expense', 'other'],
        [['Company and machinery insurance', 'Poistenie firmy a strojov', 'Cég- és gépbiztosítás'],
            ['Yearly policy for the CNC machines and liability.', 'Ročná poistka na CNC stroje a zodpovednosť.', 'Éves biztosítás a CNC gépekre és a felelősségre.'],
            'fc-exp-adm-insurance', 2400.00, 'yearly', ['month' => (int)substr(demo_d(-120), 5, 2), 'dayOfMonth' => (int)substr(demo_d(-120), 8, 2)], 0, 'expense', 'other'],
    ];
    foreach ($rules as [$title, $desc, $category, $amount, $freq, $config, $tax, $type, $subtype]) {
        $start = $freq === 'yearly' ? demo_d(-120) : $startRec;
        $add([
            'type' => $type, 'subtype' => $subtype, 'title' => $T(['en' => $title[0], 'sk' => $title[1], 'hu' => $title[2]]),
            'description' => $T(['en' => $desc[0], 'sk' => $desc[1], 'hu' => $desc[2]]), 'category' => $category,
            'planned' => $amount, 'real' => $amount, 'status' => 'paid', 'issue' => $start, 'due' => $start, 'paid' => $start,
            'recurring' => [$freq, $config, $start], 'tax_rate' => $tax,
        ]);
    }
    // An income rule: the care contract with the partner studio.
    $add([
        'type' => 'income', 'subtype' => 'invoice', 'title' => $T(['en' => 'Stone care contract – KitchenLine Studio', 'sk' => 'Zmluva o údržbe kameňa – KitchenLine Studio', 'hu' => 'Kőápolási szerződés – KitchenLine Studio']),
        'description' => $T(['en' => 'Monthly care of the studio\'s showroom worktops.', 'sk' => 'Mesačná údržba pracovných dosiek v showroome štúdia.', 'hu' => 'A stúdió bemutatótermi munkalapjainak havi karbantartása.']),
        'category' => 'fc-inc-svc-support', 'planned' => 450.00, 'real' => 450.00, 'status' => 'paid', 'issue' => demo_d(-150), 'due' => demo_d(-136), 'paid' => demo_d(-148),
        'recurring' => ['monthly', ['monthlyType' => 'day_of_month', 'dayOfMonth' => (int)substr(demo_d(-150), 8, 2)], demo_d(-150)],
        'client_id' => $c(3), 'invoice_number' => 'CARE-' . substr(demo_d(0), 0, 4), 'created_by' => $sam,
    ]);

    // --- 2. Payroll ---------------------------------------------------------------------------------
    $salaryByPeriod = [];
    try {
        foreach ($pdo->query("SELECT `period_key`, SUM(`total_salary`) AS t FROM `employee_salaries` GROUP BY `period_key`")->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $salaryByPeriod[$row['period_key']] = (float)$row['t'];
        }
        $baseTotal = (float)$pdo->query("SELECT COALESCE(SUM(`salary_amount`), 0) FROM `employees` WHERE `is_active` = 1")->fetchColumn();
    } catch (\Throwable $e) {
        $baseTotal = 0.0;
    }
    $baseTotal = $baseTotal > 0 ? $baseTotal : 11750.00;

    // Employees with auto_expense=1 get one expense per salary row: the client's
    // salary sync (sync.php, "Auto-Expense linkage") creates 'fr-sal-<salaryId>'
    // for every pushed salary whose financial_record_id is empty. Writing a
    // separate monthly total here would be counted twice the moment salaries are
    // synced or marked paid. So write exactly the per-salary records sync would,
    // and link each salary to its record; sync then updates it in place.
    $salaryRows = [];
    try {
        $salaryRows = $pdo->query(
            "SELECT s.`id`, s.`period_key`, s.`year`, s.`period_number`, s.`total_salary`, s.`total_paid`, s.`due_date`, s.`payment_date`, s.`payment_method`,
                    e.`name`, e.`expense_category_id`
               FROM `employee_salaries` s JOIN `employees` e ON e.`id` = s.`employee_id`
              WHERE e.`auto_expense` = 1 AND s.`financial_record_id` IS NULL AND (s.`total_salary` > 0 OR s.`total_paid` > 0)
              ORDER BY s.`period_key`, s.`id`"
        )->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        $salaryRows = [];
    }
    foreach ($salaryRows as $s) {
        $total = (float)$s['total_salary'];
        $paidAmount = (float)$s['total_paid'];
        $fullyPaid = $paidAmount >= $total && $total > 0;
        $add([
            'type' => 'expense', 'subtype' => 'salary', 'title' => "Salary: {$s['name']} ({$s['period_key']})",
            'description' => "Monthly payroll salary payout for {$s['name']}",
            'category' => $s['expense_category_id'] ?: 'fc-exp-pay-salaries', 'planned' => $total, 'real' => $paidAmount,
            'status' => $fullyPaid ? 'paid' : ($paidAmount > 0 ? 'partially_paid' : 'planned'),
            'issue' => sprintf('%04d-%02d-01', (int)$s['year'], (int)$s['period_number']), 'due' => $s['due_date'],
            'paid' => $paidAmount > 0 ? ($s['payment_date'] ?: $today) : null, 'payment_method' => $s['payment_method'] ?: 'bank_transfer',
            'tax_rate' => 0, 'salary_id' => $s['id'],
        ]);
    }

    for ($k = 5; $k >= 0; $k--) {
        $payDay = $monthDay($k, 15);
        $label = substr($payDay, 5, 2) . '/' . substr($payDay, 0, 4);
        $gross = $salaryByPeriod[substr($payDay, 0, 7)] ?? $baseTotal;
        $done = $isPast($payDay);
        if (!$salaryRows) {
            // No salary rows to link to (no employees seeded): a plain monthly total.
            $add([
                'type' => 'expense', 'subtype' => 'salary', 'title' => $T(['en' => "Salaries $label", 'sk' => "Mzdy $label", 'hu' => "Bérek $label"]),
                'description' => $T(['en' => 'Monthly payroll of the four employees.', 'sk' => 'Mesačná výplata štyroch zamestnancov.', 'hu' => 'A négy munkatárs havi bére.']),
                'category' => 'fc-exp-pay-salaries', 'planned' => $gross, 'real' => $done ? $gross : 0.0, 'status' => $done ? 'paid' : 'planned',
                'issue' => $payDay, 'due' => $payDay, 'paid' => $done ? date('Y-m-d', strtotime($payDay . ' -1 day')) : null,
                'tax_rate' => 0,
            ]);
        }
        $levies = round($gross * 0.352, 2);
        $levyDay = $monthDay($k, 22);
        $levyDone = $isPast($levyDay);
        $add([
            'type' => 'expense', 'subtype' => 'salary', 'title' => $T(['en' => "Social and health contributions $label", 'sk' => "Odvody do poisťovní $label", 'hu' => "Társadalombiztosítási járulékok $label"]),
            'description' => $T(['en' => 'Employer contributions for the month.', 'sk' => 'Odvody zamestnávateľa za mesiac.', 'hu' => 'A munkáltatói járulékok a hónapra.']),
            'category' => 'fc-exp-pay-salaries', 'planned' => $levies, 'real' => $levyDone ? $levies : 0.0, 'status' => $levyDone ? 'paid' : 'planned',
            'issue' => $levyDay, 'due' => $levyDay, 'paid' => $levyDone ? $levyDay : null, 'tax_rate' => 0,
        ]);
    }

    // --- 3. Income invoices ---------------------------------------------------------------------------
    // 3a. The proforma and invoice documents of the offers module, with their numbers.
    $docRows = [];
    if (demo_table_exists($pdo, 'invoices_offers')) {
        $docRows = $pdo->query(
            "SELECT * FROM `invoices_offers` WHERE `id` LIKE 'demo-offers-%' AND `type` IN ('proforma', 'invoice') ORDER BY `issued_at`"
        )->fetchAll(PDO::FETCH_ASSOC);
    }
    $projectOfLead = [];
    foreach ($pdo->query("SELECT `id`, `lead_id` FROM `projects` WHERE `id` LIKE 'demo-projects-%'")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $projectOfLead[$row['lead_id']] = $row['id'];
    }
    foreach ($docRows as $doc) {
        $total = (float)$doc['total_price'];
        $due = $doc['due_date'];
        // The wizard has no "paid" status: an issued proforma that became an invoice, or an approved invoice, was paid.
        $paid = in_array($doc['status'], ['invoiced', 'approved'], true);
        $overdue = !$paid && $due !== null && $due < $today;
        $add([
            'type' => 'income', 'subtype' => 'invoice',
            'title' => ($doc['type'] === 'proforma'
                ? $T(['en' => 'Advance invoice – ', 'sk' => 'Zálohová faktúra – ', 'hu' => 'Előlegszámla – '])
                : $T(['en' => 'Invoice – ', 'sk' => 'Faktúra – ', 'hu' => 'Számla – '])) . $doc['client_name'],
            'description' => $doc['subject'], 'category' => 'fc-inc-svc-projects', 'planned' => $total, 'real' => $paid ? $total : 0.0,
            'status' => $paid ? 'paid' : ($overdue ? 'overdue' : 'pending'), 'issue' => $doc['issued_at'], 'due' => $due,
            'paid' => $paid ? min($today, date('Y-m-d', strtotime($doc['issued_at'] . ' +5 days'))) : null,
            'project_id' => $projectOfLead[$doc['lead_id']] ?? null, 'client_id' => $doc['lead_id'], 'invoice_number' => $doc['document_number'],
            'created_by' => (string)($doc['created_by'] ?: $alex),
        ]);
    }

    // 3b. Further invoices issued from the accounting system (own number series).
    $inv = 31;
    $ext = static function (int $n): string { return substr(demo_d(0), 0, 4) . str_pad((string)$n, 4, '0', STR_PAD_LEFT); };
    $partner = [[-160, 3200.00], [-128, 4150.00], [-97, 3780.00], [-66, 5100.00], [-35, 4480.00]];
    foreach ($partner as $i => [$off, $amt]) {
        $last = $i === count($partner) - 1;
        $add([
            'type' => 'income', 'subtype' => 'invoice',
            'title' => $T(['en' => 'Partner worktops – KitchenLine Studio', 'sk' => 'Pracovné dosky pre partnera – KitchenLine Studio', 'hu' => 'Munkalapok partnernek – KitchenLine Studio']),
            'description' => $T(['en' => 'Fabricated worktops for the studio\'s kitchen jobs.', 'sk' => 'Vyrobené pracovné dosky pre kuchynské zákazky štúdia.', 'hu' => 'A stúdió konyhai munkáihoz gyártott munkalapok.']),
            'category' => 'fc-inc-svc-projects', 'planned' => $amt, 'real' => $last ? round($amt * 0.5, 2) : $amt, 'status' => $last ? 'partially_paid' : 'paid',
            'issue' => demo_d($off), 'due' => demo_d($off + 14), 'paid' => demo_d($off + ($last ? 9 : 11)), 'client_id' => $c(3),
            'invoice_number' => $ext($inv++), 'created_by' => $sam,
        ]);
    }
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Vanity tops phase 1 – Kovács & Társa', 'sk' => 'Dosky pod umývadlá, fáza 1 – Kovács & Társa', 'hu' => 'Mosdópultok 1. fázis – Kovács & Társa']),
        'description' => $T(['en' => 'Four vanity tops and 36 m² of wall cladding.', 'sk' => 'Štyri dosky pod umývadlá a 36 m² obkladu.', 'hu' => 'Négy mosdópult és 36 m² falburkolat.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 8400.00, 'real' => 4200.00, 'status' => 'partially_paid',
        'issue' => demo_d(-40), 'due' => demo_d(-26), 'paid' => demo_d(-31), 'client_id' => $c(5), 'invoice_number' => $ext($inv++), 'created_by' => $alex,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Showroom tables – advance – Interiéry Dvořák', 'sk' => 'Showroomové stoly – záloha – Interiéry Dvořák', 'hu' => 'Bemutatótermi asztalok – előleg – Interiéry Dvořák']),
        'description' => $T(['en' => '50 % advance of the accepted offer.', 'sk' => '50 % záloha z prijatej ponuky.', 'hu' => 'Az elfogadott ajánlat 50 %-os előlege.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 4682.40, 'real' => 4682.40, 'status' => 'paid',
        'issue' => demo_d(-74), 'due' => demo_d(-60), 'paid' => demo_d(-69), 'project_id' => $p(4), 'client_id' => $c(4), 'invoice_number' => $ext($inv++), 'created_by' => $sam,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Earlier order – Vila Slavín Development', 'sk' => 'Skoršia zákazka – Vila Slavín Development', 'hu' => 'Korábbi megrendelés – Vila Slavín Development']),
        'description' => $T(['en' => 'Entrance steps and window sills of the show villa.', 'sk' => 'Vstupné schody a parapety ukážkovej vily.', 'hu' => 'A mintavilla bejárati lépcsői és ablakpárkányai.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 6800.00, 'real' => 6800.00, 'status' => 'paid',
        'issue' => demo_d(-172), 'due' => demo_d(-158), 'paid' => demo_d(-163), 'client_id' => $c(1), 'invoice_number' => $ext($inv++), 'created_by' => $alex,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Tabletop samples – Hotel Alpenblick', 'sk' => 'Vzorky dosiek – Hotel Alpenblick', 'hu' => 'Lapminták – Hotel Alpenblick']),
        'description' => $T(['en' => 'Sample slabs for the reception desk decision.', 'sk' => 'Vzorky dosiek na rozhodnutie o recepčnom pulte.', 'hu' => 'Lapminták a recepciós pult döntéséhez.']),
        'category' => 'fc-inc-sales-products', 'planned' => 441.00, 'real' => 0.0, 'status' => 'pending',
        'issue' => demo_d(-3), 'due' => demo_d(11), 'client_id' => $c(6), 'invoice_number' => $ext($inv++), 'created_by' => $jordan,
    ]);
    // 3c. Planned invoices: with the issued ones they add up to each project's contract value.
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Final invoice – Villa Slavín cladding', 'sk' => 'Konečná faktúra – obklad Vila Slavín', 'hu' => 'Végszámla – Vila Slavín burkolat']),
        'description' => $T(['en' => 'Remainder of the contract after the advance and stage 1.', 'sk' => 'Zvyšok zákazky po zálohe a 1. etape.', 'hu' => 'A szerződés fennmaradó része az előleg és az 1. szakasz után.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 6312.00, 'status' => 'planned', 'issue' => demo_d(30), 'due' => demo_d(44),
        'project_id' => $p(1), 'client_id' => $c(1), 'invoice_number' => null, 'created_by' => $alex,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Stage 1 invoice – Hotel Alpenblick', 'sk' => 'Faktúra 1. etapy – Hotel Alpenblick', 'hu' => '1. szakasz számlája – Hotel Alpenblick']),
        'description' => $T(['en' => 'Reception desk and spa cladding fabrication.', 'sk' => 'Výroba recepčného pultu a obkladu wellness.', 'hu' => 'A recepciós pult és a wellness burkolat gyártása.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 12000.00, 'status' => 'planned', 'issue' => demo_d(65), 'due' => demo_d(79),
        'project_id' => $p(3), 'client_id' => $c(6), 'created_by' => $jordan,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Final invoice – Hotel Alpenblick', 'sk' => 'Konečná faktúra – Hotel Alpenblick', 'hu' => 'Végszámla – Hotel Alpenblick']),
        'description' => $T(['en' => 'Installation and lobby flooring, after handover.', 'sk' => 'Montáž a podlaha lobby po odovzdaní.', 'hu' => 'Beépítés és előcsarnok padló az átadás után.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 10884.96, 'status' => 'planned', 'issue' => demo_d(100), 'due' => demo_d(114),
        'project_id' => $p(3), 'client_id' => $c(6), 'created_by' => $jordan,
    ]);
    $add([
        'type' => 'income', 'subtype' => 'invoice',
        'title' => $T(['en' => 'Showroom cladding – Novák', 'sk' => 'Obklad showroomu – Novák', 'hu' => 'Bemutatóterem burkolat – Novák']),
        'description' => $T(['en' => 'Invoice on completion of the marble cladding.', 'sk' => 'Faktúra po dokončení mramorového obkladu.', 'hu' => 'Számla a márványburkolat elkészültekor.']),
        'category' => 'fc-inc-svc-projects', 'planned' => 12500.00, 'status' => 'planned', 'issue' => demo_d(34), 'due' => demo_d(48),
        'project_id' => $p(5), 'client_id' => 'lead-1', 'created_by' => $sam,
    ]);

    // --- 4. Expenses ------------------------------------------------------------------------------------
    // 4a. Vendor bills derived from the warehouse receipts (gross = net + 20 % VAT).
    if (demo_table_exists($pdo, 'warehouse_movements')) {
        $stmt = $pdo->query(
            "SELECT m.`id`, m.`document_number`, m.`issued_at`, m.`total_cost_value`, m.`created_by`, s.`name` AS supplier, s.`payment_due_days` AS due_days
               FROM `warehouse_movements` m JOIN `suppliers` s ON s.`id` = m.`supplier_id`
              WHERE m.`id` LIKE 'demo-warehouse-%' AND m.`type` = 'inward' ORDER BY m.`issued_at`"
        );
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $issue = substr($m['issued_at'], 0, 10);
            $due = date('Y-m-d', strtotime($issue . ' +' . (int)$m['due_days'] . ' days'));
            $gross = round((float)$m['total_cost_value'] * 1.2, 2);
            $paid = $due < date('Y-m-d', strtotime($today . ' -6 days'));
            $overdue = !$paid && $due < $today;
            $add([
                'type' => 'expense', 'subtype' => 'vendor_bill', 'title' => $T(['en' => 'Goods receipt ', 'sk' => 'Príjemka ', 'hu' => 'Bevételezés ']) . $m['document_number'] . ' – ' . $m['supplier'],
                'description' => $T(['en' => 'Supplier bill for the material received into the warehouse.', 'sk' => 'Faktúra dodávateľa za materiál prijatý do skladu.', 'hu' => 'Beszállítói számla a raktárba bevételezett anyagról.']),
                'category' => 'fc-exp-cogs-materials', 'planned' => $gross, 'real' => $paid ? $gross : 0.0,
                'status' => $paid ? 'paid' : ($overdue ? 'overdue' : 'pending'), 'issue' => $issue, 'due' => $due, 'paid' => $paid ? date('Y-m-d', strtotime($due . ' -2 days')) : null,
                'invoice_number' => 'DF-' . substr($issue, 0, 4) . '-' . substr($m['document_number'], -3), 'created_by' => 'Sam',
            ]);
        }
    }
    // 4b. Project costs and one-off expenses.
    $oneOff = [
        // [title, desc, category, gross, off, status, project, client, invoice, method, tax]
        [['Laser measurement subcontractor – Villa Slavín', 'Subdodávka laserového merania – Vila Slavín', 'Lézeres felmérés alvállalkozó – Vila Slavín'],
            ['3D Proliner survey of the facade.', '3D zameranie fasády Prolinerom.', 'A homlokzat 3D Proliner felmérése.'], 'fc-exp-cogs-shipping', 420.00, -72, 'paid', $p(1), $c(1), 'BL-' . date('Y') . '-109', 'card', 20],
        [['Crane and special transport – Villa Slavín', 'Žeriav a špeciálna doprava – Vila Slavín', 'Daru és különleges szállítás – Vila Slavín'],
            ['Mobile crane for the second-floor installation.', 'Mobilný žeriav na montáž na 2. poschodí.', 'Mobildaru a második emeleti beépítéshez.'], 'fc-exp-cogs-shipping', 1140.00, 12, 'planned', $p(1), $c(1), 'OBJ-' . date('Y') . '-044', 'bank_transfer', 20],
        [['Slab order – Hotel Alpenblick', 'Objednávka dosiek – Hotel Alpenblick', 'Lapmegrendelés – Hotel Alpenblick'],
            ['Porcelain and quartz for the reception desk and spa.', 'Porcelán a kremeň na recepčný pult a wellness.', 'Porcelán és kvarc a recepciós pulthoz és a wellnesshez.'], 'fc-exp-cogs-materials', 13680.00, 40, 'planned', $p(3), $c(6), 'OBJ-' . date('Y') . '-051', 'bank_transfer', 20],
        [['Epoxy and consumables – Horváthová kitchen', 'Epoxid a spotrebný materiál – kuchyňa Horváthová', 'Epoxi és fogyóeszközök – Horváthová konyha'],
            ['Glue for the mitred edge and polishing pads.', 'Lepidlo na zrezanú hranu a leštiace kotúče.', 'Ragasztó a gérvágott élhez és polírkorongok.'], 'fc-exp-cogs-materials', 118.00, -40, 'paid', $p(2), $c(2), 'BL-' . date('Y') . '-118', 'card', 20],
        [['Marble slabs – Novák showroom', 'Mramorové dosky – showroom Novák', 'Márványlapok – Novák bemutatóterem'],
            ['Nero Marquina slabs for the wall cladding.', 'Dosky Nero Marquina na obklad stien.', 'Nero Marquina lapok a falburkolathoz.'], 'fc-exp-cogs-materials', 3072.00, -25, 'overdue', $p(5), 'lead-1', 'DF-' . date('Y') . '-902', 'bank_transfer', 20],
        [['Quarterly VAT settlement', 'Štvrťročné vyrovnanie DPH', 'Negyedéves ÁFA-elszámolás'],
            ['VAT payable for the previous quarter.', 'DPH na úhradu za predchádzajúci štvrťrok.', 'Az előző negyedév fizetendő ÁFA-ja.'], 'fc-exp-adm-taxes', 4120.00, -35, 'paid', null, null, 'DPH-Q' . ceil((int)date('n') / 3), 'bank_transfer', 0],
        [['Trade fair stand – Nitra Build', 'Výstavný stánok – Nitra Build', 'Kiállítási stand – Nitra Build'],
            ['Stand fee and printed material for the building fair.', 'Poplatok za stánok a tlačené materiály na stavebný veľtrh.', 'Standdíj és nyomtatott anyagok az építőipari kiállításra.'], 'fc-exp-marketing', 1890.00, -58, 'paid', null, null, 'FV-' . date('Y') . '-077', 'bank_transfer', 20],
    ];
    foreach ($oneOff as [$title, $desc, $category, $gross, $off, $status, $project, $client, $number, $method, $tax]) {
        $paid = $status === 'paid';
        $add([
            'type' => 'expense', 'subtype' => $category === 'fc-exp-adm-taxes' ? 'tax' : 'vendor_bill',
            'title' => $T(['en' => $title[0], 'sk' => $title[1], 'hu' => $title[2]]), 'description' => $T(['en' => $desc[0], 'sk' => $desc[1], 'hu' => $desc[2]]),
            'category' => $category, 'planned' => $gross, 'real' => $paid ? $gross : 0.0, 'status' => $status,
            'issue' => demo_d($off), 'due' => demo_d($off + 14), 'paid' => $paid ? demo_d($off + 3) : null, 'project_id' => $project, 'client_id' => $client,
            'invoice_number' => $number, 'payment_method' => $method, 'tax_rate' => $tax, 'created_by' => 'Sam',
        ]);
    }

    // --- Write ------------------------------------------------------------------------------------------------
    $ins = $pdo->prepare(
        "INSERT INTO `financial_records` (`id`, `type`, `subtype`, `title`, `description`, `category_id`, `category_path`, `amount_planned`, `amount_real`, `currency`,
            `status`, `issue_date`, `due_date`, `paid_date`, `payment_method`, `is_recurring`, `recurring_frequency`, `recurring_config_json`, `recurring_start_date`,
            `project_id`, `client_id`, `invoice_number`, `tax_rate`, `created_by`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $linkSalary = $pdo->prepare("UPDATE `employee_salaries` SET `financial_record_id` = ? WHERE `id` = ?");
    $n = 0;
    foreach ($records as $r) {
        $n++;
        [$catId, $catPath] = $catOf($r['category']);
        $rec = $r['recurring'];
        if (!empty($r['salary_id'])) {
            $linkSalary->execute([demo_id('finance', $n), $r['salary_id']]);
        }
        $ins->execute([
            demo_id('finance', $n), $r['type'], $r['subtype'], $r['title'], $r['description'], $catId, $catPath,
            round($r['planned'], 2), round($r['real'], 2), $r['status'], $r['issue'], $r['due'], $r['paid'], $r['payment_method'],
            $rec ? 1 : 0, $rec ? $rec[0] : null, $rec ? json_encode($rec[1]) : null, $rec ? $rec[2] : null,
            $r['project_id'], $r['client_id'], $r['invoice_number'], $r['tax_rate'], $r['created_by'],
        ]);
    }
}
