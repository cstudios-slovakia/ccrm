<?php
/**
 * Tasks pack, English (US) edition: 14 tasks around today (docs/DEMO-MODE.md A4, phase 4A).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/tasks.php). People, clients and
 * projects are refs. The POSITION in this list is the task's id (demo-tasks-<n>) - other modules link to
 * it, so append, never reorder: 1-4 owner, 5-9 pm, 10-14 sales. Same keys, list lengths and numbers as the
 * sk and hu packs; only strings differ. state: new | progress | blocked | done (the instance's own
 * TASK_STATES by role). day: deadline offset from today (negative = overdue).
 */
return [
    'tasks' => [
        // --- owner ------------------------------------------------------------------------------------
        ['title' => 'Order the slabs for {project:P1}, stage 2',
            'description' => 'Confirm the quantity with the CNC cutting plan and place the order with the importer. The lobby floor slabs go on the same order.',
            'priority' => 'high', 'day' => 2, 'time' => '10:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => ['pm'], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Send the framework terms to {client:L10}',
            'description' => 'The partnership offer is out, but {contact:L10} still waits for the delivery terms to Germany and the fixed price per square meter. Draft the terms and send them with the sample list.',
            'priority' => 'high', 'day' => -2, 'time' => '16:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => ['sales'], 'client' => 'L10', 'project' => null, 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Chase the overdue deposit - {project:P3}',
            'description' => 'The 40 % deposit ({m:18400}) is 12 days overdue. Call {contact:C6}, confirm the payment date and send a friendly reminder with the invoice attached before the production slot is released.',
            'priority' => 'high', 'day' => -1, 'time' => '15:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => [], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Review the slab price list for next quarter',
            'description' => 'Compare the new price list from the Italian producer with the local distributor and update the default sell prices of {item:I1} and {item:I2} in the warehouse.',
            'priority' => 'low', 'day' => 9, 'time' => '14:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => [], 'client' => null, 'project' => null, 'locking' => false, 'createdBy' => 'owner'],

        // --- pm -----------------------------------------------------------------------------------------
        ['title' => 'Slab delivery for {project:P3} is late - agree a new date',
            'description' => 'The slabs for the spa wall are held up at the producer. Get a firm shipping date, tell {contact:C6} in writing and check whether the lobby floor can be installed first.',
            'priority' => 'high', 'day' => -2, 'time' => '11:00', 'state' => 'blocked', 'owner' => 'pm', 'assignees' => ['owner'], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'pm'],
        ['title' => 'Plan the installation of the lobby floor',
            'description' => 'Two installers for two days; the slabs must be on site the day before. Agree the access time with the site manager of {client:C1}.',
            'priority' => 'medium', 'day' => 7, 'time' => '08:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Prepare the cutting plan for the vanity tops',
            'description' => 'Nest all vanity tops of series 1 on the fewest slabs so the offcuts stay under 8 %. Series 1 starts in about three weeks.',
            'priority' => 'medium', 'day' => 14, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C5', 'project' => 'P5', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Credit note for the wrong edge profile',
            'description' => 'The worktop was redone with the right profile. Issue the credit note for the difference and send it to {contact:C3}.',
            'priority' => 'medium', 'day' => -3, 'time' => '12:00', 'state' => 'done', 'owner' => 'pm', 'assignees' => [], 'client' => 'C3', 'project' => 'P4', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Warranty visit: repair the chip on the edge',
            'description' => 'Small chip next to the dishwasher. Bring the repair kit and a color-matched filler; {contact:C2} is home in the mornings.',
            'priority' => 'medium', 'day' => 3, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => ['sales'], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],

        // --- sales --------------------------------------------------------------------------------------------
        ['title' => 'Laser measuring at the kitchen of {client:L9}',
            'description' => 'Visit the house and measure the kitchen with the laser for the white quartz worktop, the backsplash and the sink cutout. Take photos of the wall behind the dishwasher.',
            'priority' => 'high', 'day' => 6, 'time' => '10:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Follow up on the revised quote of {client:L9}',
            'description' => 'She wanted to confirm the revised quote by {d:2}. Call if nothing arrives, remind her about the 4 in mitred edge option ({m:180}) and keep the measuring slot free.',
            'priority' => 'high', 'day' => 2, 'time' => '11:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => true, 'createdBy' => 'sales'],
        ['title' => 'Call {client:L8} about the terrace measuring date',
            'description' => 'Agree a date for measuring the terrace and the outdoor kitchen counter, then send the draft quote. Mention the frost-proof 20 mm porcelain slabs.',
            'priority' => 'medium', 'day' => 0, 'time' => '14:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L8', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Call back the web form inquiry of {client:L7}',
            'description' => 'New inquiry from yesterday evening: bathroom vanity top and shower wall. Ask for the size of the bathroom, offer a showroom visit and send the catalogue.',
            'priority' => 'medium', 'day' => 0, 'time' => '09:30', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L7', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Final photos of the finished kitchen and a review request',
            'description' => 'Photographed the finished worktop for the portfolio and asked {contact:C2} for a short online review.',
            'priority' => 'low', 'day' => -9, 'time' => '14:00', 'state' => 'done', 'owner' => 'sales', 'assignees' => [], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],
    ],
];
