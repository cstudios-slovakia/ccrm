<?php
/**
 * E-Shop & Commercial Orders REST API Endpoint
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/schema.php';

header('Content-Type: application/json; charset=utf-8');
ccrm_send_cors('GET, POST, DELETE, OPTIONS');

if (php_sapi_name() !== 'cli') {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit(0);
    }
    $user = ccrm_require_auth();
} else {
    $user = ['id' => 'cli', 'email' => 'cli@localhost'];
}

$configFile = dirname(__DIR__) . '/config.php';
if (!file_exists($configFile)) {
    $configFile = dirname(__DIR__, 2) . '/config.php';
}
if (file_exists($configFile)) {
    require_once $configFile;
}

try {
    $pdo = function_exists('get_db_connection') ? get_db_connection() : ccrm_auth_pdo();
    if (!$pdo) {
        throw new Exception("Database connection unavailable.");
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// Ensure schema is up to date
ccrm_apply_migrations($pdo);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? null;

// Permission gate (same rules as sync.php): reading needs `orders`, writing needs
// edit on it, deleting needs the delete right on top. Turning a guest order into a
// client also creates a lead row, so it needs edit on `clients` as well. The CLI
// path (cron / maintenance) has no session and is not gated.
if (php_sapi_name() !== 'cli') {
    require_once __DIR__ . '/read_scope.php';
    $ordersScope = ccrm_read_scope($pdo, $user);
    $ordersDeny = function (string $message): void {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden', 'message' => $message]);
        exit;
    };
    if ($method === 'GET') {
        if (!ccrm_can($ordersScope, 'orders')) {
            $ordersDeny("Permission 'orders' required.");
        }
    } elseif ($method === 'POST' || $method === 'DELETE') {
        if (!ccrm_can($ordersScope, 'orders', 'edit')) {
            $ordersDeny("Permission 'orders' at level 'edit' required.");
        }
        if ($method === 'DELETE' && empty($ordersScope['isAdmin'])
            && empty(ccrm_perm_module($ordersScope['permissions'] ?? [], 'orders')['delete'])) {
            $ordersDeny("Permission 'orders.delete' required.");
        }
        if ($method === 'POST' && $action === 'convert_guest_to_client' && !ccrm_can($ordersScope, 'clients', 'edit')) {
            $ordersDeny("Permission 'clients' at level 'edit' required.");
        }
    }
}

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = $pdo->prepare("SELECT * FROM `orders` WHERE `id` = ?");
            $stmt->execute([$_GET['id']]);
            $order = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$order) {
                http_response_code(404);
                echo json_encode(['error' => 'Order not found']);
                exit;
            }
            $itemStmt = $pdo->prepare("SELECT * FROM `order_items` WHERE `order_id` = ? ORDER BY `sort_order` ASC");
            $itemStmt->execute([$order['id']]);
            $order['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['order' => $order]);
        } else {
            $type = $_GET['type'] ?? null;
            $status = $_GET['status'] ?? null;
            $customerType = $_GET['customer_type'] ?? null;
            $clientId = $_GET['client_id'] ?? null;
            $search = $_GET['search'] ?? null;

            $sql = "SELECT * FROM `orders` WHERE 1=1";
            $params = [];
            if ($type) {
                $sql .= " AND `type` = ?";
                $params[] = $type;
            }
            if ($status) {
                $sql .= " AND `status` = ?";
                $params[] = $status;
            }
            if ($customerType) {
                $sql .= " AND `customer_type` = ?";
                $params[] = $customerType;
            }
            if ($clientId) {
                $sql .= " AND `client_id` = ?";
                $params[] = $clientId;
            }
            if ($search) {
                $sql .= " AND (`order_number` LIKE ? OR `guest_name` LIKE ? OR `guest_email` LIKE ? OR `billing_name` LIKE ? OR `shipping_tracking_number` LIKE ?)";
                $wildcard = "%$search%";
                $params[] = $wildcard;
                $params[] = $wildcard;
                $params[] = $wildcard;
                $params[] = $wildcard;
                $params[] = $wildcard;
            }
            $sql .= " ORDER BY `order_date` DESC, `created_at` DESC LIMIT 200";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Optionally attach items if requested
            if (isset($_GET['with_items']) && $_GET['with_items'] === '1' && !empty($orders)) {
                $orderIds = array_column($orders, 'id');
                $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
                $itemStmt = $pdo->prepare("SELECT * FROM `order_items` WHERE `order_id` IN ($placeholders) ORDER BY `sort_order` ASC");
                $itemStmt->execute($orderIds);
                $itemsByOrder = [];
                while ($row = $itemStmt->fetch(PDO::FETCH_ASSOC)) {
                    $itemsByOrder[$row['order_id']][] = $row;
                }
                foreach ($orders as &$ord) {
                    $ord['items'] = $itemsByOrder[$ord['id']] ?? [];
                }
                unset($ord);
            }

            echo json_encode(['orders' => $orders]);
        }
        break;

    case 'POST':
        // Action: 1-Click Convert Guest Customer to CRM Client Profile
        if ($action === 'convert_guest_to_client') {
            $rawInput = file_get_contents('php://input');
            $input = json_decode($rawInput, true);
            $orderId = $input['order_id'] ?? null;
            if (!$orderId) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing order_id']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT * FROM `orders` WHERE `id` = ?");
            $stmt->execute([$orderId]);
            $ord = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ord || ($ord['customer_type'] ?? '') !== 'guest') {
                http_response_code(400);
                echo json_encode(['error' => 'Order is not a guest order']);
                exit;
            }

            $newClientId = 'lead_' . bin2hex(random_bytes(10));
            $companyName = !empty($ord['billing_name'])
                ? $ord['billing_name']
                : (!empty($ord['guest_company']) ? $ord['guest_company'] : (!empty($ord['guest_name']) ? $ord['guest_name'] : 'Nový zákazník'));

            $pdo->beginTransaction();
            try {
                // Insert into leads table as a client
                $insLead = $pdo->prepare("
                    INSERT INTO `leads` (
                        `id`, `company`, `contact_person`, `email`, `phone`, `ico`, `dic`, `ic_dph`,
                        `street`, `city`, `zip`, `country`, `status`, `created_at`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Zákazník', NOW())
                ");
                $insLead->execute([
                    $newClientId,
                    $companyName,
                    $ord['guest_name'] ?? null,
                    $ord['guest_email'] ?? null,
                    $ord['guest_phone'] ?? null,
                    $ord['billing_ico'] ?: ($ord['guest_ico'] ?? null),
                    $ord['billing_dic'] ?: ($ord['guest_dic'] ?? null),
                    $ord['billing_ic_dph'] ?: ($ord['guest_ic_dph'] ?? null),
                    $ord['billing_street'] ?: ($ord['delivery_street'] ?? null),
                    $ord['billing_city'] ?: ($ord['delivery_city'] ?? null),
                    $ord['billing_zip'] ?: ($ord['delivery_zip'] ?? null),
                    $ord['billing_country'] ?: ($ord['delivery_country'] ?? 'SK')
                ]);

                // Link order to the newly created client
                $updateOrder = $pdo->prepare("UPDATE `orders` SET `customer_type` = 'client', `client_id` = ? WHERE `id` = ?");
                $updateOrder->execute([$newClientId, $orderId]);

                $pdo->commit();
                echo json_encode(['success' => true, 'client_id' => $newClientId]);
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['error' => $e->getMessage()]);
            }
            exit;
        }

        // Action: Upsert Order & Line Items
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true);
        if (!$input || empty($input['order_number']) || empty($input['order_date'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields: order_number, order_date']);
            exit;
        }

        $id = $input['id'] ?? ('ord_' . bin2hex(random_bytes(10)));
        $pdo->beginTransaction();
        try {
            $upsert = $pdo->prepare("
                INSERT INTO `orders` (
                    `id`, `order_number`, `type`, `status`, `customer_type`, `client_id`, `supplier_id`,
                    `guest_name`, `guest_email`, `guest_phone`, `guest_company`, `guest_ico`, `guest_dic`, `guest_ic_dph`,
                    `delivery_recipient`, `delivery_street`, `delivery_city`, `delivery_zip`, `delivery_country`, `delivery_phone`, `delivery_notes`,
                    `shipping_method`, `shipping_pickup_point_id`, `shipping_tracking_number`,
                    `billing_name`, `billing_street`, `billing_city`, `billing_zip`, `billing_country`, `billing_ico`, `billing_dic`, `billing_ic_dph`,
                    `payment_method`, `payment_status`, `paid_at`, `payment_reference`,
                    `invoice_id`, `invoice_number`, `invoice_issued_at`,
                    `currency`, `items_net_amount`, `services_net_amount`, `total_net_amount`, `total_tax_amount`, `total_gross_amount`,
                    `order_date`, `requested_delivery_date`, `confirmed_delivery_date`, `warehouse_id`, `notes`, `customer_note`, `created_by`
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?
                )
                ON DUPLICATE KEY UPDATE
                    `order_number` = VALUES(`order_number`),
                    `type` = VALUES(`type`),
                    `status` = VALUES(`status`),
                    `customer_type` = VALUES(`customer_type`),
                    `client_id` = VALUES(`client_id`),
                    `supplier_id` = VALUES(`supplier_id`),
                    `guest_name` = VALUES(`guest_name`),
                    `guest_email` = VALUES(`guest_email`),
                    `guest_phone` = VALUES(`guest_phone`),
                    `guest_company` = VALUES(`guest_company`),
                    `guest_ico` = VALUES(`guest_ico`),
                    `guest_dic` = VALUES(`guest_dic`),
                    `guest_ic_dph` = VALUES(`guest_ic_dph`),
                    `delivery_recipient` = VALUES(`delivery_recipient`),
                    `delivery_street` = VALUES(`delivery_street`),
                    `delivery_city` = VALUES(`delivery_city`),
                    `delivery_zip` = VALUES(`delivery_zip`),
                    `delivery_country` = VALUES(`delivery_country`),
                    `delivery_phone` = VALUES(`delivery_phone`),
                    `delivery_notes` = VALUES(`delivery_notes`),
                    `shipping_method` = VALUES(`shipping_method`),
                    `shipping_pickup_point_id` = VALUES(`shipping_pickup_point_id`),
                    `shipping_tracking_number` = VALUES(`shipping_tracking_number`),
                    `billing_name` = VALUES(`billing_name`),
                    `billing_street` = VALUES(`billing_street`),
                    `billing_city` = VALUES(`billing_city`),
                    `billing_zip` = VALUES(`billing_zip`),
                    `billing_country` = VALUES(`billing_country`),
                    `billing_ico` = VALUES(`billing_ico`),
                    `billing_dic` = VALUES(`billing_dic`),
                    `billing_ic_dph` = VALUES(`billing_ic_dph`),
                    `payment_method` = VALUES(`payment_method`),
                    `payment_status` = VALUES(`payment_status`),
                    `paid_at` = VALUES(`paid_at`),
                    `payment_reference` = VALUES(`payment_reference`),
                    `invoice_id` = VALUES(`invoice_id`),
                    `invoice_number` = VALUES(`invoice_number`),
                    `invoice_issued_at` = VALUES(`invoice_issued_at`),
                    `currency` = VALUES(`currency`),
                    `items_net_amount` = VALUES(`items_net_amount`),
                    `services_net_amount` = VALUES(`services_net_amount`),
                    `total_net_amount` = VALUES(`total_net_amount`),
                    `total_tax_amount` = VALUES(`total_tax_amount`),
                    `total_gross_amount` = VALUES(`total_gross_amount`),
                    `order_date` = VALUES(`order_date`),
                    `requested_delivery_date` = VALUES(`requested_delivery_date`),
                    `confirmed_delivery_date` = VALUES(`confirmed_delivery_date`),
                    `warehouse_id` = VALUES(`warehouse_id`),
                    `notes` = VALUES(`notes`),
                    `customer_note` = VALUES(`customer_note`)
            ");
            $upsert->execute([
                $id,
                $input['order_number'],
                $input['type'] ?? 'sales',
                $input['status'] ?? 'new',
                $input['customer_type'] ?? 'client',
                $input['client_id'] ?? null,
                $input['supplier_id'] ?? null,
                $input['guest_name'] ?? null,
                $input['guest_email'] ?? null,
                $input['guest_phone'] ?? null,
                $input['guest_company'] ?? null,
                $input['guest_ico'] ?? null,
                $input['guest_dic'] ?? null,
                $input['guest_ic_dph'] ?? null,
                $input['delivery_recipient'] ?? null,
                $input['delivery_street'] ?? null,
                $input['delivery_city'] ?? null,
                $input['delivery_zip'] ?? null,
                $input['delivery_country'] ?? 'SK',
                $input['delivery_phone'] ?? null,
                $input['delivery_notes'] ?? null,
                $input['shipping_method'] ?? null,
                $input['shipping_pickup_point_id'] ?? null,
                $input['shipping_tracking_number'] ?? null,
                $input['billing_name'] ?? null,
                $input['billing_street'] ?? null,
                $input['billing_city'] ?? null,
                $input['billing_zip'] ?? null,
                $input['billing_country'] ?? 'SK',
                $input['billing_ico'] ?? null,
                $input['billing_dic'] ?? null,
                $input['billing_ic_dph'] ?? null,
                $input['payment_method'] ?? null,
                $input['payment_status'] ?? 'unpaid',
                $input['paid_at'] ?? null,
                $input['payment_reference'] ?? null,
                $input['invoice_id'] ?? $input['invoiceId'] ?? null,
                $input['invoice_number'] ?? $input['invoiceNumber'] ?? null,
                $input['invoice_issued_at'] ?? $input['invoiceIssuedAt'] ?? null,
                $input['currency'] ?? 'EUR',
                $input['items_net_amount'] ?? 0.00,
                $input['services_net_amount'] ?? 0.00,
                $input['total_net_amount'] ?? 0.00,
                $input['total_tax_amount'] ?? 0.00,
                $input['total_gross_amount'] ?? 0.00,
                $input['order_date'],
                $input['requested_delivery_date'] ?? null,
                $input['confirmed_delivery_date'] ?? null,
                $input['warehouse_id'] ?? null,
                $input['notes'] ?? null,
                $input['customer_note'] ?? null,
                $user['name'] ?? ($user['email'] ?? 'System')
            ]);

            // Replace line items
            if (isset($input['items']) && is_array($input['items'])) {
                $del = $pdo->prepare("DELETE FROM `order_items` WHERE `order_id` = ?");
                $del->execute([$id]);

                $insItem = $pdo->prepare("
                    INSERT INTO `order_items` (
                        `id`, `order_id`, `item_type`, `item_id`, `sku`, `ean`, `name`, `variant_title`,
                        `quantity`, `unit`, `unit_price`, `discount_percent`, `tax_rate`,
                        `total_net_amount`, `total_gross_amount`, `fulfilled_quantity`, `service_code`, `notes`, `sort_order`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $sort = 0;
                foreach ($input['items'] as $item) {
                    $itemId = $item['id'] ?? ('item_' . bin2hex(random_bytes(10)));
                    $insItem->execute([
                        $itemId,
                        $id,
                        $item['item_type'] ?? 'product',
                        $item['item_id'] ?? null,
                        $item['sku'] ?? null,
                        $item['ean'] ?? null,
                        $item['name'] ?? '',
                        $item['variant_title'] ?? null,
                        $item['quantity'] ?? 1.00,
                        $item['unit'] ?? 'ks',
                        $item['unit_price'] ?? 0.0000,
                        $item['discount_percent'] ?? 0.00,
                        $item['tax_rate'] ?? 20.00,
                        $item['total_net_amount'] ?? 0.00,
                        $item['total_gross_amount'] ?? 0.00,
                        $item['fulfilled_quantity'] ?? 0.00,
                        $item['service_code'] ?? null,
                        $item['notes'] ?? null,
                        $sort++
                    ]);
                }
            }

            $pdo->commit();
            echo json_encode(['success' => true, 'id' => $id]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            exit;
        }
        $del = $pdo->prepare("DELETE FROM `orders` WHERE `id` = ?");
        $del->execute([$id]);
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        break;
}
