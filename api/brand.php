<?php
/**
 * The two names people see: one source of truth for the backend.
 * (The frontend twin is src/utils/brand.ts.)
 *
 *  - PRODUCT NAME ("Koperniq"): what the software is. Fixed for every install. Used in
 *    errors, AI prompts, generated files and the command line. To rename the product,
 *    change KOPERNIQ_PRODUCT_NAME here and PRODUCT_NAME in src/utils/brand.ts.
 *  - SYSTEM TITLE (e.g. "Lapidea"): whose installation this is. The company sets it in
 *    Settings → System title (system_settings.SYSTEM_NAME). Empty means none, and the
 *    product name stands in for it.
 *
 * Never store the product name as a title.
 */

if (!defined('KOPERNIQ_PRODUCT_NAME')) {
    define('KOPERNIQ_PRODUCT_NAME', 'Koperniq');
}
// Licence keys read KPRNQ-XXXX-XXXX-XXXX-XXXX. Keys issued before the rename start with CCRM- and stay valid.
if (!defined('KOPERNIQ_LICENSE_PREFIX')) {
    define('KOPERNIQ_LICENSE_PREFIX', 'KPRNQ');
}
if (!defined('KOPERNIQ_PRODUCT_CLI')) {
    define('KOPERNIQ_PRODUCT_CLI', 'kprnq');
}

// Guarded as a block: the root copy (api/) and public/api/ are never both loaded, but a second
// include by another path must not be fatal.
if (!function_exists('kprnq_resolve_title')) {

    /** The title to display for a stored override: the override, or the product name. */
    function kprnq_resolve_title($override): string
    {
        $t = is_string($override) ? trim($override) : '';
        return $t !== '' ? $t : KOPERNIQ_PRODUCT_NAME;
    }

    /** "Lapidea (Koperniq)"; with no title of its own just "Koperniq". */
    function kprnq_title_with_product($override): string
    {
        $t = is_string($override) ? trim($override) : '';
        return ($t !== '' && $t !== KOPERNIQ_PRODUCT_NAME) ? $t . ' (' . KOPERNIQ_PRODUCT_NAME . ')' : KOPERNIQ_PRODUCT_NAME;
    }

    /** The stored title override ("" = none), read from system_settings. Never throws. */
    function kprnq_system_title_override($pdo): string
    {
        try {
            $stmt = $pdo->prepare("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_NAME' LIMIT 1");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            return ($val === false) ? '' : trim((string)$val);
        } catch (\Throwable $e) {
            return '';
        }
    }
}
