<?php
/**
 * Pack `time` (en) - the activity the three logins log in time tracking (C10).
 *
 * Each login has a POOL of work items; the module deals them out over the last 15
 * working days (see demo_seed/time.php), so every item recurs about the same number
 * of times. A pool's shares are what C10 asks for: owner ~25 % billable, pm ~70 %,
 * sales ~45 %; about one entry in ten has no project (the Unsorted/"Assign project" state).
 *
 *   title     what the person typed. Written only when the item is NOT linked to a task
 *             or ticket (then the linked item's own title is shown, C5 of TIME-TRACKING.md).
 *   note      the Description typed on the entry ('' = none).
 *   project   a project ref, or null (no project yet).
 *   link      null | 'task' | 'ticket': link to the `pick`-th demo task (or ticket) of the
 *             project, in id order. No such task/ticket yet -> the entry stays a plain one.
 *   billable  billed to the client.
 */
return [
    'billableRateEur' => 45,

    'device' => ['name' => 'Chrome · macOS', 'browser' => 'Chrome', 'os' => 'macOS', 'version' => '1.0.0'],

    'pools' => [
        'owner' => [
            ['title' => 'Hotel call: handover date and payment plan', 'note' => 'Confirmed the new date by e-mail afterwards.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Facade pricing and supplier quotes', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Framework volumes and prices with the partner studio', 'note' => 'Prices fixed until the end of the quarter.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Slab purchase order for the spa wall', 'note' => '', 'project' => 'P3', 'link' => 'task', 'pick' => 0, 'billable' => false],
            ['title' => 'Weekly production and sales meeting', 'note' => 'Priorities for the week agreed.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Sign off the facade drawings', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'Approve the supplier price list', 'note' => 'Next-quarter list from the Italian producer.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Walk the villa site with the site manager', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Review quotes with the sales consultant', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Spa wall joint gap: reply to the hotel', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Showroom visits, e-mail and phone calls', 'note' => 'To be sorted into projects.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Cash flow and invoice check', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 2, 'billable' => false],
        ],
        'pm' => [
            ['title' => 'Cutting plan for the facade slabs', 'note' => 'Waste kept under 8 %.', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'CNC nesting and slab allocation', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Measuring visit and templates for the spa wall', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Installation window planning, facade phase 1', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Edge profiles and worktop production', 'note' => 'Mitred edges, 4 cm.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Quality check before shipping', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Site visit: spa wall cladding', 'note' => 'Photos uploaded to the project.', 'project' => 'P3', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Lobby floor layout and joint plan', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Edge profile claim: wrong profile delivered', 'note' => 'Agreed a credit note.', 'project' => 'P4', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Spa wall joint gap: inspection', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Slab delivery coordination with the supplier', 'note' => 'Delivery moved by a week.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Workshop paperwork and team briefing', 'note' => '', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
        ],
        'sales' => [
            ['title' => 'Measuring visit: hotel lobby floor', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Material and colour selection for the facade', 'note' => 'The client picked the shade.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Showroom consultation for the partner studio', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Offer for the facade cladding variant', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Laser measuring visit', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Follow-up on the web inquiry offer', 'note' => 'Waiting for the customer to choose the edge.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Sample boards for the showroom', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Update the partner studio order list', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'Photo documentation of the facade', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Cutout drawing change: call with the client', 'note' => 'Cooktop cutout changed on the drawing.', 'project' => 'P1', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Showroom open-day preparation', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
        ],
    ],

    // Browser activity the Chrome extension captured yesterday for the owner and nobody sorted yet.
    // 'project' = the project the extension suggests (null = no idea); 'from' is local time.
    'activity' => [
        ['domain' => 'marmi-fiorano.example', 'title' => 'Marmi Fiorano – quartz slab price list', 'from' => '10:12', 'minutes' => 14, 'project' => 'P3'],
        ['domain' => 'mail.lapidea.example', 'title' => 'Inbox (4) – Lapidea Mail', 'from' => '11:05', 'minutes' => 9, 'project' => null],
        ['domain' => 'cad-viewer.example', 'title' => 'Spa_wall_template.dwg – Drawing viewer', 'from' => '13:40', 'minutes' => 23, 'project' => null],
        ['domain' => 'docs.lapidea.example', 'title' => 'Installation checklist – project documents', 'from' => '15:20', 'minutes' => 11, 'project' => null],
    ],
];
