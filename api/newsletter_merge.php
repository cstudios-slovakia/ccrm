<?php
/**
 * Newsletter merge tags (docs/NEWSLETTER.md C9). Pure: no database, no globals.
 *
 * This is the PHP port of src/components/newsletter/builder/mergeTags.ts; the rules are the header
 * comment of that file. Both implementations run every case of
 * src/components/newsletter/builder/mergeTags.fixtures.json (scripts/test-newsletter.php), so they
 * cannot drift. Change one, change the other.
 *
 *   Syntax    {{tag}} or {{tag|fallback}}; only ASCII whitespace (space, tab, CR, LF) inside the braces.
 *   Order     a non-empty value, else a non-empty fallback, else '' (send) or the tag as written (preview).
 *   Text      subject and plain-text part: value and fallback as they are.
 *   HTML      a value is escaped once; a fallback (already escaped by the renderer) is decoded in one
 *             pass with a fixed map and then escaped once.
 */

if (!function_exists('ccrm_newsletter_substitute')) {

    /** The tag pattern of C9. No /u flag: the same bytes the JavaScript pattern sees as code units. */
    function ccrm_newsletter_tag_pattern(): string {
        return '/\{\{[ \t\r\n]*([A-Za-z0-9_]+)[ \t\r\n]*(?:\|([^{}]*))?\}\}/';
    }

    /** Same as JavaScript htmlEscape() in mergeTags.ts: & < > " ' (apostrophe as &#039;). */
    function ccrm_newsletter_html_escape(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML401, 'UTF-8');
    }

    /** One pass, no re-scanning (`&amp;lt;` becomes `&lt;`): exactly this map and nothing else. */
    function ccrm_newsletter_decode_fallback(string $value): string {
        return strtr($value, [
            '&amp;' => '&',
            '&lt;' => '<',
            '&gt;' => '>',
            '&quot;' => '"',
            '&#039;' => "'",
            '&#39;' => "'",
            '&apos;' => "'",
            '&nbsp;' => "\xC2\xA0",
        ]);
    }

    /**
     * @param array<string, mixed> $values tag name => value; only own string values count
     * @param string $context 'html' | 'text'
     * @param string $mode 'send' | 'preview'
     */
    function ccrm_newsletter_substitute(string $template, array $values, string $context = 'html', string $mode = 'send'): string {
        $html = $context === 'html';
        $out = preg_replace_callback(ccrm_newsletter_tag_pattern(), function (array $m) use ($values, $html, $mode): string {
            $tag = $m[1];
            $own = $values[$tag] ?? null;
            $value = is_string($own) ? $own : '';
            $fallback = isset($m[2]) ? trim($m[2], " \t\r\n") : '';
            if ($value !== '') {
                return $html ? ccrm_newsletter_html_escape($value) : $value;
            }
            if ($fallback !== '') {
                return $html ? ccrm_newsletter_html_escape(ccrm_newsletter_decode_fallback($fallback)) : $fallback;
            }
            return $mode === 'send' ? '' : $m[0];
        }, $template);
        // preg_replace_callback returns null only on a PCRE error (backtrack limit on a huge input).
        return $out === null ? $template : $out;
    }

    /** The distinct tag names used in $template, in order of first use. */
    function ccrm_newsletter_tag_names(string $template): array {
        $names = [];
        if (preg_match_all(ccrm_newsletter_tag_pattern(), $template, $all)) {
            foreach ($all[1] as $n) {
                $names[$n] = true;
            }
        }
        return array_keys($names);
    }

    /** `<base>/api/newsletter_public.php?a=<action>&t=<token>` (C9 table). */
    function ccrm_newsletter_public_url(string $base, string $action, string $token): string {
        return rtrim($base, '/') . '/api/newsletter_public.php?a=' . $action . '&t=' . rawurlencode($token);
    }

    /**
     * All eight tags of C9 for one recipient.
     *
     * @param array $merge the frozen `merge_json` (name, first_name, company, email)
     * @return array<string, string>
     */
    function ccrm_newsletter_values_for(array $merge, string $email, string $token, string $baseUrl, string $senderCompany, ?int $year = null): array {
        $get = fn(string $k): string => isset($merge[$k]) && is_scalar($merge[$k]) ? (string)$merge[$k] : '';
        return [
            'name' => $get('name'),
            'first_name' => $get('first_name'),
            'company' => $get('company'),
            'email' => $email !== '' ? $email : $get('email'),
            'unsubscribe_url' => ccrm_newsletter_public_url($baseUrl, 'unsubscribe', $token),
            'view_online_url' => ccrm_newsletter_public_url($baseUrl, 'view', $token),
            'sender_company' => $senderCompany,
            'current_year' => (string)($year ?? (int)gmdate('Y')),
        ];
    }
}
