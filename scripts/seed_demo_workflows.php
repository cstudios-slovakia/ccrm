<?php
/**
 * Seeds seven demo workflows into Automations & Workflows.
 *
 * They are meant as readable examples of what the builder can do — three
 * simple, two medium, two complex — and together they touch every node type and
 * almost every field the canvas exposes: trigger filters, conditions with both
 * branches, an AI agent, and the actions create lead, create client, create
 * task, send e-mail and convert lead to project.
 *
 * The definitions live in api/demo_seed/workflows.php — the same code the demo
 * installer runs — so this script and a fresh demo install cannot drift. Text
 * follows the instance language.
 *
 * Usage (from the repo root):
 *   php scripts/seed_demo_workflows.php              # seed / refresh, each at its own default
 *   php scripts/seed_demo_workflows.php --active     # seed / refresh, all enabled
 *   php scripts/seed_demo_workflows.php --inactive   # seed / refresh, all disabled
 *   php scripts/seed_demo_workflows.php --remove     # delete them again
 *
 * By default the three workflows that need an AI key or an SMTP server are
 * seeded switched off. Re-running is safe: the workflows have fixed ids
 * ('demo-workflows-N') and are overwritten, never duplicated. The five
 * workflows an older version of this script created ('wf-demo-*') are removed.
 * Lead states, lead sources and users are read from this instance's own settings.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script is CLI only.\n");
}

$root = dirname(__DIR__);
$configFile = $root . '/config.php';
if (!file_exists($configFile)) {
    exit("config.php not found — is the CRM installed?\n");
}
require_once $configFile;
require_once $root . '/api/demo_seed/workflows.php';

$pdo = get_db_connection();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$flags = array_slice($argv, 1);
$remove = in_array('--remove', $flags, true);
$forced = in_array('--inactive', $flags, true) ? 0 : (in_array('--active', $flags, true) ? 1 : null);

// Fixed ids of the current definitions and of the pre-refactor script.
$workflows = demo_workflows_definitions($pdo, demo_lang($pdo));
$ids = array_merge(array_column($workflows, 'id'), ['wf-demo-1-welcome-email', 'wf-demo-2-offer-followup', 'wf-demo-3-phone-enquiry', 'wf-demo-4-ai-triage', 'wf-demo-5-won-onboarding']);
$in = implode(',', array_fill(0, count($ids), '?'));

foreach (['workflow_logs', 'workflow_queue'] as $table) {
    $pdo->prepare("DELETE FROM `$table` WHERE `workflow_id` IN ($in)")->execute($ids);
}
$stmt = $pdo->prepare("DELETE FROM `workflows` WHERE `id` IN ($in)");
$stmt->execute($ids);

if ($remove) {
    echo "Removed {$stmt->rowCount()} demo workflow(s).\n";
    exit(0);
}

demo_workflows_write($pdo, $workflows, $forced);
foreach ($workflows as $wf) {
    $state = $forced ?? (int)$wf['active'];
    printf("  %-18s %-20s %-8s %d nodes / %d edges\n", $wf['id'], $wf['trigger_type'], $state ? 'enabled' : 'disabled', count($wf['nodes']), count($wf['edges']));
}

$states = demo_lead_states($pdo);
echo "\nSeeded " . count($workflows) . " demo workflows.\n";
echo "States used: new=\"{$states['new']}\", offer=\"{$states['offer']}\", won=\"{$states['won']}\".\n";
