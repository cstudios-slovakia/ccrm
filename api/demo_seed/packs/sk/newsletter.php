<?php
/**
 * Newsletter pack, Slovak edition: the global header and footer, and three campaigns of
 * Lapidea (docs/NEWSLETTER.md C15, docs/DEMO-MODE.md "Newsletter").
 *
 * Data only (contract: demo_seed/index.php; how it becomes rows and an EmailDoc: header of
 * demo_seed/newsletter.php). Same keys, list lengths and numbers as packs/en/newsletter.php and
 * packs/hu/newsletter.php; only strings differ. Merge tags are plain `{{first_name|...}}`; only tags with an
 * underscore are used, because `{{company}}` would be read as the demo placeholder {company}.
 * `%address%` is replaced by the demo company's postal address. Colours and URLs are not translated.
 */
return [
    // Rows: layout '1' (one column) or '1-1' (two). Blocks: heading | text | button | divider | social.
    'header' => [
        'rows' => [
            ['layout' => '1', 'background' => '#2b2724', 'columns' => [[
                ['type' => 'heading', 'level' => 2, 'html' => '{brand}', 'align' => 'center', 'color' => '#f3ece3'],
                ['type' => 'text', 'html' => '<p>Kremenec, kameň a spekaný kameň na mieru</p>', 'align' => 'center', 'color' => '#cdbfae', 'fontSize' => 13],
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
                ['type' => 'text', 'html' => '<p>Tento e-mail dostávate, pretože ste zákazníkom spoločnosti {company} alebo ste si od nás vyžiadali novinky.</p><p><a href="{{view_online_url}}">Zobraziť v prehliadači</a> | <a href="{{unsubscribe_url}}">Odhlásiť odber</a></p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
                ['type' => 'text', 'html' => '<p>Naša adresa: {company}, %address%</p><p>&copy; {{current_year}} {brand}</p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
            ]]],
        ],
    ],

    'campaigns' => [
        // Sent 20 days ago to the architects and studios (trade partners, commercial clients, hotels).
        1 => [
            'name' => 'Jarný výpredaj zvyškových dosiek',
            'subject' => 'Zvyškové dosky až o 40 % lacnejšie, iba tento mesiac',
            'preheader' => 'Zvyšky kremenca, žuly a spekaného kameňa pre váš ďalší projekt.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Jarný výpredaj zvyškových dosiek', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Dobrý deň, {{first_name|vážený zákazník}},</p><p>Začalo sa naše jarné upratovanie: zvyškové dosky z kremenca, žuly a spekaného kameňa, narezané na rozmery vhodné pre umývadlové dosky, barové pulty a parapety, sú teraz až o 40 % lacnejšie.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Kremenec a žula', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Zvyšky kremenca Calacatta a žuly Absolute Black, hrúbka 20 až 30 mm, s lešteným povrchom.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Spekaný kameň', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Veľkoformátové odrezky v hrúbke 12 mm a 6 mm, ideálne na obklady stien a police.</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'Zobraziť zoznam zvyškov', 'href' => 'https://lapidea.example/remnants', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Ponuka platí do {d:-6}. Odpíšte na tento e-mail a náš showroom vám dosku zarezervuje pre váš ďalší projekt.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // Sent 60 days ago to all clients.
        2 => [
            'name' => 'Starostlivosť o novú pracovnú dosku',
            'subject' => 'Tri zvyky, vďaka ktorým bude vaša nová doska ako nová',
            'preheader' => 'Krátky návod na každodennú starostlivosť z našej dielne.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Starostlivosť o novú pracovnú dosku', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Dobrý deň, {{first_name|vážený zákazník}},</p><p>Kamenná doska vydrží roky a pár jednoduchých zvykov ju udrží v takom stave, v akom ste ju dostali v deň montáže.</p>', 'align' => 'left'],
                    ['type' => 'heading', 'level' => 3, 'html' => 'Naše tri zvyky', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<ol><li>Rozliate tekutiny utierajte mäkkou handrou a jemným čistiacim prostriedkom, nikdy brúsnou špongiou.</li><li>Pod horúce hrnce používajte podložku a pod nože dosku na krájanie.</li><li>Prírodný kameň raz za rok znova ošetrite impregnáciou.</li></ol>', 'align' => 'left'],
                    ['type' => 'button', 'label' => 'Objednať sadu na ošetrenie', 'href' => 'https://lapidea.example/care-kit', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Produkt {item:I7} obsahuje všetko, čo na prvý rok potrebujete. Máte otázky k vášmu kameňu? Stačí odpísať na tento e-mail.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // The draft: clients and leads, a finished body.
        3 => [
            'name' => 'Nová kolekcia spekaného kameňa',
            'subject' => 'Spoznajte našu novú kolekciu spekaného kameňa',
            'preheader' => 'Sedem nových dekorov, od {m:140} za m².',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Nová kolekcia spekaného kameňa', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Dobrý deň, {{first_name|vážený zákazník}},</p><p>V našom showroome pribudlo sedem nových dekorov. Spekaný kameň odoláva teplu, poškriabaniu aj škvrnám a hodí sa do interiéru i exteriéru.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Tmavý a dramatický', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I2}, mramorový vzhľad v čiernom pre kuchyne a kúpeľne.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Svetlý a tenký', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I3}, od {m:140} za m².</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'Rezervovať návštevu showroomu', 'href' => 'https://lapidea.example/showroom', 'align' => 'center'],
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
        'bounced' => 'Trvalé nedoručenie: 550 mailbox unavailable',
        'unsubscribed' => 'Odhlásil(a) odber odkazom v e-maile',
        'manual' => 'Telefonicky požiadal(a) o zastavenie e-mailov',
    ],
];
