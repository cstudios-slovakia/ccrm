<?php
/**
 * Assertions for the `company` demo module - and the worked example of the format every
 * content module follows (contract: header of public/api/demo_seed/index.php).
 *
 * scripts/test-demo-seed.php loads scripts/demo-assert/<module>.php for every module it runs
 * and, for each of sk/EUR, hu/HUF, hu/EUR and en/USD, applies:
 *   'minRows'   table => the least number of INSERTs the module must have executed
 *   'idAllow'   table => regex for ids that legitimately do not start with demo- (B7 exceptions)
 *   'leakSkip'  'table' or 'table.column' to leave out of the C6 leakage check (foreign-language text)
 *   'check'     function (DemoFakePdo $db, array $ctx, callable $check): void
 *                 $db->rows('table')  every row the whole run wrote, [column => value]
 *                 $ctx                lang, currency, symbol, vatRates, vatDefault, ... and 'report'
 *                 $check($name, $ok, $detail)   one assertion; $detail is shown on failure
 * A new file per module means no two content sessions ever edit the same test file.
 */
return [
    'minRows' => [
        'users' => 3,
        'system_settings' => 4,
    ],
    'idAllow' => [
        'users' => '/^u-[0-9a-f]{32}$/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        $pack = demo_company_pack($ctx['lang']);
        $settings = $db->settings();

        // The three logins: pack names and e-mails, deterministic ids, password "password".
        $users = [];
        foreach ($db->rows('users') as $u) $users[$u['email']] = $u;
        $ok = true;
        $detail = [];
        foreach ($pack['users'] as $role => $p) {
            $row = $users[strtolower($p['email'])] ?? null;
            if ($row === null) { $ok = false; $detail[] = "{$role}: no row for {$p['email']}"; continue; }
            if ($row['id'] !== 'u-' . md5(strtolower($p['email']))) { $ok = false; $detail[] = "{$role}: id {$row['id']}"; }
            // Stored as the registry label: a legacy `project_manager` matched no role and
            // left that login with every module closed.
            $wantRole = ['admin' => 'Admin', 'project_manager' => 'Project Manager'][$p['role']] ?? $p['role'];
            if ($row['name'] !== $p['name'] || $row['role'] !== $wantRole) { $ok = false; $detail[] = "{$role}: name/role {$row['name']}/{$row['role']}"; }
            if (!password_verify('password', (string)$row['password_hash'])) { $ok = false; $detail[] = "{$role}: password is not 'password'"; }
        }
        $check('the three logins come from the pack (name, e-mail, id u-md5(email), role, password)', $ok, implode("\n", $detail));
        $check('no pre-pack login is created (alex@/sam@/jordan@crm.com)', !isset($users['alex@crm.com']) && !isset($users['sam@crm.com']) && !isset($users['jordan@crm.com']));

        // Sidebar: each login gets the pack's labelled groups, every module exactly once; the
        // owner (admin) also keeps the first-run module wizard.
        $ok = true;
        $detail = [];
        $expected = $pack['sidebarGroups'];
        $items = [];
        foreach ($expected as $g) foreach ($g['items'] as $i) $items[] = $i;
        if (count($items) !== count(array_unique($items))) { $ok = false; $detail[] = 'a module sits in two groups'; }
        foreach ($pack['users'] as $role => $p) {
            $row = $users[strtolower($p['email'])] ?? null;
            $prefs = json_decode((string)($row['metadata_json'] ?? ''), true)['preferences'] ?? null;
            if (!is_array($prefs) || ($prefs['sidebarGroups'] ?? null) !== $expected) { $ok = false; $detail[] = "{$role}: sidebarGroups missing or different"; continue; }
            $wizard = $prefs['moduleWizardPending'] ?? false;
            if ($wizard !== (strtolower((string)$p['role']) === 'admin')) { $ok = false; $detail[] = "{$role}: moduleWizardPending is " . json_encode($wizard); }
        }
        $check('every login has the pack\'s six titled sidebar groups, each module once; only the admin keeps the wizard', $ok && count($expected) === 6, implode("\n", $detail));

        // COMPANY_BILLING_SETTINGS (C7)
        $billing = json_decode($settings['COMPANY_BILLING_SETTINGS'] ?? 'null', true);
        $check('COMPANY_BILLING_SETTINGS is the pack\'s company profile', is_array($billing) && $billing['companyName'] === $pack['company']['name'] && $billing['iban'] === $pack['company']['iban'] && $billing['vatId'] === $pack['company']['vatId']);
        $check('VAT rates and default come from the country, not the currency', is_array($billing) && $billing['vatRates'] === $ctx['vatRates'] && $billing['defaultVatRate'] === $ctx['vatDefault']
            && in_array($billing['defaultVatRate'], $billing['vatRates'], true), json_encode([$billing['vatRates'] ?? null, $billing['defaultVatRate'] ?? null]));
        $check('payment due days, payment and shipping methods are written', is_array($billing) && $billing['defaultPaymentDueDays'] === 14 && count($billing['shippingMethods']) === 4 && in_array($billing['defaultPaymentMethod'], $billing['paymentMethods'], true));
        $check('offer default texts and four USP cards, placeholders resolved', is_array($billing) && count($billing['defaultUspCards']) === 4 && strpos($billing['defaultSocialProof'], '{') === false
            && strpos($billing['defaultSocialProof'], demo_ref_for($ctx['lang'], 'C6')['name']) !== false, (string)($billing['defaultSocialProof'] ?? ''));

        // Divisions (B13) and the system name
        $divisions = json_decode($settings['DIVISIONS'] ?? 'null', true);
        $colors = json_decode($settings['DIVISION_COLORS'] ?? 'null', true);
        $names = array_map(static fn($d) => $d['name'], $pack['divisions']);
        $check('DIVISIONS are the edition\'s two, with a colour each; no Cstudios', $divisions === $names && is_array($colors) && array_keys($colors) === $names && stripos(json_encode($divisions), 'cstudios') === false, json_encode([$divisions, $colors]));
        $check('SYSTEM_NAME is the brand', ($settings['SYSTEM_NAME'] ?? '') === $pack['brand']);
        $check('SYSTEM_LANGUAGE / SYSTEM_CURRENCY are left alone', $settings['SYSTEM_LANGUAGE'] === $ctx['lang'] && $settings['SYSTEM_CURRENCY'] === $ctx['currency']);

        // A re-run keeps an existing password hash and honours resetCompany = false.
        $id = 'u-' . md5(strtolower($pack['users']['owner']['email']));
        $db->prepare('UPDATE `users` SET `password_hash` = ?, `name` = ? WHERE `id` = ?')->execute(['kept-hash', 'Renamed', $id]);
        $db->setSetting('DIVISIONS', '["Hand made"]');
        demo_seed_all($db, ['only' => ['company'], 'resetCompany' => false, 'writeDataset' => false]);
        $row = null;
        foreach ($db->rows('users') as $u) if ($u['id'] === $id) $row = $u;
        $check('a re-seed keeps an existing password hash and restores the pack name', $row !== null && $row['password_hash'] === 'kept-hash' && $row['name'] === $pack['users']['owner']['name']);
        $check('resetCompany = false leaves the company profile and divisions alone', ($db->settings()['DIVISIONS'] ?? '') === '["Hand made"]');
        demo_seed_all($db, ['only' => ['company'], 'writeDataset' => false]);
        $check('resetCompany (default) rewrites them', ($db->settings()['DIVISIONS'] ?? '') === json_encode($names, JSON_UNESCAPED_UNICODE));
    },
];
