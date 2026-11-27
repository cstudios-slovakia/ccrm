<?php
/**
 * Newsletter pack, English (US) edition: the global header and footer, and three campaigns of
 * Lapidea (docs/NEWSLETTER.md C15, docs/DEMO-MODE.md "Newsletter").
 *
 * Data only (contract: demo_seed/index.php; how it becomes rows and an EmailDoc: header of
 * demo_seed/newsletter.php). Same keys, list lengths and numbers as packs/sk/newsletter.php and
 * packs/hu/newsletter.php; only strings differ. Merge tags are plain `{{first_name|there}}`; only tags with an
 * underscore are used, because `{{company}}` would be read as the demo placeholder {company}.
 * `%address%` is replaced by the demo company's postal address. Colours and URLs are not translated.
 */
return [
    // Rows: layout '1' (one column) or '1-1' (two). Blocks: heading | text | button | divider | social.
    'header' => [
        'rows' => [
            ['layout' => '1', 'background' => '#2b2724', 'columns' => [[
                ['type' => 'heading', 'level' => 2, 'html' => '{brand}', 'align' => 'center', 'color' => '#f3ece3'],
                ['type' => 'text', 'html' => '<p>Custom quartz, stone and sintered stone</p>', 'align' => 'center', 'color' => '#cdbfae', 'fontSize' => 13],
            ]]],
        ],
    ],

    'footer' => [
        'rows' => [
            ['layout' => '1', 'background' => '#efebe6', 'columns' => [[
                ['type' => 'social', 'align' => 'center', 'items' => [
                    ['network' => 'instagram', 'url' => 'https://instagram.example/lapidea'],
                    ['network' => 'facebook', 'url' => 'https://facebook.example/lapidea'],
                    ['network' => 'website', 'url' => 'https://lapidea.example'],
                ]],
                ['type' => 'text', 'html' => '<p>You are receiving this e-mail because you are a customer of {company} or asked to hear from us.</p><p><a href="{{view_online_url}}">View in browser</a> | <a href="{{unsubscribe_url}}">Unsubscribe</a></p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
                ['type' => 'text', 'html' => '<p>Our address: {company}, %address%</p><p>&copy; {{current_year}} {brand}</p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
            ]]],
        ],
    ],

    'campaigns' => [
        // Sent 20 days ago to the architects and studios (trade partners, commercial clients, hotels).
        1 => [
            'name' => 'Spring remnant slab sale',
            'subject' => 'Remnant slabs up to 40 % off, this month only',
            'preheader' => 'Quartz, granite and sintered stone remnants for your next project.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Spring remnant slab sale', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name|there}},</p><p>Our spring clear-out has started: remnant slabs of quartz, granite and sintered stone, already cut to a size that suits vanities, bar tops and window sills, are now up to 40 % off.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Quartz and granite', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Calacatta quartz and Absolute Black granite remnants, 20 to 30 mm thick, with a polished face.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Sintered stone', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Large-format offcuts in 12 mm and 6 mm, ideal for wall cladding and shelves.</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'See the remnant list', 'href' => 'https://lapidea.example/remnants', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>The offer is valid until {d:-6}. Reply to this e-mail and our showroom team will reserve a slab for your next project.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // Sent 60 days ago to all clients.
        2 => [
            'name' => 'Caring for your new worktop',
            'subject' => 'Three habits that keep your new worktop looking new',
            'preheader' => 'A short guide to daily care, from our workshop.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Caring for your new worktop', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name|there}},</p><p>A stone worktop is built to last, and a few simple habits keep it looking the way it did on installation day.</p>', 'align' => 'left'],
                    ['type' => 'heading', 'level' => 3, 'html' => 'Our three habits', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<ol><li>Wipe spills with a soft cloth and a mild cleaner, never with an abrasive sponge.</li><li>Use a trivet under hot pans and a board under knives.</li><li>Renew the sealer once a year on natural stone.</li></ol>', 'align' => 'left'],
                    ['type' => 'button', 'label' => 'Order the care kit', 'href' => 'https://lapidea.example/care-kit', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>The {item:I7} contains everything you need for the first year. Questions about your stone? Just reply to this e-mail.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // The draft: clients and leads, a finished body.
        3 => [
            'name' => 'New sintered stone collection',
            'subject' => 'Meet our new sintered stone collection',
            'preheader' => 'Seven new decors, from {m:140} per m².',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'The new sintered stone collection', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name|there}},</p><p>Seven new decors have arrived in our showroom. Sintered stone resists heat, scratches and stains, and works indoors and out.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Dark and dramatic', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I2}, a black marble look for kitchens and bathrooms.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Light and slim', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I3}, from {m:140} per m².</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'Book a showroom visit', 'href' => 'https://lapidea.example/showroom', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'social', 'align' => 'center', 'items' => [
                        ['network' => 'instagram', 'url' => 'https://instagram.example/lapidea'],
                        ['network' => 'website', 'url' => 'https://lapidea.example/collection'],
                    ]],
                ]]],
            ],
        ],
    ],

    // Notes of the three suppression rows (Settings > Newsletter > Unsubscribed).
    'notes' => [
        'bounced' => 'Hard bounce: 550 mailbox unavailable',
        'unsubscribed' => 'Unsubscribed with the link in the e-mail',
        'manual' => 'Asked by phone not to receive e-mails',
    ],
];
