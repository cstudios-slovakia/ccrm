<?php
/**
 * CCRM MCP Gateway — Commercial, Finance, Warehouse, Support & Workflows Extensions (WP3)
 *
 * Implements:
 * - Offers & Invoices: update_price_offer, update_invoice, list_offer_templates,
 *   create_offer_category, update_offer_category
 * - Financial Movements & Categories (Decision D2): record_income_movement,
 *   update_financial_movement, create_recurring_movement, update_recurring_movement,
 *   create_financial_category, update_financial_category
 * - Orders & CRM Conversion: convert_order_guest_to_client
 * - Warehouse & Suppliers: update_inventory_item, get_supplier, create_supplier,
 *   update_supplier, get_stock_movement, record_stock_transfer, create_warehouse,
 *   update_warehouse
 * - Support Contracts & Ticket Task Links: get_support_contract,
 *   create_support_contract, update_support_contract, set_ticket_task_links
 * - Custom Registries & Workflows: create_unified_entry_row, update_unified_entry_row,
 *   set_workflow_active, start_workflow_manual
 *
 * Loaded via require_once from public/api/mcp.php. Contains zero destructive SQL.
 */

function mcp_ext_commercial_permissions(): array {
    $v = fn(string ...$k) => ['view' => $k];
    $e = fn(string ...$k) => ['edit' => $k];
    return [
        'update_price_offer' => $e('invoices'),
        'update_invoice' => $e('invoices', 'financial'),
        'list_offer_templates' => $v('invoices'),
        'create_offer_category' => $e('invoices'),
        'update_offer_category' => $e('invoices'),
        'record_income_movement' => $e('financial'),
        'update_financial_movement' => $e('financial'),
        'create_recurring_movement' => $e('financial'),
        'update_recurring_movement' => $e('financial'),
        'create_financial_category' => $e('financial'),
        'update_financial_category' => $e('financial'),
        'convert_order_guest_to_client' => $e('orders', 'clients'),
        'update_inventory_item' => $e('warehouse'),
        'get_supplier' => $v('warehouse'),
        'create_supplier' => $e('warehouse'),
        'update_supplier' => $e('warehouse'),
        'get_stock_movement' => $v('warehouse'),
        'record_stock_transfer' => $e('warehouse'),
        'create_warehouse' => $e('warehouse'),
        'update_warehouse' => $e('warehouse'),
        'get_support_contract' => $v('tickets'),
        'create_support_contract' => $e('tickets'),
        'update_support_contract' => $e('tickets'),
        'set_ticket_task_links' => $e('tickets', 'tasks'),
        'create_unified_entry_row' => $e('unified_entries'),
        'update_unified_entry_row' => $e('unified_entries'),
        'set_workflow_active' => $e('automation'),
        'start_workflow_manual' => $e('automation'),
    ];
}

function mcp_ext_commercial_tool_definitions(): array {
    $idProp = fn(string $desc) => ['type' => 'string', 'description' => $desc];
    $lineItemSchema = [
        'type' => 'array',
        'items' => [
            'type' => 'object',
            'properties' => [
                'title' => ['type' => 'string'],
                'description' => ['type' => 'string'],
                'sku' => ['type' => 'string'],
                'warehouse_item_id' => ['type' => 'string'],
                'quantity' => ['type' => 'number'],
                'unit' => ['type' => 'string'],
                'unit_price' => ['type' => 'number'],
                'vat_rate' => ['type' => 'number'],
                'discount_pct' => ['type' => 'number'],
            ],
            'required' => ['title', 'unit_price'],
        ],
    ];

    return [
        [
            'name' => 'update_price_offer',
            'description' => 'Update a draft or open price offer header (title, subject, client_id, category_id, valid_until, notes) and optionally replace line items.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Price offer ID'),
                    'title' => ['type' => 'string'],
                    'subject' => ['type' => 'string'],
                    'client_id' => ['type' => 'string'],
                    'category_id' => ['type' => 'string', 'description' => 'Offer category ID (empty clears)'],
                    'issued_at' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'valid_until' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'greeting_note' => ['type' => 'string'],
                    'intro_note' => ['type' => 'string'],
                    'closing_note' => ['type' => 'string'],
                    'items' => $lineItemSchema,
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'update_invoice',
            'description' => 'Update a draft/open invoice or proforma metadata (title, due_date, issued_at, notes, project_id) and sync the unsettled linked financial movement (fr-inv-*).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Invoice or proforma ID'),
                    'title' => ['type' => 'string'],
                    'issued_at' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'notes' => ['type' => 'string'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID on financial movement (empty clears)'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'list_offer_templates',
            'description' => 'List saved custom AI PDF price offer templates (ai_custom_templates).',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'create_offer_category',
            'description' => 'Create a price offer classification category in offer_categories.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string'],
                    'color' => ['type' => 'string'],
                    'sort_order' => ['type' => 'integer'],
                ],
                'required' => ['name'],
            ],
        ],
        [
            'name' => 'update_offer_category',
            'description' => 'Update a price offer category name, parent_id, color, or sort_order.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Offer category ID'),
                    'name' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string', 'description' => 'Parent ID (empty clears)'],
                    'color' => ['type' => 'string'],
                    'sort_order' => ['type' => 'integer'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'record_income_movement',
            'description' => 'Record a planned or pending expected income movement in Financial Management. Settling money as paid is left to the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'amount' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'category_id' => ['type' => 'string'],
                    'issue_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'pending'], 'description' => 'Default planned'],
                    'payment_method' => ['type' => 'string'],
                    'invoice_number' => ['type' => 'string'],
                    'tax_rate' => ['type' => 'number'],
                    'project_id' => ['type' => 'string'],
                    'client_id' => ['type' => 'string'],
                ],
                'required' => ['title', 'amount', 'issue_date'],
            ],
        ],
        [
            'name' => 'update_financial_movement',
            'description' => 'Update an unsettled planned/pending financial movement or cancel it (status=cancelled). Settled (paid) movements and cash settlement stay in the app.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Financial movement ID'),
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'amount_planned' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'category_id' => ['type' => 'string', 'description' => 'Category ID (empty clears)'],
                    'issue_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD (empty clears)'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'pending', 'cancelled']],
                    'payment_method' => ['type' => 'string'],
                    'invoice_number' => ['type' => 'string'],
                    'tax_rate' => ['type' => 'number'],
                    'project_id' => ['type' => 'string', 'description' => 'Project ID (empty clears)'],
                    'client_id' => ['type' => 'string', 'description' => 'Client ID (empty clears)'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_recurring_movement',
            'description' => 'Create a recurring income or expense schedule rule (weekly, monthly, yearly) in financial_records.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'amount_planned' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'category_id' => ['type' => 'string'],
                    'frequency' => ['type' => 'string', 'enum' => ['weekly', 'monthly', 'yearly']],
                    'start_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'end_date' => ['type' => 'string', 'description' => 'Optional end date YYYY-MM-DD'],
                    'day_of_month' => ['type' => 'integer', 'description' => 'Day 1-31 for monthly rules'],
                    'day_of_week' => ['type' => 'integer', 'description' => '0=Sun..6=Sat for weekly rules'],
                    'project_id' => ['type' => 'string'],
                    'client_id' => ['type' => 'string'],
                    'payment_method' => ['type' => 'string'],
                    'tax_rate' => ['type' => 'number'],
                ],
                'required' => ['type', 'title', 'amount_planned', 'frequency', 'start_date'],
            ],
        ],
        [
            'name' => 'update_recurring_movement',
            'description' => 'Update, pause/resume (paused=true|false), or cancel (status=cancelled) a recurring financial rule.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Recurring movement rule ID'),
                    'title' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'amount_planned' => ['type' => 'number'],
                    'currency' => ['type' => 'string'],
                    'category_id' => ['type' => 'string'],
                    'frequency' => ['type' => 'string', 'enum' => ['weekly', 'monthly', 'yearly']],
                    'start_date' => ['type' => 'string'],
                    'end_date' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (empty clears)'],
                    'paused' => ['type' => 'boolean', 'description' => 'true pauses future occurrences today, false resumes'],
                    'status' => ['type' => 'string', 'enum' => ['planned', 'pending', 'cancelled']],
                    'project_id' => ['type' => 'string'],
                    'client_id' => ['type' => 'string'],
                    'tax_rate' => ['type' => 'number'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_financial_category',
            'description' => 'Create an income or expense financial category in financial_categories.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'enum' => ['income', 'expense']],
                    'name' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string'],
                    'color' => ['type' => 'string'],
                    'sort_order' => ['type' => 'integer'],
                ],
                'required' => ['type', 'name'],
            ],
        ],
        [
            'name' => 'update_financial_category',
            'description' => 'Update an existing financial category name, color, parent_id, or sort_order.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Financial category ID'),
                    'name' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string', 'description' => 'Parent category ID (empty clears)'],
                    'color' => ['type' => 'string'],
                    'sort_order' => ['type' => 'integer'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'convert_order_guest_to_client',
            'description' => 'Convert a guest order customer into a permanent CRM client-* profile and link the order to it.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => ['order_id' => $idProp('Guest order ID')],
                'required' => ['order_id'],
            ],
        ],
        [
            'name' => 'update_inventory_item',
            'description' => 'Update warehouse catalog item fields (SKU, barcode, name, category, unit, min/optimal stock, default price/location, VAT, pack info, alt_codes, price_levels).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Warehouse item ID'),
                    'sku' => ['type' => 'string'],
                    'barcode' => ['type' => 'string'],
                    'name' => ['type' => 'string'],
                    'description' => ['type' => 'string'],
                    'category' => ['type' => 'string'],
                    'unit' => ['type' => 'string'],
                    'min_stock' => ['type' => 'number'],
                    'optimal_stock' => ['type' => 'number'],
                    'default_location' => ['type' => 'string'],
                    'has_expiration' => ['type' => 'boolean'],
                    'default_sell_price' => ['type' => 'number'],
                    'vat_rate' => ['type' => 'number'],
                    'pack_quantity' => ['type' => 'number'],
                    'pack_unit' => ['type' => 'string'],
                    'weight_kg' => ['type' => 'number'],
                    'alt_codes' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'price_levels' => ['type' => 'object', 'description' => 'Map of {price_level_id: price} to upsert in warehouse_item_prices'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'get_supplier',
            'description' => 'Get full details of a supplier including bank/IBAN, IČO/DIČ/IČ DPH, payment terms, and contacts.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $idProp('Supplier ID')], 'required' => ['id']],
        ],
        [
            'name' => 'create_supplier',
            'description' => 'Create a new warehouse/purchase supplier record in suppliers.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string'],
                    'company_id' => ['type' => 'string', 'description' => 'IČO'],
                    'tax_id' => ['type' => 'string', 'description' => 'DIČ'],
                    'vat_id' => ['type' => 'string', 'description' => 'IČ DPH'],
                    'street' => ['type' => 'string'],
                    'city' => ['type' => 'string'],
                    'postal_code' => ['type' => 'string'],
                    'country' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'phone' => ['type' => 'string'],
                    'website' => ['type' => 'string'],
                    'iban' => ['type' => 'string'],
                    'swift' => ['type' => 'string'],
                    'payment_due_days' => ['type' => 'integer'],
                    'notes' => ['type' => 'string'],
                ],
                'required' => ['name'],
            ],
        ],
        [
            'name' => 'update_supplier',
            'description' => 'Update supplier contact, tax IDs, address, payment terms, IBAN/SWIFT, or notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Supplier ID'),
                    'name' => ['type' => 'string'],
                    'company_id' => ['type' => 'string'],
                    'tax_id' => ['type' => 'string'],
                    'vat_id' => ['type' => 'string'],
                    'street' => ['type' => 'string'],
                    'city' => ['type' => 'string'],
                    'postal_code' => ['type' => 'string'],
                    'country' => ['type' => 'string'],
                    'email' => ['type' => 'string'],
                    'phone' => ['type' => 'string'],
                    'website' => ['type' => 'string'],
                    'iban' => ['type' => 'string'],
                    'swift' => ['type' => 'string'],
                    'payment_due_days' => ['type' => 'integer'],
                    'notes' => ['type' => 'string'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'get_stock_movement',
            'description' => 'Get a warehouse stock movement header together with all line items (warehouse_movement_items).',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $idProp('Stock movement ID or document_number')], 'required' => ['id']],
        ],
        [
            'name' => 'record_stock_transfer',
            'description' => 'Transfer stock between two warehouses (creates a confirmed transfer document PRE-YYYY-NNNN and updates stock on both warehouses).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'from_warehouse_id' => $idProp('Source warehouse ID'),
                    'to_warehouse_id' => $idProp('Target warehouse ID'),
                    'note' => ['type' => 'string'],
                    'items' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'item_id' => ['type' => 'string'],
                                'quantity' => ['type' => 'number'],
                                'note' => ['type' => 'string'],
                            ],
                            'required' => ['item_id', 'quantity'],
                        ],
                    ],
                ],
                'required' => ['from_warehouse_id', 'to_warehouse_id', 'items'],
            ],
        ],
        [
            'name' => 'create_warehouse',
            'description' => 'Create a new physical warehouse / storage location.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'name' => ['type' => 'string'],
                    'code' => ['type' => 'string'],
                    'address' => ['type' => 'string'],
                    'is_default' => ['type' => 'boolean'],
                ],
                'required' => ['name', 'code'],
            ],
        ],
        [
            'name' => 'update_warehouse',
            'description' => 'Update warehouse name, code, address, or default status.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Warehouse ID'),
                    'name' => ['type' => 'string'],
                    'code' => ['type' => 'string'],
                    'address' => ['type' => 'string'],
                    'is_default' => ['type' => 'boolean'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'get_support_contract',
            'description' => 'Get full SLA response/resolution targets and retainer billing details of one support contract.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => $idProp('Support contract ID')], 'required' => ['id']],
        ],
        [
            'name' => 'create_support_contract',
            'description' => 'Create an SLA support retainer contract linked to a client and/or project.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string'],
                    'project_id' => ['type' => 'string'],
                    'tier' => ['type' => 'string', 'enum' => ['basic', 'pro', 'enterprise', 'project_only']],
                    'monthly_hours' => ['type' => 'number'],
                    'hourly_rate' => ['type' => 'number'],
                    'sla_response_critical_hours' => ['type' => 'number'],
                    'sla_response_high_hours' => ['type' => 'number'],
                    'sla_response_normal_hours' => ['type' => 'number'],
                    'sla_response_low_hours' => ['type' => 'number'],
                    'sla_resolve_critical_hours' => ['type' => 'number'],
                    'sla_resolve_high_hours' => ['type' => 'number'],
                    'sla_resolve_normal_hours' => ['type' => 'number'],
                    'sla_resolve_low_hours' => ['type' => 'number'],
                    'valid_from' => ['type' => 'string'],
                    'valid_until' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                ],
            ],
        ],
        [
            'name' => 'update_support_contract',
            'description' => 'Update support contract tier, monthly hours, SLA response/resolve targets, validity dates, or notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => $idProp('Support contract ID'),
                    'tier' => ['type' => 'string', 'enum' => ['basic', 'pro', 'enterprise', 'project_only']],
                    'monthly_hours' => ['type' => 'number'],
                    'hourly_rate' => ['type' => 'number'],
                    'valid_from' => ['type' => 'string'],
                    'valid_until' => ['type' => 'string'],
                    'notes' => ['type' => 'string'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'set_ticket_task_links',
            'description' => 'Link one or more tasks to a support ticket (auto_resolve or manual sync mode) without removing existing links.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'ticket_id' => $idProp('Ticket ID or ticket number'),
                    'task_ids' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Task IDs to link'],
                    'sync_mode' => ['type' => 'string', 'enum' => ['auto_resolve', 'manual'], 'description' => 'Default auto_resolve'],
                ],
                'required' => ['ticket_id', 'task_ids'],
            ],
        ],
        [
            'name' => 'create_unified_entry_row',
            'description' => 'Create a row or folder in a custom registry (ue_<registry_id>), validating against the registry\'s configured modules.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'registry_id' => $idProp('Registry ID from list_unified_entries'),
                    'title' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string'],
                    'is_folder' => ['type' => 'boolean'],
                    'icon' => ['type' => 'string'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                    'warning_days' => ['type' => 'integer'],
                    'client_id' => ['type' => 'string'],
                    'lead_id' => ['type' => 'string'],
                    'number_value' => ['type' => 'number'],
                    'money_amount' => ['type' => 'number'],
                    'money_currency' => ['type' => 'string'],
                ],
                'required' => ['registry_id', 'title'],
            ],
        ],
        [
            'name' => 'update_unified_entry_row',
            'description' => 'Update an existing row or folder in a custom registry (ue_<registry_id>).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'registry_id' => $idProp('Registry ID'),
                    'row_id' => $idProp('Row ID inside the registry'),
                    'title' => ['type' => 'string'],
                    'parent_id' => ['type' => 'string', 'description' => 'Parent folder ID (empty clears)'],
                    'due_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD (empty clears)'],
                    'warning_days' => ['type' => 'integer'],
                    'client_id' => ['type' => 'string'],
                    'lead_id' => ['type' => 'string'],
                    'number_value' => ['type' => 'number'],
                    'money_amount' => ['type' => 'number'],
                    'money_currency' => ['type' => 'string'],
                ],
                'required' => ['registry_id', 'row_id'],
            ],
        ],
        [
            'name' => 'set_workflow_active',
            'description' => 'Enable or pause an automation workflow (workflows.is_active).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'workflow_id' => $idProp('Workflow ID'),
                    'is_active' => ['type' => 'boolean'],
                ],
                'required' => ['workflow_id', 'is_active'],
            ],
        ],
        [
            'name' => 'start_workflow_manual',
            'description' => 'Enqueue an active automation workflow run into workflow_queue with optional trigger payload.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'workflow_id' => $idProp('Workflow ID'),
                    'payload' => ['type' => 'object', 'description' => 'Optional event payload JSON'],
                ],
                'required' => ['workflow_id'],
            ],
        ],
    ];
}

function mcp_ext_commercial_execute(\PDO $pdo, array $user, string $tool, array $args) {
    switch ($tool) {
        case 'update_price_offer': return mcp_comm_update_price_offer($pdo, $user, $args);
        case 'update_invoice': return mcp_comm_update_invoice($pdo, $user, $args);
        case 'list_offer_templates':
            return $pdo->query("SELECT id, name, description, badge_style, created_at FROM ai_custom_templates ORDER BY name ASC")->fetchAll(\PDO::FETCH_ASSOC);
        case 'create_offer_category': return mcp_comm_create_tree_cat($pdo, $user, 'offer_categories', 'ocat_', 'offer', $args);
        case 'update_offer_category': return mcp_comm_update_tree_cat($pdo, $user, 'offer_categories', 'offer', $args);
        case 'record_income_movement': return mcp_comm_record_income($pdo, $user, $args);
        case 'update_financial_movement': return mcp_comm_update_fin_movement($pdo, $user, $args);
        case 'create_recurring_movement': return mcp_comm_create_recurring($pdo, $user, $args);
        case 'update_recurring_movement': return mcp_comm_update_recurring($pdo, $user, $args);
        case 'create_financial_category': return mcp_comm_create_fin_cat($pdo, $user, $args);
        case 'update_financial_category': return mcp_comm_update_tree_cat($pdo, $user, 'financial_categories', 'financial', $args);
        case 'convert_order_guest_to_client': return mcp_comm_convert_guest($pdo, $user, $args);
        case 'update_inventory_item': return mcp_comm_update_item($pdo, $user, $args);
        case 'get_supplier': return mcp_comm_get_supplier($pdo, $args);
        case 'create_supplier': return mcp_comm_create_supplier($pdo, $user, $args);
        case 'update_supplier': return mcp_comm_update_supplier($pdo, $user, $args);
        case 'get_stock_movement': return mcp_comm_get_movement($pdo, $args);
        case 'record_stock_transfer': return mcp_comm_record_transfer($pdo, $user, $args);
        case 'create_warehouse': return mcp_comm_create_warehouse($pdo, $user, $args);
        case 'update_warehouse': return mcp_comm_update_warehouse($pdo, $user, $args);
        case 'get_support_contract':
            $id = mcp_require_string($args, 'id');
            $st = $pdo->prepare("SELECT * FROM support_contracts WHERE id = ? LIMIT 1");
            $st->execute([$id]);
            $row = $st->fetch(\PDO::FETCH_ASSOC);
            if (!$row) throw new \InvalidArgumentException("Support contract not found: {$id}");
            return $row;
        case 'create_support_contract': return mcp_comm_create_contract($pdo, $user, $args);
        case 'update_support_contract': return mcp_comm_update_contract($pdo, $user, $args);
        case 'set_ticket_task_links': return mcp_comm_set_ticket_task_links($pdo, $user, $args);
        case 'create_unified_entry_row': return mcp_comm_ue_row($pdo, $user, $args, false);
        case 'update_unified_entry_row': return mcp_comm_ue_row($pdo, $user, $args, true);
        case 'set_workflow_active':
            $wfId = mcp_require_string($args, 'workflow_id');
            mcp_row_exists($pdo, 'workflows', $wfId, 'Workflow');
            $act = !empty($args['is_active']) ? 1 : 0;
            $pdo->prepare("UPDATE workflows SET is_active = ? WHERE id = ?")->execute([$act, $wfId]);
            mcp_audit($pdo, $user, 'workflow_toggle', "Set workflow {$wfId} active={$act}");
            return ['success' => true, 'workflow_id' => $wfId, 'is_active' => (bool)$act];
        case 'start_workflow_manual':
            $wfId = mcp_require_string($args, 'workflow_id');
            $wf = $pdo->prepare("SELECT id, name, trigger_type, is_active FROM workflows WHERE id = ? LIMIT 1");
            $wf->execute([$wfId]);
            $wfRow = $wf->fetch(\PDO::FETCH_ASSOC);
            if (!$wfRow) throw new \InvalidArgumentException("Workflow not found: {$wfId}");
            if (empty($wfRow['is_active'])) throw new \InvalidArgumentException("Workflow '{$wfRow['name']}' is paused; activate it first.");
            $payload = is_array($args['payload'] ?? null) ? $args['payload'] : [];
            $payload['_triggered_by'] = $user['email'] ?? $user['name'];
            $pdo->prepare("INSERT INTO workflow_queue (workflow_id, trigger_event_type, payload_json, status) VALUES (?, 'manual', ?, 'pending')")
                ->execute([$wfId, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
            $qid = (int)$pdo->lastInsertId();
            mcp_audit($pdo, $user, 'workflow_run_manual', "Enqueued manual run for workflow {$wfId} (queue #{$qid})");
            return ['success' => true, 'queue_id' => $qid, 'workflow_id' => $wfId, 'status' => 'pending'];
        default:
            return MCP_NOT_MINE;
    }
}

// ---------------------------------------------------------------------------
// Commercial / Finance / Warehouse / Registry Helpers
// ---------------------------------------------------------------------------

function mcp_comm_parse_items(\PDO $pdo, array $items): array {
    if (!$items || count($items) > 200) throw new \InvalidArgumentException('items must contain 1 to 200 entries.');
    $defaultVat = mcp_default_vat_rate($pdo);
    $lines = []; $sub = 0.0; $vatTot = 0.0;
    foreach ($items as $i => $it) {
        if (!is_array($it)) throw new \InvalidArgumentException('Each item must be an object.');
        $name = trim((string)($it['title'] ?? $it['name'] ?? ''));
        if ($name === '') throw new \InvalidArgumentException('Item ' . ($i + 1) . ": 'title' is required.");
        $qty = mcp_number(['v' => $it['quantity'] ?? 1], 'v', true, 0.0001, 1000000);
        $price = mcp_number(['v' => $it['unit_price'] ?? null], 'v', true, 0, 100000000);
        $vat = mcp_number(['v' => $it['vat_rate'] ?? $defaultVat], 'v', true, 0, 100);
        $disc = mcp_number(['v' => $it['discount_pct'] ?? 0], 'v', true, 0, 100);
        $net = round($qty * $price * (1 - $disc / 100), 2);
        $lines[] = [
            'name' => $name,
            'description' => isset($it['description']) && trim((string)$it['description']) !== '' ? trim((string)$it['description']) : null,
            'unit' => isset($it['unit']) && trim((string)$it['unit']) !== '' ? mb_substr(trim((string)$it['unit']), 0, 20) : 'ks',
            'sku' => isset($it['sku']) && trim((string)$it['sku']) !== '' ? mb_substr(trim((string)$it['sku']), 0, 100) : null,
            'warehouse_item_id' => !empty($it['warehouse_item_id']) ? (string)$it['warehouse_item_id'] : null,
            'qty' => $qty, 'price' => $price, 'vat' => $vat, 'disc' => $disc, 'net' => $net,
        ];
        $sub += $net;
        $vatTot += $net * ($vat / 100);
    }
    $sub = round($sub, 2); $vatTot = round($vatTot, 2);
    return ['lines' => $lines, 'subtotal' => $sub, 'vat_amount' => $vatTot, 'total_price' => round($sub + $vatTot, 2)];
}

function mcp_comm_update_price_offer(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM invoices_offers WHERE id = ? LIMIT 1");
    $st->execute([$id]);
    $doc = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$doc || $doc['type'] !== 'price_offer') throw new \InvalidArgumentException("Price offer not found: {$id}");
    $group = ccrm_offer_status_group((string)$doc['status'], $pdo);
    if (!in_array($group, ['draft', 'open'], true)) {
        throw new \InvalidArgumentException("Price offer '{$doc['status']}' cannot be edited through MCP.");
    }

    $sets = []; $params = [];
    foreach (['title', 'subject', 'greeting_note', 'intro_note', 'closing_note'] as $f) {
        if (array_key_exists($f, $args)) { $sets[] = "`$f` = ?"; $params[] = $args[$f]; }
    }
    if (array_key_exists('issued_at', $args)) { $sets[] = '`issued_at` = ?'; $params[] = mcp_require_date($args, 'issued_at'); }
    if (array_key_exists('valid_until', $args)) { $sets[] = '`valid_until` = ?'; $params[] = mcp_require_date($args, 'valid_until'); }
    if (array_key_exists('category_id', $args)) {
        $cid = trim((string)$args['category_id']);
        if ($cid !== '') mcp_row_exists($pdo, 'offer_categories', $cid, 'Offer category');
        $sets[] = '`category_id` = ?'; $params[] = $cid === '' ? null : $cid;
    }
    if (!empty($args['client_id'])) {
        $clStmt = $pdo->prepare("SELECT id, name, email, phone, street, city, postal_code, country, company_id, tax_id, vat_id FROM leads WHERE id = ?");
        $clStmt->execute([(string)$args['client_id']]);
        $cl = $clStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$cl) throw new \InvalidArgumentException("Client not found: {$args['client_id']}");
        $sets = array_merge($sets, ['`lead_id` = ?', '`client_id` = ?', '`client_name` = ?', '`client_email` = ?', '`client_phone` = ?', '`client_street` = ?', '`client_city` = ?', '`client_postal_code` = ?', '`client_country` = ?', '`client_ico` = ?', '`client_dic` = ?', '`client_icdph` = ?']);
        array_push($params, $cl['id'], $cl['id'], $cl['name'], $cl['email'], $cl['phone'], $cl['street'], $cl['city'], $cl['postal_code'], $cl['country'] ?: 'Slovakia', $cl['company_id'], $cl['tax_id'], $cl['vat_id']);
    }
    $parsed = null;
    if (array_key_exists('items', $args)) {
        if (!is_array($args['items'])) throw new \InvalidArgumentException("'items' must be an array.");
        $parsed = mcp_comm_parse_items($pdo, $args['items']);
        $sets[] = '`subtotal` = ?'; $params[] = $parsed['subtotal'];
        $sets[] = '`vat_amount` = ?'; $params[] = $parsed['vat_amount'];
        $sets[] = '`total_price` = ?'; $params[] = $parsed['total_price'];
    }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];

    mcp_tx($pdo, function () use ($pdo, $sets, $params, $id, $parsed) {
        $params[] = $id;
        $pdo->prepare("UPDATE invoices_offers SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        if ($parsed !== null) {
            require_once __DIR__ . '/offer_document.php';
            ccrm_replace_invoice_offer_items($pdo, $id, $parsed['lines']);
        }
    });
    mcp_audit($pdo, $user, 'price_offer_update', "Updated price offer {$doc['document_number']} ({$id})");
    return ['success' => true, 'id' => $id, 'total_price' => $parsed ? $parsed['total_price'] : (float)$doc['total_price']];
}

function mcp_comm_update_invoice(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM invoices_offers WHERE id = ? LIMIT 1");
    $st->execute([$id]);
    $doc = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$doc || $doc['type'] === 'price_offer') throw new \InvalidArgumentException("Invoice/proforma not found: {$id}");
    $group = ccrm_invoice_status_group((string)$doc['status'], $pdo);
    if (!in_array($group, ['draft', 'open'], true)) {
        throw new \InvalidArgumentException("Document '{$doc['status']}' cannot be updated through MCP.");
    }

    $sets = []; $params = []; $frSets = []; $frParams = [];
    if (array_key_exists('title', $args)) {
        $t = mcp_require_string($args, 'title');
        $sets[] = '`title` = ?'; $params[] = $t;
        $sets[] = '`subject` = ?'; $params[] = $t;
        $frSets[] = '`description` = ?'; $frParams[] = $t;
    }
    if (array_key_exists('issued_at', $args)) {
        $d = mcp_require_date($args, 'issued_at');
        $sets[] = '`issued_at` = ?'; $params[] = $d;
        $frSets[] = '`issue_date` = ?'; $frParams[] = $d;
    }
    if (array_key_exists('due_date', $args)) {
        $d = mcp_require_date($args, 'due_date');
        $sets[] = '`due_date` = ?'; $params[] = $d;
        $frSets[] = '`due_date` = ?'; $frParams[] = $d;
    }
    if (array_key_exists('notes', $args)) { $sets[] = '`closing_note` = ?'; $params[] = $args['notes']; }
    if (array_key_exists('project_id', $args)) {
        $pid = trim((string)$args['project_id']);
        if ($pid !== '') mcp_row_exists($pdo, 'projects', $pid, 'Project');
        $frSets[] = '`project_id` = ?'; $frParams[] = $pid === '' ? null : $pid;
    }
    if (!$sets && !$frSets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];

    mcp_tx($pdo, function () use ($pdo, $id, $sets, $params, $frSets, $frParams) {
        if ($sets) {
            $params[] = $id;
            $pdo->prepare("UPDATE invoices_offers SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        }
        if ($frSets) {
            $frParams[] = 'fr-inv-' . $id;
            $pdo->prepare("UPDATE financial_records SET " . implode(', ', $frSets) . " WHERE id = ? AND amount_real = 0 AND status NOT IN ('paid', 'partially_paid')")
                ->execute($frParams);
        }
    });
    mcp_audit($pdo, $user, 'invoice_update', "Updated document {$doc['document_number']} ({$id})");
    return ['success' => true, 'id' => $id, 'document_number' => $doc['document_number']];
}

function mcp_comm_create_tree_cat(\PDO $pdo, array $user, string $table, string $prefix, string $label, array $args): array {
    $name = mcp_require_string($args, 'name');
    $parentId = !empty($args['parent_id']) ? trim((string)$args['parent_id']) : null;
    $level = 1;
    if ($parentId !== null) {
        $ps = $pdo->prepare("SELECT level FROM `{$table}` WHERE id = ? LIMIT 1");
        $ps->execute([$parentId]);
        $pLvl = $ps->fetchColumn();
        if ($pLvl === false) throw new \InvalidArgumentException("Parent {$label} category not found: {$parentId}");
        $level = min(3, (int)$pLvl + 1);
    }
    $id = mcp_new_id($prefix);
    $pdo->prepare("INSERT INTO `{$table}` (id, name, parent_id, level, sort_order, color) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([$id, $name, $parentId, $level, (int)($args['sort_order'] ?? 0), trim((string)($args['color'] ?? '')) ?: '#4f46e5']);
    mcp_audit($pdo, $user, "{$label}_category_create", "Created {$label} category '$name' ($id)");
    return ['success' => true, 'id' => $id, 'name' => $name, 'level' => $level];
}

function mcp_comm_create_fin_cat(\PDO $pdo, array $user, array $args): array {
    $type = mcp_enum($args, 'type', ['income', 'expense']);
    $name = mcp_require_string($args, 'name');
    $parentId = !empty($args['parent_id']) ? trim((string)$args['parent_id']) : null;
    $level = 1;
    if ($parentId !== null) {
        $ps = $pdo->prepare("SELECT type, level FROM financial_categories WHERE id = ? LIMIT 1");
        $ps->execute([$parentId]);
        $pr = $ps->fetch(\PDO::FETCH_ASSOC);
        if (!$pr) throw new \InvalidArgumentException("Parent financial category not found: {$parentId}");
        if ($pr['type'] !== $type) throw new \InvalidArgumentException("Parent category type ({$pr['type']}) does not match '{$type}'.");
        $level = min(3, (int)$pr['level'] + 1);
    }
    $id = mcp_new_id('fcat_');
    $pdo->prepare("INSERT INTO financial_categories (id, type, name, parent_id, level, sort_order, color) VALUES (?, ?, ?, ?, ?, ?, ?)")
        ->execute([$id, $type, $name, $parentId, $level, (int)($args['sort_order'] ?? 0), trim((string)($args['color'] ?? '')) ?: '#4f46e5']);
    mcp_audit($pdo, $user, 'financial_category_create', "Created financial {$type} category '$name' ($id)");
    return ['success' => true, 'id' => $id, 'type' => $type, 'name' => $name, 'level' => $level];
}

function mcp_comm_update_tree_cat(\PDO $pdo, array $user, string $table, string $label, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, $table, $id, ucfirst($label) . ' category');
    $sets = []; $params = [];
    if (array_key_exists('name', $args)) { $sets[] = 'name = ?'; $params[] = mcp_require_string($args, 'name'); }
    if (array_key_exists('parent_id', $args)) {
        $p = trim((string)$args['parent_id']);
        if ($p === $id) throw new \InvalidArgumentException('A category cannot be its own parent.');
        $lvl = 1;
        if ($p !== '') {
            $ps = $pdo->prepare("SELECT level FROM `{$table}` WHERE id = ? LIMIT 1");
            $ps->execute([$p]);
            $pLvl = $ps->fetchColumn();
            if ($pLvl === false) throw new \InvalidArgumentException("Parent {$label} category not found: {$p}");
            $lvl = min(3, (int)$pLvl + 1);
        }
        $sets[] = 'parent_id = ?'; $params[] = $p === '' ? null : $p;
        $sets[] = 'level = ?'; $params[] = $lvl;
    }
    if (array_key_exists('color', $args)) { $sets[] = 'color = ?'; $params[] = trim((string)$args['color']) ?: '#4f46e5'; }
    if (array_key_exists('sort_order', $args)) { $sets[] = 'sort_order = ?'; $params[] = (int)$args['sort_order']; }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, "{$label}_category_update", "Updated {$label} category {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_record_income(\PDO $pdo, array $user, array $args): array {
    $title = mcp_require_string($args, 'title');
    $amount = mcp_number($args, 'amount', true, 0.01, 1000000000);
    $currency = strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo))));
    $issue = mcp_require_date($args, 'issue_date');
    $due = mcp_optional_date($args, 'due_date') ?? $issue;
    if (($args['status'] ?? '') === 'paid') {
        throw new \InvalidArgumentException("MCP records income movements as 'planned' or 'pending'; cash settlement is done in the app.");
    }
    $status = mcp_enum($args, 'status', ['planned', 'pending'], 'planned');
    $catId = !empty($args['category_id']) ? (string)$args['category_id'] : null;
    if ($catId !== null) {
        $ct = $pdo->prepare("SELECT type FROM financial_categories WHERE id = ?");
        $ct->execute([$catId]);
        $t = $ct->fetchColumn();
        if ($t === false) throw new \InvalidArgumentException("Category not found: {$catId}");
        if ($t !== 'income') throw new \InvalidArgumentException("Category {$catId} is an expense category.");
    }
    $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    $clientId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
    if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client/lead');

    $id = mcp_new_id('fin_');
    $pdo->prepare(
        "INSERT INTO financial_records (id, type, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, payment_method, project_id, client_id, invoice_number, tax_rate, created_by)
         VALUES (?, 'income', 'regular', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, $title, $args['description'] ?? null, $catId, $amount, $currency, $status, $issue, $due,
        $args['payment_method'] ?? 'bank_transfer', $projId, $clientId, $args['invoice_number'] ?? null,
        mcp_number($args, 'tax_rate', false, 0, 100) ?? ccrm_default_vat_rate($pdo), $user['name'],
    ]);
    mcp_audit($pdo, $user, 'income_record', "Recorded {$status} income '{$title}' ({$amount} {$currency})");
    return ['success' => true, 'id' => $id, 'title' => $title, 'amount' => $amount, 'status' => $status];
}

function mcp_comm_update_fin_movement(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM financial_records WHERE id = ? LIMIT 1");
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Financial movement not found: {$id}");
    if ($row['status'] === 'paid' || $row['status'] === 'partially_paid' || (float)$row['amount_real'] > 0) {
        throw new \InvalidArgumentException("Settled movements (paid or with amount_real > 0) cannot be altered through MCP.");
    }
    $sets = []; $params = [];
    if (array_key_exists('title', $args)) { $sets[] = 'title = ?'; $params[] = mcp_require_string($args, 'title'); }
    if (array_key_exists('description', $args)) { $sets[] = 'description = ?'; $params[] = $args['description']; }
    if (array_key_exists('amount_planned', $args)) { $sets[] = 'amount_planned = ?'; $params[] = mcp_number($args, 'amount_planned', true, 0.01, 1000000000); }
    if (array_key_exists('currency', $args)) { $sets[] = 'currency = ?'; $params[] = strtoupper(mcp_require_string($args, 'currency')); }
    if (array_key_exists('status', $args)) {
        $sets[] = 'status = ?'; $params[] = mcp_enum($args, 'status', ['planned', 'pending', 'cancelled']);
    }
    if (array_key_exists('issue_date', $args)) { $sets[] = 'issue_date = ?'; $params[] = mcp_require_date($args, 'issue_date'); }
    if (array_key_exists('due_date', $args)) {
        $d = trim((string)$args['due_date']);
        $sets[] = 'due_date = ?'; $params[] = $d === '' ? null : mcp_require_date($args, 'due_date');
    }
    foreach (['category_id' => 'financial_categories', 'project_id' => 'projects', 'client_id' => 'leads'] as $fk => $tbl) {
        if (array_key_exists($fk, $args)) {
            $v = trim((string)$args[$fk]);
            if ($v !== '') mcp_row_exists($pdo, $tbl, $v, $fk);
            $sets[] = "`$fk` = ?"; $params[] = $v === '' ? null : $v;
        }
    }
    if (array_key_exists('payment_method', $args)) { $sets[] = 'payment_method = ?'; $params[] = $args['payment_method']; }
    if (array_key_exists('invoice_number', $args)) { $sets[] = 'invoice_number = ?'; $params[] = $args['invoice_number']; }
    if (array_key_exists('tax_rate', $args)) { $sets[] = 'tax_rate = ?'; $params[] = mcp_number($args, 'tax_rate', true, 0, 100); }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE financial_records SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'financial_movement_update', "Updated financial movement {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_create_recurring(\PDO $pdo, array $user, array $args): array {
    $type = mcp_enum($args, 'type', ['income', 'expense']);
    $title = mcp_require_string($args, 'title');
    $amount = mcp_number($args, 'amount_planned', true, 0.01, 1000000000);
    $freq = mcp_enum($args, 'frequency', ['weekly', 'monthly', 'yearly']);
    $start = mcp_require_date($args, 'start_date');
    $end = mcp_optional_date($args, 'end_date');
    $catId = !empty($args['category_id']) ? (string)$args['category_id'] : null;
    if ($catId !== null) mcp_row_exists($pdo, 'financial_categories', $catId, 'Category');
    $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    $clientId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
    if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client');
    $cfg = ['interval' => 1];
    if ($freq === 'monthly') $cfg['dayOfMonth'] = (int)($args['day_of_month'] ?? (int)substr($start, 8, 2));
    if ($freq === 'weekly') $cfg['dayOfWeek'] = (int)($args['day_of_week'] ?? (int)gmdate('w', strtotime($start)));

    $id = mcp_new_id('frec_');
    $pdo->prepare(
        "INSERT INTO financial_records (id, type, subtype, title, description, category_id, amount_planned, amount_real, currency, status, issue_date, due_date, payment_method, is_recurring, recurring_frequency, recurring_config_json, recurring_start_date, recurring_end_date, recurring_planned_end_date, project_id, client_id, tax_rate, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'planned', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, $type, $type === 'income' ? 'regular' : 'expense', $title, $args['description'] ?? null, $catId, $amount,
        strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo)))), $start, $start, $args['payment_method'] ?? 'bank_transfer',
        $freq, json_encode($cfg, JSON_UNESCAPED_UNICODE), $start, $end, $end, $projId, $clientId,
        mcp_number($args, 'tax_rate', false, 0, 100) ?? ccrm_default_vat_rate($pdo), $user['name'],
    ]);
    mcp_audit($pdo, $user, 'recurring_movement_create', "Created recurring {$type} '{$title}' ({$freq})");
    return ['success' => true, 'id' => $id, 'type' => $type, 'frequency' => $freq, 'start_date' => $start];
}

function mcp_comm_update_recurring(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM financial_records WHERE id = ? AND is_recurring = 1 LIMIT 1");
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Recurring movement rule not found: {$id}");

    $sets = []; $params = [];
    if (array_key_exists('title', $args)) { $sets[] = 'title = ?'; $params[] = mcp_require_string($args, 'title'); }
    if (array_key_exists('description', $args)) { $sets[] = 'description = ?'; $params[] = $args['description']; }
    if (array_key_exists('amount_planned', $args)) { $sets[] = 'amount_planned = ?'; $params[] = mcp_number($args, 'amount_planned', true, 0.01, 1000000000); }
    if (array_key_exists('currency', $args)) { $sets[] = 'currency = ?'; $params[] = strtoupper(mcp_require_string($args, 'currency')); }
    if (array_key_exists('frequency', $args)) { $sets[] = 'recurring_frequency = ?'; $params[] = mcp_enum($args, 'frequency', ['weekly', 'monthly', 'yearly']); }
    if (array_key_exists('start_date', $args)) { $sets[] = 'recurring_start_date = ?'; $params[] = mcp_require_date($args, 'start_date'); }
    if (array_key_exists('end_date', $args)) {
        $ed = trim((string)$args['end_date']) === '' ? null : mcp_require_date($args, 'end_date');
        $sets[] = 'recurring_end_date = ?'; $params[] = $ed;
        $sets[] = 'recurring_planned_end_date = ?'; $params[] = $ed;
    }
    if (array_key_exists('paused', $args)) {
        if (!empty($args['paused'])) {
            $sets[] = 'recurring_planned_end_date = COALESCE(recurring_planned_end_date, recurring_end_date)';
            $sets[] = 'recurring_end_date = ?'; $params[] = mcp_today();
        } else {
            $sets[] = 'recurring_end_date = recurring_planned_end_date';
            $sets[] = 'recurring_planned_end_date = NULL';
        }
    }
    if (array_key_exists('status', $args)) { $sets[] = 'status = ?'; $params[] = mcp_enum($args, 'status', ['planned', 'pending', 'cancelled']); }
    foreach (['category_id' => 'financial_categories', 'project_id' => 'projects', 'client_id' => 'leads'] as $fk => $tbl) {
        if (array_key_exists($fk, $args)) {
            $v = trim((string)$args[$fk]);
            if ($v !== '') mcp_row_exists($pdo, $tbl, $v, $fk);
            $sets[] = "`$fk` = ?"; $params[] = $v === '' ? null : $v;
        }
    }
    if (array_key_exists('tax_rate', $args)) { $sets[] = 'tax_rate = ?'; $params[] = mcp_number($args, 'tax_rate', true, 0, 100); }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE financial_records SET " . implode(', ', $sets) . " WHERE id = ? AND is_recurring = 1")->execute($params);
    mcp_audit($pdo, $user, 'recurring_movement_update', "Updated recurring rule {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_convert_guest(\PDO $pdo, array $user, array $args): array {
    $orderId = mcp_require_string($args, 'order_id');
    $st = $pdo->prepare("SELECT * FROM orders WHERE id = ? LIMIT 1");
    $st->execute([$orderId]);
    $ord = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$ord) throw new \InvalidArgumentException("Order not found: {$orderId}");
    if (($ord['customer_type'] ?? '') !== 'guest') {
        throw new \InvalidArgumentException("Order {$orderId} is already linked to a CRM client ({$ord['client_id']}).");
    }

    $clientId = 'client-' . bin2hex(random_bytes(8));
    $name = !empty($ord['billing_name']) ? $ord['billing_name'] : (!empty($ord['guest_company']) ? $ord['guest_company'] : (!empty($ord['guest_name']) ? $ord['guest_name'] : 'New Client'));
    $won = mcp_won_lead_state($pdo);
    mcp_tx($pdo, function () use ($pdo, $clientId, $name, $ord, $won, $user, $orderId) {
        $pdo->prepare(
            "INSERT INTO leads (id, name, client_type, contact_person, email, phone, company_id, tax_id, vat_id, street, city, postal_code, country, status, source, owner, created_at)
             VALUES (?, ?, 'business', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_assistant', ?, ?)"
        )->execute([
            $clientId, $name, $ord['guest_name'] ?? null, $ord['guest_email'] ?? null, $ord['guest_phone'] ?? null,
            $ord['billing_ico'] ?: ($ord['guest_ico'] ?? null), $ord['billing_dic'] ?: ($ord['guest_dic'] ?? null), $ord['billing_ic_dph'] ?: ($ord['guest_ic_dph'] ?? null),
            $ord['billing_street'] ?: ($ord['delivery_street'] ?? null), $ord['billing_city'] ?: ($ord['delivery_city'] ?? null),
            $ord['billing_zip'] ?: ($ord['delivery_zip'] ?? null), $ord['billing_country'] ?: ($ord['delivery_country'] ?? 'Slovakia'),
            $won, $user['name'], date('Y-m-d'),
        ]);
        ccrm_set_contact_parts_from_person($pdo, $clientId);
        $pdo->prepare("UPDATE orders SET customer_type = 'client', client_id = ? WHERE id = ?")->execute([$clientId, $orderId]);
    });
    mcp_audit($pdo, $user, 'order_guest_convert', "Converted guest order {$orderId} into client {$clientId}");
    return ['success' => true, 'order_id' => $orderId, 'client_id' => $clientId, 'name' => $name];
}

function mcp_comm_update_item(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'warehouse_items', $id, 'Warehouse item');
    $sets = []; $params = [];
    foreach (['sku', 'barcode', 'name', 'description', 'category', 'unit', 'default_location', 'pack_unit'] as $f) {
        if (array_key_exists($f, $args)) {
            $v = trim((string)$args[$f]);
            if (in_array($f, ['sku', 'name'], true) && $v === '') throw new \InvalidArgumentException("'$f' cannot be empty.");
            $sets[] = "`$f` = ?"; $params[] = $v === '' ? null : $v;
        }
    }
    foreach (['min_stock', 'optimal_stock', 'default_sell_price', 'vat_rate', 'pack_quantity', 'weight_kg'] as $nf) {
        if (array_key_exists($nf, $args)) {
            $sets[] = "`$nf` = ?";
            $params[] = ($args[$nf] === null || $args[$nf] === '') ? null : mcp_number($args, $nf, true, 0, $nf === 'vat_rate' ? 100 : 100000000);
        }
    }
    if (array_key_exists('has_expiration', $args)) { $sets[] = 'has_expiration = ?'; $params[] = !empty($args['has_expiration']) ? 1 : 0; }
    if (array_key_exists('alt_codes', $args) && is_array($args['alt_codes'])) {
        $codes = array_values(array_unique(array_filter(array_map(fn($c) => trim((string)$c), $args['alt_codes']))));
        $sets[] = 'alt_codes_json = ?'; $params[] = json_encode($codes, JSON_UNESCAPED_UNICODE);
    }
    $hasPrices = !empty($args['price_levels']) && is_array($args['price_levels']);
    if (!$sets && !$hasPrices) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];

    mcp_tx($pdo, function () use ($pdo, $id, $sets, $params, $hasPrices, $args) {
        if ($sets) {
            $params[] = $id;
            $pdo->prepare("UPDATE warehouse_items SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        }
        if ($hasPrices) {
            $ins = $pdo->prepare("INSERT INTO warehouse_item_prices (item_id, price_level_id, price) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price)");
            foreach ($args['price_levels'] as $lvlId => $p) {
                $lvlId = trim((string)$lvlId);
                if ($lvlId === '' || !is_numeric($p)) continue;
                $ins->execute([$id, $lvlId, round(max(0, (float)$p), 4)]);
            }
        }
    });
    mcp_audit($pdo, $user, 'inventory_item_update', "Updated inventory item {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_get_supplier(\PDO $pdo, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM suppliers WHERE id = ? LIMIT 1");
    $st->execute([$id]);
    $row = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Supplier not found: {$id}");
    $row['contacts'] = json_decode((string)($row['contacts_json'] ?? '[]'), true) ?: [];
    unset($row['contacts_json']);
    return $row;
}

function mcp_comm_create_supplier(\PDO $pdo, array $user, array $args): array {
    $name = mcp_require_string($args, 'name');
    $id = mcp_new_id('sup-');
    $pdo->prepare(
        "INSERT INTO suppliers (id, name, company_id, tax_id, vat_id, street, city, postal_code, country, email, phone, website, iban, swift, payment_due_days, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, $name, $args['company_id'] ?? null, $args['tax_id'] ?? null, $args['vat_id'] ?? null,
        $args['street'] ?? null, $args['city'] ?? null, $args['postal_code'] ?? null, $args['country'] ?? 'Slovakia',
        $args['email'] ?? null, $args['phone'] ?? null, $args['website'] ?? null, $args['iban'] ?? null, $args['swift'] ?? null,
        (int)($args['payment_due_days'] ?? 14), $args['notes'] ?? null,
    ]);
    mcp_audit($pdo, $user, 'supplier_create', "Created supplier '{$name}' ({$id})");
    return ['success' => true, 'id' => $id, 'name' => $name];
}

function mcp_comm_update_supplier(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'suppliers', $id, 'Supplier');
    $sets = []; $params = [];
    foreach (['name', 'company_id', 'tax_id', 'vat_id', 'street', 'city', 'postal_code', 'country', 'email', 'phone', 'website', 'iban', 'swift', 'notes'] as $f) {
        if (array_key_exists($f, $args)) {
            $v = trim((string)$args[$f]);
            if ($f === 'name' && $v === '') throw new \InvalidArgumentException("'name' cannot be empty.");
            $sets[] = "`$f` = ?"; $params[] = $v === '' ? null : $v;
        }
    }
    if (array_key_exists('payment_due_days', $args)) {
        $sets[] = 'payment_due_days = ?'; $params[] = max(0, (int)$args['payment_due_days']);
    }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE suppliers SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'supplier_update', "Updated supplier {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_get_movement(\PDO $pdo, array $args): array {
    $id = mcp_require_string($args, 'id');
    $st = $pdo->prepare("SELECT * FROM warehouse_movements WHERE id = ? OR UPPER(document_number) = UPPER(?) LIMIT 1");
    $st->execute([$id, $id]);
    $mv = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$mv) throw new \InvalidArgumentException("Stock movement not found: {$id}");
    $it = $pdo->prepare(
        "SELECT mi.*, wi.sku, wi.name AS item_name, wi.unit
         FROM warehouse_movement_items mi LEFT JOIN warehouse_items wi ON wi.id = mi.item_id
         WHERE mi.movement_id = ?"
    );
    $it->execute([$mv['id']]);
    $mv['items'] = $it->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    return $mv;
}

function mcp_comm_record_transfer(\PDO $pdo, array $user, array $args): array {
    $fromWh = mcp_require_string($args, 'from_warehouse_id');
    $toWh = mcp_require_string($args, 'to_warehouse_id');
    if ($fromWh === $toWh) throw new \InvalidArgumentException('Source and target warehouses must differ.');
    mcp_row_exists($pdo, 'warehouses', $fromWh, 'Source warehouse');
    mcp_row_exists($pdo, 'warehouses', $toWh, 'Target warehouse');
    $items = $args['items'] ?? null;
    if (!is_array($items) || !$items) throw new \InvalidArgumentException("'items' must contain at least one item.");

    $res = mcp_with_lock($pdo, 'ccrm_warehouse_number', function () use ($pdo, $user, $fromWh, $toWh, $items, $args) {
        return mcp_tx($pdo, function () use ($pdo, $user, $fromWh, $toWh, $items, $args) {
            $docNum = mcp_next_document_number($pdo, 'warehouse_movements', 'document_number', 'PRE', (int)date('Y'), 4);
            $movId = mcp_new_id('mov-');
            $totalCost = 0.0;
            $lines = [];
            $stkSel = $pdo->prepare("SELECT quantity, reserved_quantity FROM warehouse_stock WHERE warehouse_id = ? AND item_id = ? FOR UPDATE");
            $itemSel = $pdo->prepare("SELECT id, name, avg_purchase_price, default_sell_price, default_location FROM warehouse_items WHERE id = ?");
            $updStk = $pdo->prepare("INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, location) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)");

            foreach ($items as $it) {
                $iid = mcp_require_string($it, 'item_id');
                $qty = mcp_number(['v' => $it['quantity'] ?? null], 'v', true, 0.0001, 1000000);
                $itemSel->execute([$iid]);
                $item = $itemSel->fetch(\PDO::FETCH_ASSOC);
                if (!$item) throw new \InvalidArgumentException("Warehouse item not found: {$iid}");
                $stkSel->execute([$fromWh, $iid]);
                $sRow = $stkSel->fetch(\PDO::FETCH_ASSOC) ?: ['quantity' => 0, 'reserved_quantity' => 0];
                $avail = (float)$sRow['quantity'] - (float)$sRow['reserved_quantity'];
                if ($qty > $avail + 1e-9) {
                    throw new \InvalidArgumentException("Insufficient available stock for '{$item['name']}' in source warehouse ({$avail} < {$qty}).");
                }
                $updStk->execute([$fromWh, $iid, -$qty, $item['default_location']]);
                $updStk->execute([$toWh, $iid, $qty, $item['default_location']]);
                $cost = round($qty * (float)$item['avg_purchase_price'], 2);
                $totalCost += $cost;
                $lines[] = ['item_id' => $iid, 'qty' => $qty, 'avg' => (float)$item['avg_purchase_price'], 'sell' => (float)$item['default_sell_price'], 'cost' => $cost, 'note' => $it['note'] ?? null];
            }
            $pdo->prepare(
                "INSERT INTO warehouse_movements (id, document_number, type, status, warehouse_id, target_warehouse_id, total_cost_value, total_sell_value, total_profit_value, created_by, note, issued_at)
                 VALUES (?, ?, 'transfer', 'confirmed', ?, ?, ?, 0, 0, ?, ?, ?)"
            )->execute([$movId, $docNum, $fromWh, $toWh, round($totalCost, 2), $user['email'], $args['note'] ?? null, mcp_now_local()]);
            $insLine = $pdo->prepare("INSERT INTO warehouse_movement_items (id, movement_id, item_id, quantity, unit_purchase_price, unit_sell_price, total_price, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($lines as $l) {
                $insLine->execute([mcp_new_id('mvi-'), $movId, $l['item_id'], $l['qty'], $l['avg'], $l['sell'], $l['cost'], $l['note']]);
            }
            return ['id' => $movId, 'document_number' => $docNum, 'item_count' => count($lines)];
        });
    });
    mcp_audit($pdo, $user, 'stock_transfer', "Transferred " . count($items) . " item(s) {$fromWh} -> {$toWh} ({$res['document_number']})");
    return ['success' => true] + $res;
}

function mcp_comm_create_warehouse(\PDO $pdo, array $user, array $args): array {
    $name = mcp_require_string($args, 'name');
    $code = strtoupper(mcp_require_string($args, 'code'));
    $dup = $pdo->prepare("SELECT id FROM warehouses WHERE UPPER(code) = UPPER(?) LIMIT 1");
    $dup->execute([$code]);
    if ($dup->fetchColumn()) throw new \InvalidArgumentException("Warehouse code '{$code}' already exists.");
    $id = mcp_new_id('wh-');
    $isDef = !empty($args['is_default']) ? 1 : 0;
    mcp_tx($pdo, function () use ($pdo, $id, $name, $code, $args, $isDef) {
        if ($isDef) $pdo->exec("UPDATE warehouses SET is_default = 0 WHERE is_default = 1");
        $pdo->prepare("INSERT INTO warehouses (id, name, code, address, is_default) VALUES (?, ?, ?, ?, ?)")
            ->execute([$id, $name, $code, $args['address'] ?? null, $isDef]);
    });
    mcp_audit($pdo, $user, 'warehouse_create', "Created warehouse '{$name}' ({$code})");
    return ['success' => true, 'id' => $id, 'name' => $name, 'code' => $code];
}

function mcp_comm_update_warehouse(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'warehouses', $id, 'Warehouse');
    $sets = []; $params = [];
    if (array_key_exists('name', $args)) { $sets[] = 'name = ?'; $params[] = mcp_require_string($args, 'name'); }
    if (array_key_exists('code', $args)) { $sets[] = 'code = ?'; $params[] = strtoupper(mcp_require_string($args, 'code')); }
    if (array_key_exists('address', $args)) { $sets[] = 'address = ?'; $params[] = $args['address']; }
    $isDef = array_key_exists('is_default', $args) ? (!empty($args['is_default']) ? 1 : 0) : null;
    if ($isDef !== null) { $sets[] = 'is_default = ?'; $params[] = $isDef; }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    mcp_tx($pdo, function () use ($pdo, $id, $sets, $params, $isDef) {
        if ($isDef === 1) $pdo->exec("UPDATE warehouses SET is_default = 0 WHERE is_default = 1");
        $params[] = $id;
        $pdo->prepare("UPDATE warehouses SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    });
    mcp_audit($pdo, $user, 'warehouse_update', "Updated warehouse {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_create_contract(\PDO $pdo, array $user, array $args): array {
    $cid = !empty($args['client_id']) ? (string)$args['client_id'] : null;
    $pid = !empty($args['project_id']) ? (string)$args['project_id'] : null;
    if ($cid !== null) mcp_row_exists($pdo, 'leads', $cid, 'Client');
    if ($pid !== null) mcp_row_exists($pdo, 'projects', $pid, 'Project');
    $id = mcp_new_id('sc_');
    $pdo->prepare(
        "INSERT INTO support_contracts (id, client_id, project_id, tier, monthly_hours, hourly_rate, sla_response_critical_hours, sla_response_high_hours, sla_response_normal_hours, sla_response_low_hours, sla_resolve_critical_hours, sla_resolve_high_hours, sla_resolve_normal_hours, sla_resolve_low_hours, valid_from, valid_until, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $id, $cid, $pid, mcp_enum($args, 'tier', ['basic', 'pro', 'enterprise', 'project_only'], 'basic'),
        (float)($args['monthly_hours'] ?? 0), (float)($args['hourly_rate'] ?? 0),
        (float)($args['sla_response_critical_hours'] ?? 1), (float)($args['sla_response_high_hours'] ?? 4),
        (float)($args['sla_response_normal_hours'] ?? 8), (float)($args['sla_response_low_hours'] ?? 24),
        (float)($args['sla_resolve_critical_hours'] ?? 4), (float)($args['sla_resolve_high_hours'] ?? 16),
        (float)($args['sla_resolve_normal_hours'] ?? 40), (float)($args['sla_resolve_low_hours'] ?? 120),
        mcp_optional_date($args, 'valid_from'), mcp_optional_date($args, 'valid_until'), $args['notes'] ?? null,
    ]);
    mcp_audit($pdo, $user, 'support_contract_create', "Created support contract {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_update_contract(\PDO $pdo, array $user, array $args): array {
    $id = mcp_require_string($args, 'id');
    mcp_row_exists($pdo, 'support_contracts', $id, 'Support contract');
    $sets = []; $params = [];
    if (array_key_exists('tier', $args)) { $sets[] = 'tier = ?'; $params[] = mcp_enum($args, 'tier', ['basic', 'pro', 'enterprise', 'project_only']); }
    foreach (['monthly_hours', 'hourly_rate', 'sla_response_critical_hours', 'sla_response_high_hours', 'sla_response_normal_hours', 'sla_response_low_hours', 'sla_resolve_critical_hours', 'sla_resolve_high_hours', 'sla_resolve_normal_hours', 'sla_resolve_low_hours'] as $nf) {
        if (array_key_exists($nf, $args)) { $sets[] = "`$nf` = ?"; $params[] = mcp_number($args, $nf, true, 0); }
    }
    foreach (['valid_from', 'valid_until'] as $df) {
        if (array_key_exists($df, $args)) { $sets[] = "`$df` = ?"; $params[] = trim((string)$args[$df]) === '' ? null : mcp_require_date($args, $df); }
    }
    if (array_key_exists('notes', $args)) { $sets[] = 'notes = ?'; $params[] = $args['notes']; }
    if (!$sets) return ['success' => true, 'id' => $id, 'message' => 'No fields updated'];
    $params[] = $id;
    $pdo->prepare("UPDATE support_contracts SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
    mcp_audit($pdo, $user, 'support_contract_update', "Updated support contract {$id}");
    return ['success' => true, 'id' => $id];
}

function mcp_comm_set_ticket_task_links(\PDO $pdo, array $user, array $args): array {
    $ticketId = mcp_require_string($args, 'ticket_id');
    $ts = $pdo->prepare("SELECT id, ticket_number FROM tickets WHERE id = ? OR UPPER(ticket_number) = UPPER(?) LIMIT 1");
    $ts->execute([$ticketId, $ticketId]);
    $tck = $ts->fetch(\PDO::FETCH_ASSOC);
    if (!$tck) throw new \InvalidArgumentException("Ticket not found: {$ticketId}");
    $taskIds = $args['task_ids'] ?? null;
    if (!is_array($taskIds) || !$taskIds) throw new \InvalidArgumentException("'task_ids' must be a non-empty array.");
    $mode = mcp_enum($args, 'sync_mode', ['auto_resolve', 'manual'], 'auto_resolve');
    $chkTask = $pdo->prepare("SELECT id FROM tasks WHERE id = ? AND " . ccrm_sql_real_tasks() . " LIMIT 1");
    $ins = $pdo->prepare("INSERT INTO ticket_task_links (ticket_id, task_id, sync_mode) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sync_mode = VALUES(sync_mode)");
    $linked = [];
    foreach ($taskIds as $tid) {
        $tid = trim((string)$tid);
        if ($tid === '') continue;
        $chkTask->execute([$tid]);
        if (!$chkTask->fetchColumn()) throw new \InvalidArgumentException("Task not found: {$tid}");
        $ins->execute([$tck['id'], $tid, $mode]);
        $linked[] = $tid;
    }
    mcp_audit($pdo, $user, 'ticket_task_link', "Linked " . count($linked) . " task(s) to ticket {$tck['ticket_number']}");
    return ['success' => true, 'ticket_id' => $tck['id'], 'linked_task_ids' => $linked, 'sync_mode' => $mode];
}

function mcp_comm_ue_row(\PDO $pdo, array $user, array $args, bool $isUpdate): array {
    $regId = mcp_require_string($args, 'registry_id');
    $st = $pdo->prepare("SELECT id, name FROM unified_entries WHERE id = ? LIMIT 1");
    $st->execute([$regId]);
    $reg = $st->fetch(\PDO::FETCH_ASSOC);
    if (!$reg) throw new \InvalidArgumentException("Custom registry not found: {$regId}");
    $table = 'ue_' . preg_replace('/[^a-z0-9_]/', '', strtolower($regId));
    if ($pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->rowCount() === 0) {
        throw new \InvalidArgumentException("Backing table {$table} does not exist yet for registry {$regId}.");
    }
    $cols = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(\PDO::FETCH_COLUMN);
    $map = [
        'parent_id' => ['col' => 'parent_id', 'empty_null' => true],
        'icon' => ['col' => 'icon', 'empty_null' => true],
        'title' => ['col' => 'title', 'required_on_create' => true],
        'due_date' => ['col' => 'due_date', 'date' => true],
        'warning_days' => ['col' => 'warning_days', 'int' => true],
        'client_id' => ['col' => 'client_id', 'empty_null' => true],
        'lead_id' => ['col' => 'lead_id', 'empty_null' => true],
        'number_value' => ['col' => 'number_value', 'float' => true],
        'money_amount' => ['col' => 'money_amount', 'float' => true],
        'money_currency' => ['col' => 'money_currency', 'empty_null' => true],
    ];

    if ($isUpdate) {
        $rowId = mcp_require_string($args, 'row_id');
        $chk = $pdo->prepare("SELECT id FROM `{$table}` WHERE id = ? LIMIT 1");
        $chk->execute([$rowId]);
        if (!$chk->fetchColumn()) throw new \InvalidArgumentException("Row {$rowId} not found in registry {$regId}.");
        $sets = []; $params = [];
        foreach ($map as $arg => $meta) {
            if (!array_key_exists($arg, $args) || !in_array($meta['col'], $cols, true)) continue;
            $val = $args[$arg];
            if (!empty($meta['date'])) $val = trim((string)$val) === '' ? null : mcp_require_date($args, $arg);
            elseif (!empty($meta['int'])) $val = (int)$val;
            elseif (!empty($meta['float'])) $val = ($val === null || $val === '') ? null : (float)$val;
            elseif (!empty($meta['empty_null']) && trim((string)$val) === '') $val = null;
            $sets[] = "`{$meta['col']}` = ?"; $params[] = $val;
        }
        if (!$sets) return ['success' => true, 'registry_id' => $regId, 'id' => $rowId, 'message' => 'No fields updated'];
        $params[] = $rowId;
        $pdo->prepare("UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
        mcp_audit($pdo, $user, 'unified_entry_row_update', "Updated row {$rowId} in {$regId}");
        return ['success' => true, 'registry_id' => $regId, 'id' => $rowId];
    }

    $rowId = mcp_new_id('uer_');
    $fields = ['`id`']; $vals = [$rowId];
    if (in_array('is_folder', $cols, true)) { $fields[] = '`is_folder`'; $vals[] = !empty($args['is_folder']) ? 1 : 0; }
    foreach ($map as $arg => $meta) {
        if (!in_array($meta['col'], $cols, true)) continue;
        if (!array_key_exists($arg, $args)) {
            if (!empty($meta['required_on_create'])) throw new \InvalidArgumentException("'{$arg}' is required.");
            continue;
        }
        $val = $args[$arg];
        if (!empty($meta['date'])) $val = trim((string)$val) === '' ? null : mcp_require_date($args, $arg);
        elseif (!empty($meta['int'])) $val = (int)$val;
        elseif (!empty($meta['float'])) $val = ($val === null || $val === '') ? null : (float)$val;
        elseif (!empty($meta['empty_null']) && trim((string)$val) === '') $val = null;
        $fields[] = "`{$meta['col']}`"; $vals[] = $val;
    }
    $phs = implode(', ', array_fill(0, count($fields), '?'));
    $pdo->prepare("INSERT INTO `{$table}` (" . implode(', ', $fields) . ") VALUES ({$phs})")->execute($vals);
    mcp_audit($pdo, $user, 'unified_entry_row_create', "Created row {$rowId} in {$regId}");
    return ['success' => true, 'registry_id' => $regId, 'id' => $rowId];
}
