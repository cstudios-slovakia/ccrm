<?php
/**
 * Shared helpers of the Villatesta importer (extract.php, load.php).
 * See README.md and "Claude outputs/villatesta-migration/PLAN.md".
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("CLI only\n");
}

/** Command line: --flag, --key=value. Anything else is collected in 'args'. */
function vt_cli(array $argv): array {
    $out = ['args' => []];
    foreach (array_slice($argv, 1) as $a) {
        if (preg_match('/^--([a-z0-9-]+)=(.*)$/si', $a, $m)) {
            $out[$m[1]] = $m[2];
        } elseif (preg_match('/^--([a-z0-9-]+)$/si', $a, $m)) {
            $out[$m[1]] = true;
        } else {
            $out['args'][] = $a;
        }
    }
    return $out;
}

/**
 * Counts and warnings of one run. Every skipped row gets a reason, so nothing
 * disappears silently; the report is written next to the data (or printed).
 */
class VtReport {
    public array $counts = [];
    public array $warnings = [];
    public array $skipped = [];
    public array $notes = [];

    public function count(string $key, int $n = 1): void {
        $this->counts[$key] = ($this->counts[$key] ?? 0) + $n;
    }

    public function set(string $key, int $n): void {
        $this->counts[$key] = $n;
    }

    public function warn(string $entity, string $message): void {
        $this->warnings[$entity][] = $message;
    }

    public function skip(string $entity, string $reason, $ref = null): void {
        $this->skipped[$entity][$reason][] = $ref;
    }

    public function note(string $text): void {
        $this->notes[] = $text;
    }

    public function toArray(): array {
        $skipped = [];
        foreach ($this->skipped as $entity => $reasons) {
            foreach ($reasons as $reason => $refs) {
                $skipped[$entity][$reason] = ['count' => count($refs), 'sample' => array_slice(array_values(array_filter($refs, fn($r) => $r !== null)), 0, 20)];
            }
        }
        ksort($this->counts);
        return ['counts' => $this->counts, 'skipped' => $skipped, 'warnings' => $this->warnings, 'notes' => $this->notes];
    }

    public function toMarkdown(string $title): string {
        $r = $this->toArray();
        $md = "# {$title}\n\n";
        $md .= "| What | Count |\n|---|---|\n";
        foreach ($r['counts'] as $k => $n) $md .= "| {$k} | {$n} |\n";
        if ($r['skipped']) {
            $md .= "\n## Skipped\n\n";
            foreach ($r['skipped'] as $entity => $reasons) {
                foreach ($reasons as $reason => $info) {
                    $md .= "- **{$entity}**: {$reason}: {$info['count']}";
                    if ($info['sample']) $md .= ' (e.g. ' . implode(', ', array_map(fn($s) => is_scalar($s) ? (string)$s : json_encode($s, JSON_UNESCAPED_UNICODE), array_slice($info['sample'], 0, 8))) . ')';
                    $md .= "\n";
                }
            }
        }
        if ($r['warnings']) {
            $md .= "\n## Warnings\n\n";
            foreach ($r['warnings'] as $entity => $list) {
                $md .= "**{$entity}** (" . count($list) . ")\n";
                foreach (array_slice($list, 0, 30) as $w) $md .= "- {$w}\n";
                if (count($list) > 30) $md .= '- … ' . (count($list) - 30) . " more\n";
            }
        }
        if ($r['notes']) {
            $md .= "\n## Notes\n\n";
            foreach ($r['notes'] as $n) $md .= "- {$n}\n";
        }
        return $md;
    }
}

/** Trim and collapse the whitespace of a name or a one-line value; null for empty. */
function vt_clean($v): ?string {
    if ($v === null) return null;
    $s = trim((string)preg_replace('/\s+/u', ' ', (string)$v));
    return $s === '' ? null : $s;
}

/** Trim a multi-line text, keeping line breaks; null for empty. */
function vt_text($v): ?string {
    if ($v === null) return null;
    $s = trim(str_replace(["\r\n", "\r"], "\n", (string)$v));
    return $s === '' ? null : $s;
}

/** The ids ccrm_mail_event_id() (api/mail_broker.php) builds. Copied so extract.php needs no CRM code; load.php asserts they agree. */
function vt_mail_event_id(string $accountUser, string $folder, int $uid): string {
    $scope = substr(sha1(strtolower(trim($accountUser)) . '|' . strtolower(trim($folder))), 0, 12);
    $tag = strtolower(preg_replace('/[^a-z0-9]/i', '', $folder));
    $tag = $tag === '' ? 'box' : substr($tag, 0, 8);
    return 'email-' . $tag . '-' . $scope . '-' . $uid;
}

/** The name a file keeps in uploads/ (mirrors ccrm_safe_upload_name() in api/auth.php for the common cases). */
function vt_safe_name(string $name): string {
    $name = basename(str_replace('\\', '/', str_replace("\0", '', $name)));
    $name = ltrim($name, '.');
    $name = preg_replace('/[^A-Za-z0-9._\- ]+/', '_', $name);
    $name = trim((string)$name);
    if ($name === '' || $name === '_') $name = 'file';
    if (strlen($name) > 120) {
        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $name = substr($name, 0, 120 - strlen($ext) - 1) . ($ext !== '' ? '.' . $ext : '');
    }
    return $name;
}

function vt_json_write(string $path, $data): void {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE));
}

function vt_json_read(string $path) {
    if (!is_file($path)) throw new RuntimeException("Missing {$path} - run extract.php first");
    $data = json_decode(file_get_contents($path), true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) throw new RuntimeException("{$path}: " . json_last_error_msg());
    return $data;
}

/** Plain text of an HTML mail body. */
function vt_html_to_text(string $html): string {
    $html = preg_replace('~<(style|script|head)\b.*?</\1>~is', '', $html);
    $html = preg_replace('~<\s*br\s*/?>|</(p|div|tr|li|h[1-6])>~i', "\n", $html);
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text);
    $text = preg_replace("/[ \t]*\n[ \t]*/", "\n", $text);
    return trim((string)preg_replace("/\n{3,}/", "\n\n", $text));
}

/** The most compact "1.5 MB" label, like the app's own upload code writes. */
function vt_size_label($bytes): string {
    $b = (float)$bytes;
    if ($b <= 0) return '';
    if ($b >= 1048576) return round($b / 1048576, 1) . ' MB';
    return max(1, round($b / 1024)) . ' KB';
}

function vt_read_jsonl(string $path): Generator {
    $fh = fopen($path, 'rb');
    if (!$fh) throw new RuntimeException("Missing {$path} - run extract.php first");
    while (($line = fgets($fh)) !== false) {
        $line = trim($line);
        if ($line !== '') yield json_decode($line, true);
    }
    fclose($fh);
}
