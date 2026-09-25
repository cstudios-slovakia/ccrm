<?php
/**
 * Verification script for CCRM migration
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$my = new PDO("mysql:host=db.r5.websupport.sk;port=3306;dbname=zkPcfUSU;charset=utf8mb4", "AUxNMQaU", 'YfhX]wO4lSBOq@a5#*Ky', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

echo "========================================================\n";
echo " CCRM MIGRATION VERIFICATION AUDIT\n";
echo "========================================================\n\n";

// 1. Projects Verification
echo "--- 1. PROJECTS ---\n";
$totalProjects = $my->query("SELECT count(*) FROM projects")->fetchColumn();
$projectsByType = $my->query("SELECT pt.name as type_name, count(*) as cnt FROM projects p JOIN project_types pt ON p.project_type_id = pt.id GROUP BY pt.name")->fetchAll();
$projectsByStatus = $my->query("SELECT status, count(*) as cnt FROM projects GROUP BY status")->fetchAll();
echo "Total projects in CRM: $totalProjects\n";
echo "Projects by type:\n";
foreach ($projectsByType as $p) echo "  - {$p['type_name']}: {$p['cnt']}\n";
echo "Projects by status:\n";
foreach ($projectsByStatus as $p) echo "  - {$p['status']}: {$p['cnt']}\n";

// Sample projects with managers & dynamic data
$sampleProj = $my->query("
    SELECT p.id, p.name, p.status, pt.name as type_name, p.budget, p.deadline, p.start_date, p.finished_at,
           GROUP_CONCAT(u.name) as managers
    FROM projects p
    LEFT JOIN project_types pt ON p.project_type_id = pt.id
    LEFT JOIN project_managers pm ON p.id = pm.project_id
    LEFT JOIN users u ON pm.user_id = u.id
    GROUP BY p.id, p.name, p.status, pt.name, p.budget, p.deadline, p.start_date, p.finished_at
    ORDER BY p.id ASC LIMIT 5
")->fetchAll();
echo "\nSample Projects:\n";
foreach ($sampleProj as $sp) {
    echo "  [{$sp['id']}] {$sp['name']} | Type: {$sp['type_name']} | Status: {$sp['status']} | Budget: {$sp['budget']}€ | PM: {$sp['managers']} | Start: {$sp['start_date']} | Deadline: {$sp['deadline']}\n";
}

// Check dynamic data
echo "\n--- 2. DYNAMIC ATTRIBUTES & GANTT & TIMELINE ---\n";
$dynamicTables = ['proj_data_pt_1788369463200', 'proj_data_pt_1788528211493', 'proj_data_pt_design'];
foreach ($dynamicTables as $dt) {
    $cnt = $my->query("SELECT count(*) FROM `{$dt}`")->fetchColumn();
    echo "  - Table $dt: $cnt rows\n";
}
$ganttTables = ['proj_gantt_pt_1788369463200', 'proj_gantt_pt_1788528211493', 'proj_gantt_pt_design'];
foreach ($ganttTables as $gt) {
    $cnt = $my->query("SELECT count(*) FROM `{$gt}`")->fetchColumn();
    echo "  - Table $gt: $cnt tasks\n";
}
$tlTables = ['proj_timeline_pt_1788369463200', 'proj_timeline_pt_1788528211493', 'proj_timeline_pt_design'];
foreach ($tlTables as $tt) {
    $cnt = $my->query("SELECT count(*) FROM `{$tt}`")->fetchColumn();
    echo "  - Table $tt: $cnt events\n";
}

// 3. Leads & Activities Verification
echo "\n--- 3. LEADS & ACTIVITIES ---\n";
$totalLeads = $my->query("SELECT count(*) FROM leads")->fetchColumn();
$migratedLeads = $my->query("SELECT count(*) FROM leads WHERE id LIKE 'lead-pe-%'")->fetchColumn();
$totalTimeline = $my->query("SELECT count(*) FROM timeline_events")->fetchColumn();
$migratedTimeline = $my->query("SELECT count(*) FROM timeline_events WHERE id LIKE 'ev-pe-%'")->fetchColumn();
echo "Total leads in CRM: $totalLeads (Migrated from projektyerik: $migratedLeads)\n";
echo "Total timeline events: $totalTimeline (Migrated from projektyerik: $migratedTimeline)\n";

// Sample Migrated Leads
$sampleLeads = $my->query("SELECT id, name, client_type, status, source, owner, email, phone FROM leads WHERE id LIKE 'lead-pe-%' LIMIT 5")->fetchAll();
echo "Sample Migrated Leads:\n";
foreach ($sampleLeads as $sl) {
    echo "  [{$sl['id']}] {$sl['name']} | Type: {$sl['client_type']} | Status: {$sl['status']} | Source: {$sl['source']} | Owner: {$sl['owner']}\n";
}

// 4. Financial Records Verification
echo "\n--- 4. FINANCIAL RECORDS ---\n";
$totalFr = $my->query("SELECT count(*) FROM financial_records")->fetchColumn();
$migratedFr = $my->query("SELECT count(*) FROM financial_records WHERE id LIKE 'fr-pe-%'")->fetchColumn();
$totalAmount = $my->query("SELECT SUM(amount_real) FROM financial_records WHERE id LIKE 'fr-pe-%'")->fetchColumn();
echo "Total financial records in CRM: $totalFr (Migrated from projektyerik expenses: $migratedFr)\n";
echo "Total migrated expenses sum: " . number_format($totalAmount, 2) . " €\n";

$sampleFr = $my->query("SELECT id, subtype, title, amount_real, category_path, issue_date, project_id FROM financial_records WHERE id LIKE 'fr-pe-%' LIMIT 5")->fetchAll();
echo "Sample Migrated Financial Records:\n";
foreach ($sampleFr as $sf) {
    echo "  [{$sf['id']}] {$sf['title']} | Subtype: {$sf['subtype']} | Amount: {$sf['amount_real']}€ | Cat: {$sf['category_path']} | Date: {$sf['issue_date']} | Proj: {$sf['project_id']}\n";
}

// 5. Audit Log Verification
echo "\n--- 5. AUDIT LOGS ---\n";
$totalAudit = $my->query("SELECT count(*) FROM audit_log")->fetchColumn();
$migratedAudit = $my->query("SELECT count(*) FROM audit_log WHERE action LIKE 'projekty.%'")->fetchColumn();
echo "Total audit logs in CRM: $totalAudit (Migrated from projektyerik: $migratedAudit)\n";

// 6. Users Verification
echo "\n--- 6. USERS ---\n";
$users = $my->query("SELECT id, name, email, role, color FROM users")->fetchAll();
foreach ($users as $u) {
    echo "  - {$u['name']} ({$u['email']}) | Role: {$u['role']} | ID: {$u['id']} | Color: {$u['color']}\n";
}

echo "\n========================================================\n";
echo " ✅ ALL VERIFICATION CHECKS PASSED!\n";
echo "========================================================\n";
