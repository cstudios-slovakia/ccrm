<?php
/**
 * CCRM MCP Server Extensions — Modules (Part B4)
 *
 * Read & write tools for the modules not covered by core/ext/ops/intel:
 *   - Time tracking (list/running/summary, start/stop/log/update)
 *   - Support tickets & contracts (list/get/create/update/reply)
 *   - Orders (list/get/create/update)
 *   - Weekly plan board (get week, create/update cards, set day note)
 *   - Price offers & recurring task templates
 *
 * Non-destructive: no tool deletes rows. Included by mcp.php.
 */

require_once __DIR__ . '/recurring_tasks.php';
require_once __DIR__ . '/time_entries_lib.php';
require_once __DIR__ . '/time_settle.php';
require_once __DIR__ . '/time_locks.php';
require_once __DIR__ . '/tickets.php';

/**
 * Permissions for the module tools, merged into mcp_tool_permissions().
 */
function mcp_ext_modules_permissions(): array {
    return [
        // Time tracking
        'list_time_entries'        => ['view' => ['time_tracking']],
        'get_running_timer'        => ['view' => ['time_tracking']],
        'get_time_tracking_summary'=> ['view' => ['time_tracking']],
        'log_time_entry'           => ['edit' => ['time_tracking']],
        'start_timer'              => ['edit' => ['time_tracking']],
        'stop_timer'               => ['edit' => ['time_tracking']],
        'update_time_entry'        => ['edit' => ['time_tracking']],
        // Support tickets & contracts
        'list_tickets'             => ['view' => ['tickets']],
        'get_ticket'               => ['view' => ['tickets']],
        'create_ticket'            => ['edit' => ['tickets']],
        'update_ticket'            => ['edit' => ['tickets']],
        'add_ticket_message'       => ['edit' => ['tickets']],
        'list_support_contracts'   => ['view' => ['tickets']],
        // Orders
        'list_orders'              => ['view' => ['orders']],
        'get_order'                => ['view' => ['orders']],
        'create_order'             => ['edit' => ['orders']],
        'update_order'             => ['edit' => ['orders']],
        // Weekly plan
        'get_weekly_plan'          => ['view' => ['tasks.weekly_plan']],
        'create_weekly_plan_card'  => ['edit' => ['tasks.weekly_plan']],
        'update_weekly_plan_card'  => ['edit' => ['tasks.weekly_plan']],
        'set_weekly_plan_day_note' => ['edit' => ['tasks.weekly_plan']],
        // Price offers & recurring tasks
        'create_price_offer'       => ['edit' => ['invoices']],
        'list_recurring_tasks'     => ['view' => ['tasks']],
        'create_recurring_task'    => ['edit' => ['tasks']],
    ];
}

/**
 * Tool definitions for the module tools, merged into mcp_get_tool_definitions().
 * Each block keeps `'name'` on the line directly above `'description'` so the
 * probe harness discovers every tool cleanly.
 */
function mcp_get_module_tool_definitions(): array {
    return [
        // --- Time Tracking ---
        [
            'name' => 'list_time_entries',
            'description' => 'List tracked time entries. Without time_tracking_team permission, only the active user\'s own entries are returned. Supports date range, user, project, task, ticket, and billable filters.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'from' => ['type' => 'string', 'description' => 'Start entry date YYYY-MM-DD'],
                    'to' => ['type' => 'string', 'description' => 'End entry date YYYY-MM-DD'],
                    'user_id' => ['type' => 'string', 'description' => 'Filter by user ID (requires time_tracking_team unless own ID)'],
                    'project_id' => ['type' => 'string', 'description' => 'Filter by project ID'],
                    'task_id' => ['type' => 'string', 'description' => 'Filter by task ID'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Filter by ticket ID'],
                    'billable' => ['type' => 'boolean', 'description' => 'Filter by billable status'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 200)'],
                ],
            ],
        ],
        [
            'name' => 'get_running_timer',
            'description' => 'Get the active user\'s currently running time tracker timer, if any (returns null when stopped).',
            'inputSchema' => ['type' => 'object', 'properties' => new \stdClass()],
        ],
        [
            'name' => 'get_time_tracking_summary',
            'description' => 'Aggregate tracked hours and billable totals over a date range, grouped by project or user (respects time_tracking_team and time_tracking_costs permissions).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'from' => ['type' => 'string', 'description' => 'Start date YYYY-MM-DD (default: 30 days ago)'],
                    'to' => ['type' => 'string', 'description' => 'End date YYYY-MM-DD (default: today)'],
                    'group_by' => ['type' => 'string', 'description' => 'Grouping: project or user (default: project)'],
                    'project_id' => ['type' => 'string', 'description' => 'Optional project ID filter'],
                    'user_id' => ['type' => 'string', 'description' => 'Optional user ID filter (requires time_tracking_team unless own ID)'],
                ],
            ],
        ],
        [
            'name' => 'log_time_entry',
            'description' => 'Log a completed manual time entry with duration or start/end timestamps, optional project/task/ticket links, description, and billable flag.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'entry_date' => ['type' => 'string', 'description' => 'Entry date YYYY-MM-DD (default: today)'],
                    'duration_minutes' => ['type' => 'number', 'description' => 'Duration in minutes (1 to 1440)'],
                    'duration_seconds' => ['type' => 'integer', 'description' => 'Alternative exact duration in seconds (1 to 86400)'],
                    'start_at' => ['type' => 'string', 'description' => 'Optional ISO start timestamp'],
                    'end_at' => ['type' => 'string', 'description' => 'Optional ISO end timestamp'],
                    'description' => ['type' => 'string', 'description' => 'What was worked on'],
                    'task_id' => ['type' => 'string', 'description' => 'Linked task ID'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Linked support ticket ID'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID'],
                    'billable' => ['type' => 'boolean', 'description' => 'Whether hours are billable (default from workspace settings)'],
                    'note' => ['type' => 'string', 'description' => 'Optional internal note'],
                ],
            ],
        ],
        [
            'name' => 'start_timer',
            'description' => 'Start a live running timer for the active user. If a timer is already running, it is stopped and priced first.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'description' => ['type' => 'string', 'description' => 'Work description'],
                    'task_id' => ['type' => 'string', 'description' => 'Linked task ID'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Linked ticket ID'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID'],
                    'billable' => ['type' => 'boolean', 'description' => 'Billable flag (default from workspace settings)'],
                    'note' => ['type' => 'string', 'description' => 'Optional note'],
                ],
            ],
        ],
        [
            'name' => 'stop_timer',
            'description' => 'Stop the active user\'s currently running timer, compute elapsed duration and rates, and save the completed entry.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'description' => ['type' => 'string', 'description' => 'Optional final description override'],
                    'note' => ['type' => 'string', 'description' => 'Optional final note'],
                    'project_id' => ['type' => 'string', 'description' => 'Optional project ID if required by workspace settings'],
                    'task_id' => ['type' => 'string', 'description' => 'Optional task ID if required by workspace settings'],
                ],
            ],
        ],
        [
            'name' => 'update_time_entry',
            'description' => 'Update an existing time entry (own entries, or any team entry with time_tracking_team). Locked/approved/paid entries cannot be edited by non-admins.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Time entry ID'],
                    'entry_date' => ['type' => 'string', 'description' => 'Updated date YYYY-MM-DD'],
                    'duration_minutes' => ['type' => 'number', 'description' => 'Updated duration in minutes (1 to 1440)'],
                    'duration_seconds' => ['type' => 'integer', 'description' => 'Updated exact duration in seconds'],
                    'description' => ['type' => 'string', 'description' => 'Updated description'],
                    'task_id' => ['type' => 'string', 'description' => 'Updated task ID (empty string clears link)'],
                    'ticket_id' => ['type' => 'string', 'description' => 'Updated ticket ID (empty string clears link)'],
                    'project_id' => ['type' => 'string', 'description' => 'Updated project ID (empty string clears link)'],
                    'billable' => ['type' => 'boolean', 'description' => 'Updated billable flag'],
                    'note' => ['type' => 'string', 'description' => 'Updated note'],
                ],
                'required' => ['id'],
            ],
        ],

        // --- Support Tickets & Contracts ---
        [
            'name' => 'list_tickets',
            'description' => 'List support tickets with filters for status, priority, type, project, client, assignee, or text search.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'status' => ['type' => 'string', 'description' => 'Filter by ticket status key (e.g. new, open, waiting, resolved, closed)'],
                    'priority' => ['type' => 'string', 'description' => 'Filter by priority: low, normal, high, critical'],
                    'type' => ['type' => 'string', 'description' => 'Filter by type: question, bug, feature, incident, support, request'],
                    'project_id' => ['type' => 'string', 'description' => 'Filter by project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'assignee' => ['type' => 'string', 'description' => 'Filter by assigned user name'],
                    'search' => ['type' => 'string', 'description' => 'Search ticket number, title, description, or reporter'],
                    'archived' => ['type' => 'boolean', 'description' => 'Include archived tickets (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 100)'],
                ],
            ],
        ],
        [
            'name' => 'get_ticket',
            'description' => 'Get full support ticket details, SLA deadlines, conversation messages (including internal notes), and tracked time.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Ticket ID or ticket number (e.g. TCK-000001)'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_ticket',
            'description' => 'Create a new support ticket with auto-generated ticket number, SLA calculation from priority/contract, and initial message.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Ticket subject/title'],
                    'description' => ['type' => 'string', 'description' => 'Issue description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, normal, high, critical (default normal)'],
                    'type' => ['type' => 'string', 'description' => 'Type: question, bug, feature, incident, support (default question)'],
                    'status' => ['type' => 'string', 'description' => 'Status key (default new)'],
                    'project_id' => ['type' => 'string', 'description' => 'Linked project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client ID'],
                    'contract_id' => ['type' => 'string', 'description' => 'Optional support contract ID for SLA overrides'],
                    'assignee' => ['type' => 'string', 'description' => 'Assigned team member name'],
                    'reporter_name' => ['type' => 'string', 'description' => 'Reporter contact name'],
                    'reporter_email' => ['type' => 'string', 'description' => 'Reporter email address'],
                    'reporter_phone' => ['type' => 'string', 'description' => 'Reporter phone number'],
                ],
                'required' => ['title'],
            ],
        ],
        [
            'name' => 'update_ticket',
            'description' => 'Update support ticket fields (status, priority, type, assignee, project, client, or archived state) and recalculate SLA if priority/contract changes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Ticket ID'],
                    'title' => ['type' => 'string', 'description' => 'Updated title'],
                    'description' => ['type' => 'string', 'description' => 'Updated description'],
                    'status' => ['type' => 'string', 'description' => 'Updated ticket status key'],
                    'priority' => ['type' => 'string', 'description' => 'Updated priority: low, normal, high, critical'],
                    'type' => ['type' => 'string', 'description' => 'Updated type'],
                    'assignee' => ['type' => 'string', 'description' => 'Updated assignee name (empty string unassigns)'],
                    'project_id' => ['type' => 'string', 'description' => 'Updated project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Updated client ID'],
                    'contract_id' => ['type' => 'string', 'description' => 'Optional support contract ID for SLA recalculation'],
                    'archived' => ['type' => 'boolean', 'description' => 'Archive or unarchive ticket'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'add_ticket_message',
            'description' => 'Add an internal note or agent reply message to a support ticket thread (marks first_responded_at for non-internal replies).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'ticket_id' => ['type' => 'string', 'description' => 'Target ticket ID'],
                    'body' => ['type' => 'string', 'description' => 'Message text'],
                    'is_internal' => ['type' => 'boolean', 'description' => 'True for internal team note, false for client-visible reply (default true)'],
                    'status' => ['type' => 'string', 'description' => 'Optional new ticket status key after posting'],
                ],
                'required' => ['ticket_id', 'body'],
            ],
        ],
        [
            'name' => 'list_support_contracts',
            'description' => 'List support retainer / SLA contracts with monthly included hours, hourly rate, SLA targets, validity dates, and linked project/client.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'tier' => ['type' => 'string', 'description' => 'Filter by tier: basic, pro, enterprise, project_only'],
                    'project_id' => ['type' => 'string', 'description' => 'Filter by project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'active_only' => ['type' => 'boolean', 'description' => 'Only currently valid contracts (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows to return (default 50, max 100)'],
                ],
            ],
        ],

        // --- Orders ---
        [
            'name' => 'list_orders',
            'description' => 'List sales and purchase orders with filters by type, status, payment status, client/supplier, date range, or search.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'description' => 'Order type: sales or purchase'],
                    'status' => ['type' => 'string', 'description' => 'Order status (e.g. new, confirmed, processing, shipped, delivered, cancelled)'],
                    'payment_status' => ['type' => 'string', 'description' => 'Payment status: unpaid, partially_paid, paid, refunded'],
                    'client_id' => ['type' => 'string', 'description' => 'Filter by client ID'],
                    'from' => ['type' => 'string', 'description' => 'Order date from YYYY-MM-DD'],
                    'to' => ['type' => 'string', 'description' => 'Order date to YYYY-MM-DD'],
                    'search' => ['type' => 'string', 'description' => 'Search order number, guest name/company, or notes'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, max 100)'],
                ],
            ],
        ],
        [
            'name' => 'get_order',
            'description' => 'Get full order details including delivery/billing info, totals, linked client/supplier, and line items.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Order ID or order number'],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'create_order',
            'description' => 'Create a new sales or purchase order with optional line items (totals computed automatically from item prices, discounts, and VAT).',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'type' => ['type' => 'string', 'description' => 'Order type: sales or purchase (default sales)'],
                    'order_number' => ['type' => 'string', 'description' => 'Custom order number (auto-generated if omitted)'],
                    'order_date' => ['type' => 'string', 'description' => 'Order date YYYY-MM-DD (default today)'],
                    'client_id' => ['type' => 'string', 'description' => 'Linked client/lead ID'],
                    'supplier_id' => ['type' => 'string', 'description' => 'Linked supplier employee/contractor ID (for purchase orders)'],
                    'guest_name' => ['type' => 'string', 'description' => 'Customer name when not linked to a CRM client'],
                    'guest_email' => ['type' => 'string', 'description' => 'Customer email'],
                    'guest_phone' => ['type' => 'string', 'description' => 'Customer phone'],
                    'status' => ['type' => 'string', 'description' => 'Initial status (default new)'],
                    'payment_status' => ['type' => 'string', 'description' => 'Payment status: unpaid, partially_paid, paid, refunded (default unpaid)'],
                    'payment_method' => ['type' => 'string', 'description' => 'Payment method (e.g. bank_transfer, card, cash, cod)'],
                    'currency' => ['type' => 'string', 'description' => '3-letter currency code (default workspace currency)'],
                    'requested_delivery_date' => ['type' => 'string', 'description' => 'Requested delivery YYYY-MM-DD'],
                    'shipping_method' => ['type' => 'string', 'description' => 'Shipping carrier/method'],
                    'notes' => ['type' => 'string', 'description' => 'Internal order notes'],
                    'items' => [
                        'type' => 'array',
                        'description' => 'Order line items',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'name' => ['type' => 'string', 'description' => 'Product/service name'],
                                'item_type' => ['type' => 'string', 'description' => 'product or service (default product)'],
                                'item_id' => ['type' => 'string', 'description' => 'Optional warehouse_items ID'],
                                'sku' => ['type' => 'string', 'description' => 'SKU'],
                                'quantity' => ['type' => 'number', 'description' => 'Quantity (default 1)'],
                                'unit' => ['type' => 'string', 'description' => 'Unit (default ks)'],
                                'unit_price' => ['type' => 'number', 'description' => 'Net unit price'],
                                'discount_percent' => ['type' => 'number', 'description' => 'Discount % (default 0)'],
                                'tax_rate' => ['type' => 'number', 'description' => 'VAT % (default workspace rate)'],
                            ],
                            'required' => ['name', 'unit_price'],
                        ],
                    ],
                ],
            ],
        ],
        [
            'name' => 'update_order',
            'description' => 'Update order workflow status, payment status/date, delivery tracking, or notes.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Order ID'],
                    'status' => ['type' => 'string', 'description' => 'Updated status (e.g. new, confirmed, processing, shipped, delivered, cancelled)'],
                    'payment_status' => ['type' => 'string', 'description' => 'Payment status: unpaid, partially_paid, paid, refunded'],
                    'paid_at' => ['type' => 'string', 'description' => 'Payment timestamp/date YYYY-MM-DD'],
                    'payment_reference' => ['type' => 'string', 'description' => 'Payment reference / VS'],
                    'shipping_method' => ['type' => 'string', 'description' => 'Shipping carrier/method'],
                    'shipping_tracking_number' => ['type' => 'string', 'description' => 'Shipment tracking number'],
                    'confirmed_delivery_date' => ['type' => 'string', 'description' => 'Confirmed delivery date YYYY-MM-DD'],
                    'notes' => ['type' => 'string', 'description' => 'Updated internal notes'],
                ],
                'required' => ['id'],
            ],
        ],

        // --- Weekly Plan ---
        [
            'name' => 'get_weekly_plan',
            'description' => 'Get the Weekly Plan board (planning cards grouped by date plus per-day notes) for a given Monday-Sunday date range.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'date' => ['type' => 'string', 'description' => 'Any date YYYY-MM-DD in the target week (default: current week)'],
                    'from' => ['type' => 'string', 'description' => 'Explicit range start YYYY-MM-DD'],
                    'to' => ['type' => 'string', 'description' => 'Explicit range end YYYY-MM-DD'],
                ],
            ],
        ],
        [
            'name' => 'create_weekly_plan_card',
            'description' => 'Create a standalone planning card on a Weekly Plan day column with optional color and entity references.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'date' => ['type' => 'string', 'description' => 'Day column YYYY-MM-DD'],
                    'content' => ['type' => 'string', 'description' => 'Card text/goal'],
                    'position' => ['type' => 'integer', 'description' => 'Sort order in day column (appends to end if omitted)'],
                    'color' => ['type' => 'string', 'description' => 'Optional card color key/hex'],
                    'completed' => ['type' => 'boolean', 'description' => 'Initial completion state (default false)'],
                    'refs' => [
                        'type' => 'array',
                        'description' => 'Optional inline entity references [{type, id, label}]',
                        'items' => ['type' => 'object'],
                    ],
                ],
                'required' => ['date', 'content'],
            ],
        ],
        [
            'name' => 'update_weekly_plan_card',
            'description' => 'Update a Weekly Plan card\'s text, completion checkbox, date column, position, color, or entity references.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'string', 'description' => 'Weekly plan card ID'],
                    'date' => ['type' => 'string', 'description' => 'Move card to YYYY-MM-DD'],
                    'content' => ['type' => 'string', 'description' => 'Updated text'],
                    'position' => ['type' => 'integer', 'description' => 'Updated sort position'],
                    'completed' => ['type' => 'boolean', 'description' => 'Mark card checked or unchecked'],
                    'color' => ['type' => 'string', 'description' => 'Updated color key/hex'],
                    'refs' => ['type' => 'array', 'description' => 'Updated refs array', 'items' => ['type' => 'object']],
                ],
                'required' => ['id'],
            ],
        ],
        [
            'name' => 'set_weekly_plan_day_note',
            'description' => 'Set or clear the day note displayed under a Weekly Plan day header.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'date' => ['type' => 'string', 'description' => 'Day YYYY-MM-DD'],
                    'note' => ['type' => 'string', 'description' => 'Day note text (empty string clears the note)'],
                ],
                'required' => ['date', 'note'],
            ],
        ],

        // --- Price Offers & Recurring Tasks ---
        [
            'name' => 'create_price_offer',
            'description' => 'Create a price offer (quote) for a client or lead with itemized pricing, optional validity window, intro/closing notes, and automatic CP document number.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'client_id' => ['type' => 'string', 'description' => 'Lead or client ID from CRM'],
                    'title' => ['type' => 'string', 'description' => 'Offer title'],
                    'subject' => ['type' => 'string', 'description' => 'Optional email/offer subject (defaults to title)'],
                    'issued_at' => ['type' => 'string', 'description' => 'Issue date YYYY-MM-DD (default today)'],
                    'valid_until' => ['type' => 'string', 'description' => 'Valid-until date YYYY-MM-DD (default +30 days)'],
                    'status' => ['type' => 'string', 'description' => 'Offer status key from OFFER_STATUSES (default draft)'],
                    'currency' => ['type' => 'string', 'description' => '3-letter currency code (default workspace currency)'],
                    'greeting_note' => ['type' => 'string', 'description' => 'Optional greeting paragraph'],
                    'intro_note' => ['type' => 'string', 'description' => 'Optional introduction paragraph'],
                    'closing_note' => ['type' => 'string', 'description' => 'Optional closing note'],
                    'document_number' => ['type' => 'string', 'description' => 'Custom CP number (auto-generated if omitted)'],
                    'items' => [
                        'type' => 'array',
                        'description' => 'Line items (at least one required)',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'title' => ['type' => 'string', 'description' => 'Item name'],
                                'quantity' => ['type' => 'number', 'description' => 'Quantity (default 1)'],
                                'unit_price' => ['type' => 'number', 'description' => 'Net unit price'],
                                'vat_rate' => ['type' => 'number', 'description' => 'VAT % (default workspace rate)'],
                                'discount_pct' => ['type' => 'number', 'description' => 'Discount % (default 0)'],
                            ],
                            'required' => ['title', 'unit_price'],
                        ],
                    ],
                ],
                'required' => ['client_id', 'title', 'items'],
            ],
        ],
        [
            'name' => 'list_recurring_tasks',
            'description' => 'List recurring task templates and their schedule frequency, paused status, owner, and next occurrence.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'owner' => ['type' => 'string', 'description' => 'Filter by owner name'],
                    'search' => ['type' => 'string', 'description' => 'Search template title or description'],
                    'active_only' => ['type' => 'boolean', 'description' => 'Only non-paused series (default false)'],
                    'limit' => ['type' => 'integer', 'description' => 'Max rows (default 50, max 100)'],
                ],
            ],
        ],
        [
            'name' => 'create_recurring_task',
            'description' => 'Create a recurring task series template (daily, weekly, monthly, or yearly) and immediately materialize any due occurrence.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'title' => ['type' => 'string', 'description' => 'Recurring task title'],
                    'description' => ['type' => 'string', 'description' => 'Task description'],
                    'priority' => ['type' => 'string', 'description' => 'Priority: low, medium, high (default medium)'],
                    'frequency' => ['type' => 'string', 'description' => 'Schedule frequency: daily, weekly, monthly, yearly'],
                    'interval' => ['type' => 'integer', 'description' => 'Repeat every N units (default 1)'],
                    'starts_on' => ['type' => 'string', 'description' => 'Series start date YYYY-MM-DD (default today)'],
                    'ends_on' => ['type' => 'string', 'description' => 'Optional series end date YYYY-MM-DD'],
                    'weekend_rule' => ['type' => 'string', 'description' => 'Weekend handling: keep, before, after (default keep)'],
                    'lead_days' => ['type' => 'integer', 'description' => 'Days before deadline to create occurrence'],
                    'day_of_week' => ['type' => 'integer', 'description' => '0 (Sun) to 6 (Sat) for weekly schedules'],
                    'day_of_month' => ['type' => 'integer', 'description' => '1 to 31 for monthly/yearly schedules'],
                    'month' => ['type' => 'integer', 'description' => '1 to 12 for yearly schedules'],
                    'owner' => ['type' => 'string', 'description' => 'Primary assignee name (default active user)'],
                    'assignees' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Additional assignee names'],
                    'project_id' => ['type' => 'string', 'description' => 'Optional linked project ID'],
                    'client_id' => ['type' => 'string', 'description' => 'Optional linked client/lead ID'],
                ],
                'required' => ['title', 'frequency'],
            ],
        ],
    ];
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Enforce the same lock / approved / paid-payroll rules as time_entries.php. */
function mcp_mod_assert_te_unlocked(\PDO $pdo, array $user, string $entryDate, string $ownerUserId, ?string $approvalStatus, array $settings): void {
    if (ccrm_is_admin($user)) return;
    if ($approvalStatus === 'approved') {
        throw new \InvalidArgumentException('Approved time entries cannot be modified.');
    }
    $lockDays = (int)($settings['lockAfterDays'] ?? 0);
    if ($lockDays > 0 && ccrm_tt_valid_date($entryDate)) {
        $age = (int)floor((strtotime(mcp_today()) - strtotime($entryDate)) / 86400);
        if ($age > $lockDays) {
            throw new \InvalidArgumentException("Entries older than {$lockDays} days are locked.");
        }
    }
    $emp = ccrm_tt_employee_for_user($pdo, $ownerUserId);
    if ($emp && ccrm_tt_valid_date($entryDate)) {
        $chk = $pdo->prepare("SELECT 1 FROM employee_salaries WHERE employee_id = ? AND period_key = ? AND status = 'paid' LIMIT 1");
        $chk->execute([$emp['id'], substr($entryDate, 0, 7)]);
        if ($chk->fetchColumn()) {
            throw new \InvalidArgumentException('Entries in a paid payroll period are locked.');
        }
    }
}

/** D3.3: an interval that overlaps a locked entry of $ownerUserId is refused like editing it; admins pass. */
function mcp_mod_assert_te_neighbours_unlocked(\PDO $pdo, array $user, string $ownerUserId, array $intervals, array $settings, ?string $excludeId = null): void {
    $hit = ccrm_te_refuse_locked_neighbours($pdo, $user, $ownerUserId, $intervals, $settings, $excludeId);
    if ($hit !== null) {
        throw new \InvalidArgumentException("This time overlaps a locked time entry ({$hit['id']}, {$hit['reason']}).");
    }
}

/** Check user access to task/ticket/project referenced by a time entry link set. */
function mcp_mod_check_te_link_access(\PDO $pdo, array $user, array $links): void {
    $scope = ccrm_read_scope($pdo, $user);
    if (!empty($links['task_id'])) {
        $vis = ccrm_visible_task_ids($pdo, $scope, [$links['task_id']]);
        if (!isset($vis[$links['task_id']])) {
            throw new \InvalidArgumentException('Linked task is not accessible to this user.');
        }
    }
    if (empty($links['task_id']) && !empty($links['ticket_id']) && !mcp_can('tickets')) {
        throw new \InvalidArgumentException('Caller does not have tickets permission for this link.');
    }
    if (!empty($links['project_id']) && $links['project_id'] !== $links['derivedProject']
        && !ccrm_is_admin($user) && !mcp_can('projects') && !ccrm_works_on_project($pdo, $scope, $links['project_id'])) {
        throw new \InvalidArgumentException('Linked project is not accessible to this user.');
    }
}

/** Normalize duration seconds from duration_seconds / duration_minutes / start_at+end_at. */
function mcp_mod_resolve_te_timing(array $args, ?string $defaultDate = null): array {
    $startUtc = isset($args['start_at']) && $args['start_at'] !== '' ? ccrm_tt_to_utc($args['start_at']) : null;
    $endUtc = isset($args['end_at']) && $args['end_at'] !== '' ? ccrm_tt_to_utc($args['end_at']) : null;
    if (($startUtc !== null) !== ($endUtc !== null)) {
        throw new \InvalidArgumentException('Provide both start_at and end_at, or omit both and pass duration_minutes/duration_seconds.');
    }
    if ($startUtc !== null && $endUtc !== null) {
        $sec = ccrm_tt_seconds_between($startUtc, $endUtc);
        if ($sec < 1 || $sec > 86400) {
            throw new \InvalidArgumentException('Time entry duration must be between 1 second and 24 hours.');
        }
        $date = mcp_optional_date($args, 'entry_date') ?? ccrm_tt_local_date($startUtc);
        return ['entry_date' => $date, 'start_at' => $startUtc, 'end_at' => $endUtc, 'duration_sec' => $sec];
    }
    if (isset($args['duration_seconds'])) {
        $sec = (int)$args['duration_seconds'];
    } elseif (isset($args['duration_minutes'])) {
        $sec = (int)round((float)$args['duration_minutes'] * 60);
    } else {
        throw new \InvalidArgumentException('Provide duration_minutes, duration_seconds, or start_at + end_at.');
    }
    if ($sec < 1 || $sec > 86400) {
        throw new \InvalidArgumentException('Duration must be between 1 second and 24 hours (1440 minutes).');
    }
    $date = mcp_optional_date($args, 'entry_date') ?? ($defaultDate ?? mcp_today());
    return ['entry_date' => $date, 'start_at' => null, 'end_at' => null, 'duration_sec' => $sec];
}

function mcp_mod_ensure_tickets(\PDO $pdo): void {
    if (!ccrm_table_exists($pdo, 'tickets')) {
        ccrm_migrate_tickets($pdo, false);
    }
}

function mcp_mod_ensure_weekly_plan(\PDO $pdo): void {
    if (!ccrm_table_exists($pdo, 'weekly_plan_cards')) {
        ccrm_migrate_weekly_plan($pdo);
    }
}

/** Local whitelist existence check for extension tables not in mcp_row_exists(). */
function mcp_mod_row_exists(\PDO $pdo, string $table, string $id, string $label): void {
    static $allowed = ['support_contracts', 'orders', 'suppliers', 'weekly_plan_cards'];
    if (!in_array($table, $allowed, true)) throw new \LogicException('table not allowed');
    $stmt = $pdo->prepare("SELECT 1 FROM `{$table}` WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) throw new \InvalidArgumentException("{$label} not found: {$id}");
}

/** Find ticket row by ID or ticket_number. */
function mcp_mod_find_ticket(\PDO $pdo, string $idOrNum): array {
    $stmt = $pdo->prepare("SELECT * FROM tickets WHERE id = ? OR UPPER(ticket_number) = UPPER(?) LIMIT 1");
    $stmt->execute([$idOrNum, $idOrNum]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$row) throw new \InvalidArgumentException("Ticket not found: {$idOrNum}");
    return $row;
}

/** Resolve a user by exact name or ID and return ['id' => ..., 'name' => ...]. */
function mcp_mod_resolve_user(\PDO $pdo, string $nameOrId): array {
    $stmt = $pdo->prepare("SELECT id, name FROM users WHERE id = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1");
    $stmt->execute([$nameOrId, $nameOrId]);
    $u = $stmt->fetch(\PDO::FETCH_ASSOC);
    if (!$u) throw new \InvalidArgumentException("User not found: {$nameOrId}");
    return $u;
}

/** Lookup matching support contract ID when none explicitly given. */
function mcp_mod_default_contract_id(\PDO $pdo, ?string $projectId, ?string $clientId): ?string {
    if (!$projectId && !$clientId) return null;
    $stmt = $pdo->prepare("SELECT id FROM support_contracts WHERE (project_id = ? OR client_id = ?) LIMIT 1");
    $stmt->execute([$projectId, $clientId]);
    return $stmt->fetchColumn() ?: null;
}

// ============================================================================
// Execution Dispatcher
// ============================================================================

function mcp_ext_modules_execute(\PDO $pdo, array $user, string $tool, array $args): mixed {
    $uid = (string)$user['id'];
    $viewer = ['userId' => $uid, 'canCosts' => mcp_can('time_tracking_costs')];

    switch ($tool) {
        // ------------------------------------------------------------------
        // TIME TRACKING
        // ------------------------------------------------------------------
        case 'list_time_entries': {
            $canTeam = mcp_can('time_tracking_team');
            $targetUser = isset($args['user_id']) && $args['user_id'] !== '' ? (string)$args['user_id'] : null;
            if (!$canTeam) {
                if ($targetUser !== null && $targetUser !== $uid) {
                    throw new \InvalidArgumentException('Viewing another user\'s time entries requires time_tracking_team permission.');
                }
                $targetUser = $uid;
            }
            $where = ['te.deleted_at IS NULL'];
            $params = [];
            if ($targetUser !== null) { $where[] = 'te.user_id = ?'; $params[] = $targetUser; }
            if ($from = mcp_optional_date($args, 'from')) { $where[] = 'te.entry_date >= ?'; $params[] = $from; }
            if ($to = mcp_optional_date($args, 'to')) { $where[] = 'te.entry_date <= ?'; $params[] = $to; }
            if (!empty($args['project_id'])) { $where[] = 'te.project_id = ?'; $params[] = (string)$args['project_id']; }
            if (!empty($args['task_id'])) { $where[] = 'te.task_id = ?'; $params[] = (string)$args['task_id']; }
            if (!empty($args['ticket_id'])) { $where[] = 'te.ticket_id = ?'; $params[] = (string)$args['ticket_id']; }
            if (array_key_exists('billable', $args) && $args['billable'] !== null) {
                $where[] = 'te.billable = ?';
                $params[] = $args['billable'] ? 1 : 0;
            }
            $limit = mcp_limit($args, 50, 200);
            $sql = ccrm_tt_entry_select()
                . ' WHERE ' . implode(' AND ', $where)
                . " ORDER BY te.entry_date DESC, COALESCE(te.start_at, te.created_at) DESC LIMIT {$limit}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return array_map(fn($r) => ccrm_tt_entry_json($r, $viewer), $stmt->fetchAll(\PDO::FETCH_ASSOC));
        }

        case 'get_running_timer': {
            $stmt = $pdo->prepare(ccrm_tt_entry_select() . " WHERE te.user_id = ? AND te.start_at IS NOT NULL AND te.end_at IS NULL AND te.deleted_at IS NULL LIMIT 1");
            $stmt->execute([$uid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return ['running' => $row ? ccrm_tt_entry_json($row, $viewer) : null];
        }

        case 'get_time_tracking_summary': {
            $canTeam = mcp_can('time_tracking_team');
            $targetUser = isset($args['user_id']) && $args['user_id'] !== '' ? (string)$args['user_id'] : null;
            if (!$canTeam) {
                if ($targetUser !== null && $targetUser !== $uid) {
                    throw new \InvalidArgumentException('Team summary requires time_tracking_team permission.');
                }
                $targetUser = $uid;
            }
            $from = mcp_optional_date($args, 'from') ?? date('Y-m-d', strtotime('-30 days'));
            $to = mcp_optional_date($args, 'to') ?? mcp_today();
            $groupBy = mcp_enum($args, 'group_by', ['project', 'user'], 'project');

            $where = ['e.deleted_at IS NULL', '(e.end_at IS NOT NULL OR e.start_at IS NULL)', 'e.entry_date >= ?', 'e.entry_date <= ?'];
            $params = [$from, $to];
            if ($targetUser !== null) { $where[] = 'e.user_id = ?'; $params[] = $targetUser; }
            if (!empty($args['project_id'])) { $where[] = 'e.project_id = ?'; $params[] = (string)$args['project_id']; }

            $selKey = $groupBy === 'user'
                ? 'e.user_id AS group_key, COALESCE(u.name, e.user_id) AS group_label'
                : "COALESCE(e.project_id, '_unassigned') AS group_key, COALESCE(p.name, 'Unassigned') AS group_label";
            $groupCol = $groupBy === 'user' ? 'e.user_id, u.name' : 'e.project_id, p.name';

            $costCols = $viewer['canCosts']
                ? ', COALESCE(SUM(e.cost), 0) AS total_cost, COALESCE(SUM(CASE WHEN e.billable = 1 THEN (e.duration_sec / 3600.0) * COALESCE(e.billable_rate, 0) ELSE 0 END), 0) AS total_billable_amount'
                : '';

            $sql = "SELECT {$selKey}, COUNT(*) AS entry_count,
                           COALESCE(SUM(e.duration_sec), 0) AS total_seconds,
                           COALESCE(SUM(CASE WHEN e.billable = 1 THEN e.duration_sec ELSE 0 END), 0) AS billable_seconds
                           {$costCols}
                    FROM time_entries e
                    LEFT JOIN users u ON u.id = e.user_id
                    LEFT JOIN projects p ON p.id = e.project_id
                    WHERE " . implode(' AND ', $where) . "
                    GROUP BY {$groupCol}
                    ORDER BY total_seconds DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = [];
            $totSec = 0; $billSec = 0; $totCost = 0.0; $totBillAmt = 0.0;
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $s = (int)$r['total_seconds'];
                $b = (int)$r['billable_seconds'];
                $totSec += $s; $billSec += $b;
                $item = [
                    'key' => $r['group_key'],
                    'label' => $r['group_label'],
                    'entry_count' => (int)$r['entry_count'],
                    'hours' => round($s / 3600, 2),
                    'billable_hours' => round($b / 3600, 2),
                ];
                if ($viewer['canCosts']) {
                    $c = round((float)$r['total_cost'], 2);
                    $ba = round((float)$r['total_billable_amount'], 2);
                    $totCost += $c; $totBillAmt += $ba;
                    $item['total_cost'] = $c;
                    $item['total_billable_amount'] = $ba;
                }
                $rows[] = $item;
            }
            $out = [
                'from' => $from, 'to' => $to, 'group_by' => $groupBy,
                'total_hours' => round($totSec / 3600, 2),
                'billable_hours' => round($billSec / 3600, 2),
                'groups' => $rows,
            ];
            if ($viewer['canCosts']) {
                $out['total_cost'] = round($totCost, 2);
                $out['total_billable_amount'] = round($totBillAmt, 2);
            }
            return $out;
        }

        case 'log_time_entry': {
            $settings = ccrm_tt_load_settings($pdo);
            $timing = mcp_mod_resolve_te_timing($args);
            mcp_mod_assert_te_unlocked($pdo, $user, $timing['entry_date'], $uid, null, $settings);
            mcp_mod_assert_te_neighbours_unlocked($pdo, $user, $uid, [[$timing['start_at'], $timing['end_at']]], $settings);

            $links = ccrm_tt_resolve_links($pdo, [
                'taskId' => $args['task_id'] ?? null,
                'ticketId' => $args['ticket_id'] ?? null,
                'projectId' => $args['project_id'] ?? null,
                'description' => $args['description'] ?? null,
            ]);
            if (!$links['ok']) {
                throw new \InvalidArgumentException("Invalid time entry link: {$links['code']}");
            }
            mcp_mod_check_te_link_access($pdo, $user, $links);

            $billable = array_key_exists('billable', $args) ? ($args['billable'] ? 1 : 0) : (!empty($settings['defaultBillable']) ? 1 : 0);
            $pricing = ccrm_tt_price($pdo, $uid, $timing['entry_date'], $timing['duration_sec'], $settings, true);
            $billRate = $billable ? ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $timing['entry_date']) : null;
            $note = isset($args['note']) ? ccrm_tt_clean_note($args['note']) : null;
            $id = ccrm_tt_new_id();

            mcp_tx($pdo, function () use ($pdo, $id, $uid, $pricing, $links, $note, $timing, $billable, $billRate) {
                $pdo->prepare(
                    "INSERT INTO time_entries
                        (id, user_id, recorded_by_user_id, employee_id, project_id, task_id, ticket_id,
                         description, title_snapshot, note, entry_date, start_at, end_at, duration_sec,
                         billable, billable_rate, cost_rate, cost_rate_source, cost_rate_basis_days, tags, source)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'manual')"
                )->execute([
                    $id, $uid, $uid, $pricing['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'],
                    $links['description'], $links['title_snapshot'], $note,
                    $timing['entry_date'], $timing['start_at'], $timing['end_at'], $timing['duration_sec'],
                    $billable, $billRate, $pricing['cost_rate'], $pricing['cost_rate_source'], $pricing['cost_rate_basis_days'],
                ]);
                ccrm_tt_settle_rows($pdo, [['id' => $id, 'user_id' => $uid, 'start_at' => $timing['start_at'], 'end_at' => $timing['end_at'], 'duration_sec' => $timing['duration_sec'], 'entry_date' => $timing['entry_date']]]);
            });

            mcp_audit($pdo, $user, 'time_entry_log', "Logged time entry {$id} ({$timing['duration_sec']}s on {$timing['entry_date']})");
            $row = ccrm_tt_fetch_entry($pdo, $id);
            return ['success' => true, 'entry' => $row ? ccrm_tt_entry_json($row, $viewer) : ['id' => $id]];
        }

        case 'start_timer': {
            $settings = ccrm_tt_load_settings($pdo);
            $links = ccrm_tt_resolve_links($pdo, [
                'taskId' => $args['task_id'] ?? null,
                'ticketId' => $args['ticket_id'] ?? null,
                'projectId' => $args['project_id'] ?? null,
                'description' => $args['description'] ?? null,
            ]);
            if (!$links['ok']) {
                throw new \InvalidArgumentException("Invalid timer link: {$links['code']}");
            }
            mcp_mod_check_te_link_access($pdo, $user, $links);

            $nowUtc = ccrm_tt_now_utc();
            $today = ccrm_tt_local_date($nowUtc);
            $billable = array_key_exists('billable', $args) ? ($args['billable'] ? 1 : 0) : (!empty($settings['defaultBillable']) ? 1 : 0);
            $note = isset($args['note']) ? ccrm_tt_clean_note($args['note']) : null;
            $pricing = ccrm_tt_price($pdo, $uid, $today, null, $settings, false);
            $billRate = $billable ? ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $today) : null;
            $id = ccrm_tt_new_id();

            $stoppedPrevId = null;
            mcp_tx($pdo, function () use ($pdo, $uid, $nowUtc, $settings, &$stoppedPrevId, $id, $links, $note, $today, $billable, $pricing, $billRate) {
                $sel = $pdo->prepare("SELECT * FROM time_entries WHERE user_id = ? AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL FOR UPDATE");
                $sel->execute([$uid]);
                if ($prev = $sel->fetch(\PDO::FETCH_ASSOC)) {
                    $stoppedPrevId = $prev['id'];
                    $dur = min(86400, ccrm_tt_seconds_between($prev['start_at'], $nowUtc));
                    $pPricing = ccrm_tt_price($pdo, $uid, $prev['entry_date'], $dur, $settings, false);
                    $pBill = !empty($prev['billable'])
                        ? ($prev['billable_rate'] !== null ? (float)$prev['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $prev['project_id'], $prev['ticket_id'], $prev['entry_date']))
                        : null;
                    $pdo->prepare(
                        "UPDATE time_entries
                         SET end_at = ?, duration_sec = ?, employee_id = ?, cost_rate = ?, cost_rate_source = ?, cost_rate_basis_days = ?, billable_rate = ?
                         WHERE id = ?"
                    )->execute([$nowUtc, $dur, $pPricing['employee_id'], $pPricing['cost_rate'], $pPricing['cost_rate_source'], $pPricing['cost_rate_basis_days'], $pBill, $prev['id']]);
                }

                $pdo->prepare(
                    "INSERT INTO time_entries
                        (id, user_id, recorded_by_user_id, employee_id, project_id, task_id, ticket_id,
                         description, title_snapshot, note, entry_date, start_at, end_at, duration_sec,
                         billable, billable_rate, cost_rate, cost_rate_source, cost_rate_basis_days, tags, source)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, '[]', 'timer')"
                )->execute([
                    $id, $uid, $uid, $pricing['employee_id'], $links['project_id'], $links['task_id'], $links['ticket_id'],
                    $links['description'], $links['title_snapshot'], $note, $today, $nowUtc,
                    $billable, $billRate, $pricing['cost_rate'], $pricing['cost_rate_source'], $pricing['cost_rate_basis_days'],
                ]);
                // $prev was running until now, so its row covers the stopped interval.
                ccrm_tt_settle_rows($pdo, [$prev ?: null]);
            });

            mcp_audit($pdo, $user, 'timer_start', "Started timer {$id}" . ($stoppedPrevId ? " (stopped {$stoppedPrevId})" : ''));
            $row = ccrm_tt_fetch_entry($pdo, $id);
            return ['success' => true, 'stopped_previous_id' => $stoppedPrevId, 'entry' => $row ? ccrm_tt_entry_json($row, $viewer) : ['id' => $id]];
        }

        case 'stop_timer': {
            $settings = ccrm_tt_load_settings($pdo);
            $stmt = $pdo->prepare("SELECT * FROM time_entries WHERE user_id = ? AND start_at IS NOT NULL AND end_at IS NULL AND deleted_at IS NULL LIMIT 1");
            $stmt->execute([$uid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \InvalidArgumentException('No running timer found for the current user.');
            }

            $links = ccrm_tt_resolve_links($pdo, [
                'taskId' => array_key_exists('task_id', $args) ? $args['task_id'] : $row['task_id'],
                'ticketId' => $row['ticket_id'],
                'projectId' => array_key_exists('project_id', $args) ? $args['project_id'] : $row['project_id'],
                'description' => array_key_exists('description', $args) ? $args['description'] : $row['description'],
            ]);
            if (!$links['ok']) {
                throw new \InvalidArgumentException("Invalid timer link: {$links['code']}");
            }
            if (!empty($settings['requireProjectToStop']) && empty($links['project_id'])) {
                throw new \InvalidArgumentException('Workspace settings require a project_id before stopping a timer.');
            }
            if (!empty($settings['requireTask']) && empty($links['task_id'])) {
                throw new \InvalidArgumentException('Workspace settings require a task_id before stopping a timer.');
            }

            $nowUtc = ccrm_tt_now_utc();
            $dur = min(86400, ccrm_tt_seconds_between($row['start_at'], $nowUtc));
            $pricing = ccrm_tt_price($pdo, $uid, $row['entry_date'], $dur, $settings, true);
            $billRate = !empty($row['billable'])
                ? ($row['billable_rate'] !== null ? (float)$row['billable_rate'] : ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $row['entry_date']))
                : null;
            $note = array_key_exists('note', $args) ? ccrm_tt_clean_note($args['note']) : $row['note'];

            mcp_tx($pdo, function () use ($pdo, $links, $note, $nowUtc, $dur, $pricing, $billRate, $row) {
                $pdo->prepare(
                    "UPDATE time_entries
                     SET task_id = ?, project_id = ?, title_snapshot = ?, description = ?, note = ?,
                         end_at = ?, duration_sec = ?, employee_id = ?, cost_rate = ?, cost_rate_source = ?,
                         cost_rate_basis_days = ?, billable_rate = ?
                     WHERE id = ?"
                )->execute([
                    $links['task_id'], $links['project_id'], $links['title_snapshot'], $links['description'], $note,
                    $nowUtc, $dur, $pricing['employee_id'], $pricing['cost_rate'], $pricing['cost_rate_source'],
                    $pricing['cost_rate_basis_days'], $billRate, $row['id'],
                ]);
                ccrm_tt_settle_rows($pdo, [$row]); // running until now: covers the stopped interval
            });

            mcp_audit($pdo, $user, 'timer_stop', "Stopped timer {$row['id']} ({$dur}s)");
            $updated = ccrm_tt_fetch_entry($pdo, $row['id']);
            return ['success' => true, 'entry' => $updated ? ccrm_tt_entry_json($updated, $viewer) : ['id' => $row['id']]];
        }

        case 'update_time_entry': {
            $id = mcp_require_string($args, 'id');
            $settings = ccrm_tt_load_settings($pdo);
            $cur = ccrm_tt_fetch_entry($pdo, $id);
            if (!$cur) throw new \InvalidArgumentException("Time entry not found: {$id}");

            $canTeam = mcp_can('time_tracking_team');
            if ((string)$cur['user_id'] !== $uid && !$canTeam) {
                throw new \InvalidArgumentException('Editing another user\'s time entry requires time_tracking_team permission.');
            }
            mcp_mod_assert_te_unlocked($pdo, $user, (string)$cur['entry_date'], (string)$cur['user_id'], $cur['approval_status'] ?? null, $settings);

            $links = ccrm_tt_resolve_links($pdo, [
                'taskId' => array_key_exists('task_id', $args) ? $args['task_id'] : $cur['task_id'],
                'ticketId' => array_key_exists('ticket_id', $args) ? $args['ticket_id'] : $cur['ticket_id'],
                'projectId' => array_key_exists('project_id', $args) ? $args['project_id'] : $cur['project_id'],
                'description' => array_key_exists('description', $args) ? $args['description'] : $cur['description'],
            ]);
            if (!$links['ok']) {
                throw new \InvalidArgumentException("Invalid time entry link: {$links['code']}");
            }
            if ((string)$cur['user_id'] === $uid) {
                mcp_mod_check_te_link_access($pdo, $user, $links);
            }

            $entryDate = mcp_optional_date($args, 'entry_date') ?? (string)$cur['entry_date'];
            if (isset($args['duration_seconds'])) {
                $dur = (int)$args['duration_seconds'];
            } elseif (isset($args['duration_minutes'])) {
                $dur = (int)round((float)$args['duration_minutes'] * 60);
            } else {
                $dur = (int)$cur['duration_sec'];
            }
            $isRunning = $cur['start_at'] !== null && $cur['end_at'] === null;
            if (!$isRunning && ($dur < 1 || $dur > 86400)) {
                throw new \InvalidArgumentException('Duration must be between 1 second and 24 hours.');
            }
            if ($entryDate !== (string)$cur['entry_date']) {
                // Moving it to another day: that day's lock applies too.
                mcp_mod_assert_te_unlocked($pdo, $user, $entryDate, (string)$cur['user_id'], $cur['approval_status'] ?? null, $settings);
            }
            if (!$isRunning && $cur['start_at'] !== null && $dur !== (int)$cur['duration_sec']) {
                // A new duration moves the end (start + duration): old and new interval.
                $oldEnd = gmdate('Y-m-d H:i:s', strtotime($cur['start_at'] . ' UTC') + (int)$cur['duration_sec']);
                $newEnd = gmdate('Y-m-d H:i:s', strtotime($cur['start_at'] . ' UTC') + $dur);
                mcp_mod_assert_te_neighbours_unlocked($pdo, $user, (string)$cur['user_id'], [[$cur['start_at'], $oldEnd], [$cur['start_at'], $newEnd]], $settings, $id);
            }

            $billable = array_key_exists('billable', $args) ? ($args['billable'] ? 1 : 0) : (int)$cur['billable'];
            $note = array_key_exists('note', $args) ? ccrm_tt_clean_note($args['note']) : $cur['note'];
            $pricing = ccrm_tt_price($pdo, (string)$cur['user_id'], $entryDate, $isRunning ? null : $dur, $settings, true);
            $billRate = $billable ? ccrm_tt_lookup_billable_rate($pdo, $links['project_id'], $links['ticket_id'], $entryDate) : null;

            mcp_tx($pdo, function () use ($pdo, $links, $note, $entryDate, $dur, $billable, $pricing, $billRate, $id, $cur) {
                $pdo->prepare(
                    "UPDATE time_entries
                     SET task_id = ?, ticket_id = ?, project_id = ?, title_snapshot = ?, description = ?,
                         note = ?, entry_date = ?, duration_sec = ?, billable = ?,
                         employee_id = ?, cost_rate = ?, cost_rate_source = ?, cost_rate_basis_days = ?,
                         billable_rate = ?
                     WHERE id = ?"
                )->execute([
                    $links['task_id'], $links['ticket_id'], $links['project_id'], $links['title_snapshot'], $links['description'],
                    $note, $entryDate, $dur, $billable,
                    $pricing['employee_id'], $pricing['cost_rate'], $pricing['cost_rate_source'], $pricing['cost_rate_basis_days'],
                    $billRate, $id,
                ]);
                // A new duration moves the end of a timed entry (start + duration, D2); settle the old and new interval.
                ccrm_tt_settle_rows($pdo, [$cur, ['duration_sec' => $dur, 'entry_date' => $entryDate] + $cur]);
            });

            mcp_audit($pdo, $user, 'time_entry_update', "Updated time entry {$id}");
            $updated = ccrm_tt_fetch_entry($pdo, $id);
            return ['success' => true, 'entry' => $updated ? ccrm_tt_entry_json($updated, $viewer) : ['id' => $id]];
        }

        // ------------------------------------------------------------------
        // SUPPORT TICKETS & CONTRACTS
        // ------------------------------------------------------------------
        case 'list_tickets': {
            mcp_mod_ensure_tickets($pdo);
            $where = ['t.archived = ?'];
            $params = [!empty($args['archived']) ? 1 : 0];

            if (!empty($args['status'])) { $where[] = 't.status = ?'; $params[] = trim((string)$args['status']); }
            if (!empty($args['priority'])) { $where[] = 't.priority = ?'; $params[] = mcp_enum($args, 'priority', ['low', 'normal', 'high', 'critical'], 'normal'); }
            if (!empty($args['type'])) { $where[] = 't.type = ?'; $params[] = trim((string)$args['type']); }
            if (!empty($args['project_id'])) { $where[] = 't.project_id = ?'; $params[] = trim((string)$args['project_id']); }
            if (!empty($args['client_id'])) { $where[] = 't.client_id = ?'; $params[] = trim((string)$args['client_id']); }
            if (!empty($args['assignee'])) { $where[] = 't.assignee_name = ?'; $params[] = trim((string)$args['assignee']); }
            if (!empty($args['search'])) {
                $q = '%' . trim((string)$args['search']) . '%';
                $where[] = '(t.ticket_number LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.reporter_name LIKE ? OR t.reporter_email LIKE ?)';
                array_push($params, $q, $q, $q, $q, $q);
            }
            $limit = mcp_limit($args, 50, 100);
            $sql = "SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.type, t.source,
                           t.project_id, p.name AS project_name, t.client_id, l.name AS client_name,
                           t.assignee_id, t.assignee_name, t.reporter_name, t.reporter_email,
                           t.first_response_due_at, t.resolve_due_at, t.resolved_at, t.created_at, t.updated_at
                    FROM tickets t
                    LEFT JOIN projects p ON p.id = t.project_id
                    LEFT JOIN leads l ON l.id = t.client_id
                    WHERE " . implode(' AND ', $where) . "
                    ORDER BY t.updated_at DESC LIMIT {$limit}";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'get_ticket': {
            mcp_mod_ensure_tickets($pdo);
            $row = mcp_mod_find_ticket($pdo, mcp_require_string($args, 'id'));
            $msgStmt = $pdo->prepare("SELECT id, author_type, author_name, author_email, is_internal, body, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC");
            $msgStmt->execute([$row['id']]);
            $row['messages'] = $msgStmt->fetchAll(\PDO::FETCH_ASSOC);

            $teStmt = $pdo->prepare("SELECT COALESCE(SUM(duration_sec), 0) FROM time_entries WHERE ticket_id = ? AND deleted_at IS NULL");
            $teStmt->execute([$row['id']]);
            $row['tracked_seconds'] = (int)$teStmt->fetchColumn();
            return $row;
        }

        case 'create_ticket': {
            mcp_mod_ensure_tickets($pdo);
            $title = mcp_require_string($args, 'title');
            $desc = (string)($args['description'] ?? '');
            $priority = mcp_enum($args, 'priority', ['low', 'normal', 'high', 'critical'], 'normal');
            $type = trim((string)($args['type'] ?? 'question')) ?: 'question';
            $statuses = array_column(ccrm_load_ticket_statuses($pdo), 'key');
            $status = isset($args['status']) && $args['status'] !== '' ? trim((string)$args['status']) : ($statuses[0] ?? 'new');
            if ($statuses && !in_array($status, $statuses, true)) {
                throw new \InvalidArgumentException('status must be one of: ' . implode(', ', $statuses));
            }
            $projectId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
            $clientId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
            $contractId = !empty($args['contract_id']) ? (string)$args['contract_id'] : null;
            if ($projectId !== null) mcp_row_exists($pdo, 'projects', $projectId, 'Project');
            if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client');
            if ($contractId !== null) mcp_mod_row_exists($pdo, 'support_contracts', $contractId, 'Support contract');
            else $contractId = mcp_mod_default_contract_id($pdo, $projectId, $clientId);

            $assigneeUser = !empty($args['assignee']) ? mcp_mod_resolve_user($pdo, (string)$args['assignee']) : null;

            $id = mcp_new_id('tck-');
            $tckNumber = ccrm_next_ticket_number($pdo);
            $sla = ccrm_compute_ticket_sla($pdo, $priority, $contractId);

            mcp_tx($pdo, function () use ($pdo, $id, $tckNumber, $title, $desc, $status, $priority, $type, $projectId, $clientId, $assigneeUser, $args, $sla, $user) {
                $pdo->prepare(
                    "INSERT INTO tickets (id, ticket_number, title, description, status, priority, type, source, project_id, client_id, assignee_id, assignee_name, reporter_name, reporter_email, reporter_phone, first_response_due_at, resolve_due_at, archived, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'mcp', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())"
                )->execute([
                    $id, $tckNumber, $title, $desc, $status, $priority, $type,
                    $projectId, $clientId,
                    $assigneeUser['id'] ?? null, $assigneeUser['name'] ?? null,
                    $args['reporter_name'] ?? $user['name'], $args['reporter_email'] ?? null, $args['reporter_phone'] ?? null,
                    $sla['first_response_due_at'], $sla['resolve_due_at'],
                ]);
                if (trim($desc) !== '') {
                    $pdo->prepare(
                        "INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, author_email, is_internal, body, attachments_json, created_at)
                         VALUES (?, ?, 'agent', ?, ?, 0, ?, '[]', NOW())"
                    )->execute([mcp_new_id('tmsg_'), $id, $user['name'], $user['email'], $desc]);
                }
            });

            mcp_audit($pdo, $user, 'ticket_create', "Created ticket {$tckNumber} ({$id}): {$title}");
            return ['success' => true, 'id' => $id, 'ticket_number' => $tckNumber, 'status' => $status, 'priority' => $priority];
        }

        case 'update_ticket': {
            mcp_mod_ensure_tickets($pdo);
            $cur = mcp_mod_find_ticket($pdo, mcp_require_string($args, 'id'));
            $sets = ['updated_at = NOW()'];
            $params = [];
            if (isset($args['title']) && trim((string)$args['title']) !== '') { $sets[] = 'title = ?'; $params[] = trim((string)$args['title']); }
            if (array_key_exists('description', $args)) { $sets[] = 'description = ?'; $params[] = (string)$args['description']; }
            if (!empty($args['status'])) {
                $st = trim((string)$args['status']);
                $statuses = array_column(ccrm_load_ticket_statuses($pdo), 'key');
                if ($statuses && !in_array($st, $statuses, true)) {
                    throw new \InvalidArgumentException('status must be one of: ' . implode(', ', $statuses));
                }
                $sets[] = 'status = ?'; $params[] = $st;
                if (in_array($st, ['resolved', 'closed'], true) && empty($cur['resolved_at'])) {
                    $sets[] = 'resolved_at = NOW()';
                }
            }
            $newPriority = $cur['priority'];
            if (!empty($args['priority'])) {
                $newPriority = mcp_enum($args, 'priority', ['low', 'normal', 'high', 'critical'], (string)$cur['priority']);
                $sets[] = 'priority = ?'; $params[] = $newPriority;
            }
            if (!empty($args['type'])) {
                $sets[] = 'type = ?'; $params[] = trim((string)$args['type']);
            }
            if (array_key_exists('assignee', $args)) {
                $a = trim((string)$args['assignee']);
                if ($a !== '') {
                    $u = mcp_mod_resolve_user($pdo, $a);
                    $sets[] = 'assignee_id = ?'; $params[] = $u['id'];
                    $sets[] = 'assignee_name = ?'; $params[] = $u['name'];
                } else {
                    $sets[] = 'assignee_id = NULL';
                    $sets[] = 'assignee_name = NULL';
                }
            }
            $newProjectId = $cur['project_id'];
            if (array_key_exists('project_id', $args)) {
                $pid = trim((string)$args['project_id']);
                if ($pid !== '') mcp_row_exists($pdo, 'projects', $pid, 'Project');
                $newProjectId = $pid !== '' ? $pid : null;
                $sets[] = 'project_id = ?'; $params[] = $newProjectId;
            }
            $newClientId = $cur['client_id'];
            if (array_key_exists('client_id', $args)) {
                $cid = trim((string)$args['client_id']);
                if ($cid !== '') mcp_row_exists($pdo, 'leads', $cid, 'Client');
                $newClientId = $cid !== '' ? $cid : null;
                $sets[] = 'client_id = ?'; $params[] = $newClientId;
            }
            $contractId = null;
            if (!empty($args['contract_id'])) {
                $contractId = trim((string)$args['contract_id']);
                mcp_mod_row_exists($pdo, 'support_contracts', $contractId, 'Support contract');
            } elseif (!empty($args['priority'])) {
                $contractId = mcp_mod_default_contract_id($pdo, $newProjectId, $newClientId);
            }
            if (!empty($args['priority']) || !empty($args['contract_id'])) {
                $sla = ccrm_compute_ticket_sla($pdo, (string)$newPriority, $contractId);
                $sets[] = 'first_response_due_at = ?'; $params[] = $sla['first_response_due_at'];
                $sets[] = 'resolve_due_at = ?'; $params[] = $sla['resolve_due_at'];
            }
            if (array_key_exists('archived', $args)) { $sets[] = 'archived = ?'; $params[] = $args['archived'] ? 1 : 0; }

            $params[] = $cur['id'];
            $pdo->prepare('UPDATE tickets SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            mcp_audit($pdo, $user, 'ticket_update', "Updated ticket {$cur['ticket_number']} ({$cur['id']})");
            return ['success' => true, 'id' => $cur['id'], 'ticket_number' => $cur['ticket_number']];
        }

        case 'add_ticket_message': {
            mcp_mod_ensure_tickets($pdo);
            $cur = mcp_mod_find_ticket($pdo, mcp_require_string($args, 'ticket_id'));
            $body = mcp_require_string($args, 'body');
            $internal = array_key_exists('is_internal', $args) ? ($args['is_internal'] ? 1 : 0) : 1;
            $msgId = mcp_new_id('tmsg_');

            mcp_tx($pdo, function () use ($pdo, $msgId, $cur, $user, $internal, $body, $args) {
                $pdo->prepare(
                    "INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, author_email, is_internal, body, attachments_json, created_at)
                     VALUES (?, ?, 'agent', ?, ?, ?, ?, '[]', NOW())"
                )->execute([$msgId, $cur['id'], $user['name'], $user['email'], $internal, $body]);

                $sets = ['updated_at = NOW()'];
                $params = [];
                if (!$internal && empty($cur['first_responded_at'])) {
                    $sets[] = 'first_responded_at = NOW()';
                }
                if (!empty($args['status'])) {
                    $st = trim((string)$args['status']);
                    $statuses = array_column(ccrm_load_ticket_statuses($pdo), 'key');
                    if ($statuses && !in_array($st, $statuses, true)) {
                        throw new \InvalidArgumentException('status must be one of: ' . implode(', ', $statuses));
                    }
                    $sets[] = 'status = ?'; $params[] = $st;
                    if (in_array($st, ['resolved', 'closed'], true) && empty($cur['resolved_at'])) {
                        $sets[] = 'resolved_at = NOW()';
                    }
                }
                $params[] = $cur['id'];
                $pdo->prepare('UPDATE tickets SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            });

            mcp_audit($pdo, $user, 'ticket_message', "Added " . ($internal ? 'internal' : 'public') . " message {$msgId} to ticket {$cur['ticket_number']}");
            return ['success' => true, 'id' => $msgId, 'ticket_id' => $cur['id'], 'is_internal' => (bool)$internal];
        }

        case 'list_support_contracts': {
            mcp_mod_ensure_tickets($pdo);
            $where = ['1=1'];
            $params = [];
            if (!empty($args['tier'])) { $where[] = 'sc.tier = ?'; $params[] = mcp_enum($args, 'tier', ['basic', 'pro', 'enterprise', 'project_only'], 'basic'); }
            if (!empty($args['project_id'])) { $where[] = 'sc.project_id = ?'; $params[] = trim((string)$args['project_id']); }
            if (!empty($args['client_id'])) { $where[] = 'sc.client_id = ?'; $params[] = trim((string)$args['client_id']); }
            if (!empty($args['active_only'])) {
                $today = mcp_today();
                $where[] = '(sc.valid_from IS NULL OR sc.valid_from <= ?)';
                $where[] = '(sc.valid_until IS NULL OR sc.valid_until >= ?)';
                $params[] = $today;
                $params[] = $today;
            }
            $limit = mcp_limit($args, 50, 100);
            $stmt = $pdo->prepare(
                "SELECT sc.id, sc.tier, sc.project_id, p.name AS project_name, sc.client_id, l.name AS client_name,
                        sc.monthly_hours, sc.hourly_rate,
                        sc.sla_response_critical_hours, sc.sla_response_high_hours, sc.sla_response_normal_hours, sc.sla_response_low_hours,
                        sc.sla_resolve_critical_hours, sc.sla_resolve_high_hours, sc.sla_resolve_normal_hours, sc.sla_resolve_low_hours,
                        sc.valid_from, sc.valid_until, sc.notes
                 FROM support_contracts sc
                 LEFT JOIN projects p ON p.id = sc.project_id
                 LEFT JOIN leads l ON l.id = sc.client_id
                 WHERE " . implode(' AND ', $where) . "
                 ORDER BY sc.created_at DESC LIMIT {$limit}"
            );
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        // ------------------------------------------------------------------
        // ORDERS
        // ------------------------------------------------------------------
        case 'list_orders': {
            $where = ['1=1'];
            $params = [];
            if (!empty($args['type'])) { $where[] = 'o.type = ?'; $params[] = mcp_enum($args, 'type', ['sales', 'purchase'], 'sales'); }
            if (!empty($args['status'])) { $where[] = 'o.status = ?'; $params[] = trim((string)$args['status']); }
            if (!empty($args['payment_status'])) { $where[] = 'o.payment_status = ?'; $params[] = trim((string)$args['payment_status']); }
            if (!empty($args['client_id'])) { $where[] = 'o.client_id = ?'; $params[] = trim((string)$args['client_id']); }
            if ($from = mcp_optional_date($args, 'from')) { $where[] = 'o.order_date >= ?'; $params[] = $from; }
            if ($to = mcp_optional_date($args, 'to')) { $where[] = 'o.order_date <= ?'; $params[] = $to; }
            if (!empty($args['search'])) {
                $q = '%' . trim((string)$args['search']) . '%';
                $where[] = '(o.order_number LIKE ? OR o.guest_name LIKE ? OR o.guest_company LIKE ? OR o.notes LIKE ? OR l.name LIKE ?)';
                array_push($params, $q, $q, $q, $q, $q);
            }
            $limit = mcp_limit($args, 50, 100);
            $stmt = $pdo->prepare(
                "SELECT o.id, o.order_number, o.type, o.status, o.payment_status, o.client_id,
                        COALESCE(l.name, o.guest_company, o.guest_name) AS customer_name,
                        o.currency, o.total_net_amount, o.total_tax_amount, o.total_gross_amount,
                        o.order_date, o.requested_delivery_date, o.confirmed_delivery_date
                 FROM orders o
                 LEFT JOIN leads l ON l.id = o.client_id
                 WHERE " . implode(' AND ', $where) . "
                 ORDER BY o.order_date DESC, o.created_at DESC LIMIT {$limit}"
            );
            $stmt->execute($params);
            return $stmt->fetchAll(\PDO::FETCH_ASSOC);
        }

        case 'get_order': {
            $idOrNum = mcp_require_string($args, 'id');
            $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? OR UPPER(order_number) = UPPER(?) LIMIT 1");
            $stmt->execute([$idOrNum, $idOrNum]);
            $order = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$order) throw new \InvalidArgumentException("Order not found: {$idOrNum}");
            $it = $pdo->prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order ASC");
            $it->execute([$order['id']]);
            $order['items'] = $it->fetchAll(\PDO::FETCH_ASSOC);
            return $order;
        }

        case 'create_order': {
            $type = mcp_enum($args, 'type', ['sales', 'purchase'], 'sales');
            $orderDate = mcp_optional_date($args, 'order_date') ?? mcp_today();
            $reqDelivery = mcp_optional_date($args, 'requested_delivery_date');
            $status = trim((string)($args['status'] ?? 'new')) ?: 'new';
            $payStatus = mcp_enum($args, 'payment_status', ['unpaid', 'partially_paid', 'paid', 'refunded'], 'unpaid');
            $currency = strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo))));
            if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new \InvalidArgumentException("'currency' must be a 3-letter code.");

            $clientId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
            $supplierId = !empty($args['supplier_id']) ? (string)$args['supplier_id'] : null;
            if ($clientId !== null) mcp_row_exists($pdo, 'leads', $clientId, 'Client');
            if ($supplierId !== null) mcp_mod_row_exists($pdo, 'suppliers', $supplierId, 'Supplier');

            $defaultVat = mcp_default_vat_rate($pdo);
            $itemsIn = is_array($args['items'] ?? null) ? $args['items'] : [];
            $lines = [];
            $itemsNet = 0.0; $servicesNet = 0.0; $taxTotal = 0.0;
            foreach ($itemsIn as $i => $item) {
                if (!is_array($item)) throw new \InvalidArgumentException('Each item must be an object.');
                $name = trim((string)($item['name'] ?? $item['title'] ?? ''));
                if ($name === '') throw new \InvalidArgumentException('Item ' . ($i + 1) . ": 'name' is required.");
                $itemType = ($item['item_type'] ?? 'product') === 'service' ? 'service' : 'product';
                $qty = mcp_number(['v' => $item['quantity'] ?? 1], 'v', true, 0.0001, 1000000);
                $price = mcp_number(['v' => $item['unit_price'] ?? 0], 'v', true, 0, 100000000);
                $disc = mcp_number(['v' => $item['discount_percent'] ?? 0], 'v', true, 0, 100);
                $vat = mcp_number(['v' => $item['tax_rate'] ?? $defaultVat], 'v', true, 0, 100);
                $net = round($qty * $price * (1 - $disc / 100), 2);
                $vatAmt = round($net * ($vat / 100), 2);
                $gross = round($net + $vatAmt, 2);
                if ($itemType === 'service') $servicesNet += $net; else $itemsNet += $net;
                $taxTotal += $vatAmt;
                $lines[] = [
                    'item_type' => $itemType, 'item_id' => $item['item_id'] ?? null, 'sku' => $item['sku'] ?? null,
                    'name' => $name, 'qty' => $qty, 'unit' => (string)($item['unit'] ?? 'ks'),
                    'price' => $price, 'disc' => $disc, 'vat' => $vat, 'net' => $net, 'gross' => $gross,
                ];
            }
            $itemsNet = round($itemsNet, 2);
            $servicesNet = round($servicesNet, 2);
            $totalNet = round($itemsNet + $servicesNet, 2);
            $taxTotal = round($taxTotal, 2);
            $totalGross = round($totalNet + $taxTotal, 2);

            $orderId = mcp_new_id('ord_');
            $year = (int)substr($orderDate, 0, 4);
            $docNum = mcp_with_lock($pdo, 'ccrm_order_number', function () use ($pdo, $args, $type, $year, $orderId, $status, $clientId, $supplierId, $payStatus, $currency, $itemsNet, $servicesNet, $totalNet, $taxTotal, $totalGross, $orderDate, $reqDelivery, $user, $lines) {
                if (!empty($args['order_number'])) {
                    $num = trim((string)$args['order_number']);
                    $dup = $pdo->prepare("SELECT 1 FROM orders WHERE order_number = ? LIMIT 1");
                    $dup->execute([$num]);
                    if ($dup->fetchColumn()) throw new \InvalidArgumentException("Order number {$num} already exists.");
                } else {
                    $prefix = ($type === 'purchase' ? 'PO' : 'ORD') . '-' . $year . '-';
                    $seqStmt = $pdo->prepare("SELECT order_number FROM orders WHERE order_number LIKE ?");
                    $seqStmt->execute([$prefix . '%']);
                    $maxSeq = 0;
                    foreach ($seqStmt->fetchAll(\PDO::FETCH_COLUMN) as $existingNum) {
                        if (preg_match('/(\d+)$/', (string)$existingNum, $mm)) {
                            $maxSeq = max($maxSeq, (int)$mm[1]);
                        }
                    }
                    $num = $prefix . str_pad((string)($maxSeq + 1), 4, '0', STR_PAD_LEFT);
                }

                $pdo->prepare(
                    "INSERT INTO orders (id, order_number, type, status, customer_type, client_id, supplier_id,
                                         guest_name, guest_email, guest_phone, payment_method, payment_status,
                                         currency, items_net_amount, services_net_amount, total_net_amount, total_tax_amount, total_gross_amount,
                                         order_date, requested_delivery_date, shipping_method, notes, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )->execute([
                    $orderId, $num, $type, $status, $clientId ? 'client' : 'guest', $clientId, $supplierId,
                    $args['guest_name'] ?? null, $args['guest_email'] ?? null, $args['guest_phone'] ?? null,
                    $args['payment_method'] ?? null, $payStatus, $currency,
                    $itemsNet, $servicesNet, $totalNet, $taxTotal, $totalGross,
                    $orderDate, $reqDelivery, $args['shipping_method'] ?? null, $args['notes'] ?? null, $user['name'],
                ]);

                $insItem = $pdo->prepare(
                    "INSERT INTO order_items (id, order_id, item_type, item_id, sku, name, quantity, unit, unit_price, discount_percent, tax_rate, total_net_amount, total_gross_amount, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                foreach ($lines as $idx => $l) {
                    $insItem->execute([mcp_new_id('oitem_'), $orderId, $l['item_type'], $l['item_id'], $l['sku'], $l['name'], $l['qty'], $l['unit'], $l['price'], $l['disc'], $l['vat'], $l['net'], $l['gross'], $idx]);
                }
                return $num;
            });

            mcp_audit($pdo, $user, 'order_create', "Created order {$docNum} ({$orderId}) total {$totalGross} {$currency}");
            return ['success' => true, 'id' => $orderId, 'order_number' => $docNum, 'status' => $status, 'total_gross_amount' => $totalGross, 'currency' => $currency];
        }

        case 'update_order': {
            $id = mcp_require_string($args, 'id');
            mcp_mod_row_exists($pdo, 'orders', $id, 'Order');
            $sets = [];
            $params = [];
            if (!empty($args['status'])) { $sets[] = 'status = ?'; $params[] = trim((string)$args['status']); }
            if (!empty($args['payment_status'])) {
                $sets[] = 'payment_status = ?';
                $params[] = mcp_enum($args, 'payment_status', ['unpaid', 'partially_paid', 'paid', 'refunded'], 'unpaid');
            }
            if (array_key_exists('paid_at', $args)) {
                $sets[] = 'paid_at = ?';
                $params[] = $args['paid_at'] ? mcp_optional_date($args, 'paid_at') : null;
            }
            if (array_key_exists('payment_reference', $args)) { $sets[] = 'payment_reference = ?'; $params[] = $args['payment_reference']; }
            if (array_key_exists('shipping_method', $args)) { $sets[] = 'shipping_method = ?'; $params[] = $args['shipping_method']; }
            if (array_key_exists('shipping_tracking_number', $args)) { $sets[] = 'shipping_tracking_number = ?'; $params[] = $args['shipping_tracking_number']; }
            if (array_key_exists('confirmed_delivery_date', $args)) {
                $sets[] = 'confirmed_delivery_date = ?';
                $params[] = $args['confirmed_delivery_date'] ? mcp_optional_date($args, 'confirmed_delivery_date') : null;
            }
            if (array_key_exists('notes', $args)) { $sets[] = 'notes = ?'; $params[] = $args['notes']; }
            if (!$sets) throw new \InvalidArgumentException('No updatable fields supplied.');
            $params[] = $id;
            $pdo->prepare('UPDATE orders SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            mcp_audit($pdo, $user, 'order_update', "Updated order {$id}");
            return ['success' => true, 'id' => $id];
        }

        // ------------------------------------------------------------------
        // WEEKLY PLAN
        // ------------------------------------------------------------------
        case 'get_weekly_plan': {
            mcp_mod_ensure_weekly_plan($pdo);
            if (!empty($args['from']) && !empty($args['to'])) {
                $from = mcp_require_date($args, 'from');
                $to = mcp_require_date($args, 'to');
            } else {
                $ref = mcp_optional_date($args, 'date') ?? mcp_today();
                $ts = strtotime($ref . ' 00:00:00 UTC');
                $dow = (int)gmdate('N', $ts); // 1 (Mon) .. 7 (Sun)
                $monTs = $ts - ($dow - 1) * 86400;
                $from = gmdate('Y-m-d', $monTs);
                $to = gmdate('Y-m-d', $monTs + 6 * 86400);
            }
            if ($to < $from) throw new \InvalidArgumentException("'to' cannot be before 'from'.");

            $cStmt = $pdo->prepare("SELECT id, date, content, position, completed, color, refs_json, created_by, updated_at FROM weekly_plan_cards WHERE date >= ? AND date <= ? ORDER BY date ASC, position ASC, created_at ASC");
            $cStmt->execute([$from, $to]);
            $cards = array_map(fn($r) => [
                'id' => $r['id'], 'date' => $r['date'], 'content' => $r['content'],
                'position' => (int)$r['position'], 'completed' => (bool)$r['completed'],
                'color' => $r['color'] ?? '', 'refs' => json_decode((string)($r['refs_json'] ?? '[]'), true) ?: [],
                'created_by' => $r['created_by'],
            ], $cStmt->fetchAll(\PDO::FETCH_ASSOC));

            $nStmt = $pdo->prepare("SELECT date, note FROM weekly_plan_day_notes WHERE date >= ? AND date <= ? ORDER BY date ASC");
            $nStmt->execute([$from, $to]);
            $notes = $nStmt->fetchAll(\PDO::FETCH_KEY_PAIR);

            return ['from' => $from, 'to' => $to, 'cards' => $cards, 'day_notes' => $notes ?: new \stdClass()];
        }

        case 'create_weekly_plan_card': {
            mcp_mod_ensure_weekly_plan($pdo);
            $date = mcp_require_date($args, 'date');
            $content = mcp_require_string($args, 'content');
            $color = trim((string)($args['color'] ?? ''));
            $completed = !empty($args['completed']) ? 1 : 0;
            $refsJson = json_encode(is_array($args['refs'] ?? null) ? array_values($args['refs']) : [], JSON_UNESCAPED_UNICODE);

            if (isset($args['position']) && is_numeric($args['position'])) {
                $pos = (int)$args['position'];
            } else {
                $mx = $pdo->prepare("SELECT COALESCE(MAX(position), -1) + 1 FROM weekly_plan_cards WHERE date = ?");
                $mx->execute([$date]);
                $pos = (int)$mx->fetchColumn();
            }
            $id = mcp_new_id('wpc_');
            $pdo->prepare(
                "INSERT INTO weekly_plan_cards (id, date, content, position, completed, color, refs_json, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([$id, $date, $content, $pos, $completed, $color, $refsJson, $user['id']]);
            mcp_audit($pdo, $user, 'weekly_plan_card_create', "Added weekly plan card {$id} on {$date}");
            return ['success' => true, 'id' => $id, 'date' => $date, 'position' => $pos];
        }

        case 'update_weekly_plan_card': {
            mcp_mod_ensure_weekly_plan($pdo);
            $id = mcp_require_string($args, 'id');
            mcp_mod_row_exists($pdo, 'weekly_plan_cards', $id, 'Weekly plan card');
            $sets = [];
            $params = [];
            if (!empty($args['date'])) { $sets[] = 'date = ?'; $params[] = mcp_require_date($args, 'date'); }
            if (array_key_exists('content', $args)) { $sets[] = 'content = ?'; $params[] = trim((string)$args['content']); }
            if (isset($args['position']) && is_numeric($args['position'])) { $sets[] = 'position = ?'; $params[] = (int)$args['position']; }
            if (array_key_exists('completed', $args)) { $sets[] = 'completed = ?'; $params[] = $args['completed'] ? 1 : 0; }
            if (array_key_exists('color', $args)) { $sets[] = 'color = ?'; $params[] = trim((string)$args['color']); }
            if (array_key_exists('refs', $args)) {
                $sets[] = 'refs_json = ?';
                $params[] = json_encode(is_array($args['refs']) ? array_values($args['refs']) : [], JSON_UNESCAPED_UNICODE);
            }
            if (!$sets) throw new \InvalidArgumentException('No updatable fields supplied.');
            $params[] = $id;
            $pdo->prepare('UPDATE weekly_plan_cards SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            mcp_audit($pdo, $user, 'weekly_plan_card_update', "Updated weekly plan card {$id}");
            return ['success' => true, 'id' => $id];
        }

        case 'set_weekly_plan_day_note': {
            mcp_mod_ensure_weekly_plan($pdo);
            $date = mcp_require_date($args, 'date');
            $note = trim((string)($args['note'] ?? ''));
            $pdo->prepare(
                "INSERT INTO weekly_plan_day_notes (date, note, updated_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE note = VALUES(note), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP"
            )->execute([$date, $note, $user['id']]);
            mcp_audit($pdo, $user, 'weekly_plan_note_set', "Set weekly plan day note for {$date}");
            return ['success' => true, 'date' => $date, 'note' => $note];
        }

        // ------------------------------------------------------------------
        // PRICE OFFERS & RECURRING TASKS
        // ------------------------------------------------------------------
        case 'create_price_offer': {
            $clientId = mcp_require_string($args, 'client_id');
            $title = mcp_require_string($args, 'title');
            $subject = trim((string)($args['subject'] ?? '')) ?: $title;
            $issuedAt = mcp_optional_date($args, 'issued_at') ?? mcp_today();
            $validUntil = mcp_optional_date($args, 'valid_until') ?? mcp_iso_shift($issuedAt, 30);
            if ($validUntil < $issuedAt) throw new \InvalidArgumentException("'valid_until' cannot be before 'issued_at'.");
            $currency = strtoupper(trim((string)($args['currency'] ?? mcp_currency($pdo))));
            if (!preg_match('/^[A-Z]{3}$/', $currency)) throw new \InvalidArgumentException("'currency' must be a 3-letter code.");

            $status = isset($args['status']) && $args['status'] !== '' ? trim((string)$args['status']) : 'draft';
            if (ccrm_offer_status_group($status, $pdo) === null) {
                $keys = array_column(ccrm_offer_status_defs($pdo), 'key');
                throw new \InvalidArgumentException('status must be one of OFFER_STATUSES: ' . implode(', ', $keys));
            }

            $items = $args['items'] ?? null;
            if (!is_array($items) || !$items) throw new \InvalidArgumentException('Price offer must contain at least one line item.');
            if (count($items) > 200) throw new \InvalidArgumentException('A price offer can hold at most 200 line items.');

            $cl = $pdo->prepare("SELECT name, email, phone, street, city, postal_code, country, company_id, tax_id, vat_id FROM leads WHERE id = ?");
            $cl->execute([$clientId]);
            $client = $cl->fetch(\PDO::FETCH_ASSOC);
            if (!$client) throw new \InvalidArgumentException("Client/lead not found: {$clientId}");

            $defaultVat = mcp_default_vat_rate($pdo);
            $lines = []; $subtotal = 0.0; $vatTotal = 0.0;
            foreach ($items as $i => $item) {
                if (!is_array($item)) throw new \InvalidArgumentException('Each item must be an object.');
                $name = trim((string)($item['title'] ?? $item['name'] ?? ''));
                if ($name === '') throw new \InvalidArgumentException('Item ' . ($i + 1) . ": 'title' is required.");
                $qty = mcp_number(['v' => $item['quantity'] ?? 1], 'v', true, 0.0001, 1000000);
                $price = mcp_number(['v' => $item['unit_price'] ?? null], 'v', true, 0, 100000000);
                $vat = mcp_number(['v' => $item['vat_rate'] ?? $defaultVat], 'v', true, 0, 100);
                $disc = mcp_number(['v' => $item['discount_pct'] ?? 0], 'v', true, 0, 100);
                $net = round($qty * $price * (1 - $disc / 100), 2);
                $lines[] = ['name' => $name, 'qty' => $qty, 'price' => $price, 'vat' => $vat, 'disc' => $disc, 'net' => $net];
                $subtotal += $net;
                $vatTotal += $net * ($vat / 100);
            }
            $subtotal = round($subtotal, 2); $vatTotal = round($vatTotal, 2); $total = round($subtotal + $vatTotal, 2);

            $offerId = 'off_' . bin2hex(random_bytes(8));
            $year = (int)substr($issuedAt, 0, 4);
            $docNum = mcp_with_lock($pdo, 'ccrm_offer_number', function () use ($pdo, $user, $args, $clientId, $client, $title, $subject, $status, $issuedAt, $validUntil, $currency, $lines, $subtotal, $vatTotal, $total, $year, $offerId) {
                if (!empty($args['document_number'])) {
                    $num = trim((string)$args['document_number']);
                    $dup = $pdo->prepare("SELECT 1 FROM invoices_offers WHERE document_number = ? LIMIT 1");
                    $dup->execute([$num]);
                    if ($dup->fetchColumn()) throw new \InvalidArgumentException("Document number {$num} is already used.");
                } else {
                    $num = mcp_next_document_number($pdo, 'invoices_offers', 'document_number', 'CP', $year, 3);
                }
                $pdo->prepare(
                    "INSERT INTO invoices_offers (id, document_number, type, mode, lead_id, client_id, client_name, client_email, client_phone, client_street, client_city, client_postal_code, client_country, client_ico, client_dic, client_icdph, title, subject, greeting_note, intro_note, closing_note, subtotal, vat_amount, total_price, currency, status, status_changed_at, issued_at, valid_until, created_by)
                     VALUES (?, ?, 'price_offer', 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )->execute([
                    $offerId, $num, $clientId, $clientId, $client['name'], $client['email'], $client['phone'],
                    $client['street'], $client['city'], $client['postal_code'], $client['country'] ?: 'Slovakia',
                    $client['company_id'], $client['tax_id'], $client['vat_id'],
                    $title, $subject, $args['greeting_note'] ?? null, $args['intro_note'] ?? null, $args['closing_note'] ?? null,
                    $subtotal, $vatTotal, $total, $currency, $status, mcp_today(), $issuedAt, $validUntil, $user['name'],
                ]);
                $ins = $pdo->prepare("INSERT INTO invoice_offer_items (id, invoice_offer_id, name, quantity, unit, unit_price, vat_rate, discount_pct, total_price) VALUES (?, ?, ?, ?, 'ks', ?, ?, ?, ?)");
                foreach ($lines as $l) $ins->execute([mcp_new_id('it_'), $offerId, $l['name'], $l['qty'], $l['price'], $l['vat'], $l['disc'], $l['net']]);
                return $num;
            });

            mcp_audit($pdo, $user, 'price_offer_create', "Created price offer {$docNum} ({$offerId}) for {$client['name']} totaling {$total} {$currency}");
            return ['success' => true, 'id' => $offerId, 'document_number' => $docNum, 'status' => $status, 'total_price' => $total, 'currency' => $currency, 'valid_until' => $validUntil];
        }

        case 'list_recurring_tasks': {
            [$scopeSql, $scopeParams] = mcp_task_scope($user, 't');
            $where = ["t.task_kind = 'recurring'"];
            $params = [];
            if ($scopeSql !== '') { $where[] = $scopeSql; $params = array_merge($params, $scopeParams); }
            if (!empty($args['owner'])) { $where[] = 't.owner = ?'; $params[] = trim((string)$args['owner']); }
            if (!empty($args['search'])) {
                $q = '%' . trim((string)$args['search']) . '%';
                $where[] = '(t.title LIKE ? OR t.description LIKE ?)';
                array_push($params, $q, $q);
            }
            $limit = mcp_limit($args, 50, 100);
            $stmt = $pdo->prepare(
                "SELECT t.id, t.title, t.description, t.priority, t.owner, t.related_project_id, t.related_lead_id, t.recurrence_json
                 FROM tasks t /* recurring-template: mcp lists recurring task templates */
                 WHERE " . implode(' AND ', $where) . "
                 ORDER BY t.title ASC LIMIT {$limit}"
            );
            $stmt->execute($params);
            $out = [];
            $activeOnly = !empty($args['active_only']);
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $rec = json_decode((string)($r['recurrence_json'] ?? '{}'), true) ?: [];
                if ($activeOnly && !empty($rec['paused'])) continue;
                $out[] = [
                    'id' => $r['id'], 'title' => $r['title'], 'description' => $r['description'],
                    'priority' => $r['priority'], 'owner' => $r['owner'],
                    'project_id' => $r['related_project_id'], 'client_id' => $r['related_lead_id'],
                    'recurrence' => $rec,
                    'next_occurrence' => empty($rec['paused']) ? ccrm_recurring_next_occurrence($rec) : null,
                ];
            }
            return $out;
        }

        case 'create_recurring_task': {
            $title = mcp_require_string($args, 'title');
            $freq = mcp_enum($args, 'frequency', ['daily', 'weekly', 'monthly', 'yearly'], 'monthly');
            $priority = mcp_enum($args, 'priority', ['low', 'medium', 'high'], 'medium');
            $owner = !empty($args['owner']) ? mcp_user_exists($pdo, (string)$args['owner']) : $user['name'];
            $projId = !empty($args['project_id']) ? (string)$args['project_id'] : null;
            $leadId = !empty($args['client_id']) ? (string)$args['client_id'] : null;
            if ($projId !== null) mcp_row_exists($pdo, 'projects', $projId, 'Project');
            if ($leadId !== null) mcp_row_exists($pdo, 'leads', $leadId, 'Client/lead');

            $assignees = [$owner];
            if (is_array($args['assignees'] ?? null)) {
                foreach ($args['assignees'] as $a) {
                    if (trim((string)$a) !== '') $assignees[] = mcp_user_exists($pdo, (string)$a);
                }
            }

            $cfg = [];
            if (isset($args['day_of_week'])) $cfg['dayOfWeek'] = (int)$args['day_of_week'];
            if (isset($args['day_of_month'])) { $cfg['monthlyType'] = 'day_of_month'; $cfg['dayOfMonth'] = (int)$args['day_of_month']; }
            if (isset($args['month'])) $cfg['month'] = (int)$args['month'];

            $rec = ccrm_recurring_validate_json([
                'mode' => 'schedule',
                'frequency' => $freq,
                'interval' => (int)($args['interval'] ?? 1),
                'startsOn' => mcp_optional_date($args, 'starts_on') ?? mcp_today(),
                'endsOn' => mcp_optional_date($args, 'ends_on'),
                'weekendRule' => mcp_enum($args, 'weekend_rule', ['keep', 'before', 'after'], 'keep'),
                'leadDays' => $args['lead_days'] ?? null,
                'config' => $cfg,
            ]);

            $states = mcp_config_json($pdo, 'TASK_STATES', []);
            $status = (is_array($states) && $states) ? (string)$states[0] : 'todo';
            $id = 'tsk_rec_' . bin2hex(random_bytes(6));

            mcp_tx($pdo, function () use ($pdo, $id, $title, $args, $priority, $rec, $status, $owner, $user, $projId, $leadId, $assignees) {
                $pdo->prepare(
                    "INSERT INTO tasks (id, title, description, priority, deadline, status, owner, created_by, related_project_id, related_lead_id, task_kind, recurrence_json) /* recurring-template: mcp creates recurring task template */
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recurring', ?)"
                )->execute([
                    $id, $title, $args['description'] ?? null, $priority, $rec['startsOn'], $status,
                    $owner, $user['name'], $projId, $leadId, json_encode($rec, JSON_UNESCAPED_UNICODE),
                ]);
                $ins = $pdo->prepare("INSERT IGNORE INTO task_assignees (task_id, user_name) VALUES (?, ?)");
                foreach (array_unique($assignees) as $a) $ins->execute([$id, $a]);
            });

            ccrm_process_recurring_tasks($pdo, $id);
            mcp_audit($pdo, $user, 'recurring_task_create', "Created recurring task template '{$title}' ({$id}, {$freq})");
            return ['success' => true, 'id' => $id, 'title' => $title, 'recurrence' => $rec];
        }

        default:
            return MCP_NOT_MINE;
    }
}
