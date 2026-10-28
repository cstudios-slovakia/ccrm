<?php
/**
 * Checks that saving settings cannot empty a list it did not send (api/auth.php,
 * ccrm_settings_list_value). Regression: a settings POST without `leadStates`
 * overwrote the pipeline stages with [], which hid every lead.
 *   php scripts/test-settings-lists.php        no database needed
 * CCRM_API_DIR overrides the folder that holds auth.php (for the dev container).
 */
$api = getenv('CCRM_API_DIR') ?: __DIR__ . '/../public/api';
require_once $api . '/auth.php';

$fails = 0;
$check = function (string $name, bool $ok) use (&$fails) {
    echo ($ok ? "ok   " : "FAIL ") . $name . "\n";
    if (!$ok) { $fails++; }
};

$stages = ['new', 'contacted', 'accepted'];
$check('a sent list is stored', ccrm_settings_list_value(['leadStates' => $stages], 'leadStates', false) === json_encode($stages));
$check('an omitted list means unchanged (null)', ccrm_settings_list_value(['systemName' => 'x'], 'leadStates', false) === null);
$check('an omitted list that may be empty is still unchanged', ccrm_settings_list_value([], 'leadSources', true) === null);
$check('an empty stage list is refused', ccrm_settings_list_value(['leadStates' => []], 'leadStates', false) === null);
$check('an empty list that may be empty is stored', ccrm_settings_list_value(['leadSources' => []], 'leadSources', true) === '[]');
$check('a non-array value is ignored', ccrm_settings_list_value(['leadStates' => 'new'], 'leadStates', false) === null);
$check('a map is stored', ccrm_settings_list_value(['leadStateColors' => ['new' => '#fff']], 'leadStateColors', true) === '{"new":"#fff"}');

echo $fails ? "\n$fails failed\n" : "\nall passed\n";
exit($fails ? 1 : 0);
