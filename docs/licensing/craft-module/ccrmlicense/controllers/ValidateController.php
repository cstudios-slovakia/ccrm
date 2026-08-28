<?php
/**
 * POST /ccrm-license/validate — the one endpoint a CCRM installation calls.
 *
 * Request (JSON):
 *   action     "activate" | "validate"
 *   product    "ccrm"
 *   claimV     1
 *   key        the licence key
 *   instance   32-hex identifier of the installation
 *   nonce      random per request; echoed inside the claim
 *   host       hostname the install is served from (informational)
 *   version    CCRM version (informational)
 *   seatsUsed  current user count (informational)
 *
 * Response:
 *   { "success": true,  "token": "<claim>.<signature>" }
 *   { "success": false, "error": "unknown_key" | "revoked" | "suspended"
 *                              | "expired" | "instance_limit" | "rate_limited"
 *                              | "rejected" }
 *
 * The error vocabulary is closed — the client maps anything outside it to a
 * generic refusal, so nothing written here can inject a status into the client's
 * state machine.
 *
 * NOTE: written against Craft 4/5 APIs but never executed against a live Craft
 * install. Review before use. See ../../../README.md.
 */

namespace modules\ccrmlicense\controllers;

use Craft;
use craft\elements\Entry;
use craft\web\Controller;
use modules\ccrmlicense\LicenseSigner;
use yii\web\Response;

class ValidateController extends Controller
{
    /** Customer installations are not signed-in Craft users. */
    protected array|bool|int $allowAnonymous = true;

    /** A machine-to-machine JSON API has no Craft session to carry a CSRF token. */
    public $enableCsrfValidation = false;

    /** Section handle of the licence channel. */
    private const SECTION = 'licenses';

    /** How many requests one IP may make in RATE_WINDOW seconds. */
    private const RATE_LIMIT = 30;
    private const RATE_WINDOW = 300;

    public function actionIndex(): Response
    {
        $this->requirePostRequest();
        $request = Craft::$app->getRequest();

        // Guessing keys is the obvious attack on this endpoint, and it costs the
        // attacker nothing. Cap it per IP before doing any work.
        if ($this->isRateLimited((string) $request->getUserIP())) {
            return $this->fail('rate_limited', 429);
        }

        $body = json_decode((string) $request->getRawBody(), true);
        if (!is_array($body)) {
            return $this->fail('rejected', 400);
        }

        // Only ever answer questions about this product and a claim format we
        // still speak. Answering an unknown claim version with a v1 token would
        // hand a future client something it cannot read.
        if (($body['product'] ?? '') !== 'ccrm') {
            return $this->fail('rejected', 400);
        }
        if ((int) ($body['claimV'] ?? 0) !== LicenseSigner::CLAIM_VERSION) {
            return $this->fail('rejected', 400);
        }

        $key = $this->normalizeKey((string) ($body['key'] ?? ''));
        $instance = (string) ($body['instance'] ?? '');
        $nonce = (string) ($body['nonce'] ?? '');

        if ($key === '' || !preg_match('/^[a-f0-9]{32}$/', $instance) || $nonce === '') {
            return $this->fail('rejected', 400);
        }

        $entry = $this->findLicense($key);
        if ($entry === null) {
            return $this->fail('unknown_key', 404);
        }

        $status = strtolower((string) ($entry->licenseStatus?->value ?? $entry->licenseStatus ?? 'active'));
        if ($status === 'revoked') {
            return $this->fail('revoked', 403);
        }
        if ($status === 'suspended') {
            return $this->fail('suspended', 403);
        }

        // Bind this installation, or refuse if the licence is already spoken for.
        // Clearing `licenseInstances` in the control panel is the answer when a
        // customer legitimately rebuilds their server.
        if (!$this->bindInstance($entry, $instance)) {
            return $this->fail('instance_limit', 409);
        }

        $expiresAt = $entry->licenseExpiresAt instanceof \DateTimeInterface
            ? $entry->licenseExpiresAt->format('Y-m-d')
            : null;

        $maxUsers = (int) ($entry->licenseMaxUsers ?? 0);
        $warnDays = (int) ($entry->licenseWarnDays ?? 0);

        // An expired licence still gets a SIGNED token, with the real dates in
        // it. The client decides "expired" from `expiresAt` against its own
        // database clock — one clock, one rule — and it needs a verifiable claim
        // to display the expiry it is complaining about.
        $claim = [
            'key'       => $key,
            'instance'  => $instance,
            'status'    => 'active',
            'issuedAt'  => gmdate('c'),
            'expiresAt' => $expiresAt,
            'maxUsers'  => $maxUsers > 0 ? $maxUsers : null,
            'customer'  => (string) ($entry->licenseCustomer ?? $entry->title ?? ''),
            'plan'      => (string) ($entry->licensePlan ?? ''),
            'warnDays'  => $warnDays > 0 ? $warnDays : null,
            'nonce'     => $nonce,
        ];

        try {
            $token = LicenseSigner::fromEnv()->sign($claim);
        } catch (\Throwable $e) {
            // A signing failure is OUR fault, and saying so in the response would
            // only tell an attacker about the key. Log it and refuse.
            Craft::error('[ccrm licence] signing failed: ' . $e->getMessage(), __METHOD__);
            return $this->fail('rejected', 500);
        }

        $this->recordAttempt((string) $request->getUserIP());

        return $this->asJson(['success' => true, 'token' => $token]);
    }

    // ------------------------------------------------------------------ helpers

    private function fail(string $error, int $status): Response
    {
        $this->recordAttempt((string) Craft::$app->getRequest()->getUserIP());
        Craft::$app->getResponse()->setStatusCode($status);
        return $this->asJson(['success' => false, 'error' => $error]);
    }

    /** Same canonical form the client produces, so lookups always match. */
    private function normalizeKey(string $raw): string
    {
        $value = preg_replace('/[^A-Z0-9]/', '', strtoupper(trim($raw)));
        if (!is_string($value) || strlen($value) < 12 || strlen($value) > 64) {
            return '';
        }
        if (str_starts_with($value, 'CCRM') && strlen($value) === 20) {
            return 'CCRM-' . implode('-', str_split(substr($value, 4), 4));
        }
        return $value;
    }

    private function findLicense(string $key): ?Entry
    {
        /** @var Entry|null $entry */
        $entry = Entry::find()
            ->section(self::SECTION)
            ->siteId('*')
            ->unique(true)
            // Disabled entries are simply not licences. Leaving them out here
            // means "disable the entry" is a second way to suspend a customer.
            ->status(Entry::STATUS_LIVE)
            ->licenseKey($key)
            ->one();

        return $entry;
    }

    /**
     * Record this installation against the licence.
     *
     * Returns false when the licence has no room left. Idempotent: an install
     * that is already bound re-validates for ever without touching the entry.
     */
    private function bindInstance(Entry $entry, string $instance): bool
    {
        $raw = (string) ($entry->licenseInstances ?? '');
        $bound = array_values(array_filter(array_map('trim', preg_split('/\R/', $raw) ?: [])));

        if (in_array($instance, $bound, true)) {
            return true;
        }

        $maxInstances = (int) ($entry->licenseMaxInstances ?? 0);
        if ($maxInstances <= 0) {
            $maxInstances = 1;
        }
        if (count($bound) >= $maxInstances) {
            return false;
        }

        $bound[] = $instance;
        $entry->setFieldValue('licenseInstances', implode("\n", $bound));

        if (!Craft::$app->getElements()->saveElement($entry)) {
            // Refusing here would lock out a legitimate customer over a Craft
            // save error. Log it and let them through — the binding is a support
            // aid, not the security boundary; the signature is.
            Craft::error(
                '[ccrm licence] could not record instance binding: ' . json_encode($entry->getErrors()),
                __METHOD__
            );
        }
        return true;
    }

    private function rateKey(string $ip): string
    {
        return 'ccrm-license-rate:' . md5($ip);
    }

    private function isRateLimited(string $ip): bool
    {
        $count = (int) Craft::$app->getCache()->get($this->rateKey($ip));
        return $count >= self::RATE_LIMIT;
    }

    private function recordAttempt(string $ip): void
    {
        $cache = Craft::$app->getCache();
        $key = $this->rateKey($ip);
        $count = (int) $cache->get($key);
        // A fixed window, not a sliding one: cruder, but it needs no storage
        // beyond one integer and it cannot be walked around by pacing requests.
        $cache->set($key, $count + 1, self::RATE_WINDOW);
    }
}
