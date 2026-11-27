<?php
/**
 * Newsletter public pages (docs/NEWSLETTER.md C11): no session, no SPA, plain server-rendered HTML
 * with inline CSS, in the system language, showing the company's name.
 *
 *   GET  ?a=unsubscribe&t=<token>   shows the question and an Unsubscribe button (a GET never unsubscribes:
 *                                   mail scanners prefetch links)
 *   POST ?a=unsubscribe&t=<token>   the button, or RFC 8058 one-click (body List-Unsubscribe=One-Click);
 *                                   idempotent; one-click answers 200 with an empty body
 *   GET  ?a=view&t=<token>          the campaign's html snapshot with this recipient's merge values
 *   t=test                          "This is a test e-mail"
 *   unknown token                   404 "This link is no longer valid"
 *
 * The token is the secret (128 random bits, newsletter_recipients.token); the full address is
 * never shown. Prepared statements throughout.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/brand.php';
require_once __DIR__ . '/newsletter_lib.php';
require_once __DIR__ . '/newsletter_merge.php';

if (!function_exists('ccrm_newsletter_mask_email')) {

    /** `j•••@example.com`: the first character of the local part and the whole domain. */
    function ccrm_newsletter_mask_email(string $email): string {
        $at = strrpos($email, '@');
        if ($at === false || $at === 0) {
            return '•••';
        }
        return mb_substr($email, 0, 1, 'UTF-8') . '•••' . substr($email, $at);
    }

    /** `test` (the link in a test e-mail), `token` (32 hex characters) or `invalid`. */
    function ccrm_newsletter_token_kind($t): string {
        if ($t === 'test') {
            return 'test';
        }
        return is_string($t) && preg_match('/^[0-9a-f]{32}$/', $t) ? 'token' : 'invalid';
    }

    /** RFC 8058: the POST body is `List-Unsubscribe=One-Click`. */
    function ccrm_newsletter_is_one_click(array $post, string $rawBody): bool {
        return ($post['List-Unsubscribe'] ?? '') === 'One-Click' || trim($rawBody) === 'List-Unsubscribe=One-Click';
    }

    /** One of en | sk | hu. */
    function ccrm_newsletter_public_lang($setting): string {
        return in_array($setting, ['en', 'sk', 'hu'], true) ? $setting : 'sk';
    }

    /** The texts of the public pages. {company} is filled by ccrm_newsletter_public_text(). */
    function ccrm_newsletter_public_strings(): array {
        return [
            'ask_title' => ['en' => 'Unsubscribe', 'sk' => 'Odhlásenie z odberu', 'hu' => 'Leiratkozás'],
            'ask' => [
                'en' => 'Do you want to stop receiving e-mails from {company}?',
                'sk' => 'Chcete prestať dostávať e-maily od {company}?',
                'hu' => 'Szeretne leiratkozni a(z) {company} e-mailjeiről?',
            ],
            'button' => ['en' => 'Unsubscribe', 'sk' => 'Odhlásiť', 'hu' => 'Leiratkozás'],
            'done_title' => ['en' => 'You have been unsubscribed', 'sk' => 'Boli ste odhlásený', 'hu' => 'Leiratkozott'],
            'done' => [
                'en' => 'You will not receive any more e-mails from {company}.',
                'sk' => 'Od {company} už nebudete dostávať žiadne e-maily.',
                'hu' => 'A(z) {company} többé nem küld Önnek e-mailt.',
            ],
            'already_title' => ['en' => 'You are already unsubscribed', 'sk' => 'Už ste odhlásený', 'hu' => 'Már leiratkozott'],
            'already' => [
                'en' => 'This address does not receive e-mails from {company}.',
                'sk' => 'Táto adresa nedostáva e-maily od {company}.',
                'hu' => 'Erre a címre a(z) {company} nem küld e-mailt.',
            ],
            'test_title' => ['en' => 'This is a test e-mail', 'sk' => 'Toto je testovací e-mail', 'hu' => 'Ez egy teszt e-mail'],
            'test' => [
                'en' => 'The link works in the real campaign.',
                'sk' => 'V skutočnej kampani odkaz funguje.',
                'hu' => 'A hivatkozás a valódi kampányban működik.',
            ],
            'invalid_title' => ['en' => 'This link is no longer valid', 'sk' => 'Tento odkaz už nie je platný', 'hu' => 'Ez a hivatkozás már nem érvényes'],
            'invalid' => [
                'en' => 'The e-mail may be too old, or the link was copied incompletely.',
                'sk' => 'E-mail môže byť príliš starý alebo bol odkaz skopírovaný neúplne.',
                'hu' => 'Lehet, hogy az e-mail túl régi, vagy a hivatkozás hiányosan lett másolva.',
            ],
            'this_sender' => ['en' => 'this sender', 'sk' => 'tohto odosielateľa', 'hu' => 'ettől a feladótól'],
        ];
    }

    /** The plain text of a page string; an empty company becomes "this sender" (the product name is never shown). */
    function ccrm_newsletter_public_raw(string $key, string $lang, string $company = ''): string {
        $s = ccrm_newsletter_public_strings();
        $text = $s[$key][$lang] ?? ($s[$key]['en'] ?? '');
        return str_replace('{company}', $company !== '' ? $company : ($s['this_sender'][$lang] ?? 'this sender'), $text);
    }

    /** Same, HTML-escaped. */
    function ccrm_newsletter_public_text(string $key, string $lang, string $company = ''): string {
        return ccrm_newsletter_html_escape(ccrm_newsletter_public_raw($key, $lang, $company));
    }

    /** A complete small page. $bodyHtml is already escaped. */
    function ccrm_newsletter_public_page(string $lang, string $title, string $bodyHtml, string $company = ''): string {
        $brand = $company !== '' ? '<p class="brand">' . ccrm_newsletter_html_escape($company) . '</p>' : '';
        return '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
            . '<title>' . ccrm_newsletter_html_escape($title) . '</title><style>'
            . 'body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b}'
            . 'main{max-width:440px;margin:12vh auto 0;background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(15,23,42,.12)}'
            . 'h1{font-size:20px;margin:0 0 12px}p{font-size:15px;line-height:1.5;margin:0 0 16px}'
            . '.brand{font-size:13px;color:#64748b;margin-bottom:20px}.addr{font-weight:bold}'
            . 'button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:11px 22px;font-size:15px;cursor:pointer}'
            . 'button:hover{background:#1d4ed8}@media(max-width:480px){main{margin:0;border-radius:0;min-height:100vh;box-sizing:border-box}}'
            . '</style></head><body><main>' . $brand . '<h1>' . ccrm_newsletter_html_escape($title) . '</h1>' . $bodyHtml . '</main></body></html>';
    }

    /**
     * Record the unsubscribe (idempotent): the suppression (first reason wins), this recipient row's
     * `unsubscribed_at` (first time wins) and every still-queued row of the address.
     */
    function ccrm_newsletter_unsubscribe(\PDO $pdo, array $recipient): void {
        $now = gmdate('Y-m-d H:i:s');
        $email = mb_strtolower((string)$recipient['email'], 'UTF-8');
        $pdo->prepare(
            "INSERT IGNORE INTO `newsletter_suppressions` (`email`, `reason`, `campaign_id`, `note`, `created_by`, `created_at`)
             VALUES (?, 'unsubscribed', ?, NULL, NULL, ?)"
        )->execute([$email, (string)$recipient['campaign_id'], $now]);
        $pdo->prepare("UPDATE `newsletter_recipients` SET `unsubscribed_at` = COALESCE(`unsubscribed_at`, ?) WHERE `id` = ?")
            ->execute([$now, $recipient['id']]);
        $pdo->prepare("UPDATE `newsletter_recipients` SET `status` = 'skipped', `skip_reason` = 'unsubscribed' WHERE `email` = ? AND `status` = 'queued'")
            ->execute([$email]);
    }

    function ccrm_newsletter_public_respond(int $status, string $html): void {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }

    function ccrm_newsletter_public_main(): void {
        header('X-Robots-Tag: noindex');
        header('Referrer-Policy: no-referrer');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src * data:; form-action 'self'");

        $lang = 'sk';
        $company = '';
        $pdo = null;
        try {
            $configFile = dirname(__DIR__) . '/config.php';
            if (file_exists($configFile)) {
                require_once $configFile;
                $pdo = get_db_connection();
                $row = $pdo->query("SELECT `value` FROM `system_settings` WHERE `key` = 'SYSTEM_LANGUAGE'")->fetchColumn();
                $lang = ccrm_newsletter_public_lang($row);
                require_once __DIR__ . '/newsletter_send.php';
                $company = ccrm_newsletter_company_name($pdo);
            }
        } catch (\Throwable $e) {
            $pdo = null;
        }
        $page = function (string $titleKey, string $bodyKey, string $extra = '') use ($lang, $company): string {
            return ccrm_newsletter_public_page($lang, ccrm_newsletter_public_raw($titleKey, $lang), '<p>' . ccrm_newsletter_public_text($bodyKey, $lang, $company) . '</p>' . $extra, $company);
        };
        $invalid = fn() => ccrm_newsletter_public_respond(404, $page('invalid_title', 'invalid'));

        $action = (string)($_GET['a'] ?? '');
        $token = $_GET['t'] ?? '';
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (!in_array($action, ['unsubscribe', 'view'], true) || !in_array($method, ['GET', 'HEAD', 'POST'], true)) {
            $invalid();
        }
        if ($method === 'POST' && $action !== 'unsubscribe') {
            ccrm_newsletter_public_respond(405, $page('invalid_title', 'invalid'));
        }
        $kind = ccrm_newsletter_token_kind($token);
        if ($kind === 'test') {
            ccrm_newsletter_public_respond(200, $page('test_title', 'test'));
        }
        if ($kind !== 'token' || $pdo === null) {
            $invalid();
        }

        try {
            $stmt = $pdo->prepare(
                "SELECT r.`id`, r.`campaign_id`, r.`email`, r.`merge_json`, r.`token`, r.`unsubscribed_at`, c.`html_snapshot`, c.`deleted_at`
                   FROM `newsletter_recipients` r JOIN `newsletter_campaigns` c ON c.`id` = r.`campaign_id`
                  WHERE r.`token` = ? LIMIT 1"
            );
            $stmt->execute([$token]);
            $rec = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            $rec = false;
        }
        if (!$rec) {
            $invalid();
        }

        try {
            if ($action === 'view') {
                if ($rec['deleted_at'] !== null || (string)$rec['html_snapshot'] === '') {
                    $invalid();
                }
                $merge = json_decode((string)$rec['merge_json'], true);
                // Anonymous request: never build links from its Host header (auth.php docblock).
                $base = ccrm_app_base_url($pdo, false);
                $values = ccrm_newsletter_values_for(is_array($merge) ? $merge : [], (string)$rec['email'], (string)$rec['token'], $base, $company);
                ccrm_newsletter_public_respond(200, ccrm_newsletter_substitute((string)$rec['html_snapshot'], $values, 'html', 'send'));
            }

            // unsubscribe
            if ($method === 'POST') {
                $oneClick = ccrm_newsletter_is_one_click($_POST, (string)file_get_contents('php://input'));
                ccrm_newsletter_unsubscribe($pdo, $rec);
                if ($oneClick) {
                    http_response_code(200);
                    header('Content-Type: text/plain; charset=utf-8');
                    exit;
                }
                ccrm_newsletter_public_respond(200, $page('done_title', 'done'));
            }
            $sup = $pdo->prepare("SELECT 1 FROM `newsletter_suppressions` WHERE `email` = ?");
            $sup->execute([mb_strtolower((string)$rec['email'], 'UTF-8')]);
            if ($rec['unsubscribed_at'] !== null || $sup->fetchColumn()) {
                ccrm_newsletter_public_respond(200, $page('already_title', 'already'));
            }
            $form = '<p class="addr">' . ccrm_newsletter_html_escape(ccrm_newsletter_mask_email((string)$rec['email'])) . '</p>'
                . '<form method="post" action="?a=unsubscribe&amp;t=' . ccrm_newsletter_html_escape((string)$rec['token']) . '">'
                . '<button type="submit">' . ccrm_newsletter_public_text('button', $lang) . '</button></form>';
            ccrm_newsletter_public_respond(200, $page('ask_title', 'ask', $form));
        } catch (\Throwable $e) {
            if (function_exists('ccrm_log_exception')) {
                ccrm_log_exception($e);
            }
            ccrm_newsletter_public_respond(500, $page('invalid_title', 'invalid'));
        }
    }
}

// Runs only when this file is the requested script (the PHP test includes it for the pure functions above).
if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === 'newsletter_public.php') {
    ccrm_newsletter_public_main();
}
