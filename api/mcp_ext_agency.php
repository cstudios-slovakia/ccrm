<?php
/**
 * CCRM MCP Server Extensions — Agency & Workforce Leasing (`agency`)
 *
 * Read & write tools for the opt-in Agency & Workforce Leasing module:
 *   - Candidates & Rented Employees (`list_agency_workers`, `get_agency_worker`,
 *     `create_agency_worker`, `update_agency_worker`, `move_agency_worker_stage`)
 *   - Workplaces & Placements (`list_agency_workplaces`, `upsert_agency_workplace`,
 *     `list_agency_placements`, `upsert_agency_placement`)
 *   - Schedule, Sick Leave & Timeline (`list_agency_shifts`, `log_agency_shifts`,
 *     `log_agency_sick_leave`, `add_agency_timeline_note`)
 *   - Settings, Overview & Payroll (`get_agency_overview`, `get_agency_settings`,
 *     `update_agency_checklist`, `list_agency_payments`, `calculate_agency_payment`,
 *     `record_agency_payment`, `create_agency_client_billing`)
 *
 * Non-destructive: no tool removes rows. Included by mcp.php.
 */

require_once __DIR__ . '/agency_lib.php';

/**
 * Permissions for the Agency MCP tools, merged into mcp_tool_permissions().
 */
function mcp_ext_agency_permissions(): array {
    return [
        // Read
        'list_agency_workers'          => ['view' => ['agency']],
        'get_agency_worker'            => ['view' => ['agency']],
        'list_agency_workplaces'       => ['view' => ['agency']],
        'list_agency_placements'       => ['view' => ['agency']],
        'list_agency_shifts'           => ['view' => ['agency']],
        'get_agency_overview'          => ['view' => ['agency']],
        'get_agency_settings'          => ['view' => ['agency']],
        // Write
        'create_agency_worker'         => ['edit' => ['agency']],
        'update_agency_worker'         => ['edit' => ['agency']],
        'move_agency_worker_stage'     => ['edit' => ['agency']],
        'upsert_agency_workplace'      => ['edit' => ['agency']],
        'upsert_agency_placement'      => ['edit' => ['agency']],
        'log_agency_shifts'            => ['edit' => ['agency']],
        'log_agency_sick_leave'        => ['edit' => ['agency']],
        'add_agency_timeline_note'     => ['edit' => ['agency']],
        'update_agency_checklist'      => ['edit' => ['agency']],
        // Payroll / billing
        'list_agency_payments'         => ['view' => ['agency', 'agency.payments']],
        'calculate_agency_payment'     => ['view' => ['agency', 'agency.payments']],
        'record_agency_payment'        => ['edit' => ['agency', 'agency.payments']],
        'create_agency_client_billing' => ['edit' => ['agency', 'agency.payments']],
    ];
}

/**
 * Tool definitions for the Agency module, merged into mcp_get_tool_definitions().
 * Each entry places `'name'` directly above `'description'`.
 */
function mcp_get_agency_tool_definitions(): array {
    return [
        [
            'name' => 'list_agency_workers',
            'description' => 'List candidates and rented employees in the Agency & Workforce Leasing module. Sensitive personal and rate fields are redacted automatically when caller lacks agency.personal or agency.payments permissions.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'enum' => ['candidate', 'rented', 'bench', 'inactive', 'archived'], 'description' => 'Filter by worker status'],
                    'stageId' => ['type' => 'string', 'description' => 'Filter by recruitment stage id'],
                    'assignedRecruiter' => ['type' => 'string', 'description' => 'Filter by assigned recruiter name'],
                    'search' => ['type' => 'string', 'description' => 'Case-insensitive SQL substring match against name, worker code, email, phone (with agency.personal), notes, or skills'],
                    'limit' => ['type' => 'integer', 'description' => 'Max workers to return (default 50, max 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                    'created_from' => ['type' => 'string', 'description' => 'Created at >= ISO timestamp'],
                    'created_to' => ['type' => 'string', 'description' => 'Created at <= ISO timestamp'],
                    'updated_from' => ['type' => 'string', 'description' => 'Updated at >= ISO timestamp'],
                    'updated_to' => ['type' => 'string', 'description' => 'Updated at <= ISO timestamp'],
                ],
            ],
        ],
        [
            'name' => 'get_agency_worker',
            'description' => 'Fetch a single agency candidate or rented employee by id or workerCode, including placements, compliance checklist, file metadata, and timeline events.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Worker ID (e.g. agw-...)'],
                    'workerCode' => ['type' => 'string', 'description' => 'Alternative lookup by worker code (e.g. AGW-12345)'],
                ],
            ],
        ],
        [
            'name' => 'list_agency_workplaces',
            'description' => 'List external client workplaces/sites where agency workers are placed.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'companyClientId' => ['type' => 'string', 'description' => 'Filter by external company lead/client id'],
                    'includeInactive' => ['type' => 'boolean', 'description' => 'Include inactive workplaces (default false)'],
                ],
            ],
        ],
        [
            'name' => 'list_agency_placements',
            'description' => 'List historical and active workforce leasing placements between permanent worker profiles and external companies.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'workerId' => ['type' => 'string', 'description' => 'Filter by worker ID'],
                    'companyClientId' => ['type' => 'string', 'description' => 'Filter by external company ID'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'active', 'completed', 'terminated'], 'description' => 'Filter by placement status'],
                    'limit' => ['type' => 'integer', 'description' => 'Max placements to return (default 50, max 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                    'created_from' => ['type' => 'string', 'description' => 'Created at >= ISO timestamp'],
                    'created_to' => ['type' => 'string', 'description' => 'Created at <= ISO timestamp'],
                    'updated_from' => ['type' => 'string', 'description' => 'Updated at >= ISO timestamp'],
                    'updated_to' => ['type' => 'string', 'description' => 'Updated at <= ISO timestamp'],
                ],
            ],
        ],
        [
            'name' => 'list_agency_shifts',
            'description' => 'List agency work schedule entries (worked shifts, scheduled shifts, sick leave, holidays, absences) within a date range.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD (default first day of current month)'],
                    'to' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (default last day of current month)'],
                    'workerId' => ['type' => 'string', 'description' => 'Filter by worker ID'],
                    'companyClientId' => ['type' => 'string', 'description' => 'Filter by external company ID'],
                    'status' => ['type' => 'string', 'enum' => ['scheduled', 'worked', 'sick', 'absent', 'holiday'], 'description' => 'Filter by shift status'],
                ],
            ],
        ],
        [
            'name' => 'get_agency_overview',
            'description' => 'Get Agency module KPIs: worker counts by status and stage, active placements, expiring compliance documents within 30 days, and monthly payout/billing summary (if permitted).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'periodYm' => ['type' => 'string', 'description' => 'Month YYYY-MM (defaults to current month)'],
                ],
            ],
        ],
        [
            'name' => 'get_agency_settings',
            'description' => 'Read the customizable Agency configuration: recruitment stages, worker profile schema & custom fields, checklist template, shift presets, and holiday country.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => new \stdClass(),
            ],
        ],
        [
            'name' => 'create_agency_worker',
            'description' => 'Create a permanent Agency worker/candidate profile (never creates a CRM Contact/Lead). Automatically seeds compliance checklist items from Agency settings and logs initial stage event.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['fullName'],
                'properties' => [
                    'fullName' => ['type' => 'string', 'description' => 'Full name of the candidate or employee'],
                    'preferredName' => ['type' => 'string'],
                    'workerCode' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'phone' => ['type' => 'string'],
                    'stageId' => ['type' => 'string', 'description' => 'Initial recruitment stage ID (defaults to first configured stage)'],
                    'workerStatus' => ['type' => 'string', 'enum' => ['candidate', 'rented', 'bench', 'archived']],
                    'nationality' => ['type' => 'string'],
                    'dateOfBirth' => ['type' => 'string', 'description' => 'YYYY-MM-DD (requires agency.personal permission)'],
                    'profile' => ['type' => 'object', 'description' => 'Structured sections: applicant, passport, permit, stayWork, addresses, family, custom'],
                    'skills' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'notes' => ['type' => 'string'],
                    'defaultPayRate' => ['type' => 'number', 'description' => 'Requires agency.payments permission'],
                    'defaultBillRate' => ['type' => 'number', 'description' => 'Requires agency.payments permission'],
                    'currency' => ['type' => 'string'],
                    'assignedRecruiter' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'update_agency_worker',
            'description' => 'Update an existing Agency worker/candidate profile. Preserves sensitive or payment fields when the caller lacks agency.personal or agency.payments permissions.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Worker ID'],
                    'fullName' => ['type' => 'string'],
                    'preferredName' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'phone' => ['type' => 'string'],
                    'stageId' => ['type' => 'string'],
                    'workerStatus' => ['type' => 'string', 'enum' => ['candidate', 'rented', 'bench', 'archived']],
                    'nationality' => ['type' => 'string'],
                    'dateOfBirth' => ['type' => 'string'],
                    'profile' => ['type' => 'object'],
                    'skills' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'notes' => ['type' => 'string'],
                    'defaultPayRate' => ['type' => 'number'],
                    'defaultBillRate' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'assignedRecruiter' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'move_agency_worker_stage',
            'description' => 'Move an agency candidate/worker to another recruitment stage and record a stage_change timeline event.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['id', 'stageId'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Worker ID'],
                    'stageId' => ['type' => 'string', 'description' => 'Target stage ID'],
                    'note' => ['type' => 'string', 'description' => 'Optional timeline note for the stage transition'],
                ],
            ],
        ],
        [
            'name' => 'upsert_agency_workplace',
            'description' => 'Create or update a client workplace/site under an external company.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['companyClientId', 'name'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Existing workplace ID to update (omit to create)'],
                    'companyClientId' => ['type' => 'string', 'description' => 'External company lead/client ID'],
                    'name' => ['type' => 'string'],
                    'address' => ['type' => 'string'],
                    'contactLeadId' => ['type' => 'string'],
                    'defaultShiftCode' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                    'active' => ['type' => 'boolean'],
                ],
            ],
        ],
        [
            'name' => 'upsert_agency_placement',
            'description' => 'Create or update a workforce leasing placement linking a worker to an external company. Setting status="active" automatically marks previous active placements completed, switches workerStatus to "rented", and logs a placement timeline event.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'companyClientId', 'startDate'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Existing placement ID to update (omit to create)'],
                    'workerId' => ['type' => 'string'],
                    'companyClientId' => ['type' => 'string'],
                    'workplaceId' => ['type' => 'string'],
                    'contactLeadId' => ['type' => 'string'],
                    'jobRole' => ['type' => 'string'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'active', 'completed', 'terminated']],
                    'startDate' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'endDate' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'payRate' => ['type' => 'number', 'description' => 'Requires agency.payments permission'],
                    'payRateType' => ['type' => 'string', 'enum' => ['hourly', 'monthly']],
                    'billRate' => ['type' => 'number', 'description' => 'Requires agency.payments permission'],
                    'billRateType' => ['type' => 'string', 'enum' => ['hourly', 'monthly']],
                    'currency' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'log_agency_shifts',
            'description' => 'Log or update one or more shifts on the Agency work schedule. Respects paid-period locks for non-administrators and records compact work_log or sick_leave timeline events.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['shifts'],
                'properties' => [
                    'shifts' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'required' => ['workerId', 'companyClientId', 'workDate'],
                            'properties' => [
                                'workerId' => ['type' => 'string'],
                                'companyClientId' => ['type' => 'string'],
                                'placementId' => ['type' => 'string'],
                                'workplaceId' => ['type' => 'string'],
                                'workDate' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                                'shiftTemplateId' => ['type' => 'string'],
                                'shiftLabel' => ['type' => 'string'],
                                'startTime' => ['type' => 'string'],
                                'endTime' => ['type' => 'string'],
                                'hours' => ['type' => 'number'],
                                'overtimeHours' => ['type' => 'number'],
                                'status' => ['type' => 'string', 'enum' => ['scheduled', 'worked', 'sick', 'absent', 'holiday']],
                                'sickNote' => ['type' => 'string'],
                                'notes' => ['type' => 'string'],
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'name' => 'log_agency_sick_leave',
            'description' => 'Mark a rented worker as on sick leave for one day or a date range (YYYY-MM-DD..YYYY-MM-DD), respecting paid-period locks and recording a sick_leave timeline event.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'companyClientId', 'fromDate'],
                'properties' => [
                    'workerId' => ['type' => 'string'],
                    'companyClientId' => ['type' => 'string'],
                    'fromDate' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD'],
                    'toDate' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (defaults to fromDate)'],
                    'sickNote' => ['type' => 'string', 'description' => 'Medical note / reason'],
                    'placementId' => ['type' => 'string'],
                    'workplaceId' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'add_agency_timeline_note',
            'description' => 'Append an event (contact, note, compliance, or sick_leave) to an agency worker chronological timeline.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'title'],
                'properties' => [
                    'workerId' => ['type' => 'string'],
                    'eventType' => ['type' => 'string', 'enum' => ['contact', 'note', 'compliance', 'sick_leave'], 'description' => 'Defaults to note'],
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'occurredAt' => ['type' => 'string', 'description' => 'YYYY-MM-DD or YYYY-MM-DD HH:MM:SS'],
                ],
            ],
        ],
        [
            'name' => 'list_agency_payments',
            'description' => 'List monthly agency worker payouts and client billable totals (requires agency.payments permission).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'periodYm' => ['type' => 'string', 'description' => 'Filter by month YYYY-MM'],
                    'workerId' => ['type' => 'string', 'description' => 'Filter by worker ID'],
                    'status' => ['type' => 'string', 'enum' => ['draft', 'approved', 'paid']],
                    'limit' => ['type' => 'integer', 'description' => 'Max payments to return (default 50, max 100)'],
                    'offset' => ['type' => 'integer', 'description' => 'Pagination offset (default 0)'],
                    'updated_from' => ['type' => 'string', 'description' => 'Updated at >= ISO timestamp'],
                    'updated_to' => ['type' => 'string', 'description' => 'Updated at <= ISO timestamp'],
                ],
            ],
        ],
        [
            'name' => 'calculate_agency_payment',
            'description' => 'Calculate regular hours, overtime, sick days, gross/net worker pay, and client billable total for a worker and month from logged shifts (requires agency.payments).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'periodYm'],
                'properties' => [
                    'workerId' => ['type' => 'string'],
                    'periodYm' => ['type' => 'string', 'description' => 'YYYY-MM'],
                ],
            ],
        ],
        [
            'name' => 'update_agency_checklist',
            'description' => 'Upsert compliance checklist items on an agency worker and append a compliance timeline entry.',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'items'],
                'properties' => [
                    'workerId' => ['type' => 'string', 'description' => 'Worker ID'],
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'id' => ['type' => 'string', 'description' => 'Optional existing checklist row ID'],
                                'itemKey' => ['type' => 'string'],
                                'label' => ['type' => 'string'],
                                'status' => ['type' => 'string', 'enum' => ['missing', 'pending', 'submitted', 'verified', 'expired']],
                                'expiresAt' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                                'note' => ['type' => 'string'],
                                'fileId' => ['type' => 'string'],
                                'sortOrder' => ['type' => 'integer'],
                            ],
                        ],
                    ],
                ],
            ],
        ],
        [
            'name' => 'record_agency_payment',
            'description' => 'Create or update a monthly agency worker payout in draft or approved status and sync its planned financial expense (paid settlement is blocked via MCP; requires agency + agency.payments).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['workerId', 'periodYm'],
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Optional existing payment ID'],
                    'workerId' => ['type' => 'string'],
                    'periodYm' => ['type' => 'string', 'description' => 'YYYY-MM'],
                    'placementId' => ['type' => 'string'],
                    'companyClientId' => ['type' => 'string'],
                    'regularHours' => ['type' => 'number'],
                    'overtimeHours' => ['type' => 'number'],
                    'sickDays' => ['type' => 'number'],
                    'basePay' => ['type' => 'number'],
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'label' => ['type' => 'string'],
                                'kind' => ['type' => 'string', 'enum' => ['earning', 'deduction']],
                                'amount' => ['type' => 'number'],
                            ],
                        ],
                    ],
                    'billableTotal' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'status' => ['type' => 'string', 'enum' => ['draft', 'approved'], 'description' => 'Allowed values: draft or approved (default draft)'],
                    'notes' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'create_agency_client_billing',
            'description' => 'Aggregate agency worker billable totals for an external company and month into a pending client income record (requires agency + agency.payments).',
            'inputSchema' => [
                'type' => 'object',
                'required' => ['companyClientId', 'periodYm'],
                'properties' => [
                    'companyClientId' => ['type' => 'string', 'description' => 'External company lead/client ID'],
                    'periodYm' => ['type' => 'string', 'description' => 'YYYY-MM'],
                ],
            ],
        ],
    ];
}

/**
 * Execute an Agency MCP tool. Returns MCP_NOT_MINE if `$tool` does not belong to Agency.
 */
function mcp_ext_agency_execute(\PDO $pdo, array $user, string $tool, array $args): mixed {
    $perms = mcp_ext_agency_permissions();
    if (!array_key_exists($tool, $perms)) {
        return MCP_NOT_MINE;
    }
    if (!ccrm_agency_is_module_enabled($pdo)) {
        throw new \Exception('Agency & Workforce Leasing module is currently disabled in workspace settings.');
    }

    $scope = ccrm_read_scope($pdo, $user);
    $isAdmin = !empty($scope['isAdmin']);
    $canPersonal = ccrm_can($scope, 'agency.personal');
    $canPayments = ccrm_can($scope, 'agency.payments');
    $userName = (string)($user['name'] ?? $user['email'] ?? 'MCP');

    switch ($tool) {
        case 'list_agency_workers': {
            $where = ['1=1'];
            $params = [];
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['candidate', 'rented', 'bench', 'inactive', 'archived']);
                if ($status === 'bench' || $status === 'inactive') {
                    $where[] = "`worker_status` IN ('bench', 'inactive')";
                } else {
                    $where[] = "`worker_status` = ?";
                    $params[] = $status;
                }
            }
            if (!empty($args['stageId'])) {
                $where[] = "`stage_id` = ?";
                $params[] = trim((string)$args['stageId']);
            }
            if (!empty($args['assignedRecruiter'])) {
                $where[] = "`assigned_recruiter` = ?";
                $params[] = trim((string)$args['assignedRecruiter']);
            }
            $search = trim((string)($args['search'] ?? ''));
            if ($search !== '') {
                $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
                $like = '%' . $escaped . '%';
                $cols = [
                    "LOWER(COALESCE(`full_name`, '')) LIKE LOWER(?)",
                    "LOWER(COALESCE(`preferred_name`, '')) LIKE LOWER(?)",
                    "LOWER(COALESCE(`worker_code`, '')) LIKE LOWER(?)",
                    "LOWER(COALESCE(`email`, '')) LIKE LOWER(?)",
                    "LOWER(COALESCE(`notes`, '')) LIKE LOWER(?)",
                    "LOWER(COALESCE(`skills_json`, '')) LIKE LOWER(?)",
                ];
                $likeCount = 6;
                if ($canPersonal) {
                    $cols[] = "LOWER(COALESCE(`phone`, '')) LIKE LOWER(?)";
                    $likeCount++;
                }
                $where[] = '(' . implode(' OR ', $cols) . ')';
                for ($i = 0; $i < $likeCount; $i++) {
                    $params[] = $like;
                }
            }
            $win = mcp_list_window($args, [
                'created' => 'created_at',
                'updated' => 'updated_at',
                'id' => 'id',
                'sorts' => [
                    'updated_at' => ['updated_at', 'DESC', 'full_name ASC'],
                    'full_name' => ['full_name', 'ASC'],
                ],
                'default_sort' => 'updated_at',
                'default_limit' => 50,
                'max_limit' => 100,
            ]);
            $where = array_merge($where, $win['where']);
            $params = array_merge($params, $win['params']);
            $sql = "SELECT * FROM `agency_workers` WHERE " . implode(' AND ', $where) . " " . $win['tail'];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(static fn ($r) => ccrm_agency_project_worker($r, $scope), $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'get_agency_worker': {
            $id = trim((string)($args['id'] ?? ''));
            $code = trim((string)($args['workerCode'] ?? ''));
            if ($id === '' && $code === '') {
                throw new \Exception('Either id or workerCode is required.');
            }
            if ($id !== '') {
                $st = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
                $st->execute([$id]);
            } else {
                $st = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `worker_code` = ? LIMIT 1");
                $st->execute([$code]);
            }
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \Exception('Agency worker not found.');
            }
            $wid = (string)$row['id'];

            $plStmt = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `worker_id` = ? ORDER BY `start_date` DESC LIMIT 50");
            $plStmt->execute([$wid]);
            $placements = array_map(static fn ($r) => ccrm_agency_project_placement($r, $scope), $plStmt->fetchAll(\PDO::FETCH_ASSOC));

            $chkStmt = $pdo->prepare("SELECT * FROM `agency_worker_checklists` WHERE `worker_id` = ? ORDER BY `sort_order` ASC, `id` ASC");
            $chkStmt->execute([$wid]);
            $checklist = array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'itemKey' => (string)$r['item_key'],
                'label' => (string)$r['label'],
                'status' => (string)$r['status'],
                'expiresAt' => $r['expires_at'] ? (string)$r['expires_at'] : null,
                'note' => (string)($r['note'] ?? ''),
                'fileId' => $r['file_id'] ? (string)$r['file_id'] : null,
            ], $chkStmt->fetchAll(\PDO::FETCH_ASSOC));

            $fStmt = $pdo->prepare("SELECT id, category, checklist_item_id, file_name, mime_type, size_bytes, uploaded_by, created_at FROM `agency_worker_files` WHERE `worker_id` = ? ORDER BY `created_at` DESC");
            $fStmt->execute([$wid]);
            $files = [];
            foreach ($fStmt->fetchAll(\PDO::FETCH_ASSOC) as $fr) {
                $cat = (string)$fr['category'];
                if (in_array($cat, ['passport', 'permit', 'id_doc', 'medical'], true) && !$canPersonal) {
                    continue;
                }
                $files[] = [
                    'id' => (string)$fr['id'],
                    'category' => $cat,
                    'checklistItemId' => $fr['checklist_item_id'] ? (string)$fr['checklist_item_id'] : null,
                    'fileName' => (string)$fr['file_name'],
                    'mimeType' => (string)($fr['mime_type'] ?? ''),
                    'sizeBytes' => (int)($fr['size_bytes'] ?? 0),
                    'uploadedBy' => (string)($fr['uploaded_by'] ?? ''),
                    'createdAt' => (string)$fr['created_at'],
                ];
            }

            $tlStmt = $pdo->prepare("SELECT id, event_type, title, description, meta_json, occurred_at, created_by FROM `agency_timeline_events` WHERE `worker_id` = ? ORDER BY `occurred_at` DESC LIMIT 100");
            $tlStmt->execute([$wid]);
            $timeline = array_map(static fn ($tr) => [
                'id' => (string)$tr['id'],
                'eventType' => (string)$tr['event_type'],
                'title' => (string)$tr['title'],
                'description' => (string)($tr['description'] ?? ''),
                'meta' => json_decode((string)($tr['meta_json'] ?? '{}'), true) ?: (object)[],
                'occurredAt' => (string)$tr['occurred_at'],
                'createdBy' => (string)($tr['created_by'] ?? ''),
            ], $tlStmt->fetchAll(\PDO::FETCH_ASSOC));

            return [
                'worker' => ccrm_agency_project_worker($row, $scope),
                'placements' => $placements,
                'checklist' => $checklist,
                'files' => $files,
                'timeline' => $timeline,
            ];
        }

        case 'list_agency_workplaces': {
            $sql = "SELECT * FROM `agency_workplaces` WHERE 1=1";
            $params = [];
            if (!empty($args['companyClientId'])) {
                $sql .= " AND `company_client_id` = ?";
                $params[] = trim((string)$args['companyClientId']);
            }
            if (empty($args['includeInactive'])) {
                $sql .= " AND `active` = 1";
            }
            $sql .= " ORDER BY `name` ASC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(static fn ($r) => [
                'id' => (string)$r['id'],
                'companyClientId' => (string)$r['company_client_id'],
                'name' => (string)$r['name'],
                'address' => (string)($r['address'] ?? ''),
                'contactLeadId' => $r['contact_lead_id'] ? (string)$r['contact_lead_id'] : null,
                'defaultShiftCode' => (string)($r['default_shift_code'] ?? ''),
                'notes' => (string)($r['notes'] ?? ''),
                'active' => intval($r['active'] ?? 1) === 1,
            ], $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'list_agency_placements': {
            $where = ['1=1'];
            $params = [];
            if (!empty($args['workerId'])) {
                $where[] = "`worker_id` = ?";
                $params[] = trim((string)$args['workerId']);
            }
            if (!empty($args['companyClientId'])) {
                $where[] = "`company_client_id` = ?";
                $params[] = trim((string)$args['companyClientId']);
            }
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['planned', 'active', 'completed', 'terminated']);
                $where[] = "`status` = ?";
                $params[] = $status;
            }
            $win = mcp_list_window($args, [
                'created' => 'created_at',
                'updated' => 'updated_at',
                'id' => 'id',
                'sorts' => [
                    'start_date' => ['start_date', 'DESC', 'created_at DESC'],
                ],
                'default_sort' => 'start_date',
                'default_limit' => 50,
                'max_limit' => 100,
            ]);
            $where = array_merge($where, $win['where']);
            $params = array_merge($params, $win['params']);
            $sql = "SELECT * FROM `agency_placements` WHERE " . implode(' AND ', $where) . " " . $win['tail'];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(static fn ($r) => ccrm_agency_project_placement($r, $scope), $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'list_agency_shifts': {
            $from = mcp_optional_date($args, 'from') ?? date('Y-m-01');
            $to = mcp_optional_date($args, 'to') ?? date('Y-m-t');
            $sql = "SELECT * FROM `agency_shifts` WHERE `work_date` BETWEEN ? AND ?";
            $params = [$from, $to];
            if (!empty($args['workerId'])) {
                $sql .= " AND `worker_id` = ?";
                $params[] = trim((string)$args['workerId']);
            }
            if (!empty($args['companyClientId'])) {
                $sql .= " AND `company_client_id` = ?";
                $params[] = trim((string)$args['companyClientId']);
            }
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['scheduled', 'worked', 'sick', 'absent', 'holiday']);
                $sql .= " AND `status` = ?";
                $params[] = $status;
            }
            $sql .= " ORDER BY `work_date` ASC, `id` ASC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(static fn ($r) => [
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
            ], $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'get_agency_overview': {
            $periodYm = trim((string)($args['periodYm'] ?? date('Y-m')));
            if (!preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                throw new \Exception('periodYm must use YYYY-MM format.');
            }
            $byStatus = ['candidate' => 0, 'rented' => 0, 'bench' => 0, 'archived' => 0];
            foreach ($pdo->query("SELECT `worker_status`, COUNT(*) AS cnt FROM `agency_workers` GROUP BY `worker_status`")->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $k = (string)$r['worker_status'];
                if (array_key_exists($k, $byStatus)) {
                    $byStatus[$k] = (int)$r['cnt'];
                }
            }
            $byStage = [];
            foreach ($pdo->query("SELECT `stage_id`, COUNT(*) AS cnt FROM `agency_workers` WHERE `worker_status` <> 'archived' GROUP BY `stage_id`")->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $byStage[(string)$r['stage_id']] = (int)$r['cnt'];
            }
            $activePlacements = (int)$pdo->query("SELECT COUNT(*) FROM `agency_placements` WHERE `status` = 'active'")->fetchColumn();
            $today = mcp_today();
            $soon = mcp_iso_shift($today, 30);
            $expStmt = $pdo->prepare("SELECT COUNT(*) FROM `agency_worker_checklists` WHERE `expires_at` IS NOT NULL AND `expires_at` <= ? AND `status` <> 'expired'");
            $expStmt->execute([$soon]);
            $expiringDocs = (int)$expStmt->fetchColumn();

            $overview = [
                'periodYm' => $periodYm,
                'workersByStatus' => $byStatus,
                'workersByStage' => $byStage,
                'activePlacements' => $activePlacements,
                'expiringDocumentsWithin30Days' => $expiringDocs,
            ];
            if ($canPayments) {
                $pStmt = $pdo->prepare(
                    "SELECT COUNT(*) AS cnt,
                            COALESCE(SUM(`gross_pay`), 0) AS gross_pay,
                            COALESCE(SUM(`net_pay`), 0) AS net_pay,
                            COALESCE(SUM(`billable_total`), 0) AS billable_total
                     FROM `agency_payments` WHERE `period_ym` = ?"
                );
                $pStmt->execute([$periodYm]);
                $pAgg = $pStmt->fetch(\PDO::FETCH_ASSOC) ?: [];
                $gross = mcp_round2($pAgg['gross_pay'] ?? 0);
                $billable = mcp_round2($pAgg['billable_total'] ?? 0);
                $overview['payrollSummary'] = [
                    'paymentRecords' => (int)($pAgg['cnt'] ?? 0),
                    'grossPayTotal' => $gross,
                    'netPayTotal' => mcp_round2($pAgg['net_pay'] ?? 0),
                    'clientBillableTotal' => $billable,
                    'estimatedGrossMargin' => mcp_round2($billable - $gross),
                ];
            }
            return $overview;
        }

        case 'get_agency_settings': {
            return ccrm_agency_load_settings($pdo);
        }

        case 'create_agency_worker': {
            $fullName = mcp_require_string($args, 'fullName');
            $settings = ccrm_agency_load_settings($pdo);
            $defaultStage = (string)($settings['stages'][0]['id'] ?? 'sourced');
            $stageId = trim((string)($args['stageId'] ?? $defaultStage)) ?: $defaultStage;
            $validStages = array_values(array_filter(array_map(static fn($s) => (string)($s['id'] ?? ''), $settings['stages'] ?? [])));
            if (!empty($validStages) && !in_array($stageId, $validStages, true)) {
                throw new \InvalidArgumentException("Invalid recruitment stageId: {$stageId}");
            }
            $workerStatus = !empty($args['workerStatus'])
                ? mcp_enum($args, 'workerStatus', ['candidate', 'rented', 'bench', 'archived'], 'candidate')
                : 'candidate';

            $id = ccrm_agency_uid('agw');
            $workerCode = trim((string)($args['workerCode'] ?? '')) ?: ('AGW-' . strtoupper(substr(md5($id), 0, 5)));
            $incomingProfile = is_array($args['profile'] ?? null) ? $args['profile'] : [];
            if (!$canPersonal) {
                foreach (ccrm_agency_sensitive_section_ids($settings) as $sec) {
                    unset($incomingProfile[$sec]);
                }
            }
            $nationality = $canPersonal
                ? trim((string)($args['nationality'] ?? ($incomingProfile['applicant']['nationality'] ?? '')))
                : '';
            $dateOfBirth = $canPersonal
                ? trim((string)($args['dateOfBirth'] ?? ($incomingProfile['applicant']['dateOfBirth'] ?? '')))
                : '';
            $payRate = $canPayments && isset($args['defaultPayRate']) ? floatval($args['defaultPayRate']) : 0.0;
            $billRate = $canPayments && isset($args['defaultBillRate']) ? floatval($args['defaultBillRate']) : 0.0;
            $skills = is_array($args['skills'] ?? null) ? array_values($args['skills']) : [];
            $currency = trim((string)($args['currency'] ?? ($settings['defaultCurrency'] ?? 'EUR'))) ?: 'EUR';

            mcp_tx($pdo, function () use ($pdo, $id, $workerCode, $fullName, $args, $stageId, $workerStatus, $nationality, $dateOfBirth, $incomingProfile, $skills, $payRate, $billRate, $currency, $userName, $settings) {
                $ins = $pdo->prepare(
                    "INSERT INTO `agency_workers`
                      (`id`, `worker_code`, `full_name`, `preferred_name`, `email`, `phone`, `stage_id`, `worker_status`, `nationality`, `date_of_birth`, `profile_json`, `skills_json`, `notes`, `default_pay_rate`, `default_bill_rate`, `currency`, `assigned_recruiter`, `created_by`)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $ins->execute([
                    $id,
                    $workerCode,
                    $fullName,
                    trim((string)($args['preferredName'] ?? '')),
                    trim((string)($args['email'] ?? '')),
                    trim((string)($args['phone'] ?? '')),
                    $stageId,
                    $workerStatus,
                    $nationality,
                    $dateOfBirth,
                    json_encode($incomingProfile, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                    json_encode($skills, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                    (string)($args['notes'] ?? ''),
                    $payRate,
                    $billRate,
                    $currency,
                    trim((string)($args['assignedRecruiter'] ?? '')),
                    $userName,
                ]);
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
                ccrm_agency_log_timeline($pdo, $id, 'stage_change', 'Profile Created', "Initial stage: {$stageId}", ['toStage' => $stageId], null, $userName);
            });

            mcp_audit($pdo, $user, 'agency_worker_create', "Created agency worker '{$fullName}' ({$id})");
            $fresh = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            return ccrm_agency_project_worker($fresh->fetch(\PDO::FETCH_ASSOC), $scope);
        }

        case 'update_agency_worker': {
            $id = mcp_require_string($args, 'id');
            $st = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $st->execute([$id]);
            $existing = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$existing) {
                throw new \Exception('Agency worker not found.');
            }

            $settings = ccrm_agency_load_settings($pdo);
            $fullName = array_key_exists('fullName', $args) ? mcp_require_string($args, 'fullName') : (string)$existing['full_name'];
            $existingProfile = json_decode((string)($existing['profile_json'] ?? '{}'), true) ?: [];
            $incomingProfile = is_array($args['profile'] ?? null) ? array_replace_recursive($existingProfile, $args['profile']) : $existingProfile;
            if (!$canPersonal) {
                foreach (ccrm_agency_sensitive_section_ids($settings) as $sec) {
                    if (isset($existingProfile[$sec])) {
                        $incomingProfile[$sec] = $existingProfile[$sec];
                    } else {
                        unset($incomingProfile[$sec]);
                    }
                }
            }
            $stageId = array_key_exists('stageId', $args) ? trim((string)$args['stageId']) : (string)$existing['stage_id'];
            if (array_key_exists('stageId', $args) && $stageId !== '') {
                $validStages = array_values(array_filter(array_map(static fn($s) => (string)($s['id'] ?? ''), $settings['stages'] ?? [])));
                if (!empty($validStages) && !in_array($stageId, $validStages, true)) {
                    throw new \InvalidArgumentException("Invalid recruitment stageId: {$stageId}");
                }
            }
            $workerStatus = array_key_exists('workerStatus', $args)
                ? mcp_enum($args, 'workerStatus', ['candidate', 'rented', 'bench', 'archived'])
                : (string)$existing['worker_status'];
            $nationality = ($canPersonal && array_key_exists('nationality', $args))
                ? trim((string)$args['nationality'])
                : (string)$existing['nationality'];
            $dateOfBirth = ($canPersonal && array_key_exists('dateOfBirth', $args))
                ? trim((string)$args['dateOfBirth'])
                : (string)$existing['date_of_birth'];
            $payRate = ($canPayments && array_key_exists('defaultPayRate', $args))
                ? floatval($args['defaultPayRate'])
                : floatval($existing['default_pay_rate']);
            $billRate = ($canPayments && array_key_exists('defaultBillRate', $args))
                ? floatval($args['defaultBillRate'])
                : floatval($existing['default_bill_rate']);
            $skills = array_key_exists('skills', $args) && is_array($args['skills'])
                ? array_values($args['skills'])
                : (json_decode((string)($existing['skills_json'] ?? '[]'), true) ?: []);

            $pdo->prepare(
                "UPDATE `agency_workers` SET
                   `full_name` = ?, `preferred_name` = ?, `email` = ?, `phone` = ?,
                   `stage_id` = ?, `worker_status` = ?, `nationality` = ?, `date_of_birth` = ?,
                   `profile_json` = ?, `skills_json` = ?, `notes` = ?,
                   `default_pay_rate` = ?, `default_bill_rate` = ?, `currency` = ?, `assigned_recruiter` = ?
                 WHERE `id` = ?"
            )->execute([
                $fullName,
                array_key_exists('preferredName', $args) ? trim((string)$args['preferredName']) : (string)$existing['preferred_name'],
                array_key_exists('email', $args) ? trim((string)$args['email']) : (string)$existing['email'],
                array_key_exists('phone', $args) ? trim((string)$args['phone']) : (string)$existing['phone'],
                $stageId,
                $workerStatus,
                $nationality,
                $dateOfBirth,
                json_encode($incomingProfile, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                json_encode($skills, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                array_key_exists('notes', $args) ? (string)$args['notes'] : (string)$existing['notes'],
                $payRate,
                $billRate,
                array_key_exists('currency', $args) ? trim((string)$args['currency']) : (string)$existing['currency'],
                array_key_exists('assignedRecruiter', $args) ? trim((string)$args['assignedRecruiter']) : (string)$existing['assigned_recruiter'],
                $id,
            ]);

            if ((string)$existing['stage_id'] !== $stageId) {
                $from = (string)$existing['stage_id'];
                ccrm_agency_log_timeline($pdo, $id, 'stage_change', "Stage: {$from} → {$stageId}", '', ['fromStage' => $from, 'toStage' => $stageId], null, $userName);
            }

            mcp_audit($pdo, $user, 'agency_worker_update', "Updated agency worker {$id}");
            $fresh = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            return ccrm_agency_project_worker($fresh->fetch(\PDO::FETCH_ASSOC), $scope);
        }

        case 'move_agency_worker_stage': {
            $id = mcp_require_string($args, 'id');
            $stageId = mcp_require_string($args, 'stageId');
            $settings = ccrm_agency_load_settings($pdo);
            $validStages = array_values(array_filter(array_map(static fn($s) => (string)($s['id'] ?? ''), $settings['stages'] ?? [])));
            if (!empty($validStages) && !in_array($stageId, $validStages, true)) {
                throw new \InvalidArgumentException("Invalid recruitment stageId: {$stageId}");
            }
            $st = $pdo->prepare("SELECT `stage_id`, `full_name` FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $st->execute([$id]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \Exception('Agency worker not found.');
            }
            $from = (string)$row['stage_id'];
            $pdo->prepare("UPDATE `agency_workers` SET `stage_id` = ? WHERE `id` = ?")->execute([$stageId, $id]);
            $note = trim((string)($args['note'] ?? ''));
            ccrm_agency_log_timeline($pdo, $id, 'stage_change', "Stage: {$from} → {$stageId}", $note, ['fromStage' => $from, 'toStage' => $stageId], null, $userName);
            mcp_audit($pdo, $user, 'agency_worker_stage', "Moved {$id} from {$from} to {$stageId}");
            $fresh = $pdo->prepare("SELECT * FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            return ccrm_agency_project_worker($fresh->fetch(\PDO::FETCH_ASSOC), $scope);
        }

        case 'upsert_agency_workplace': {
            $companyClientId = mcp_require_string($args, 'companyClientId');
            $name = mcp_require_string($args, 'name');
            $rawId = trim((string)($args['id'] ?? ''));
            $existingWp = null;
            if ($rawId !== '') {
                $wpSt = $pdo->prepare("SELECT * FROM `agency_workplaces` WHERE `id` = ? LIMIT 1");
                $wpSt->execute([$rawId]);
                $existingWp = $wpSt->fetch(\PDO::FETCH_ASSOC) ?: null;
            }
            $id = $rawId !== '' ? $rawId : ccrm_agency_uid('agwp');
            $address = array_key_exists('address', $args) ? trim((string)$args['address']) : (string)($existingWp['address'] ?? '');
            $contactLeadId = array_key_exists('contactLeadId', $args)
                ? (!empty($args['contactLeadId']) ? trim((string)$args['contactLeadId']) : null)
                : ($existingWp['contact_lead_id'] ?? null);
            $defaultShiftCode = array_key_exists('defaultShiftCode', $args)
                ? trim((string)$args['defaultShiftCode'])
                : (string)($existingWp['default_shift_code'] ?? '');
            $notes = array_key_exists('notes', $args) ? (string)$args['notes'] : (string)($existingWp['notes'] ?? '');
            $active = array_key_exists('active', $args)
                ? (!empty($args['active']) ? 1 : 0)
                : (isset($existingWp['active']) ? (int)$existingWp['active'] : 1);
            $pdo->prepare(
                "INSERT INTO `agency_workplaces` (`id`, `company_client_id`, `name`, `address`, `contact_lead_id`, `default_shift_code`, `notes`, `active`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `name` = VALUES(`name`),
                  `address` = VALUES(`address`),
                  `contact_lead_id` = VALUES(`contact_lead_id`),
                  `default_shift_code` = VALUES(`default_shift_code`),
                  `notes` = VALUES(`notes`),
                  `active` = VALUES(`active`)"
            )->execute([
                $id,
                $companyClientId,
                $name,
                $address,
                $contactLeadId,
                $defaultShiftCode,
                $notes,
                $active,
            ]);
            mcp_audit($pdo, $user, 'agency_workplace_upsert', "Upserted workplace '{$name}' ({$id})");
            return [
                'id' => $id,
                'companyClientId' => $companyClientId,
                'name' => $name,
                'address' => $address,
                'contactLeadId' => $contactLeadId,
                'defaultShiftCode' => $defaultShiftCode,
                'notes' => $notes,
                'active' => $active === 1,
            ];
        }

        case 'upsert_agency_placement': {
            $workerId = mcp_require_string($args, 'workerId');
            $companyClientId = mcp_require_string($args, 'companyClientId');
            $startDate = mcp_require_date($args, 'startDate');

            $id = trim((string)($args['id'] ?? ''));
            $isNew = ($id === '');
            if ($isNew) {
                $id = ccrm_agency_uid('agpl');
            }
            $existing = null;
            if (!$isNew) {
                $st = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `id` = ? LIMIT 1");
                $st->execute([$id]);
                $existing = $st->fetch(\PDO::FETCH_ASSOC) ?: null;
                if (!$existing) $isNew = true;
            }

            $endDate = array_key_exists('endDate', $args) ? mcp_optional_date($args, 'endDate') : ($existing['end_date'] ?? null);
            $status = (array_key_exists('status', $args) && $args['status'] !== '')
                ? mcp_enum($args, 'status', ['planned', 'active', 'completed', 'terminated'], 'active')
                : (string)($existing['status'] ?? 'active');
            $workplaceId = array_key_exists('workplaceId', $args)
                ? (!empty($args['workplaceId']) ? trim((string)$args['workplaceId']) : null)
                : ($existing['workplace_id'] ?? null);
            $contactLeadId = array_key_exists('contactLeadId', $args)
                ? (!empty($args['contactLeadId']) ? trim((string)$args['contactLeadId']) : null)
                : ($existing['contact_lead_id'] ?? null);
            $notes = array_key_exists('notes', $args) ? (string)$args['notes'] : (string)($existing['notes'] ?? '');

            $payRate = $canPayments
                ? floatval($args['payRate'] ?? ($existing['pay_rate'] ?? 0))
                : floatval($existing['pay_rate'] ?? 0);
            $billRate = $canPayments
                ? floatval($args['billRate'] ?? ($existing['bill_rate'] ?? 0))
                : floatval($existing['bill_rate'] ?? 0);
            $payRateType = mcp_enum($args, 'payRateType', ['hourly', 'monthly'], $existing['pay_rate_type'] ?? 'hourly');
            $billRateType = mcp_enum($args, 'billRateType', ['hourly', 'monthly'], $existing['bill_rate_type'] ?? 'hourly');
            $currency = trim((string)($args['currency'] ?? ($existing['currency'] ?? 'EUR'))) ?: 'EUR';
            $jobRole = trim((string)($args['jobRole'] ?? ($existing['job_role'] ?? '')));

            if ($status === 'active') {
                $prevEnd = mcp_iso_shift($startDate, -1);
                $pdo->prepare(
                    "UPDATE `agency_placements`
                     SET `status` = 'completed', `end_date` = COALESCE(`end_date`, ?)
                     WHERE `worker_id` = ? AND `id` <> ? AND `status` = 'active'"
                )->execute([$prevEnd, $workerId, $id]);
            }

            $pdo->prepare(
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
            )->execute([
                $id,
                $workerId,
                $companyClientId,
                $workplaceId,
                $contactLeadId,
                $jobRole,
                $status,
                $startDate,
                $endDate,
                $payRate,
                $payRateType,
                $billRate,
                $billRateType,
                $currency,
                $notes,
            ]);

            $activeCntStmt = $pdo->prepare("SELECT COUNT(*) FROM `agency_placements` WHERE `worker_id` = ? AND `status` = 'active'");
            $activeCntStmt->execute([$workerId]);
            if ((int)$activeCntStmt->fetchColumn() > 0) {
                $pdo->prepare("UPDATE `agency_workers` SET `worker_status` = 'rented', `stage_id` = 'placed' WHERE `id` = ?")->execute([$workerId]);
            } else {
                $pdo->prepare("UPDATE `agency_workers` SET `worker_status` = 'bench' WHERE `id` = ? AND `worker_status` = 'rented'")->execute([$workerId]);
            }

            $compStmt = $pdo->prepare("SELECT `name` FROM `leads` WHERE `id` = ? LIMIT 1");
            $compStmt->execute([$companyClientId]);
            $compName = (string)($compStmt->fetchColumn() ?: $companyClientId);

            if ($isNew || ($existing && ((string)$existing['company_client_id'] !== $companyClientId || (string)$existing['status'] !== $status))) {
                $title = $status === 'active'
                    ? "Placed at {$compName}" . ($jobRole !== '' ? " ({$jobRole})" : '')
                    : "Placement {$status}: {$compName}";
                ccrm_agency_log_timeline($pdo, $workerId, 'placement', $title, $notes, [
                    'placementId' => $id,
                    'companyClientId' => $companyClientId,
                    'companyName' => $compName,
                    'status' => $status,
                ], $startDate, $userName);
            }

            mcp_audit($pdo, $user, 'agency_placement_upsert', "Upserted placement {$id} for worker {$workerId}");
            $fresh = $pdo->prepare("SELECT * FROM `agency_placements` WHERE `id` = ? LIMIT 1");
            $fresh->execute([$id]);
            return ccrm_agency_project_placement($fresh->fetch(\PDO::FETCH_ASSOC), $scope);
        }

        case 'log_agency_shifts': {
            $rows = is_array($args['shifts'] ?? null) ? $args['shifts'] : [];
            if (empty($rows)) {
                throw new \Exception('shifts array is required.');
            }
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
            $savedCount = 0;
            foreach ($rows as $sh) {
                if (!is_array($sh)) continue;
                $workerId = trim((string)($sh['workerId'] ?? ''));
                $companyClientId = trim((string)($sh['companyClientId'] ?? ''));
                $workDate = substr(trim((string)($sh['workDate'] ?? '')), 0, 10);
                if ($workerId === '' || $companyClientId === '' || !mcp_iso_ok($workDate)) {
                    throw new \Exception('Each shift requires workerId, companyClientId, and YYYY-MM-DD workDate.');
                }
                if (!$isAdmin && ccrm_agency_is_period_paid($pdo, $workerId, $workDate)) {
                    throw new \Exception("Period for {$workDate} is already paid and locked for edits.");
                }
                $prevStmt = $pdo->prepare("SELECT `status` FROM `agency_shifts` WHERE `worker_id` = ? AND `work_date` = ? AND `company_client_id` = ? LIMIT 1");
                $prevStmt->execute([$workerId, $workDate, $companyClientId]);
                $prevStatus = $prevStmt->fetchColumn();

                $status = mcp_enum($sh, 'status', ['scheduled', 'worked', 'sick', 'absent', 'holiday'], 'worked');
                $hours = ($status === 'sick' || $status === 'absent') ? 0.0 : floatval($sh['hours'] ?? 8);
                $ot = ($status === 'sick' || $status === 'absent') ? 0.0 : floatval($sh['overtimeHours'] ?? 0);
                $sickNote = (string)($sh['sickNote'] ?? '');
                $shiftLabel = (string)($sh['shiftLabel'] ?? '');

                $ins->execute([
                    ccrm_agency_uid('agsh'),
                    $workerId,
                    !empty($sh['placementId']) ? (string)$sh['placementId'] : null,
                    $companyClientId,
                    !empty($sh['workplaceId']) ? (string)$sh['workplaceId'] : null,
                    $workDate,
                    !empty($sh['shiftTemplateId']) ? (string)$sh['shiftTemplateId'] : null,
                    $shiftLabel,
                    (string)($sh['startTime'] ?? ''),
                    (string)($sh['endTime'] ?? ''),
                    $hours,
                    $ot,
                    $status,
                    $sickNote,
                    (string)($sh['notes'] ?? ''),
                    $userName,
                ]);
                if ($status === 'sick' && $prevStatus !== 'sick') {
                    ccrm_agency_log_timeline($pdo, $workerId, 'sick_leave', "Sick leave logged ({$workDate})", $sickNote, ['workDate' => $workDate, 'companyClientId' => $companyClientId], $workDate, $userName);
                } elseif ($status === 'worked' && $prevStatus !== 'worked') {
                    $totalH = $hours + $ot;
                    ccrm_agency_log_timeline($pdo, $workerId, 'work_log', trim("{$workDate}: {$shiftLabel} {$totalH}h"), '', ['workDate' => $workDate, 'hours' => $totalH, 'companyClientId' => $companyClientId], $workDate, $userName);
                }
                $savedCount++;
            }
            mcp_audit($pdo, $user, 'agency_shifts_log', "Logged {$savedCount} agency shift(s)");
            return ['success' => true, 'savedCount' => $savedCount];
        }

        case 'log_agency_sick_leave': {
            $workerId = mcp_require_string($args, 'workerId');
            $companyClientId = mcp_require_string($args, 'companyClientId');
            $fromDate = mcp_require_date($args, 'fromDate');
            $toDate = mcp_optional_date($args, 'toDate') ?? $fromDate;
            if ($toDate < $fromDate) {
                throw new \Exception('toDate cannot be earlier than fromDate.');
            }
            $sickNote = (string)($args['sickNote'] ?? '');
            $dates = [];
            $cur = $fromDate;
            while ($cur <= $toDate && count($dates) < 62) {
                if (!$isAdmin && ccrm_agency_is_period_paid($pdo, $workerId, $cur)) {
                    throw new \Exception("Period for {$cur} is already paid and locked for edits.");
                }
                $dates[] = $cur;
                $cur = mcp_iso_shift($cur, 1);
            }
            $ins = $pdo->prepare(
                "INSERT INTO `agency_shifts`
                  (`id`, `worker_id`, `placement_id`, `company_client_id`, `workplace_id`, `work_date`, `shift_label`, `hours`, `overtime_hours`, `status`, `sick_note`, `notes`, `created_by`)
                 VALUES (?, ?, ?, ?, ?, ?, 'SICK', 0, 0, 'sick', ?, '', ?)
                 ON DUPLICATE KEY UPDATE `status` = 'sick', `hours` = 0, `overtime_hours` = 0, `sick_note` = VALUES(`sick_note`)"
            );
            foreach ($dates as $d) {
                $ins->execute([
                    ccrm_agency_uid('agsh'),
                    $workerId,
                    !empty($args['placementId']) ? (string)$args['placementId'] : null,
                    $companyClientId,
                    !empty($args['workplaceId']) ? (string)$args['workplaceId'] : null,
                    $d,
                    $sickNote,
                    $userName,
                ]);
            }
            $rangeTitle = $fromDate === $toDate ? "Sick leave logged ({$fromDate})" : "Sick leave logged ({$fromDate} → {$toDate})";
            $event = ccrm_agency_log_timeline($pdo, $workerId, 'sick_leave', $rangeTitle, $sickNote, ['fromDate' => $fromDate, 'toDate' => $toDate, 'days' => count($dates), 'companyClientId' => $companyClientId], $fromDate, $userName);
            mcp_audit($pdo, $user, 'agency_sick_leave', "Logged sick leave for {$workerId} ({$fromDate}..{$toDate})");
            return ['success' => true, 'daysLogged' => count($dates), 'timelineEvent' => $event];
        }

        case 'add_agency_timeline_note': {
            $workerId = mcp_require_string($args, 'workerId');
            $title = mcp_require_string($args, 'title');
            $eventType = mcp_enum($args, 'eventType', ['contact', 'note', 'compliance', 'sick_leave'], 'note');
            $event = ccrm_agency_log_timeline(
                $pdo,
                $workerId,
                $eventType,
                $title,
                (string)($args['description'] ?? ''),
                [],
                !empty($args['occurredAt']) ? (string)$args['occurredAt'] : null,
                $userName
            );
            mcp_audit($pdo, $user, 'agency_timeline_add', "Added timeline event '{$title}' on {$workerId}");
            return $event;
        }

        case 'list_agency_payments': {
            $where = ['1=1'];
            $params = [];
            if (!empty($args['periodYm'])) {
                $where[] = "`period_ym` = ?";
                $params[] = trim((string)$args['periodYm']);
            }
            if (!empty($args['workerId'])) {
                $where[] = "`worker_id` = ?";
                $params[] = trim((string)$args['workerId']);
            }
            if (!empty($args['status'])) {
                $status = mcp_enum($args, 'status', ['draft', 'approved', 'paid']);
                $where[] = "`status` = ?";
                $params[] = $status;
            }
            $win = mcp_list_window($args, [
                'created' => null,
                'updated' => 'updated_at',
                'id' => 'id',
                'sorts' => [
                    'period_ym' => ['period_ym', 'DESC', 'updated_at DESC'],
                ],
                'default_sort' => 'period_ym',
                'default_limit' => 50,
                'max_limit' => 100,
            ]);
            $where = array_merge($where, $win['where']);
            $params = array_merge($params, $win['params']);
            $sql = "SELECT * FROM `agency_payments` WHERE " . implode(' AND ', $where) . " " . $win['tail'];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(static fn ($r) => ccrm_agency_project_payment($r), $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'calculate_agency_payment': {
            $workerId = mcp_require_string($args, 'workerId');
            $periodYm = mcp_require_string($args, 'periodYm');
            if (!preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                throw new \Exception('periodYm must use YYYY-MM format.');
            }
            return ccrm_agency_calculate_payment_data($pdo, $workerId, $periodYm);
        }

        case 'update_agency_checklist': {
            $workerId = mcp_require_string($args, 'workerId');
            $chkW = $pdo->prepare("SELECT `id` FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $chkW->execute([$workerId]);
            if (!$chkW->fetchColumn()) {
                throw new \InvalidArgumentException("Agency worker not found: {$workerId}");
            }
            $items = is_array($args['items'] ?? null) ? $args['items'] : [];
            if (empty($items)) {
                throw new \InvalidArgumentException('items array cannot be empty.');
            }
            $findByKey = $pdo->prepare("SELECT `id` FROM `agency_worker_checklists` WHERE `worker_id` = ? AND `item_key` = ? LIMIT 1");
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
                $itemKey = trim((string)($it['itemKey'] ?? ('item_' . $idx)));
                $cid = trim((string)($it['id'] ?? ''));
                if ($cid === '') {
                    $findByKey->execute([$workerId, $itemKey]);
                    $cid = (string)($findByKey->fetchColumn() ?: ccrm_agency_uid('agchk'));
                }
                $rawStatus = (string)($it['status'] ?? 'pending');
                if ($rawStatus === 'missing') $rawStatus = 'pending';
                $dbStatus = in_array($rawStatus, ['pending', 'submitted', 'verified', 'expired'], true)
                    ? $rawStatus
                    : 'pending';
                $exp = !empty($it['expiresAt']) ? substr((string)$it['expiresAt'], 0, 10) : null;
                $ins->execute([
                    $cid,
                    $workerId,
                    $itemKey,
                    trim((string)($it['label'] ?? 'Item')),
                    $dbStatus,
                    $exp,
                    (string)($it['note'] ?? ''),
                    !empty($it['fileId']) ? (string)$it['fileId'] : null,
                    intval($it['sortOrder'] ?? $idx),
                ]);
                $idx++;
            }
            ccrm_agency_log_timeline($pdo, $workerId, 'compliance', 'Checklist updated', '', [], null, $userName);
            mcp_audit($pdo, $user, 'agency_checklist_update', "Updated {$idx} checklist item(s) for {$workerId}");
            $chkStmt = $pdo->prepare("SELECT * FROM `agency_worker_checklists` WHERE `worker_id` = ? ORDER BY `sort_order` ASC, `id` ASC");
            $chkStmt->execute([$workerId]);
            $rows = array_map(static function ($r) {
                $stVal = (string)($r['status'] ?? 'pending');
                if ($stVal === 'pending') $stVal = 'missing';
                return [
                    'id' => (string)$r['id'],
                    'workerId' => (string)$r['worker_id'],
                    'itemKey' => (string)$r['item_key'],
                    'label' => (string)$r['label'],
                    'status' => $stVal,
                    'expiresAt' => $r['expires_at'] ? (string)$r['expires_at'] : null,
                    'note' => (string)($r['note'] ?? ''),
                    'fileId' => $r['file_id'] ? (string)$r['file_id'] : null,
                    'sortOrder' => intval($r['sort_order'] ?? 0),
                ];
            }, $chkStmt->fetchAll(\PDO::FETCH_ASSOC));
            return ['success' => true, 'checklist' => $rows];
        }

        case 'record_agency_payment': {
            $workerId = mcp_require_string($args, 'workerId');
            $periodYm = mcp_require_string($args, 'periodYm');
            if (!preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                throw new \InvalidArgumentException('periodYm must use YYYY-MM format.');
            }
            $wSt = $pdo->prepare("SELECT `full_name` FROM `agency_workers` WHERE `id` = ? LIMIT 1");
            $wSt->execute([$workerId]);
            $wName = $wSt->fetchColumn();
            if ($wName === false) {
                throw new \InvalidArgumentException("Agency worker not found: {$workerId}");
            }

            $id = trim((string)($args['id'] ?? ''));
            if ($id === '') {
                $existingIdStmt = $pdo->prepare("SELECT `id`, `status` FROM `agency_payments` WHERE `worker_id` = ? AND `period_ym` = ? LIMIT 1");
                $existingIdStmt->execute([$workerId, $periodYm]);
                $ex = $existingIdStmt->fetch(\PDO::FETCH_ASSOC);
                if ($ex) {
                    if (($ex['status'] ?? '') === 'paid') {
                        throw new \InvalidArgumentException('Paid agency payouts cannot be modified via MCP.');
                    }
                    $id = (string)$ex['id'];
                } else {
                    $id = ccrm_agency_uid('agpay');
                }
            } else {
                $exSt = $pdo->prepare("SELECT `status` FROM `agency_payments` WHERE `id` = ? LIMIT 1");
                $exSt->execute([$id]);
                $exStatus = $exSt->fetchColumn();
                if ($exStatus === 'paid') {
                    throw new \InvalidArgumentException('Paid agency payouts cannot be modified via MCP.');
                }
            }

            $status = mcp_enum($args, 'status', ['draft', 'approved'], 'draft');
            $basePay = round(floatval($args['basePay'] ?? 0), 2);
            $items = is_array($args['items'] ?? null) ? array_values($args['items']) : [];
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
            $currency = trim((string)($args['currency'] ?? 'EUR')) ?: 'EUR';

            $ins = $pdo->prepare(
                "INSERT INTO `agency_payments`
                  (`id`, `worker_id`, `placement_id`, `company_client_id`, `period_ym`, `regular_hours`, `overtime_hours`, `sick_days`, `base_pay`, `items_json`, `gross_pay`, `deductions_total`, `net_pay`, `paid_amount`, `billable_total`, `currency`, `status`, `paid_at`, `notes`)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?)
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
                  `billable_total` = VALUES(`billable_total`),
                  `currency` = VALUES(`currency`),
                  `status` = VALUES(`status`),
                  `notes` = VALUES(`notes`)"
            );
            $ins->execute([
                $id,
                $workerId,
                !empty($args['placementId']) ? (string)$args['placementId'] : null,
                !empty($args['companyClientId']) ? (string)$args['companyClientId'] : null,
                $periodYm,
                floatval($args['regularHours'] ?? 0),
                floatval($args['overtimeHours'] ?? 0),
                floatval($args['sickDays'] ?? 0),
                $basePay,
                json_encode($items, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                $grossPay,
                $deductionsTotal,
                $netPay,
                round(floatval($args['billableTotal'] ?? 0), 2),
                $currency,
                $status,
                (string)($args['notes'] ?? ''),
            ]);

            $freshStmt = $pdo->prepare("SELECT * FROM `agency_payments` WHERE `id` = ? LIMIT 1");
            $freshStmt->execute([$id]);
            $freshRow = $freshStmt->fetch(\PDO::FETCH_ASSOC);
            $settings = ccrm_agency_load_settings($pdo);
            ccrm_agency_sync_financial_expense($pdo, $freshRow, (string)$wName, $settings);

            $freshStmt->execute([$id]);
            mcp_audit($pdo, $user, 'agency_payment_record', "Recorded {$status} agency payment {$id} ({$periodYm}) for {$workerId}");
            return ['success' => true, 'payment' => ccrm_agency_project_payment($freshStmt->fetch(\PDO::FETCH_ASSOC))];
        }

        case 'create_agency_client_billing': {
            $companyClientId = mcp_require_string($args, 'companyClientId');
            $periodYm = mcp_require_string($args, 'periodYm');
            if (!preg_match('/^\d{4}-\d{2}$/', $periodYm)) {
                throw new \InvalidArgumentException('periodYm must use YYYY-MM format.');
            }
            $sumStmt = $pdo->prepare("SELECT COALESCE(SUM(`billable_total`), 0) AS billable, COUNT(*) AS cnt FROM `agency_payments` WHERE `company_client_id` = ? AND `period_ym` = ?");
            $sumStmt->execute([$companyClientId, $periodYm]);
            $agg = $sumStmt->fetch(\PDO::FETCH_ASSOC);
            $amount = round(floatval($agg['billable'] ?? 0), 2);
            if ($amount <= 0) {
                throw new \InvalidArgumentException('No billable amount for company and period.');
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
            $pdo->prepare(
                "INSERT INTO `financial_records` (`id`, `type`, `subtype`, `title`, `category_id`, `client_id`, `amount_planned`, `amount_real`, `currency`, `status`, `issue_date`, `due_date`, `description`)
                 VALUES (?, 'income', 'invoice', ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                  `amount_planned` = VALUES(`amount_planned`),
                  `title` = VALUES(`title`)"
            )->execute([
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
            mcp_audit($pdo, $user, 'agency_client_billing_create', "Created pending client billing {$frId} ({$amount} {$currency}) for {$companyClientId}");
            return ['success' => true, 'financialRecordId' => $frId, 'amount' => $amount, 'currency' => $currency];
        }

        default:
            return MCP_NOT_MINE;
    }
}
