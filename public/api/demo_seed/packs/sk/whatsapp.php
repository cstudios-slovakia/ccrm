<?php
/**
 * Demo pack "whatsapp" (sk): the few texts whatsapp.php writes itself, in the way the WAAI
 * connector words them (task footer, timeline titles and bodies). The chats, messages, tasks and
 * summaries are in whatsapp_demo.sk.json (contract: docs/DEMO-MODE.md C15).
 * `dueFormat` is a PHP date() format for the stated due date in a timeline entry.
 */
return [
    'integrationName' => 'Demo údaje WhatsApp',
    'footer' => ['chatLabel' => 'WhatsApp chat', 'assigneeLabel' => 'Zodpovedný vo WhatsAppe', 'openLabel' => 'Otvoriť chat'],
    'timeline' => ['timelineCreated' => 'Úloha dohodnutá na WhatsAppe', 'timelineDone' => 'Úloha dokončená na WhatsAppe', 'due' => 'Do', 'dueFormat' => 'j. n.', 'assigneeLabel' => 'zodpovedný', 'fromChatOpen' => 'z chatu „', 'fromChatClose' => '“'],
];
