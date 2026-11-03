<?php
/**
 * Clients pack, English (US) edition: what happens to clients C1-C6 and leads L7-L11 (Part D3).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/clients.php). The people and
 * companies themselves live in company.php and are referred to by ref / {placeholder}. Same keys, list
 * lengths and numbers as packs/sk/clients.php and packs/hu/clients.php; only strings differ.
 * Amounts inside text are {m:EUR}; dates are {d:offset}; no currency symbol is ever typed.
 */
return [
    'categories' => [
        'private' => ['name' => 'Private households', 'parent' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Home'],
        'commercial' => ['name' => 'Commercial & developers', 'parent' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Building'],
        'trade' => ['name' => 'Trade partners & studios', 'parent' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
        'hospitality' => ['name' => 'Hotels & hospitality', 'parent' => 'commercial', 'level' => 2, 'color' => '#0ea5e9', 'icon' => 'Coffee'],
    ],

    'statusTitle' => 'Status changed to "%s"',

    // source: showroom | facebook | instagram | website. division: index into the edition's two divisions.
    // adjustmentEur: value of earlier orders - a positive figure is what makes a record a client.
    // leadCategories: indexes into LEAD_CATEGORIES (0 products, 1 services).
    'leads' => [
        'C1' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 0, 'adjustmentEur' => 6800, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -150, 'legalForm' => 'LLC',
            'interest' => 'Stone cladding for the facade and the lobby floor of a new 12-villa residence (about 180 m² of large-format porcelain and quartz slabs).'],
        'C2' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 1850, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C3', 'day' => -110, 'legalForm' => '',
            'interest' => 'Kitchen worktop and 24 in backsplash in white quartz, undermount sink cutout.'],
        'C3' => ['source' => 'showroom', 'owner' => 'pm', 'division' => 0, 'adjustmentEur' => 12400, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -190, 'legalForm' => 'Inc.',
            'interest' => 'Partner kitchen studio: fabrication of worktops for its kitchen projects, about 8-10 jobs a month.'],
        'C4' => ['source' => 'website', 'owner' => 'pm', 'division' => 1, 'adjustmentEur' => 3900, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -95, 'legalForm' => 'Ltd.',
            'interest' => 'Showroom tables and window sills in sintered stone for a furniture retailer in Canada.'],
        'C5' => ['source' => 'facebook', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 5200, 'leadCategories' => [0], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -70, 'legalForm' => 'LLC',
            'interest' => 'Bathroom vanity tops and wall cladding for a series of apartment refurbishments.'],
        'C6' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 9500, 'leadCategories' => [0, 1], 'clientCategory' => 'hospitality', 'referral' => 'L10', 'day' => -60, 'legalForm' => 'Inc.',
            'interest' => 'Reception desk, spa wall cladding and lobby flooring for a boutique hotel; yearly maintenance contract.'],
        'L7' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -1, 'legalForm' => '',
            'interest' => 'Bathroom vanity top and shower wall cladding in a family house.'],
        'L8' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C2', 'day' => -8, 'legalForm' => '',
            'interest' => 'Terrace paving and an outdoor kitchen counter in 20 mm porcelain slabs.'],
        'L9' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -4, 'legalForm' => '',
            'interest' => 'Kitchen worktop in white quartz with an undermount sink cutout and a 4 in mitred edge option.'],
        'L10' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 0, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -75, 'legalForm' => 'GmbH',
            'interest' => 'Partnership with an architect studio: worktops, cladding and floors for about six villa projects a year.'],
        'L11' => ['source' => 'facebook', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -40, 'legalForm' => '',
            'interest' => 'A small bathroom worktop; the client chose a cheaper workshop.'],
    ],

    // headers = true: the card is filed the way mail_broker.php files a mailbox message (From/To/Subject above the body).
    // user = the CRM user the entry belongs to; null = nobody here triggered it (a public form, an incoming mail).
    'timeline' => [
        // --- C1 Highland Park (developer) -------------------------------------------------------
        ['client' => 'C1', 'day' => -150, 'time' => '10:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => '{contact:C1} called after seeing our showroom: a new 12-villa residence needs facade cladding and a lobby floor in large-format slabs. Agreed on a site visit and the next steps.'],
        ['client' => 'C1', 'day' => -147, 'time' => '09:40', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Catalogue and sample board sent',
            'content' => 'Sent the slab catalogue, the price guide and a sample board by post.'],
        ['client' => 'C1', 'day' => -138, 'time' => '14:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Site visit and laser measurement',
            'content' => 'Measured the facade and the lobby with the laser, photos and drawings are in the project folder. Three phases: measuring, fabrication, installation.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:20', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Order confirmed',
            'content' => 'The developer accepted the quote ({m:24600}) by e-mail; the 40 % deposit is requested and a production slot is booked.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:21', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C1', 'day' => -12, 'time' => '16:10', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Facade stage 1 finished',
            'content' => '{contact:C1} confirmed that stage 1 of the facade is done and the scaffolding is clear. The slab order for stage 2 is due this week.'],

        // --- C2 Andrea Wilson (private, project done) ------------------------------------------
        ['client' => 'C2', 'day' => -110, 'time' => '15:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => 'Found us on Instagram and was recommended by {client:C3}. Wants a white quartz worktop and a backsplash. Agreed on a showroom visit.'],
        ['client' => 'C2', 'day' => -104, 'time' => '13:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Showroom visit and laser measurement',
            'content' => 'Picked the slab in the showroom, then measured her kitchen with the laser the same afternoon.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:05', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Order confirmed',
            'content' => 'The client confirmed the quote ({m:5900}) by e-mail; fabrication starts next week.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:06', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C2', 'day' => -45, 'time' => '17:20', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Installed and paid',
            'content' => 'The worktop was installed in one day and the final invoice is paid. The client agreed to final photos for our portfolio.'],
        ['client' => 'C2', 'day' => -6, 'time' => '11:15', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Warranty: small chip on the edge',
            'content' => '{contact:C2} found a small chip on the worktop edge next to the dishwasher and sent a photo. A warranty ticket is open and a repair visit is planned.'],

        // --- C3 KitchenLine (partner studio) -----------------------------------------------------
        ['client' => 'C3', 'day' => -190, 'time' => '09:00', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => '{contact:C3} runs a kitchen studio and needs a reliable workshop for worktops: 8-10 jobs a month. Agreed on a visit to our workshop.'],
        ['client' => 'C3', 'day' => -183, 'time' => '16:10', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Framework price list sent',
            'content' => 'Sent the partner price list with volume tiers and the standard lead times.'],
        ['client' => 'C3', 'day' => -170, 'time' => '12:00', 'type' => 'note', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Client note',
            'content' => 'The studio sends a worktop list every Monday; measuring is done by their own fitters. Prefers e-mail, decisions are made by {contact:C3}.'],
        ['client' => 'C3', 'day' => -160, 'time' => '10:00', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C3', 'day' => -9, 'time' => '14:25', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Wrong edge profile on one worktop',
            'content' => '{contact:C3} reported that one worktop was delivered with the wrong edge profile. We agreed to redo it and to issue a credit note for the difference.'],

        // --- C4 Maple & Stone (foreign retailer) --------------------------------------------------
        ['client' => 'C4', 'day' => -95, 'time' => '14:20', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => '{contact:C4} found our website. The retailer wants showroom tables and window sills in sintered stone and asks about export to Canada.'],
        ['client' => 'C4', 'day' => -88, 'time' => '09:30', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Quote and shipping terms sent',
            'content' => 'Sent the quote with slab sizes, crating and the delivery terms for Vancouver.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:00', 'type' => 'order', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Order confirmed',
            'content' => 'The retailer confirmed the quote by e-mail; a 50 % advance was requested before cutting.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:01', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],

        // --- C5 Southside Property Management (series of apartments) ---------------------------------
        ['client' => 'C5', 'day' => -70, 'time' => '11:00', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => '{contact:C5} manages a block of apartments that are being refurbished one by one and needs the same vanity top in every bathroom.'],
        ['client' => 'C5', 'day' => -62, 'time' => '13:45', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Site visit',
            'content' => 'Looked at three sample bathrooms and agreed on one standard size so the whole series can be cut in one batch.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:30', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Order confirmed',
            'content' => 'The property manager confirmed series 1 ({m:21000}); installation starts in about three weeks.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:31', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C5', 'day' => -3, 'time' => '09:20', 'type' => 'note', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Start date for series 1',
            'content' => '{contact:C5} will hand over the first apartments on {d:21}. Cutting is planned the week before.'],

        // --- C6 Hotel Aurum (boutique hotel) -------------------------------------------------------------
        ['client' => 'C6', 'day' => -60, 'time' => '10:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => '{contact:C6} is renovating the reception, the spa and the lobby of the hotel; the architect recommended us. Agreed on a visit.'],
        ['client' => 'C6', 'day' => -52, 'time' => '15:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Site visit and laser measurement',
            'content' => 'Measured the reception, the spa wall and the lobby. The spa wall needs large-format sintered stone; the reception desk is a 30 mm quartz with mitred corners.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:15', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Order confirmed',
            'content' => 'The hotel signed the quote ({m:46000}) and the yearly maintenance contract; the 40 % deposit is due on the invoice.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:16', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C6', 'day' => -14, 'time' => '16:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Slab delivery is late - apology',
            'content' => 'Told {contact:C6} that the slabs from Italy arrive later than planned and that the spa wall moves back. A new date will follow in writing.'],
        ['client' => 'C6', 'day' => -6, 'time' => '14:00', 'type' => 'appointment', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Client meeting: spa wall delay',
            'content' => 'Met {contact:C6} at the hotel: the new delivery date, approval of the slab sample and the payment schedule. The meeting notes are in the AI meeting room.'],

        // --- L7 Peter Collins (new, web form yesterday) ----------------------------------------------------
        ['client' => 'L7', 'day' => -1, 'time' => '19:42', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Web form inquiry',
            'content' => "Form submission received from source: website\nName: {contact:L7}\nCategory: Products\nValue: {m:3200}\nMessage: We are renovating the main bathroom and would like a quartz vanity top and a stone shower wall. Could you send a quote and tell us how long it takes?"],

        // --- L8 Eva Martinez (contacted) ---------------------------------------------------------------------
        ['client' => 'L8', 'day' => -8, 'time' => '20:05', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Instagram message',
            'content' => '{contact:L8} wrote to us after seeing the finished kitchen of {contact:C2}, who recommended us: she wants new terrace paving and an outdoor kitchen counter.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'First call',
            'content' => 'The terrace is about 280 sq ft, the counter 8 ft long. Porcelain slabs of 20 mm are frost-proof, so they suit the outdoors. Agreed on a measuring visit.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'contacted', 'title' => null, 'content' => null],
        ['client' => 'L8', 'day' => -2, 'time' => '12:30', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Catalogue and sample board sent',
            'content' => 'Sent the outdoor slab catalogue and a price guide; the draft quote follows after the measuring visit.'],

        // --- L9 Martina Novak (offer sent): the web form and the sink-cutout thread --------------------------
        ['client' => 'L9', 'day' => -4, 'time' => '08:15', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Web form inquiry',
            'content' => "Form submission received from source: website\nName: {contact:L9}\nCategory: Products\nValue: {m:8400}\nMessage: I am looking for a white quartz kitchen worktop, 8 ft long. The kitchen units are installed in a few weeks. I visited your showroom last week and would like a quote."],
        ['client' => 'L9', 'day' => -3, 'time' => '09:12', 'type' => 'email', 'user' => 'sales', 'outgoing' => false, 'headers' => true, 'status' => null,
            'title' => 'Kitchen worktop drawings + sink cutout',
            'content' => "Hello {first:sales},\n\nthank you for the showroom visit last week. I am attaching the kitchen drawings from our architect - the worktop is 8 ft long and 24 in deep, with an 8 in overhang above the dishwasher.\n\nThere are three things I would like to confirm before we go ahead:\n\n1. The sink is an undermount Sinkra 500x400 mm, so the cutout has to be polished on all four sides.\n2. We would like the same stone for the 24 in backsplash, in 12 mm thickness.\n3. Is a 4 in mitred edge possible on the front side, or does it change the price significantly?\n\nDelivery would ideally fall in the week of {d:20} - the kitchen units are being installed on {d:24}.\n\nThank you and have a nice day,\n{contact:L9}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:40', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => true, 'status' => null,
            'title' => 'RE: Kitchen worktop drawings + sink cutout',
            'content' => "Hello {contact:L9},\n\nthank you for the drawings, everything is clear.\n\n1. The undermount cutout including the polishing of all four edges is part of the standard fabrication price, no surcharge.\n2. The 24 in backsplash in 12 mm is no problem - I have added it to the quote as a separate item.\n3. The 4 in mitred edge is possible; it adds roughly {m:180} to the total because of the extra cutting and gluing.\n\nThe revised quote is attached. If you confirm it by {d:2}, we can book the laser measurement for {d:6} and deliver in the week of {d:20}, so you would be on time for the kitchen units.\n\nBest regards,\n{user:sales}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L10 Müller Architekten (foreign architect studio, offer sent) ----------------------------------------
        ['client' => 'L10', 'day' => -75, 'time' => '11:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Visit at the showroom',
            'content' => '{contact:L10} visited the showroom with a client and liked the sintered stone samples. His studio designs about six villas a year; talked about a partnership.'],
        ['client' => 'L10', 'day' => -68, 'time' => '09:50', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Samples and reference list sent',
            'content' => 'Sent a sample set of three sintered stones and a list of our reference projects, including {client:C6}.'],
        ['client' => 'L10', 'day' => -45, 'time' => '15:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Call about shipping to Germany',
            'content' => 'The studio needs delivery on pallets to Bavaria and a fixed price per square meter for the framework. We prepare a partnership offer.'],
        ['client' => 'L10', 'day' => -30, 'time' => '10:20', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L11 Ryan Thompson (lost on price) -----------------------------------------------------------------------
        ['client' => 'L11', 'day' => -40, 'time' => '17:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Intro call',
            'content' => 'The client needs a small bathroom worktop and compares several workshops. Promised a quote within two days.'],
        ['client' => 'L11', 'day' => -36, 'time' => '10:10', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Quote sent',
            'content' => 'Sent the quote for {m:2900}. Offered a thinner quartz to bring the price down.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:40', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Declined: another workshop is cheaper',
            'content' => 'The client went with a cheaper workshop, about 15 % below our price. We keep the contact for a later project.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:41', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'lost', 'title' => null, 'content' => null],
    ],
];
