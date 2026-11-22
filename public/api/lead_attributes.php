<?php
/**
 * Shared Lead Custom Fields helpers for auth.php and sync.php.
 */

if (!function_exists('ccrm_normalize_lead_attributes')) {
    /**
     * Global custom fields configured for Leads (Settings -> Leads -> Custom fields).
     * Mirrors ProjectAttribute in shape and supported types so values transfer seamlessly.
     */
    function ccrm_normalize_lead_attributes($raw): array {
        if (!is_array($raw)) {
            return [];
        }
        $validTypes = [
            'textfield', 'textarea', 'select', 'date', 'time', 'datetime',
            'number', 'money', 'checkbox', 'radio', 'files', 'contact',
        ];
        $optionTypes = ['select', 'radio', 'checkbox'];
        $out = [];
        $seen = [];

        foreach ($raw as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = trim((string)($item['id'] ?? ''));
            $name = trim((string)($item['name'] ?? ''));
            if ($id === '' || $name === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;

            $type = in_array((string)($item['type'] ?? ''), $validTypes, true)
                ? (string)$item['type']
                : 'textfield';

            $entry = [
                'id'       => $id,
                'name'     => $name,
                'type'     => $type,
                'required' => ($type === 'checkbox') ? false : !empty($item['required']),
            ];

            $options = null;
            if (in_array($type, $optionTypes, true) && isset($item['options']) && is_array($item['options'])) {
                $cleaned = [];
                $seenOpt = [];
                foreach ($item['options'] as $opt) {
                    $label = trim((string)$opt);
                    if ($label === '' || isset($seenOpt[$label])) {
                        continue;
                    }
                    $seenOpt[$label] = true;
                    $cleaned[] = $label;
                }
                if (!empty($cleaned) || $type !== 'checkbox') {
                    $options = $cleaned;
                    $entry['options'] = $cleaned;
                }
            }

            if ($type === 'checkbox') {
                $reqOpts = [];
                if ($options !== null && isset($item['requiredOptions']) && is_array($item['requiredOptions'])) {
                    $optSet = array_flip($options);
                    $seenReq = [];
                    foreach ($item['requiredOptions'] as $req) {
                        $r = trim((string)$req);
                        if ($r !== '' && isset($optSet[$r]) && !isset($seenReq[$r])) {
                            $seenReq[$r] = true;
                            $reqOpts[] = $r;
                        }
                    }
                }
                $entry['requiredOptions'] = $reqOpts;
            }

            $out[] = $entry;
        }
        return $out;
    }
}

if (!function_exists('ccrm_copy_lead_custom_fields_to_project')) {
    /**
     * Copies matching Lead custom field values (by normalized name + type, with scalar -> text fallback)
     * into the project's `proj_data_<typeId>` table and returns the hydrated data map.
     */
    function ccrm_copy_lead_custom_fields_to_project(\PDO $pdo, string $leadId, string $typeId, string $projectId): array {
        $projectData = [];
        try {
            $leadStmt = $pdo->prepare("SELECT `custom_fields_json` FROM `leads` WHERE `id` = ?");
            $leadStmt->execute([$leadId]);
            $leadCfRaw = $leadStmt->fetchColumn();
            $leadCf = (is_string($leadCfRaw) && $leadCfRaw !== '') ? json_decode($leadCfRaw, true) : null;

            $laStmt = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'LEAD_ATTRIBUTES'");
            $leadAttrs = $laStmt ? ccrm_normalize_lead_attributes(json_decode((string)$laStmt->fetchColumn(), true)) : [];

            $ptStmt = $pdo->prepare("SELECT `attributes_json` FROM `project_types` WHERE `id` = ?");
            $ptStmt->execute([$typeId]);
            $ptAttrsRaw = $ptStmt->fetchColumn();
            $ptAttrs = (is_string($ptAttrsRaw) && $ptAttrsRaw !== '') ? json_decode($ptAttrsRaw, true) : [];

            if (is_array($leadCf) && !empty($leadAttrs) && is_array($ptAttrs)) {
                $leadAttrByKey = [];
                foreach ($leadAttrs as $la) {
                    $k = strtolower(trim($la['name']));
                    if ($k !== '') {
                        $leadAttrByKey[$k][] = $la;
                    }
                }
                foreach ($ptAttrs as $pa) {
                    if (!is_array($pa) || empty($pa['id']) || empty($pa['name'])) {
                        continue;
                    }
                    $k = strtolower(trim((string)$pa['name']));
                    if (empty($leadAttrByKey[$k])) {
                        continue;
                    }
                    $pType = (string)($pa['type'] ?? 'textfield');
                    foreach ($leadAttrByKey[$k] as $la) {
                        $val = $leadCf[$la['id']] ?? null;
                        if ($val === null || $val === '' || $val === []) {
                            continue;
                        }
                        if ($la['type'] === $pType || (($pType === 'textfield' || $pType === 'textarea') && is_scalar($val))) {
                            $projectData[(string)$pa['id']] = $val;
                            break;
                        }
                    }
                }
            }

            $dataTable = 'proj_data_' . preg_replace('/[^a-z0-9_]/', '', strtolower($typeId));
            if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($dataTable))->rowCount() > 0) {
                if (!empty($projectData)) {
                    $cols = ['`id`', '`project_id`'];
                    $placeholders = ['?', '?'];
                    $vals = [$projectId, $projectId];
                    $updates = [];
                    foreach ($projectData as $attrId => $attrVal) {
                        $colName = 'attr_' . preg_replace('/[^a-zA-Z0-9_]/', '', $attrId);
                        if ($colName === 'attr_') {
                            continue;
                        }
                        $checkCol = $pdo->query("SHOW COLUMNS FROM `{$dataTable}` LIKE " . $pdo->quote($colName));
                        if (!$checkCol || $checkCol->rowCount() === 0) {
                            continue;
                        }
                        $cols[] = "`{$colName}`";
                        $placeholders[] = '?';
                        $vals[] = is_scalar($attrVal) ? $attrVal : json_encode($attrVal, JSON_UNESCAPED_UNICODE);
                        $updates[] = "`{$colName}` = VALUES(`{$colName}`)";
                    }
                    if (!empty($updates)) {
                        $sql = "INSERT INTO `{$dataTable}` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $placeholders) . ") ON DUPLICATE KEY UPDATE " . implode(', ', $updates);
                        $pdo->prepare($sql)->execute($vals);
                    } else {
                        $pdo->prepare("INSERT IGNORE INTO `{$dataTable}` (`id`, `project_id`) VALUES (?, ?)")
                            ->execute([$projectId, $projectId]);
                    }
                } else {
                    $pdo->prepare("INSERT IGNORE INTO `{$dataTable}` (`id`, `project_id`) VALUES (?, ?)")
                        ->execute([$projectId, $projectId]);
                }
            }
        } catch (\Throwable $e) {
            // Attributes stay empty; the project itself is already saved.
        }
        return $projectData;
    }
}
