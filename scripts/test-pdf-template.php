<?php
/**
 * Checks for the AI price-offer template generator (api/generate_pdf_template.php).
 *
 *   php scripts/test-pdf-template.php        the pure helpers only: no database, no OpenAI
 *
 * Covers what makes model output safe to store (the block document, shared with
 * src/utils/offerDocument.ts) and what keeps a client-supplied path from reaching
 * any file but a sample uploaded for this feature.
 * CCRM_API_DIR overrides the folder that holds the api files (for running inside the dev container).
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
define('CCRM_PDF_TEMPLATE_LIB', true);
require_once $api . '/auth.php';
require_once $api . '/generate_pdf_template.php';

$fails = 0;
$check = function (string $name, bool $ok, string $detail = '') use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . ($ok || $detail === '' ? '' : "  [$detail]") . "\n";
    if (!$ok) { $fails++; }
};

$build = fn(array $bp) => ccrm_pdf_tpl_build($bp, 'cenova_ponuka.pdf', '/uploads/custom-template-pdf_cenova_ponuka.pdf');
$fixture = json_decode((string)file_get_contents(__DIR__ . '/fixtures/offer-document-sample.json'), true);
$idsOf = function (array $blocks) use (&$idsOf): array {
    $ids = [];
    foreach ($blocks as $block) {
        $ids[] = $block['id'];
        if (($block['type'] ?? '') === 'stack') $ids = array_merge($ids, $idsOf($block['children']));
        elseif (($block['type'] ?? '') === 'columns') {
            foreach ($block['columns'] as $col) $ids = array_merge($ids, $idsOf($col));
        }
    }
    return $ids;
};

// ── the same fixture the TypeScript tests normalise ─────────────────────────
$doc = ccrm_offer_document_normalize($fixture['realistic']);
$check('a realistic reconstruction normalises', is_array($doc));
$check('block ids match the TypeScript normaliser', $idsOf($doc['blocks'] ?? []) === ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
$name = $doc['blocks'][0]['columns'][0][0] ?? [];
$check('a shorthand colour is expanded and an illegal style value is dropped',
    ($name['style']['color'] ?? '') === '#aabbcc' && ($name['style']['weight'] ?? '') === 'bold'
    && ($name['style']['fontSize'] ?? '') === 'lg' && !isset($name['style']['background']) && !isset($name['style']['align']));
$check('an unknown table column is dropped', ($doc['blocks'][1]['columns'] ?? []) === ['name', 'quantity', 'unit', 'unitPrice', 'totalPrice']);
$diff = ccrm_offer_document_diff($doc);
$check('missing contains company.iban and not offer.clientName',
    in_array('company.iban', $diff['missing'], true) && !in_array('offer.clientName', $diff['missing'], true));
$check('extracted contains the custom key', ($diff['extracted'][0]['key'] ?? '') === 'site_code');

$hostile = ccrm_offer_document_normalize($fixture['hostile']);
$check('hostile payload keeps the same ids', $idsOf($hostile['blocks'] ?? []) === ['b1', 'b2', 'b3', 'b4']);
$check('html is stripped and a style string is dropped',
    ($hostile['blocks'][0]['text'] ?? '') === 'Hello there' && !isset($hostile['blocks'][0]['style']));
$check('a nested column is dropped', count($hostile['blocks'][1]['columns'] ?? []) === 2);

$many = ['blocks' => []];
for ($i = 0; $i < 81; $i++) $many['blocks'][] = ['type' => 'text', 'text' => 'x'];
$check('over 80 blocks is unusable', ccrm_offer_document_normalize($many) === null);
$check('a document that normalises to nothing is unusable', ccrm_offer_document_normalize(['blocks' => [['type' => 'nope']]]) === null);

$check('a theme-shaped payload is unusable', $build([
    'name' => 'SIGNUM',
    'layout' => ['headerStyle' => 'dark-band'],
    'colors' => ['primary' => '#ABC'],
    'sectionsOrder' => ['footer', 'header'],
]) === null);

$ok = $build($fixture['realistic']);
$check('a usable document becomes a template with the safe column defaults',
    is_array($ok) && strpos($ok['id'], 'act-') === 0 && $ok['name'] === 'Strecha'
    && $ok['document']['blocks'][0]['id'] === 'b1'
    && $ok['colors']['primary'] === '#0f172a' && $ok['badgeStyle'] === 'rounded'
    && $ok['sectionsOrder'] === CCRM_PDF_TPL_SECTIONS && $ok['sourcePdfName'] === 'cenova_ponuka.pdf');

$values = [];
for ($i = 0; $i < 24; $i++) $values['k' . $i] = 'v' . $i;
$values['extra'] = 'nope';
$values['notString'] = 12;
$values['Bad'] = 'no';
$kept = ccrm_offer_custom_field_values($values);
$check('custom-field values keep 24 strings', count($kept) === 24 && ($kept['k0'] ?? '') === 'v0' && ($kept['k23'] ?? '') === 'v23' && !isset($kept['extra']));
$check('a non-string and a too-long value are dropped or cut',
    ccrm_offer_custom_field_values(['note' => str_repeat('x', 600)])['note'] === str_repeat('x', 500)
    && ccrm_offer_custom_field_values(['n' => 1]) === []);

// ── the sample PDF path ──────────────────────────────────────────────────────
$uploads = ccrm_uploads_dir();
$name = 'custom-template-pdf_phpunit-' . bin2hex(random_bytes(4));
$good = $uploads . $name . '.pdf';
file_put_contents($good, "%PDF-1.4\n%fake but magic-correct\n");
$notPdf = $uploads . $name . '-text.pdf';
file_put_contents($notPdf, "just text, not a pdf");
$other = $uploads . 'someone-elses-file_' . bin2hex(random_bytes(4)) . '.pdf';
file_put_contents($other, "%PDF-1.4\n");
$big = $uploads . $name . '-big.pdf';
$fh = fopen($big, 'w'); fwrite($fh, "%PDF-1.4\n"); ftruncate($fh, CCRM_PDF_TEMPLATE_MAX_BYTES + 1); fclose($fh);

$read = 'ccrm_pdf_tpl_read_sample';
$check('a sample uploaded for this feature is read', is_string($read('/uploads/' . $name . '.pdf')) && strncmp($read('/uploads/' . $name . '.pdf'), '%PDF-', 5) === 0);
$code = fn($r) => is_array($r) ? $r[0] : 'bytes';
$check('another upload (wrong prefix) is refused', $code($read('/uploads/' . basename($other))) === 'pdf_unreadable');
$check('a path that climbs out is refused', $code($read('/uploads/../auth.php')) === 'pdf_unreadable' && $code($read('/uploads/..%2fauth.php')) === 'pdf_unreadable');
$check('a nested or absolute path is refused', $code($read('/uploads/sub/' . $name . '.pdf')) === 'pdf_unreadable' && $code($read($good)) === 'pdf_unreadable' && $code($read('')) === 'pdf_unreadable');
$check('a backslash path is refused', $code($read('/uploads/..\\' . $name . '.pdf')) === 'pdf_unreadable');
$check('a missing file is refused', $code($read('/uploads/custom-template-pdf_missing-' . bin2hex(random_bytes(4)) . '.pdf')) === 'pdf_unreadable');
$check('a file that is not a PDF is refused', $code($read('/uploads/' . $name . '-text.pdf')) === 'pdf_unreadable');
$check('a PDF over the size cap is refused with its own code', $code($read('/uploads/' . $name . '-big.pdf')) === 'pdf_too_large');
$check('a file type other than PDF is refused', $code($read('/uploads/' . $name . '.php')) === 'pdf_unreadable');

foreach ([$good, $notPdf, $other, $big] as $f) { @unlink($f); }

// ── the prompt ───────────────────────────────────────────────────────────────
$prompt = ccrm_pdf_tpl_prompt('some extracted text', 'Slovak');
$check('the prompt names the catalog, the blocks and the language',
    strpos($prompt, 'company.name') !== false && strpos($prompt, 'offer.clientName') !== false
    && strpos($prompt, 'customField') !== false && strpos($prompt, 'Slovak') !== false);
$check('the prompt forbids invented sections, html, and reads only four pages',
    strpos($prompt, 'Do not invent') !== false && strpos($prompt, 'No HTML') !== false && strpos($prompt, 'first four pages') !== false);
$check('the extracted text is only a hint', strpos($prompt, 'a hint only') !== false);
$check('without extracted text there is no hint block', strpos(ccrm_pdf_tpl_prompt('', 'English'), 'a hint only') === false);

echo $fails === 0 ? "\nAll checks passed.\n" : "\n$fails check(s) failed.\n";
exit($fails === 0 ? 0 : 1);
