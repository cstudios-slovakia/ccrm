<?php
/**
 * Assertions for the `whatsapp` demo module (phase 4D). Format: scripts/demo-assert/company.php.
 *
 * Also the guard of the WhatsApp data contract (docs/DEMO-MODE.md C15, docs/WHATSAPP-DEMO-DATA.md): the three
 * whatsapp_demo.<lang>.json files must have the identical structure, chat refs, message ids, counts, day
 * offsets and times; only text, names and phone numbers differ. They are plain JSON, so test:demo-packs does
 * not see them - this file does.
 */

/** Flatten a JSON value to path => value, skipping the text fields that legitimately differ. */
function demo_wa_shape($v, string $path = ''): array {
    $out = [];
    if (is_array($v)) {
        if ($v === []) return [$path . '[]' => 'empty'];
        foreach ($v as $k => $x) {
            $out += demo_wa_shape($x, $path . '/' . $k);
        }
        return $out;
    }
    $leaf = substr($path, (int)strrpos($path, '/') + 1);
    if (ctype_digit($leaf)) { // a list of strings (members): the parent decides
        $leaf = substr($path, (int)strrpos(substr($path, 0, (int)strrpos($path, '/')), '/') + 1, strrpos($path, '/') - (int)strrpos(substr($path, 0, (int)strrpos($path, '/')), '/') - 1);
    }
    // text, names and phones differ per edition; everything else (ids, days, times, kinds, numbers, refs) must not
    $text = ['body', 'title', 'description', 'narrative', 'content', 'transcription', 'fileName', 'text', 'sender', 'by', 'name', 'email', 'phone', 'members', '_about', 'ownerCrmUser_', 'edition', 'locale', 'timezone', 'by', 'projectContactPhones'];
    if (in_array($leaf, $text, true) || strpos($path, '/projectContactPhones/') !== false || strpos($path, '/members/') !== false) {
        return [$path => is_string($v) ? 'text' : gettype($v)];
    }
    return [$path => json_encode($v)];
}

return [
    'minRows' => [
        'tasks' => 9,
        'whatsapp_numbers' => 6,
        'integration_clients' => 1,
    ],
    'idAllow' => [
        'whatsapp_numbers' => '/^\d{8,15}$/',
    ],
    'check' => function (DemoFakePdo $db, array $ctx, callable $check): void {
        static $contractChecked = false;
        $langs = ['sk', 'hu', 'en'];
        $dir = dirname(__DIR__, 2) . '/public/api/demo_seed/';
        $data = [];
        foreach ($langs as $l) $data[$l] = json_decode((string)file_get_contents($dir . 'whatsapp_demo.' . $l . '.json'), true);

        if (!$contractChecked) {
            $contractChecked = true;
            $ok = true;
            $detail = [];
            foreach ($langs as $l) {
                if (!is_array($data[$l]) || ($data[$l]['version'] ?? 0) !== 2 || ($data[$l]['edition'] ?? '') !== $l) { $ok = false; $detail[] = "{$l}: not version 2 / wrong edition"; }
            }
            $check('C15: the three files are version 2 with their edition', $ok, implode("\n", $detail));

            $ref = demo_wa_shape($data['sk']);
            foreach (['hu', 'en'] as $l) {
                $other = demo_wa_shape($data[$l]);
                $diff = array_merge(array_keys(array_diff_key($ref, $other)), array_keys(array_diff_key($other, $ref)));
                foreach ($ref as $k => $v) if (isset($other[$k]) && $other[$k] !== $v) $diff[] = "{$k}: {$v} vs {$other[$k]}";
                $check("C15: whatsapp_demo.{$l}.json has the structure, refs, ids, counts, days and times of the sk file", !$diff, implode("\n", array_slice($diff, 0, 8)));
            }
            $check('C15: account.sessionId is demo-ccrm-wa in every edition', count(array_unique(array_map(static fn($d) => $d['account']['sessionId'], $data))) === 1 && $data['sk']['account']['sessionId'] === 'demo-ccrm-wa');
            $tz = ['sk' => 'Europe/Bratislava', 'hu' => 'Europe/Budapest', 'en' => 'America/Denver'];
            $check('C15: account.timezone per edition', !array_filter($langs, static fn($l) => $data[$l]['account']['timezone'] !== $tz[$l]));
            $check('whatsapp_demo.json is still the sk file until phase 5 deletes it', is_file($dir . 'whatsapp_demo.json') && file_get_contents($dir . 'whatsapp_demo.json') === file_get_contents($dir . 'whatsapp_demo.sk.json'));
        }

        $d = $data[$ctx['lang']];
        $company = demo_company_pack($ctx['lang']);

        // CRM users by ref, never by name or e-mail; crmUsers is the edition's cast.
        $refsOk = $d['account']['ownerCrmUser'] === 'owner';
        $assigneesOk = true;
        foreach ($d['chats'] as $c) foreach ($c['tasks'] as $t) if (!in_array($t['assignee'], ['owner', 'pm', 'sales'], true)) $assigneesOk = false;
        $crmOk = true;
        foreach ($company['users'] as $role => $u) {
            if (($d['crmUsers'][$role]['name'] ?? '') !== $u['name'] || ($d['crmUsers'][$role]['email'] ?? '') !== $u['email']) $crmOk = false;
        }
        $check('C15: ownerCrmUser and every task assignee are user refs; crmUsers equals the company pack logins', $refsOk && $assigneesOk && $crmOk && array_keys($d['crmUsers']) === ['owner', 'pm', 'sales']);

        // Chat phones are the cast's phones (so the directory pairs chat and client), foreign contacts keep theirs.
        $digits = static fn(string $p): string => preg_replace('/\D/', '', $p);
        $phoneFor = ['demo-wa-c1-site' => 'C1', 'demo-wa-l10-architect' => 'L10', 'demo-wa-c6-hotel' => 'C6', 'demo-wa-c2-warranty' => 'C2'];
        $bad = [];
        foreach ($d['chats'] as $c) {
            $r = $phoneFor[$c['ref']] ?? null;
            if ($r === null) { $bad[] = 'unknown chat ' . $c['ref']; continue; }
            $rec = demo_ref_for($ctx['lang'], $r);
            if ($c['phone'] !== $digits($rec['phone'])) $bad[] = $c['ref'] . ' phone ' . $c['phone'] . ' vs ' . $digits($rec['phone']);
            $member = trim(preg_replace('/^(Ing\.|Dr\.|Mgr\.|Bc\.)\s+/u', '', (string)$rec['contact']));
            if ($c['members'] !== [$member]) $bad[] = $c['ref'] . ' member ' . json_encode($c['members'], JSON_UNESCAPED_UNICODE) . ' vs ' . $member;
            foreach ($c['messages'] as $m) if ($m['dir'] === 'in' && $m['sender'] !== $member) $bad[] = $c['ref'] . ' ' . $m['id'] . ' sender ' . $m['sender'];
            $expectLocale = $r === 'L10' ? 'de' : $ctx['lang'];
            if ($c['locale'] !== $expectLocale) $bad[] = $c['ref'] . ' locale ' . $c['locale'];
        }
        $check('chats carry the cast phones and contact names of the edition (German architect: de, the others: the edition language)', !$bad, implode("\n", $bad));

        // Numbers and project phones point at the cast; the P1/P3/P5 phones match the clients of those projects.
        $pp = $d['projectContactPhones'];
        $ppOk = $digits($pp['demo-projects-1']) === $digits(demo_ref_for($ctx['lang'], 'C1')['phone'])
            && $digits($pp['demo-projects-3']) === $digits(demo_ref_for($ctx['lang'], 'C6')['phone'])
            && $digits($pp['demo-projects-5']) === $digits(demo_ref_for($ctx['lang'], 'C5')['phone']);
        $check('projectContactPhones are the phones of the project clients (P1, P3, P5)', $ppOk);
        $prefix = ['sk' => '421', 'hu' => '36', 'en' => '1'][$ctx['lang']];
        $numBad = [];
        foreach ($d['numbers'] as $n) {
            if (strpos($n['phone'], $prefix) !== 0 && strpos($n['phone'], '49') !== 0) $numBad[] = $n['phone'];
        }
        $check('number checks use the edition\'s calling code (or the German architect\'s +49)', !$numBad, implode(', ', $numBad));

        // Message-level integrity: quotes and task sources point at messages of the same chat, days inside the window.
        $bad = [];
        foreach ($d['chats'] as $c) {
            $ids = array_column($c['messages'], 'id');
            foreach ($c['messages'] as $m) {
                if (isset($m['quote']) && !in_array($m['quote'], $ids, true)) $bad[] = $c['ref'] . ' quote ' . $m['quote'];
                if ($m['day'] > 0 || $m['day'] < -21) $bad[] = $c['ref'] . ' ' . $m['id'] . ' day ' . $m['day'];
                if (!in_array($m['kind'], ['text', 'image', 'document', 'audio'], true)) $bad[] = $c['ref'] . ' kind ' . $m['kind'];
                if ($m['kind'] === 'image' && !in_array($m['placeholder'], ['slabs', 'samples', 'site'], true)) $bad[] = $c['ref'] . ' placeholder ' . $m['placeholder'];
                if ($m['kind'] === 'audio' && (empty($m['transcription']) || empty($m['seconds']))) $bad[] = $c['ref'] . ' audio without transcription';
            }
            foreach ($c['tasks'] as $t) if (!in_array($t['sourceMessage'], $ids, true)) $bad[] = $c['ref'] . ' task ' . $t['n'] . ' source ' . $t['sourceMessage'];
            // summary.actionItems[].task is a task number of THIS chat, or null for a narrative bullet.
            $taskNs = array_column($c['tasks'], 'n');
            foreach (($c['summary']['actionItems'] ?? []) as $i => $item) {
                if (!array_key_exists('task', $item) || !is_string($item['text'] ?? null) || trim($item['text']) === '') $bad[] = $c['ref'] . ' actionItems[' . $i . '] needs task (number or null) and text';
                elseif ($item['task'] !== null && !in_array($item['task'], $taskNs, true)) $bad[] = $c['ref'] . ' actionItems[' . $i . '] names task ' . json_encode($item['task']) . ' which is not a task of this chat';
            }
            $unread = 0; for ($i = count($c['messages']) - 1; $i >= 0 && $c['messages'][$i]['dir'] === 'in'; $i--) $unread++;
            if ($unread < (int)$c['unread']) $bad[] = $c['ref'] . ' unread ' . $c['unread'] . ' > trailing incoming ' . $unread;
        }
        $check('quotes, task sources, days, kinds, image placeholders and unread counts are consistent', !$bad, implode("\n", array_slice($bad, 0, 6)));
        $nums = [];
        foreach ($d['chats'] as $c) foreach ($c['tasks'] as $t) $nums[] = $t['n'];
        $check('task numbers are 1..9 without gaps', $nums === range(1, 9), json_encode($nums));

        // The story: nothing of the pre-pack chats.
        $json = (string)file_get_contents($dir . 'whatsapp_demo.' . $ctx['lang'] . '.json');
        $check('nothing of the pre-pack WhatsApp story (Alex, Slavín, Weber, Dvořák) is left', !preg_match('/Slav[ií]n|Sandra Weber|Dvořák|"Alex"|demo-wa-slavin/u', $json) || $ctx['lang'] === 'en' && !preg_match('/Slav[ií]n|Sandra Weber|"Alex"|demo-wa-slavin/u', $json));

        // Rows in the dry run: tasks carry the user display names, the footer comes from the pack.
        $names = array_map(static fn($u) => $u['name'], $company['users']);
        $tasks = array_filter($db->rows('tasks'), static fn($t) => strpos((string)$t['id'], 'demo-whatsapp-') === 0);
        $check('nine WhatsApp tasks, owner and assignees are the edition\'s display names', count($tasks) === 9 && !array_filter($tasks, static fn($t) => !in_array($t['owner'], $names, true) || !in_array($t['created_by'], $names, true)));
        $pack = demo_pack_for($ctx['lang'], 'whatsapp');
        $check('task descriptions end with the pack footer (chat, assignee, open chat labels)', !array_filter($tasks, static fn($t) => strpos((string)$t['description'], $pack['footer']['chatLabel'] . ': ') === false || strpos((string)$t['description'], $pack['footer']['assigneeLabel'] . ': ') === false));
        $check('the placeholder integration client is inactive and named from the pack', (function () use ($db, $pack) { foreach ($db->rows('integration_clients') as $r) if ($r['id'] === 'demo-whatsapp-0') return (int)$r['is_active'] === 0 && $r['name'] === $pack['integrationName']; return false; })());

        // Links / timeline: only when the clients and projects modules have written their rows.
        $leads = array_column($db->rows('leads'), 'id');
        if (in_array('demo-clients-1', $leads, true)) {
            $check('chats are linked to their clients and projects (links written)', count($db->rows('whatsapp_links')) >= 6);
        }
    },
];
