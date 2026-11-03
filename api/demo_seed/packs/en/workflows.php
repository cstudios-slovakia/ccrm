<?php
/**
 * Workflows pack, English (US) edition: the seven Automations & Workflows examples and the run history.
 *
 * Data only (see the contract in demo_seed/index.php). Same keys, list lengths and numbers as
 * packs/sk/workflows.php and packs/hu/workflows.php; only strings differ.
 *
 * The graph itself (node ids, positions, edges, filters, priorities, deadlines) is code in
 * workflows.php; every word a person reads is here, keyed by workflow ('wf1'..'wf7') and node.
 *
 * Local tokens, resolved by workflows.php from THIS instance's settings (they are not demo_text
 * placeholders):  %source% the web lead source   %offer% the "offer sent" lead state
 *                 %won% the "accepted" lead state   %cur% the currency code   %threshold% the
 *                 formatted lead-value threshold of the AI triage.
 * `{{$trigger.x}}`, `{{$input.x}}` and `{{$ai.x}}` are the engine's own variables: leave them.
 */
return [
    // Business-lead threshold of the AI triage (EUR before conversion; the condition uses the converted number).
    'thresholdEur' => 2000,

    'workflows' => [

        'wf1' => [
            'name' => 'Welcome e-mail for a web lead',
            'description' => 'Simple. A lead arrives from the website and immediately gets a confirmation e-mail with the name of the person who will call. Trigger filter on the lead source + one Send e-mail action.',
            'nodes' => [
                'trigger' => ['name' => 'New lead from %source%'],
                'welcome-mail' => [
                    'name' => 'Send the welcome e-mail',
                    'subject' => 'Thank you for your enquiry, {{$trigger.name}}',
                    'body' => '<p>Hello {{$trigger.name}},</p><p>thank you for contacting {brand}. Your enquiry is in our system and <b>{{$trigger.owner}}</b> will get back to you within one business day.</p><p>This is what we received:</p><ul><li>City: {{$trigger.city}}</li><li>Phone: {{$trigger.phone}}</li><li>Source: {{$trigger.source}}</li></ul><p>Kind regards,<br>The {brand} sales team</p>',
                ],
            ],
        ],

        'wf2' => [
            'name' => 'Follow up after an offer is sent',
            'description' => 'Simple. The moment a lead is moved to "%offer%", a follow-up task with a deadline and a time is opened for its owner. Trigger filter on the status change + one Create task action.',
            'nodes' => [
                'trigger' => ['name' => 'Lead moved to "%offer%"'],
                'followup-task' => [
                    'name' => 'Open the follow-up task',
                    'title' => 'Follow up on the quote for {{$trigger.name}}',
                    'description' => "The lead moved from \"{{\$trigger.oldStatus}}\" to \"{{\$trigger.newStatus}}\".\n\nValue: {{\$trigger.value}} %cur%\nCity: {{\$trigger.city}}\nPhone: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nCall the client, confirm the quote arrived and write the answer into the timeline.",
                ],
            ],
        ],

        'wf3' => [
            'name' => 'Log a phone enquiry (manual button)',
            'description' => 'Medium. A styled button in the header toolbar creates an empty lead, opens a task to qualify it and notifies {user:owner} by e-mail. Shows the manual trigger with its own colour, style and icon, plus two actions branching out of one node.',
            'nodes' => [
                'trigger' => ['name' => 'Manual button in the header'],
                'create-lead' => ['name' => 'Create the placeholder lead', 'leadName' => 'New phone enquiry'],
                'qualify-task' => [
                    'name' => 'Task: qualify the enquiry',
                    'title' => 'Qualify the new phone enquiry',
                    'description' => "Logged from the header button by {{\$trigger.triggered_by}}.\n\nNew lead record: {{\$input.name}} (ID {{\$input.id}}), status {{\$input.status}}.\n\nCall back, fill in the name, the address and the project details, then move the lead forward.",
                ],
                'notify-mail' => [
                    'name' => 'Notify the owner',
                    'subject' => 'New phone enquiry logged in the CRM',
                    'body' => '<p>{{$trigger.triggered_by}} logged a new phone enquiry from the header button.</p><p>Lead ID: <b>{{$input.id}}</b><br>Status: {{$input.status}}</p><p>Open the CRM and qualify it.</p>',
                ],
            ],
        ],

        'wf4' => [
            'name' => 'AI triage of a new lead',
            'description' => 'Complex. Every new lead is split by type and value. Bigger business leads (over %threshold%) get an AI qualification note that lands both in a high-priority task and in an e-mail to {user:owner}; everything else goes to the nurture list. Shows a condition with both branches, an AI agent and its {{$ai.result}} output. Needs an AI key and SMTP, so it is switched off.',
            'nodes' => [
                'trigger' => ['name' => 'Any new lead'],
                'value-check' => ['name' => 'Business lead over %threshold%?'],
                'ai-note' => [
                    'name' => 'AI qualification note',
                    'prompt' => "You are a CRM assistant at {brand}, a custom stone worktop fabricator. Write a short qualification note (max 4 sentences) for the sales team about this new lead.\n\nName: {{\$trigger.name}}\nType: {{\$trigger.clientType}}\nCity: {{\$trigger.city}}\nEstimated value: {{\$trigger.value}} %cur%\nSource: {{\$trigger.source}}\nCompany ID: {{\$trigger.companyId}}\n\nSay what to ask on the first call and what the main risk is. Plain text, no markdown.",
                ],
                'hot-task' => [
                    'name' => 'Task: call the lead today',
                    'title' => 'Qualify {{$trigger.name}}: AI note ready',
                    'description' => "{{\$ai.result}}\n\n---\nValue: {{\$trigger.value}} %cur% · City: {{\$trigger.city}} · Source: {{\$trigger.source}}",
                ],
                'hot-mail' => [
                    'name' => 'E-mail the AI note to the owner',
                    'subject' => 'AI triage: {{$trigger.name}} ({{$trigger.value}} %cur%)',
                    'body' => '<p>A new business lead came in from <b>{{$trigger.source}}</b>.</p><p><b>AI note:</b></p><p>{{$ai.summary}}</p><p>Owner: {{$trigger.owner}} · City: {{$trigger.city}} · Phone: {{$trigger.phone}}</p>',
                ],
                'nurture-task' => [
                    'name' => 'Task: nurture list',
                    'title' => 'Send the info pack to {{$trigger.name}}',
                    'description' => "Smaller or private enquiry ({{\$trigger.value}} %cur%, {{\$trigger.clientType}}).\n\nSend the standard info pack and check back in a week.\nE-mail: {{\$trigger.email}} · Phone: {{\$trigger.phone}}",
                ],
            ],
        ],

        'wf5' => [
            'name' => 'Won deal → client onboarding',
            'description' => 'Complex. When a lead reaches "%won%" the handover task opens immediately; companies additionally get a full client record, an onboarding task and an AI-written welcome e-mail, while private clients get a personal call instead. Shows a condition, chained actions and an AI agent feeding the last e-mail. Needs an AI key and SMTP, so it is switched off.',
            'nodes' => [
                'trigger' => ['name' => 'Lead moved to "%won%"'],
                'handover-task' => [
                    'name' => 'Task: hand over to production',
                    'title' => 'Hand over the won deal for {{$trigger.name}}',
                    'description' => "The deal was won ({{\$trigger.oldStatus}} → {{\$trigger.newStatus}}).\n\nValue: {{\$trigger.value}} %cur%\nCity: {{\$trigger.city}}\nOwner: {{\$trigger.owner}}\n\nFile the signed quote and pass the measurements and the slab choice to the workshop.",
                ],
                'company-check' => ['name' => 'Is it a company?'],
                'create-client' => ['name' => 'Create the client record'],
                'onboarding-task' => [
                    'name' => 'Task: prepare the onboarding pack',
                    'title' => 'Prepare the onboarding pack for {{$trigger.name}}',
                    'description' => "A client record was created from the won lead.\n\nClient ID: {{\$input.id}}\nCompany ID: {{\$input.company_id}}\nE-mail: {{\$input.email}}\n\nPrepare the contract and the schedule, and book the kickoff call.",
                ],
                'ai-onboarding' => [
                    'name' => 'AI onboarding e-mail',
                    'prompt' => "Write a short onboarding e-mail (max 150 words) to a new client of {brand}, a custom stone worktop fabricator.\n\nClient: {{\$trigger.name}} from {{\$trigger.city}}\nDeal value: {{\$trigger.value}} %cur%\nAccount manager: {{\$trigger.owner}}\n\nThank them, name the next steps (contract, laser measuring, production slot) and keep it warm but professional. Return plain text only, without a subject line.",
                ],
                'onboarding-mail' => [
                    'name' => 'Send the onboarding e-mail',
                    'subject' => 'Welcome on board, {{$trigger.name}}',
                    'body' => '<p>{{$ai.result}}</p><p>Kind regards,<br>{{$trigger.owner}}<br>{brand}</p>',
                ],
                'personal-task' => [
                    'name' => 'Task: personal onboarding call',
                    'title' => 'Personal onboarding call with {{$trigger.name}}',
                    'description' => "Private client: no company record needed.\n\nPhone: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\nValue: {{\$trigger.value}} %cur%\n\nCall them, agree the measuring date and confirm it in writing.",
                ],
            ],
        ],

        'wf6' => [
            'name' => 'New lead → task for the owner',
            'description' => 'Simple. Whenever a lead is created, its owner gets a task to call it back within a day, so no enquiry waits unanswered. One trigger and one Create task action, no filter.',
            'nodes' => [
                'trigger' => ['name' => 'Any new lead'],
                'call-task' => [
                    'name' => 'Task: call the new lead',
                    'title' => 'Call {{$trigger.name}} within 24 hours',
                    'description' => "New enquiry from {{\$trigger.source}}.\n\nCity: {{\$trigger.city}}\nPhone: {{\$trigger.phone}}\nE-mail: {{\$trigger.email}}\n\nAsk what they want to build, which stone they prefer and when the site is ready, then book the laser measuring visit.",
                ],
            ],
        ],

        'wf7' => [
            'name' => 'Quote accepted → project and kickoff task',
            'description' => 'Medium. When a lead reaches "%won%" (its quote was accepted) a project is created and paired with it, managed by the lead\'s owner, and the owner gets a task to plan the kickoff. A lead that already has such a project is left alone.',
            'nodes' => [
                'trigger' => ['name' => 'Lead moved to "%won%"'],
                'create-project' => ['name' => 'Create the project'],
                'kickoff-task' => [
                    'name' => 'Task: plan the kickoff',
                    'title' => 'Plan the project kickoff for {{$trigger.name}}',
                    'description' => "The quote was accepted and project {{\$input.project_id}} was created.\n\nBook the laser measuring visit, order the slabs and confirm the production slot with the client.",
                ],
            ],
        ],
    ],

    // Run history of the last 14 days: 20 runs, two of them failed. 'owner' is the lead's owner,
    // or the person who pressed the button (wf3). 'client' is the lead the run was about (null: none).
    // 'email' replaces the lead's address (a typo in the web form); 'error' is the readable message of a failed run.
    'logs' => [
        ['wf' => 'wf1', 'client' => 'L10', 'owner' => 'sales', 'day' => -12, 'time' => '08:41', 'ms' => 1840, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L10', 'owner' => 'sales', 'day' => -12, 'time' => '08:41', 'ms' => 182, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'sales', 'day' => -13, 'time' => '10:17', 'ms' => 264, 'email' => null, 'error' => null],
        ['wf' => 'wf7', 'client' => 'C6', 'owner' => 'owner', 'day' => -12, 'time' => '14:06', 'ms' => 412, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'L10', 'owner' => 'sales', 'day' => -11, 'time' => '09:30', 'ms' => 143, 'email' => null, 'error' => null],
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:22', 'ms' => 96, 'email' => null, 'error' => 'This "Convert lead to project" action has no project type set. Choose one in the workflow builder.'],
        ['wf' => 'wf7', 'client' => 'C5', 'owner' => 'pm', 'day' => -10, 'time' => '11:34', 'ms' => 438, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 1675, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L9', 'owner' => 'sales', 'day' => -9, 'time' => '16:12', 'ms' => 176, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'owner', 'day' => -9, 'time' => '13:48', 'ms' => 251, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'L9', 'owner' => 'sales', 'day' => -8, 'time' => '10:05', 'ms' => 151, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L8', 'owner' => 'sales', 'day' => -6, 'time' => '09:54', 'ms' => 612, 'email' => 'eva.martinezmail.example', 'error' => 'The welcome e-mail was not sent: "eva.martinezmail.example" is not a valid e-mail address (the @ is missing). Correct the address on the lead and run the workflow again.'],
        ['wf' => 'wf6', 'client' => 'L8', 'owner' => 'sales', 'day' => -6, 'time' => '09:54', 'ms' => 169, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'pm', 'day' => -5, 'time' => '15:21', 'ms' => 238, 'email' => null, 'error' => null],
        ['wf' => 'wf2', 'client' => 'C3', 'owner' => 'sales', 'day' => -3, 'time' => '08:58', 'ms' => 139, 'email' => null, 'error' => null],
        ['wf' => 'wf3', 'client' => null, 'owner' => 'sales', 'day' => -2, 'time' => '11:09', 'ms' => 247, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L7', 'owner' => 'sales', 'day' => -1, 'time' => '19:26', 'ms' => 1592, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L7', 'owner' => 'sales', 'day' => -1, 'time' => '19:26', 'ms' => 171, 'email' => null, 'error' => null],
        ['wf' => 'wf1', 'client' => 'L11', 'owner' => 'sales', 'day' => -14, 'time' => '09:03', 'ms' => 1710, 'email' => null, 'error' => null],
        ['wf' => 'wf6', 'client' => 'L11', 'owner' => 'sales', 'day' => -14, 'time' => '09:03', 'ms' => 188, 'email' => null, 'error' => null],
    ],
];
