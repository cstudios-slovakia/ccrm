<?php
/**
 * Checks for the file attachments of api/pipeline.php (api/pipeline_attachments.php).
 *   php scripts/test-pipeline-attachments.php        no database needed
 */
require_once __DIR__ . '/../public/api/auth.php';
require_once __DIR__ . '/../public/api/pipeline_attachments.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

$check('multipart is recognised', ccrm_pipeline_is_multipart('multipart/form-data; boundary=----x'));
$check('json is not multipart', !ccrm_pipeline_is_multipart('application/json'));

$check('form fields are the payload', ccrm_pipeline_multipart_payload(['contact_name' => 'Jan', 'category_ids' => ['1', '2']])
    === ['contact_name' => 'Jan', 'category_ids' => ['1', '2']]);
$check('a JSON `payload` field wins', ccrm_pipeline_multipart_payload(['payload' => '{"contact_name":"Eva"}', 'x' => 'y'])
    === ['contact_name' => 'Eva']);
$check('a broken `payload` field is refused', ccrm_pipeline_multipart_payload(['payload' => '{oops']) === null);

// $_FILES shapes: a single field, an array field, and an empty file input.
$files = [
    'file' => ['name' => 'plan.pdf', 'type' => 'application/pdf', 'tmp_name' => '/t/1', 'error' => UPLOAD_ERR_OK, 'size' => 10],
    'attachments' => [
        'name' => ['a.jpg', 'b.png', ''],
        'type' => ['image/jpeg', 'image/png', ''],
        'tmp_name' => ['/t/2', '/t/3', ''],
        'error' => [UPLOAD_ERR_OK, UPLOAD_ERR_OK, UPLOAD_ERR_NO_FILE],
        'size' => [20, 30, 0],
    ],
];
$list = ccrm_pipeline_collect_uploads($files);
$check('every file of every field is collected, empty inputs skipped', array_column($list, 'name') === ['plan.pdf', 'a.jpg', 'b.png']);

$file = function (string $name, int $size = 100, int $error = UPLOAD_ERR_OK) {
    return ['name' => $name, 'type' => '', 'tmp_name' => '', 'error' => $error, 'size' => $size];
};
$r = ccrm_pipeline_validate_uploads([$file('Ponuka 2026.pdf'), $file('foto.JPG')]);
$check('allowed files pass with a safe name', array_column($r['files'], 'safe_name') === ['Ponuka 2026.pdf', 'foto.JPG'] && !$r['skipped']);
foreach (['page.html', 'logo.svg', 'shell.php.jpg', 'run.exe', 'noext'] as $bad) {
    $r = ccrm_pipeline_validate_uploads([$file('ok.pdf'), $file($bad)]);
    $check("$bad is skipped, the other file kept", count($r['files']) === 1 && $r['skipped'][0]['reason'] === 'file type not allowed');
}
$r = ccrm_pipeline_validate_uploads([$file('big.pdf', CCRM_PIPELINE_ATTACHMENT_MAX_BYTES + 1), $file('ok.pdf')]);
$check('a file over the per-file limit is skipped', count($r['files']) === 1 && $r['skipped'][0]['reason'] === 'larger than 10 MB');
$r = ccrm_pipeline_validate_uploads(array_fill(0, 3, $file('x.pdf', 9 * 1048576)));
$check('the file that breaks the total limit is skipped, earlier ones kept', count($r['files']) === 2 && $r['skipped'][0]['reason'] === 'over 25 MB together');
$r = ccrm_pipeline_validate_uploads(array_fill(0, CCRM_PIPELINE_ATTACHMENT_MAX_FILES + 2, $file('x.pdf')));
$check('files past the count limit are skipped', count($r['files']) === CCRM_PIPELINE_ATTACHMENT_MAX_FILES && count($r['skipped']) === 2);
$r = ccrm_pipeline_validate_uploads([$file('x.pdf', 0)]);
$check('an empty file is skipped', !$r['files'] && $r['skipped'][0]['reason'] === 'empty file');
$r = ccrm_pipeline_validate_uploads([$file('x.pdf', 100, UPLOAD_ERR_PARTIAL)]);
$check('a partial upload is skipped', !$r['files'] && $r['skipped'][0]['reason'] === 'did not arrive whole');
$r = ccrm_pipeline_validate_uploads([$file('x.pdf', 100, UPLOAD_ERR_INI_SIZE)]);
$check('a file over the PHP limit is skipped as too large', $r['skipped'][0]['reason'] === 'larger than the server accepts');
$r = ccrm_pipeline_validate_uploads([$file('C:\Users\x\návrh.exe')]);
$check('a skipped file is named without its path', $r['skipped'][0]['name'] === 'návrh.exe');
$check('the note names each skipped file', ccrm_pipeline_skipped_note([['name' => 'a.exe', 'reason' => 'file type not allowed']])
    === 'Attachments not saved: a.exe (file type not allowed)' && ccrm_pipeline_skipped_note([]) === '');

$check('sizes read like the timeline', ccrm_pipeline_human_size(500) === '500 B'
    && ccrm_pipeline_human_size(2048) === '2 KB' && ccrm_pipeline_human_size(1572864) === '1.5 MB'
    && ccrm_pipeline_human_size(2097152) === '2 MB');

// Storing: a plain copy stands in for move_uploaded_file.
$tmp = sys_get_temp_dir() . '/ccrm-pipeline-att-' . bin2hex(random_bytes(4));
mkdir($tmp . '/in', 0777, true);
mkdir($tmp . '/out', 0777, true);
file_put_contents($tmp . '/in/good.pdf', "%PDF-1.4\n" . str_repeat('0', 64) . "\n%%EOF\n");
file_put_contents($tmp . '/in/note.txt', 'hello');
file_put_contents($tmp . '/in/fake.pdf', 'not a pdf at all');
$copy = function ($from, $to) { return copy($from, $to); };
$mk = function (string $name, string $path) { return ['safe_name' => $name, 'tmp_name' => $path, 'size' => filesize($path)]; };

$r = ccrm_pipeline_store_uploads([$mk('good.pdf', "$tmp/in/good.pdf"), $mk('note.txt', "$tmp/in/note.txt")], 'ev-abc', "$tmp/out/", $copy);
$check('valid files are stored', count($r['attachments']) === 2 && !$r['skipped'] && count(glob("$tmp/out/*")) === 2);
$check('the stored path is unguessable and under /uploads/',
    preg_match('#^/uploads/ev-abc_[0-9a-f]{8}_good\.pdf$#', $r['attachments'][0]['path']) === 1);
$check('the attachment keeps its original name', $r['attachments'][1]['name'] === 'note.txt');
ccrm_pipeline_remove_stored_paths($r['stored']);
$check('stored files can be removed again', count(glob("$tmp/out/*")) === 0);

$r = ccrm_pipeline_store_uploads([$mk('good.pdf', "$tmp/in/good.pdf"), $mk('fake.pdf', "$tmp/in/fake.pdf")], 'ev-def', "$tmp/out/", $copy);
$check('a file that is not what it claims is skipped alone', count($r['attachments']) === 1
    && $r['skipped'][0]['name'] === 'fake.pdf' && count(glob("$tmp/out/*")) === 1);
ccrm_pipeline_remove_stored_paths($r['stored']);

array_map('unlink', glob("$tmp/in/*"));
rmdir("$tmp/in");
rmdir("$tmp/out");
rmdir($tmp);

echo $fails === 0 ? "\nAll pipeline attachment checks passed.\n" : "\n$fails check(s) failed.\n";
exit($fails === 0 ? 0 : 1);
