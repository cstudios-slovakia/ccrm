<?php
/**
 * Newsletter mailer (docs/NEWSLETTER.md C10): the MIME message and a small SMTP client.
 *
 * mail_broker.php has no reusable SMTP steps (send_smtp_email() and ccrm_send_system_mail() open,
 * talk and close in one function, one connection per message), so a newsletter batch cannot use
 * them: it needs ONE session for many messages. The client below does the same handshake as
 * ccrm_send_system_mail() (implicit SSL on 465, STARTTLS on 587 or "tls", AUTH LOGIN) and reads the
 * same profile (INTEGRATIONS_CONFIG, Settings > E-mail > Outgoing).
 *
 * The MIME builder is a pure function: scripts/test-newsletter.php checks it without a server.
 * Line ends are CRLF everywhere. Dot-stuffing happens when the client writes DATA, never in the
 * builder, so the stored/printed message is the real message.
 */

if (!function_exists('ccrm_newsletter_build_message')) {

    /** A header value without line breaks (a value can never end the header block early). */
    function ccrm_newsletter_header_value(string $v): string {
        return trim(preg_replace('/[\x00-\x1F\x7F]+/', ' ', $v));
    }

    /**
     * Quoted-printable (RFC 2045) with CRLF line ends and lines of at most 76 characters
     * (soft line break "=" included). Trailing space and tab are encoded.
     */
    function ccrm_newsletter_qp_encode(string $s): string {
        $s = str_replace(["\r\n", "\r"], "\n", $s);
        $out = [];
        foreach (explode("\n", $s) as $line) {
            $n = strlen($line);
            $res = '';
            $cur = 0;
            for ($i = 0; $i < $n; $i++) {
                $o = ord($line[$i]);
                $last = $i === $n - 1;
                $encode = $o === 61 || $o > 126 || ($o < 32 && $o !== 9) || (($o === 32 || $o === 9) && $last);
                $tok = $encode ? sprintf('=%02X', $o) : $line[$i];
                $len = strlen($tok);
                // 75 leaves room for the "=" of a soft break; the last token of a line may use column 76.
                if ($cur + $len > 75 && !($last && $cur + $len <= 76)) {
                    $res .= "=\r\n";
                    $cur = 0;
                }
                $res .= $tok;
                $cur += $len;
            }
            $out[] = $res;
        }
        return implode("\r\n", $out);
    }

    /**
     * Text for a header (RFC 2047): plain ASCII stays as it is; anything else becomes B-encoded
     * UTF-8 words of at most 75 characters, never split inside a character, folded with CRLF + space.
     */
    function ccrm_newsletter_encode_header_text(string $s): string {
        $s = ccrm_newsletter_header_value($s);
        if ($s === '') {
            return '';
        }
        if (preg_match('/^[\x20-\x7E]+$/', $s) && strlen($s) <= 60) {
            return $s;
        }
        if (!preg_match('//u', $s)) {
            $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        }
        $words = [];
        $chunk = '';
        foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) {
            if (strlen($chunk) + strlen($ch) > 42) {
                $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
                $chunk = '';
            }
            $chunk .= $ch;
        }
        if ($chunk !== '') {
            $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
        }
        return implode("\r\n ", $words);
    }

    /** `"Name" <a@b.c>` with a quoted ASCII name or an RFC 2047 name; just `<a@b.c>` without a name. */
    function ccrm_newsletter_address_header(string $name, string $email): string {
        $name = ccrm_newsletter_header_value($name);
        $email = ccrm_newsletter_header_value($email);
        if ($name === '') {
            return '<' . $email . '>';
        }
        if (preg_match('/^[\x20-\x7E]+$/', $name)) {
            return '"' . addcslashes($name, "\"\\") . '" <' . $email . '>';
        }
        return ccrm_newsletter_encode_header_text($name) . ' <' . $email . '>';
    }

    /** `<nl.<campaign>.<recipient>.<random>@<domain of the From address>>` (C10). */
    function ccrm_newsletter_message_id(string $campaignId, string $recipientId, string $fromEmail): string {
        $at = strrpos($fromEmail, '@');
        $domain = $at !== false ? substr($fromEmail, $at + 1) : 'localhost';
        $domain = preg_replace('/[^A-Za-z0-9.\-]/', '', $domain);
        return '<nl.' . preg_replace('/[^A-Za-z0-9\-]/', '', $campaignId) . '.' . preg_replace('/[^A-Za-z0-9\-]/', '', $recipientId)
            . '.' . bin2hex(random_bytes(6)) . '@' . ($domain !== '' ? $domain : 'localhost') . '>';
    }

    /**
     * One complete message (C10): multipart/alternative with text/plain then text/html, both UTF-8
     * quoted-printable, CRLF line ends, no dot-stuffing.
     *
     * @param array{
     *   fromEmail: string, fromName?: string, toEmail: string, toName?: string, replyTo?: string,
     *   subject: string, text: string, html: string, messageId: string, unsubscribeUrl: string,
     *   campaignId: string, date?: string, boundary?: string
     * } $p
     */
    function ccrm_newsletter_build_message(array $p): string {
        $boundary = $p['boundary'] ?? ('nl-' . bin2hex(random_bytes(12)));
        $h = [];
        $h[] = 'Date: ' . ($p['date'] ?? gmdate('D, d M Y H:i:s') . ' +0000');
        $h[] = 'From: ' . ccrm_newsletter_address_header($p['fromName'] ?? '', $p['fromEmail']);
        $h[] = 'To: ' . ccrm_newsletter_address_header($p['toName'] ?? '', $p['toEmail']);
        $replyTo = trim((string)($p['replyTo'] ?? ''));
        if ($replyTo !== '') {
            $h[] = 'Reply-To: <' . ccrm_newsletter_header_value($replyTo) . '>';
        }
        $h[] = 'Subject: ' . ccrm_newsletter_encode_header_text($p['subject']);
        $h[] = 'Message-ID: ' . ccrm_newsletter_header_value($p['messageId']);
        $h[] = 'MIME-Version: 1.0';
        $h[] = 'List-Unsubscribe: <' . ccrm_newsletter_header_value($p['unsubscribeUrl']) . '>';
        $h[] = 'List-Unsubscribe-Post: List-Unsubscribe=One-Click';
        $h[] = 'X-Newsletter-Campaign: ' . ccrm_newsletter_header_value($p['campaignId']);
        $h[] = 'Precedence: bulk';
        $h[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';

        $part = fn(string $type, string $body): string =>
            '--' . $boundary . "\r\n"
            . 'Content-Type: ' . $type . "; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
            . ccrm_newsletter_qp_encode($body) . "\r\n";

        return implode("\r\n", $h) . "\r\n\r\n"
            . $part('text/plain', $p['text'])
            . $part('text/html', $p['html'])
            . '--' . $boundary . "--\r\n";
    }

    /** The bytes written for DATA: CRLF line ends and a leading "." doubled (RFC 5321 4.5.2). */
    function ccrm_newsletter_dot_stuff(string $message): string {
        $wire = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        return preg_replace('/^\./m', '..', $wire);
    }
}

if (!class_exists('ccrm_newsletter_smtp_error')) {

    /**
     * An SMTP failure. `stage`: connect | auth | mail | rcpt | data | body. `smtpCode`: the reply
     * code, 0 when there was none. `dropped`: the connection is gone (timeout, closed, 421).
     */
    class ccrm_newsletter_smtp_error extends \RuntimeException {
        /** @var string */
        public $stage;
        /** @var int */
        public $smtpCode;
        /** @var bool */
        public $dropped;
        public function __construct(string $stage, string $message, int $smtpCode = 0, bool $dropped = false) {
            parent::__construct($message);
            $this->stage = $stage;
            $this->smtpCode = $smtpCode;
            $this->dropped = $dropped;
        }
        /** 4xx: try again later. */
        public function isTransient(): bool {
            return $this->dropped || ($this->smtpCode >= 400 && $this->smtpCode < 500);
        }
        /** The recipient mailbox does not exist (550 / 551 / 553 on RCPT TO): suppress it. */
        public function isHardBounce(): bool {
            return $this->stage === 'rcpt' && in_array($this->smtpCode, [550, 551, 553], true);
        }
    }
}

if (!class_exists('ccrm_newsletter_smtp')) {

    /** One SMTP session for many messages (a batch). Never logs or returns the password. */
    class ccrm_newsletter_smtp {
        /** @var resource|null */
        private $socket = null;

        /**
         * The connection settings of the system mail profile, the way ccrm_send_system_mail() reads
         * them. Pure.
         *
         * @param array $config ccrm_load_integrations_config()
         * @return array{host: string, port: int, secure: string, user: string, pass: string, auth: bool, from: string, serverName: string}
         *         secure: ssl (implicit TLS) | starttls | none
         * @throws ccrm_newsletter_smtp_error stage `connect` / `auth` when the profile is incomplete
         */
        public static function profile(array $config, string $serverName = 'localhost'): array {
            $provider = $config['emailProvider'] ?? ($config['provider'] ?? 'smtp');
            $host = (string)($config['smtpHost'] ?? '');
            $port = (int)($config['smtpPort'] ?? 0);
            $sec = $config['smtpSecure'] ?? 'ssl';
            $user = (string)($config['smtpUser'] ?? '');
            $pass = (string)($config['smtpPassword'] ?? '');
            $auth = ($config['smtpAuth'] ?? true) !== false;
            if ($provider === 'exchange') {
                $host = 'smtp.office365.com';
                $port = 587;
                $sec = 'tls';
                $auth = true;
                $user = (string)($config['exchMailbox'] ?? '');
                $pass = (string)($config['exchPassword'] ?? '');
            }
            if ($host === '' || $port <= 0) {
                throw new ccrm_newsletter_smtp_error('connect', 'The outgoing mail server is not configured.');
            }
            if ($auth && ($user === '' || $pass === '')) {
                throw new ccrm_newsletter_smtp_error('auth', 'SMTP authentication is on but the user name or password is missing.');
            }
            $starttls = $port === 587 || $sec === 'tls';
            $secure = $starttls ? 'starttls' : (($sec === 'ssl' || $sec === true) ? 'ssl' : 'none');
            $from = trim((string)($config['senderEmail'] ?? ''));
            if ($from === '') {
                $from = $user;
            }
            if (!preg_match('/^[A-Za-z0-9.\-]{1,253}$/', $serverName)) {
                $serverName = 'localhost';
            }
            return ['host' => $host, 'port' => $port, 'secure' => $secure, 'user' => $user, 'pass' => $pass, 'auth' => $auth,
                'from' => $from, 'serverName' => $serverName];
        }

        /** Connect and log in. @throws ccrm_newsletter_smtp_error stage connect / auth */
        public function open(array $profile): void {
            $target = ($profile['secure'] === 'ssl' ? 'ssl://' : '') . $profile['host'];
            $socket = @fsockopen($target, $profile['port'], $errno, $errstr, 10);
            if (!$socket) {
                throw new ccrm_newsletter_smtp_error('connect', "Could not connect to the mail server {$profile['host']}:{$profile['port']} ($errstr)", 0, true);
            }
            $this->attach($socket);
            $this->handshake($profile);
        }

        /** Use an already open stream (open() does; the test uses a scripted one). */
        public function attach($stream): void {
            $this->socket = $stream;
            @stream_set_timeout($this->socket, 20);
        }

        public function handshake(array $profile): void {
            $this->expect($this->readReply(), ['220'], 'connect');
            $ehlo = 'EHLO ' . $profile['serverName'];
            $this->command($ehlo);
            $this->expect($this->readReply(), ['250'], 'connect');
            if ($profile['secure'] === 'starttls') {
                $this->command('STARTTLS');
                $this->expect($this->readReply(), ['220'], 'connect');
                if (!@stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new ccrm_newsletter_smtp_error('connect', 'The TLS handshake with the mail server failed.', 0, true);
                }
                $this->command($ehlo);
                $this->expect($this->readReply(), ['250'], 'connect');
            }
            if ($profile['auth']) {
                $this->command('AUTH LOGIN');
                $this->expect($this->readReply(), ['334'], 'auth');
                $this->command(base64_encode($profile['user']));
                $this->expect($this->readReply(), ['334'], 'auth');
                $this->command(base64_encode($profile['pass']));
                $this->expect($this->readReply(), ['235'], 'auth');
            }
        }

        /**
         * One message. After a rejected recipient or sender the session is reset (RSET) and stays
         * usable, unless the error is `dropped`.
         *
         * @throws ccrm_newsletter_smtp_error
         */
        public function send(string $envelopeFrom, string $to, string $message): void {
            try {
                $this->command('MAIL FROM:<' . $envelopeFrom . '>');
                $this->expect($this->readReply(), ['250'], 'mail');
                $this->command('RCPT TO:<' . $to . '>');
                $this->expect($this->readReply(), ['250', '251'], 'rcpt');
                $this->command('DATA');
                $this->expect($this->readReply(), ['354'], 'data');
            } catch (ccrm_newsletter_smtp_error $e) {
                $this->reset($e);
                throw $e;
            }
            $wire = ccrm_newsletter_dot_stuff($message);
            if (substr($wire, -2) !== "\r\n") {
                $wire .= "\r\n";
            }
            $this->write($wire . ".\r\n");
            try {
                $this->expect($this->readReply(), ['250'], 'body');
            } catch (ccrm_newsletter_smtp_error $e) {
                $this->reset($e);
                throw $e;
            }
        }

        public function close(): void {
            if ($this->socket) {
                try {
                    $this->command('QUIT');
                } catch (\Throwable $e) {
                }
                @fclose($this->socket);
                $this->socket = null;
            }
        }

        /** RSET after a rejection, so the next message starts clean. A dead connection is left alone. */
        private function reset(ccrm_newsletter_smtp_error $cause): void {
            if ($cause->dropped) {
                return;
            }
            try {
                $this->command('RSET');
                $this->readReply();
            } catch (\Throwable $e) {
            }
        }

        private function write(string $data): void {
            $len = strlen($data);
            $done = 0;
            while ($done < $len) {
                $n = @fwrite($this->socket, substr($data, $done));
                if ($n === false || $n === 0) {
                    throw new ccrm_newsletter_smtp_error('connect', 'The connection to the mail server was lost.', 0, true);
                }
                $done += $n;
            }
        }

        private function command(string $cmd): void {
            $this->write($cmd . "\r\n");
        }

        /** A whole reply (multi-line "250-..." replies up to the "250 " line). @return array{0: int, 1: string} */
        private function readReply(): array {
            $text = '';
            while (true) {
                $line = @fgets($this->socket, 2048);
                if ($line === false) {
                    $meta = @stream_get_meta_data($this->socket);
                    $timedOut = is_array($meta) && !empty($meta['timed_out']);
                    throw new ccrm_newsletter_smtp_error('connect', $timedOut ? 'The mail server did not answer in time.' : 'The connection to the mail server was lost.', 0, true);
                }
                $text .= $line;
                if (strlen($line) < 4 || $line[3] !== '-') {
                    break;
                }
            }
            return [(int)substr($text, 0, 3), trim($text)];
        }

        /** @param array{0: int, 1: string} $reply */
        private function expect(array $reply, array $codes, string $stage): void {
            if (in_array((string)$reply[0], $codes, true)) {
                return;
            }
            // 421: the server is closing the channel.
            throw new ccrm_newsletter_smtp_error($stage, $reply[1] !== '' ? $reply[1] : 'No reply from the mail server.', $reply[0], $reply[0] === 421);
        }
    }
}
