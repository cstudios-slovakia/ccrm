<?php
/**
 * Every outbound sender (ccrm_send_system_mail, send_smtp_email, the password-reset sender and the
 * newsletter client) asks this before it opens a connection.
 *
 * Domains reserved by RFC 2606 / RFC 6761 can never receive mail. Test and demo data uses them
 * (the API probes create `probe-editor@probe.test` and friends), so sending to one only makes the
 * real mail server bounce it back to the sender's mailbox: a probe run copied the dev database
 * with its live SMTP profile and filled the owner's inbox with "Undelivered Mail Returned to
 * Sender". Refusing here costs nothing in production and stops that for any future test.
 */

if (!function_exists('ccrm_mail_reserved_domain')) {

    /** The reserved domain of $email, or null when the address may be sent to. */
    function ccrm_mail_reserved_domain(string $email): ?string {
        $at = strrpos($email, '@');
        if ($at === false) {
            return null;
        }
        $domain = strtolower(rtrim(trim(substr($email, $at + 1)), '.'));
        if ($domain === '') {
            return null;
        }
        if (in_array($domain, ['example.com', 'example.net', 'example.org', 'localhost'], true)) {
            return $domain;
        }
        foreach (['example.com', 'example.net', 'example.org'] as $base) {
            if (str_ends_with($domain, '.' . $base)) {
                return $domain;
            }
        }
        $dot = strrpos($domain, '.');
        $tld = $dot === false ? $domain : substr($domain, $dot + 1);
        return in_array($tld, ['test', 'example', 'invalid', 'localhost'], true) ? $domain : null;
    }

    /** Throws before any connection when $email is at a reserved domain. */
    function ccrm_mail_refuse_reserved(string $email): void {
        $domain = ccrm_mail_reserved_domain($email);
        if ($domain !== null) {
            throw new Exception('Not sent: ' . $domain . ' is a reserved domain that can never receive mail (' . trim($email) . ').');
        }
    }
}
