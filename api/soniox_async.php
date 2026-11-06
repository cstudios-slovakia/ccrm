<?php
/**
 * Soniox async transcription of a stored recording (the official meeting transcript and
 * timeline voice notes). Used by transcribe_meeting.php when a Soniox key is configured.
 *
 * Flow (docs.soniox.com/openapi.yaml): POST /v1/files (multipart `file`) -> POST
 * /v1/transcriptions {model, file_id, ...} -> poll GET /v1/transcriptions/{id} until
 * `completed` / `error` -> GET /v1/transcriptions/{id}/transcript -> DELETE the transcription
 * and the file. Both are always deleted, success or not: Soniox caps the files an
 * organisation may keep, and a recording should not stay on a third-party server.
 *
 * The model is pinned here, never read from the request.
 */

if (!function_exists('ccrm_soniox_transcribe_file')) {
    /** One Soniox REST call. Returns [httpCode, decodedBody|null, curlError]. */
    function ccrm_soniox_request(string $method, string $path, string $apiKey, $body = null, int $timeout = 30): array
    {
        $ch = curl_init('https://api.soniox.com' . $path);
        $headers = ['Authorization: Bearer ' . $apiKey];
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if (is_array($body) && isset($body['file']) && $body['file'] instanceof CURLFile) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body); // multipart
        } elseif ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_INVALID_UTF8_SUBSTITUTE));
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $decoded = is_string($res) && $res !== '' ? json_decode($res, true) : null;
        return [$code, is_array($decoded) ? $decoded : null, $err];
    }

    /** Soniox's own message from an error answer, else the curl error, else a generic line. */
    function ccrm_soniox_error_message(?array $body, string $curlErr, string $fallback): string
    {
        $msg = is_array($body) ? (string)($body['message'] ?? $body['error_message'] ?? '') : '';
        if ($msg === '') {
            $msg = $curlErr !== '' ? $curlErr : $fallback;
        }
        return $msg;
    }

    /** "[mm:ss]", or "[h:mm:ss]" from one hour on. */
    function ccrm_soniox_stamp(int $ms): string
    {
        $s = intdiv(max(0, $ms), 1000);
        $h = intdiv($s, 3600);
        $m = intdiv($s % 3600, 60);
        $sec = $s % 60;
        return $h > 0 ? sprintf('[%d:%02d:%02d]', $h, $m, $sec) : sprintf('[%02d:%02d]', $m, $sec);
    }

    /**
     * The live speaker timeline the browser sent (liveSpeakerTimeline() in liveTranscript.ts),
     * validated: ['names' => [P1 => name], 'turns' => [[P1, startMs, endMs], ...]] or null.
     */
    function ccrm_soniox_clean_timeline($raw): ?array
    {
        if (!is_array($raw) || !is_array($raw['names'] ?? null) || !is_array($raw['turns'] ?? null)) {
            return null;
        }
        $names = [];
        foreach ($raw['names'] as $id => $name) {
            if (!is_string($id) || !preg_match('/^P\d{1,3}$/', $id) || !is_string($name)) {
                continue;
            }
            // One line, no control characters, no colon (it would break "Name: text").
            $clean = preg_replace('/[\x00-\x1F\x7F:]+/u', ' ', $name) ?? '';
            $clean = trim(preg_replace('/\s+/u', ' ', $clean) ?? '');
            if ($clean !== '') {
                $names[$id] = mb_substr($clean, 0, 40);
            }
        }
        $turns = [];
        foreach (array_slice($raw['turns'], 0, 4000) as $turn) {
            if (!is_array($turn) || count($turn) < 3 || !is_string($turn[0]) || !preg_match('/^P\d{1,3}$/', $turn[0])
                || !is_numeric($turn[1]) || !is_numeric($turn[2])) {
                continue;
            }
            $start = (int)round(max(0, (float)$turn[1]) * 1000);
            $end = (int)round(max(0, (float)$turn[2]) * 1000);
            if ($end > $start) {
                $turns[] = [$turn[0], $start, $end];
            }
        }
        if (!$names || !$turns) {
            return null;
        }
        usort($turns, static fn($a, $b) => $a[1] <=> $b[1]);
        return ['names' => $names, 'turns' => $turns];
    }

    /**
     * Soniox speaker label -> the name the user gave the matching live speaker. Each official
     * speaker is matched to the live speaker its words overlap most in recording time; the match
     * must cover at least 60 % of its overlapped speech and 2 s, or the speaker keeps its
     * number. Live and official numbering differ, so time is the only reliable key.
     */
    function ccrm_soniox_speaker_names(array $tokens, ?array $timeline): array
    {
        if ($timeline === null) {
            return [];
        }
        $turns = $timeline['turns'];
        $overlap = []; // asyncLabel => [liveId => ms]
        $from = 0;
        $count = count($turns);
        foreach ($tokens as $tok) {
            $label = (string)($tok['speaker'] ?? '');
            if ($label === '' || !isset($tok['start_ms'])) {
                continue;
            }
            $start = (int)$tok['start_ms'];
            $end = max($start + 1, (int)($tok['end_ms'] ?? $start));
            // Tokens arrive in time order: skip live turns that ended before this token.
            while ($from < $count && $turns[$from][2] <= $start) {
                $from++;
            }
            for ($i = $from; $i < $count && $turns[$i][1] < $end; $i++) {
                $ms = min($end, $turns[$i][2]) - max($start, $turns[$i][1]);
                if ($ms > 0) {
                    $overlap[$label][$turns[$i][0]] = ($overlap[$label][$turns[$i][0]] ?? 0) + $ms;
                }
            }
        }
        $result = [];
        foreach ($overlap as $label => $byLive) {
            arsort($byLive);
            $bestLive = (string)array_key_first($byLive);
            $best = $byLive[$bestLive];
            if ($best >= 2000 && $best >= 0.6 * array_sum($byLive) && isset($timeline['names'][$bestLive])) {
                $result[(string)$label] = $timeline['names'][$bestLive];
            }
        }
        return $result;
    }

    /**
     * Soniox tokens -> transcript text. With speakers: one "[mm:ss] Participant N: text" line per
     * run of one speaker's speech, speakers numbered in order of first appearance (the same
     * shape the live Focus helper writes). Without speakers: the plain text.
     */
    function ccrm_soniox_tokens_to_text(array $tokens, bool $withSpeakers, string $participantLabel = 'Participant', array $speakerNames = []): string
    {
        if (!$withSpeakers) {
            $text = '';
            foreach ($tokens as $tok) {
                $piece = (string)($tok['text'] ?? '');
                if (!preg_match('/^<[a-z]+>$/', $piece)) {
                    $text .= $piece;
                }
            }
            return trim($text);
        }
        $numbers = [];
        $lines = [];
        $current = null; // ['speaker' => label, 'start' => ms, 'text' => string]
        $flush = static function () use (&$current, &$lines, &$numbers, $participantLabel, $speakerNames) {
            if ($current === null) {
                return;
            }
            $text = trim(preg_replace('/\s+/u', ' ', $current['text']) ?? $current['text']);
            if ($text !== '') {
                $who = '';
                if ($current['speaker'] !== '') {
                    $who = ($speakerNames[$current['speaker']] ?? ($participantLabel . ' ' . $numbers[$current['speaker']])) . ': ';
                }
                $lines[] = ccrm_soniox_stamp((int)$current['start']) . ' ' . $who . $text;
            }
            $current = null;
        };
        foreach ($tokens as $tok) {
            $text = (string)($tok['text'] ?? '');
            if ($text === '' || preg_match('/^<[a-z]+>$/', $text)) {
                continue; // control tokens such as <end>
            }
            $speaker = (string)($tok['speaker'] ?? '');
            if ($speaker !== '' && !isset($numbers[$speaker])) {
                $numbers[$speaker] = count($numbers) + 1;
            }
            if ($current !== null && $current['speaker'] !== $speaker) {
                $flush();
            }
            if ($current === null) {
                $current = ['speaker' => $speaker, 'start' => (int)($tok['start_ms'] ?? 0), 'text' => ''];
            }
            $current['text'] .= $text;
        }
        $flush();
        return implode("\n", $lines);
    }

    /**
     * Transcribes a local file. Returns ['ok' => true, 'text' => ..., 'seconds' => float] or
     * ['ok' => false, 'code' => httpCode, 'message' => ...]. `$maxWaitSeconds` bounds the
     * polling; an hour of audio usually finishes well inside a minute.
     */
    function ccrm_soniox_transcribe_file(
        string $apiKey,
        string $localPath,
        string $mimeType,
        array $languageHints,
        bool $diarize,
        string $participantLabel,
        string $referenceId,
        ?array $liveTimeline = null,
        int $maxWaitSeconds = 240
    ): array {
        $model = 'stt-async-v6';
        $fileId = '';
        $jobId = '';
        $cleanup = static function () use (&$fileId, &$jobId, $apiKey) {
            if ($jobId !== '') {
                ccrm_soniox_request('DELETE', '/v1/transcriptions/' . rawurlencode($jobId), $apiKey, null, 15);
            }
            if ($fileId !== '') {
                ccrm_soniox_request('DELETE', '/v1/files/' . rawurlencode($fileId), $apiKey, null, 15);
            }
        };

        [$code, $body, $err] = ccrm_soniox_request('POST', '/v1/files', $apiKey, [
            'file' => new CURLFile($localPath, $mimeType, basename($localPath)),
            'client_reference_id' => substr($referenceId, 0, 256),
        ], 180);
        if ($code !== 200 && $code !== 201) {
            return ['ok' => false, 'code' => $code, 'message' => 'Soniox upload failed: ' . ccrm_soniox_error_message($body, $err, 'no answer')];
        }
        $fileId = (string)($body['id'] ?? '');
        if ($fileId === '') {
            return ['ok' => false, 'code' => 502, 'message' => 'Soniox upload returned no file id.'];
        }

        $payload = [
            'model' => $model,
            'file_id' => $fileId,
            'enable_speaker_diarization' => $diarize,
            'client_reference_id' => substr($referenceId, 0, 256),
        ];
        if ($languageHints) {
            $payload['language_hints'] = array_values($languageHints);
        }
        [$code, $body, $err] = ccrm_soniox_request('POST', '/v1/transcriptions', $apiKey, $payload, 30);
        if ($code !== 200 && $code !== 201) {
            $cleanup();
            return ['ok' => false, 'code' => $code, 'message' => 'Soniox transcription could not start: ' . ccrm_soniox_error_message($body, $err, 'no answer')];
        }
        $jobId = (string)($body['id'] ?? '');
        if ($jobId === '') {
            $cleanup();
            return ['ok' => false, 'code' => 502, 'message' => 'Soniox returned no transcription id.'];
        }

        $deadline = time() + $maxWaitSeconds;
        $status = (string)($body['status'] ?? 'queued');
        $durationMs = 0;
        $delay = 1;
        while ($status !== 'completed') {
            if ($status === 'error') {
                $msg = (string)($body['error_message'] ?? 'unknown error');
                $cleanup();
                return ['ok' => false, 'code' => 502, 'message' => 'Soniox transcription failed: ' . $msg];
            }
            if (time() >= $deadline) {
                $cleanup();
                return ['ok' => false, 'code' => 504, 'message' => 'Soniox transcription is taking too long. Try again in a moment.'];
            }
            sleep($delay);
            $delay = min($delay + 1, 3);
            [$code, $polled, $err] = ccrm_soniox_request('GET', '/v1/transcriptions/' . rawurlencode($jobId), $apiKey, null, 20);
            if ($code === 200 && is_array($polled)) {
                $body = $polled;
                $status = (string)($body['status'] ?? $status);
            }
            // A transient poll failure just waits for the next round, within the deadline.
        }
        $durationMs = (int)($body['audio_duration_ms'] ?? 0);

        [$code, $transcript, $err] = ccrm_soniox_request('GET', '/v1/transcriptions/' . rawurlencode($jobId) . '/transcript', $apiKey, null, 60);
        $cleanup();
        if ($code !== 200 || !is_array($transcript)) {
            return ['ok' => false, 'code' => $code ?: 502, 'message' => 'Soniox transcript could not be read: ' . ccrm_soniox_error_message($transcript, $err, 'no answer')];
        }
        $tokens = is_array($transcript['tokens'] ?? null) ? $transcript['tokens'] : [];
        $text = $tokens
            ? ccrm_soniox_tokens_to_text(
                $tokens,
                $diarize,
                $participantLabel,
                $diarize ? ccrm_soniox_speaker_names($tokens, $liveTimeline) : []
            )
            : trim((string)($transcript['text'] ?? ''));
        return ['ok' => true, 'text' => $text, 'seconds' => $durationMs / 1000, 'model' => $model];
    }
}
