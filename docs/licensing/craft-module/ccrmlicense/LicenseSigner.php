<?php
/**
 * Turns a claim into the signed token a CCRM installation will accept.
 *
 * The one rule that matters: the signature covers the BASE64URL-ENCODED claim,
 * not the decoded object, and the client verifies exactly those bytes. Sign the
 * object and you have invented a canonicalisation problem — two JSON encoders
 * that disagree about key order or escaping produce a signature the other side
 * cannot reproduce. Sign the encoding and there is only ever one byte string.
 *
 * Keep this file and api/license_client.php in agreement: the verifier there is
 * the mirror of the signer here.
 */

namespace modules\ccrmlicense;

use RuntimeException;

class LicenseSigner
{
    /** Claim format both sides speak. Bump on BOTH sides together, never one. */
    public const CLAIM_VERSION = 1;

    private string $alg;
    /** Raw 64-byte Ed25519 secret key, or an RSA private key in PEM. */
    private string $secret;

    private function __construct(string $alg, string $secret)
    {
        $this->alg = $alg;
        $this->secret = $secret;
    }

    /**
     * Load the keypair envelope written by generate-keypair.php.
     *
     * The path comes from the environment so the key can live outside the web
     * root; a key inside it is one misconfigured rule away from being served.
     */
    public static function fromEnv(): self
    {
        $path = self::env('CCRM_LICENSE_PRIVATE_KEY_PATH');
        if ($path === '') {
            throw new RuntimeException('CCRM_LICENSE_PRIVATE_KEY_PATH is not set');
        }
        if (!is_readable($path)) {
            throw new RuntimeException('Licence signing key is not readable');
        }
        $envelope = json_decode((string) file_get_contents($path), true);
        if (!is_array($envelope) || empty($envelope['alg'])) {
            throw new RuntimeException('Licence signing key file is malformed');
        }

        if ($envelope['alg'] === 'ed25519') {
            if (!function_exists('sodium_crypto_sign_detached')) {
                throw new RuntimeException('ext-sodium is required for an ed25519 signing key');
            }
            $secret = base64_decode((string) ($envelope['secret'] ?? ''), true);
            if ($secret === false || strlen($secret) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
                throw new RuntimeException('ed25519 secret key is not the expected length');
            }
            return new self('ed25519', $secret);
        }

        if ($envelope['alg'] === 'rs256') {
            $pem = (string) ($envelope['privateKeyPem'] ?? '');
            if ($pem === '') {
                throw new RuntimeException('rs256 key file has no privateKeyPem');
            }
            return new self('rs256', $pem);
        }

        throw new RuntimeException('Unsupported signing algorithm: ' . $envelope['alg']);
    }

    /**
     * Read one environment variable.
     *
     * `getenv()` alone is not enough. Craft's bootstrap loads `.env` through
     * phpdotenv's *default* adapters, which write `$_ENV` and `$_SERVER` but
     * deliberately never call `putenv()` — so under Craft `getenv()` returns
     * false for everything in `.env`. The standalone mint script, on the other
     * hand, does use `putenv()`. Check all three and both callers work.
     */
    private static function env(string $name): string
    {
        foreach ([$_SERVER[$name] ?? null, $_ENV[$name] ?? null, getenv($name)] as $value) {
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }
        return '';
    }

    public function algorithm(): string
    {
        return $this->alg;
    }

    /**
     * Sign a claim.
     *
     * `alg`, `v` and `product` are stamped here rather than taken from the
     * caller, so a bug upstream cannot mint a token that claims to be something
     * it is not.
     */
    public function sign(array $claim): string
    {
        $claim['v'] = self::CLAIM_VERSION;
        $claim['alg'] = $this->alg;
        $claim['product'] = 'ccrm';

        $json = json_encode($claim, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new RuntimeException('Claim could not be encoded');
        }
        $segment = self::b64url($json);

        if ($this->alg === 'ed25519') {
            $signature = sodium_crypto_sign_detached($segment, $this->secret);
        } else {
            $signature = '';
            if (!openssl_sign($segment, $signature, $this->secret, OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('Claim could not be signed');
            }
        }

        return $segment . '.' . self::b64url($signature);
    }

    public static function b64url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
