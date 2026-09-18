<?php
/**
 * Mint a licence token by hand, for an installation that cannot reach the
 * licence server (air-gapped, behind a strict firewall, or during an outage).
 *
 *   php mint-offline-token.php --key CCRM-A1B2-C3D4-E5F6-G7H8 \
 *                              --instance f8002ac6a048d82fe591249003a6e700 \
 *                              --expires 2027-08-28 \
 *                              --max-users 10 \
 *                              --customer "Laminam s.r.o." \
 *                              [--plan standard] [--warn-days 30]
 *
 * Reads the same key file as the Craft module (CCRM_LICENSE_PRIVATE_KEY_PATH, or
 * --key-file). The customer pastes the printed token into Settings → Licence, or
 * runs `php ccrm license set <token>`.
 *
 * An offline token carries no nonce, so the installation accepts it only if its
 * `issuedAt` is at least as new as the token already stored. It is still bound
 * to one instance and still signed — this is a delivery channel, not a bypass.
 */

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/ccrmlicense/LicenseSigner.php';

// Every long option takes a REQUIRED value (single colon), even the ones that
// are themselves optional. With `::` — "optional value" — getopt only accepts
// `--expires=2027-08-28`, and silently discards `--expires 2027-08-28`, which is
// the form anyone types. That produced a token expiring 1970-01-01 with no seat
// count and no customer name, and reported success while doing it.
$options = getopt('', [
    'key:', 'instance:', 'expires:', 'max-users:', 'customer:',
    'plan:', 'warn-days:', 'key-file:', 'status:',
]);

foreach (['key', 'instance'] as $required) {
    if (empty($options[$required])) {
        exit("Missing --{$required}\n\nSee the header of this file for usage.\n");
    }
}

$instance = (string) $options['instance'];
if (!preg_match('/^[a-f0-9]{32}$/', $instance)) {
    exit("--instance must be the 32-character id from `php ccrm license status`\n");
}

// Same canonicalisation the client and the Craft module use, so the key in the
// claim matches the key the installation has stored byte for byte.
$key = preg_replace('/[^A-Z0-9]/', '', strtoupper(trim((string) $options['key'])));
if (strlen($key) === 20 && str_starts_with($key, 'CCRM')) {
    $key = 'CCRM-' . implode('-', str_split(substr($key, 4), 4));
}

$expires = null;
if (isset($options['expires']) && $options['expires'] !== '') {
    // strtotime() returns false, and date() then happily renders that as
    // 1970-01-01 — an expiry date in the past, issued as valid. Check first.
    $timestamp = strtotime((string) $options['expires']);
    if ($timestamp === false) {
        exit("--expires could not be parsed as a date\n");
    }
    $expires = date('Y-m-d', $timestamp);
}

$maxUsers = isset($options['max-users']) ? (int) $options['max-users'] : 0;
$warnDays = isset($options['warn-days']) ? (int) $options['warn-days'] : 0;
$status = strtolower((string) ($options['status'] ?? 'active'));
if (!in_array($status, ['active', 'suspended', 'revoked'], true)) {
    exit("--status must be active, suspended or revoked\n");
}

if (!empty($options['key-file'])) {
    putenv('CCRM_LICENSE_PRIVATE_KEY_PATH=' . $options['key-file']);
}

try {
    $signer = \modules\ccrmlicense\LicenseSigner::fromEnv();
    $token = $signer->sign([
        'key'       => $key,
        'instance'  => $instance,
        'status'    => $status,
        'issuedAt'  => gmdate('c'),
        'expiresAt' => $expires,
        'maxUsers'  => $maxUsers > 0 ? $maxUsers : null,
        'customer'  => (string) ($options['customer'] ?? ''),
        'plan'      => (string) ($options['plan'] ?? ''),
        'warnDays'  => $warnDays > 0 ? $warnDays : null,
    ]);
} catch (\Throwable $e) {
    exit('Could not sign: ' . $e->getMessage() . "\n");
}

echo "Licence token for {$key} on instance {$instance}"
    . ($expires ? ", expiring {$expires}" : ', with no expiry') . ":\n\n";
echo $token . "\n\n";
echo "The customer pastes this into Settings -> Licence, or runs:\n";
echo "  php ccrm license set <token>\n";
