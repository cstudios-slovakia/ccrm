<?php
/**
 * Tickets pack, English (US) edition: the C6 support contract and the five service tickets of D7.
 *
 * Data only (see the contract in demo_seed/index.php). Same keys, list lengths and numbers as
 * packs/sk/tickets.php and packs/hu/tickets.php; only strings differ.
 *
 * Refs: 'client' / 'project' point at the cast, 'assignee' and message/time 'user' are login roles.
 * The reporter (name, e-mail, phone) is the client's contact person. Days are offsets from today
 * (all in the past except the scheduled visit and task deadlines), times are 'HH:MM'. Amounts: EUR.
 * Ticket T1..T5 are demo-tickets-1..5 (other modules link to them by that id, e.g. time tracking).
 * Optional blocks are null when absent: 'response' (first reply), 'resolved', 'closed',
 * 'satisfaction' (CSAT) and 'task' (the CRM task linked to the ticket).
 */
return [
    'contract' => [
        'client' => 'C6', 'project' => 'P3', 'tier' => 'pro', 'monthlyHours' => 2.0, 'hourlyRateEur' => 65.0,
        'fromDay' => -120, 'untilDay' => 245,
        'notes' => 'Yearly maintenance contract for the hotel: two re-sealing visits for the lobby floor and spa wall, plus warranty support with priority response.',
    ],

    'tickets' => [

        'T1' => [
            'client' => 'C2', 'project' => 'P2', 'assignee' => 'pm', 'status' => 'open', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -3, 'createdTime' => '15:20',
            'response' => ['day' => -3, 'time' => '16:40'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Small chip on the worktop edge near the dishwasher',
            'description' => 'A small chip, about 5 mm, appeared on the front edge of the white quartz worktop right next to the dishwasher. It is not deep, but I would like it repaired under the warranty.',
            'tags' => ['warranty', 'edge', 'repair'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -3, 'time' => '15:20', 'body' => 'Hello, a small chip appeared on the worktop edge next to the dishwasher. I attached a photo. Could you repair it under the warranty?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -3, 'time' => '16:40', 'body' => 'Hello {contact:C2}, thank you for the photo. This is covered by the warranty. Our installer will come to repair the edge on {wd:2}, it takes about an hour and leaves no visible mark.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -2, 'time' => '09:10', 'body' => 'Matching repair resin for the Calacatta quartz is in the workshop. {user:pm} to confirm the date with the client; {user:E4} takes the kit.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 0, 'day' => -3, 'note' => 'Photo review and warranty check'],
                ['user' => 'pm', 'minutes' => 45, 'billable' => 0, 'day' => -2, 'note' => 'Repair resin matched to the slab, visit planned'],
            ],
            'task' => ['owner' => 'pm', 'status' => 'progress', 'priority' => 'medium', 'deadlineDay' => 2, 'deadlineTime' => '10:00', 'title' => 'Repair the edge chip at {client:C2}', 'description' => 'Warranty repair: small chip on the front edge by the dishwasher. Take the matching resin kit, repair on site (about 1 hour) and photograph the result for the ticket.'],
        ],

        'T2' => [
            'client' => 'C1', 'project' => 'P1', 'assignee' => 'pm', 'status' => 'closed', 'priority' => 'normal', 'type' => 'feature_request', 'source' => 'email',
            'createdDay' => -9, 'createdTime' => '08:50',
            'response' => ['day' => -9, 'time' => '09:20'], 'resolved' => ['day' => -8, 'time' => '14:30'], 'closed' => ['day' => -6, 'time' => '10:00'],
            'satisfaction' => ['score' => 5, 'comment' => 'Quick and clear, the drawing was fixed the same day.'],
            'title' => 'Cooktop cutout must change from 560 to 564 mm on the drawing',
            'description' => 'The appliance maker sent a new installation sheet for the cooktop in the show villa. Please change the cutout width on the drawing from 560 mm to 564 mm before the slab is cut.',
            'tags' => ['drawing', 'cutout', 'production'],
            'watchers' => [],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -9, 'time' => '08:50', 'body' => 'Good morning, attached is the new installation sheet of the cooktop. Please change the cutout from 560 to 564 mm and confirm.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -8, 'time' => '14:30', 'body' => 'Hello {contact:C1}, the drawing is updated to 564 mm and has gone to the CNC workshop. The revised PDF is attached to this ticket.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -7, 'time' => '09:05', 'body' => 'Thank you, confirmed on our side.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 1, 'day' => -8, 'note' => 'Drawing revision, cutout 564 mm'],
            ],
            'task' => null,
        ],

        'T3' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'new', 'priority' => 'high', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -1, 'createdTime' => '16:10',
            'response' => ['day' => -1, 'time' => '16:50'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Spa wall: hairline gap in a joint',
            'description' => 'A hairline gap, about 1 mm wide and 40 cm long, opened in a vertical joint of the spa wall cladding. It is visible under the lights. Please inspect it before the next guests arrive.',
            'tags' => ['spa', 'joint', 'cladding'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -1, 'time' => '16:10', 'body' => 'Good afternoon, we noticed a hairline gap in one joint of the spa wall. Photos attached. Can someone look at it this week?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -1, 'time' => '16:50', 'body' => 'Good afternoon {contact:C6}, thank you for the photos. We have logged this with high priority and will inspect the joint on site this week. We will confirm the exact time tomorrow.'],
            ],
            'time' => [],
            'task' => null,
        ],

        'T4' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'scheduled', 'priority' => 'normal', 'type' => 'question', 'source' => 'manual',
            'createdDay' => -9, 'createdTime' => '11:00',
            'response' => ['day' => -9, 'time' => '11:00'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Scheduled re-sealing of the lobby floor',
            'description' => 'First of the two re-sealing visits included in the yearly maintenance contract: clean and re-seal the lobby floor.',
            'tags' => ['contract', 'sealing', 'maintenance'],
            'watchers' => [],
            'messages' => [
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -9, 'time' => '11:05', 'body' => 'Hello {contact:C6}, the first re-sealing visit of your maintenance contract is planned for {d:6} at 08:00. We need the lobby free of guests for about three hours.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -8, 'time' => '10:40', 'body' => 'Thank you, that works for us. We will close the lobby side entrance that morning.'],
            ],
            'time' => [],
            'task' => ['owner' => 'pm', 'status' => 'new', 'priority' => 'medium', 'deadlineDay' => 6, 'deadlineTime' => '08:00', 'title' => 'Re-seal the lobby floor at {client:C6}', 'description' => 'Maintenance visit 1 of 2 from the contract. Take the cleaner and two bottles of {item:I6}; leave the floor closed for 3 hours after sealing.'],
        ],

        'T5' => [
            'client' => 'C3', 'project' => 'P4', 'assignee' => 'sales', 'status' => 'resolved', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -14, 'createdTime' => '09:15',
            'response' => ['day' => -14, 'time' => '10:30'], 'resolved' => ['day' => -11, 'time' => '16:00'], 'closed' => null, 'satisfaction' => null,
            'title' => 'Wrong edge profile delivered on one worktop',
            'description' => 'One worktop of last week\'s order was delivered with an ogee edge instead of the eased edge on the order. The studio cannot install it.',
            'tags' => ['production', 'edge', 'credit-note'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -14, 'time' => '09:15', 'body' => 'Hello, one worktop of the last delivery has an ogee edge, but we ordered the eased edge. We cannot install it. Please advise.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -14, 'time' => '10:30', 'body' => 'Hello {contact:C3}, I am sorry for the mix-up. We will remake the worktop with the right edge and bring it to you at no charge.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -13, 'time' => '08:45', 'body' => 'Order sheet had the profile right, the CNC program was the old one. Remake is on the waterjet Thursday; {user:E5} checks the profile against the drawing before it leaves.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -11, 'time' => '16:00', 'body' => 'The remade worktop was delivered today. A credit note of {m:180} for the extra freight is on its way with the next invoice.'],
            ],
            'time' => [
                ['user' => 'sales', 'minutes' => 40, 'billable' => 0, 'day' => -14, 'note' => 'Call with the studio and reorder'],
                ['user' => 'pm', 'minutes' => 90, 'billable' => 0, 'day' => -12, 'note' => 'Remake planned, program corrected'],
            ],
            'task' => null,
        ],
    ],
];
