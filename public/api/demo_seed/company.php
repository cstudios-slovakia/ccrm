<?php
/**
 * Demo module `company` - runs first (api/demo_seed/index.php).
 *
 * Writes who the demo company is, from packs/<lang>/company.php:
 *  - COMPANY_BILLING_SETTINGS (C7): profile, bank, VAT rates and default VAT for the
 *    pack's country, shipping/payment methods, the offer default texts and USP cards;
 *  - DIVISIONS + DIVISION_COLORS (the edition's two divisions, B13) and SYSTEM_NAME;
 *  - the three demo logins, with the pack's display names and e-mails (B6), each with
 *    the sidebar sorted into labelled groups (`sidebarGroups` in the pack, merged into
 *    users.metadata_json.preferences; other stored preferences are kept).
 *
 * The company profile and divisions are written on install and on a re-seed with
 * `resetCompany = true` (demo_option('resetCompany', true)); the logins are always
 * upserted - every other module links to them. An existing password hash is kept;
 * `password` is set on insert only.
 *
 * The time-tracking holiday calendar needs no setting of its own: the server derives
 * it from COMPANY_BILLING_SETTINGS.country (ccrm_holiday_company_country(): SK / HU,
 * anything else falls back to SK). demo_ctx()['holidayCountry'] says what B9 intends
 * for the edition (null for the English one) - the time module reads that.
 *
 * Returns the number of rows written (settings + users); the preferences merge is an
 * UPDATE of those user rows and does not count.
 */
require_once __DIR__ . '/helpers.php';

if (!function_exists('demo_seed_company')) {

    function demo_company_put_setting(PDO $pdo, string $key, string $value): void {
        $pdo->prepare(
            "INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        )->execute([$key, $value]);
    }

    /**
     * The role label stored in `users.role` for a pack role key. Same mapping as
     * ccrm_normalize_role (auth.php), written out so the seeder does not depend
     * on auth.php having been loaded by whoever runs it.
     */
    function demo_company_role_label(string $packRole): string {
        $folded = strtolower(str_replace(' ', '_', trim($packRole)));
        if ($folded === 'admin') return 'Admin';
        if ($folded === 'project_manager') return 'Project Manager';
        if ($folded === 'viewer') return 'Viewer';
        return trim($packRole);
    }

    /** The COMPANY_BILLING_SETTINGS object for this edition (placeholders resolved). */
    function demo_company_billing_settings(array $ctx, array $pack): array {
        $c = $pack['company'];
        $b = demo_text_deep($pack['billing']);
        return [
            'companyName' => $c['name'],
            'companySubtitle' => $c['subtitle'],
            'companyLogoUrl' => null,
            'street' => $c['street'],
            'city' => $c['city'],
            'postalCode' => $c['postalCode'],
            'country' => $c['country'],
            'companyId' => $c['companyId'],
            'taxId' => $c['taxId'],
            'vatId' => $c['vatId'],
            'email' => $c['email'],
            'phone' => $c['phone'],
            'phoneSecondary' => $c['phoneSecondary'],
            'website' => $c['website'],
            'iban' => $c['iban'],
            'swift' => $c['swift'],
            'bankName' => $c['bankName'],
            'defaultPaymentDueDays' => (int)$b['paymentDueDays'],
            'defaultVatRate' => $ctx['vatDefault'],
            'vatRates' => $ctx['vatRates'],
            'shippingMethods' => array_values($b['shippingMethods']),
            'paymentMethods' => array_values($b['paymentMethods']),
            'defaultPaymentMethod' => $b['defaultPaymentMethod'],
            'defaultWarrantyText' => $b['warrantyText'],
            'defaultDurationText' => $b['durationText'],
            'defaultStartDateText' => $b['startDateText'],
            'defaultNextSteps' => $b['nextSteps'],
            'defaultSocialProof' => $b['socialProof'],
            'defaultUspCards' => array_map(
                static fn(array $u): array => ['title' => $u['title'], 'subtitle' => $u['subtitle']],
                $b['usp']
            ),
        ];
    }

    /**
     * Put the pack's sidebar groups into one login's preferences blob. Only `sidebarGroups`
     * is written, so theme, favourites and the like survive a re-seed.
     *
     * A stored preferences blob is what tells the app a user has been seen
     * (hasStoredPrefs), which would also switch off the first-run module wizard for the
     * admin. Keep it for an admin who had no blob, exactly as a bare account would get it.
     */
    function demo_company_seed_sidebar(PDO $pdo, string $userId, bool $isAdmin, array $groups): void {
        $get = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE `id` = ?");
        $get->execute([$userId]);
        $raw = $get->fetchColumn();
        if ($raw === false) {
            return; // user not provisioned
        }
        $meta = json_decode((string)$raw, true);
        if (!is_array($meta)) {
            $meta = [];
        }
        $hadPrefs = isset($meta['preferences']) && is_array($meta['preferences']);
        $prefs = $hadPrefs ? $meta['preferences'] : [];
        $prefs['sidebarGroups'] = array_values($groups);
        if (!$hadPrefs && $isAdmin) {
            $prefs['moduleWizardPending'] = true;
        }
        $meta['preferences'] = $prefs;
        $pdo->prepare("UPDATE `users` SET `metadata_json` = ? WHERE `id` = ?")->execute([
            json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $userId,
        ]);
    }

    function demo_seed_company(PDO $pdo): int {
        $ctx = demo_ctx($pdo);
        $pack = demo_pack($pdo, 'company');
        $json = static fn($v): string => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $rows = 0;

        if (demo_option('resetCompany', true)) {
            $colors = [];
            $names = [];
            foreach ($pack['divisions'] as $d) {
                $names[] = (string)$d['name'];
                $colors[(string)$d['name']] = (string)$d['color'];
            }
            demo_company_put_setting($pdo, 'COMPANY_BILLING_SETTINGS', $json(demo_company_billing_settings($ctx, $pack)));
            demo_company_put_setting($pdo, 'DIVISIONS', $json($names));
            demo_company_put_setting($pdo, 'DIVISION_COLORS', $json((object)$colors));
            demo_company_put_setting($pdo, 'SYSTEM_NAME', (string)$pack['brand']);
            $rows += 4;
        }

        // The three logins. Keep an existing hash; only a new row gets password "password".
        $ins = $pdo->prepare(
            "INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `avatar`, `color`)
             VALUES (?, ?, ?, ?, ?, NULL, ?)
             ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `role` = VALUES(`role`), `color` = VALUES(`color`)"
        );
        foreach (demo_users($pdo) as $u) {
            $ins->execute([
                $u['id'],
                $u['name'],
                strtolower((string)$u['email']),
                password_hash('password', PASSWORD_DEFAULT),
                // The pack says `admin` / `project_manager`; the registry and the
                // permission lookup speak in labels (Admin / Project Manager).
                demo_company_role_label((string)$u['role']),
                $u['color'],
            ]);
            $rows++;
            demo_company_seed_sidebar(
                $pdo,
                $u['id'],
                strtolower((string)$u['role']) === 'admin',
                $pack['sidebarGroups']
            );
        }
        return $rows;
    }
}
