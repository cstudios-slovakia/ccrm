<?php
/**
 * Dedicated REST API for the Agency & Workforce Leasing module (`agency`).
 * Never routed through sync.php.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/read_scope.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/agency_lib.php';

header('Content-Type: application/json');
ccrm_send_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}

$sessionUser = ccrm_require_auth();
$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'CRM not installed']);
    exit;
}
require_once $configFile;

try {
    $pdo = get_db_connection();
    ccrm_apply_schema($pdo);
} catch (\Throwable $e) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'Database error']);
    exit;
}

$scope = ccrm_read_scope($pdo, $sessionUser);
$userName = (string)($sessionUser['name'] ?? $sessionUser['email'] ?? 'System');
$userId = (string)($sessionUser['id'] ?? '');
$isAdmin = !empty($scope['isAdmin']);
$canViewAgency = ccrm_can($scope, 'agency');
$canEditAgency = ccrm_can_edit($scope, 'agency');
$canDeleteAgency = $canEditAgency && ccrm_can($scope, 'agency.delete');
$canPersonal = $canViewAgency && ccrm_can($scope, 'agency.personal');
$canPayments = $canViewAgency && ccrm_can($scope, 'agency.payments');
$canConfig = $isAdmin || ccrm_can_edit($scope, 'general_config');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $decoded = json_decode((string)$raw, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
$action = trim((string)($_GET['action'] ?? $body['action'] ?? ($method === 'GET' ? 'bootstrap' : '')));

function ccrm_agency_json(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

try {
    switch ($action) {
        case 'bootstrap': {
            $settings = ccrm_agency_load_settings($pdo);
            // Allow Settings screens to load agency configuration cleanly even while module is off.
            if (!$canViewAgency && !$canConfig) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            if (!$canViewAgency) {
                ccrm_agency_json([
                    'success' => true,
                    'settings' => $settings,
                    'workers' => [],
                    'placements' => [],
                    'workplaces' => [],
                    'checklists' => [],
                    'shifts' => [],
                    'payments' => [],
                ]);
            }

            $workers = [];
            foreach ($pdo->query("SELECT * FROM `agency_workers` ORDER BY `updated_at` DESC, `full_name` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $workers[] = ccrm_agency_project_worker($r, $scope);
            }

            $workplaces = [];
            foreach ($pdo->query("SELECT * FROM `agency_workplaces` ORDER BY `name` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $workplaces[] = [
                    'id' => (string)$r['id'],
                    'companyClientId' => (string)$r['company_client_id'],
                    'name' => (string)$r['name'],
                    'address' => (string)($r['address'] ?? ''),
                    'contactLeadId' => $r['contact_lead_id'] ? (string)$r['contact_lead_id'] : null,
                    'defaultShiftCode' => (string)($r['default_shift_code'] ?? ''),
                    'notes' => (string)($r['notes'] ?? ''),
                    'active' => intval($r['active'] ?? 1) === 1,
                ];
            }

            $placements = [];
            foreach ($pdo->query("SELECT * FROM `agency_placements` ORDER BY `start_date` DESC, `created_at` DESC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $placements[] = ccrm_agency_project_placement($r, $scope);
            }

            $checklists = [];
            foreach ($pdo->query("SELECT * FROM `agency_worker_checklists` ORDER BY `sort_order` ASC, `id` ASC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $checklists[] = [
                    'id' => (string)$r['id'],
                    'workerId' => (string)$r['worker_id'],
                    'itemKey' => (string)$r['item_key'],
                    'label' => (string)$r['label'],
                    'status' => (string)$r['status'],
                    'expiresAt' => $r['expires_at'] ? (string)$r['expires_at'] : null,
                    'note' => (string)($r['note'] ?? ''),
                    'fileId' => $r['file_id'] ? (string)$r['file_id'] : null,
                    'sortOrder' => intval($r['sort_order'] ?? 0),
                ];
            }

            $shiftFrom = trim((string)($_GET['from'] ?? date('Y-m-01', strtotime('-1 month'))));
            $shiftTo = trim((string)($_GET['to'] ?? date('Y-m-t', strtotime('+1 month'))));
            $shStmt = $pdo->prepare("SELECT * FROM `agency_shifts` WHERE `work_date` BETWEEN ? AND ? ORDER BY `work_date` ASC, `id` ASC");
            $shStmt->execute([$shiftFrom, $shiftTo]);
            $shifts = [];
            foreach ($shStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $shifts[] = [
                    'id' => (string)$r['id'],
                    'workerId' => (string)$r['worker_id'],
                    'placementId' => $r['placement_id'] ? (string)$r['placement_id'] : null,
                    'companyClientId' => (string)$r['company_client_id'],
                    'workplaceId' => $r['workplace_id'] ? (string)$r['workplace_id'] : null,
                    'workDate' => (string)$r['work_date'],
                    'shiftTemplateId' => $r['shift_template_id'] ? (string)$r['shift_template_id'] : null,
                    'shiftLabel' => (string)($r['shift_label'] ?? ''),
                    'startTime' => (string)($r['start_time'] ?? ''),
                    'endTime' => (string)($r['end_time'] ?? ''),
                    'hours' => floatval($r['hours'] ?? 0),
                    'overtimeHours' => floatval($r['overtime_hours'] ?? 0),
                    'status' => (string)($r['status'] ?? 'scheduled'),
                    'sickNote' => (string)($r['sick_note'] ?? ''),
                    'notes' => (string)($r['notes'] ?? ''),
                ];
            }

            $payments = [];
            if ($canPayments) {
                foreach ($pdo->query("SELECT * FROM `agency_payments` ORDER BY `period_ym` DESC")->fetchAll(PDO::FETCH_ASSOC) as $r) {
                    $payments[] = ccrm_agency_project_payment($r);
                }
            }

            ccrm_agency_json([
                'success' => true,
                'settings' => $settings,
                'workers' => $workers,
                'workplaces' => $workplaces,
                'placements' => $placements,
                'checklists' => $checklists,
                'shifts' => $shifts,
                'payments' => $payments,
            ]);
            break;
        }

        case 'worker_detail': {
            if (!$canViewAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $workerId = trim((string)($_GET['id'] ?? $body['id'] ?? ''));
            if ($workerId === '') {
                ccrm_agency_json(['success' => false, 'error' => 'Missing worker id'], 400);
            }
            $wStmt = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $wStmt->execute([$workerId]);
            $wRow = $wStmt->fetch(PDO::FETCH_ASSOC);
            if (!$wRow) {
                ccrm_agency_json(['success' => false, 'error' => 'Worker not found'], 404);
            }

            $plStmt = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `worker_id` = ? ORDER BY `start_date` DESC, `created_at` DESC");
            $plStmt->execute([$workerId]);
            $placements = array_map(static fn ($r) => ccrm_agency_project_placement($r, $scope), $plStmt->fetchAll(PDO::FETCH_ASSOC));

            $chkStmt = $pdo->prepare("SELECT * FROM `agency_worker_checklists` WHERE `worker_id` = ? ORDER BY `sort_order` ASC, `id` ASC");
            $chkStmt->execute([$workerId]);
            $checklist = array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'workerId' => (string)$r['worker_id'],
                'itemKey' => (string)$r['item_key'],
                'label' => (string)$r['label'],
                'status' => (string)$r['status'],
                'expiresAt' => $r['expires_at'] ? (string)$r['expires_at'] : null,
                'note' => (string)($r['note'] ?? ''),
                'fileId' => $r['file_id'] ? (string)$r['file_id'] : null,
                'sortOrder' => intval($r['sort_order'] ?? 0),
            ], $chkStmt->fetchAll(PDO::FETCH_ASSOC));

            $fStmt = $pdo->prepare("SELECT * FROM `agency_worker_files` WHERE `worker_id` = ? ORDER BY `created_at` DESC");
            $fStmt->execute([$workerId]);
            $files = [];
            foreach ($fStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $cat = (string)$r['category'];
                if (in_array($cat, ['passport', 'permit', 'id_doc', 'medical'], true) && !$canPersonal) {
                    continue;
                }
                $files[] = [
                    'id' => (string)$r['id'],
                    'workerId' => (string)$r['worker_id'],
                    'category' => $cat,
                    'checklistItemId' => $r['checklist_item_id'] ? (string)$r['checklist_item_id'] : null,
                    'fileName' => (string)$r['file_name'],
                    'mimeType' => (string)($r['mime_type'] ?? ''),
                    'sizeBytes' => intval($r['size_bytes'] ?? 0),
                    'uploadedBy' => (string)($r['uploaded_by'] ?? ''),
                    'createdAt' => (string)$r['created_at'],
                ];
            }

            $tlStmt = $pdo->prepare("SELECT * FROM `agency_timeline_events` WHERE `worker_id` = ? ORDER BY `occurred_at` DESC, `created_at` DESC LIMIT 400");
            $tlStmt->execute([$workerId]);
            $timeline = array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'workerId' => (string)$r['worker_id'],
                'eventType' => (string)$r['event_type'],
                'title' => (string)$r['title'],
                'description' => (string)($r['description'] ?? ''),
                'meta' => json_decode((string)($r['meta_json'] ?? '{}'), true) ?: (object)[],
                'occurredAt' => (string)$r['occurred_at'],
                'createdBy' => (string)($r['created_by'] ?? ''),
            ], $tlStmt->fetchAll(PDO::FETCH_ASSOC));

            $shStmt = $pdo->prepare("SELECT * FROM `agency_shifts` WHERE `worker_id` = ? ORDER BY `work_date` DESC LIMIT 180");
            $shStmt->execute([$workerId]);
            $shifts = array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'workerId' => (string)$r['worker_id'],
                'placementId' => $r['placement_id'] ? (string)$r['placement_id'] : null,
                'companyClientId' => (string)$r['company_client_id'],
                'workplaceId' => $r['workplace_id'] ? (string)$r['workplace_id'] : null,
                'workDate' => (string)$r['work_date'],
                'shiftTemplateId' => $r['shift_template_id'] ? (string)$r['shift_template_id'] : null,
                'shiftLabel' => (string)($r['shift_label'] ?? ''),
                'startTime' => (string)($r['start_time'] ?? ''),
                'endTime' => (string)($r['end_time'] ?? ''),
                'hours' => floatval($r['hours'] ?? 0),
                'overtimeHours' => floatval($r['overtime_hours'] ?? 0),
                'status' => (string)($r['status'] ?? 'scheduled'),
                'sickNote' => (string)($r['sick_note'] ?? ''),
                'notes' => (string)($r['notes'] ?? ''),
            ], $shStmt->fetchAll(PDO::FETCH_ASSOC));

            $payments = [];
            if ($canPayments) {
                $pStmt = $pdo->prepare("SELECT * FROM `agency_payments` WHERE `worker_id` = ? ORDER BY `period_ym` DESC");
                $pStmt->execute([$workerId]);
                $payments = array_map(static fn ($r) => ccrm_agency_project_payment($r), $pStmt->fetchAll(PDO::FETCH_ASSOC));
            }

            ccrm_agency_json([
                'success' => true,
                'worker' => ccrm_agency_project_worker($wRow, $scope),
                'placements' => $placements,
                'checklist' => $checklist,
                'files' => $files,
                'timeline' => $timeline,
                'shifts' => $shifts,
                'payments' => $payments,
            ]);
            break;
        }

        case 'save_worker': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $w = is_array($body['worker'] ?? null) ? $body['worker'] : $body;
            $fullName = trim((string)($w['fullName'] ?? ''));
            if ($fullName === '') {
                ccrm_agency_json(['success' => false, 'error' => 'Full name is required'], 400);
            }
            $id = trim((string)($w['id'] ?? ''));
            $isNew = ($id === '');
            if ($isNew) {
                $id = ccrm_agency_uid('agw');
            }
            $existing = null;
            if (!$isNew) {
                $st = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
                $st->execute([$id]);
                $existing = $st->fetch(PDO::FETCH_ASSOC);
                if (!$existing) {
                    $isNew = true;
                }
            }

            $incomingProfile = is_array($w['profile'] ?? null) ? $w['profile'] : [];
            $existingProfile = $existing && !empty($existing['profile_json'])
                ? (json_decode((string)$existing['profile_json'], true) ?: [])
                : [];
            if (!$canPersonal) {
                // Preserve hidden sensitive sections when caller lacks agency.personal.
                foreach (['passport', 'permit', 'addresses', 'family'] as $sec) {
                    if (isset($existingProfile[$sec])) {
                        $incomingProfile[$sec] = $existingProfile[$sec];
                    } else {
                        unset($incomingProfile[$sec]);
                    }
                }
            }
            $dateOfBirth = $canPersonal
                ? trim((string)($w['dateOfBirth'] ?? ($incomingProfile['applicant']['dateOfBirth'] ?? '')))
                : (string)($existing['date_of_birth'] ?? '');

            $payRate = $canPayments
                ? floatval($w['defaultPayRate'] ?? ($existing['default_pay_rate'] ?? 0))
                : floatval($existing['default_pay_rate'] ?? 0);
            $billRate = $canPayments
                ? floatval($w['defaultBillRate'] ?? ($existing['default_bill_rate'] ?? 0))
                : floatval($existing['default_bill_rate'] ?? 0);

            $stageId = trim((string)($w['stageId'] ?? ($existing['stage_id'] ?? 'sourced'))) ?: 'sourced';
            $workerStatus = trim((string)($w['workerStatus'] ?? ($existing['worker_status'] ?? 'candidate')));
            if (!in_array($workerStatus, ['candidate', 'rented', 'bench', 'archived'], true)) {
                $workerStatus = 'candidate';
            }
            $workerCode = trim((string)($w['workerCode'] ?? ($existing['worker_code'] ?? '')));
            if ($workerCode === '') {
                $workerCode = 'AGW-' . strtoupper(substr(md5($id), 0, 5));
            }
            $skills = is_array($w['skills'] ?? null) ? array_values($w['skills']) : [];

            $ins = $pdo->prepare(
                "INSERT INTO `agency_workers`
                  (`id`, `worker_code`, `full_name`, `preferred_name`, `email`, `phone`, `stage_id`, `worker_status`, `nationality`, `date_of_birth`, `profile_json`, `skills_json`, `notes`, `default_pay_rate`, `default_bill_rate`, `currency`, `assigned_recruiter`, `created_by`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `worker_code` = VALUES(`worker_code`),
                  `full_name` = VALUES(`full_name`),
                  `preferred_name` = VALUES(`preferred_name`),
                  `email` = VALUES(`email`),
                  `phone` = VALUES(`phone`),
                  `stage_id` = VALUES(`stage_id`),
                  `worker_status` = VALUES(`worker_status`),
                  `nationality` = VALUES(`nationality`),
                  `date_of_birth` = VALUES(`date_of_birth`),
                  `profile_json` = VALUES(`profile_json`),
                  `skills_json` = VALUES(`skills_json`),
                  `notes` = VALUES(`notes`),
                  `default_pay_rate` = VALUES(`default_pay_rate`),
                  `default_bill_rate` = VALUES(`default_bill_rate`),
                  `currency` = VALUES(`currency`),
                  `assigned_recruiter` = VALUES(`assigned_recruiter`)"
            );
            $ins->execute([
                $id,
                $workerCode,
                $fullName,
                trim((string)($w['preferredName'] ?? '')),
                trim((string)($w['email'] ?? '')),
                trim((string)($w['phone'] ?? '')),
                $stageId,
                $workerStatus,
                trim((string)($w['nationality'] ?? ($incomingProfile['applicant']['nationality'] ?? ''))),
                $dateOfBirth,
                json_encode($incomingProfile, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                json_encode($skills, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                (string)($w['notes'] ?? ''),
                $payRate,
                $billRate,
                trim((string)($w['currency'] ?? 'EUR')) ?: 'EUR',
                trim((string)($w['assignedRecruiter'] ?? '')),
                $userName,
            ]);

            $settings = ccrm_agency_load_settings($pdo);
            if ($isNew) {
                $chkCount = (int)$pdo->query("SELECT COUNT(*) FROM `agency_worker_checklists` WHERE `worker_id` = " . $pdo->quote($id))->fetchColumn();
                if ($chkCount === 0) {
                    $chkIns = $pdo->prepare(
                        "INSERT INTO `agency_worker_checklists` (`id`, `worker_id`, `item_key`, `label`, `status`, `sort_order`) VALUES (?, ?, ?, ?, 'pending', ?)"
                    );
                    $order = 0;
                    foreach ($settings['checklistItems'] ?? [] as $item) {
                        $lbl = is_array($item['label'] ?? null)
                            ? (string)($item['label']['en'] ?? reset($item['label']) ?: $item['key'])
                            : (string)($item['label'] ?? $item['key']);
                        $chkIns->execute([ccrm_agency_uid('agchk'), $id, (string)($item['key'] ?? ('item_' . $order)), $lbl, $order]);
                        $order++;
                    }
                }
                ccrm_agency_log_timeline($pdo, $id, 'stage_change', 'Profile Created', "Initial stage: {$stageId}", ['toStage' => $stageId], null, $userName);
            } elseif ($existing && (string)$existing['stage_id'] !== $stageId) {
                $from = (string)$existing['stage_id'];
                ccrm_agency_log_timeline($pdo, $id, 'stage_change', "Stage: {$from} → {$stageId}", '', ['fromStage' => $from, 'toStage' => $stageId], null, $userName);
            }

            $fresh = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            ccrm_agency_json(['success' => true, 'worker' => ccrm_agency_project_worker($fresh->fetch(PDO::FETCH_ASSOC), $scope)]);
            break;
        }

        case 'delete_worker': {
            if (!$canDeleteAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $id = trim((string)($body['id'] ?? $_GET['id'] ?? ''));
            if ($id === '') {
                ccrm_agency_json(['success' => false, 'error' => 'Missing worker id'], 400);
            }
            // Remove private files on disk first.
            $fStmt = $pdo->prepare("SELECT `storage_name` FROM `agency_worker_files` WHERE `worker_id` = ?");
            $fStmt->execute([$id]);
            foreach ($fStmt->fetchAll(PDO::FETCH_COLUMN) as $sName) {
                $p = ccrm_agency_private_path((string)$sName);
                if ($p) {
                    @unlink($p);
                }
            }
            foreach (['agency_worker_files', 'agency_worker_checklists', 'agency_timeline_events', 'agency_shifts', 'agency_placements', 'agency_payments'] as $tbl) {
                $pdo->prepare("DELETE FROM `{$tbl}` WHERE `worker_id` = ?")->execute([$id]);
            }
            $pdo->prepare("DELETE FROM `agency_workers` WHERE `id` = ?")->execute([$id]);
            ccrm_agency_json(['success' => true]);
            break;
        }

        case 'save_checklist': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $workerId = trim((string)($body['workerId'] ?? ''));
            $items = is_array($body['items'] ?? null) ? $body['items'] : [];
            if ($workerId === '') {
                ccrm_agency_json(['success' => false, 'error' => 'Missing workerId'], 400);
            }
            $ins = $pdo->prepare(
                "INSERT INTO `agency_worker_checklists` (`id`, `worker_id`, `item_key`, `label`, `status`, `expires_at`, `note`, `file_id`, `sort_order`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `label` = VALUES(`label`),
                  `status` = VALUES(`status`),
                  `expires_at` = VALUES(`expires_at`),
                  `note` = VALUES(`note`),
                  `file_id` = VALUES(`file_id`),
                  `sort_order` = VALUES(`sort_order`)"
            );
            $idx = 0;
            foreach ($items as $it) {
                if (!is_array($it)) continue;
                $cid = trim((string)($it['id'] ?? '')) ?: ccrm_agency_uid('agchk');
                $status = in_array($it['status'] ?? 'pending', ['pending', 'submitted', 'verified', 'expired'], true)
                    ? (string)$it['status']
                    : 'pending';
                $exp = !empty($it['expiresAt']) ? substr((string)$it['expiresAt'], 0, 10) : null;
                $ins->execute([
                    $cid,
                    $workerId,
                    trim((string)($it['itemKey'] ?? ('item_' . $idx))),
                    trim((string)($it['label'] ?? 'Item')),
                    $status,
                    $exp,
                    (string)($it['note'] ?? ''),
                    !empty($it['fileId']) ? (string)$it['fileId'] : null,
                    intval($it['sortOrder'] ?? $idx),
                ]);
                $idx++;
            }
            ccrm_agency_log_timeline($pdo, $workerId, 'compliance', 'Checklist updated', '', [], null, $userName);
            $chkStmt = $pdo->prepare("SELECT * FROM `agency_worker_checklists` WHERE `worker_id` = ? ORDER BY `sort_order` ASC, `id` ASC");
            $chkStmt->execute([$workerId]);
            $rows = array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'workerId' => (string)$r['worker_id'],
                'itemKey' => (string)$r['item_key'],
                'label' => (string)$r['label'],
                'status' => (string)$r['status'],
                'expiresAt' => $r['expires_at'] ? (string)$r['expires_at'] : null,
                'note' => (string)($r['note'] ?? ''),
                'fileId' => $r['file_id'] ? (string)$r['file_id'] : null,
                'sortOrder' => intval($r['sort_order'] ?? 0),
            ], $chkStmt->fetchAll(PDO::FETCH_ASSOC));
            ccrm_agency_json(['success' => true, 'checklist' => $rows]);
            break;
        }

        case 'delete_file': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $fileId = trim((string)($body['id'] ?? $_GET['id'] ?? ''));
            if ($fileId === '') {
                ccrm_agency_json(['success' => false, 'error' => 'Missing file id'], 400);
            }
            $st = $pdo->prepare("SELECT * FROM `agency_worker_files` WHERE `id` = ? LIMIT 1");
            $st->execute([$fileId]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $p = ccrm_agency_private_path((string)$row['storage_name']);
                if ($p) @unlink($p);
                $pdo->prepare("UPDATE `agency_worker_checklists` SET `file_id` = NULL WHERE `file_id` = ?")->execute([$fileId]);
                $pdo->prepare("DELETE FROM `agency_worker_files` WHERE `id` = ?")->execute([$fileId]);
            }
            ccrm_agency_json(['success' => true]);
            break;
        }

        case 'save_timeline_event': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $workerId = trim((string)($body['workerId'] ?? ''));
            $title = trim((string)($body['title'] ?? ''));
            if ($workerId === '' || $title === '') {
                ccrm_agency_json(['success' => false, 'error' => 'workerId and title required'], 400);
            }
            $event = ccrm_agency_log_timeline(
                $pdo,
                $workerId,
                (string)($body['eventType'] ?? 'note'),
                $title,
                (string)($body['description'] ?? ''),
                is_array($body['meta'] ?? null) ? $body['meta'] : [],
                isset($body['occurredAt']) ? (string)$body['occurredAt'] : null,
                $userName
            );
            ccrm_agency_json(['success' => true, 'event' => $event]);
            break;
        }

        case 'save_workplace': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $wp = is_array($body['workplace'] ?? null) ? $body['workplace'] : $body;
            $companyClientId = trim((string)($wp['companyClientId'] ?? ''));
            $name = trim((string)($wp['name'] ?? ''));
            if ($companyClientId === '' || $name === '') {
                ccrm_agency_json(['success' => false, 'error' => 'companyClientId and name required'], 400);
            }
            $id = trim((string)($wp['id'] ?? '')) ?: ccrm_agency_uid('agwp');
            $ins = $pdo->prepare(
                "INSERT INTO `agency_workplaces` (`id`, `company_client_id`, `name`, `address`, `contact_lead_id`, `default_shift_code`, `notes`, `active`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `name` = VALUES(`name`),
                  `address` = VALUES(`address`),
                  `contact_lead_id` = VALUES(`contact_lead_id`),
                  `default_shift_code` = VALUES(`default_shift_code`),
                  `notes` = VALUES(`notes`),
                  `active` = VALUES(`active`)"
            );
            $ins->execute([
                $id,
                $companyClientId,
                $name,
                trim((string)($wp['address'] ?? '')),
                !empty($wp['contactLeadId']) ? (string)$wp['contactLeadId'] : null,
                trim((string)($wp['defaultShiftCode'] ?? '')),
                (string)($wp['notes'] ?? ''),
                array_key_exists('active', $wp) ? (!empty($wp['active']) ? 1 : 0) : 1,
            ]);
            ccrm_agency_json([
                'success' => true,
                'workplace' => [
                    'id' => $id,
                    'companyClientId' => $companyClientId,
                    'name' => $name,
                    'address' => trim((string)($wp['address'] ?? '')),
                    'contactLeadId' => !empty($wp['contactLeadId']) ? (string)$wp['contactLeadId'] : null,
                    'defaultShiftCode' => trim((string)($wp['defaultShiftCode'] ?? '')),
                    'notes' => (string)($wp['notes'] ?? ''),
                    'active' => array_key_exists('active', $wp) ? (bool)$wp['active'] : true,
                ],
            ]);
            break;
        }

        case 'delete_workplace': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $id = trim((string)($body['id'] ?? $_GET['id'] ?? ''));
            if ($id !== '') {
                $pdo->prepare("DELETE FROM `agency_workplaces` WHERE `id` = ?")->execute([$id]);
            }
            ccrm_agency_json(['success' => true]);
            break;
        }

        case 'save_placement': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $pl = is_array($body['placement'] ?? null) ? $body['placement'] : $body;
            $workerId = trim((string)($pl['workerId'] ?? ''));
            $companyClientId = trim((string)($pl['companyClientId'] ?? ''));
            $startDate = substr(trim((string)($pl['startDate'] ?? date('Y-m-d'))), 0, 10);
            if ($workerId === '' || $companyClientId === '') {
                ccrm_agency_json(['success' => false, 'error' => 'workerId and companyClientId required'], 400);
            }
            $id = trim((string)($pl['id'] ?? ''));
            $isNew = ($id === '');
            if ($isNew) {
                $id = ccrm_agency_uid('agpl');
            }
            $existing = null;
            if (!$isNew) {
                $st = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `id` = ? LIMIT 1");
                $st->execute([$id]);
                $existing = $st->fetch(PDO::FETCH_ASSOC);
                if (!$existing) $isNew = true;
            }
            $status = in_array($pl['status'] ?? 'active', ['planned', 'active', 'completed', 'terminated'], true)
                ? (string)$pl['status']
                : 'active';
            $endDate = !empty($pl['endDate']) ? substr((string)$pl['endDate'], 0, 10) : null;

            $payRate = $canPayments
                ? floatval($pl['payRate'] ?? ($existing['pay_rate'] ?? 0))
                : floatval($existing['pay_rate'] ?? 0);
            $billRate = $canPayments
                ? floatval($pl['billRate'] ?? ($existing['bill_rate'] ?? 0))
                : floatval($existing['bill_rate'] ?? 0);
            $payRateType = in_array($pl['payRateType'] ?? 'hourly', ['hourly', 'monthly'], true) ? (string)$pl['payRateType'] : 'hourly';
            $billRateType = in_array($pl['billRateType'] ?? 'hourly', ['hourly', 'monthly'], true) ? (string)$pl['billRateType'] : 'hourly';
            $currency = trim((string)($pl['currency'] ?? 'EUR')) ?: 'EUR';
            $jobRole = trim((string)($pl['jobRole'] ?? ''));

            // If activating/transferring to a new active placement, close other active placements on this worker.
            if ($status === 'active') {
                $prevEnd = date('Y-m-d', strtotime($startDate . ' -1 day'));
                $pdo->prepare(
                    "UPDATE `agency_placements`
                     SET `status` = 'completed', `end_date` = COALESCE(`end_date`, ?)
                     WHERE `worker_id` = ? AND `id` <> ? AND `status` = 'active'"
                )->execute([$prevEnd, $workerId, $id]);
            }

            $ins = $pdo->prepare(
                "INSERT INTO `agency_placements`
                  (`id`, `worker_id`, `company_client_id`, `workplace_id`, `contact_lead_id`, `job_role`, `status`, `start_date`, `end_date`, `pay_rate`, `pay_rate_type`, `bill_rate`, `bill_rate_type`, `currency`, `notes`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `company_client_id` = VALUES(`company_client_id`),
                  `workplace_id` = VALUES(`workplace_id`),
                  `contact_lead_id` = VALUES(`contact_lead_id`),
                  `job_role` = VALUES(`job_role`),
                  `status` = VALUES(`status`),
                  `start_date` = VALUES(`start_date`),
                  `end_date` = VALUES(`end_date`),
                  `pay_rate` = VALUES(`pay_rate`),
                  `pay_rate_type` = VALUES(`pay_rate_type`),
                  `bill_rate` = VALUES(`bill_rate`),
                  `bill_rate_type` = VALUES(`bill_rate_type`),
                  `currency` = VALUES(`currency`),
                  `notes` = VALUES(`notes`)"
            );
            $ins->execute([
                $id,
                $workerId,
                $companyClientId,
                !empty($pl['workplaceId']) ? (string)$pl['workplaceId'] : null,
                !empty($pl['contactLeadId']) ? (string)$pl['contactLeadId'] : null,
                $jobRole,
                $status,
                $startDate,
                $endDate,
                $payRate,
                $payRateType,
                $billRate,
                $billRateType,
                $currency,
                (string)($pl['notes'] ?? ''),
            ]);

            // Sync worker status + placement timeline entry.
            $activeCntStmt = $pdo->prepare("SELECT COUNT(*) FROM `agency_placements` WHERE `worker_id` = ? AND `status` = 'active'");
            $activeCntStmt->execute([$workerId]);
            $hasActive = (int)$activeCntStmt->fetchColumn() > 0;
            if ($hasActive) {
                $pdo->prepare("UPDATE `agency_workers` SET `worker_status` = 'rented', `stage_id` = 'placed' WHERE `id` = ?")->execute([$workerId]);
            } else {
                $pdo->prepare("UPDATE `agency_workers` SET `worker_status` = 'bench' WHERE `id` = ? AND `worker_status` = 'rented'")->execute([$workerId]);
            }

            $compNameStmt = $pdo->prepare("SELECT `name` FROM `leads` WHERE `id` = ? LIMIT 1");
            $compNameStmt->execute([$companyClientId]);
            $compName = (string)($compNameStmt->fetchColumn() ?: $companyClientId);

            if ($isNew || ($existing && ((string)$existing['company_client_id'] !== $companyClientId || (string)$existing['status'] !== $status))) {
                $title = $status === 'active'
                    ? "Placed at {$compName}" . ($jobRole !== '' ? " ({$jobRole})" : '')
                    : "Placement {$status}: {$compName}";
                ccrm_agency_log_timeline($pdo, $workerId, 'placement', $title, (string)($pl['notes'] ?? ''), [
                    'placementId' => $id,
                    'companyClientId' => $companyClientId,
                    'companyName' => $compName,
                    'status' => $status,
                ], $startDate, $userName);
            }

            $fresh = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            ccrm_agency_json(['success' => true, 'placement' => ccrm_agency_project_placement($fresh->fetch(PDO::FETCH_ASSOC), $scope)]);
            break;
        }

        case 'save_shifts': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $rows = is_array($body['shifts'] ?? null) ? $body['shifts'] : [$body];
            $saved = [];
            $ins = $pdo->prepare(
                "INSERT INTO `agency_shifts`
                  (`id`, `worker_id`, `placement_id`, `company_client_id`, `workplace_id`, `work_date`, `shift_template_id`, `shift_label`, `start_time`, `end_time`, `hours`, `overtime_hours`, `status`, `sick_note`, `notes`, `created_by`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `placement_id` = VALUES(`placement_id`),
                  `workplace_id` = VALUES(`workplace_id`),
                  `shift_template_id` = VALUES(`shift_template_id`),
                  `shift_label` = VALUES(`shift_label`),
                  `start_time` = VALUES(`start_time`),
                  `end_time` = VALUES(`end_time`),
                  `hours` = VALUES(`hours`),
                  `overtime_hours` = VALUES(`overtime_hours`),
                  `status` = VALUES(`status`),
                  `sick_note` = VALUES(`sick_note`),
                  `notes` = VALUES(`notes`)"
            );

            foreach ($rows as $sh) {
                if (!is_array($sh)) continue;
                $workerId = trim((string)($sh['workerId'] ?? ''));
                $companyClientId = trim((string)($sh['companyClientId'] ?? ''));
                $workDate = substr(trim((string)($sh['workDate'] ?? '')), 0, 10);
                if ($workerId === '' || $companyClientId === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $workDate)) {
                    continue;
                }
                if (!$isAdmin && ccrm_agency_is_period_paid($pdo, $workerId, $workDate)) {
                    ccrm_agency_json(['success' => false, 'error' => 'Period already paid and locked for edits', 'code' => 'period_locked'], 409);
                }

                $prevStmt = $pdo->prepare("SELECT `status`, `hours`, `overtime_hours` FROM `agency_shifts` WHERE `worker_id` = ? AND `work_date` = ? AND `company_client_id` = ? LIMIT 1");
                $prevStmt->execute([$workerId, $workDate, $companyClientId]);
                $prev = $prevStmt->fetch(PDO::FETCH_ASSOC);

                $id = trim((string)($sh['id'] ?? '')) ?: ccrm_agency_uid('agsh');
                $status = in_array($sh['status'] ?? 'scheduled', ['scheduled', 'worked', 'sick', 'absent', 'holiday'], true)
                    ? (string)$sh['status']
                    : 'scheduled';
                $hours = floatval($sh['hours'] ?? 0);
                $ot = floatval($sh['overtimeHours'] ?? 0);
                $sickNote = (string)($sh['sickNote'] ?? '');
                $shiftLabel = (string)($sh['shiftLabel'] ?? '');

                $ins->execute([
                    $id,
                    $workerId,
                    !empty($sh['placementId']) ? (string)$sh['placementId'] : null,
                    $companyClientId,
                    !empty($sh['workplaceId']) ? (string)$sh['workplaceId'] : null,
                    $workDate,
                    !empty($sh['shiftTemplateId']) ? (string)$sh['shiftTemplateId'] : null,
                    $shiftLabel,
                    (string)($sh['startTime'] ?? ''),
                    (string)($sh['endTime'] ?? ''),
                    $status === 'sick' || $status === 'absent' ? 0 : $hours,
                    $status === 'sick' || $status === 'absent' ? 0 : $ot,
                    $status,
                    $sickNote,
                    (string)($sh['notes'] ?? ''),
                    $userName,
                ]);

                $prevStatus = $prev ? (string)$prev['status'] : null;
                if ($status === 'sick' && $prevStatus !== 'sick') {
                    ccrm_agency_log_timeline($pdo, $workerId, 'sick_leave', "Sick leave logged ({$workDate})", $sickNote, ['workDate' => $workDate, 'companyClientId' => $companyClientId], $workDate, $userName);
                } elseif ($status === 'worked' && $prevStatus !== 'worked') {
                    $totalH = $hours + $ot;
                    ccrm_agency_log_timeline($pdo, $workerId, 'work_log', trim("{$workDate}: {$shiftLabel} {$totalH}h"), '', ['workDate' => $workDate, 'hours' => $totalH, 'companyClientId' => $companyClientId], $workDate, $userName);
                }

                $st = $pdo->prepare("SELECT * FROM `agency_shifts` WHERE `worker_id` = ? AND `work_date` = ? AND `company_client_id` = ? LIMIT 1");
                $st->execute([$workerId, $workDate, $companyClientId]);
                $row = $st->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $saved[] = [
                        'id' => (string)$row['id'],
                        'workerId' => (string)$row['worker_id'],
                        'placementId' => $row['placement_id'] ? (string)$row['placement_id'] : null,
                        'companyClientId' => (string)$row['company_client_id'],
                        'workplaceId' => $row['workplace_id'] ? (string)$row['workplace_id'] : null,
                        'workDate' => (string)$row['work_date'],
                        'shiftTemplateId' => $row['shift_template_id'] ? (string)$row['shift_template_id'] : null,
                        'shiftLabel' => (string)($row['shift_label'] ?? ''),
                        'startTime' => (string)($row['start_time'] ?? ''),
                        'endTime' => (string)($row['end_time'] ?? ''),
                        'hours' => floatval($row['hours'] ?? 0),
                        'overtimeHours' => floatval($row['overtime_hours'] ?? 0),
                        'status' => (string)$row['status'],
                        'sickNote' => (string)($row['sick_note'] ?? ''),
                        'notes' => (string)($row['notes'] ?? ''),
                    ];
                }
            }
            ccrm_agency_json(['success' => true, 'shifts' => $saved]);
            break;
        }

        case 'delete_shift': {
            if (!$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $id = trim((string)($body['id'] ?? $_GET['id'] ?? ''));
            if ($id !== '') {
                $st = $pdo->prepare("SELECT `worker_id`, `work_date` FROM `agency_shifts` WHERE `id` = ? LIMIT 1");
                $st->execute([$id]);
                $row = $st->fetch(PDO::FETCH_ASSOC);
                if ($row && !$isAdmin && ccrm_agency_is_period_paid($pdo, (string)$row['worker_id'], (string)$row['work_date'])) {
                    ccrm_agency_json(['success' => false, 'error' => 'Period locked'], 409);
                }
                $pdo->prepare("DELETE FROM `agency_shifts` WHERE `id` = ?")->execute([$id]);
            }
            ccrm_agency_json(['success' => true]);
            break;
        }

        case 'calculate_payment': {
            if (!$canPayments) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $workerId = trim((string)($body['workerId'] ?? $_GET['workerId'] ?? ''));
            $periodYm = trim((string)($body['periodYm'] ?? $_GET['periodYm'] ?? date('Y-m')));
            if ($workerId === '' || !preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                ccrm_agency_json(['success' => false, 'error' => 'workerId and YYYY-MM periodYm required'], 400);
            }
            $calc = ccrm_agency_calculate_payment_data($pdo, $workerId, $periodYm);
            ccrm_agency_json(['success' => true, 'calculated' => $calc]);
            break;
        }

        case 'save_payment': {
            if (!$canPayments || !$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $p = is_array($body['payment'] ?? null) ? $body['payment'] : $body;
            $workerId = trim((string)($p['workerId'] ?? ''));
            $periodYm = trim((string)($p['periodYm'] ?? ''));
            if ($workerId === '' || !preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                ccrm_agency_json(['success' => false, 'error' => 'workerId and YYYY-MM periodYm required'], 400);
            }
            $id = trim((string)($p['id'] ?? ''));
            if ($id === '') {
                $existingIdStmt = $pdo->prepare("SELECT `id` FROM `agency_payments` WHERE `worker_id` = ? AND `period_ym` = ? LIMIT 1");
                $existingIdStmt->execute([$workerId, $periodYm]);
                $id = (string)($existingIdStmt->fetchColumn() ?: ccrm_agency_uid('agpay'));
            }

            $basePay = round(floatval($p['basePay'] ?? 0), 2);
            $items = is_array($p['items'] ?? null) ? array_values($p['items']) : [];
            $extraEarnings = 0.0;
            $deductionsTotal = 0.0;
            foreach ($items as $it) {
                if (!is_array($it)) continue;
                $amt = floatval($it['amount'] ?? 0);
                if (($it['kind'] ?? 'earning') === 'deduction') {
                    $deductionsTotal += $amt;
                } else {
                    $extraEarnings += $amt;
                }
            }
            $grossPay = round($basePay + $extraEarnings, 2);
            $deductionsTotal = round($deductionsTotal, 2);
            $netPay = round(max(0, $grossPay - $deductionsTotal), 2);
            $status = in_array($p['status'] ?? 'draft', ['draft', 'approved', 'paid'], true) ? (string)$p['status'] : 'draft';
            $paidAmount = $status === 'paid' && !isset($p['paidAmount']) ? $netPay : round(floatval($p['paidAmount'] ?? 0), 2);
            $paidAt = !empty($p['paidAt']) ? substr((string)$p['paidAt'], 0, 10) : ($status === 'paid' ? date('Y-m-d') : null);

            $ins = $pdo->prepare(
                "INSERT INTO `agency_payments`
                  (`id`, `worker_id`, `placement_id`, `company_client_id`, `period_ym`, `regular_hours`, `overtime_hours`, `sick_days`, `base_pay`, `items_json`, `gross_pay`, `deductions_total`, `net_pay`, `paid_amount`, `billable_total`, `currency`, `status`, `paid_at`, `notes`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `placement_id` = VALUES(`placement_id`),
                  `company_client_id` = VALUES(`company_client_id`),
                  `regular_hours` = VALUES(`regular_hours`),
                  `overtime_hours` = VALUES(`overtime_hours`),
                  `sick_days` = VALUES(`sick_days`),
                  `base_pay` = VALUES(`base_pay`),
                  `items_json` = VALUES(`items_json`),
                  `gross_pay` = VALUES(`gross_pay`),
                  `deductions_total` = VALUES(`deductions_total`),
                  `net_pay` = VALUES(`net_pay`),
                  `paid_amount` = VALUES(`paid_amount`),
                  `billable_total` = VALUES(`billable_total`),
                  `currency` = VALUES(`currency`),
                  `status` = VALUES(`status`),
                  `paid_at` = VALUES(`paid_at`),
                  `notes` = VALUES(`notes`)"
            );
            $ins->execute([
                $id,
                $workerId,
                !empty($p['placementId']) ? (string)$p['placementId'] : null,
                !empty($p['companyClientId']) ? (string)$p['companyClientId'] : null,
                $periodYm,
                floatval($p['regularHours'] ?? 0),
                floatval($p['overtimeHours'] ?? 0),
                floatval($p['sickDays'] ?? 0),
                $basePay,
                json_encode($items, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                $grossPay,
                $deductionsTotal,
                $netPay,
                $paidAmount,
                round(floatval($p['billableTotal'] ?? 0), 2),
                trim((string)($p['currency'] ?? 'EUR')) ?: 'EUR',
                $status,
                $paidAt,
                (string)($p['notes'] ?? ''),
            ]);

            $freshStmt = $pdo->prepare("SELECT * FROM `agency_payments` WHERE `id` = ? LIMIT 1");
            $freshStmt->execute([$id]);
            $freshRow = $freshStmt->fetch(PDO::FETCH_ASSOC);
            $wNameStmt = $pdo->prepare("SELECT `full_name` FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $wNameStmt->execute([$workerId]);
            $wName = (string)($wNameStmt->fetchColumn() ?: $workerId);

            $settings = ccrm_agency_load_settings($pdo);
            ccrm_agency_sync_financial_expense($pdo, $freshRow, $wName, $settings);

            $freshStmt->execute([$id]);
            ccrm_agency_json(['success' => true, 'payment' => ccrm_agency_project_payment($freshStmt->fetch(PDO::FETCH_ASSOC))]);
            break;
        }

        case 'create_client_billing_record': {
            if (!$canPayments || !$canEditAgency) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $companyClientId = trim((string)($body['companyClientId'] ?? ''));
            $periodYm = trim((string)($body['periodYm'] ?? date('Y-m')));
            if ($companyClientId === '' || !preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                ccrm_agency_json(['success' => false, 'error' => 'companyClientId and periodYm required'], 400);
            }
            $sumStmt = $pdo->prepare("SELECT COALESCE(SUM(`billable_total`), 0) AS billable, COUNT(*) AS cnt FROM `agency_payments` WHERE `company_client_id` = ? AND `period_ym` = ?");
            $sumStmt->execute([$companyClientId, $periodYm]);
            $agg = $sumStmt->fetch(PDO::FETCH_ASSOC);
            $amount = round(floatval($agg['billable'] ?? 0), 2);
            if ($amount <= 0) {
                ccrm_agency_json(['success' => false, 'error' => 'No billable amount for company and period'], 400);
            }
            $compStmt = $pdo->prepare("SELECT `name` FROM `leads` WHERE `id` = ? LIMIT 1");
            $compStmt->execute([$companyClientId]);
            $compName = (string)($compStmt->fetchColumn() ?: $companyClientId);

            $frId = 'fr-ag-bill-' . substr(md5($companyClientId . '|' . $periodYm), 0, 12);
            $catExists = (int)$pdo->query("SELECT COUNT(*) FROM `financial_categories` WHERE `id` = 'fc-inc-services'")->fetchColumn();
            $catId = $catExists > 0 ? 'fc-inc-services' : null;
            $settings = ccrm_agency_load_settings($pdo);
            $issueDate = $periodYm . '-01';
            $dueDate = date('Y-m-t', strtotime($issueDate));
            $currency = strtoupper(trim((string)($settings['defaultCurrency'] ?? 'EUR'))) ?: 'EUR';
            $ins = $pdo->prepare(
                "INSERT INTO `financial_records` (`id`, `type`, `subtype`, `title`, `category_id`, `client_id`, `amount_planned`, `amount_real`, `currency`, `status`, `issue_date`, `due_date`, `description`)
                 VALUES (?, 'income', 'invoice', ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `amount_planned` = VALUES(`amount_planned`),
                  `title` = VALUES(`title`)"
            );
            $ins->execute([
                $frId,
                "Workforce Leasing: {$compName} ({$periodYm})",
                $catId,
                $companyClientId,
                $amount,
                $currency,
                $issueDate,
                $dueDate,
                "Draft client billing record aggregated from {$agg['cnt']} agency worker payout(s).",
            ]);
            ccrm_agency_json(['success' => true, 'financialRecordId' => $frId, 'amount' => $amount]);
            break;
        }

        case 'save_settings': {
            if (!$canConfig) {
                ccrm_agency_json(['success' => false, 'error' => 'Forbidden'], 403);
            }
            $cfg = is_array($body['settings'] ?? null) ? $body['settings'] : $body;
            $saved = ccrm_agency_save_settings($pdo, $cfg);
            ccrm_agency_json(['success' => true, 'settings' => $saved]);
            break;
        }

        default:
            ccrm_agency_json(['success' => false, 'error' => 'Unknown action'], 400);
    }
} catch (\Throwable $e) {
    error_log('[ccrm agency.php] ' . $e->getMessage());
    ccrm_agency_json(['success' => false, 'error' => $e->getMessage()], 500);
}
