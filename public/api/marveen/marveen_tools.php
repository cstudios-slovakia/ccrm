<?php
/**
 * Meta tool declarations, conversation context, WhatsApp and e-mail tools.
 * Split out of marveen_lib.php (pure move); loaded by it.
 */

if (!function_exists('ccrm_marveen_meta_tool_declarations')) {
    function ccrm_marveen_meta_tool_declarations(bool $isSubagent = false): array {
        $decls = [
            [
                'name' => 'memory_read',
                'description' => 'Read the current persistent memory.md (or a subagent\'s memory.md if subagent_id is passed).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to read that subagent\'s memory.md instead of the main memory.md.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'memory_write',
                'description' => 'Overwrite/save the persistent memory.md with updated Markdown content. Use this to store user instructions, rules, learned facts, and progress.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'content' => [
                            'type' => 'STRING',
                            'description' => 'Full Markdown content to write into memory.md.',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to write to that subagent\'s memory.md.',
                        ],
                    ],
                    'required' => ['content'],
                ],
            ],
            [
                'name' => 'memory_append',
                'description' => 'Append a new note, rule, or learned fact to persistent memory.md without overwriting existing sections.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'entry' => [
                            'type' => 'STRING',
                            'description' => 'Markdown bullet or paragraph to append to memory.md.',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID to append to that subagent\'s memory.md.',
                        ],
                    ],
                    'required' => ['entry'],
                ],
            ],
            [
                'name' => 'artifact_write',
                'description' => 'Create or update a named artifact document (e.g. "lead-report.md", "followup-drafts.md", "strategy.md") visible in the user\'s Right Artifacts Sidebar.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename of the artifact (e.g. "lead-report.md").',
                        ],
                        'title' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable title of the artifact.',
                        ],
                        'content' => [
                            'type' => 'STRING',
                            'description' => 'Full Markdown or text content of the artifact.',
                        ],
                    ],
                    'required' => ['name', 'content'],
                ],
            ],
            [
                'name' => 'artifact_read',
                'description' => 'Read the content of a named artifact from the Right Artifacts Sidebar.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename/ID of the artifact to read.',
                        ],
                    ],
                    'required' => ['name'],
                ],
            ],
            [
                'name' => 'artifact_list',
                'description' => 'List all saved artifacts on this connector.',
            ],
            [
                'name' => 'artifact_delete',
                'description' => 'Delete a named artifact by its filename/ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Filename/ID of the artifact to delete.',
                        ],
                    ],
                    'required' => ['name'],
                ],
            ],
            [
                'name' => 'whatsapp_list_chats',
                'description' => 'List WhatsApp chats and groups from the connected WhatsApp (WAAI) channel alongside this agent. Supports filtering by search query or chat type (all, groups, contacts).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'query' => [
                            'type' => 'STRING',
                            'description' => 'Optional search string to filter chats by contact name, group name, phone number, participant name, or message preview.',
                        ],
                        'type' => [
                            'type' => 'STRING',
                            'description' => 'Filter by chat type: "all" (default), "groups", or "contacts".',
                            'enum' => ['all', 'groups', 'contacts'],
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum number of chats to return (default 30, max 100).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'whatsapp_read_messages',
                'description' => 'Read the full conversation history of a WhatsApp contact or group chat by chat name (e.g. "Managment Cstudios", "Roland Vanyek"), phone number, or WhatsApp JID. Automatically includes at least the last 50 messages and at least the last 5 days of conversation (capped at 16,000 characters).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Target WhatsApp chat name, group name, participant name, phone number, or JID (e.g. "Managment Cstudios" or "120363401475617315@g.us").',
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Minimum number of most recent messages to return (default 50, max 200; always includes at least the last 5 days up to 16,000 chars).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                    'required' => ['chat'],
                ],
            ],
            [
                'name' => 'whatsapp_send_message',
                'description' => 'Send a WhatsApp message (or reply) to a contact or group chat via the connected WhatsApp (WAAI) channel.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Target WhatsApp chat name, group name, phone number, or JID (e.g. "Managment Cstudios", "+421918362403", or "120363401475617315@g.us").',
                        ],
                        'message' => [
                            'type' => 'STRING',
                            'description' => 'The exact text message to send on WhatsApp.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID if multiple WhatsApp channels are connected.',
                        ],
                    ],
                    'required' => ['chat', 'message'],
                ],
            ],
            [
                'name' => 'whatsapp_sync_chat',
                'description' => 'Trigger a live on-demand WhatsApp sync (fetchMessageHistory) for a specific chat/group or the entire WhatsApp (WAAI) connector.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'chat' => [
                            'type' => 'STRING',
                            'description' => 'Optional chat name, phone number, or JID to sync on-demand.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional WhatsApp connector ID.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_list_accounts',
                'description' => 'List authorized SMTP/IMAP/Gmail email connectors alongside this agent.',
            ],
            [
                'name' => 'email_list_messages',
                'description' => 'List recent emails from a connected email account (or search by sender/subject).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID or name (defaults to the first authorized email connector).',
                        ],
                        'query' => [
                            'type' => 'STRING',
                            'description' => 'Optional filter matching sender email/name or subject.',
                        ],
                        'limit' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum number of recent messages to list (default 25, max 100).',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_read_thread',
                'description' => 'Read the full conversation thread and message body for an email by UID, sender address, or subject. Includes up to the last 50 messages / last 5 days in the thread (capped at 16,000 characters).',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'uid' => [
                            'type' => 'INTEGER',
                            'description' => 'Optional IMAP UID of the email.',
                        ],
                        'sender' => [
                            'type' => 'STRING',
                            'description' => 'Optional sender email address to load the conversation thread with.',
                        ],
                        'subject' => [
                            'type' => 'STRING',
                            'description' => 'Optional subject line to match.',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID.',
                        ],
                    ],
                ],
            ],
            [
                'name' => 'email_send_reply',
                'description' => 'Send an email or a threaded reply via a connected SMTP/Gmail email account.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'to' => [
                            'type' => 'STRING',
                            'description' => 'Recipient email address.',
                        ],
                        'subject' => [
                            'type' => 'STRING',
                            'description' => 'Email subject line (use "Re: ..." when replying).',
                        ],
                        'body' => [
                            'type' => 'STRING',
                            'description' => 'Email body text or HTML.',
                        ],
                        'reply_to_uid' => [
                            'type' => 'INTEGER',
                            'description' => 'Optional UID of the incoming email being replied to (automatically threads In-Reply-To and References headers).',
                        ],
                        'connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional email connector ID to send from.',
                        ],
                    ],
                    'required' => ['to', 'subject', 'body'],
                ],
            ],
            [
                'name' => 'schedule_conversation_followup',
                'description' => 'Schedule a proactive one-shot follow-up message on a WhatsApp/Messenger/Telegram/Slack/Viber/SMS chat or Email thread after delay_minutes ($0 idle cost). If cancel_if_replied is true (default) and the contact replies before dueAt, it auto-cancels without calling the LLM.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'source_type' => [
                            'type' => 'STRING',
                            'description' => 'Channel type: "whatsapp" (covers WhatsApp and all BotMan messaging channels like Messenger, Telegram, Slack, Discord, Teams, Viber, SMS, WebChat) or "email".',
                            'enum' => ['whatsapp', 'email'],
                        ],
                        'source_connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional messaging or email connector ID.',
                        ],
                        'target_chat' => [
                            'type' => 'STRING',
                            'description' => 'Target chat ID, contact name, phone number, or email address to re-initiate conversation with.',
                        ],
                        'delay_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'Minutes to wait before checking and sending the proactive follow-up (e.g. 60 for 1 hour, 1440 for 24 hours).',
                        ],
                        'instructions' => [
                            'type' => 'STRING',
                            'description' => 'Instructions for what the agent should check or say when re-initiating the conversation.',
                        ],
                        'cancel_if_replied' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether to automatically cancel this follow-up if the contact replies before the timer expires (default true).',
                        ],
                        'max_attempts' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum follow-up attempts (default 1, max 3).',
                        ],
                    ],
                    'required' => ['target_chat', 'delay_minutes', 'instructions'],
                ],
            ],
            [
                'name' => 'list_conversation_followups',
                'description' => 'List all scheduled proactive conversation follow-ups on this AI connection.',
            ],
            [
                'name' => 'cancel_conversation_followup',
                'description' => 'Cancel and remove a scheduled proactive conversation follow-up by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Follow-up ID to cancel (e.g. "fup-...").',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ],
        ];

        if (!$isSubagent) {
            $decls[] = [
                'name' => 'create_subagent',
                'description' => 'Create or update a specialized agent/subagent on this AI connection with its own role, system prompt, and dedicated memory.md.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Slug ID for the agent (e.g. "lead-qualifier", "haiku-responder").',
                        ],
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable name of the agent.',
                        ],
                        'role' => [
                            'type' => 'STRING',
                            'description' => 'Short description of the agent\'s specialty.',
                        ],
                        'system_prompt' => [
                            'type' => 'STRING',
                            'description' => 'Detailed instructions for how this agent should operate.',
                        ],
                        'memory_md' => [
                            'type' => 'STRING',
                            'description' => 'Optional initial Markdown content for the agent\'s memory.md.',
                        ],
                    ],
                    'required' => ['name', 'role', 'system_prompt'],
                ],
            ];
            $decls[] = [
                'name' => 'list_subagents',
                'description' => 'List all specialized agents/subagents available on this connector.',
            ];
            $decls[] = [
                'name' => 'delete_subagent',
                'description' => 'Delete a subagent by its ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the subagent to remove.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
            $decls[] = [
                'name' => 'delegate_to_subagent',
                'description' => 'Delegate a task to a specialized subagent by ID. The subagent runs autonomously with its own memory.md and CCRM MCP tools and returns its result.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the subagent to invoke (if it does not exist yet, call create_subagent first).',
                        ],
                        'task' => [
                            'type' => 'STRING',
                            'description' => 'Clear task instructions for the subagent to execute.',
                        ],
                    ],
                    'required' => ['id', 'task'],
                ],
            ];
            $decls[] = [
                'name' => 'create_event_trigger',
                'description' => 'Wire an event-driven trigger ($0 idle cost) so that when a new WhatsApp/Messenger/Telegram message, Email, or CRM event arrives, the specified agent is automatically triggered with the last 50 messages / last 5 days of conversation context. Also supports proactive re-initiation when the contact goes silent.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'name' => [
                            'type' => 'STRING',
                            'description' => 'Human-readable name for the trigger (e.g. "Managment Cstudios Haiku Responder").',
                        ],
                        'source_type' => [
                            'type' => 'STRING',
                            'description' => 'Event source type: "whatsapp", "email", or "crm_event".',
                            'enum' => ['whatsapp', 'email', 'crm_event'],
                        ],
                        'source_connector_id' => [
                            'type' => 'STRING',
                            'description' => 'Source WhatsApp/BotMan or Email connector ID (optional; defaults to first matching connector).',
                        ],
                        'whatsapp_chat' => [
                            'type' => 'STRING',
                            'description' => 'For whatsapp triggers: target chat name or JID (e.g. "Managment Cstudios"), "@g.us" for all groups, or "*" for all chats.',
                        ],
                        'email_sender_filter' => [
                            'type' => 'STRING',
                            'description' => 'For email triggers: optional sender email/domain substring filter.',
                        ],
                        'email_subject_filter' => [
                            'type' => 'STRING',
                            'description' => 'For email triggers: optional subject substring filter.',
                        ],
                        'crm_event_name' => [
                            'type' => 'STRING',
                            'description' => 'For crm_event triggers: e.g. "lead_created", "client_created", "task_created".',
                        ],
                        'target_agent_id' => [
                            'type' => 'STRING',
                            'description' => 'Agent ID on this connection that should handle the trigger ("main" or a created subagent ID).',
                        ],
                        'instructions' => [
                            'type' => 'STRING',
                            'description' => 'Prompt instructions for the agent when the event fires.',
                        ],
                        'auto_reply' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether the agent should automatically send its reply back to the WhatsApp chat or Email sender (default true).',
                        ],
                        'proactive_enabled' => [
                            'type' => 'BOOLEAN',
                            'description' => 'Whether to proactively re-initiate the conversation if the contact does not reply after our last message.',
                        ],
                        'proactive_after_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'Minutes of silence after our last outgoing message before re-initiating the conversation (default 120).',
                        ],
                        'proactive_max_attempts' => [
                            'type' => 'INTEGER',
                            'description' => 'Maximum proactive follow-up attempts per unanswered turn (1 to 3, default 1).',
                        ],
                        'proactive_instructions' => [
                            'type' => 'STRING',
                            'description' => 'Instructions for how to re-initiate the conversation when the contact has not replied.',
                        ],
                    ],
                    'required' => ['name', 'source_type', 'instructions'],
                ],
            ];
            $decls[] = [
                'name' => 'list_event_triggers',
                'description' => 'List all event-driven triggers wired to this AI connection.',
            ];
            $decls[] = [
                'name' => 'delete_event_trigger',
                'description' => 'Delete an event-driven trigger by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the trigger to delete.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
            $decls[] = [
                'name' => 'schedule_autonomous_task',
                'description' => 'Schedule or update a recurring heartbeat task that runs periodically in the background (e.g. every N minutes). Note: for reacting to incoming WhatsApp messages or emails, prefer create_event_trigger ($0 idle cost) over polling!',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'Optional slug ID for the task.',
                        ],
                        'title' => [
                            'type' => 'STRING',
                            'description' => 'Short title describing the autonomous routine.',
                        ],
                        'prompt' => [
                            'type' => 'STRING',
                            'description' => 'The instruction prompt the agent (or subagent) will execute on each autonomous run.',
                        ],
                        'interval_minutes' => [
                            'type' => 'INTEGER',
                            'description' => 'How often to run in minutes (minimum 1, default 60).',
                        ],
                        'subagent_id' => [
                            'type' => 'STRING',
                            'description' => 'Optional subagent ID that should execute this task.',
                        ],
                    ],
                    'required' => ['title', 'prompt'],
                ],
            ];
            $decls[] = [
                'name' => 'list_autonomous_tasks',
                'description' => 'List all scheduled autonomous tasks configured on this connector.',
            ];
            $decls[] = [
                'name' => 'cancel_autonomous_task',
                'description' => 'Cancel and delete a scheduled autonomous task by ID.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => (object)[
                        'id' => [
                            'type' => 'STRING',
                            'description' => 'ID of the autonomous task to cancel.',
                        ],
                    ],
                    'required' => ['id'],
                ],
            ];
        }

        return $decls;
    }
}

if (!function_exists('ccrm_marveen_build_conversation_context')) {
    /**
     * Builds a comprehensive conversation context window for WhatsApp, Email threads, and future messaging channels:
     *  - Always includes at least the last $minMessages (50) messages AND all messages from the last $minDays (5) days
     *    (whichever set is larger, sorted chronologically oldest -> newest).
     *  - Applies a rational character limit ($maxChars = 16000, ~4,000 tokens) with tail-preserving truncation:
     *    older single messages > 1,000 chars are trimmed first, and if total chars still exceed $maxChars,
     *    the oldest messages at the top are dropped so the most recent messages are 100% preserved.
     */
    function ccrm_marveen_build_conversation_context(
        array $allMessages,
        int $minMessages = 50,
        int $minDays = 5,
        int $maxChars = 16000
    ): array {
        $minMessages = max(1, $minMessages);
        $minDays = max(1, $minDays);
        $maxChars = max(2000, $maxChars);

        $normalized = [];
        foreach ($allMessages as $idx => $m) {
            if (!is_array($m)) {
                continue;
            }
            $tsMs = (int)($m['tsMs'] ?? 0);
            if ($tsMs <= 0) {
                $dateCandidate = (string)($m['createdAt'] ?? ($m['email_date'] ?? ($m['date'] ?? ($m['timestamp'] ?? ''))));
                $parsed = $dateCandidate !== '' ? strtotime($dateCandidate) : false;
                $tsMs = $parsed !== false ? ($parsed * 1000) : ($idx * 1000);
            } elseif ($tsMs < 10000000000) {
                $tsMs *= 1000;
            }
            $fromMe = !empty($m['fromMe']) || !empty($m['is_outgoing']);
            $sender = $fromMe
                ? 'Me (Outgoing)'
                : trim((string)($m['senderName'] ?? ($m['from_name'] ?: ($m['from_address'] ?? 'Contact'))));
            if ($sender === '') {
                $sender = 'Contact';
            }
            $text = trim((string)($m['text'] ?? ($m['body'] ?? ($m['preview'] ?? ($m['subject'] ?? '')))));
            if ($text === '' && !empty($m['mediaType'])) {
                $text = '[' . strtoupper((string)$m['mediaType']) . ']';
            }
            if ($text === '') {
                continue;
            }
            $timeLabel = $tsMs > 1000000000000
                ? date('Y-m-d H:i', (int)round($tsMs / 1000))
                : (string)($m['timestamp'] ?? '');

            $normalized[] = [
                'raw' => $m,
                'id' => (string)($m['id'] ?? ($m['uid'] ?? ('msg-' . $idx))),
                'tsMs' => $tsMs,
                'timeLabel' => $timeLabel,
                'fromMe' => $fromMe,
                'senderName' => $sender,
                'text' => $text,
            ];
        }

        usort($normalized, static fn(array $a, array $b): int => $a['tsMs'] <=> $b['tsMs']);

        $totalCount = count($normalized);
        if ($totalCount === 0) {
            return [
                'messages' => [],
                'transcript' => '(No messages in conversation history)',
                'includedCount' => 0,
                'totalAvailable' => 0,
                'daysCovered' => $minDays,
                'charCount' => 0,
                'maxChars' => $maxChars,
                'truncatedByCharCap' => false,
            ];
        }

        // Union of last $minMessages (50) AND all messages from the last $minDays (5 days)
        $cutoffMs = (time() - ($minDays * 86400)) * 1000;
        $firstRecentIdx = $totalCount;
        for ($i = 0; $i < $totalCount; $i++) {
            if ($normalized[$i]['tsMs'] >= $cutoffMs) {
                $firstRecentIdx = $i;
                break;
            }
        }
        $startIndexByCount = max(0, $totalCount - $minMessages);
        $startIndex = min($startIndexByCount, $firstRecentIdx);
        $window = array_slice($normalized, $startIndex);
        $windowCount = count($window);

        // Build formatted lines from newest to oldest so we never drop the newest messages if $maxChars is reached
        $selectedReversed = [];
        $selectedRawReversed = [];
        $usedChars = 0;
        $truncatedByCap = false;

        for ($i = $windowCount - 1; $i >= 0; $i--) {
            $item = $window[$i];
            $isVeryRecent = ($windowCount - 1 - $i) < 5;
            $perMsgCap = $isVeryRecent ? 4000 : 1000;
            $msgText = $item['text'];
            if (mb_strlen($msgText, 'UTF-8') > $perMsgCap) {
                $msgText = mb_substr($msgText, 0, $perMsgCap, 'UTF-8') . ' … [truncated]';
            }
            $prefix = $item['timeLabel'] !== '' ? "[{$item['timeLabel']}] " : '';
            $line = "{$prefix}{$item['senderName']}: {$msgText}";
            $lineLen = mb_strlen($line, 'UTF-8') + 1;

            if (!empty($selectedReversed) && ($usedChars + $lineLen) > $maxChars) {
                $truncatedByCap = true;
                break;
            }
            $selectedReversed[] = $line;
            $selectedRawReversed[] = $item['raw'];
            $usedChars += $lineLen;
        }

        $chronologicalLines = array_reverse($selectedReversed);
        $chronologicalRaw = array_reverse($selectedRawReversed);

        if ($truncatedByCap) {
            array_unshift(
                $chronologicalLines,
                "[... Earlier messages omitted to stay within {$maxChars}-character conversation context cap ...]"
            );
        }

        $transcript = implode("\n", $chronologicalLines);

        return [
            'messages' => array_values($chronologicalRaw),
            'transcript' => $transcript,
            'includedCount' => count($chronologicalRaw),
            'totalAvailable' => $totalCount,
            'daysCovered' => $minDays,
            'charCount' => mb_strlen($transcript, 'UTF-8'),
            'maxChars' => $maxChars,
            'truncatedByCharCap' => $truncatedByCap,
        ];
    }
}

if (!function_exists('ccrm_marveen_list_sibling_whatsapp_connectors')) {
    /**
     * Finds all active WhatsApp (WAAI) connectors in `company_mailboxes`, prioritizing
     * those that share the agent connector's owner or assigned CRM users.
     */
    function ccrm_marveen_list_sibling_whatsapp_connectors(
        PDO $pdo,
        ?array $agentConnector = null,
        ?string $userId = null
    ): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $agentUsers = [];
        if ($userId !== null && $userId !== '') {
            $agentUsers[] = (string)$userId;
        }
        if (is_array($agentConnector)) {
            if (!empty($agentConnector['owner_user_id'])) {
                $agentUsers[] = (string)$agentConnector['owner_user_id'];
            }
            $aSettings = is_array($agentConnector['settings'] ?? null)
                ? $agentConnector['settings']
                : (json_decode((string)($agentConnector['settings_json'] ?? '{}'), true) ?: []);
            if (is_array($aSettings['userIds'] ?? null)) {
                foreach ($aSettings['userIds'] as $uid) {
                    $agentUsers[] = (string)$uid;
                }
            }
        }
        $agentUsers = array_values(array_unique(array_filter($agentUsers)));

        $preferred = [];
        $others = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $secretKeys = function_exists('ccrm_email_secret_keys')
                ? ccrm_email_secret_keys()
                : ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret', 'botmanToken', 'botmanAppSecret', 'botmanSigningSecret', 'botmanVerifyToken'];
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, $secretKeys)
                : [];
            $cType = strtolower((string)($settings['connectorType'] ?? ''));
            if ($cType !== 'whatsapp' && !ccrm_is_botman_connector($cType)) {
                continue;
            }
            $row['settings'] = $settings;
            $waUsers = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if (!empty($row['owner_user_id'])) {
                $waUsers[] = (string)$row['owner_user_id'];
            }
            $overlaps = empty($agentUsers) || empty($waUsers) || !empty(array_intersect($agentUsers, $waUsers));
            if ($overlaps) {
                $preferred[] = $row;
            } else {
                $others[] = $row;
            }
        }

        return array_merge($preferred, $others);
    }
}

if (!function_exists('ccrm_marveen_resolve_whatsapp_chat')) {
    /**
     * Resolves a target WhatsApp chat or group by JID, phone number, exact/fuzzy name,
     * participant preview, or message sender name.
     */
    function ccrm_marveen_resolve_whatsapp_chat(array $waState, string $target): ?array {
        $chats = is_array($waState['chats'] ?? null) ? $waState['chats'] : [];
        $messagesMap = is_array($waState['messages'] ?? null) ? $waState['messages'] : [];
        $q = trim($target);
        if ($q === '') {
            return $chats[0] ?? null;
        }
        $qLower = mb_strtolower($q, 'UTF-8');
        $qDigits = preg_replace('/\D/', '', $q);

        // 1. Exact JID or exact case-insensitive name match
        foreach ($chats as $c) {
            $cid = (string)($c['id'] ?? '');
            $cname = (string)($c['name'] ?? '');
            if (strtolower($cid) === strtolower($q) || mb_strtolower($cname, 'UTF-8') === $qLower) {
                return $c;
            }
        }

        // 2. Exact phone digits match
        if (strlen($qDigits) >= 6) {
            foreach ($chats as $c) {
                $cPhone = preg_replace('/\D/', '', (string)($c['phone'] ?? ''));
                $cIdDigits = preg_replace('/\D/', '', explode('@', (string)($c['id'] ?? ''))[0]);
                if (($cPhone !== '' && $cPhone === $qDigits) || ($cIdDigits !== '' && $cIdDigits === $qDigits)) {
                    return $c;
                }
            }
        }

        // 3. Substring match on chat name or participantsPreview (prefer chats with messages)
        $matches = [];
        foreach ($chats as $c) {
            $cname = mb_strtolower((string)($c['name'] ?? ''), 'UTF-8');
            $cpart = mb_strtolower((string)($c['participantsPreview'] ?? ''), 'UTF-8');
            if (
                ($cname !== '' && mb_strpos($cname, $qLower) !== false) ||
                ($cpart !== '' && mb_strpos($cpart, $qLower) !== false)
            ) {
                $matches[] = $c;
            }
        }
        if (!empty($matches)) {
            usort($matches, static function (array $a, array $b) use ($messagesMap): int {
                $countA = count($messagesMap[$a['id'] ?? ''] ?? []);
                $countB = count($messagesMap[$b['id'] ?? ''] ?? []);
                if ($countA !== $countB) {
                    return $countB <=> $countA;
                }
                return strcmp((string)($b['lastMessageAt'] ?? ''), (string)($a['lastMessageAt'] ?? ''));
            });
            return $matches[0];
        }

        // 4. Match by message senderName inside threads (e.g. "what did Roland write" -> finds chat where Roland posted)
        foreach ($chats as $c) {
            $cid = (string)($c['id'] ?? '');
            $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
            foreach ($thread as $m) {
                $sender = mb_strtolower((string)($m['senderName'] ?? ''), 'UTF-8');
                if ($sender !== '' && mb_strpos($sender, $qLower) !== false) {
                    return $c;
                }
            }
        }

        // 5. Direct phone number synthesis if >= 7 digits
        if (strlen($qDigits) >= 7) {
            return [
                'id' => $qDigits . '@s.whatsapp.net',
                'name' => '+' . $qDigits,
                'phone' => '+' . $qDigits,
                'isGroup' => false,
            ];
        }

        return null;
    }
}

if (!function_exists('ccrm_marveen_execute_whatsapp_tool')) {
    /**
     * Executes one of the 4 WhatsApp (WAAI) agent/MCP tools (`whatsapp_list_chats`,
     * `whatsapp_read_messages`, `whatsapp_send_message`, `whatsapp_sync_chat`).
     */
    function ccrm_marveen_execute_whatsapp_tool(
        PDO $pdo,
        ?array $agentConnector,
        string $fnName,
        array $fnArgs,
        ?string $userId = null
    ): array {
        $waConnectors = ccrm_marveen_list_sibling_whatsapp_connectors($pdo, $agentConnector, $userId);
        if (empty($waConnectors)) {
            return [
                'toolText' => json_encode([
                    'ok' => false,
                    'error' => 'No active WhatsApp (WAAI) connector is authorized in CCRM. Add or enable a WhatsApp connector in Authorized Channels.',
                ], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => $fnName,
                    'label' => 'WhatsApp: No connector configured',
                ],
            ];
        }

        $requestedId = trim((string)($fnArgs['connector_id'] ?? ''));
        $waConnector = $waConnectors[0];
        if ($requestedId !== '') {
            foreach ($waConnectors as $cand) {
                if (($cand['id'] ?? '') === $requestedId || stripos((string)($cand['name'] ?? ''), $requestedId) !== false) {
                    $waConnector = $cand;
                    break;
                }
            }
        }

        $waState = ccrm_waai_get_chats($waConnector);
        $chats = is_array($waState['chats'] ?? null) ? $waState['chats'] : [];
        $messagesMap = is_array($waState['messages'] ?? null) ? $waState['messages'] : [];

        if ($fnName === 'whatsapp_list_chats') {
            $query = mb_strtolower(trim((string)($fnArgs['query'] ?? '')), 'UTF-8');
            $typeFilter = strtolower(trim((string)($fnArgs['type'] ?? 'all')));
            $limit = min(100, max(1, (int)($fnArgs['limit'] ?? 30)));

            $filtered = [];
            foreach ($chats as $c) {
                $isGroup = !empty($c['isGroup']);
                if ($typeFilter === 'groups' && !$isGroup) continue;
                if ($typeFilter === 'contacts' && $isGroup) continue;

                $cid = (string)($c['id'] ?? '');
                $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
                $lastMsg = !empty($thread) ? $thread[count($thread) - 1] : null;

                if ($query !== '') {
                    $haystack = mb_strtolower(
                        ($c['name'] ?? '') . ' ' .
                        ($c['phone'] ?? '') . ' ' .
                        ($c['participantsPreview'] ?? '') . ' ' .
                        ($c['lastMessageText'] ?? '') . ' ' .
                        ($lastMsg['senderName'] ?? ''),
                        'UTF-8'
                    );
                    if (mb_strpos($haystack, $query) === false) {
                        continue;
                    }
                }

                $filtered[] = [
                    'chatId' => $cid,
                    'name' => (string)($c['name'] ?? $cid),
                    'phone' => (string)($c['phone'] ?? ''),
                    'isGroup' => $isGroup,
                    'participantsPreview' => $c['participantsPreview'] ?? null,
                    'messageCount' => count($thread),
                    'lastMessageSender' => $lastMsg ? (($lastMsg['fromMe'] ?? false) ? 'Me' : ($lastMsg['senderName'] ?? null)) : null,
                    'lastMessageText' => (string)($c['lastMessageText'] ?? ($lastMsg['text'] ?? '')),
                    'lastMessageAt' => $c['lastMessageAt'] ?? ($lastMsg['timestamp'] ?? null),
                ];
                if (count($filtered) >= $limit) {
                    break;
                }
            }

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $waConnector['id'],
                        'name' => $waConnector['name'],
                        'phone' => $waState['phone'] ?? ($waConnector['address'] ?? ''),
                        'status' => $waState['status'] ?? 'connected',
                        'totalChats' => count($chats),
                    ],
                    'chats' => $filtered,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_list_chats',
                    'label' => 'Listed WhatsApp chats (' . count($filtered) . ')',
                    'detail' => $query !== '' ? "Query: {$query}" : ($waConnector['name'] ?? 'WhatsApp'),
                ],
            ];
        }

        if ($fnName === 'whatsapp_read_messages') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? ($fnArgs['query'] ?? ''))));
            $limit = min(200, max(50, (int)($fnArgs['limit'] ?? 50)));
            $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);

            if ($resolved === null) {
                $sampleNames = array_map(static fn($c) => $c['name'] ?? $c['id'], array_slice($chats, 0, 12));
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => "Could not find a WhatsApp chat matching \"{$chatTarget}\".",
                        'availableRecentChats' => $sampleNames,
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_read_messages',
                        'label' => "WhatsApp chat not found: {$chatTarget}",
                    ],
                ];
            }

            $cid = (string)$resolved['id'];
            $thread = is_array($messagesMap[$cid] ?? null) ? $messagesMap[$cid] : [];
            $ctxWindow = ccrm_marveen_build_conversation_context($thread, $limit, 5, 16000);

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'chat' => [
                        'chatId' => $cid,
                        'name' => $resolved['name'] ?? $cid,
                        'phone' => $resolved['phone'] ?? '',
                        'isGroup' => !empty($resolved['isGroup']),
                        'participantsPreview' => $resolved['participantsPreview'] ?? null,
                        'totalMessagesInStore' => count($thread),
                        'includedMessagesCount' => $ctxWindow['includedCount'],
                        'contextCharCount' => $ctxWindow['charCount'],
                        'contextWindowRule' => 'last 50 messages + at least last 5 days (capped at 16,000 chars)',
                    ],
                    'conversationTranscript' => $ctxWindow['transcript'],
                    'messages' => $ctxWindow['messages'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_read_messages',
                    'label' => "Read WhatsApp: {$resolved['name']} (" . $ctxWindow['includedCount'] . ' msgs / 5d context)',
                    'detail' => $cid,
                ],
            ];
        }

        if ($fnName === 'whatsapp_send_message') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? ($fnArgs['to'] ?? ''))));
            $messageText = trim((string)($fnArgs['message'] ?? ($fnArgs['text'] ?? '')));
            if ($chatTarget === '' || $messageText === '') {
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => 'Both `chat` and `message` parameters are required to send a WhatsApp message.',
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_send_message',
                        'label' => 'WhatsApp send failed: missing arguments',
                    ],
                ];
            }

            $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
            if ($resolved === null) {
                return [
                    'toolText' => json_encode([
                        'ok' => false,
                        'error' => "Could not resolve WhatsApp recipient \"{$chatTarget}\". Use `whatsapp_list_chats` first to find the exact chat name or JID.",
                    ], JSON_UNESCAPED_UNICODE),
                    'step' => [
                        'id' => uniqid('st_', false),
                        'kind' => 'whatsapp',
                        'tool' => 'whatsapp_send_message',
                        'label' => "WhatsApp recipient not found: {$chatTarget}",
                    ],
                ];
            }

            $cid = (string)$resolved['id'];
            $authorName = (string)($agentConnector['name'] ?? 'AI Agent');
            $sendRes = ccrm_waai_send_message($waConnector, $cid, $messageText, $authorName);
            $sentOk = !empty($sendRes['ok']);

            return [
                'toolText' => json_encode([
                    'ok' => $sentOk,
                    'error' => $sendRes['error'] ?? null,
                    'sentTo' => [
                        'chatId' => $cid,
                        'name' => $resolved['name'] ?? $cid,
                        'phone' => $resolved['phone'] ?? '',
                        'isGroup' => !empty($resolved['isGroup']),
                    ],
                    'message' => $messageText,
                    'timestamp' => date('Y-m-d H:i'),
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_send_message',
                    'label' => $sentOk
                        ? "Sent WhatsApp → {$resolved['name']}"
                        : "Failed WhatsApp → {$resolved['name']}",
                    'detail' => mb_substr($messageText, 0, 120, 'UTF-8'),
                ],
            ];
        }

        if ($fnName === 'whatsapp_sync_chat') {
            $chatTarget = trim((string)($fnArgs['chat'] ?? ($fnArgs['chat_id'] ?? '')));
            $cid = '';
            $labelName = $waConnector['name'] ?? 'WhatsApp';
            if ($chatTarget !== '') {
                $resolved = ccrm_marveen_resolve_whatsapp_chat($waState, $chatTarget);
                if ($resolved !== null) {
                    $cid = (string)$resolved['id'];
                    $labelName = (string)($resolved['name'] ?? $cid);
                }
            }
            $synced = ccrm_waai_resync_chats($waConnector, $cid);
            $syncedChats = is_array($synced['chats'] ?? null) ? $synced['chats'] : [];
            $syncedMsgs = ($cid !== '' && is_array($synced['messages'][$cid] ?? null))
                ? array_slice($synced['messages'][$cid], -20)
                : [];
            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'status' => $synced['status'] ?? 'connected',
                    'totalChats' => count($syncedChats),
                    'chatId' => $cid ?: null,
                    'recentMessages' => $syncedMsgs,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'whatsapp',
                    'tool' => 'whatsapp_sync_chat',
                    'label' => "Synced WhatsApp: {$labelName}",
                    'detail' => $cid ?: 'Full connector resync',
                ],
            ];
        }

        return [
            'toolText' => json_encode(['ok' => false, 'error' => "Unknown WhatsApp tool: {$fnName}"]),
            'step' => [
                'id' => uniqid('st_', false),
                'kind' => 'whatsapp',
                'tool' => $fnName,
                'label' => "WhatsApp: {$fnName}",
            ],
        ];
    }
}

if (!function_exists('ccrm_marveen_list_sibling_email_connectors')) {
    /**
     * Finds all active Email (`gmail`, `smtp`, `exchange`) connectors in `company_mailboxes`.
     */
    function ccrm_marveen_list_sibling_email_connectors(
        PDO $pdo,
        ?array $agentConnector = null,
        ?string $userId = null
    ): array {
        require_once dirname(__DIR__) . '/auth.php';
        $stmt = $pdo->query("SELECT * FROM `company_mailboxes` WHERE `is_active` = 1 ORDER BY `id` ASC");
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $agentUsers = [];
        if ($userId !== null && $userId !== '') {
            $agentUsers[] = (string)$userId;
        }
        if (is_array($agentConnector)) {
            if (!empty($agentConnector['owner_user_id'])) {
                $agentUsers[] = (string)$agentConnector['owner_user_id'];
            }
            $aSettings = is_array($agentConnector['settings'] ?? null)
                ? $agentConnector['settings']
                : (json_decode((string)($agentConnector['settings_json'] ?? '{}'), true) ?: []);
            if (is_array($aSettings['userIds'] ?? null)) {
                foreach ($aSettings['userIds'] as $uid) {
                    $agentUsers[] = (string)$uid;
                }
            }
        }
        $agentUsers = array_values(array_unique(array_filter($agentUsers)));

        $preferred = [];
        $others = [];
        foreach ($rows as $row) {
            $raw = json_decode((string)($row['settings_json'] ?? '{}'), true);
            $settings = is_array($raw)
                ? ccrm_decrypt_config_secrets($raw, ['imapPassword', 'smtpPassword', 'subscriptionToken', 'graphClientSecret'])
                : [];
            $cType = strtolower(trim((string)($settings['connectorType'] ?? '')));
            if ($cType === '') {
                $imapHost = strtolower((string)($settings['imapHost'] ?? ''));
                $cType = str_contains($imapHost, 'gmail') ? 'gmail' : (($settings['provider'] ?? '') === 'exchange' ? 'exchange' : 'smtp');
            }
            if (!in_array($cType, ['gmail', 'smtp', 'exchange'], true)) {
                continue;
            }
            $settings['connectorType'] = $cType;
            $row['settings'] = $settings;
            $eUsers = is_array($settings['userIds'] ?? null) ? array_map('strval', $settings['userIds']) : [];
            if (!empty($row['owner_user_id'])) {
                $eUsers[] = (string)$row['owner_user_id'];
            }
            $overlaps = empty($agentUsers) || empty($eUsers) || !empty(array_intersect($agentUsers, $eUsers));
            if ($overlaps) {
                $preferred[] = $row;
            } else {
                $others[] = $row;
            }
        }
        return array_merge($preferred, $others);
    }
}

if (!function_exists('ccrm_marveen_send_connector_email')) {
    /**
     * Sends an email or threaded reply directly through a CCRM Email Connector's SMTP settings
     * and records the outgoing envelope in `mail_envelopes`.
     */
    function ccrm_marveen_send_connector_email(
        PDO $pdo,
        array $emailConnector,
        string $to,
        string $subject,
        string $bodyTextOrHtml,
        string $inReplyTo = '',
        string $references = ''
    ): array {
        $to = trim($to);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Invalid recipient email address: ' . $to];
        }
        $settings = is_array($emailConnector['settings'] ?? null)
            ? $emailConnector['settings']
            : (json_decode((string)($emailConnector['settings_json'] ?? '{}'), true) ?: []);

        $smtpHost = trim((string)($settings['smtpHost'] ?? ''));
        $cType = strtolower((string)($settings['connectorType'] ?? 'smtp'));
        if ($smtpHost === '' && $cType === 'gmail') {
            $smtpHost = 'smtp.gmail.com';
        } elseif ($smtpHost === '' && $cType === 'exchange') {
            $smtpHost = 'smtp.office365.com';
        }
        $smtpPort = (int)($settings['smtpPort'] ?? 0);
        if ($smtpPort <= 0) {
            $smtpPort = ($cType === 'exchange') ? 587 : 465;
        }
        $smtpSecure = strtolower((string)($settings['smtpSecure'] ?? ($smtpPort === 587 ? 'tls' : 'ssl')));
        $smtpUser = trim((string)($settings['smtpUsername'] ?? ($settings['imapUsername'] ?? ($emailConnector['address'] ?? ''))));
        $smtpPass = (string)($settings['smtpPassword'] ?? ($settings['imapPassword'] ?? ''));

        if ($smtpHost === '' || $smtpUser === '' || $smtpPass === '') {
            return ['ok' => false, 'error' => 'Email connector is missing SMTP host, username, or password.'];
        }

        $prefix = ($smtpSecure === 'ssl' && $smtpPort !== 587) ? 'ssl://' : '';
        $errno = 0;
        $errstr = '';
        $socket = @fsockopen($prefix . $smtpHost, $smtpPort, $errno, $errstr, 12);
        if (!$socket) {
            return ['ok' => false, 'error' => "SMTP connection failed ({$smtpHost}:{$smtpPort}): {$errstr}"];
        }
        stream_set_timeout($socket, 20);

        $readReply = static function () use ($socket): string {
            $out = '';
            while (($line = fgets($socket, 1024)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') break;
            }
            return $out;
        };
        $expect = static function (string $reply, $codes, string $stage): ?string {
            $head = ltrim($reply);
            foreach ((array)$codes as $code) {
                if (str_starts_with($head, (string)$code)) {
                    return null;
                }
            }
            return "SMTP {$stage} failed: " . trim($head ?: 'no reply');
        };

        $readReply();
        $ehlo = "EHLO " . (!empty($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost') . "\r\n";
        fwrite($socket, $ehlo);
        $readReply();

        if ($smtpPort === 587 || $smtpSecure === 'tls') {
            fwrite($socket, "STARTTLS\r\n");
            if ($err = $expect($readReply(), '220', 'STARTTLS')) {
                fclose($socket);
                return ['ok' => false, 'error' => $err];
            }
            if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                return ['ok' => false, 'error' => 'SMTP TLS handshake failed.'];
            }
            fwrite($socket, $ehlo);
            $readReply();
        }

        fwrite($socket, "AUTH LOGIN\r\n");
        if ($err = $expect($readReply(), '334', 'AUTH LOGIN')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, base64_encode($smtpUser) . "\r\n");
        if ($err = $expect($readReply(), '334', 'AUTH username')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, base64_encode($smtpPass) . "\r\n");
        if ($err = $expect($readReply(), '235', 'authentication')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }

        fwrite($socket, "MAIL FROM: <{$smtpUser}>\r\n");
        if ($err = $expect($readReply(), '250', 'MAIL FROM')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "RCPT TO: <{$to}>\r\n");
        if ($err = $expect($readReply(), ['250', '251'], 'RCPT TO')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "DATA\r\n");
        if ($err = $expect($readReply(), '354', 'DATA')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }

        $domain = str_contains($smtpUser, '@') ? substr(strrchr($smtpUser, '@'), 1) : 'ccrm.local';
        $messageId = '<' . bin2hex(random_bytes(12)) . '@' . $domain . '>';
        $fromName = trim((string)($emailConnector['name'] ?? ''));

        $isHtml = (bool)preg_match('/<(p|div|br|table|ul|ol|li|strong|em|h[1-6])\b/i', $bodyTextOrHtml);
        $htmlBody = $isHtml ? $bodyTextOrHtml : nl2br(htmlspecialchars($bodyTextOrHtml, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));

        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= $fromName !== ''
            ? "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$smtpUser}>\r\n"
            : "From: <{$smtpUser}>\r\n";
        $headers .= "To: <{$to}>\r\n";
        $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
        $headers .= "Message-ID: {$messageId}\r\n";
        if ($inReplyTo !== '') {
            $headers .= "In-Reply-To: {$inReplyTo}\r\n";
        }
        if ($references !== '') {
            $headers .= "References: {$references}\r\n";
        } elseif ($inReplyTo !== '') {
            $headers .= "References: {$inReplyTo}\r\n";
        }
        $headers .= "Date: " . date('r') . "\r\n\r\n";

        $message = $headers . $htmlBody;
        $wire = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
        $wire = preg_replace('/^\./m', '..', (string)$wire);

        fwrite($socket, $wire . "\r\n.\r\n");
        if ($err = $expect($readReply(), '250', 'message body')) {
            fclose($socket);
            return ['ok' => false, 'error' => $err];
        }
        fwrite($socket, "QUIT\r\n");
        fclose($socket);

        // Append the sent message to the IMAP Sent folder so it appears in real IMAP Sent & threads
        $filedToImapSent = false;
        try {
            require_once dirname(__DIR__) . '/mail_broker.php';
            if (function_exists('ccrm_append_to_sent')) {
                $filedToImapSent = (bool)ccrm_append_to_sent($settings, $message);
            }
        } catch (\Throwable $e) {
            // Non-fatal if IMAP Sent append is unavailable
        }

        // Cache the outgoing message in mail_envelopes so it appears in thread context and mailbox UI immediately
        try {
            $mailboxKey = 'c:' . $emailConnector['id'];
            $fakeUid = (int)(time() * 10 + random_int(1, 9));
            $plainPreview = mb_substr(trim(strip_tags($bodyTextOrHtml)), 0, 480, 'UTF-8');
            $stmt = $pdo->prepare(
                "INSERT IGNORE INTO `mail_envelopes` (
                    `mailbox_key`, `folder`, `uid`, `event_id`, `subject`,
                    `from_name`, `from_address`, `to_name`, `to_address`,
                    `email_date`, `is_outgoing`, `seen`, `size`,
                    `message_id`, `in_reply_to`, `references_hdr`, `preview`
                ) VALUES (?, 'Sent', ?, ?, ?, ?, ?, '', ?, NOW(), 1, 1, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $mailboxKey,
                $fakeUid,
                'email-agent-' . uniqid('', false),
                mb_substr($subject, 0, 500, 'UTF-8'),
                mb_substr($fromName, 0, 255, 'UTF-8'),
                mb_substr($smtpUser, 0, 255, 'UTF-8'),
                mb_substr($to, 0, 255, 'UTF-8'),
                strlen($htmlBody),
                $messageId,
                $inReplyTo,
                $references ?: $inReplyTo,
                $plainPreview,
            ]);
        } catch (\Throwable $e) {
            // Non-fatal if mail_envelopes table does not exist yet
        }

        return [
            'ok' => true,
            'messageId' => $messageId,
            'filedToSent' => $filedToImapSent,
            'from' => $smtpUser,
            'to' => $to,
            'subject' => $subject,
        ];
    }
}

if (!function_exists('ccrm_marveen_execute_email_tool')) {
    /**
     * Executes Email Connector tools (`email_list_accounts`, `email_list_messages`,
     * `email_read_thread`, `email_send_reply`) for AI Agents.
     */
    function ccrm_marveen_execute_email_tool(
        PDO $pdo,
        ?array $agentConnector,
        string $fnName,
        array $fnArgs,
        ?string $userId = null
    ): array {
        $emailConnectors = ccrm_marveen_list_sibling_email_connectors($pdo, $agentConnector, $userId);
        if (empty($emailConnectors)) {
            return [
                'toolText' => json_encode([
                    'ok' => false,
                    'error' => 'No active Email connector (SMTP/IMAP/Gmail) is configured in CCRM.',
                ], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => $fnName,
                    'label' => 'Email: No connector configured',
                ],
            ];
        }

        if ($fnName === 'email_list_accounts') {
            $accounts = array_map(static fn(array $c) => [
                'id' => $c['id'],
                'name' => $c['name'],
                'address' => $c['address'],
                'connectorType' => $c['settings']['connectorType'] ?? 'smtp',
            ], $emailConnectors);
            return [
                'toolText' => json_encode(['ok' => true, 'accounts' => $accounts], JSON_UNESCAPED_UNICODE),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_list_accounts',
                    'label' => 'Listed Email accounts (' . count($accounts) . ')',
                ],
            ];
        }

        $requestedId = trim((string)($fnArgs['connector_id'] ?? ''));
        $emailConnector = $emailConnectors[0];
        if ($requestedId !== '') {
            foreach ($emailConnectors as $cand) {
                if (
                    (string)($cand['id'] ?? '') === $requestedId ||
                    stripos((string)($cand['name'] ?? ''), $requestedId) !== false ||
                    stripos((string)($cand['address'] ?? ''), $requestedId) !== false
                ) {
                    $emailConnector = $cand;
                    break;
                }
            }
        }
        $mailboxKey = 'c:' . $emailConnector['id'];

        if ($fnName === 'email_list_messages') {
            $query = trim((string)($fnArgs['query'] ?? ''));
            $limit = min(100, max(1, (int)($fnArgs['limit'] ?? 25)));
            $rows = [];
            try {
                if ($query !== '') {
                    $like = '%' . $query . '%';
                    $stmt = $pdo->prepare(
                        "SELECT `uid`, `folder`, `subject`, `from_name`, `from_address`, `to_address`, `email_date`, `is_outgoing`, `preview`, `message_id`
                         FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND (`subject` LIKE ? OR `from_address` LIKE ? OR `from_name` LIKE ? OR `preview` LIKE ?)
                         ORDER BY `email_date` DESC, `uid` DESC LIMIT {$limit}"
                    );
                    $stmt->execute([$mailboxKey, $like, $like, $like, $like]);
                } else {
                    $stmt = $pdo->prepare(
                        "SELECT `uid`, `folder`, `subject`, `from_name`, `from_address`, `to_address`, `email_date`, `is_outgoing`, `preview`, `message_id`
                         FROM `mail_envelopes`
                         WHERE `mailbox_key` = ?
                         ORDER BY `email_date` DESC, `uid` DESC LIMIT {$limit}"
                    );
                    $stmt->execute([$mailboxKey]);
                }
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) {
                $rows = [];
            }

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $emailConnector['id'],
                        'name' => $emailConnector['name'],
                        'address' => $emailConnector['address'],
                    ],
                    'messages' => $rows,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_list_messages',
                    'label' => "Listed Emails: {$emailConnector['name']} (" . count($rows) . ')',
                ],
            ];
        }

        if ($fnName === 'email_read_thread') {
            $uid = (int)($fnArgs['uid'] ?? 0);
            $sender = trim((string)($fnArgs['sender'] ?? ''));
            $subject = trim((string)($fnArgs['subject'] ?? ''));

            $threadRows = [];
            try {
                if ($uid > 0 && $sender === '') {
                    $st = $pdo->prepare("SELECT * FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mailboxKey, $uid]);
                    $targetRow = $st->fetch(PDO::FETCH_ASSOC);
                    if ($targetRow) {
                        $sender = (string)($targetRow['is_outgoing'] ? $targetRow['to_address'] : $targetRow['from_address']);
                        $subject = (string)($targetRow['subject'] ?? '');
                    }
                }
                if ($sender !== '') {
                    $likeSender = '%' . $sender . '%';
                    $st = $pdo->prepare(
                        "SELECT * FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND (`from_address` LIKE ? OR `to_address` LIKE ?)
                         ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                    );
                    $st->execute([$mailboxKey, $likeSender, $likeSender]);
                    $threadRows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                } elseif ($subject !== '') {
                    $cleanSubj = trim((string)preg_replace('/^(re|fwd|fw|odp|válasz):\s*/i', '', $subject));
                    $likeSubj = '%' . ($cleanSubj ?: $subject) . '%';
                    $st = $pdo->prepare(
                        "SELECT * FROM `mail_envelopes`
                         WHERE `mailbox_key` = ? AND `subject` LIKE ?
                         ORDER BY `email_date` ASC, `uid` ASC LIMIT 120"
                    );
                    $st->execute([$mailboxKey, $likeSubj]);
                    $threadRows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
                }
            } catch (\Throwable $e) {
                $threadRows = [];
            }

            $mappedForCtx = array_map(static fn(array $r) => [
                'id' => 'uid-' . ($r['uid'] ?? ''),
                'uid' => (int)($r['uid'] ?? 0),
                'fromMe' => !empty($r['is_outgoing']),
                'senderName' => !empty($r['is_outgoing'])
                    ? 'Me (' . ($emailConnector['address'] ?? 'Outgoing') . ')'
                    : (($r['from_name'] ? $r['from_name'] . ' <' . $r['from_address'] . '>' : $r['from_address']) ?: 'Sender'),
                'text' => "[Subject: " . ($r['subject'] ?? '') . "] " . ($r['preview'] ?? ''),
                'createdAt' => $r['email_date'] ?? '',
            ], $threadRows);

            $ctxWindow = ccrm_marveen_build_conversation_context($mappedForCtx, 50, 5, 16000);

            return [
                'toolText' => json_encode([
                    'ok' => true,
                    'connector' => [
                        'id' => $emailConnector['id'],
                        'name' => $emailConnector['name'],
                        'address' => $emailConnector['address'],
                    ],
                    'includedMessagesCount' => $ctxWindow['includedCount'],
                    'conversationTranscript' => $ctxWindow['transcript'],
                    'messages' => $ctxWindow['messages'],
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_read_thread',
                    'label' => "Read Email Thread (" . $ctxWindow['includedCount'] . ' msgs / 5d context)',
                    'detail' => $sender ?: $subject,
                ],
            ];
        }

        if ($fnName === 'email_send_reply') {
            $to = trim((string)($fnArgs['to'] ?? ''));
            $subject = trim((string)($fnArgs['subject'] ?? ''));
            $body = trim((string)($fnArgs['body'] ?? ($fnArgs['message'] ?? '')));
            $replyToUid = (int)($fnArgs['reply_to_uid'] ?? 0);

            $inReplyTo = '';
            $references = '';
            if ($replyToUid > 0) {
                try {
                    $st = $pdo->prepare("SELECT `message_id`, `references_hdr`, `subject`, `from_address` FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `uid` = ? LIMIT 1");
                    $st->execute([$mailboxKey, $replyToUid]);
                    $orig = $st->fetch(PDO::FETCH_ASSOC);
                    if ($orig) {
                        $inReplyTo = (string)($orig['message_id'] ?? '');
                        $references = trim(((string)($orig['references_hdr'] ?? '')) . ' ' . $inReplyTo);
                        if ($to === '' && !empty($orig['from_address'])) {
                            $to = (string)$orig['from_address'];
                        }
                        if ($subject === '' && !empty($orig['subject'])) {
                            $origSubj = (string)$orig['subject'];
                            $subject = preg_match('/^re:/i', $origSubj) ? $origSubj : ('Re: ' . $origSubj);
                        }
                    }
                } catch (\Throwable $e) {}
            } elseif ($to !== '') {
                try {
                    $st = $pdo->prepare("SELECT `message_id`, `references_hdr`, `subject` FROM `mail_envelopes` WHERE `mailbox_key` = ? AND `from_address` = ? AND `is_outgoing` = 0 ORDER BY `email_date` DESC, `uid` DESC LIMIT 1");
                    $st->execute([$mailboxKey, $to]);
                    $orig = $st->fetch(PDO::FETCH_ASSOC);
                    if ($orig) {
                        $inReplyTo = (string)($orig['message_id'] ?? '');
                        $references = trim(((string)($orig['references_hdr'] ?? '')) . ' ' . $inReplyTo);
                        if ($subject === '' && !empty($orig['subject'])) {
                            $origSubj = (string)$orig['subject'];
                            $subject = preg_match('/^re:/i', $origSubj) ? $origSubj : ('Re: ' . $origSubj);
                        }
                    }
                } catch (\Throwable $e) {}
            }

            $sendRes = ccrm_marveen_send_connector_email($pdo, $emailConnector, $to, $subject, $body, $inReplyTo, $references);
            $sentOk = !empty($sendRes['ok']);
            return [
                'toolText' => json_encode($sendRes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'step' => [
                    'id' => uniqid('st_', false),
                    'kind' => 'mcp',
                    'tool' => 'email_send_reply',
                    'label' => $sentOk ? "Sent Email → {$to}" : "Failed Email → {$to}",
                    'detail' => $subject,
                ],
            ];
        }

        return [
            'toolText' => json_encode(['ok' => false, 'error' => "Unknown Email tool: {$fnName}"]),
            'step' => [
                'id' => uniqid('st_', false),
                'kind' => 'mcp',
                'tool' => $fnName,
                'label' => "Email: {$fnName}",
            ],
        ];
    }
}
