<?php
/**
 * Demo pack "email" (en): the demo mailbox for about three weeks (module email.php).
 *
 * Senders and recipients are cast refs (owner, pm, sales, C1..C6, L9, S1, S2) or a key of
 * `parties`. `re` points at the `n` of the message a reply answers. Attachment shapes:
 * `rows` (csv), `title` + `lines` (pdf), `seed` (png), `ics` (invitation). `[[name:S1]]` and
 * `[[contact:S1]]` are filled by email.php for cast records demo_text() has no placeholder for.
 */
return [
    'quoteHead' => 'On %1$s, %2$s wrote:',
    'parties' => [
        'news' => ['name' => 'Stone Trade Weekly', 'email' => 'newsletter@stone-trade.example'],
        'courier' => ['name' => 'UPS Business', 'email' => 'tracking@carrier.example'],
    ],
    'messages' => [
        [
            'n' => 1,
            'folder' => 'INBOX',
            'day' => -21,
            'time' => '16:20',
            'from' => 'S1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Slab price list for next quarter and our call',
            'body' => 'Hello {first:pm},

attached is our slab price list for the next quarter. Prices apply to orders above 250 m² delivered on pallets from our plant in Fiorano.

Tomorrow at 10:00 we can go through the slab allocation and the loading dates. Does that suit you?

Best regards
[[contact:S1]]
[[name:S1]]',
            'att' => [
                [
                    'name' => 'slab_price_list_next_quarter.csv',
                    'rows' => [
                        ['Item', 'Thickness (mm)', 'Price per m² (EUR)'],
                        ['Aurelia Calacatta quartz', 20, '{m:99}'],
                        ['Stratos Nero Marquina sintered stone', 12, '{m:114}'],
                        ['Lumina Statuario porcelain slab', 6, '{m:74}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 2,
            'folder' => 'Sent',
            'day' => -20,
            'time' => '15:10',
            'from' => 'pm',
            'to' => 'S1',
            'seen' => true,
            're' => 1,
            'subject' => 'RE: Slab price list for next quarter and our call',
            'body' => 'Hello,

thank you for today\'s call. I confirm the allocation for next quarter: 140 m² of Calacatta quartz, 60 m² of Nero Marquina sintered stone and 80 m² of Statuario porcelain. First loading in the first week.

We accept the prices on the list. Please confirm the order and the dispatch date.

Best regards
{user:pm}
{company}',
        ],
        [
            'n' => 3,
            'folder' => 'INBOX',
            'day' => -18,
            'time' => '11:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Weekly order list – week 44',
            'body' => 'Hi {first:pm},

here is this week\'s worktop list: nine jobs, roughly 31 m² in total. Two of them are in sintered stone and need a faster turnaround.

Thanks and have a good day
{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'order_list_week_44.csv',
                    'rows' => [
                        ['Job', 'Material', 'Area (m²)', 'Due'],
                        ['KL-4401', 'Calacatta quartz 20 mm', 3.8, '{d:5}'],
                        ['KL-4402', 'Nero Marquina sintered stone 12 mm', 4.2, '{d:4}'],
                        ['KL-4403', 'Absolute Black granite 30 mm', 3.1, '{d:7}'],
                        ['KL-4404', 'Calacatta quartz 20 mm', 2.9, '{d:7}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 4,
            'folder' => 'Sent',
            'day' => -17,
            'time' => '09:05',
            'from' => 'pm',
            'to' => 'C3',
            'seen' => true,
            're' => 3,
            'subject' => 'RE: Weekly order list – week 44',
            'body' => 'Hi {contact:C3},

we have the list. We can deliver both sintered-stone jobs within four working days and the others within six, as agreed in the framework deal. Our install crew will still confirm the measurement for KL-4403.

Best regards
{user:pm}',
        ],
        [
            'n' => 5,
            'folder' => 'INBOX',
            'day' => -17,
            'time' => '07:00',
            'from' => 'news',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Stone & design: worktop trends this autumn',
            'body' => 'This week\'s picks:

• Sintered stone overtakes quartz in kitchens above {m:8000}
• How demand is shifting to 4 cm edges and full-height backsplashes
• Surface care: what actually works

Read the full issue on the web. You can unsubscribe at any time.',
        ],
        [
            'n' => 6,
            'folder' => 'INBOX',
            'day' => -12,
            'time' => '10:10',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Sink cutout – how do we proceed?',
            'body' => 'Hello,

I wrote through the web form about a kitchen worktop. I want an undermount sink and I am worried the edge around the cutout will not be strong enough. I am attaching a photo of the spot with the measurements.

Could you get me a quote by the end of the week?

Thank you
{contact:L9}',
            'att' => [
                ['name' => 'sink_cutout.png', 'seed' => 61],
            ],
        ],
        [
            'n' => 7,
            'folder' => 'Sent',
            'day' => -12,
            'time' => '14:20',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 6,
            'subject' => 'RE: Sink cutout – how do we proceed?',
            'body' => 'Hello {contact:L9},

thank you for the photo. An undermount sink is routine with quartz: we machine the cutout on the CNC and reinforce the edge from below. Attached is the quote for a 2.4 × 0.6 m worktop with a backsplash. The 4 cm mitred edge is an option at {m:180}.

If it works for you, we can book the measuring visit at your home.

Best regards
{user:sales}
{company}',
            'att' => [
                [
                    'name' => 'kitchen_worktop_quote.pdf',
                    'title' => 'Quote – kitchen worktop',
                    'lines' => [
                        'White quartz worktop 20 mm, 2.4 × 0.6 m',
                        'Backsplash 12 mm, undermount sink cutout',
                        'Optional: 4 cm mitred edge +{m:180}',
                        '',
                        'Total: {m:8400}',
                    ],
                ],
            ],
        ],
        [
            'n' => 8,
            'folder' => 'INBOX',
            'day' => -11,
            'time' => '09:02',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            're' => 7,
            'subject' => 'RE: Sink cutout – how do we proceed?',
            'body' => 'Hello,

the quote looks good. Can the 4 cm edge also go around the sink, or only on the front?

{contact:L9}',
        ],
        [
            'n' => 9,
            'folder' => 'Sent',
            'day' => -11,
            'time' => '11:40',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 8,
            'subject' => 'RE: Sink cutout – how do we proceed?',
            'body' => 'Hello {contact:L9},

the thick edge can go around the cutout too, it is actually the ideal way to do it. I suggest measuring on {d:2}, in the afternoon. Does that work?

Best regards
{user:sales}',
        ],
        [
            'n' => 10,
            'folder' => 'INBOX',
            'day' => -10,
            'time' => '12:00',
            'from' => 'S2',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Autumn remnant slabs: 15 % off',
            'body' => 'Hello,

like every autumn we are offering remnant slabs from stock at 15 % off. The list is attached and valid while stock lasts. Remnants suit vanity tops and window sills.

[[name:S2]]',
            'att' => [
                [
                    'name' => 'remnant_slabs.pdf',
                    'title' => 'Remnant slabs – autumn',
                    'lines' => [
                        'Calacatta 20 mm, 1.6 × 0.7 m .......... {m:210}',
                        'Absolute Black 30 mm, 1.2 × 0.6 m ..... {m:160}',
                        '',
                        'Prices exclude tax. The 15 % discount is already included.',
                    ],
                ],
            ],
        ],
        [
            'n' => 11,
            'folder' => 'Sent',
            'day' => -8,
            'time' => '09:30',
            'from' => 'pm',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Hotel Aurum – slab delay and new date',
            'body' => 'Dear {contact:C6},

we apologise for the delay. The supplier released the slabs for the spa wall cladding from production ten days late. The new delivery date to our workshop is {d:4}, and installation at the reception and the lobby starts on {d:9}.

We would be glad to meet and go through the joint colour samples and the payment schedule. Let us know if a meeting this week works for you.

Kind regards
{user:pm}
{company}',
        ],
        [
            'n' => 12,
            'folder' => 'INBOX',
            'day' => -7,
            'time' => '15:12',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => true,
            're' => 11,
            'subject' => 'RE: Hotel Aurum – slab delay and new date',
            'body' => 'Dear {first:pm},

thank you for being open about it. We accept the new date, but the spa opening is fixed. Please keep {d:9} for the installation and send me the joint colours for approval.

{contact:C6}
{client:C6}',
        ],
        [
            'n' => 13,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '08:30',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Invitation: joint sample review on site',
            'body' => 'Dear {first:owner},

attached is an invitation to review the joint sample on site in the spa. Please confirm that you can attend.

{contact:C6}',
            'att' => [
                [
                    'name' => 'invite.ics',
                    'ics' => ['day' => 4, 'time' => '10:00', 'minutes' => 60, 'title' => 'Joint sample review – Hotel Aurum', 'location' => 'Hotel Aurum, spa'],
                ],
            ],
        ],
        [
            'n' => 14,
            'folder' => 'Sent',
            'day' => -3,
            'time' => '09:00',
            'from' => 'owner',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Reminder: overdue deposit invoice',
            'body' => 'Dear {contact:C6},

a quick reminder that the deposit invoice for {project:P3} was due on {d:-12}. This is probably an oversight. Please settle it in the next few days so that we can keep the slab delivery date.

If you have already paid, please disregard this message.

Kind regards
{user:owner}
{company}',
        ],
        [
            'n' => 15,
            'folder' => 'INBOX',
            'day' => -2,
            'time' => '13:40',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            're' => 14,
            'subject' => 'RE: Reminder: overdue deposit invoice',
            'body' => 'Dear {first:owner},

our apologies, the invoice got lost between two departments. Our accountant will pay it by {d:3}.

{contact:C6}',
        ],
        [
            'n' => 16,
            'folder' => 'Sent',
            'day' => -9,
            'time' => '14:00',
            'from' => 'owner',
            'to' => 'C1',
            'seen' => true,
            'subject' => '{project:P1} – second instalment',
            'body' => 'Dear {contact:C1},

attached is the invoice for the second instalment of {project:P1}. It covers the completed measuring and the first cutting phase. Payment terms are 14 days.

Kind regards
{user:owner}
{company}',
            'att' => [
                [
                    'name' => 'second_instalment_invoice.pdf',
                    'title' => 'Invoice – second instalment',
                    'lines' => ['Customer: {client:C1}', 'Project: {project:P1}', 'Due date: {d:5}'],
                ],
            ],
        ],
        [
            'n' => 17,
            'folder' => 'INBOX',
            'day' => -8,
            'time' => '10:25',
            'from' => 'C1',
            'to' => 'owner',
            'seen' => true,
            're' => 16,
            'subject' => 'RE: {project:P1} – second instalment',
            'body' => 'Dear {first:owner},

we have received the invoice and passed it to accounting. Payment will go out on time. Could you also tell me whether the lobby measuring still fits this month?

{contact:C1}',
        ],
        [
            'n' => 18,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '10:05',
            'from' => 'C1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Facade photos – third floor',
            'body' => 'Dear {first:pm},

sending two photos of the current state of the facade on the third floor. The joints look good, we are still checking the corners.

{contact:C1}',
            'att' => [
                ['name' => 'facade_floor3_a.png', 'seed' => 71],
                ['name' => 'facade_floor3_b.png', 'seed' => 72],
            ],
        ],
        [
            'n' => 19,
            'folder' => 'INBOX',
            'day' => -14,
            'time' => '17:45',
            'from' => 'C2',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Small chip on the worktop edge',
            'body' => 'Hello,

I noticed a small chip on the worktop edge next to the dishwasher. Is this a warranty case? I am attaching a photo.

Thank you
{contact:C2}',
            'att' => [
                ['name' => 'edge_chip.png', 'seed' => 81],
            ],
        ],
        [
            'n' => 20,
            'folder' => 'Sent',
            'day' => -13,
            'time' => '09:15',
            'from' => 'sales',
            'to' => 'C2',
            'seen' => true,
            're' => 19,
            'subject' => 'RE: Small chip on the worktop edge',
            'body' => 'Hello {contact:C2},

thank you for the photo. Yes, this is a warranty case and we will repair the edge free of charge. We have opened a request in the service desk and a colleague will contact you with a visit date.

Best regards
{user:sales}
{company}',
        ],
        [
            'n' => 21,
            'folder' => 'INBOX',
            'day' => -5,
            'time' => '11:25',
            'from' => 'sales',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Showroom open day – checklist',
            'body' => 'Hi {first:owner},

for the open day on {d:10} the samples, the refreshments and the waterjet cutting demo are ready. I only need your approval of the flyer budget.

{user:sales}',
        ],
        [
            'n' => 22,
            'folder' => 'INBOX',
            'day' => -4,
            'time' => '08:50',
            'from' => 'courier',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Your parcel with samples has been delivered',
            'body' => 'The parcel with stone samples has been delivered to the recipient and signed for.

Tracking: LP-554-2290',
        ],
        [
            'n' => 23,
            'folder' => 'INBOX',
            'day' => -1,
            'time' => '10:05',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Hairline gap in a spa wall joint',
            'body' => 'Dear {first:pm},

we noticed a hairline gap in one joint on the spa wall. It is urgent because the opening is close. I am attaching a photo.

{contact:C6}',
            'att' => [
                ['name' => 'spa_joint.png', 'seed' => 91],
            ],
        ],
        [
            'n' => 24,
            'folder' => 'INBOX',
            'day' => 0,
            'time' => '07:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Weekly order list – week 45',
            'body' => 'Hi {first:pm},

the new weekly list is attached. Ten jobs this time, one of them new with a granite vanity top.

{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'order_list_week_45.csv',
                    'rows' => [
                        ['Job', 'Material', 'Area (m²)', 'Due'],
                        ['KL-4501', 'Absolute Black granite 30 mm', 1.4, '{d:8}'],
                        ['KL-4502', 'Calacatta quartz 20 mm', 3.6, '{d:8}'],
                    ],
                ],
            ],
        ],
    ],
];
