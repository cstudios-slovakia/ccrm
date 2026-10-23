<?php
/**
 * Checks for the extra-field handling of api/pipeline.php (api/pipeline_extras.php).
 *   php scripts/test-pipeline-extras.php        no database needed
 */
require_once __DIR__ . '/../public/api/pipeline_extras.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

$payload = [
    'company_name' => 'Acme', 'contact_name' => 'Jan', 'email' => 'j@acme.sk', 'message' => 'Hello',
    'source_id' => 3, 'category_ids' => [1, 2], 'traffic_origin' => 'google',
    'area_size' => '120', 'project_type' => 'Rodinný dom',
];
$rows = ccrm_pipeline_extra_fields($payload);
$check('an unknown field is kept, in the order sent', array_column($rows, 'value') === ['120', 'Rodinný dom']);
$check('known fields are never repeated as extras', count($rows) === 2);
$check('a key is humanised when no label map is sent', $rows[0]['label'] === 'Area size');

$payload['field_labels'] = ['area_size' => 'Plocha (m²)'];
$rows = ccrm_pipeline_extra_fields($payload);
$check('a label map is applied', $rows[0]['label'] === 'Plocha (m²)' && $rows[1]['label'] === 'Project type');
$check('the label map itself is not an extra field', count($rows) === 2);

$rows = ccrm_pipeline_extra_fields(['contact_name' => 'x', 'product_types' => ['Dlažba', 'Obklad', '', ['nested']]]);
$check('a list is joined with ", " and nested items dropped', $rows[0]['value'] === 'Dlažba, Obklad');

$rows = ccrm_pipeline_extra_fields(['contact_name' => 'x', 'meta' => ['a' => 1], 'empty' => '', 'blank' => '   ', 'none' => null, 'off' => false]);
$check('objects, empty strings, null and false are ignored', $rows === []);

$rows = ccrm_pipeline_extra_fields(['contact_name' => 'x', 'newsletter_optin' => true]);
$check('a ticked box reads "Yes"', $rows[0]['value'] === 'Yes');

$rows = ccrm_pipeline_extra_fields([
    'contact_name' => 'x', 'csrf_token' => 'a', 'recaptcha_response' => 'b', 'honeypot' => 'c', 'hp_field' => 'd',
    '_wpnonce' => 'e', 'api_key' => 'f', 'password' => 'g', 'bot-field' => 'h', 'deadline' => 'Do 1 mesiaca',
]);
$check('technical keys are skipped', count($rows) === 1 && $rows[0]['label'] === 'Deadline');

$rows = ccrm_pipeline_extra_fields(['contact_name' => 'x', 'attachment' => 'https://example.com/a.pdf']);
$check('a URL stays a plain URL', $rows[0]['value'] === 'https://example.com/a.pdf');

$rows = ccrm_pipeline_extra_fields(['contact_name' => 'x', 'detail' => "line one\r\nline two"]);
$check('line breaks in a value collapse to one line', $rows[0]['value'] === 'line one line two');

$big = ['contact_name' => 'x'];
for ($i = 0; $i < 40; $i++) { $big['field_' . $i] = str_repeat('a', 400); }
$text = ccrm_pipeline_extra_lines($big);
$check('the total is capped', mb_strlen($text, 'UTF-8') <= CCRM_PIPELINE_EXTRA_TOTAL_MAX + 100 && substr_count($text, "\n") < 39);

$check('a message with no extras is returned unchanged', ccrm_pipeline_with_extras('Hello', '') === 'Hello');
$check('extras follow the message after a blank line', ccrm_pipeline_with_extras('Hello', 'A: 1') === "Hello\n\nA: 1");
$check('extras alone become the note', ccrm_pipeline_with_extras('', 'A: 1') === 'A: 1');

echo $fails === 0 ? "\nall passed\n" : "\n$fails FAILED\n";
exit($fails === 0 ? 0 : 1);
