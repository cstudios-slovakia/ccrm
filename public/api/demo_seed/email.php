<?php
/**
 * Demo seed module: email.
 *
 * Fills the demo mailbox (api/demo_mailbox.php) with ~3 weeks of fictive mail
 * for the stone/countertop demo company, in the install language, and points
 * each demo user's mail profile at it. It is one shared team mailbox: three
 * private copies would file every message on a lead timeline three times. Reading the messages then files them on
 * lead timelines and in the RAG cache exactly like an IMAP import, so the AI
 * digests, the assistant and the timelines all have realistic input: mixed
 * urgency, RE: threads, unread mail, attachments.
 *
 * Idempotent: removes its own messages and their timeline/RAG rows first.
 * A user who already has a real mailbox configured is left alone.
 */
require_once __DIR__ . '/helpers.php';
require_once dirname(__DIR__) . '/mail_broker.php'; // ccrm_mail_event_id(); returns early when included
require_once dirname(__DIR__) . '/demo_mailbox.php';

function demo_seed_email(PDO $pdo): void {
    $lang = demo_lang($pdo);
    ccrm_demo_mailbox_ensure_table($pdo);

    $mailbox = CCRM_DEMO_TEAM_MAILBOX;

    // --- 1. Clean up a previous run --------------------------------------
    $old = $pdo->query("SELECT `mailbox`, `folder`, `uid` FROM `demo_mail_messages` WHERE `id` LIKE 'demo-%'")->fetchAll(PDO::FETCH_ASSOC);
    $delTl = $pdo->prepare("DELETE FROM `timeline_events` WHERE `id` = ?");
    $delRag = $pdo->prepare("DELETE FROM `rag_emails` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
    $delSum = $pdo->prepare("DELETE FROM `email_summaries` WHERE `user_email` = ? AND `folder` = ? AND `email_uid` = ?");
    foreach ($old as $o) {
        $delTl->execute([ccrm_mail_event_id($o['mailbox'], $o['folder'], $o['uid'])]);
        $delRag->execute([$o['mailbox'], $o['folder'], (string)$o['uid']]);
        $delSum->execute([$o['mailbox'], $o['folder'], (string)$o['uid']]);
    }
    $pdo->exec("DELETE FROM `demo_mail_messages` WHERE `id` LIKE 'demo-%'");

    // --- 2. Point the demo users at the demo mailbox ----------------------
    $getMeta = $pdo->prepare("SELECT `metadata_json` FROM `users` WHERE LOWER(`email`) = ?");
    $setMeta = $pdo->prepare("UPDATE `users` SET `metadata_json` = ? WHERE LOWER(`email`) = ?");
    foreach (demo_user_names() as $name) {
        $address = strtolower($name) . '@crm.com';
        $getMeta->execute([$address]);
        $raw = $getMeta->fetchColumn();
        if ($raw === false) continue; // user not provisioned
        $meta = json_decode((string)$raw, true);
        if (!is_array($meta)) $meta = [];
        $existing = $meta['emailSettings'] ?? null;
        $isReal = is_array($existing)
            && trim((string)($existing['imapHost'] ?? '')) !== ''
            && strcasecmp(trim((string)$existing['imapHost']), CCRM_DEMO_MAIL_HOST) !== 0;
        if ($isReal) continue; // never replace a real configured mailbox
        $meta['emailSettings'] = ccrm_demo_mailbox_settings();
        $setMeta->execute([json_encode($meta, JSON_UNESCAPED_UNICODE), $address]);
    }

    // --- 3. People ---------------------------------------------------------
    $client = [
        'name' => demo_t(['sk' => 'Stavby Horák s.r.o.', 'en' => 'Horak Construction Ltd.', 'hu' => 'Horák Építő Kft.'], $lang),
        'contact' => 'Peter Horák',
        'email' => 'horak@stavbyhorak.example.sk',
    ];
    // Prefer a client created by the clients module, so the complaint and the
    // payment thread land on a real demo record.
    try {
        $c = $pdo->query("SELECT `name`, `email`, `contact_person` FROM `leads` WHERE `id` LIKE 'demo-client%' AND `email` LIKE '%@%' ORDER BY `id` LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($c) {
            $client = [
                'name' => $c['name'],
                'contact' => trim((string)$c['contact_person']) !== '' ? $c['contact_person'] : $c['name'],
                'email' => $c['email'],
            ];
        }
    } catch (\Throwable $e) {}

    $p = [
        'alex' => ['Alex', 'alex@crm.com'],
        'sam' => ['Sam', 'sam@crm.com'],
        'jordan' => ['Jordan', 'jordan@crm.com'],
        'novak' => ['Ján Novák', 'novak@example.com'],
        'kovacova' => ['Martina Kováčová', 'm.kovacova@example.com'],
        'mueller' => ['Thomas Müller', 't.mueller@example.de'],
        'client' => [$client['contact'], $client['email']],
        'fiorano' => ['Fiorano Stone Srl', 'orders@fioranostone.example.it'],
        'chem' => ['Akemi Slovakia', 'obchod@akemi.example.sk'],
        'crane' => [demo_t(['sk' => 'Žeriavy Kráľ s.r.o.', 'en' => 'Kral Cranes Ltd.', 'hu' => 'Kráľ Daruk Kft.'], $lang), 'fakturacia@zeriavykral.example.sk'],
        'proliner' => ['Prodim Service', 'service@prodim.example.nl'],
        'news' => ['Stone Industry Weekly', 'newsletter@stoneweekly.example.com'],
        'academy' => ['Stone Academy', 'events@stoneacademy.example.com'],
        'petra' => ['Petra Szabó', 'petra.szabo@example.hu'],
    ];

    // --- 4. Placeholders ---------------------------------------------------
    $fmtDate = function (int $offset) use ($lang): string {
        $d = new \DateTimeImmutable(demo_d($offset));
        if ($lang === 'hu') return $d->format('Y. m. d.');
        if ($lang === 'en') return $d->format('j M Y');
        return $d->format('j. n. Y');
    };
    $year = (new \DateTimeImmutable('today'))->format('Y');
    $fill = function (string $s) use ($fmtDate, $year, $client): string {
        $s = preg_replace_callback('/\{d:([+-]?\d+)\}/', function ($m) use ($fmtDate) { return $fmtDate((int)$m[1]); }, $s);
        return strtr($s, ['{Y}' => $year, '{client}' => $client['name'], '{contact}' => $client['contact']]);
    };

    // --- 5. Messages ---------------------------------------------------------
    $messages = demo_email_messages();
    $byN = [];
    foreach ($messages as $m) $byN[$m['n']] = $m;

    $uids = ['INBOX' => 0, 'Sent' => 0];
    foreach ($messages as $m) {
        $folder = $m['folder'];
        $uid = ++$uids[$folder];
        [$fromName, $fromAddr] = $p[$m['from']];
        [$toName, $toAddr] = $p[$m['to']];
        $subject = $fill(demo_t($m['subject'], $lang));
        $body = $fill(demo_t($m['body'], $lang));

        // Replies quote the message they answer, like a real mail client.
        $inReplyTo = null;
        $refs = null;
        if (!empty($m['re']) && isset($byN[$m['re']])) {
            $parent = $byN[$m['re']];
            $inReplyTo = demo_email_msgid($parent['n']);
            $chain = [];
            for ($q = $parent; $q; $q = (!empty($q['re']) && isset($byN[$q['re']])) ? $byN[$q['re']] : null) {
                array_unshift($chain, demo_email_msgid($q['n']));
            }
            $refs = implode(' ', $chain);
            [$pName] = $p[$parent['from']];
            $quoteHead = demo_t([
                'sk' => 'Dňa ' . $fmtDate($parent['day']) . ' napísal(a) ' . $pName . ':',
                'en' => 'On ' . $fmtDate($parent['day']) . ', ' . $pName . ' wrote:',
                'hu' => $pName . ' ' . $fmtDate($parent['day']) . ' napon írta:',
            ], $lang);
            $quoted = implode("\n", array_map(function ($l) { return '> ' . $l; }, explode("\n", $fill(demo_t($parent['body'], $lang)))));
            $body .= "\n\n" . $quoteHead . "\n" . $quoted;
        }

        $attachments = [];
        foreach ($m['att'] ?? [] as $att) {
            $att['name'] = $fill($att['name']);
            if (isset($att['title'])) $att['title'] = $fill(demo_t((array)$att['title'], $lang));
            if (isset($att['lines'])) $att['lines'] = array_map(function ($l) use ($fill, $lang) { return $fill(is_array($l) ? demo_t($l, $lang) : (string)$l); }, $att['lines']);
            if (isset($att['ics'])) {
                $att['ics'] = [demo_dt($att['ics'][0], $att['ics'][1]), $att['ics'][2], $fill(demo_t($att['ics'][3], $lang)), $att['ics'][4] ?? ''];
            }
            $att['size'] = ccrm_demo_attachment_size($att);
            $attachments[] = $att;
        }

        ccrm_demo_mailbox_insert($pdo, [
            'id' => demo_id('mail', $m['n']),
            'mailbox' => $mailbox,
            'folder' => $folder,
            'uid' => $uid,
            'message_id' => demo_email_msgid($m['n']),
            'in_reply_to' => $inReplyTo,
            'references' => $refs,
            'from_name' => $fromName,
            'from_address' => $fromAddr,
            'to_name' => $toName,
            'to_address' => $toAddr,
            'subject' => $subject,
            'body_text' => $body,
            'sent_at' => demo_dt($m['day'], $m['time']),
            'seen' => $folder === 'Sent' ? true : $m['seen'],
            'attachments' => $attachments,
        ]);
    }
}

function demo_email_msgid(int $n): string {
    return '<demo-' . $n . '@mail.demo.invalid>';
}

/**
 * The demo correspondence. `day` is relative to the install date, `re` names
 * the message a reply answers. Placeholders: {Y} year, {d:+N} a date, {client},
 * {contact}.
 */
function demo_email_messages(): array {
    return [
        [
            'n' => 1, 'folder' => 'INBOX', 'day' => -20, 'time' => '09:14', 'from' => 'mueller', 'to' => 'alex', 'seen' => true,
            'subject' => [
                'sk' => 'Veľkoobchodné partnerstvo – objemy dosiek na Q4',
                'en' => 'Wholesale partnership – slab volumes for Q4',
                'hu' => 'Nagykereskedelmi partnerség – Q4 lapmennyiségek',
            ],
            'body' => [
                'sk' => "Dobrý deň Alex,\n\nako sme sa dohodli v Košiciach, posielam predbežný odhad objemov na štvrtý štvrťrok. Ide o 180 až 220 dosiek mesačne, prevažne kremeň 20 mm (Calacatta, Statuario) a asi 30 % porcelán 12 mm.\n\nPre nás sú kľúčové tri veci: pevná cena na celý štvrťrok, dodanie do 10 pracovných dní od objednávky a jeden kontakt pre reklamácie.\n\nAk to vychádza, rád by som do konca mesiaca podpísal rámcovú zmluvu (SLA).\n\nS pozdravom\nThomas Müller\nMüller Naturstein GmbH",
                'en' => "Hello Alex,\n\nas agreed in Košice, here is our preliminary volume forecast for Q4. We expect 180 to 220 slabs a month, mostly 20 mm quartz (Calacatta, Statuario) and about 30 % porcelain in 12 mm.\n\nThree things are key for us: a fixed price for the whole quarter, delivery within 10 working days of an order, and one contact for complaints.\n\nIf that works for you, I would like to sign a framework agreement (SLA) by the end of the month.\n\nBest regards\nThomas Müller\nMüller Naturstein GmbH",
                'hu' => "Kedves Alex,\n\nahogy Kassán megbeszéltük, küldöm a negyedik negyedévre vonatkozó előzetes mennyiségi becslésünket. Havonta 180–220 lappal számolunk, főként 20 mm-es kvarccal (Calacatta, Statuario) és kb. 30 % 12 mm-es porcelánnal.\n\nSzámunkra három dolog kulcsfontosságú: fix ár az egész negyedévre, szállítás a rendeléstől számított 10 munkanapon belül, és egyetlen kapcsolattartó a reklamációkhoz.\n\nHa ez megfelel, a hónap végéig szeretném aláírni a keretszerződést (SLA).\n\nÜdvözlettel\nThomas Müller\nMüller Naturstein GmbH",
            ],
            'att' => [[
                'name' => 'mueller_q4_volumes.csv',
                'rows' => [['Month', 'Quartz 20 mm', 'Porcelain 12 mm', 'Total'], ['October', 140, 60, 200], ['November', 150, 70, 220], ['December', 125, 55, 180]],
            ]],
        ],
        [
            'n' => 2, 'folder' => 'Sent', 'day' => -19, 'time' => '16:05', 'from' => 'alex', 'to' => 'mueller', 're' => 1,
            'subject' => [
                'sk' => 'RE: Veľkoobchodné partnerstvo – objemy dosiek na Q4',
                'en' => 'RE: Wholesale partnership – slab volumes for Q4',
                'hu' => 'RE: Nagykereskedelmi partnerség – Q4 lapmennyiségek',
            ],
            'body' => [
                'sk' => "Dobrý deň Thomas,\n\nďakujem za odhad. Pevnú cenu na štvrťrok vieme garantovať pri odbere aspoň 160 dosiek mesačne. Dodanie do 10 pracovných dní platí pre skladové dekory; pri Statuario závisíme od Fiorana, tam počítajte s 15 dňami.\n\nKontaktom pre reklamácie bude Sam. Návrh SLA pripravím do konca budúceho týždňa.\n\nS pozdravom\nAlex",
                'en' => "Hello Thomas,\n\nthank you for the forecast. We can guarantee a fixed quarterly price at 160 slabs a month or more. Delivery within 10 working days applies to stocked designs; for Statuario we depend on Fiorano, so please count on 15 days there.\n\nSam will be your contact for complaints. I will send the draft SLA by the end of next week.\n\nBest regards\nAlex",
                'hu' => "Kedves Thomas,\n\nköszönöm a becslést. Havi legalább 160 lap esetén tudunk fix negyedéves árat garantálni. A 10 munkanapos szállítás a raktári dekorokra vonatkozik; a Statuario esetében Fioranótól függünk, ott 15 nappal számoljon.\n\nA reklamációk kapcsolattartója Sam lesz. Az SLA-tervezetet a jövő hét végéig elküldöm.\n\nÜdvözlettel\nAlex",
            ],
        ],
        [
            'n' => 3, 'folder' => 'INBOX', 'day' => -18, 'time' => '11:30', 'from' => 'fiorano', 'to' => 'sam', 'seen' => true,
            'subject' => [
                'sk' => 'Potvrdenie objednávky PO-{Y}-2291 – Calacatta Quartz 12 mm',
                'en' => 'Order confirmation PO-{Y}-2291 – Calacatta Quartz 12 mm',
                'hu' => 'Rendelés-visszaigazolás PO-{Y}-2291 – Calacatta Quartz 12 mm',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\npotvrdzujeme objednávku PO-{Y}-2291: 24 dosiek Calacatta Quartz 12 mm, formát 3200 x 1600 mm, leštený povrch.\n\nPredpokladaný termín expedície z Fiorano Modenese je {d:-4}, dodanie kamiónom do Bratislavy do 3 dní od expedície.\n\nV prílohe je potvrdenie objednávky s cenami.\n\nS pozdravom\nOrder desk, Fiorano Stone Srl",
                'en' => "Good morning,\n\nwe confirm order PO-{Y}-2291: 24 slabs of Calacatta Quartz 12 mm, 3200 x 1600 mm, polished finish.\n\nThe expected dispatch date from Fiorano Modenese is {d:-4}, with truck delivery to Bratislava within 3 days of dispatch.\n\nThe order confirmation with prices is attached.\n\nKind regards\nOrder desk, Fiorano Stone Srl",
                'hu' => "Jó napot,\n\nvisszaigazoljuk a PO-{Y}-2291 rendelést: 24 lap Calacatta Quartz 12 mm, 3200 x 1600 mm, polírozott felület.\n\nA várható feladás Fiorano Modenese-ből {d:-4}, a kamionos szállítás Pozsonyba a feladástól számított 3 napon belül.\n\nAz árakat tartalmazó visszaigazolást csatoljuk.\n\nÜdvözlettel\nOrder desk, Fiorano Stone Srl",
            ],
            'att' => [[
                'name' => 'PO-{Y}-2291_confirmation.pdf',
                'title' => 'Order confirmation PO-{Y}-2291',
                'lines' => ['Fiorano Stone Srl - Via Statale 12, Fiorano Modenese (MO)', '', '24 x Calacatta Quartz 12 mm, 3200 x 1600 mm, polished', 'Unit price: 412.00 EUR   Total: 9,888.00 EUR', 'Incoterms: DAP Bratislava', 'Expected dispatch: {d:-4}', 'Payment: 30 days net'],
            ]],
        ],
        [
            'n' => 4, 'folder' => 'INBOX', 'day' => -17, 'time' => '07:00', 'from' => 'news', 'to' => 'alex', 'seen' => true,
            'subject' => [
                'sk' => 'Stone Industry Weekly #41: ceny porcelánových dosiek rastú o 6 %',
                'en' => 'Stone Industry Weekly #41: porcelain slab prices up 6 %',
                'hu' => 'Stone Industry Weekly #41: 6 %-kal drágulnak a porcelánlapok',
            ],
            'body' => [
                'sk' => "Stone Industry Weekly – vydanie 41\n\n• Talianski výrobcovia porcelánu ohlásili od budúceho mesiaca zdraženie o 6 % kvôli cenám plynu.\n• Kremenné kompozity s nízkym obsahom kryštalického kremíka: prehľad nových produktových radov.\n• Rozhovor: ako dielne skracujú čas od zamerania po montáž pod 10 dní.\n\nOdhlásiť odber môžete v nastaveniach svojho účtu.",
                'en' => "Stone Industry Weekly – issue 41\n\n• Italian porcelain manufacturers announce a 6 % price increase from next month, citing gas prices.\n• Low-silica quartz composites: an overview of the new product lines.\n• Interview: how workshops cut the time from templating to installation to under 10 days.\n\nYou can unsubscribe in your account settings.",
                'hu' => "Stone Industry Weekly – 41. szám\n\n• Az olasz porcelángyártók a gázárakra hivatkozva jövő hónaptól 6 %-os áremelést jelentettek be.\n• Alacsony kristályos szilícium-tartalmú kvarckompozitok: az új termékcsaládok áttekintése.\n• Interjú: hogyan szorítják a műhelyek 10 nap alá a felméréstől a szerelésig tartó időt.\n\nA leiratkozás a fiókbeállításokban lehetséges.",
            ],
        ],
        [
            'n' => 5, 'folder' => 'INBOX', 'day' => -16, 'time' => '10:22', 'from' => 'novak', 'to' => 'sam', 'seen' => true,
            'subject' => [
                'sk' => 'Obklad showroomu – vzorky panelov',
                'en' => 'Showroom cladding – sample panels',
                'hu' => 'Bemutatóterem burkolat – mintapanelek',
            ],
            'body' => [
                'sk' => "Dobrý deň pán Sam,\n\nďakujem za stretnutie v showroome. Pred rozhodnutím by sme potrebovali fyzické vzorky troch bridlicových dekorov, ktoré sme videli (Grigio, Antracite, Ardesia), ideálne vo formáte aspoň 30 x 60 cm.\n\nZároveň prosím o informáciu, či viete obklad 140 m² zrealizovať ešte tento štvrťrok.\n\nĎakujem\nIng. Ján Novák",
                'en' => "Hello Sam,\n\nthank you for the showroom meeting. Before we decide, we need physical samples of the three slate designs we saw (Grigio, Antracite, Ardesia), ideally at least 30 x 60 cm.\n\nCould you also let me know whether you can install 140 m² of cladding this quarter?\n\nThank you\nJán Novák",
                'hu' => "Kedves Sam,\n\nköszönöm a bemutatótermi találkozót. A döntés előtt szükségünk lenne a látott három paladekor (Grigio, Antracite, Ardesia) fizikai mintáira, lehetőleg legalább 30 x 60 cm-es méretben.\n\nKérem, jelezze azt is, hogy a 140 m²-es burkolatot meg tudják-e valósítani még ebben a negyedévben.\n\nKöszönöm\nNovák Ján",
            ],
        ],
        [
            'n' => 6, 'folder' => 'Sent', 'day' => -15, 'time' => '14:48', 'from' => 'sam', 'to' => 'novak', 're' => 5,
            'subject' => [
                'sk' => 'RE: Obklad showroomu – vzorky panelov',
                'en' => 'RE: Showroom cladding – sample panels',
                'hu' => 'RE: Bemutatóterem burkolat – mintapanelek',
            ],
            'body' => [
                'sk' => "Dobrý deň pán Novák,\n\nvzorky všetkých troch dekorov vo formáte 30 x 60 cm vám kuriér doručí v stredu. V prílohe posielam orientačný cenník obkladu vrátane montáže.\n\n140 m² v tomto štvrťroku stihneme, ak potvrdíte dekor do dvoch týždňov – materiál potom objednáme hneď.\n\nS pozdravom\nSam",
                'en' => "Hello Mr Novák,\n\na courier will deliver 30 x 60 cm samples of all three designs on Wednesday. Attached is an indicative price list for the cladding including installation.\n\nWe can do 140 m² this quarter if you confirm the design within two weeks – we would order the material straight away.\n\nBest regards\nSam",
                'hu' => "Kedves Novák úr,\n\nmindhárom dekor 30 x 60 cm-es mintáját szerdán kézbesíti a futár. Csatolom a burkolat tájékoztató árlistáját szereléssel együtt.\n\nA 140 m²-t ebben a negyedévben vállalni tudjuk, ha két héten belül megerősíti a dekort – az anyagot azonnal megrendeljük.\n\nÜdvözlettel\nSam",
            ],
            'att' => [[
                'name' => 'cladding_price_list_{Y}.pdf',
                'title' => ['sk' => 'Cenník – kamenný obklad {Y}', 'en' => 'Price list – stone cladding {Y}', 'hu' => 'Árlista – kőburkolat {Y}'],
                'lines' => ['Grigio slate 12 mm ........ 64 EUR/m2', 'Antracite slate 12 mm ..... 68 EUR/m2', 'Ardesia slate 12 mm ....... 71 EUR/m2', 'Installation incl. adhesive  38 EUR/m2', '', 'Prices excl. VAT. Valid 30 days.'],
            ]],
        ],
        [
            'n' => 7, 'folder' => 'INBOX', 'day' => -14, 'time' => '08:40', 'from' => 'crane', 'to' => 'alex', 'seen' => true,
            'subject' => [
                'sk' => 'Upomienka: faktúra {Y}/0412 – prenájom žeriavu 14 m',
                'en' => 'Reminder: invoice {Y}/0412 – 14 m crane hire',
                'hu' => 'Emlékeztető: {Y}/0412 számla – 14 m-es daru bérlése',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nevidujeme neuhradenú faktúru {Y}/0412 na sumu 1 380,00 EUR za prenájom žeriavu 14 m (vykládka dosiek, Mlynské Nivy). Splatnosť bola {d:-21}.\n\nProsíme o úhradu do 7 dní. Kópiu faktúry prikladáme.\n\nS pozdravom\nFakturácia, Žeriavy Kráľ s.r.o.",
                'en' => "Hello,\n\nour records show invoice {Y}/0412 for EUR 1,380.00 (14 m crane hire, slab unloading at Mlynské Nivy) as unpaid. It was due on {d:-21}.\n\nPlease settle it within 7 days. A copy of the invoice is attached.\n\nKind regards\nAccounts, Kral Cranes Ltd.",
                'hu' => "Jó napot,\n\nnyilvántartásunk szerint a {Y}/0412 számú, 1 380,00 EUR összegű számla (14 m-es daru bérlése, lapok lerakodása, Mlynské Nivy) kifizetetlen. Esedékessége {d:-21} volt.\n\nKérjük, 7 napon belül egyenlítsék ki. A számla másolatát csatoljuk.\n\nÜdvözlettel\nSzámlázás, Kráľ Daruk Kft.",
            ],
            'att' => [[
                'name' => 'invoice_{Y}_0412.pdf',
                'title' => 'Invoice {Y}/0412',
                'lines' => ['Crane hire 14 m, 6 h, incl. operator ...... 1,150.00 EUR', 'VAT 20 % ................................... 230.00 EUR', 'Total due ................................ 1,380.00 EUR', 'Due date: {d:-21}'],
            ]],
        ],
        [
            'n' => 8, 'folder' => 'Sent', 'day' => -13, 'time' => '13:15', 'from' => 'alex', 'to' => 'client',
            'subject' => [
                'sk' => 'Pripomienka platby – faktúra FV{Y}-0187 je 14 dní po splatnosti',
                'en' => 'Payment reminder – invoice FV{Y}-0187 is 14 days overdue',
                'hu' => 'Fizetési emlékeztető – az FV{Y}-0187 számla 14 napja lejárt',
            ],
            'body' => [
                'sk' => "Dobrý deň {contact},\n\nradi by sme pripomenuli faktúru FV{Y}-0187 na sumu 6 240,00 EUR za dodanie a montáž kuchynského ostrova, ktorá bola splatná pred 14 dňami.\n\nAk bola platba medzičasom odoslaná, považujte tento e-mail za bezpredmetný. Kópiu faktúry prikladám.\n\nS pozdravom\nAlex",
                'en' => "Dear {contact},\n\nthis is a friendly reminder about invoice FV{Y}-0187 for EUR 6,240.00 (supply and installation of the kitchen island), which fell due 14 days ago.\n\nIf the payment is already on its way, please disregard this e-mail. A copy of the invoice is attached.\n\nBest regards\nAlex",
                'hu' => "Kedves {contact},\n\nszeretnénk emlékeztetni az FV{Y}-0187 számú, 6 240,00 EUR összegű számlára (konyhasziget szállítása és szerelése), amely 14 napja lejárt.\n\nHa a fizetés közben elindult, tekintse e levelet tárgytalannak. A számla másolatát csatolom.\n\nÜdvözlettel\nAlex",
            ],
            'att' => [[
                'name' => 'FV{Y}-0187.pdf',
                'title' => 'Invoice FV{Y}-0187',
                'lines' => ['Customer: {client}', 'Kitchen island, Calacatta quartz 20 mm, 2.8 m2 .... 3,960.00 EUR', 'Mitred edge 40 mm, sink and hob cut-outs ......... 640.00 EUR', 'Templating and installation ....................... 600.00 EUR', 'VAT 20 % .......................................... 1,040.00 EUR', 'Total ............................................. 6,240.00 EUR'],
            ]],
        ],
        [
            'n' => 9, 'folder' => 'INBOX', 'day' => -11, 'time' => '09:05', 'from' => 'novak', 'to' => 'sam', 'seen' => true, 're' => 6,
            'subject' => [
                'sk' => 'RE: RE: Obklad showroomu – vzorky panelov',
                'en' => 'RE: RE: Showroom cladding – sample panels',
                'hu' => 'RE: RE: Bemutatóterem burkolat – mintapanelek',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nvzorky prišli, ďakujeme. Vyberáme Grigio. Potrebovali by sme ešte záväznú ponuku na 140 m² vrátane montáže a termín, kedy viete začať – showroom chceme otvoriť začiatkom budúceho mesiaca.\n\nJán Novák",
                'en' => "Hello,\n\nthe samples arrived, thank you. We are going with Grigio. We now need a binding quote for 140 m² including installation, and the date you can start – we want to open the showroom early next month.\n\nJán Novák",
                'hu' => "Jó napot,\n\na minták megérkeztek, köszönjük. A Grigio mellett döntöttünk. Kérnénk kötelező érvényű ajánlatot 140 m²-re szereléssel, és a kezdés időpontját – a bemutatótermet a jövő hónap elején szeretnénk megnyitni.\n\nNovák Ján",
            ],
        ],
        [
            'n' => 10, 'folder' => 'INBOX', 'day' => -10, 'time' => '15:30', 'from' => 'mueller', 'to' => 'alex', 'seen' => true, 're' => 2,
            'subject' => [
                'sk' => 'RE: RE: Veľkoobchodné partnerstvo – objemy dosiek na Q4',
                'en' => 'RE: RE: Wholesale partnership – slab volumes for Q4',
                'hu' => 'RE: RE: Nagykereskedelmi partnerség – Q4 lapmennyiségek',
            ],
            'body' => [
                'sk' => "Alex,\n\n160 dosiek mesačne je pre nás v poriadku. Pätnásť dní pri Statuario akceptujeme, ak to bude v SLA uvedené ako výnimka. Čakám na návrh zmluvy.\n\nThomas",
                'en' => "Alex,\n\n160 slabs a month works for us. We accept 15 days for Statuario as long as the SLA lists it as an exception. Looking forward to the draft.\n\nThomas",
                'hu' => "Alex,\n\na havi 160 lap nekünk megfelel. A Statuario 15 napját elfogadjuk, ha az SLA kivételként rögzíti. Várom a tervezetet.\n\nThomas",
            ],
        ],
        [
            'n' => 11, 'folder' => 'INBOX', 'day' => -10, 'time' => '12:00', 'from' => 'chem', 'to' => 'sam', 'seen' => true,
            'subject' => [
                'sk' => 'Úprava cien lepidiel a impregnácií od {d:+23}',
                'en' => 'Price adjustment for adhesives and sealers from {d:+23}',
                'hu' => 'Ragasztók és impregnálók árának módosítása {d:+23}-tól',
            ],
            'body' => [
                'sk' => "Vážený zákazník,\n\noznamujeme úpravu cien epoxidových lepidiel a impregnačných prostriedkov o 4,5 % s platnosťou od {d:+23}. Objednávky prijaté do tohto dátumu fakturujeme za pôvodné ceny.\n\nNový cenník je v prílohe.\n\nAkemi Slovakia",
                'en' => "Dear customer,\n\nprices of epoxy adhesives and sealers will rise by 4.5 % from {d:+23}. Orders received before that date are invoiced at the current prices.\n\nThe new price list is attached.\n\nAkemi Slovakia",
                'hu' => "Tisztelt Ügyfelünk!\n\nAz epoxi ragasztók és impregnálószerek ára {d:+23}-tól 4,5 %-kal emelkedik. Az addig beérkező rendeléseket a jelenlegi áron számlázzuk.\n\nAz új árlistát csatoljuk.\n\nAkemi Slovakia",
            ],
            'att' => [[
                'name' => 'akemi_price_list.pdf',
                'title' => 'Akemi - price list',
                'lines' => ['Akepox 5010 transparent, 1.5 kg ...... 38.40 EUR', 'Knife grade adhesive, 1 kg ........... 14.90 EUR', 'Stain stop sealer, 1 l ............... 29.70 EUR', 'Valid from {d:+23}'],
            ]],
        ],
        [
            'n' => 12, 'folder' => 'INBOX', 'day' => -9, 'time' => '10:12', 'from' => 'kovacova', 'to' => 'jordan', 'seen' => true,
            'subject' => [
                'sk' => 'Kuchynská doska – potvrdenie ponuky',
                'en' => 'Kitchen countertop – confirming the quote',
                'hu' => 'Konyhapult – az ajánlat visszaigazolása',
            ],
            'body' => [
                'sk' => "Dobrý deň Jordan,\n\npotvrdzujem upravenú ponuku na dosku z bieleho kremeňa vrátane zásteny a 4 cm zrezanej hrany. Prosím o zálohovú faktúru a termín laserového zamerania.\n\nĎakujem\nMartina Kováčová",
                'en' => "Hello Jordan,\n\nI confirm the revised quote for the white quartz worktop including the backsplash and the 4 cm mitred edge. Please send the deposit invoice and a date for the laser measurement.\n\nThank you\nMartina Kováčová",
                'hu' => "Kedves Jordan,\n\nvisszaigazolom a módosított ajánlatot a fehér kvarc munkalapra, hátfallal és 4 cm-es gérvágott éllel. Kérem az előlegszámlát és a lézeres felmérés időpontját.\n\nKöszönöm\nMartina Kováčová",
            ],
        ],
        [
            'n' => 13, 'folder' => 'Sent', 'day' => -8, 'time' => '09:30', 'from' => 'jordan', 'to' => 'kovacova', 're' => 12,
            'subject' => [
                'sk' => 'RE: Kuchynská doska – potvrdenie ponuky',
                'en' => 'RE: Kitchen countertop – confirming the quote',
                'hu' => 'RE: Konyhapult – az ajánlat visszaigazolása',
            ],
            'body' => [
                'sk' => "Dobrý deň pani Kováčová,\n\nďakujem za potvrdenie. Zálohová faktúra na 50 % je v prílohe. Laserové zameranie máme rezervované na {d:+5} o 9:00 – linka už vtedy musí stáť a byť vyrovnaná.\n\nS pozdravom\nJordan",
                'en' => "Hello Mrs Kováčová,\n\nthank you for confirming. The 50 % deposit invoice is attached. The laser measurement is booked for {d:+5} at 9:00 – the kitchen units must be installed and levelled by then.\n\nBest regards\nJordan",
                'hu' => "Kedves Kováčová asszony,\n\nköszönöm a visszaigazolást. Csatolom az 50 %-os előlegszámlát. A lézeres felmérést {d:+5} 9:00-ra foglaltuk – addigra a konyhabútornak a helyén és vízszintben kell lennie.\n\nÜdvözlettel\nJordan",
            ],
            'att' => [[
                'name' => 'ZF{Y}-0044_deposit.pdf',
                'title' => 'Deposit invoice ZF{Y}-0044',
                'lines' => ['Customer: Martina Kovacova, Trnava', 'White quartz worktop 2.4 x 0.6 m, backsplash 12 mm, mitred edge', 'Deposit 50 % ................................ 4,200.00 EUR'],
            ]],
        ],
        [
            'n' => 14, 'folder' => 'INBOX', 'day' => -7, 'time' => '18:20', 'from' => 'kovacova', 'to' => 'jordan', 'seen' => true, 're' => 13,
            'subject' => [
                'sk' => 'RE: RE: Kuchynská doska – potvrdenie ponuky',
                'en' => 'RE: RE: Kitchen countertop – confirming the quote',
                'hu' => 'RE: RE: Konyhapult – az ajánlat visszaigazolása',
            ],
            'body' => [
                'sk' => "Zálohu som dnes uhradila. Termín zamerania sedí, linka bude hotová deň vopred.\n\nM. Kováčová",
                'en' => "I paid the deposit today. The measurement date works, the units will be ready the day before.\n\nM. Kováčová",
                'hu' => "Az előleget ma átutaltam. A felmérés időpontja megfelel, a bútor előző nap kész lesz.\n\nM. Kováčová",
            ],
        ],
        [
            'n' => 15, 'folder' => 'INBOX', 'day' => -7, 'time' => '08:00', 'from' => 'proliner', 'to' => 'jordan', 'seen' => true,
            'subject' => [
                'sk' => 'Proliner: blíži sa ročná kalibrácia',
                'en' => 'Proliner: annual calibration due',
                'hu' => 'Proliner: esedékes az éves kalibrálás',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nváš digitalizér Proliner (s. č. PL-8-20417) potrebuje do 30 dní ročnú kalibráciu. Servis trvá 2 pracovné dni; na požiadanie vám zapožičiame náhradné zariadenie.\n\nProdim Service",
                'en' => "Hello,\n\nyour Proliner digitiser (s/n PL-8-20417) is due for its annual calibration within 30 days. The service takes 2 working days; a loan unit is available on request.\n\nProdim Service",
                'hu' => "Jó napot,\n\naz Ön Proliner digitalizálója (sorozatszám: PL-8-20417) 30 napon belül éves kalibrálásra szorul. A szerviz 2 munkanapig tart; kérésre csereeszközt biztosítunk.\n\nProdim Service",
            ],
        ],
        [
            'n' => 16, 'folder' => 'INBOX', 'day' => -6, 'time' => '14:02', 'from' => 'fiorano', 'to' => 'sam', 'seen' => true,
            'subject' => [
                'sk' => 'Oznámenie o meškaní: zásielka PO-{Y}-2291 posunutá o 10 dní',
                'en' => 'Delay notice: PO-{Y}-2291 shipment moved by 10 days',
                'hu' => 'Késési értesítés: a PO-{Y}-2291 szállítmány 10 nappal csúszik',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nz dôvodu odstávky lisovacej linky sa expedícia objednávky PO-{Y}-2291 posúva na {d:+6}. Dodanie do Bratislavy očakávame do {d:+9}.\n\nOspravedlňujeme sa za komplikácie. Ak potrebujete časť dosiek skôr, vieme 6 kusov vyexpedovať zo skladu v Miláne.\n\nOrder desk, Fiorano Stone Srl",
                'en' => "Good afternoon,\n\nbecause of a press line shutdown, dispatch of order PO-{Y}-2291 moves to {d:+6}. We expect delivery to Bratislava by {d:+9}.\n\nWe apologise for the inconvenience. If you need some slabs sooner, we can ship 6 pieces from our Milan warehouse.\n\nOrder desk, Fiorano Stone Srl",
                'hu' => "Jó napot,\n\na préssor leállása miatt a PO-{Y}-2291 rendelés feladása {d:+6}-ra tolódik. A pozsonyi szállítást {d:+9}-ig várjuk.\n\nElnézést kérünk a kellemetlenségért. Ha néhány lapra hamarabb van szükség, 6 darabot a milánói raktárunkból tudunk küldeni.\n\nOrder desk, Fiorano Stone Srl",
            ],
        ],
        [
            'n' => 17, 'folder' => 'Sent', 'day' => -6, 'time' => '15:10', 'from' => 'sam', 'to' => 'fiorano', 're' => 16,
            'subject' => [
                'sk' => 'RE: Oznámenie o meškaní: zásielka PO-{Y}-2291 posunutá o 10 dní',
                'en' => 'RE: Delay notice: PO-{Y}-2291 shipment moved by 10 days',
                'hu' => 'RE: Késési értesítés: a PO-{Y}-2291 szállítmány 10 nappal csúszik',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nprosím pošlite 6 dosiek z Milána čo najskôr – potrebujeme ich na zákazku v Trnave. Zvyšok počká na pôvodnú zásielku. Potvrďte prosím termín dodania.\n\nSam",
                'en' => "Hello,\n\nplease send the 6 slabs from Milan as soon as possible – we need them for a job in Trnava. The rest can wait for the main shipment. Please confirm the delivery date.\n\nSam",
                'hu' => "Jó napot,\n\nkérem, a 6 lapot Milánóból mielőbb küldjék – egy nagyszombati munkához kell. A többi várhat a fő szállítmányra. Kérem, erősítsék meg a szállítás időpontját.\n\nSam",
            ],
        ],
        [
            'n' => 18, 'folder' => 'INBOX', 'day' => -5, 'time' => '16:45', 'from' => 'client', 'to' => 'alex', 'seen' => false,
            'subject' => [
                'sk' => 'Reklamácia – vylomená hrana na kuchynskom ostrove',
                'en' => 'Complaint – chipped edge on the kitchen island',
                'hu' => 'Reklamáció – csorba él a konyhaszigeten',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\npri preberaní kuchyne sme zistili vylomenú hranu na rohu ostrova (cca 2 cm) a jemnú prasklinu pri výreze na varnú dosku. Fotky prikladám.\n\nKlient sa nasťahuje o dva týždne, takže to potrebujeme vyriešiť rýchlo. Kým nebude reklamácia uzavretá, zadržíme doplatok faktúry.\n\n{contact}\n{client}",
                'en' => "Hello,\n\nat handover we found a chipped edge on the island corner (about 2 cm) and a hairline crack next to the hob cut-out. Photos attached.\n\nThe owner moves in in two weeks, so we need this fixed quickly. We are holding the remaining payment until the complaint is closed.\n\n{contact}\n{client}",
                'hu' => "Jó napot,\n\naz átvételkor csorbát találtunk a sziget sarkán (kb. 2 cm), és egy hajszálrepedést a főzőlap kivágása mellett. Fotókat csatolok.\n\nA tulajdonos két hét múlva beköltözik, ezért gyors megoldásra van szükség. A reklamáció lezárásáig visszatartjuk a hátralévő összeget.\n\n{contact}\n{client}",
            ],
            'att' => [
                ['name' => 'island_corner_chip.png', 'seed' => 18],
                ['name' => 'hob_cutout_crack.png', 'seed' => 19],
            ],
        ],
        [
            'n' => 19, 'folder' => 'INBOX', 'day' => -4, 'time' => '07:00', 'from' => 'academy', 'to' => 'alex', 'seen' => true,
            'subject' => [
                'sk' => 'Webinár: digitálne šablóny a CNC bez chýb – {d:+9}',
                'en' => 'Webinar: error-free digital templating and CNC – {d:+9}',
                'hu' => 'Webinárium: hibátlan digitális sablonozás és CNC – {d:+9}',
            ],
            'body' => [
                'sk' => "Pozývame vás na bezplatný webinár o prepojení laserového zamerania s CNC. Ukážeme, ako znížiť odpad z dosiek o 12 % a ako predísť chybám pri výrezoch.\n\nTermín: {d:+9}, 15:00 – 16:00. Registrácia na našom webe.",
                'en' => "Join our free webinar on connecting laser templating with CNC. We will show how to cut slab waste by 12 % and avoid cut-out errors.\n\nDate: {d:+9}, 15:00 – 16:00. Register on our website.",
                'hu' => "Meghívjuk ingyenes webináriumunkra a lézeres felmérés és a CNC összekapcsolásáról. Megmutatjuk, hogyan csökkenthető 12 %-kal a lapveszteség, és hogyan kerülhetők el a kivágási hibák.\n\nIdőpont: {d:+9}, 15:00 – 16:00. Regisztráció a weboldalunkon.",
            ],
        ],
        [
            'n' => 20, 'folder' => 'INBOX', 'day' => -3, 'time' => '09:00', 'from' => 'crane', 'to' => 'alex', 'seen' => false,
            'subject' => [
                'sk' => '2. upomienka: faktúra {Y}/0412 po splatnosti – pozastavenie služieb od {d:+4}',
                'en' => '2nd reminder: invoice {Y}/0412 overdue – services suspended from {d:+4}',
                'hu' => '2. felszólítás: lejárt {Y}/0412 számla – szolgáltatás felfüggesztése {d:+4}-tól',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nnapriek upomienke zo {d:-14} faktúra {Y}/0412 (1 380,00 EUR) stále nie je uhradená. Ak platbu neprijmeme do {d:+4}, budeme nútení pozastaviť ďalšie objednávky žeriavu vrátane vášho termínu {d:+6}.\n\nFakturácia, Žeriavy Kráľ s.r.o.",
                'en' => "Hello,\n\ndespite our reminder of {d:-14}, invoice {Y}/0412 (EUR 1,380.00) is still unpaid. If we do not receive payment by {d:+4}, we will have to suspend further crane bookings, including yours on {d:+6}.\n\nAccounts, Kral Cranes Ltd.",
                'hu' => "Jó napot,\n\na {d:-14}-i emlékeztető ellenére a {Y}/0412 számla (1 380,00 EUR) továbbra sincs kiegyenlítve. Ha {d:+4}-ig nem érkezik meg a fizetés, kénytelenek leszünk felfüggeszteni a további darufoglalásokat, beleértve az Önök {d:+6}-i időpontját is.\n\nSzámlázás, Kráľ Daruk Kft.",
            ],
            'att' => [[
                'name' => 'invoice_{Y}_0412_reminder2.pdf',
                'title' => 'Second reminder - invoice {Y}/0412',
                'lines' => ['Amount due: 1,380.00 EUR', 'Original due date: {d:-21}', 'Final deadline: {d:+4}'],
            ]],
        ],
        [
            'n' => 21, 'folder' => 'INBOX', 'day' => -3, 'time' => '11:25', 'from' => 'jordan', 'to' => 'alex', 'seen' => true,
            'subject' => [
                'sk' => 'Plán zameraní na budúci týždeň',
                'en' => 'Measurement schedule for next week',
                'hu' => 'Jövő heti felmérési terv',
            ],
            'body' => [
                'sk' => "Ahoj Alex,\n\nposielam plán laserových zameraní:\n- {d:+4} Bratislava, showroom Novák (obklad, 140 m²)\n- {d:+5} 9:00 Trnava, Kováčová (kuchyňa)\n- {d:+6} Košice – len ak dorazia dosky z Milána\n\nProliner ide o mesiac na kalibráciu, takže zameraní po {d:+20} treba riešiť so zapožičaným prístrojom.\n\nJordan",
                'en' => "Hi Alex,\n\nhere is the laser measurement plan:\n- {d:+4} Bratislava, Novák showroom (cladding, 140 m²)\n- {d:+5} 9:00 Trnava, Kováčová (kitchen)\n- {d:+6} Košice – only if the Milan slabs arrive\n\nThe Proliner goes for calibration in a month, so measurements after {d:+20} need the loan unit.\n\nJordan",
                'hu' => "Szia Alex,\n\nküldöm a lézeres felmérések tervét:\n- {d:+4} Pozsony, Novák bemutatóterem (burkolat, 140 m²)\n- {d:+5} 9:00 Nagyszombat, Kováčová (konyha)\n- {d:+6} Kassa – csak ha megjönnek a milánói lapok\n\nA Proliner egy hónap múlva kalibrálásra megy, így a {d:+20} utáni felmérésekhez a csereeszköz kell.\n\nJordan",
            ],
        ],
        [
            'n' => 22, 'folder' => 'INBOX', 'day' => -2, 'time' => '13:40', 'from' => 'client', 'to' => 'alex', 'seen' => false, 're' => 8,
            'subject' => [
                'sk' => 'RE: Pripomienka platby – faktúra FV{Y}-0187 je 14 dní po splatnosti',
                'en' => 'RE: Payment reminder – invoice FV{Y}-0187 is 14 days overdue',
                'hu' => 'RE: Fizetési emlékeztető – az FV{Y}-0187 számla 14 napja lejárt',
            ],
            'body' => [
                'sk' => "Dobrý deň Alex,\n\n50 % faktúry (3 120 EUR) sme dnes odoslali. Zvyšok uhradíme hneď po vybavení reklamácie hrany na ostrove – pozri môj e-mail z {d:-5}. Viete nám dať termín opravy ešte tento týždeň?\n\n{contact}",
                'en' => "Hello Alex,\n\nwe sent 50 % of the invoice (EUR 3,120) today. We will pay the rest as soon as the chipped island edge is fixed – see my e-mail of {d:-5}. Can you give us a repair date this week?\n\n{contact}",
                'hu' => "Kedves Alex,\n\na számla 50 %-át (3 120 EUR) ma átutaltuk. A fennmaradó részt a sziget élének javítása után azonnal fizetjük – lásd {d:-5}-i levelemet. Meg tudnak adni még erre a hétre javítási időpontot?\n\n{contact}",
            ],
        ],
        [
            'n' => 23, 'folder' => 'INBOX', 'day' => -2, 'time' => '19:10', 'from' => 'petra', 'to' => 'sam', 'seen' => false,
            'subject' => [
                'sk' => 'Dopyt – 3 dosky pod umývadlá do kúpeľní',
                'en' => 'Request for quote – 3 bathroom vanity tops',
                'hu' => 'Ajánlatkérés – 3 fürdőszobai mosdópult',
            ],
            'body' => [
                'sk' => "Dobrý deň,\n\nstaviame penzión pri Komárne a potrebujeme 3 dosky pod umývadlá, každá 120 x 50 cm, s výrezom pre zápustné umývadlo. Páči sa nám tmavý mramor alebo jeho imitácia. Montáž by bola začiatkom budúceho mesiaca.\n\nViete poslať cenu a termín dodania?\n\nPetra Szabó",
                'en' => "Hello,\n\nwe are building a guesthouse near Komárno and need 3 vanity tops, each 120 x 50 cm, with a cut-out for an inset basin. We like dark marble or a marble look. Installation would be early next month.\n\nCould you send a price and delivery date?\n\nPetra Szabó",
                'hu' => "Jó napot,\n\nRévkomárom mellett panziót építünk, és 3 mosdópultra lenne szükségünk, egyenként 120 x 50 cm, beépíthető mosdó kivágásával. A sötét márvány vagy márványhatású anyag tetszik. A szerelés a jövő hónap elején lenne.\n\nTudnának árat és szállítási időpontot küldeni?\n\nSzabó Petra",
            ],
        ],
        [
            'n' => 24, 'folder' => 'INBOX', 'day' => -1, 'time' => '10:05', 'from' => 'mueller', 'to' => 'alex', 'seen' => false,
            'subject' => [
                'sk' => 'Pozvánka: kontrola partnerstva – {d:+2} 10:00',
                'en' => 'Invitation: partner review call – {d:+2} 10:00',
                'hu' => 'Meghívó: partneri áttekintő hívás – {d:+2} 10:00',
            ],
            'body' => [
                'sk' => "Alex,\n\nposielam pozvánku na hovor k SLA. Program:\n1. Návrh zmluvy a výnimka pre Statuario\n2. Meškanie Fiorana – dopad na naše novembrové objednávky\n3. Cenník od januára\n\nProsím potvrďte účasť.\nThomas",
                'en' => "Alex,\n\nhere is the invitation for our SLA call. Agenda:\n1. Draft agreement and the Statuario exception\n2. The Fiorano delay – impact on our November orders\n3. Price list from January\n\nPlease confirm.\nThomas",
                'hu' => "Alex,\n\nküldöm a meghívót az SLA-hívásra. Napirend:\n1. A szerződéstervezet és a Statuario-kivétel\n2. A fioranói késés – hatása a novemberi rendeléseinkre\n3. Árlista januártól\n\nKérem, erősítsd meg a részvételt.\nThomas",
            ],
            'att' => [[
                'name' => 'invite.ics',
                'ics' => [2, '10:00', 45, ['sk' => 'Kontrola partnerstva – SLA', 'en' => 'Partner review – SLA', 'hu' => 'Partneri áttekintés – SLA'], 'Microsoft Teams'],
            ]],
        ],
        [
            'n' => 25, 'folder' => 'INBOX', 'day' => -1, 'time' => '17:30', 'from' => 'sam', 'to' => 'alex', 'seen' => false,
            'subject' => [
                'sk' => 'Mesačná uzávierka – hodiny a spotreba materiálu do {d:+3}',
                'en' => 'Monthly close – hours and material usage by {d:+3}',
                'hu' => 'Havi zárás – munkaórák és anyagfelhasználás {d:+3}-ig',
            ],
            'body' => [
                'sk' => "Ahoj,\n\nkvôli mesačnej uzávierke prosím každého o doplnenie odpracovaných hodín a spotreby dosiek k zákazkám do {d:+3}. Bez toho nevieme vystaviť faktúry Novákovi ani Müllerovi.\n\nVďaka\nSam",
                'en' => "Hi,\n\nfor the monthly close, please everyone log your hours and slab usage per job by {d:+3}. Without that we cannot invoice Novák or Müller.\n\nThanks\nSam",
                'hu' => "Sziasztok,\n\na havi záráshoz kérek mindenkit, hogy {d:+3}-ig rögzítse a ledolgozott órákat és a lapfelhasználást munkánként. Enélkül nem tudjuk kiszámlázni sem Novákot, sem Müllert.\n\nKöszi\nSam",
            ],
        ],
        [
            'n' => 26, 'folder' => 'INBOX', 'day' => 0, 'time' => '07:48', 'from' => 'kovacova', 'to' => 'jordan', 'seen' => false,
            'subject' => [
                'sk' => 'URGENTNÉ: montáž linky sa posunula – dosku potrebujeme do {d:+3}',
                'en' => 'URGENT: installers moved up – we need the worktop by {d:+3}',
                'hu' => 'SÜRGŐS: előrehozták a szerelést – a munkalap {d:+3}-ig kell',
            ],
            'body' => [
                'sk' => "Dobrý deň Jordan,\n\nstolári nám práve oznámili, že linku osadia už zajtra, a montážnici odchádzajú na inú stavbu {d:+4}. Doska by preto musela byť namontovaná najneskôr {d:+3}, inak čakáme ďalšie tri týždne.\n\nDá sa zameranie presunúť na zajtra popoludní? Zavolajte mi prosím čo najskôr: +421 911 987 654.\n\nMartina Kováčová",
                'en' => "Hello Jordan,\n\nthe joiners just told me they will fit the kitchen units tomorrow, and the installers leave for another site on {d:+4}. So the worktop would have to be installed by {d:+3} at the latest, otherwise we wait another three weeks.\n\nCan the measurement move to tomorrow afternoon? Please call me as soon as possible: +421 911 987 654.\n\nMartina Kováčová",
                'hu' => "Kedves Jordan,\n\naz asztalosok most szóltak, hogy a konyhabútort már holnap beépítik, a szerelők pedig {d:+4}-én másik munkára mennek. A munkalapnak ezért legkésőbb {d:+3}-ig a helyén kellene lennie, különben további három hetet várunk.\n\nÁt lehet tenni a felmérést holnap délutánra? Kérem, hívjon mielőbb: +421 911 987 654.\n\nMartina Kováčová",
            ],
        ],
    ];
}
