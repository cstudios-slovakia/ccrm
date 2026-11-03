<?php
/**
 * Demo pack "whatsapp" (hu): the few texts whatsapp.php writes itself, in the way the WAAI
 * connector words them (task footer, timeline titles and bodies). The chats, messages, tasks and
 * summaries are in whatsapp_demo.hu.json (contract: docs/DEMO-MODE.md C15).
 * `dueFormat` is a PHP date() format for the stated due date in a timeline entry.
 */
return [
    'integrationName' => 'WhatsApp demóadatok',
    'footer' => ['chatLabel' => 'WhatsApp-csevegés', 'assigneeLabel' => 'WhatsApp felelős', 'openLabel' => 'Csevegés megnyitása'],
    'timeline' => [
        'timelineCreated' => 'WhatsAppon egyeztetett feladat',
        'timelineDone' => 'WhatsAppon elvégzett feladat',
        'due' => 'Határidő:',
        'dueFormat' => 'n. j.',
        'assigneeLabel' => 'felelős',
        'fromChatOpen' => 'a „',
        'fromChatClose' => '” csevegésből',
    ],
];
