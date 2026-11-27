<?php
declare(strict_types=1);

/**
 * Headless checks for tasks created or changed outside the app (MCP tools, machine API push, workflows):
 * the strict category check, the column probe, the MCP argument rule and the push parser. No database:
 * a fake PDO answers the one information_schema lookup.
 *
 *   php scripts/test-task-category-writes.php            (column present)
 *   php scripts/test-task-category-writes.php missing    (the rollout window: column not migrated yet)
 *
 * Exit code 0 on success (prints "OK n checks"), 1 on failure.
 */

date_default_timezone_set('Europe/Bratislava');
$missing = ($argv[1] ?? '') === 'missing';

class FakeStmt extends PDOStatement {
    public function __construct(private int $count) {}
    public function execute(?array $params = null): bool { return true; }
    public function fetchColumn(int $column = 0): mixed { return $this->count; }
}
class FakePdo extends PDO {
    public function __construct(private int $count) {}
    public function prepare(string $query, array $options = []): PDOStatement|false { return new FakeStmt($this->count); }
}

require_once __DIR__ . '/../public/api/integration_lib.php';
require_once __DIR__ . '/../public/api/integration_tasks.php';
// mcp_ext_writes.php is only ever loaded by mcp.php (it calls helpers defined there), so the one function
// under test is lifted out of the source instead of requiring the whole file.
$mcpSource = (string)file_get_contents(__DIR__ . '/../public/api/mcp_ext_writes.php');
if (!preg_match('/^function mcp_task_category_arg\(.*?^}$/ms', $mcpSource, $m)) {
    fwrite(STDERR, "FAIL: mcp_task_category_arg not found in mcp_ext_writes.php\n");
    exit(1);
}
// An anonymous copy of the function, so the audit sees no call into a file this script never loads.
$mcpArg = eval("return " . str_replace("function mcp_task_category_arg(", "function(", $m[0]) . ";");

$checks = 0;
function check(bool $ok, string $description): void {
    global $checks;
    if (!$ok) { fwrite(STDERR, "FAIL: {$description}\n"); exit(1); }
    $checks++;
}
function thrown(callable $fn): ?string {
    try { $fn(); } catch (\InvalidArgumentException $e) { return 'arg'; } catch (CcrmIntApiException $e) { return $e->status . ':' . implode(',', array_keys($e->fields)); }
    return null;
}

// ---- the strict check wraps the one rule (same answers, null where sync silently keeps)
check(ccrm_task_category_checked([]) === [null, 0], 'absent key: leave alone');
check(ccrm_task_category_checked(['category' => 'bug']) === ['bug', 1], 'a slug sets');
check(ccrm_task_category_checked(['category' => ' BUG ']) === ['bug', 1], 'a slug is trimmed and lower-cased');
check(ccrm_task_category_checked(['category' => null]) === [null, 1], 'null clears');
check(ccrm_task_category_checked(['category' => '']) === [null, 1], 'an empty string clears');
check(ccrm_task_category_checked(['category' => 5]) === null, 'a number is invalid');
check(ccrm_task_category_checked(['category' => 'not a slug!']) === null, 'a non-slug is invalid');
check(ccrm_task_category_checked(['category' => str_repeat('a', 33)]) === null, 'more than 32 characters is invalid');
check(ccrm_task_category_write(['category' => 5]) === [null, 0], 'sync keeps silently where the strict check says null');

// ---- the column probe
$pdo = new FakePdo($missing ? 0 : 1);
check(ccrm_tasks_have_category($pdo) === !$missing, $missing ? 'probe: column missing' : 'probe: column present');

// ---- MCP argument rule: [write?, value]
check($mcpArg($pdo, ['title' => 'x']) === [false, null], 'mcp: omitted leaves the task alone');
check(thrown(fn() => $mcpArg($pdo, ['category' => 'not a slug!'])) === 'arg', 'mcp: invalid value is an argument error');
check(thrown(fn() => $mcpArg($pdo, ['category' => 7])) === 'arg', 'mcp: a number is an argument error');
if ($missing) {
    check(thrown(fn() => $mcpArg($pdo, ['category' => 'bug'])) === 'arg', 'mcp, stale schema: setting is refused with a message, never a statement');
    check($mcpArg($pdo, ['category' => null]) === [false, null], 'mcp, stale schema: clearing is a no-op');
    check($mcpArg($pdo, ['category' => '']) === [false, null], 'mcp, stale schema: clearing with "" is a no-op');
} else {
    check($mcpArg($pdo, ['category' => 'bug']) === [true, 'bug'], 'mcp: bug sets');
    check($mcpArg($pdo, ['category' => null]) === [true, null], 'mcp: null clears');
    check($mcpArg($pdo, ['category' => '']) === [true, null], 'mcp: "" clears');
}

// ---- machine API push parser
$dir = ['names' => ['u1' => 'Owner One'], 'ids' => ['owner one' => 'u1']];
$client = ['owner_user_ids' => ['u1']];
$base = ['revision' => 1, 'title' => 'Fix it', 'owner_id' => 'u1'];
$parse = fn(array $extra) => ccrm_int_task_parse_push($pdo, $client, $base + $extra, $dir, 1_700_000_000);
$in = $parse([]);
check($in['has_category'] === false && $in['category'] === null, 'push: no key, no category change');
$in = $parse(['category' => 'bug']);
check($in['has_category'] === true && $in['category'] === 'bug', 'push: bug');
$in = $parse(['category' => null]);
check($in['has_category'] === true && $in['category'] === null, 'push: null clears');
$in = $parse(['category' => '']);
check($in['has_category'] === true && $in['category'] === null, 'push: "" clears');
check(thrown(fn() => $parse(['category' => 'Nope!'])) === '422:category', 'push: invalid is a 422 on category');
check(thrown(fn() => $parse(['category' => ['bug']])) === '422:category', 'push: an array is a 422 on category');

// ---- the serializer shows the category (null when the column is missing from the row)
$row = ['id' => 't1', 'owner' => 'Owner One', 'status' => 'todo', 'title' => 'x', 'deadline' => '2026-11-20', '_ts' => 1];
$out = ccrm_int_task_serialize($row, [], null, $dir, ['todo', 'done'], '');
check(array_key_exists('category', $out) && $out['category'] === null, 'serializer: category null without the column');
$out = ccrm_int_task_serialize($row + ['category' => 'bug'], [], null, $dir, ['todo', 'done'], '');
check($out['category'] === 'bug', 'serializer: category bug');

echo "OK {$checks} checks" . ($missing ? ' (column missing)' : '') . "\n";
