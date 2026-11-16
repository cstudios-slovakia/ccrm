<?php
/**
 * Schema helpers: timeline duplicate cleanup, list-id and task-state migrations, language-aware
 * default settings and the ticket SLA backfill. Required by schema.php (and part of
 * ccrm_schema_fingerprint()), so editing it re-runs the migrations.
 */

if (!function_exists('ccrm_migrate_list_ids')) {
    /**
     * Drop timeline rows that are exact copies of another row on the same lead.
     *
     * The duplicate-key handler in sync.php used to mint a new id and insert
     * again, so one imported note became thousands of identical rows. The row
     * that is kept is the original id when one is present (anything that is
     * not the `ev-<uniqid>-<nnnn>` shape that handler minted). A blank amount
     * and a numeric zero compare equal, because the import stored NULL and the
     * cloned row stored 0 for the same offer. Different text, time, amount or
     * attachment stays.
     *
     * Idempotent: a second run finds nothing to delete. Runs on every schema
     * apply so a copy that appears later is still collapsed on the next deploy.
     */
    function ccrm_dedupe_exact_timeline_events(PDO $pdo): void {
        if (!ccrm_table_exists($pdo, 'timeline_events')) {
            return;
        }
        try {
            $optional = [];
            foreach (['mail_account', 'mail_owner', 'mail_has_body', 'mail_message_id'] as $col) {
                if (ccrm_column_exists($pdo, 'timeline_events', $col)) {
                    $optional[] = $col;
                }
            }
            $fields = array_merge(
                ['lead_id', 'type', 'timestamp', 'title', 'content', 'amount', 'file_name', 'file_size', 'file_type', 'attachments_json', 'extra_time', 'is_outgoing', 'author', 'audio_file', 'transcription', 'hidden'],
                $optional
            );
            $present = [];
            foreach ($fields as $field) {
                if (ccrm_column_exists($pdo, 'timeline_events', $field)) {
                    $present[] = $field;
                }
            }
            $sql = 'SELECT `id`, `' . implode('`, `', $present) . '` FROM `timeline_events`';
            $rows = $pdo->query($sql);
            if ($rows === false) {
                return;
            }
            $groups = [];
            while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
                $id = (string)$row['id'];
                unset($row['id']);
                $norm = [];
                foreach ($row as $field => $value) {
                    if ($value === null) {
                        $norm[$field] = null;
                    } elseif (is_string($value) && trim($value) === '') {
                        $norm[$field] = null;
                    } elseif ($field === 'amount') {
                        $norm[$field] = is_numeric($value) && (float)$value == 0.0 ? null : (is_numeric($value) ? (string)(0 + $value) : (string)$value);
                    } elseif ($field === 'hidden' || $field === 'is_outgoing' || $field === 'mail_has_body') {
                        $norm[$field] = (string)(int)$value;
                    } else {
                        $norm[$field] = (string)$value;
                    }
                }
                $encoded = json_encode($norm, JSON_UNESCAPED_UNICODE);
                if ($encoded === false) {
                    $encoded = serialize($norm);
                }
                $groups[$row['lead_id'] . "\n" . hash('sha256', $encoded)][] = $id;
            }
            $drop = [];
            foreach ($groups as $ids) {
                if (count($ids) < 2) {
                    continue;
                }
                usort($ids, 'ccrm_timeline_dedupe_prefer');
                for ($i = 1, $n = count($ids); $i < $n; $i++) {
                    $drop[] = $ids[$i];
                }
            }
            if (!$drop) {
                return;
            }
            $del = $pdo->prepare('DELETE FROM `timeline_events` WHERE `id` = ?');
            $pdo->beginTransaction();
            try {
                foreach ($drop as $id) {
                    $del->execute([$id]);
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            error_log('[ccrm schema] removed ' . count($drop) . ' exact duplicate timeline event(s); one copy of each distinct event was kept.');
        } catch (\Throwable $e) {
            error_log('[ccrm schema] timeline dedupe failed: ' . $e->getMessage());
            throw $e;
        }
    }

    /** Prefer the original event id over a clone minted by the old duplicate-key retry. */
    function ccrm_timeline_dedupe_prefer(string $a, string $b): int {
        $rank = static function (string $id): int {
            return preg_match('/^ev-[0-9a-f]{13}-\d{4}$/i', $id) ? 1 : 0;
        };
        $byRank = $rank($a) <=> $rank($b);
        return $byRank !== 0 ? $byRank : strcmp($a, $b);
    }

    /**
     * Freeze the numeric ids that /api/pipeline.php resolves `source_id` and
     * `category_id` against.
     *
     * Until 1.9.19 there was no id to store: the number WAS the item's position
     * in LEAD_SOURCES / LEAD_CATEGORIES, so reordering either list in Settings
     * silently re-pointed every form already live on the customer's website.
     * Seeding from the current order — which is exactly what the positional
     * scheme was handing out right up to this upgrade — makes today's numbers
     * permanent rather than incidental, so no existing integration changes
     * meaning on the way in.
     *
     * Runs once per list: a map that already exists is the operator's, and
     * re-deriving it from the order is the very bug this removes.
     */
    function ccrm_migrate_list_ids(PDO $pdo): void {
        $pairs = [
            'LEAD_SOURCES' => 'LEAD_SOURCE_IDS',
            'LEAD_CATEGORIES' => 'LEAD_CATEGORY_IDS',
        ];
        try {
            $read = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = ?");
            $write = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
            foreach ($pairs as $listKey => $idsKey) {
                $read->execute([$idsKey]);
                $existing = json_decode((string)$read->fetchColumn(), true);
                if (is_array($existing) && $existing) continue; // already seeded

                $read->execute([$listKey]);
                $names = json_decode((string)$read->fetchColumn(), true);
                if (!is_array($names) || !$names) continue; // list not configured yet

                $write->execute([$idsKey, json_encode(ccrm_normalize_list_ids($names, []), JSON_UNESCAPED_UNICODE)]);
            }
        } catch (\Throwable $e) {
            // Never block a sync over this. pipeline.php normalises on the fly
            // from the same list, so an unseeded install still resolves ids —
            // this only makes the answer durable.
            if (function_exists('ccrm_log_exception')) { ccrm_log_exception($e); }
        }
    }

    /**
     * Task states used to exist only as hardcoded English defaults in the
     * frontend — they were never seeded, so an installation in Slovak/Hungarian
     * still showed "New / In progress / Blocked / Done" in grey. Seed them once,
     * in the language the CRM was installed in, and carry existing task records
     * over to the localised labels so nothing loses its column on the board.
     */
    function ccrm_migrate_task_states(PDO $pdo): void {
        try {
            $existing = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TASK_STATES'")->fetchColumn();
        } catch (\Throwable $e) {
            return; // system_settings not provisioned yet — nothing to migrate.
        }
        $decoded = is_string($existing) ? json_decode($existing, true) : null;
        if (is_array($decoded) && $decoded) {
            return; // Already configured by the operator; never touch their labels.
        }

        $language = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
        $lists = ccrm_default_lists(is_string($language) ? $language : 'sk');
        $taskStates = $lists['taskStates'];

        $insSet = $pdo->prepare("INSERT INTO `system_settings` (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)");
        $insSet->execute(['TASK_STATES', json_encode($taskStates, JSON_UNESCAPED_UNICODE)]);
        $insSet->execute(['TASK_STATE_COLORS', json_encode(ccrm_default_task_state_colors($taskStates), JSON_UNESCAPED_UNICODE)]);

        // Every label a task could be carrying before this migration: the English
        // defaults the frontend shipped with, plus the legacy pre-1.0 slugs.
        $legacyByPosition = [
            0 => ['New', 'todo'],
            1 => ['In progress', 'in_progress'],
            2 => ['Blocked', 'blocked'],
            3 => ['Done', 'done'],
        ];
        $rename = $pdo->prepare("UPDATE `tasks` SET `status` = ? WHERE `status` = ?"); /* recurring-template: schema and migrations */
        foreach ($legacyByPosition as $index => $legacyLabels) {
            if (!isset($taskStates[$index])) continue;
            foreach ($legacyLabels as $legacy) {
                if ($legacy === $taskStates[$index]) continue;
                $rename->execute([$taskStates[$index], $legacy]);
            }
        }
    }

    /**
     * Permanent numeric ids for the two operator-editable lists a website form
     * can address by number: LEAD_SOURCES (`source_id`) and LEAD_CATEGORIES
     * (`category_id`) in the /api/pipeline.php payload.
     *
     * Mirror of normalizeListIds in src/utils/listIds.ts — the rules, and why an
     * id may never be derived from a list position, are written out there. Both
     * ends must build the same map from the same inputs, or the settings sync
     * would push the difference back and forth forever.
     */
    function ccrm_normalize_list_ids($names, $saved): array {
        $out = [];
        // A JSON list ([...]) is not a name -> id map; only an object is.
        $isMap = is_array($saved) && (!$saved || array_keys($saved) !== range(0, count($saved) - 1));
        if ($isMap) {
            foreach ($saved as $key => $value) {
                $id = (int)$value;
                if ((string)$key !== '' && $id > 0) {
                    $out[(string)$key] = $id;
                }
            }
        }

        $list = [];
        foreach ((is_array($names) ? $names : []) as $name) {
            if (is_string($name) && $name !== '') $list[] = $name;
        }

        $missing = [];
        foreach ($list as $name) {
            if (!isset($out[$name])) $missing[$name] = true;
        }
        if (!$missing) return $out;

        // Nothing usable stored: reproduce the old positional numbering one last
        // time, so the ids frozen here are the ones live forms already send.
        if (!$out) {
            foreach (array_values($list) as $idx => $name) {
                if (!isset($out[$name])) $out[$name] = $idx + 1;
            }
            return $out;
        }

        $next = max($out) + 1;
        foreach (array_keys($missing) as $name) {
            $out[(string)$name] = $next++;
        }
        return $out;
    }

    /**
     * The list entry an incoming `source_id` / `category_id` names, or null when
     * nothing answers to it.
     *
     * Deliberately walks the live list rather than the id map: an id retired by
     * a deletion stays in the map as a tombstone precisely so it can never be
     * re-issued, and it must not resolve to anything either.
     */
    function ccrm_resolve_list_id(int $id, $names, $savedIds): ?string {
        if ($id <= 0 || !is_array($names)) return null;
        $ids = ccrm_normalize_list_ids($names, $savedIds);
        foreach ($names as $name) {
            if (!is_string($name) || $name === '') continue;
            if (isset($ids[$name]) && (int)$ids[$name] === $id) return $name;
        }
        return null;
    }

    /**
     * Colour map for task states. Blue → amber → red → green reads as a natural
     * workflow; states beyond the fourth cycle through the same palette.
     */
    function ccrm_default_task_state_colors(array $taskStates): array {
        $palette = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6'];
        $colors = [];
        foreach (array_values($taskStates) as $i => $state) {
            $colors[(string)$state] = $palette[$i % count($palette)];
        }
        return $colors;
    }

    /**
     * The full set of `system_settings` rows a fresh installation starts with,
     * seeded in the installation language. Shared by the setup wizard and the
     * "wipe demo data + reset configuration" reset so the two can never drift.
     */
    function ccrm_default_settings_for_language(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }
        $lists = ccrm_default_lists($language);

        $leadStates = $lists['leadStates'];
        $leadSources = $lists['leadSources'];
        $leadCategories = $lists['leadCategories'];
        $divisions = $lists['divisions'] ?? [];
        $taskStates = $lists['taskStates'];

        $enc = static function ($value): string {
            return json_encode($value, JSON_UNESCAPED_UNICODE);
        };

        return [
            'SYSTEM_NAME' => '', // no custom name: the client shows Koperniq
            'SYSTEM_LANGUAGE' => $language,
            'LEAD_STATES' => $enc($leadStates),
            'LEAD_SOURCES' => $enc($leadSources),
            'LEAD_CATEGORIES' => $enc($leadCategories),
            'DIVISIONS' => $enc($divisions),
            // Permanent ids for the two lists /api/pipeline.php addresses by
            // number. See ccrm_normalize_list_ids: these must never be derived
            // from list order, or reordering re-points live web forms.
            'LEAD_SOURCE_IDS' => $enc(ccrm_normalize_list_ids($leadSources, [])),
            'LEAD_CATEGORY_IDS' => $enc(ccrm_normalize_list_ids($leadCategories, [])),
            'LEAD_STATE_COLORS' => $enc(array_combine($leadStates, ['#3b82f6', '#0ea5e9', '#6366f1', '#10b981', '#ef4444'])),
            'LEAD_SOURCE_COLORS' => $enc(array_combine($leadSources, ['#10b981', '#3b82f6', '#ec4899', '#8b5cf6'])),
            'LEAD_CATEGORY_COLORS' => $enc(array_combine($leadCategories, ['#f59e0b', '#10b981'])),
            'DIVISION_COLORS' => $enc((object)[]),
            'LEAD_STAGE_GROUPS' => $enc(array_combine($leadStates, ['new', 'in_progress', 'in_progress', 'closed', 'closed'])),
            'LEAD_STATE_PARENTS' => $enc((object)[]),
            'TASK_STATES' => $enc($taskStates),
            'TASK_STATE_COLORS' => $enc(ccrm_default_task_state_colors($taskStates)),
            'INTEGRATIONS_CONFIG' => $enc(['disabledModules' => ['agency']]),
            'AGENCY_DEFAULT_DISABLED_V1' => '1',
        ];
    }

    /**
     * The sample 3-level financial category tree the demo `finance` module writes
     * into an empty financial_categories table (api/demo_seed/finance.php). A real
     * installation starts empty. Deliberately generic — any
     * small business selling products or services should recognise it — with
     * each name given once per supported language.
     */
    function ccrm_default_financial_categories(string $language): array {
        if (!in_array($language, ['en', 'sk', 'hu'], true)) {
            $language = 'sk';
        }

        // [id, type, parent_id, level, color, icon, [en, sk, hu]]
        $tree = [
            // Incomes
            ['fc-inc-sales', 'income', null, 1, '#10b981', 'Package', ['Sales', 'Predaj', 'Értékesítés']],
            ['fc-inc-sales-products', 'income', 'fc-inc-sales', 2, '#059669', 'Box', ['Products & goods', 'Produkty a tovar', 'Termékek és áruk']],
            ['fc-inc-sales-online', 'income', 'fc-inc-sales', 2, '#34d399', 'Globe', ['E-shop & online sales', 'E-shop a online predaj', 'Webshop és online értékesítés']],
            ['fc-inc-services', 'income', null, 1, '#3b82f6', 'Wrench', ['Services', 'Služby', 'Szolgáltatások']],
            ['fc-inc-svc-projects', 'income', 'fc-inc-services', 2, '#2563eb', 'Briefcase', ['Project work', 'Projektové práce', 'Projektmunkák']],
            ['fc-inc-svc-consulting', 'income', 'fc-inc-services', 2, '#60a5fa', 'UserCheck', ['Consulting', 'Poradenstvo', 'Tanácsadás']],
            ['fc-inc-svc-support', 'income', 'fc-inc-services', 2, '#93c5fd', 'Shield', ['Support & maintenance', 'Podpora a údržba', 'Támogatás és karbantartás']],
            ['fc-inc-recurring', 'income', null, 1, '#0891b2', 'TrendingUp', ['Recurring revenue', 'Opakované príjmy', 'Ismétlődő bevételek']],
            ['fc-inc-rec-subscriptions', 'income', 'fc-inc-recurring', 2, '#06b6d4', 'Circle', ['Subscriptions & retainers', 'Predplatné a paušály', 'Előfizetések és átalánydíjak']],
            ['fc-inc-other', 'income', null, 1, '#8b5cf6', 'Coins', ['Other income', 'Ostatné príjmy', 'Egyéb bevételek']],

            // Expenses
            ['fc-exp-cogs', 'expense', null, 1, '#ef4444', 'Package', ['Goods & materials', 'Nákup tovaru a materiálu', 'Áru- és anyagbeszerzés']],
            ['fc-exp-cogs-goods', 'expense', 'fc-exp-cogs', 2, '#dc2626', 'Box', ['Goods for resale', 'Tovar na predaj', 'Továbbértékesítési áru']],
            ['fc-exp-cogs-materials', 'expense', 'fc-exp-cogs', 2, '#f87171', 'Layers', ['Materials & supplies', 'Materiál a spotrebný tovar', 'Anyagok és fogyóeszközök']],
            ['fc-exp-cogs-shipping', 'expense', 'fc-exp-cogs', 2, '#ea580c', 'Truck', ['Shipping & delivery', 'Doprava a doručenie', 'Szállítás és kiszállítás']],
            ['fc-exp-marketing', 'expense', null, 1, '#f59e0b', 'Megaphone', ['Marketing & advertising', 'Marketing a reklama', 'Marketing és hirdetés']],
            ['fc-exp-mkt-online', 'expense', 'fc-exp-marketing', 2, '#d97706', 'Globe', ['Online advertising', 'Online reklama', 'Online hirdetések']],
            ['fc-exp-mkt-meta', 'expense', 'fc-exp-mkt-online', 3, '#fbbf24', 'Share2', ['Meta (Facebook / Instagram)', 'Meta (Facebook / Instagram)', 'Meta (Facebook / Instagram)']],
            ['fc-exp-mkt-google', 'expense', 'fc-exp-mkt-online', 3, '#f59e0b', 'Search', ['Google Ads', 'Google Ads', 'Google Ads']],
            ['fc-exp-mkt-seo', 'expense', 'fc-exp-mkt-online', 3, '#b45309', 'TrendingUp', ['SEO', 'SEO', 'SEO']],
            ['fc-exp-mkt-creative', 'expense', 'fc-exp-marketing', 2, '#fb923c', 'PenTool', ['Agency, design & content', 'Agentúra, grafika a obsah', 'Ügynökség, grafika és tartalom']],
            ['fc-exp-payroll', 'expense', null, 1, '#8b5cf6', 'Users', ['Payroll & contractors', 'Mzdy a externisti', 'Bérek és alvállalkozók']],
            ['fc-exp-pay-salaries', 'expense', 'fc-exp-payroll', 2, '#7c3aed', 'Briefcase', ['Salaries & contributions', 'Mzdy a odvody', 'Bérek és járulékok']],
            ['fc-exp-pay-contractors', 'expense', 'fc-exp-payroll', 2, '#6d28d9', 'UserCheck', ['Contractors & freelancers', 'Externisti a živnostníci', 'Alvállalkozók és szabadúszók']],
            ['fc-exp-pay-comm', 'expense', 'fc-exp-payroll', 2, '#a78bfa', 'Percent', ['Commissions', 'Provízie', 'Jutalékok']],
            ['fc-exp-overhead', 'expense', null, 1, '#0891b2', 'Building', ['Operations & overhead', 'Prevádzka a réžia', 'Működés és rezsi']],
            ['fc-exp-ovh-rent', 'expense', 'fc-exp-overhead', 2, '#0e7490', 'Home', ['Rent', 'Nájom priestorov', 'Bérleti díj']],
            ['fc-exp-ovh-util', 'expense', 'fc-exp-overhead', 2, '#06b6d4', 'FileText', ['Utilities & telecom', 'Energie a telekomunikácie', 'Rezsi és telekommunikáció']],
            ['fc-exp-ovh-software', 'expense', 'fc-exp-overhead', 2, '#22d3ee', 'Layers', ['Software & subscriptions', 'Softvér a predplatné', 'Szoftverek és előfizetések']],
            ['fc-exp-ovh-travel', 'expense', 'fc-exp-overhead', 2, '#67e8f9', 'Truck', ['Travel', 'Cestovné', 'Utazás']],
            ['fc-exp-admin', 'expense', null, 1, '#64748b', 'FileText', ['Admin & professional services', 'Administratíva a služby', 'Adminisztráció és szakmai szolgáltatások']],
            ['fc-exp-adm-accounting', 'expense', 'fc-exp-admin', 2, '#475569', 'FileText', ['Accounting & legal', 'Účtovníctvo a právne služby', 'Könyvelés és jogi szolgáltatások']],
            ['fc-exp-adm-insurance', 'expense', 'fc-exp-admin', 2, '#94a3b8', 'Shield', ['Insurance', 'Poistenie', 'Biztosítás']],
            ['fc-exp-adm-bank', 'expense', 'fc-exp-admin', 2, '#cbd5e1', 'Coins', ['Bank fees', 'Bankové poplatky', 'Banki díjak']],
            ['fc-exp-adm-taxes', 'expense', 'fc-exp-admin', 2, '#334155', 'Percent', ['Taxes & fees', 'Dane a poplatky', 'Adók és illetékek']],
        ];

        $nameIndex = ['en' => 0, 'sk' => 1, 'hu' => 2][$language];
        return array_map(static function (array $c) use ($nameIndex): array {
            return [
                'id' => $c[0],
                'type' => $c[1],
                'name' => $c[6][$nameIndex],
                'parent_id' => $c[2],
                'level' => $c[3],
                'color' => $c[4],
                'icon' => $c[5],
            ];
        }, $tree);
    }

    /**
     * Restores `tickets.resolve_due_at` lost by the sync key mismatch: tickets created
     * in the Tickets view sent `resolutionDueAt`, which sync.php did not read, so the
     * resolution SLA was stored as NULL. Recomputed as created_at + the priority's
     * resolution target, with the same precedence as ccrm_compute_ticket_sla():
     * the project's or client's support contract hours, then TICKET_SETTINGS
     * (`resolutionMins` or `resolveHours`), then the built-in default.
     *
     * Only manual tickets are touched (the widget and e-mail paths always stored a
     * value) and only where the column is NULL, so it is idempotent. Pauses were never
     * recorded, so none are added. created_at is used in whatever clock it was written.
     */
    function ccrm_backfill_ticket_resolve_due(PDO $pdo): void {
        try {
            if (!ccrm_table_exists($pdo, 'tickets') || !ccrm_column_exists($pdo, 'tickets', 'resolve_due_at')) return;
            $rows = $pdo->query(
                "SELECT `id`, `priority`, `project_id`, `client_id`, `created_at` FROM `tickets`
                 WHERE `resolve_due_at` IS NULL AND `source` = 'manual' AND `created_at` IS NOT NULL"
            )->fetchAll(PDO::FETCH_ASSOC);
            if (empty($rows)) return;

            $defaults = ['critical' => 240, 'high' => 480, 'normal' => 1440, 'low' => 2880];
            $targetMins = $defaults;
            if (ccrm_table_exists($pdo, 'system_settings')) {
                $raw = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'TICKET_SETTINGS' LIMIT 1")->fetchColumn();
                $decoded = $raw ? json_decode((string)$raw, true) : null;
                if (is_array($decoded) && isset($decoded['slaTargets']) && is_array($decoded['slaTargets'])) {
                    foreach ($defaults as $prio => $def) {
                        $t = $decoded['slaTargets'][$prio] ?? null;
                        if (!is_array($t)) continue;
                        if (isset($t['resolutionMins']) && (float)$t['resolutionMins'] > 0) {
                            $targetMins[$prio] = (int)round((float)$t['resolutionMins']);
                        } elseif (isset($t['resolveHours']) && (float)$t['resolveHours'] > 0) {
                            $targetMins[$prio] = (int)round(((float)$t['resolveHours']) * 60);
                        }
                    }
                }
            }

            $contracts = [];
            if (ccrm_table_exists($pdo, 'support_contracts')) {
                $contracts = $pdo->query("SELECT * FROM `support_contracts` ORDER BY `created_at` ASC")->fetchAll(PDO::FETCH_ASSOC) ?: [];
            }

            $upd = $pdo->prepare("UPDATE `tickets` SET `resolve_due_at` = ? WHERE `id` = ? AND `resolve_due_at` IS NULL");
            foreach ($rows as $r) {
                $prio = isset($targetMins[$r['priority'] ?? '']) ? (string)$r['priority'] : 'normal';
                $mins = $targetMins[$prio];
                foreach ($contracts as $sc) {
                    $matches = (!empty($r['project_id']) && ($sc['project_id'] ?? null) === $r['project_id'])
                        || (!empty($r['client_id']) && ($sc['client_id'] ?? null) === $r['client_id']);
                    if (!$matches) continue;
                    $hours = (float)($sc['sla_resolve_' . $prio . '_hours'] ?? 0);
                    if ($hours > 0) $mins = (int)round($hours * 60);
                    break;
                }
                $createdTs = strtotime((string)$r['created_at']);
                if ($createdTs === false) continue;
                $upd->execute([date('Y-m-d H:i:s', $createdTs + $mins * 60), $r['id']]);
            }
        } catch (\Throwable $e) {
            error_log('[ccrm] ccrm_backfill_ticket_resolve_due: ' . $e->getMessage());
        }
    }
}
