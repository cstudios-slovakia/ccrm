<?php
/**
 * Which existing lead a repeat web-form submission belongs to (api/pipeline.php).
 * No database access here, so scripts/test-pipeline-extras.php can check the rule.
 */

/**
 * The lead a new submission is appended to, or null when it must become a new lead.
 *
 * $candidates are the rows that share the submitter's e-mail or phone, newest first.
 * A lead qualifies only while it is still being worked: not in a closed stage group
 * and not archived. An archived lead is hidden from the leads list, so an inquiry
 * filed under it would never be seen; the visitor gets a fresh lead instead.
 */
function ccrm_pipeline_pick_open_lead(array $candidates, array $stageGroups): ?array
{
    foreach ($candidates as $lead) {
        if (!empty($lead['archived'])) {
            continue;
        }
        $status = (string)($lead['status'] ?? '');
        $group = $stageGroups[$status] ?? 'new';
        if ($group !== 'closed') {
            return $lead;
        }
    }
    return null;
}

/**
 * What a submission may be matched to an existing lead on: its e-mail and phone,
 * or null when it sent neither. A name is never enough - two different people
 * called "Ján Novák" would be merged into one lead - so a submission without
 * contact details always becomes a new lead.
 */
function ccrm_pipeline_match_keys(string $email, string $phone): ?array
{
    $email = trim($email);
    $phone = trim($phone);
    if ($email === '' && $phone === '') {
        return null;
    }
    return ['email' => $email, 'phone' => $phone];
}
