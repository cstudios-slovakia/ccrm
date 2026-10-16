<?php
/**
 * Offline checks for the pure parts of api/vector_index.php (chunking, plain text, vector
 * literal). No database and no OpenAI call. Run:  php scripts/test-vector-index.php
 */
chdir(dirname(__DIR__));
require_once __DIR__ . '/../api/vector_index.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

// literal
$check('literal formats floats for VEC_FromText', ccrm_vec_literal([0.5, -1, 0.1234567891]) === '[0.5,-1,0.1234568]');

// plain text
$check('plain strips tags and entities', ccrm_vec_plain('<p>Hello&nbsp;<b>world</b> &amp; co</p>') === "Hello\u{A0}world & co");
$check('plain reads JSON note blocks', ccrm_vec_plain('[{"content":"first"},{"content":"second"}]') === "first\nsecond");
$check('plain caps the length', mb_strlen(ccrm_vec_plain(str_repeat('x', 9000), 100)) === 100);

// chunking
$check('short text stays one chunk', count(ccrm_vec_chunks("Task: x\nStatus: open")) === 1);
$long = "Email: Re: delivery\n" . str_repeat('Customer wrote a long sentence about the delivery date. ', 120);
$chunks = ccrm_vec_chunks($long);
$check('long text is split', count($chunks) > 1);
$check('chunk count is capped', count($chunks) <= CCRM_VEC_MAX_CHUNKS_PER_ITEM);
$check('every chunk repeats the heading', count(array_filter($chunks, fn($c) => str_starts_with($c, "Email: Re: delivery\n"))) === count($chunks));
$check('no chunk exceeds the size limit', max(array_map(fn($c) => mb_strlen($c, 'UTF-8'), $chunks)) <= CCRM_VEC_CHUNK_CHARS + 50);
$check('multibyte text is not cut mid-character', array_reduce(ccrm_vec_chunks("Ľúbeznosť\n" . str_repeat('čaká šťastný žľab. ', 300)), fn($ok, $c) => $ok && mb_check_encoding($c, 'UTF-8'), true));
$check('empty text gives no chunks', ccrm_vec_chunks('   ') === []);

// permission keys: every key the indexer assigns must be one the scope knows
$defs = function_exists('ccrm_permission_defs') ? ccrm_permission_defs() : [];
$unknown = array_filter(ccrm_vec_perm_keys(), fn($k) => !isset($defs[$k]));
$check('every chunk permission key exists in the permission model' . ($unknown ? ' (unknown: ' . implode(',', $unknown) . ')' : ''), !$unknown);

echo $fails === 0 ? "\nAll checks passed.\n" : "\n$fails check(s) failed.\n";
exit($fails === 0 ? 0 : 1);
