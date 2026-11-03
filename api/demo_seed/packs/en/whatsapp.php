<?php
/**
 * Demo pack "whatsapp" (en): the few texts whatsapp.php writes itself, in the way the WAAI
 * connector words them (task footer, timeline titles and bodies). The chats, messages, tasks and
 * summaries are in whatsapp_demo.en.json (contract: docs/DEMO-MODE.md C15).
 * `dueFormat` is a PHP date() format for the stated due date in a timeline entry.
 */
return [
    'integrationName' => 'WhatsApp demo data',
    'footer' => ['chatLabel' => 'WhatsApp chat', 'assigneeLabel' => 'WhatsApp assignee', 'openLabel' => 'Open chat'],
    'timeline' => ['timelineCreated' => 'Task agreed on WhatsApp', 'timelineDone' => 'Task completed on WhatsApp', 'due' => 'Due', 'dueFormat' => 'n/j', 'assigneeLabel' => 'assignee', 'fromChatOpen' => 'from chat "', 'fromChatClose' => '"'],
];
