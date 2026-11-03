<?php
/**
 * SAI pack, English (US) edition. Data only (contract: demo_seed/index.php).
 *
 * 'completed' is demo-sai-1: "Raise quartz worktop prices by 8 % and add free laser measuring"
 * (docs/DEMO-MODE.md C12) - graph, six featured agents, nine posts, three rounds of metrics and the
 * strategic report, stored exactly as a finished live run leaves it. 'draft' is demo-sai-2: the
 * outdoor-kitchen line in sintered stone, configured but not run.
 *
 * People and companies are referred to by ref ('client' => 'C3', 'supplier' => 'S1') and appear in
 * texts as {contact:C3} / {client:C3}; the rival workshop and its owner are invented and not in the
 * cast. Amounts are {m:EUR}. Votes are the keys yes | maybe | no (resolved to 'answers').
 * Same keys, list lengths and numbers in packs/sk and packs/hu.
 */
return [
    'completed' => [
        'title' => '8 % quartz worktop price rise with free laser measuring',
        'hypothesis' => 'What if we raise quartz worktops by 8 % but make the laser measuring visit free (normally {m:90}), promise installation within 10 working days of measuring, and keep the old prices for running studio projects until the end of the quarter?',
        'seed' => 'New quartz worktop price list: +8 %. Included: laser measuring ({item:I8}, normally {m:90}), installation within 10 working days of measuring. Running studio projects stay at the old prices until the end of the quarter.',
        'question' => 'Will our customers accept an 8 % price rise on quartz worktops if we add free laser measuring and installation within 10 working days, and keep the old prices for running studio projects?',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 3,
        'lookback' => 12,
        'created' => ['day' => -4, 'time' => '08:55'],
        'updated' => ['day' => -4, 'time' => '16:40'],

        'answers' => [
            'yes' => 'Accept (with laser measuring and the date promise)',
            'maybe' => 'Hesitant / want project pricing',
            'no' => 'Reject (cheaper workshop)',
        ],

        'nodes' => [
            ['id' => 'node_studios', 'type' => 'Partner', 'client' => 'C3', 'name' => 'Partner kitchen studios',
                'summary' => 'Bring in about 55 % of the jobs, among them {client:C3}. Sensitive to a price they must defend in front of their own client, and to the installation date.'],
            ['id' => 'node_homeowners', 'type' => 'Client', 'client' => 'L9', 'name' => 'Homeowners renovating',
                'summary' => 'Buy a kitchen once in 15 years, like {contact:L9}. Damage risk, delays and a vague warranty worry them more than the price.'],
            ['id' => 'node_architect', 'type' => 'Partner', 'client' => 'L10', 'name' => 'Architect studio partner',
                'summary' => '{client:L10} is negotiating a framework for six villa projects a year. It needs a fixed quarterly price.'],
            ['id' => 'node_developers', 'type' => 'Buyer', 'client' => 'C1', 'project' => 'P1', 'name' => 'Developers',
                'summary' => '{client:C1} is cladding twelve villas in {project:P1}. A callback costs the site a crew day and delays the handover.'],
            ['id' => 'node_rival', 'type' => 'Competitor', 'name' => 'Low-cost stone workshop',
                'summary' => 'Undercuts by 15 %, templates with plywood and does not promise a fixed installation date.'],
            ['id' => 'node_supplier', 'type' => 'Supplier', 'supplier' => 'S1', 'name' => 'Italian slab producer',
                'summary' => 'Main quartz supplier. A current 10-day delivery delay threatens the promise of installation within 10 working days.'],
        ],
        'edges' => [
            ['id' => 'edge_1', 'source' => 'node_rival', 'target' => 'node_studios', 'round' => 1, 'relation' => 'UNDERCUTS',
                'fact' => 'The workshop offers studios a 5 % commission on every job they pass on.'],
            ['id' => 'edge_2', 'source' => 'node_studios', 'target' => 'node_homeowners', 'round' => 1, 'relation' => 'RECOMMENDS',
                'fact' => 'Studios decide which stone workshop is used in 7 out of 10 kitchens.'],
            ['id' => 'edge_3', 'source' => 'node_supplier', 'target' => 'node_developers', 'round' => 2, 'relation' => 'THREATENS',
                'fact' => 'The delayed shipment pushes the quartz deliveries for the villas back by 10 days.'],
            ['id' => 'edge_4', 'source' => 'node_homeowners', 'target' => 'node_rival', 'round' => 2, 'relation' => 'COMPARES',
                'fact' => 'Homeowners see forum photos of chipped edges after installs by the cheaper workshop.'],
            ['id' => 'edge_5', 'source' => 'node_architect', 'target' => 'node_studios', 'round' => 3, 'relation' => 'CONFIRMS',
                'fact' => 'The architect studio says a fixed quarterly price would let it commit its villa projects to Lapidea.'],
        ],

        'agents' => [
            ['username' => 'studio_owner', 'client' => 'C3', 'displayName' => '{contact:C3}', 'mbti' => 'ESTJ', 'stance' => 'opposing', 'followers' => 1840, 'karma' => 390, 'node' => 'node_studios',
                'profession' => 'Kitchen studio owner',
                'userChar' => 'Pragmatic studio owner. Every price rise must be explained to her clients, so she rejects it unless she gets a transition period and something tangible on top.',
                'publicBio' => 'Custom kitchens since 2009',
                'topics' => ['pricing', 'deadlines', 'commission']],
            ['username' => 'careful_homeowner', 'client' => 'L9', 'displayName' => '{contact:L9}', 'mbti' => 'ISFJ', 'stance' => 'supportive', 'followers' => 320, 'karma' => 140, 'node' => 'node_homeowners',
                'profession' => 'Homeowner renovating her kitchen',
                'userChar' => 'Careful buyer. A sink cut 8 mm off cost her a month of waiting once, so accurate measuring and a fixed date matter more to her than price.',
                'publicBio' => 'Mother of two | renovating a family house',
                'topics' => ['accuracy', 'reliability']],
            ['username' => 'stone_discount', 'displayName' => 'Dale Brennan', 'mbti' => 'ENTJ', 'stance' => 'opposing', 'followers' => 2650, 'karma' => 210, 'node' => 'node_rival',
                'profession' => 'Managing director, StoneDiscount',
                'userChar' => 'Rival who competes on price. He frames the rise as overcharging and lures studios with commission.',
                'publicBio' => 'Same stone, lower price | Denver Metro',
                'topics' => ['pricing', 'commission']],
            ['username' => 'architect_partner', 'client' => 'L10', 'displayName' => '{contact:L10}', 'mbti' => 'ISTJ', 'stance' => 'neutral', 'followers' => 2980, 'karma' => 560, 'node' => 'node_architect',
                'profession' => 'Principal, architect studio',
                'userChar' => 'Exact and sceptical. Plans six villas a year and signs only a fixed price with a date promise that holds even when the supplier is late.',
                'publicBio' => 'Architecture & interiors | Munich',
                'topics' => ['framework', 'delivery dates']],
            ['username' => 'site_developer', 'client' => 'C1', 'displayName' => '{contact:C1}', 'mbti' => 'ENTP', 'stance' => 'neutral', 'followers' => 1510, 'karma' => 300, 'node' => 'node_developers',
                'profession' => 'Development manager',
                'userChar' => 'Counts the cost of twelve villas. One callback costs him a crew day and a late handover, so he looks at the total, not the slab price.',
                'publicBio' => 'Residential development | Denver',
                'topics' => ['total cost', 'handover']],
            ['username' => 'hotel_manager', 'client' => 'C6', 'displayName' => '{contact:C6}', 'mbti' => 'INFJ', 'stance' => 'supportive', 'followers' => 4120, 'karma' => 480, 'node' => 'node_developers',
                'profession' => 'General manager, boutique hotel',
                'userChar' => 'Needs accurate work in an occupied hotel. Laser measuring spares her a second site visit and the guests a second round of noise.',
                'publicBio' => 'Hospitality | Aspen, CO',
                'topics' => ['accuracy', 'guest experience']],
        ],

        // agent = 1-based index into 'agents'; answer = yes | maybe | no; target = id of the post quoted/answered (0 = none)
        'posts' => [
            ['id' => 101, 'round' => 1, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 31, 'quotes' => 6, 'comments' => 15, 'sentiment' => -0.6, 'time' => '09:10', 'answer' => 'no', 'target' => 0,
                'text' => '8 % dearer worktops in the middle of the season? I cannot explain that to my clients. Without at least three months at the old prices for running projects, I will start looking elsewhere.'],
            ['id' => 102, 'round' => 1, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 44, 'quotes' => 11, 'comments' => 21, 'sentiment' => -0.8, 'time' => '09:40', 'answer' => 'no', 'target' => 0,
                'text' => 'Same quartz, 15 % cheaper, and studios get a 5 % commission from us. Nobody needs to pay extra for laser measuring - we do it with a plywood template.'],
            ['id' => 103, 'round' => 1, 'agent' => 2, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 58, 'quotes' => 12, 'comments' => 19, 'sentiment' => 0.7, 'time' => '10:20', 'answer' => 'yes', 'target' => 102,
                'text' => 'A plywood template? That is exactly how my sink was cut 8 mm off last time, and I waited a month for the fix. Free laser measuring and a fixed date are worth 8 % to me.'],
            ['id' => 104, 'round' => 2, 'agent' => 4, 'platform' => 'forum', 'type' => 'POST', 'likes' => 67, 'quotes' => 14, 'comments' => 26, 'sentiment' => 0.3, 'time' => '12:35', 'answer' => 'maybe', 'target' => 0,
                'text' => 'For a framework the key question is whether the 10-working-day promise holds even when the Italian supplier is late. If it does and the price is fixed for the quarter, we will accept 8 %.'],
            ['id' => 105, 'round' => 2, 'agent' => 6, 'platform' => 'forum', 'type' => 'POST', 'likes' => 73, 'quotes' => 16, 'comments' => 18, 'sentiment' => 0.75, 'time' => '13:05', 'answer' => 'yes', 'target' => 0,
                'text' => 'Laser measuring spares me a second site visit in an occupied hotel, and cut-out complaints have practically disappeared. I will gladly pay 8 % for that.'],
            ['id' => 106, 'round' => 2, 'agent' => 5, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 49, 'quotes' => 9, 'comments' => 13, 'sentiment' => 0.4, 'time' => '14:20', 'answer' => 'maybe', 'target' => 0,
                'text' => 'I ran it for twelve villas: one edge complaint costs me a crew day and a delayed handover. At 8 % more with measuring included we come out cheaper than with a rework, if the date holds.'],
            ['id' => 107, 'round' => 3, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 88, 'quotes' => 17, 'comments' => 20, 'sentiment' => 0.55, 'time' => '15:50', 'answer' => 'yes', 'target' => 101,
                'text' => 'Confirmed: the old prices stay until the end of the quarter for all running projects, and measuring is free. On those terms I am staying - and I will show my clients the laser report.'],
            ['id' => 108, 'round' => 3, 'agent' => 4, 'platform' => 'forum', 'type' => 'COMMENT', 'likes' => 61, 'quotes' => 8, 'comments' => 14, 'sentiment' => 0.5, 'time' => '16:10', 'answer' => 'yes', 'target' => 104,
                'text' => 'We agree to the framework if the Statuario exception (15 days) is written into the contract. For all other designs we will sign 10 working days.'],
            ['id' => 109, 'round' => 3, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 17, 'quotes' => 2, 'comments' => 9, 'sentiment' => -0.5, 'time' => '17:30', 'answer' => 'no', 'target' => 0,
                'text' => 'Let us see how long "installation in 10 days" lasts when Italy fails to deliver again. At least we do not promise what we cannot keep.'],
        ],

        // dist = votes [yes, maybe, no] (sum 6, one per featured agent); leading = yes | maybe | no
        'metrics' => [
            ['round' => 1, 'hour' => 9, 'sentiment' => -0.24, 'supportive' => 2, 'opposing' => 2, 'neutral' => 2, 'interactions' => 150, 'viral' => 38, 'dist' => [2, 1, 3], 'leading' => 'no', 'consensus' => 50],
            ['round' => 2, 'hour' => 12, 'sentiment' => 0.21, 'supportive' => 3, 'opposing' => 1, 'neutral' => 2, 'interactions' => 310, 'viral' => 61, 'dist' => [3, 2, 1], 'leading' => 'yes', 'consensus' => 50],
            ['round' => 3, 'hour' => 15, 'sentiment' => 0.46, 'supportive' => 4, 'opposing' => 1, 'neutral' => 1, 'interactions' => 470, 'viral' => 79, 'dist' => [4, 1, 1], 'leading' => 'yes', 'consensus' => 74],
        ],

        'report' => [
            'title' => 'Strategic briefing: an 8 % quartz worktop price rise with free laser measuring',
            'summary' => 'The simulation tested an 8 % rise on quartz worktops combined with free laser measuring and installation within 10 working days. The market split into studios, who must defend the price, and end customers, who weigh damage risk and delays. By round 3 the transition period for running studio projects had turned the biggest sceptic, and approval reached 74 %.',
            'directAnswer' => 'YES, with a transition period for studios (74 % approval)',
            'confidence' => 84,
            'verdictSummary' => 'What decided it was tangible value: customers and architects see laser measuring and a held date as protection against complaints that cost them far more than 8 %.',
            'shares' => [
                ['pct' => 74, 'count' => 4, 'sentiment' => 0.6],
                ['pct' => 16, 'count' => 1, 'sentiment' => 0.3],
                ['pct' => 10, 'count' => 1, 'sentiment' => -0.7],
            ],
            'drivers' => [
                ['title' => '1. Accurate cut-outs, first time', 'explanation' => 'Homeowners and developers count the price of a complaint, not only the price of the slab.',
                    'quote' => 'Free laser measuring and a fixed date are worth 8 % to me.'],
                ['title' => '2. Free laser measuring', 'explanation' => 'It saves a second site visit and is the one thing a plywood-template rival cannot copy quickly.',
                    'quote' => 'Laser measuring spares me a second site visit.'],
                ['title' => '3. Old prices to the end of the quarter', 'explanation' => 'The transition period neutralised the opposition of studios that have quotes out.',
                    'quote' => 'On those terms I am staying.'],
            ],
            'tipping' => [
                'round' => 3,
                'description' => 'Confirming the old prices for running projects turned the studio owner from opposition to support.',
                'impact' => 'The studio segment moved from opposing to supportive.',
            ],
            'whatIf' => [
                'Without a transition period, studios would move an estimated 30 % of their jobs to the competitor.',
                'If the date promise did not hold when the supplier is late, the architect studio would not sign the framework.',
            ],
            'recommendations' => [
                'Call the 10 largest studios personally before the announcement and confirm the old prices until the end of the quarter.',
                'Write the 15-day Statuario exception into the framework with the architect studio.',
                'Keep a buffer of 6 slabs of the best-selling designs against delays from the Italian producer.',
            ],
            'sections' => [
                ['title' => '1. Consensus and market polarisation',
                    'content' => 'The announcement split the market into **intermediaries** (kitchen studios), who must defend the price, and **end customers**, who weigh the cost of a complaint.

Key findings:
- **Sentiment swing**: from **-0.24** in round 1 to **+0.46** in round 3.
- **Transition period**: old prices for running projects turned the most vocal opponent into a supporter.
- **Laser measuring** was the most quoted benefit among homeowners and the hotel.'],
                ['title' => '2. Vulnerabilities and main objections',
                    'content' => '1. **Dates when the supplier is late**: the 10-working-day promise must hold even when the Italian producer is late.
2. **Quotes already sent**: studios with quotes at the old price need the transition period in writing.'],
                ['title' => '3. The rival\'s counter-strategy',
                    'content' => 'The low-cost workshop offered studios a 5 % commission and a price 15 % lower. The attack failed once customers shared experiences of inaccurate plywood templates.

- Forum photos of chipped edges did more damage than any price comparison.'],
                ['title' => '4. 🎯 WHICH STRATEGY REACHES THE GOAL?',
                    'content' => 'To introduce the rise without losing studios, follow these steps:'],
            ],
            'vulnerabilities' => [
                'No written transition period for studios with quotes already sent.',
                'The date promise depends on a supplier that is currently late.',
                'The rival can keep calling laser measuring a gimmick.',
            ],
            'counterMeasures' => [
                'Send every studio a one-page letter confirming the old prices until the end of the quarter.',
                'Show the laser measuring report with every quote.',
                'Publish before-and-after photos of finished edges and cut-outs.',
            ],
            'objections' => [
                ['objection' => '8 % more in the middle of the season is too much.', 'rebuttal' => 'Measuring that normally costs {m:90} is free, and one complaint costs more than the rise.'],
                ['objection' => 'I have already sent my client a quote at the old price.', 'rebuttal' => 'Every running project is delivered at the old prices until the end of the quarter.'],
                ['objection' => 'What if the Italian supplier is late again?', 'rebuttal' => 'We hold a stock buffer of the best-selling designs and state exceptions (Statuario) up front.'],
            ],
            'gtm' => [
                'Day 1: personal calls to the 10 largest studios, confirming old prices.',
                'Day 7: sign the framework with the architect studio, including the Statuario exception.',
                'Day 14: new price list with free laser measuring on the website and in the showroom.',
                'Day 30: "accurate to the millimeter" campaign for architects.',
            ],
        ],
    ],

    'draft' => [
        'title' => 'Outdoor-kitchen line in sintered stone for spring',
        'hypothesis' => 'What if we launch an outdoor-kitchen line in sintered stone (counters, backsplash, terrace paving) for spring, sold through our partner studios and the showroom, with {item:I2} as the hero material?',
        'seed' => 'Spring launch: outdoor kitchens in {item:I2} (frost- and UV-resistant), counters and backsplash made in our own CNC workshop, terrace paving as an add-on. Offered through partner studios and the showroom, laser measuring included.',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 5,
        'lookback' => 12,
        'created' => ['day' => -1, 'time' => '15:20'],
    ],
];
