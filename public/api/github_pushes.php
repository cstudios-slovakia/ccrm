<?php
/**
 * GitHub pushes: the pure parsing and matching behind api/github_webhook.php, plus the small SQL the
 * webhook and api/project_pushes.php share. No HTTP and no session in here, so every rule can be run
 * from the command line.
 *
 * A project is paired with a repository through `projects.github_repo` ("owner/name") and
 * `projects.github_branch` (the server branch; empty = the repository's default branch). GitHub
 * delivers each push to the webhook, which stores one `project_pushes` row per (delivery, project).
 */

if (!function_exists('ccrm_github_normalize_repo')) {

    /**
     * "owner/name" from what a person typed or pasted, or null when it is not a repository.
     * Strips a pasted https://github.com/ prefix, a trailing slash and a trailing ".git". The case is
     * kept as typed (matching is case-insensitive). Same rules as normalizeGithubRepo() in
     * src/utils/githubRepo.ts.
     */
    function ccrm_github_normalize_repo($raw): ?string {
        if (!is_string($raw)) {
            return null;
        }
        $v = trim($raw);
        $v = preg_replace('#^(?:https?://)?(?:www\.)?github\.com/#i', '', $v);
        $v = rtrim($v, '/');
        $v = preg_replace('/\.git\z/i', '', $v);
        // \A ... \z: a plain ^ ... $ lets $ match before a trailing newline.
        if (!preg_match('#\A([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/([A-Za-z0-9._-]{1,100})\z#', $v, $m)) {
            return null;
        }
        if ($m[2] === '.' || $m[2] === '..') {
            return null;
        }
        return $v;
    }

    /** The server branch: trimmed, at most 200 characters, no whitespace or control characters; otherwise null. */
    function ccrm_github_normalize_branch($raw): ?string {
        if (!is_string($raw)) {
            return null;
        }
        $v = trim($raw);
        // preg_match() is 1 for a bad character and false for invalid UTF-8: both are refused.
        if ($v === '' || mb_strlen($v, 'UTF-8') > 200 || preg_match('/[\s\x00-\x1F\x7F]/u', $v) !== 0) {
            return null;
        }
        return $v;
    }

    /**
     * True when `$headerValue` (X-Hub-Signature-256, "sha256=<hex>") is the HMAC-SHA256 of the raw body
     * under `$secret`. Constant-time; an empty secret or a malformed header never verifies.
     */
    function ccrm_github_signature_valid(string $rawBody, string $secret, string $headerValue): bool {
        if ($secret === '' || strncmp($headerValue, 'sha256=', 7) !== 0) {
            return false;
        }
        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $headerValue);
    }

    /**
     * A GitHub compare or commit link, the only kind stored as `compare_url` (it is rendered as a link
     * later, and the payload is attacker-influenced). Same rule as isGithubCompareUrl() in src/utils/githubRepo.ts.
     */
    function ccrm_github_valid_compare_url(string $url): bool {
        return strlen($url) <= 500
            && preg_match('#\Ahttps://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/(compare|commit)/[^\s]*\z#', $url) === 1;
    }

    /**
     * What one push event is, or null when it is not a push to a branch we count: a tag, a deletion, or a
     * payload without the fields we need. `pushedAt` is `$nowUtc`, the time this server received the push:
     * the head commit's own timestamp is the commit's date (old or oddly dated commits), not the push.
     *
     * @return array{repo:string,defaultBranch:?string,branch:string,pushedAt:string,pusher:?string,commitCount:int,headSha:?string,headMessage:?string,compareUrl:?string}|null
     */
    function ccrm_github_parse_push(array $payload, string $nowUtc): ?array {
        $ref = $payload['ref'] ?? null;
        if (!is_string($ref) || strncmp($ref, 'refs/heads/', 11) !== 0 || !empty($payload['deleted'])) {
            return null;
        }
        $branch = substr($ref, 11);
        $repository = is_array($payload['repository'] ?? null) ? $payload['repository'] : [];
        $repo = $repository['full_name'] ?? null;
        if ($branch === '' || mb_strlen($branch, 'UTF-8') > 200 || !is_string($repo) || $repo === '' || mb_strlen($repo, 'UTF-8') > 200) {
            return null;
        }
        $headCommit = is_array($payload['head_commit'] ?? null) ? $payload['head_commit'] : [];
        $commits = is_array($payload['commits'] ?? null) ? $payload['commits'] : [];
        $count = count($commits);
        // GitHub caps the array at 2,048; a payload that states a larger exact size is believed, within reason.
        if (isset($payload['size']) && is_int($payload['size']) && $payload['size'] > $count) {
            $count = $payload['size'];
        }
        $count = max(0, min(100000, $count));
        $message = isset($headCommit['message']) && is_string($headCommit['message']) ? $headCommit['message'] : '';
        $firstLine = trim((string)preg_split('/\R/u', $message, 2)[0]);
        $after = $payload['after'] ?? null;
        $pusher = is_array($payload['pusher'] ?? null) && is_string($payload['pusher']['name'] ?? null) ? trim($payload['pusher']['name']) : '';
        $compare = $payload['compare'] ?? null;
        return [
            'repo' => $repo,
            'defaultBranch' => is_string($repository['default_branch'] ?? null) && $repository['default_branch'] !== '' ? $repository['default_branch'] : null,
            'branch' => $branch,
            'pushedAt' => $nowUtc,
            'pusher' => $pusher === '' ? null : mb_substr($pusher, 0, 100, 'UTF-8'),
            'commitCount' => $count,
            'headSha' => is_string($after) && preg_match('/^[0-9a-f]{40}$/i', $after) ? strtolower($after) : null,
            'headMessage' => $firstLine === '' ? null : mb_substr($firstLine, 0, 300, 'UTF-8'),
            'compareUrl' => is_string($compare) && ccrm_github_valid_compare_url($compare) ? $compare : null,
        ];
    }

    /**
     * The ids of the projects a push belongs to. `$projects` is a list of rows with `id`, `github_repo`,
     * `github_branch`, `archived`. A project matches when it is not archived, its repository equals the
     * pushed one case-insensitively, and its branch equals the pushed branch exactly (git branches are
     * case-sensitive) or, with no branch set, the pushed branch is the repository's default branch.
     *
     * @param array<int,array<string,mixed>> $projects
     * @return string[]
     */
    function ccrm_github_match_projects(array $projects, array $push): array {
        $ids = [];
        foreach ($projects as $row) {
            if (!empty($row['archived'])) {
                continue;
            }
            $repo = (string)($row['github_repo'] ?? '');
            if ($repo === '' || strcasecmp($repo, $push['repo']) !== 0) {
                continue;
            }
            $paired = (string)($row['github_branch'] ?? '');
            $ok = $paired !== ''
                ? $paired === $push['branch']
                : ($push['defaultBranch'] !== null && $push['defaultBranch'] === $push['branch']);
            if ($ok) {
                $ids[] = (string)$row['id'];
            }
        }
        return $ids;
    }

    /** The non-archived projects paired with a repository (any branch), for ccrm_github_match_projects(). */
    function ccrm_github_projects_for_repo(\PDO $pdo, string $repo): array {
        $stmt = $pdo->prepare(
            "SELECT `id`, `github_repo`, `github_branch`, `archived` FROM `projects`
              WHERE `archived` = 0 AND `github_repo` IS NOT NULL AND LOWER(`github_repo`) = LOWER(?)"
        );
        $stmt->execute([$repo]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    /**
     * Stores one push for each project id. INSERT IGNORE on (body_hash, project_id), `$bodyHash` being the
     * SHA-256 hex of the raw request body: a redelivery has the same body, and so does a replay of a signed
     * body under another X-GitHub-Delivery, so neither adds a row. `$deliveryId` is kept for reference.
     * Returns how many rows were new.
     *
     * @param string[] $projectIds
     */
    function ccrm_github_store_push(\PDO $pdo, string $bodyHash, ?string $deliveryId, array $push, array $projectIds): int {
        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO `project_pushes`
               (`body_hash`, `delivery_id`, `project_id`, `repo`, `branch`, `pushed_at`, `pusher`, `commit_count`, `head_sha`, `head_message`, `compare_url`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $new = 0;
        foreach ($projectIds as $projectId) {
            $stmt->execute([
                $bodyHash, $deliveryId, $projectId, $push['repo'], $push['branch'], $push['pushedAt'], $push['pusher'],
                $push['commitCount'], $push['headSha'], $push['headMessage'], $push['compareUrl'],
            ]);
            $new += $stmt->rowCount();
        }
        return $new;
    }

    /**
     * [from, to) as UTC 'Y-m-d H:i:s' for the company-timezone days `$from`..`$to` (each 'Y-m-d' or null =
     * unbounded on that side). Null for a malformed date or `$from` after `$to`.
     *
     * @return array{0:?string,1:?string}|null
     */
    function ccrm_github_day_range(?string $from, ?string $to, \DateTimeZone $tz): ?array {
        $bound = static function (?string $day, int $plusDays) use ($tz): array {
            if ($day === null || $day === '') {
                return [true, null];
            }
            $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $day, $tz);
            if ($d === false || $d->format('Y-m-d') !== $day) {
                return [false, null];
            }
            return [true, $d->modify('+' . $plusDays . ' day')->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s')];
        };
        [$okFrom, $lo] = $bound($from, 0);
        [$okTo, $hi] = $bound($to, 1);
        if (!$okFrom || !$okTo || ($lo !== null && $hi !== null && $lo >= $hi)) {
            return null;
        }
        return [$lo, $hi];
    }

    /**
     * The webhook secret in the clear from its stored (encrypted) value, or '' when nothing is stored or
     * the stored value does not decrypt (the encryption key changed): such a secret can verify nothing.
     */
    function ccrm_github_readable_secret($stored): string {
        if (!is_string($stored) || $stored === '') {
            return '';
        }
        $plain = ccrm_decrypt_secret($stored);
        return strncmp($plain, 'enc:v1:', 7) === 0 ? '' : $plain;
    }

    /** ISO 8601 with a Z suffix from a UTC database value. */
    function ccrm_github_iso(?string $utc): ?string {
        if ($utc === null || $utc === '') {
            return null;
        }
        return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
    }
}
