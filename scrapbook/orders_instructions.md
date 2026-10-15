# Koperniq CRM (CCRM) — Native E-Shop Orders & Order Items Implementation Guide

> **Target Platform:** Koperniq Core CRM (`CCRM` / `@ccrm/core`)  
> **Status:** Specification & Engineering Blueprint (E-Shop Commercial Orders)  
> **Author:** Architecture Team (in alignment with CERP 1.0 Milestone Roadmap & E-Commerce Module Spec)  
> **Target Files to Modify in CCRM:**
> - `api/schema.php` (DDL & in-place schema migrations for orders, line items, and customizable order statuses)
> - `sync.php` (Bi-directional multi-device offline sync engine)
> - `src/types/index.ts` (TypeScript interfaces, customer types, addresses, services, and status definitions)
> - `src/utils/orders.ts` (Order status helpers, normalization, and default status definitions)
> - `src/hooks/useOrderStatuses.tsx` (React Context provider and hook for customizable order statuses)
> - `src/components/OrderStatusSettings.tsx` (Status management UI in Settings — drag-and-drop, colors, lifecycle groups)
> - `api/orders.php` (RESTful CRUD API handler with guest-to-client converter & status transitions)
> - `src/components/OrdersView.tsx` (React frontend interface for e-shop order management)
> - `src/components/SettingsView.tsx` (Registration of Order Status Settings tab)
> - `src/App.tsx` (Route registration & sidebar/start-menu navigation)

---

## 1. Architectural Motivation & E-Shop Context

In previous versions of Koperniq CRM, sales interactions were primarily tracked via `leads` (deals/pipelines), vendor relationships via `suppliers`, physical stock via `warehouse_items` and `warehouse_movements`, and accounting via `financial_records` and `InvoicingView.tsx`.

However, modern commerce requires an **E-Shop-style Commercial Order Engine** capable of handling both B2B contracts and B2C direct/guest checkouts.

### Key Capabilities Introduced in this Specification:
1. **Registered Client vs. Guest Customer Checkout**:
   - **Registered Client (`customer_type = 'client'`)**: Linked directly to an existing CRM client/lead (`leads.id`). Contact and billing details can be auto-prefilled or customized per order.
   - **Guest Customer (`customer_type = 'guest'`)**: Orders placed by non-registered buyers without polluting CRM client lists. Captures full customer snapshot (`guest_name`, `guest_email`, `guest_phone`, `guest_company`, `guest_ico`, `guest_dic`, `guest_ic_dph`).
   - **1-Click Guest-to-Client Conversion**: Built-in CRM action to convert a guest customer into a permanent CRM client with order history attached.
2. **Complete Delivery & Billing Address Separation**:
   - **Delivery / Shipping Address**: Full recipient contact details, street, city, ZIP, country, carrier/courier service (DPD, Packeta/Zásielkovňa, GLS, Slovak Post, Personal Pickup), pickup-box ID, package tracking number, and delivery instructions for couriers.
   - **Billing Address**: Complete billing details with support for B2B company identification (IČO, DIČ, IČ DPH / VAT ID).
3. **Products & Additional Services (Line Item Differentiation)**:
   - **Products (`item_type = 'product'`)**: Physical or digital stock items linked to `warehouse_items`. Affects stock reservations and automatic warehouse dispatch (`warehouse_movements` - Výdajka).
   - **Additional Services (`item_type = 'service'`)**: Supplementary commercial services (e.g. Courier shipping fee, Cash on delivery surcharge, Gift packaging, White-glove assembly, Shipping insurance). Carries prices and tax rates for invoicing, but *does not* deplete physical warehouse inventory.
4. **Customizable Order States (`OrderStatusDef`)**:
   - Modeled identically to **Project Statuses** (`ProjectStatusSettings.tsx`) and **Lead Pipeline Stages** in `SettingsView.tsx`.
   - Admin-configurable in Settings: custom status labels, color pickers, and lifecycle group classification (`new`, `processing`, `shipped`, `delivered`, `cancelled`).
   - Drag-and-drop reordering, terminal state flags, and automatic reassignment of existing orders when deleting a status.
5. **Omnichannel E-Commerce Ready**:
   - Clean REST API (`api/orders.php`) allows seamless ingestion of orders from external e-commerce platforms (WooCommerce, Shopify, custom e-shops) directly into CCRM.

---

## 2. Database Schema DDL (`api/schema.php`)

Add the following table definitions and system settings migration to `ccrm_schema_statements()` and `ccrm_apply_migrations()` in `api/schema.php`.

### 2.1 `orders` Table Definition
```php
// Orders (E-shop a komerčné objednávky - Prijaté od odberateľov / Vystavené dodávateľom)
"CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(100) NOT NULL UNIQUE,
  `type` ENUM('sales', 'purchase') NOT NULL DEFAULT 'sales' COMMENT 'sales = Prijatá od zákazníka/eshop, purchase = Objednávka dodávateľovi',
  `status` VARCHAR(50) NOT NULL DEFAULT 'new' COMMENT 'Customizable status key from orderStatuses setting (e.g. new, processing, shipped, delivered, cancelled)',
  
  -- Customer Attachment (Registered Client vs. Guest)
  `customer_type` ENUM('client', 'guest') NOT NULL DEFAULT 'client' COMMENT 'client = registrovaný klient v CRM (leads.id), guest = nákup bez registrácie',
  `client_id` VARCHAR(50) NULL COMMENT 'References leads.id for registered sales clients',
  `supplier_id` VARCHAR(50) NULL COMMENT 'References suppliers.id for purchase orders',
  
  -- Guest Customer Snapshot (Used when customer_type = 'guest')
  `guest_name` VARCHAR(255) NULL COMMENT 'Meno a priezvisko hosťa / kontaktná osoba',
  `guest_email` VARCHAR(255) NULL COMMENT 'Notifikačný e-mail pre sledovanie objednávky',
  `guest_phone` VARCHAR(50) NULL COMMENT 'Telefónne číslo pre kuriéra',
  `guest_company` VARCHAR(255) NULL COMMENT 'Názov firmy pri B2B nákupe hosťa',
  `guest_ico` VARCHAR(50) NULL COMMENT 'IČO firmy hosťa',
  `guest_dic` VARCHAR(50) NULL COMMENT 'DIČ firmy hosťa',
  `guest_ic_dph` VARCHAR(50) NULL COMMENT 'IČ DPH firmy hosťa',
  
  -- Delivery / Shipping Address
  `delivery_recipient` VARCHAR(255) NULL COMMENT 'Meno príjemcu balíka / kontaktná osoba na adrese',
  `delivery_street` VARCHAR(255) NULL COMMENT 'Ulica a súpisné/orientačné číslo',
  `delivery_city` VARCHAR(100) NULL COMMENT 'Mesto',
  `delivery_zip` VARCHAR(20) NULL COMMENT 'PSČ',
  `delivery_country` VARCHAR(10) NOT NULL DEFAULT 'SK' COMMENT 'Kód krajiny doručenia (SK, CZ, AT, DE...)',
  `delivery_phone` VARCHAR(50) NULL COMMENT 'Telefón na doručovaciu adresu pre vodiča',
  `delivery_notes` TEXT NULL COMMENT 'Poznámka k doručeniu (napr. poschodie, kód brány, nechať u susedov)',
  `shipping_method` VARCHAR(100) NULL COMMENT 'Spôsob dopravy (napr. dpd_courier, packeta_box, gls, osobny_odber)',
  `shipping_pickup_point_id` VARCHAR(100) NULL COMMENT 'ID výdajného miesta / Z-Boxu (Packeta, DPD Pickup Box atď.)',
  `shipping_tracking_number` VARCHAR(100) NULL COMMENT 'Sledovacie číslo zásielky (Tracking Code / URL)',
  
  -- Billing Address
  `billing_name` VARCHAR(255) NULL COMMENT 'Fakturačné meno alebo názov spoločnosti',
  `billing_street` VARCHAR(255) NULL COMMENT 'Fakturačná ulica a číslo',
  `billing_city` VARCHAR(100) NULL COMMENT 'Fakturačné mesto',
  `billing_zip` VARCHAR(20) NULL COMMENT 'Fakturačné PSČ',
  `billing_country` VARCHAR(10) NOT NULL DEFAULT 'SK' COMMENT 'Fakturačná krajina',
  `billing_ico` VARCHAR(50) NULL COMMENT 'Fakturačné IČO',
  `billing_dic` VARCHAR(50) NULL COMMENT 'Fakturačné DIČ',
  `billing_ic_dph` VARCHAR(50) NULL COMMENT 'Fakturačné IČ DPH',
  
  -- Payment Details
  `payment_method` VARCHAR(100) NULL COMMENT 'Spôsob platby (napr. card_online, bank_transfer, cod_dobierka, cash)',
  `payment_status` ENUM('unpaid', 'paid', 'partially_paid', 'refunded') NOT NULL DEFAULT 'unpaid',
  `paid_at` DATETIME NULL COMMENT 'Čas úhrady objednávky',
  `payment_reference` VARCHAR(100) NULL COMMENT 'Variabilný symbol / Transakčné ID platobnej brány',
  
  -- Financial Totals
  `currency` VARCHAR(10) NOT NULL DEFAULT 'EUR',
  `items_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Medzisúčet za fyzické produkty bez DPH',
  `services_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Medzisúčet za doplnkové služby (doprava, dobierka, balné...) bez DPH',
  `total_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Celková suma bez DPH',
  `total_tax_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Celková suma DPH',
  `total_gross_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Celková suma s DPH k úhrade',
  
  -- Operational Details & Tracking
  `order_date` DATE NOT NULL,
  `requested_delivery_date` DATE NULL,
  `confirmed_delivery_date` DATE NULL,
  `warehouse_id` VARCHAR(50) NULL COMMENT 'Cieľový sklad pre vyskladnenie tovaru',
  `notes` TEXT NULL COMMENT 'Interná poznámka tímu CCRM',
  `customer_note` TEXT NULL COMMENT 'Poznámka od zákazníka z pokladne',
  `created_by` VARCHAR(100) NULL COMMENT 'Meno používateľa alebo \'E-Shop API\'',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX `idx_orders_type_status` (`type`, `status`),
  INDEX `idx_orders_customer_type` (`customer_type`),
  INDEX `idx_orders_client` (`client_id`),
  INDEX `idx_orders_supplier` (`supplier_id`),
  INDEX `idx_orders_date` (`order_date`),
  INDEX `idx_orders_payment_status` (`payment_status`),
  INDEX `idx_orders_tracking` (`shipping_tracking_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
```

### 2.2 `order_items` Table Definition (Products & Additional Services)
```php
// Order Items (Položky objednávky: Produkty a Doplnkové služby)
"CREATE TABLE IF NOT EXISTS `order_items` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `order_id` VARCHAR(50) NOT NULL,
  `item_type` ENUM('product', 'service') NOT NULL DEFAULT 'product' COMMENT 'product = tovar zo skladu, service = doplnková služba (doprava, platba, montáž...)',
  `item_id` VARCHAR(50) NULL COMMENT 'References warehouse_items.id for products; NULL for standalone services',
  `sku` VARCHAR(100) NULL COMMENT 'Katalógové číslo / kód tovaru',
  `ean` VARCHAR(50) NULL COMMENT 'Čiarový kód / EAN',
  `name` VARCHAR(255) NOT NULL COMMENT 'Názov produktu alebo služby',
  `variant_title` VARCHAR(100) NULL COMMENT 'Napr. Veľkosť L / Modrá alebo Darčekové balenie',
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'ks',
  `unit_price` DECIMAL(15,4) NOT NULL DEFAULT 0.0000 COMMENT 'Cena za jednotku bez DPH',
  `discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 20.00 COMMENT 'Sadzba DPH v %',
  `total_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_gross_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `fulfilled_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Už vyskladnené množstvo do výdajky',
  `service_code` VARCHAR(50) NULL COMMENT 'Kód služby, napr. SHIPPING_DPD, PAYMENT_COD, GIFT_WRAP, INSTALLATION',
  `notes` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  INDEX `idx_order_items_order` (`order_id`),
  INDEX `idx_order_items_item` (`item_id`),
  INDEX `idx_order_items_type` (`item_type`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
```

### 2.3 In-Place Schema Migrations Hook (`ccrm_apply_migrations`)
In `ccrm_apply_migrations($pdo)` inside `api/schema.php`, dynamically check and add missing columns to avoid broken upgrades:

```php
// 1. Create tables if not existing
if ($pdo->query("SHOW TABLES LIKE 'orders'")->rowCount() === 0) {
    $statements = ccrm_schema_statements();
    foreach ($statements as $stmt) {
        if (strpos($stmt, '`orders`') !== false || strpos($stmt, '`order_items`') !== false) {
            $pdo->exec($stmt);
        }
    }
} else {
    // 2. Add e-shop columns if upgrading from prior version
    $orderCols = $pdo->query("SHOW COLUMNS FROM `orders`")->fetchAll(PDO::FETCH_COLUMN);
    $neededCols = [
        'customer_type' => "ALTER TABLE `orders` ADD COLUMN `customer_type` ENUM('client', 'guest') NOT NULL DEFAULT 'client' AFTER `status`",
        'guest_name' => "ALTER TABLE `orders` ADD COLUMN `guest_name` VARCHAR(255) NULL AFTER `supplier_id`",
        'guest_email' => "ALTER TABLE `orders` ADD COLUMN `guest_email` VARCHAR(255) NULL AFTER `guest_name`",
        'guest_phone' => "ALTER TABLE `orders` ADD COLUMN `guest_phone` VARCHAR(50) NULL AFTER `guest_email`",
        'guest_company' => "ALTER TABLE `orders` ADD COLUMN `guest_company` VARCHAR(255) NULL AFTER `guest_phone`",
        'guest_ico' => "ALTER TABLE `orders` ADD COLUMN `guest_ico` VARCHAR(50) NULL AFTER `guest_company`",
        'guest_dic' => "ALTER TABLE `orders` ADD COLUMN `guest_dic` VARCHAR(50) NULL AFTER `guest_ico`",
        'guest_ic_dph' => "ALTER TABLE `orders` ADD COLUMN `guest_ic_dph` VARCHAR(50) NULL AFTER `guest_dic`",
        'delivery_recipient' => "ALTER TABLE `orders` ADD COLUMN `delivery_recipient` VARCHAR(255) NULL AFTER `guest_ic_dph`",
        'delivery_street' => "ALTER TABLE `orders` ADD COLUMN `delivery_street` VARCHAR(255) NULL AFTER `delivery_recipient`",
        'delivery_city' => "ALTER TABLE `orders` ADD COLUMN `delivery_city` VARCHAR(100) NULL AFTER `delivery_street`",
        'delivery_zip' => "ALTER TABLE `orders` ADD COLUMN `delivery_zip` VARCHAR(20) NULL AFTER `delivery_city`",
        'delivery_country' => "ALTER TABLE `orders` ADD COLUMN `delivery_country` VARCHAR(10) NOT NULL DEFAULT 'SK' AFTER `delivery_zip`",
        'delivery_phone' => "ALTER TABLE `orders` ADD COLUMN `delivery_phone` VARCHAR(50) NULL AFTER `delivery_country`",
        'delivery_notes' => "ALTER TABLE `orders` ADD COLUMN `delivery_notes` TEXT NULL AFTER `delivery_phone`",
        'shipping_method' => "ALTER TABLE `orders` ADD COLUMN `shipping_method` VARCHAR(100) NULL AFTER `delivery_notes`",
        'shipping_pickup_point_id' => "ALTER TABLE `orders` ADD COLUMN `shipping_pickup_point_id` VARCHAR(100) NULL AFTER `shipping_method`",
        'shipping_tracking_number' => "ALTER TABLE `orders` ADD COLUMN `shipping_tracking_number` VARCHAR(100) NULL AFTER `shipping_pickup_point_id`",
        'billing_name' => "ALTER TABLE `orders` ADD COLUMN `billing_name` VARCHAR(255) NULL AFTER `shipping_tracking_number`",
        'billing_street' => "ALTER TABLE `orders` ADD COLUMN `billing_street` VARCHAR(255) NULL AFTER `billing_name`",
        'billing_city' => "ALTER TABLE `orders` ADD COLUMN `billing_city` VARCHAR(100) NULL AFTER `billing_street`",
        'billing_zip' => "ALTER TABLE `orders` ADD COLUMN `billing_zip` VARCHAR(20) NULL AFTER `billing_city`",
        'billing_country' => "ALTER TABLE `orders` ADD COLUMN `billing_country` VARCHAR(10) NOT NULL DEFAULT 'SK' AFTER `billing_zip`",
        'billing_ico' => "ALTER TABLE `orders` ADD COLUMN `billing_ico` VARCHAR(50) NULL AFTER `billing_country`",
        'billing_dic' => "ALTER TABLE `orders` ADD COLUMN `billing_dic` VARCHAR(50) NULL AFTER `billing_ico`",
        'billing_ic_dph' => "ALTER TABLE `orders` ADD COLUMN `billing_ic_dph` VARCHAR(50) NULL AFTER `billing_dic`",
        'payment_method' => "ALTER TABLE `orders` ADD COLUMN `payment_method` VARCHAR(100) NULL AFTER `billing_ic_dph`",
        'payment_status' => "ALTER TABLE `orders` ADD COLUMN `payment_status` ENUM('unpaid', 'paid', 'partially_paid', 'refunded') NOT NULL DEFAULT 'unpaid' AFTER `payment_method`",
        'paid_at' => "ALTER TABLE `orders` ADD COLUMN `paid_at` DATETIME NULL AFTER `payment_status`",
        'payment_reference' => "ALTER TABLE `orders` ADD COLUMN `payment_reference` VARCHAR(100) NULL AFTER `paid_at`",
        'items_net_amount' => "ALTER TABLE `orders` ADD COLUMN `items_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `currency`",
        'services_net_amount' => "ALTER TABLE `orders` ADD COLUMN `services_net_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `items_net_amount`",
        'customer_note' => "ALTER TABLE `orders` ADD COLUMN `customer_note` TEXT NULL AFTER `notes`"
    ];
    foreach ($neededCols as $col => $sql) {
        if (!in_array($col, $orderCols)) {
            $pdo->exec($sql);
        }
    }

    $itemCols = $pdo->query("SHOW COLUMNS FROM `order_items`")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('item_type', $itemCols)) {
        $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `item_type` ENUM('product', 'service') NOT NULL DEFAULT 'product' AFTER `order_id`");
    }
    if (!in_array('ean', $itemCols)) {
        $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `ean` VARCHAR(50) NULL AFTER `sku`");
    }
    if (!in_array('variant_title', $itemCols)) {
        $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `variant_title` VARCHAR(100) NULL AFTER `name`");
    }
    if (!in_array('service_code', $itemCols)) {
        $pdo->exec("ALTER TABLE `order_items` ADD COLUMN `service_code` VARCHAR(50) NULL AFTER `fulfilled_quantity`");
    }
}
```

---

## 3. Order Status Architecture & Settings Editor

Order states in CCRM must be **customizable, reorderable, and translated**, following the proven architectural design of `ProjectStatusSettings.tsx` and the Lead Pipeline stages in `SettingsView.tsx`.

### 3.1 Order Status Groups & Definitions (`src/utils/orders.ts`)
Create `src/utils/orders.ts`:

```typescript
import type { Language } from "./translations";

export type OrderStatusGroup = "new" | "processing" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_GROUPS: readonly OrderStatusGroup[] = [
  "new",
  "processing",
  "shipped",
  "delivered",
  "cancelled"
];

export interface OrderStatusDef {
  key: string;
  label?: string; // Custom label, or falls back to built-in translation
  color: string;
  group: OrderStatusGroup;
  isTerminal?: boolean; // True for delivered or cancelled
}

/** Built-in status translations (EN / SK / HU) */
export const BUILTIN_ORDER_STATUS_LABELS: Record<string, [string, string, string]> = {
  new: ["New Order", "Nová objednávka", "Új rendelés"],
  awaiting_payment: ["Awaiting Payment", "Čaká na úhradu", "Fizetésre vár"],
  processing: ["Processing", "Pripravuje sa", "Feldolgozás alatt"],
  in_packing: ["In Packing", "Balí sa", "Csomagolás alatt"],
  ready_to_ship: ["Ready to Ship", "Pripravená na expedíciu", "Szállításra kész"],
  shipped: ["Shipped", "Odoslaná / V preprave", "Kiszállítva / Úton"],
  delivered: ["Delivered", "Doručená / Vybavená", "Kézbesítve / Teljesítve"],
  cancelled: ["Cancelled", "Stornovaná", "Törölve"],
  returned: ["Returned / Claim", "Vrátená / Reklamácia", "Visszaküldve / Reklamáció"]
};

/** Default e-shop order statuses */
export const DEFAULT_ORDER_STATUS_DEFS: readonly OrderStatusDef[] = [
  { key: "new", color: "#0ea5e9", group: "new" },
  { key: "awaiting_payment", color: "#f59e0b", group: "new" },
  { key: "processing", color: "#8b5cf6", group: "processing" },
  { key: "in_packing", color: "#a855f7", group: "processing" },
  { key: "ready_to_ship", color: "#06b6d4", group: "processing" },
  { key: "shipped", color: "#3b82f6", group: "shipped" },
  { key: "delivered", color: "#10b981", group: "delivered", isTerminal: true },
  { key: "cancelled", color: "#f43f5e", group: "cancelled", isTerminal: true },
  { key: "returned", color: "#ef4444", group: "cancelled", isTerminal: true }
];

export const defaultOrderStatus = (defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS): string =>
  defs.find((d) => d.group === "new")?.key ?? "new";

export const orderStatusLabel = (
  key: string,
  t: (en: string, sk: string, hu: string) => string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): string => {
  const match = defs.find((d) => d.key === key);
  if (match?.label?.trim()) return match.label.trim();
  const builtin = BUILTIN_ORDER_STATUS_LABELS[key];
  if (builtin) return t(builtin[0], builtin[1], builtin[2]);
  return key;
};

export const orderStatusColor = (
  key: string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): string => defs.find((d) => d.key === key)?.color ?? "#94a3b8";

export const isTerminalOrderStatus = (
  key: string,
  defs: readonly OrderStatusDef[] = DEFAULT_ORDER_STATUS_DEFS
): boolean => {
  const match = defs.find((d) => d.key === key);
  return match?.isTerminal ?? (match?.group === "delivered" || match?.group === "cancelled");
};

export const normalizeOrderStatusDefs = (raw: unknown): OrderStatusDef[] => {
  const defaults = () => DEFAULT_ORDER_STATUS_DEFS.map((d) => ({ ...d }));
  if (!Array.isArray(raw)) return defaults();
  const seen = new Set<string>();
  const out: OrderStatusDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const builtin = DEFAULT_ORDER_STATUS_DEFS.find((d) => d.key === key);
    const color = typeof rec.color === "string" && /^#[0-9a-f]{6}$/i.test(rec.color)
      ? rec.color
      : builtin?.color ?? "#6366f1";
    const group = (ORDER_STATUS_GROUPS as readonly string[]).includes(String(rec.group))
      ? (rec.group as OrderStatusGroup)
      : builtin?.group ?? "processing";
    const label = String(rec.label ?? "").trim();
    const isTerminal = Boolean(rec.isTerminal ?? builtin?.isTerminal ?? false);
    out.push({ key, color, group, isTerminal, ...(label ? { label } : {}) });
  }
  if (!out.some((d) => d.group === "new")) return defaults();
  return ORDER_STATUS_GROUPS.flatMap((g) => out.filter((d) => d.group === g));
};
```

### 3.2 Live Context Hook (`src/hooks/useOrderStatuses.tsx`)
Create `src/hooks/useOrderStatuses.tsx`:

```tsx
import { createContext, useContext } from "react";
import { DEFAULT_ORDER_STATUS_DEFS, type OrderStatusDef } from "../utils/orders";

const OrderStatusesContext = createContext<readonly OrderStatusDef[]>(DEFAULT_ORDER_STATUS_DEFS);

export const OrderStatusesProvider = OrderStatusesContext.Provider;
export const useOrderStatuses = (): readonly OrderStatusDef[] => useContext(OrderStatusesContext);
```

### 3.3 Status Editor in Settings (`src/components/OrderStatusSettings.tsx`)
Create `src/components/OrderStatusSettings.tsx` to mirror `ProjectStatusSettings.tsx`:
- Render status cards grouped into sections:
  - 🔵 **Nové (New)**: `new`, `awaiting_payment`
  - 🟣 **Spracovanie & Príprava (Processing)**: `processing`, `in_packing`, `ready_to_ship`
  - 🚚 **V preprave (Shipped)**: `shipped`
  - 🟢 **Doručené (Delivered)**: `delivered`
  - 🔴 **Storno & Reklamácie (Cancelled / Returned)**: `cancelled`, `returned`
- Provide inline name editing with `InlineRenameName.tsx`.
- Provide color selection with `ColorPicker.tsx`.
- Enable drag-and-drop between lifecycle groups.
- Safe deletion modal with reassignment dropdown: *"Presunúť existujúce objednávky v tomto stave do stavu: [ ... ]"*.

---

## 4. Multi-Device Sync Engine (`sync.php`)

To support multi-device offline-first synchronization across CCRM web instances, register both tables and ensure full column coverage.

### 4.1 Candidate Entity Registration
In `sync.php`, add `'orders'` and `'order_items'` to the `$candidates` array:

```php
$candidates = [
    'leads', 'timeline_events', 'lead_categories', 'tasks', 'task_assignees',
    'tags', 'task_tags', 'users', 'roles', 'meeting_notes', 'meeting_tasks',
    'unified_entries', 'system_settings', 'project_types', 'projects',
    'project_managers', 'warehouses', 'suppliers', 'warehouse_items',
    'warehouse_stock', 'warehouse_batches', 'warehouse_movements',
    'warehouse_movement_items', 'financial_categories', 'client_categories',
    'financial_records', 'invoices_offers', 'invoice_offer_items',
    'ai_custom_templates', 'employees', 'employee_salaries', 'employee_vacations',
    'orders', 'order_items' // <-- E-Shop Orders Engine
];
```

### 4.2 Server Pull Handler
```php
if ($pdo->query("SHOW TABLES LIKE 'orders'")->rowCount() > 0) {
    $orderStmt = $pdo->query("SELECT * FROM `orders` ORDER BY `order_date` DESC, `created_at` DESC LIMIT 1000");
    $data['orders'] = $orderStmt->fetchAll(PDO::FETCH_ASSOC);
}
if ($pdo->query("SHOW TABLES LIKE 'order_items'")->rowCount() > 0) {
    $itemStmt = $pdo->query("SELECT * FROM `order_items` ORDER BY `sort_order` ASC");
    $data['order_items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
}
```

### 4.3 Server Push (Upsert) Handlers
```php
// Orders Push Upsert
if (isset($payload['orders']) && is_array($payload['orders'])) {
    $insOrder = $pdo->prepare("
        INSERT INTO `orders` (
            `id`, `order_number`, `type`, `status`, `customer_type`, `client_id`, `supplier_id`,
            `guest_name`, `guest_email`, `guest_phone`, `guest_company`, `guest_ico`, `guest_dic`, `guest_ic_dph`,
            `delivery_recipient`, `delivery_street`, `delivery_city`, `delivery_zip`, `delivery_country`, `delivery_phone`, `delivery_notes`,
            `shipping_method`, `shipping_pickup_point_id`, `shipping_tracking_number`,
            `billing_name`, `billing_street`, `billing_city`, `billing_zip`, `billing_country`, `billing_ico`, `billing_dic`, `billing_ic_dph`,
            `payment_method`, `payment_status`, `paid_at`, `payment_reference`,
            `currency`, `items_net_amount`, `services_net_amount`, `total_net_amount`, `total_tax_amount`, `total_gross_amount`,
            `order_date`, `requested_delivery_date`, `confirmed_delivery_date`, `warehouse_id`, `notes`, `customer_note`, `created_by`
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
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
    foreach ($payload['orders'] as $ord) {
        $insOrder->execute([
            $ord['id'], $ord['order_number'], $ord['type'] ?? 'sales', $ord['status'] ?? 'new',
            $ord['customer_type'] ?? 'client', $ord['client_id'] ?? null, $ord['supplier_id'] ?? null,
            $ord['guest_name'] ?? null, $ord['guest_email'] ?? null, $ord['guest_phone'] ?? null,
            $ord['guest_company'] ?? null, $ord['guest_ico'] ?? null, $ord['guest_dic'] ?? null, $ord['guest_ic_dph'] ?? null,
            $ord['delivery_recipient'] ?? null, $ord['delivery_street'] ?? null, $ord['delivery_city'] ?? null,
            $ord['delivery_zip'] ?? null, $ord['delivery_country'] ?? 'SK', $ord['delivery_phone'] ?? null, $ord['delivery_notes'] ?? null,
            $ord['shipping_method'] ?? null, $ord['shipping_pickup_point_id'] ?? null, $ord['shipping_tracking_number'] ?? null,
            $ord['billing_name'] ?? null, $ord['billing_street'] ?? null, $ord['billing_city'] ?? null,
            $ord['billing_zip'] ?? null, $ord['billing_country'] ?? 'SK', $ord['billing_ico'] ?? null, $ord['billing_dic'] ?? null, $ord['billing_ic_dph'] ?? null,
            $ord['payment_method'] ?? null, $ord['payment_status'] ?? 'unpaid', $ord['paid_at'] ?? null, $ord['payment_reference'] ?? null,
            $ord['currency'] ?? 'EUR', $ord['items_net_amount'] ?? 0.00, $ord['services_net_amount'] ?? 0.00,
            $ord['total_net_amount'] ?? 0.00, $ord['total_tax_amount'] ?? 0.00, $ord['total_gross_amount'] ?? 0.00,
            $ord['order_date'], $ord['requested_delivery_date'] ?? null, $ord['confirmed_delivery_date'] ?? null,
            $ord['warehouse_id'] ?? null, $ord['notes'] ?? null, $ord['customer_note'] ?? null, $ord['created_by'] ?? null
        ]);
    }
}

// Order Items Push Upsert
if (isset($payload['order_items']) && is_array($payload['order_items'])) {
    $insItem = $pdo->prepare("
        INSERT INTO `order_items` (
            `id`, `order_id`, `item_type`, `item_id`, `sku`, `ean`, `name`, `variant_title`,
            `quantity`, `unit`, `unit_price`, `discount_percent`, `tax_rate`,
            `total_net_amount`, `total_gross_amount`, `fulfilled_quantity`, `service_code`, `notes`, `sort_order`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            `order_id` = VALUES(`order_id`),
            `item_type` = VALUES(`item_type`),
            `item_id` = VALUES(`item_id`),
            `sku` = VALUES(`sku`),
            `ean` = VALUES(`ean`),
            `name` = VALUES(`name`),
            `variant_title` = VALUES(`variant_title`),
            `quantity` = VALUES(`quantity`),
            `unit` = VALUES(`unit`),
            `unit_price` = VALUES(`unit_price`),
            `discount_percent` = VALUES(`discount_percent`),
            `tax_rate` = VALUES(`tax_rate`),
            `total_net_amount` = VALUES(`total_net_amount`),
            `total_gross_amount` = VALUES(`total_gross_amount`),
            `fulfilled_quantity` = VALUES(`fulfilled_quantity`),
            `service_code` = VALUES(`service_code`),
            `notes` = VALUES(`notes`),
            `sort_order` = VALUES(`sort_order`)
    ");
    foreach ($payload['order_items'] as $item) {
        $insItem->execute([
            $item['id'], $item['order_id'], $item['item_type'] ?? 'product', $item['item_id'] ?? null,
            $item['sku'] ?? null, $item['ean'] ?? null, $item['name'], $item['variant_title'] ?? null,
            $item['quantity'] ?? 1.00, $item['unit'] ?? 'ks', $item['unit_price'] ?? 0.0000,
            $item['discount_percent'] ?? 0.00, $item['tax_rate'] ?? 20.00,
            $item['total_net_amount'] ?? 0.00, $item['total_gross_amount'] ?? 0.00,
            $item['fulfilled_quantity'] ?? 0.00, $item['service_code'] ?? null, $item['notes'] ?? null, $item['sort_order'] ?? 0
        ]);
    }
}
```

---

## 5. TypeScript Domain Models (`src/types/index.ts`)

Add the following interfaces and types to `src/types/index.ts`:

```typescript
export type OrderType = 'sales' | 'purchase';
export type CustomerType = 'client' | 'guest';
export type OrderPaymentStatus = 'unpaid' | 'paid' | 'partially_paid' | 'refunded';
export type OrderItemType = 'product' | 'service';

export interface DeliveryAddress {
  recipient?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country: string;
  phone?: string | null;
  notes?: string | null;
}

export interface BillingAddress {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country: string;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
}

export interface GuestCustomer {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  ico?: string | null;
  dic?: string | null;
  icDph?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemType: OrderItemType; // 'product' vs 'service'
  itemId?: string | null;  // References WarehouseItem.id for physical products
  sku?: string | null;
  ean?: string | null;
  name: string;
  variantTitle?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;       // Net price per unit
  discountPercent: number;
  taxRate: number;         // e.g. 20 for 20% DPH
  totalNetAmount: number;
  totalGrossAmount: number;
  fulfilledQuantity: number;
  serviceCode?: string | null; // e.g. 'SHIPPING_DPD', 'PAYMENT_COD'
  notes?: string | null;
  sortOrder: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: string; // Dynamically matched against OrderStatusDef.key
  
  // Customer Attachment
  customerType: CustomerType;
  clientId?: string | null;   // References Lead.id for registered sales clients
  supplierId?: string | null; // References Supplier.id for purchase orders
  guest?: GuestCustomer;
  
  // Delivery & Billing
  delivery: DeliveryAddress;
  shippingMethod?: string | null;
  shippingPickupPointId?: string | null;
  shippingTrackingNumber?: string | null;
  
  billing: BillingAddress;
  paymentMethod?: string | null;
  paymentStatus: OrderPaymentStatus;
  paidAt?: string | null;
  paymentReference?: string | null;
  
  // Financial Totals
  currency: string;
  itemsNetAmount: number;     // Physical goods net subtotal
  servicesNetAmount: number;  // Additional services net subtotal
  totalNetAmount: number;     // Total net
  totalTaxAmount: number;     // Total VAT
  totalGrossAmount: number;   // Total gross to pay
  
  // Schedule & Operations
  orderDate: string;          // YYYY-MM-DD
  requestedDeliveryDate?: string | null;
  confirmedDeliveryDate?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
  customerNote?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  
  items?: OrderItem[];
}
```

---

## 6. REST API Endpoint & Guest-to-Client Converter (`api/orders.php`)

Create `api/orders.php` to handle direct CRUD operations, automated status transitions, and converting guest orders into full CRM client accounts:

```php
<?php
/**
 * E-Shop & Commercial Orders REST API Endpoint
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

$user = ccrm_require_auth();
$pdo = ccrm_get_db();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;

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
            if ($search) {
                $sql .= " AND (`order_number` LIKE ? OR `guest_name` LIKE ? OR `guest_email` LIKE ? OR `billing_name` LIKE ?)";
                $wildcard = "%$search%";
                $params[] = $wildcard; $params[] = $wildcard; $params[] = $wildcard; $params[] = $wildcard;
            }
            $sql .= " ORDER BY `order_date` DESC, `created_at` DESC LIMIT 200";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            echo json_encode(['orders' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        }
        break;

    case 'POST':
        // Action: 1-Click Convert Guest Customer to CRM Client Profile
        if ($action === 'convert_guest_to_client') {
            $input = json_decode(file_get_contents('php://input'), true);
            $orderId = $input['order_id'] ?? null;
            if (!$orderId) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing order_id']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT * FROM `orders` WHERE `id` = ?");
            $stmt->execute([$orderId]);
            $ord = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$ord || $ord['customer_type'] !== 'guest') {
                http_response_code(400);
                echo json_encode(['error' => 'Order is not a guest order']);
                exit;
            }
            
            $newClientId = 'lead_' . bin2hex(random_bytes(10));
            $companyName = !empty($ord['billing_name']) ? $ord['billing_name'] : (!empty($ord['guest_company']) ? $ord['guest_company'] : $ord['guest_name']);
            
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
                    $ord['guest_name'],
                    $ord['guest_email'],
                    $ord['guest_phone'],
                    $ord['billing_ico'] ?: $ord['guest_ico'],
                    $ord['billing_dic'] ?: $ord['guest_dic'],
                    $ord['billing_ic_dph'] ?: $ord['guest_ic_dph'],
                    $ord['billing_street'] ?: $ord['delivery_street'],
                    $ord['billing_city'] ?: $ord['delivery_city'],
                    $ord['billing_zip'] ?: $ord['delivery_zip'],
                    $ord['billing_country'] ?: $ord['delivery_country']
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
        $input = json_decode(file_get_contents('php://input'), true);
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
                    `currency`, `items_net_amount`, `services_net_amount`, `total_net_amount`, `total_tax_amount`, `total_gross_amount`,
                    `order_date`, `requested_delivery_date`, `confirmed_delivery_date`, `warehouse_id`, `notes`, `customer_note`, `created_by`
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
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
                $id, $input['order_number'], $input['type'] ?? 'sales', $input['status'] ?? 'new',
                $input['customer_type'] ?? 'client', $input['client_id'] ?? null, $input['supplier_id'] ?? null,
                $input['guest_name'] ?? null, $input['guest_email'] ?? null, $input['guest_phone'] ?? null,
                $input['guest_company'] ?? null, $input['guest_ico'] ?? null, $input['guest_dic'] ?? null, $input['guest_ic_dph'] ?? null,
                $input['delivery_recipient'] ?? null, $input['delivery_street'] ?? null, $input['delivery_city'] ?? null,
                $input['delivery_zip'] ?? null, $input['delivery_country'] ?? 'SK', $input['delivery_phone'] ?? null, $input['delivery_notes'] ?? null,
                $input['shipping_method'] ?? null, $input['shipping_pickup_point_id'] ?? null, $input['shipping_tracking_number'] ?? null,
                $input['billing_name'] ?? null, $input['billing_street'] ?? null, $input['billing_city'] ?? null,
                $input['billing_zip'] ?? null, $input['billing_country'] ?? 'SK', $input['billing_ico'] ?? null, $input['billing_dic'] ?? null, $input['billing_ic_dph'] ?? null,
                $input['payment_method'] ?? null, $input['payment_status'] ?? 'unpaid', $input['paid_at'] ?? null, $input['payment_reference'] ?? null,
                $input['currency'] ?? 'EUR', $input['items_net_amount'] ?? 0.00, $input['services_net_amount'] ?? 0.00,
                $input['total_net_amount'] ?? 0.00, $input['total_tax_amount'] ?? 0.00, $input['total_gross_amount'] ?? 0.00,
                $input['order_date'], $input['requested_delivery_date'] ?? null, $input['confirmed_delivery_date'] ?? null,
                $input['warehouse_id'] ?? null, $input['notes'] ?? null, $input['customer_note'] ?? null, $user['name'] ?? 'System'
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
                        $itemId, $id, $item['item_type'] ?? 'product', $item['item_id'] ?? null,
                        $item['sku'] ?? null, $item['ean'] ?? null, $item['name'], $item['variant_title'] ?? null,
                        $item['quantity'] ?? 1.00, $item['unit'] ?? 'ks', $item['unit_price'] ?? 0.0000,
                        $item['discount_percent'] ?? 0.00, $item['tax_rate'] ?? 20.00,
                        $item['total_net_amount'] ?? 0.00, $item['total_gross_amount'] ?? 0.00,
                        $item['fulfilled_quantity'] ?? 0.00, $item['service_code'] ?? null, $item['notes'] ?? null, $sort++
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
```

---

## 7. Frontend Interface & UI Blueprint (`src/components/OrdersView.tsx`)

### 7.1 View Structure & Navigation
1. **Header Toolbar**:
   - Status Tabs: *Všetky*, *Nové*, *Vo výrobe / Balenie*, *Odoslané*, *Doručené*, *Storno*.
   - Filter switches: *Registrovaní klienti* vs. *Hostia (Guest)*, *Zaplatené* vs. *Nezaplatené*.
   - Search: Instant multi-field diacritic-insensitive search across order number, client name, email, phone, street, and tracking code.
   - Action Button: *"Nová objednávka"* modal wizard.
2. **Order Detail Card**:
   - **Customer Card**:
     - If `customer_type === 'client'`: shows client company name, badge `[Klient]`, with a clickable link opening the client drawer in `LeadsDatagrid`.
     - If `customer_type === 'guest'`: shows guest name, badge `[Hosť / E-shop]`, and a button **"Vytvoriť klienta z hosťa"** which calls the 1-click conversion endpoint.
   - **Delivery Address Block**:
     - Recipient name, street, city, ZIP, country.
     - Shipping method badge (e.g. `[Packeta Z-Box #4812]` or `[DPD Kuriér]`).
     - Courier tracking link with 1-click copy button.
     - Delivery instructions / door code note for the driver.
   - **Billing & Payment Block**:
     - Billing name, address, IČO, DIČ, IČ DPH.
     - Payment badge: `[Zaplatené]` (emerald) vs `[Čaká na úhradu]` (amber), payment method, and variable symbol.
   - **Line Items Breakdown**:
     - **Products Table**: SKU, product name, variant title, warehouse inventory badge, unit price, qty, tax, total.
     - **Additional Services Table**: Shipping fee, payment surcharge, gift packing, assembly, unit price, tax, total.
     - **Financial Summary Equation**: `Produkty (€) + Doplnkové služby (€) + DPH (€) = Celkom s DPH (€)`.
3. **Interactive Status Pipeline**:
   - Horizontal pipeline stepper (styled like `projectPipelineSegments`) reflecting the user-configured `orderStatuses`.
   - 1-click status advancement button (e.g. `Posunúť do: Pripravuje sa` $\rightarrow$ `Balí sa` $\rightarrow$ `Odoslaná`).
4. **Action Conversions**:
   - **"Vyskladniť produkty (Výdajka)"**: Automatically generates a warehouse movement of type `issue` solely for items where `item_type === 'product'`, without touching service lines.
   - **"Vystaviť faktúru"**: Prepopulates an invoice in `InvoicingView.tsx` with all product and service line items, recipient VAT details, and payment reference.

---

## 8. Summary Checklist for CCRM Developers
- [ ] Execute `api/schema.php` migrations for `orders` and `order_items` e-shop fields.
- [ ] Add `'orders'` and `'order_items'` to `$candidates` in `sync.php`.
- [ ] Implement `src/utils/orders.ts` with customizable order status definitions and normalization.
- [ ] Implement `src/hooks/useOrderStatuses.tsx` context provider.
- [ ] Implement `src/components/OrderStatusSettings.tsx` and wire it into `SettingsView.tsx`.
- [ ] Implement `src/types/index.ts` interfaces (`Order`, `OrderItem`, `DeliveryAddress`, `BillingAddress`, `GuestCustomer`).
- [ ] Deploy `api/orders.php` with guest-to-client conversion action.
- [ ] Build `src/components/OrdersView.tsx` with registered client vs guest handling, delivery address block, and products vs additional services tables.
- [ ] Register `OrdersView` in `src/App.tsx` and add to sidebar navigation.
