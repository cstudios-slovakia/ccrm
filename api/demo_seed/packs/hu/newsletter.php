<?php
/**
 * Newsletter pack, Hungarian edition: the global header and footer, and three campaigns of
 * Lapidea (docs/NEWSLETTER.md C15, docs/DEMO-MODE.md "Newsletter").
 *
 * Data only (contract: demo_seed/index.php; how it becomes rows and an EmailDoc: header of
 * demo_seed/newsletter.php). Same keys, list lengths and numbers as packs/en/newsletter.php and
 * packs/sk/newsletter.php; only strings differ. Merge tags are plain `{{first_name|...}}`; only tags with an
 * underscore are used, because `{{company}}` would be read as the demo placeholder {company}.
 * `%address%` is replaced by the demo company's postal address. Colours and URLs are not translated.
 */
return [
    // Rows: layout '1' (one column) or '1-1' (two). Blocks: heading | text | button | divider | social.
    'header' => [
        'rows' => [
            ['layout' => '1', 'background' => '#2b2724', 'columns' => [[
                ['type' => 'heading', 'level' => 2, 'html' => '{brand}', 'align' => 'center', 'color' => '#f3ece3'],
                ['type' => 'text', 'html' => '<p>Kvarc, kő és zsugorított kő egyedi méretre</p>', 'align' => 'center', 'color' => '#cdbfae', 'fontSize' => 13],
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
                ['type' => 'text', 'html' => '<p>Azért kapja ezt az e-mailt, mert a(z) {company} ügyfele, vagy hírekre iratkozott fel nálunk.</p><p><a href="{{view_online_url}}">Megnyitás böngészőben</a> | <a href="{{unsubscribe_url}}">Leiratkozás</a></p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
                ['type' => 'text', 'html' => '<p>Címünk: {company}, %address%</p><p>&copy; {{current_year}} {brand}</p>', 'align' => 'center', 'color' => '#6b6259', 'fontSize' => 12],
            ]]],
        ],
    ],

    'campaigns' => [
        // Sent 20 days ago to the architects and studios (trade partners, commercial clients, hotels).
        1 => [
            'name' => 'Tavaszi maradéklap-akció',
            'subject' => 'Maradéklapok akár 40 % kedvezménnyel, csak ebben a hónapban',
            'preheader' => 'Kvarc, gránit és zsugorított kő maradékok a következő projektjéhez.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Tavaszi maradéklap-akció', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Kedves {{first_name|Ügyfelünk}}!</p><p>Elindult a tavaszi nagytakarításunk: a kvarc, gránit és zsugorított kő maradéklapok, amelyeket mosdópultokhoz, bárpultokhoz és ablakpárkányokhoz alkalmas méretre vágtunk, most akár 40 % kedvezménnyel kaphatók.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Kvarc és gránit', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Calacatta kvarc és Absolute Black gránit maradékok, 20-30 mm vastagságban, polírozott felülettel.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Zsugorított kő', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>Nagy méretű darabok 12 mm és 6 mm vastagságban, falburkolathoz és polcokhoz ideálisak.</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'A maradéklista megtekintése', 'href' => 'https://lapidea.example/remnants', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Az ajánlat eddig érvényes: {d:-6}. Válaszoljon erre az e-mailre, és bemutatótermi kollégáink lefoglalják Önnek a lapot a következő projekthez.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // Sent 60 days ago to all clients.
        2 => [
            'name' => 'Az új munkalap ápolása',
            'subject' => 'Három szokás, amitől az új munkalapja olyan marad, mint az első napon',
            'preheader' => 'Rövid útmutató a mindennapi ápoláshoz, a műhelyünkből.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Az új munkalap ápolása', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Kedves {{first_name|Ügyfelünk}}!</p><p>A kő munkalap hosszú évekre készül, és néhány egyszerű szokással olyan marad, mint a beépítés napján.</p>', 'align' => 'left'],
                    ['type' => 'heading', 'level' => 3, 'html' => 'A három szokásunk', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<ol><li>A kiömlött folyadékot puha ruhával és enyhe tisztítószerrel törölje fel, soha ne súrolószivaccsal.</li><li>Forró edény alá használjon alátétet, kés alá vágódeszkát.</li><li>A természetes követ évente egyszer kezelje újra impregnálóval.</li></ol>', 'align' => 'left'],
                    ['type' => 'button', 'label' => 'Ápolókészlet megrendelése', 'href' => 'https://lapidea.example/care-kit', 'align' => 'center'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>A(z) {item:I7} mindent tartalmaz, amire az első évben szüksége lehet. Kérdése van a kövével kapcsolatban? Elég válaszolnia erre az e-mailre.</p>', 'align' => 'left'],
                ]]],
            ],
        ],

        // The draft: clients and leads, a finished body.
        3 => [
            'name' => 'Új zsugorított kő kollekció',
            'subject' => 'Ismerje meg az új zsugorított kő kollekciónkat',
            'preheader' => 'Hét új dekor, {m:140} per m²-től.',
            'rows' => [
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'heading', 'level' => 1, 'html' => 'Az új zsugorított kő kollekció', 'align' => 'left'],
                    ['type' => 'text', 'html' => '<p>Kedves {{first_name|Ügyfelünk}}!</p><p>Hét új dekor érkezett a bemutatótermünkbe. A zsugorított kő ellenáll a hőnek, a karcolásnak és a foltoknak, belső és külső térben is használható.</p>', 'align' => 'left'],
                ]]],
                ['layout' => '1-1', 'background' => '', 'columns' => [
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Sötét és látványos', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I2}, fekete márványhatás konyhákba és fürdőszobákba.</p>', 'align' => 'left'],
                    ],
                    [
                        ['type' => 'heading', 'level' => 3, 'html' => 'Világos és vékony', 'align' => 'left'],
                        ['type' => 'text', 'html' => '<p>{item:I3}, {m:140} per m²-től.</p>', 'align' => 'left'],
                    ],
                ]],
                ['layout' => '1', 'background' => '', 'columns' => [[
                    ['type' => 'button', 'label' => 'Időpont a bemutatóteremben', 'href' => 'https://lapidea.example/showroom', 'align' => 'center'],
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
        'bounced' => 'Végleges kézbesítési hiba: 550 mailbox unavailable',
        'unsubscribed' => 'Leiratkozott az e-mailben lévő hivatkozással',
        'manual' => 'Telefonon kérte, hogy ne kapjon e-mailt',
    ],
];
