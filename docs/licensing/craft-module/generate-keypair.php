<?php
/**
 * Generate the CCRM licence signing keypair.
 *
 *     php docs/licensing/craft-module/generate-keypair.php [output-directory]
 *
 * Writes `ccrm-license-private.json` (SECRET — keep it out of the web root, keep
 * a backup) and prints the public key line to paste into api/license_client.php.
 *
 * Ed25519 when ext-sodium is available, RSA-2048 otherwise. The CCRM client
 * verifies both; Ed25519 keys are far shorter and are what you want unless the
 * signing machine cannot do them.
 */

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

$outDir = $argv[1] ?? getcwd();
if (!is_dir($outDir) || !is_writable($outDir)) {
    exit("Output directory is not writable: {$outDir}\n");
}
$outFile = rtrim($outDir, "/\\") . DIRECTORY_SEPARATOR . 'ccrm-license-private.json';

if (file_exists($outFile)) {
    // Overwriting a signing key silently invalidates every licence already in
    // the field. Make it a deliberate act.
    exit("Refusing to overwrite an existing key: {$outFile}\n"
        . "Move it aside first if you really mean to rotate.\n");
}

if (function_exists('sodium_crypto_sign_keypair')) {
    $pair = sodium_crypto_sign_keypair();
    $envelope = [
        'alg'       => 'ed25519',
        'secret'    => base64_encode(sodium_crypto_sign_secretkey($pair)),
        'createdAt' => gmdate('c'),
    ];
    $publicLine = 'ed25519:' . base64_encode(sodium_crypto_sign_publickey($pair));
} else {
    $res = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    if ($res === false) {
        exit("Could not generate an RSA key: " . openssl_error_string() . "\n"
            . "(On Windows this usually means PHP cannot find openssl.cnf.)\n");
    }
    openssl_pkey_export($res, $privatePem);
    $envelope = [
        'alg'           => 'rs256',
        'privateKeyPem' => $privatePem,
        'createdAt'     => gmdate('c'),
    ];
    $publicLine = openssl_pkey_get_details($res)['key'];
}

// 0600 before anything is written into it, not after: a key that spends even a
// moment world-readable has to be treated as compromised.
$handle = fopen($outFile, 'x');
if ($handle === false) {
    exit("Could not create {$outFile}\n");
}
@chmod($outFile, 0600);
fwrite($handle, json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
fclose($handle);

echo "Private key written to: {$outFile}\n";
echo "  Algorithm: {$envelope['alg']}\n";
echo "  Keep this file secret and backed up. Losing it means re-issuing every licence.\n\n";
echo "Paste this into CCRM_LICENSE_PUBLIC_KEY in BOTH api/license_client.php\n";
echo "and public/api/license_client.php:\n\n";
echo $publicLine . "\n\n";
echo "Then point the Craft module at the private key:\n";
echo "  CCRM_LICENSE_PRIVATE_KEY_PATH=\"{$outFile}\"\n";
