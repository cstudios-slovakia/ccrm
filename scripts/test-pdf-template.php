<?php
/**
 * Checks for the AI price-offer template generator (api/generate_pdf_template.php).
 *
 *   php scripts/test-pdf-template.php        the pure helpers only: no database, no OpenAI
 *
 * Covers what makes model output safe to store (enums, hex colours, headings, the
 * guaranteed section set) and what keeps a client-supplied path from reaching any
 * file but a sample uploaded for this feature.
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

// ── the blueprint → template step ────────────────────────────────────────────
$t = $build([
    'name' => 'SIGNUM',
    'colors' => ['primary' => '#ABC', 'secondary' => 'red', 'accent' => '#F97316', 'background' => 'url(x)', 'text' => '#111827'],
    'layout' => [
        'headerStyle' => 'dark-band', 'tableHeaderStyle' => '<b>', 'uspCardStyle' => 'left-border',
        'totalBannerStyle' => 'solid-dark', 'fontFamily' => 'Comic Sans',
        'headings' => ['usp' => "  Prečo\n strechu  ", 'items' => str_repeat('x', 400), 'nextStep' => 7],
    ],
    'sectionsOrder' => ['footer', 'nope', 'header', 'footer', ['x'], 5],
    'badgeStyle' => 'diamond',
    'customBannerText' => 'Predbežná cena',
]);
$check('hex colours are kept, shorthand is expanded, anything else falls back',
    $t['colors'] === ['primary' => '#aabbcc', 'secondary' => '#334155', 'background' => '#ffffff', 'accent' => '#f97316', 'text' => '#111827']);
$check('allow-listed layout values are kept', $t['layout']['headerStyle'] === 'dark-band' && $t['layout']['uspCardStyle'] === 'left-border' && $t['layout']['totalBannerStyle'] === 'solid-dark');
$check('an unknown layout value or font falls back to the default',
    $t['layout']['tableHeaderStyle'] === 'filled-primary' && $t['layout']['fontFamily'] === 'sans' && $t['typography']['fontFamily'] === 'sans');
$check('headings are one line, capped, and non-strings become empty',
    $t['layout']['headings']['usp'] === 'Prečo strechu' && mb_strlen($t['layout']['headings']['items']) === 90 && $t['layout']['headings']['nextStep'] === '');
$check('the section order keeps known ids once, in order, and appends every missing block',
    array_slice($t['sectionsOrder'], 0, 2) === ['footer', 'header']
    && count($t['sectionsOrder']) === 11
    && count(array_unique($t['sectionsOrder'])) === 11);
$check('an unknown badge shape falls back', $t['badgeStyle'] === 'rounded');
$check('the model\'s banner wording is kept', $t['customBannerText'] === 'Predbežná cena');
$check('the template carries the source, a fresh id and no fallback markers',
    strpos($t['id'], 'act-') === 0 && $t['sourcePdfName'] === 'cenova_ponuka.pdf' && !isset($t['warning']) && !isset($t['notice']));

$bare = $build([]);
$check('an empty blueprint still yields every required block and the default look',
    $bare['sectionsOrder'] === CCRM_PDF_TPL_SECTIONS && $bare['layout']['headerStyle'] === 'light' && $bare['name'] === 'cenova_ponuka');
$check('a blueprint with the wrong shapes does not throw',
    $build(['colors' => 'x', 'layout' => 'y', 'sectionsOrder' => 'z'])['layout']['headings'] === ['usp' => '', 'items' => '', 'nextStep' => '']);

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
$check('the prompt names every allowed value and the language', strpos($prompt, 'dark-band | accent-band') !== false && strpos($prompt, 'left-border') !== false && strpos($prompt, 'Slovak') !== false);
$check('the extracted text is only a hint', strpos($prompt, 'a hint only') !== false);
$check('without extracted text there is no hint block', strpos(ccrm_pdf_tpl_prompt('', 'English'), 'a hint only') === false);

echo $fails === 0 ? "\nAll checks passed.\n" : "\n$fails check(s) failed.\n";
exit($fails === 0 ? 0 : 1);
