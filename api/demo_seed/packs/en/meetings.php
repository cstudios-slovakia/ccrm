<?php
/**
 * Demo pack "meetings" (en): the three meetings of the AI meeting room (C11).
 *
 * `lead`/`clients` are client refs, `users` and `assignee` are login roles, `supplier` is a
 * supplier ref (only on the archived supplier call). `transcript` turns are [speaker, text]
 * with a login role or a cast ref as speaker; `[[contact:S1]]` is filled by meetings.php (a supplier has no demo_text placeholder); the module spreads the timestamps over the
 * meeting's duration. `notes` blocks are [type, text]; `startDay`/`dueDay` are day offsets.
 */
return [
    'meetings' => [
        [
            'n' => 1,
            'title' => 'Weekly production and sales meeting',
            'day' => -2,
            'duration' => 45,
            'archived' => false,
            'lead' => null,
            'clients' => ['C1', 'C3', 'C6'],
            'users' => ['owner', 'pm', 'sales'],
            'notes' => [
                ['h2', 'Agenda'],
                ['bullet', '{project:P3}: slab delay and the new date'],
                ['bullet', 'Overdue deposit of {client:C6}'],
                ['bullet', '{project:P1}: lobby measuring and the second instalment'],
                ['bullet', 'Supplier slab price list for next quarter'],
                ['bullet', 'Offers: {client:L9} and {client:L10}'],
            ],
            'transcript' => [
                [
                    'owner',
                    'Right, let\'s start. I have five points: Aurum, the hotel\'s deposit, Highland Park, the slab price list and the offers. {first:pm}, start with Aurum.',
                ],
                [
                    'pm',
                    'The slabs for the spa wall left the plant ten days late. They reach our workshop on {d:2}, cutting takes four days and we can start installing at the hotel on {d:9}. I wrote to the manager and she accepted, but the opening date is fixed.',
                ],
                ['owner', 'So there is no slack left. Can we cut the lobby floor in parallel so the crew does not stand idle?'],
                [
                    'pm',
                    'Yes, the Lumina porcelain for the lobby is already in stock. I will put the second operator on the waterjet for three days.',
                ],
                [
                    'owner',
                    'Good. On the deposit: I sent the reminder yesterday and the hotel promised payment by {d:3}. We will see.',
                ],
                [
                    'sales',
                    'Highland Park asked whether the lobby measuring still fits this month. I suggest next Tuesday and will agree it with their site manager.',
                ],
                [
                    'owner',
                    'Fine. They already have the second instalment and it is due in five days. What about the slab price list?',
                ],
                [
                    'pm',
                    'The supplier goes up four percent on average. I confirmed the allocation: 140 m² of quartz, 60 m² of sintered stone, 80 m² of porcelain. Calacatta quartz will cost {m:99} per square metre.',
                ],
                [
                    'owner',
                    'That is bearable, but it squeezes the margin. We will not change the partner price list for now and come back to it in January.',
                ],
                [
                    'sales',
                    'Offers: {contact:L9} asked about the 4 cm edge around the sink and I told her it works. I suggested the measuring visit for {d:2}. Is the framework offer for Müller ready?',
                ],
                ['owner', 'I will finish it today, it covers six villa projects a year. Then I will call him.'],
                ['owner', 'One more thing: we have the open day at the showroom on {d:10}. {first:sales}, is everything ready?'],
                ['sales', 'The samples and the waterjet demo are ready, I only need the flyer budget approved.'],
                [
                    'owner',
                    'I approve it. To sum up: {first:pm} confirms the new slab date with the supplier and sends the hotel the joint samples, {first:sales} books the measuring with {contact:L9}, and I finish the offer for Müller. I have already chased the hotel\'s invoice. Thank you.',
                ],
            ],
            'minutes' => '### Weekly meeting – production and sales

**Attendees:** {user:owner}, {user:pm}, {user:sales}  
**Duration:** 45 min

#### 1. {project:P3}
- The spa wall slabs are ten days late; they reach the workshop on {d:2}, installation at the hotel from {d:9}.
- Cut the lobby floor in parallel (Lumina porcelain is in stock), second operator on the waterjet for three days.

#### 2. Deposit of {client:C6}
- Reminder sent, the hotel promised payment by {d:3}.

#### 3. {project:P1}
- Second instalment issued, due in five days.
- Lobby measuring proposed for next Tuesday.

#### 4. Slab price list
- Supplier up 4 % on average; the quarterly allocation is confirmed (140 / 60 / 80 m²).
- The partner price list stays, revisit in January.

#### 5. Offers and showroom
- {client:L9}: 4 cm edge around the sink, measuring on {d:2}.
- {client:L10}: the framework offer is finished today.
- Open day {d:10}: flyer budget approved.',
            'summary' => [
                'summary' => 'The team went through the ten-day slab delay on {project:P3}: the slabs reach the workshop on {d:2}, the lobby floor is cut in parallel and installation at the hotel starts on {d:9}. The hotel deposit is overdue and the reminder has gone out. The supplier raises prices by four percent; the partner price list stays. The offers for {client:L9} and {client:L10} are close to done and the open day is on {d:10}.',
                'sentiment' => 'neutral',
                'topics' => ['Supplier delay', 'Receivables', 'Slab prices', 'Offers', 'Open day'],
                'actionItems' => [
                    '{first:pm}: confirm the new slab date with the supplier and send the hotel the joint samples.',
                    '{first:sales}: book the measuring with {contact:L9} and follow up the offer.',
                    '{first:owner}: send the hotel the deposit reminder.',
                    '{first:owner}: finish the framework offer for {client:L10}.',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Confirm the new slab date and send the hotel joint samples',
                    'description' => 'The supplier moved dispatch by ten days; the hotel needs the joint colours for approval.',
                    'assignee' => 'pm',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'high',
                    'status' => 'in_progress',
                ],
                [
                    'n' => 2,
                    'title' => 'Measuring visit at {client:L9} and offer follow-up',
                    'description' => 'Confirm the 4 cm edge around the sink and agree the measuring date.',
                    'assignee' => 'sales',
                    'startDay' => -2,
                    'dueDay' => 2,
                    'priority' => 'medium',
                    'status' => 'todo',
                ],
                [
                    'n' => 3,
                    'title' => 'Reminder of the hotel deposit invoice',
                    'description' => 'The invoice for {project:P3} is overdue; send a polite reminder.',
                    'assignee' => 'owner',
                    'startDay' => -2,
                    'dueDay' => -2,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 4,
                    'title' => 'Finish the framework offer for {client:L10}',
                    'description' => 'Six villa projects a year, fixed price for six months.',
                    'assignee' => 'owner',
                    'startDay' => -2,
                    'dueDay' => 1,
                    'priority' => 'medium',
                    'status' => 'in_progress',
                ],
            ],
        ],
        [
            'n' => 2,
            'title' => 'Meeting with the hotel – {project:P3}',
            'day' => -6,
            'duration' => 60,
            'archived' => false,
            'lead' => 'C6',
            'clients' => ['C6'],
            'users' => ['owner', 'pm'],
            'notes' => [
                ['h2', 'Agenda'],
                ['bullet', 'Delay of the spa wall slabs'],
                ['bullet', 'Approval of the joint colour sample'],
                ['bullet', 'Payment schedule of {project:P3}'],
                ['todo', 'Send joint colour samples within three days'],
                ['quote', 'The spa opening is fixed – after the new date we do not want any further slip.'],
            ],
            'transcript' => [
                [
                    'pm',
                    'Thank you for making the time. I will start with the most important point: the spa wall slabs are ten days late, please have a look at the new schedule.',
                ],
                [
                    'C6',
                    'I am reading it. It is very tight, the spa opening is already announced to our guests. What if the slabs are late again?',
                ],
                [
                    'owner',
                    'The slabs have left the plant and are on their way, and we have the new date confirmed in writing by the supplier. We will also cut the lobby floor in parallel to gain time.',
                ],
                [
                    'C6',
                    'All right. The next thing is the joint colour. We saw the sample and in the spa lighting it looks too dark.',
                ],
                [
                    'pm',
                    'I will send you three lighter shades and we can judge them together on the wall once the first panel is fitted.',
                ],
                ['C6', 'And the payments. The deposit is overdue, I apologise, I will pass it to our accountant today.'],
                [
                    'owner',
                    'Thank you. We invoice the second instalment after the spa wall is installed and the rest at handover. Payment terms stay at 14 days.',
                ],
                ['C6', 'Agreed. Call me as soon as the slabs are in the workshop.'],
            ],
            'minutes' => '### Meeting with the hotel – {project:P3}

**Attendees:** {user:owner}, {user:pm}, {contact:C6}  
**Duration:** 60 min

#### 1. Delay
- Slabs are ten days late, the new date is confirmed in writing by the supplier.
- The lobby floor is cut in parallel.

#### 2. Joint sample
- The current sample is too dark in the spa lighting; three lighter shades within three days, decision on the wall itself.

#### 3. Payments
- Deposit overdue, the hotel passes it to accounting today.
- Second instalment after the spa wall is installed, the rest at handover, terms 14 days.',
            'summary' => [
                'summary' => 'The hotel accepted the new slab date, but the spa opening is fixed, so it asks for written confirmation from the supplier and parallel cutting of the floor. The joint sample looks too dark in the spa lighting; we will send three lighter shades. The deposit is overdue and the hotel will pay it; the next instalments depend on the spa wall installation and handover.',
                'sentiment' => 'negative',
                'topics' => ['Slab delay', 'Joint sample', 'Payment schedule'],
                'actionItems' => [
                    'Send the hotel three lighter joint samples within three days.',
                    'Get written confirmation of the date from the supplier.',
                    'Call the hotel when the slabs are in the workshop.',
                ],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Three lighter joint samples for the hotel',
                    'description' => 'Samples for approval on the spa wall itself.',
                    'assignee' => 'pm',
                    'startDay' => -6,
                    'dueDay' => -3,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 2,
                    'title' => 'Written date confirmation from the supplier',
                    'description' => 'The hotel requires it as a condition to continue.',
                    'assignee' => 'owner',
                    'startDay' => -6,
                    'dueDay' => -4,
                    'priority' => 'high',
                    'status' => 'done',
                ],
                [
                    'n' => 3,
                    'title' => 'Call the hotel when the slabs reach the workshop',
                    'description' => 'Announce the actual installation start date.',
                    'assignee' => 'pm',
                    'startDay' => -6,
                    'dueDay' => 3,
                    'priority' => 'medium',
                    'status' => 'todo',
                ],
            ],
        ],
        [
            'n' => 3,
            'title' => 'Supplier call – slabs for next quarter',
            'day' => -20,
            'duration' => 30,
            'archived' => true,
            'lead' => null,
            'clients' => [],
            'users' => ['owner', 'pm'],
            'supplier' => 'S1',
            'notes' => [
                ['h2', 'Agenda'],
                ['number', 'Slab allocation for next quarter'],
                ['number', 'Price list and loading terms'],
                ['quote', 'Prices apply for more than 250 m² per quarter.'],
            ],
            'transcript' => [
                [
                    'S1',
                    'Good morning, I sent the price list yesterday. Prices go up four percent on average because of energy costs.',
                ],
                [
                    'pm',
                    'Understood. We need to confirm the allocation: 140 m² of Calacatta quartz, 60 m² of sintered stone and 80 m² of porcelain.',
                ],
                ['S1', 'That is fine, I will reserve it for the first loading in the first week of the quarter.'],
                [
                    'owner',
                    'What matters to us is that the ten-day delay does not happen again. Can you give the loading date in writing?',
                ],
                ['S1', 'Of course, you will get the confirmation today.'],
            ],
            'minutes' => '### Supplier call – slabs for next quarter

**Attendees:** {user:owner}, {user:pm}, [[contact:S1]]  
**Duration:** 30 min

- Slab prices go up 4 % on average.
- Allocation confirmed: 140 m² quartz, 60 m² sintered stone, 80 m² porcelain.
- Loading in the first week of the quarter; the supplier confirms the date in writing.',
            'summary' => [
                'summary' => 'The supplier raises slab prices by four percent on average. The allocation for next quarter (140 m² quartz, 60 m² sintered stone, 80 m² porcelain) is confirmed for the first loading and the loading date will arrive in writing.',
                'sentiment' => 'neutral',
                'topics' => ['Slab prices', 'Allocation', 'Loading'],
                'actionItems' => ['Confirm the order according to the price list.'],
            ],
            'tasks' => [
                [
                    'n' => 1,
                    'title' => 'Confirm the slab order at the new price list',
                    'description' => 'Quarterly allocation, first loading in the first week.',
                    'assignee' => 'pm',
                    'startDay' => -20,
                    'dueDay' => -19,
                    'priority' => 'medium',
                    'status' => 'done',
                ],
            ],
        ],
    ],
];
