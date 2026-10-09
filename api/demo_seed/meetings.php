<?php
/**
 * Demo seed module: meetings (the "AI zasadačka").
 *
 * Three meetings in the install language:
 *  1. yesterday's internal weekly meeting — a long speaker-labelled
 *     transcription, AI summary, automated minutes and extracted tasks;
 *  2. a past showroom meeting with a lead — manual notes and an AI summary;
 *  3. an upcoming partner call — an agenda only, not yet summarised.
 *
 * `audio_file` stays empty: there is no recording to play. MeetingRoomView
 * shows a "demo recording – no audio" notice for demo- meetings instead of a
 * player (see renderNoAudioNotice there).
 *
 * The content mirrors the demo mailbox (email.php): the Fiorano delay, the
 * island complaint, the Kováčová deadline and the Müller SLA.
 */
require_once __DIR__ . '/helpers.php';

function demo_seed_meetings(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $L = function (array $byLang) use ($lang): string { return demo_t($byLang, $lang); };
    $fmtDate = function (int $offset) use ($lang): string {
        $d = new \DateTimeImmutable(demo_d($offset));
        if ($lang === 'hu') return $d->format('Y. m. d.');
        if ($lang === 'en') return $d->format('j M Y');
        return $d->format('j. n. Y');
    };
    $fill = function (string $s) use ($fmtDate): string {
        return preg_replace_callback('/\{d:([+-]?\d+)\}/', function ($m) use ($fmtDate) { return $fmtDate((int)$m[1]); }, $s);
    };
    $T = function (array $byLang) use ($L, $fill): string { return $fill($L($byLang)); };

    // Link the first demo client when the clients module created one.
    $clientId = null;
    $clientName = null;
    try {
        $c = $pdo->query("SELECT `id`, `name` FROM `leads` WHERE `id` LIKE 'demo-client%' ORDER BY `id` LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($c) { $clientId = $c['id']; $clientName = $c['name']; }
    } catch (\Throwable $e) {}

    // meeting_tasks cascade on meeting_notes; delete them explicitly anyway.
    $pdo->exec("DELETE FROM `meeting_tasks` WHERE `id` LIKE 'demo-%' OR `meeting_id` LIKE 'demo-%'");
    $pdo->exec("DELETE FROM `meeting_notes` WHERE `id` LIKE 'demo-%'");

    $blocks = function (string $prefix, array $lines): string {
        $out = [];
        foreach ($lines as $i => [$type, $content]) {
            $out[] = ['id' => "b-{$prefix}-{$i}", 'type' => $type, 'content' => $content];
        }
        return json_encode($out, JSON_UNESCAPED_UNICODE);
    };

    $meetings = [];

    // ------------------------------------------------------------------ 1
    $m1 = demo_id('meetings', 1);
    $meetings[] = [
        'id' => $m1,
        'title' => $T(['sk' => 'Týždenná porada – výroba a obchod', 'en' => 'Weekly meeting – production and sales', 'hu' => 'Heti értekezlet – gyártás és értékesítés']),
        'date' => demo_d(-1),
        'lead_id' => 'lead-2',
        'lead_name' => 'Martina Kováčová',
        'duration' => 42,
        'notes' => $blocks('m1', [
            ['h2', $T(['sk' => 'Body na poradu', 'en' => 'Agenda', 'hu' => 'Napirend'])],
            ['bullet', $T(['sk' => 'Meškanie Fiorana (PO-2291)', 'en' => 'Fiorano delay (PO-2291)', 'hu' => 'Fioranói késés (PO-2291)'])],
            ['bullet', $T(['sk' => 'Reklamácia ostrova – Horák', 'en' => 'Island complaint – Horák', 'hu' => 'Sziget-reklamáció – Horák'])],
            ['bullet', $T(['sk' => 'Kováčová – posunutá montáž', 'en' => 'Kováčová – installation moved up', 'hu' => 'Kováčová – előrehozott szerelés'])],
            ['bullet', $T(['sk' => 'Novák – obklad 140 m²', 'en' => 'Novák – 140 m² cladding', 'hu' => 'Novák – 140 m² burkolat'])],
            ['bullet', $T(['sk' => 'SLA Müller, upomienka za žeriav', 'en' => 'Müller SLA, crane invoice reminder', 'hu' => 'Müller SLA, darus számla felszólítás'])],
        ]),
        'transcription' => demo_meeting_transcript($T),
        'automated_notes' => demo_meeting_minutes($T),
        'ai_summary' => [
            'summary' => $T([
                'sk' => 'Tím prebral 10-dňové meškanie kremeňa z Fiorana a rozhodol sa použiť 6 dosiek z Milána na zákazku Kováčová, ktorej montáž sa posunula na {d:+3}. Reklamácia vylomenej hrany u Horáka sa opraví na mieste do piatku, aby sa uvoľnil doplatok faktúry. Upomienka za žeriav sa uhradí ešte dnes a návrh SLA pre Müllera musí byť hotový pred hovorom {d:+2}.',
                'en' => 'The team went through the 10-day Fiorano quartz delay and decided to use the 6 Milan slabs for the Kováčová job, whose installation moved up to {d:+3}. The chipped island edge at Horák will be repaired on site by Friday to release the rest of the invoice payment. The crane invoice will be paid today, and the Müller SLA draft must be ready before the call on {d:+2}.',
                'hu' => 'A csapat átbeszélte a fioranói kvarc 10 napos késését, és úgy döntött, hogy a 6 milánói lapot a Kováčová-munkára fordítja, amelynek szerelése {d:+3}-ra került előre. A Horáknál lévő csorba szigetélt péntekig a helyszínen javítják, hogy felszabaduljon a számla hátralévő része. A darus számlát még ma kifizetik, a Müller SLA-tervezetnek pedig a {d:+2}-i hívás előtt el kell készülnie.',
            ]),
            'sentiment' => 'neutral',
            'topics' => [
                $T(['sk' => 'Meškanie dodávateľa', 'en' => 'Supplier delay', 'hu' => 'Beszállítói késés']),
                $T(['sk' => 'Reklamácia', 'en' => 'Complaint', 'hu' => 'Reklamáció']),
                $T(['sk' => 'Plán zameraní', 'en' => 'Measurement schedule', 'hu' => 'Felmérési terv']),
                $T(['sk' => 'Pohľadávky a záväzky', 'en' => 'Receivables and payables', 'hu' => 'Követelések és tartozások']),
                'SLA',
            ],
            'actionItems' => [
                $T(['sk' => 'Jordan: presunúť zameranie u Kováčovej na zajtra 15:00 a potvrdiť jej to telefonicky.', 'en' => 'Jordan: move the Kováčová measurement to tomorrow 15:00 and confirm it by phone.', 'hu' => 'Jordan: tegye át a Kováčová-felmérést holnap 15:00-ra, és erősítse meg telefonon.']),
                $T(['sk' => 'Sam: potvrdiť Fioranu expedíciu 6 dosiek z Milána.', 'en' => 'Sam: confirm the dispatch of the 6 Milan slabs with Fiorano.', 'hu' => 'Sam: erősítse meg Fioranóval a 6 milánói lap feladását.']),
                $T(['sk' => 'Alex: uhradiť faktúru za žeriav 0412 ešte dnes.', 'en' => 'Alex: pay the crane invoice 0412 today.', 'hu' => 'Alex: fizesse ki még ma a 0412-es darus számlát.']),
                $T(['sk' => 'Sam: naplánovať opravu hrany u Horáka do piatku.', 'en' => 'Sam: schedule the edge repair at Horák by Friday.', 'hu' => 'Sam: ütemezze péntekig a Horák-féle sziget élének javítását.']),
                $T(['sk' => 'Alex: dokončiť návrh SLA pre Müller Naturstein pred hovorom.', 'en' => 'Alex: finish the Müller Naturstein SLA draft before the call.', 'hu' => 'Alex: fejezze be a Müller Naturstein SLA-tervezetet a hívás előtt.']),
                $T(['sk' => 'Jordan: poslať Novákovi záväznú ponuku na 140 m² Grigio.', 'en' => 'Jordan: send Novák the binding quote for 140 m² of Grigio.', 'hu' => 'Jordan: küldje el Nováknak a kötelező ajánlatot 140 m² Grigióra.']),
            ],
        ],
        'summary_generated' => 1,
        'leads' => ['lead-2', 'lead-1', 'lead-3'],
        'clients' => $clientId ? [$clientId] : [],
        'users' => ['Alex', 'Sam', 'Jordan'],
        'tasks' => [
            [1, ['sk' => 'Presunúť zameranie u Kováčovej na zajtra 15:00', 'en' => 'Move the Kováčová measurement to tomorrow 15:00', 'hu' => 'A Kováčová-felmérés áttétele holnap 15:00-ra'],
                ['sk' => 'Montáž linky sa posunula; doska musí byť osadená do {d:+3}. Zavolať klientke a potvrdiť.', 'en' => 'The units are being fitted early; the worktop must be installed by {d:+3}. Call the client and confirm.', 'hu' => 'A bútor szerelése előrekerült; a munkalapnak {d:+3}-ig a helyén kell lennie. Hívja fel az ügyfelet és erősítse meg.'],
                'Jordan', -1, 0, 'high', 'in_progress'],
            [2, ['sk' => 'Potvrdiť expedíciu 6 dosiek z Milána', 'en' => 'Confirm dispatch of the 6 Milan slabs', 'hu' => 'A 6 milánói lap feladásának megerősítése'],
                ['sk' => 'Fiorano ponúklo 6 kusov Calacatta zo skladu v Miláne. Potrebujeme ich na zákazku Kováčová.', 'en' => 'Fiorano offered 6 Calacatta slabs from the Milan warehouse. Needed for the Kováčová job.', 'hu' => 'Fiorano 6 Calacatta lapot ajánlott a milánói raktárból. A Kováčová-munkához kellenek.'],
                'Sam', -1, 1, 'high', 'todo'],
            [3, ['sk' => 'Uhradiť faktúru za žeriav 0412', 'en' => 'Pay crane invoice 0412', 'hu' => 'A 0412-es darus számla kifizetése'],
                ['sk' => 'Druhá upomienka; bez úhrady prídeme o termín žeriavu {d:+6}.', 'en' => 'Second reminder; without payment we lose the crane booking on {d:+6}.', 'hu' => 'Második felszólítás; fizetés nélkül elveszítjük a {d:+6}-i darufoglalást.'],
                'Alex', -1, 0, 'high', 'done'],
            [4, ['sk' => 'Oprava hrany ostrova u Horáka', 'en' => 'Repair the island edge at Horák', 'hu' => 'A sziget élének javítása Horáknál'],
                ['sk' => 'Lepenie a prebrúsenie rohu na mieste, fotodokumentácia pred a po. Doplatok faktúry je viazaný na uzavretie reklamácie.', 'en' => 'Bond and re-polish the corner on site, with before/after photos. The remaining payment depends on closing the complaint.', 'hu' => 'A sarok ragasztása és újrapolírozása a helyszínen, előtte-utána fotókkal. A hátralévő fizetés a reklamáció lezárásától függ.'],
                'Sam', 0, 3, 'high', 'todo'],
            [5, ['sk' => 'Návrh SLA pre Müller Naturstein', 'en' => 'Draft SLA for Müller Naturstein', 'hu' => 'SLA-tervezet a Müller Natursteinnek'],
                ['sk' => '160 dosiek mesačne, pevná štvrťročná cena, 10 pracovných dní, výnimka 15 dní pre Statuario.', 'en' => '160 slabs a month, fixed quarterly price, 10 working days, 15-day exception for Statuario.', 'hu' => 'Havi 160 lap, fix negyedéves ár, 10 munkanap, 15 napos kivétel a Statuariónál.'],
                'Alex', -1, 1, 'medium', 'in_progress'],
            [6, ['sk' => 'Záväzná ponuka Novák – 140 m² Grigio', 'en' => 'Binding quote for Novák – 140 m² Grigio', 'hu' => 'Kötelező ajánlat Nováknak – 140 m² Grigio'],
                ['sk' => 'Vrátane montáže a termínu začatia; showroom otvárajú začiatkom mesiaca.', 'en' => 'Including installation and a start date; the showroom opens early next month.', 'hu' => 'Szereléssel és kezdési időponttal; a bemutatóterem a hónap elején nyit.'],
                'Jordan', 0, 2, 'medium', 'todo'],
        ],
    ];

    // ------------------------------------------------------------------ 2
    $meetings[] = [
        'id' => demo_id('meetings', 2),
        'title' => $T(['sk' => 'Showroom – Ján Novák, kamenný obklad', 'en' => 'Showroom – Ján Novák, stone cladding', 'hu' => 'Bemutatóterem – Novák Ján, kőburkolat']),
        'date' => demo_d(-16),
        'lead_id' => 'lead-1',
        'lead_name' => 'Ján Novák',
        'duration' => 35,
        'notes' => $blocks('m2', [
            ['h2', $T(['sk' => 'Požiadavky klienta', 'en' => 'Client requirements', 'hu' => 'Az ügyfél igényei'])],
            ['bullet', $T(['sk' => 'Obklad steny showroomu, cca 140 m², porcelánová bridlica 12 mm', 'en' => 'Showroom wall cladding, about 140 m², 12 mm porcelain slate', 'hu' => 'Bemutatótermi falburkolat, kb. 140 m², 12 mm-es porcelánpala'])],
            ['bullet', $T(['sk' => 'Zvažuje dekory Grigio, Antracite, Ardesia', 'en' => 'Considering Grigio, Antracite and Ardesia', 'hu' => 'A Grigio, Antracite és Ardesia dekorokat fontolgatja'])],
            ['bullet', $T(['sk' => 'Otvorenie showroomu začiatkom budúceho mesiaca – termín je pevný', 'en' => 'Showroom opens early next month – the date is fixed', 'hu' => 'A bemutatóterem a jövő hónap elején nyit – a határidő fix'])],
            ['todo', $T(['sk' => 'Poslať vzorky 30 x 60 cm', 'en' => 'Send 30 x 60 cm samples', 'hu' => '30 x 60 cm-es minták küldése'])],
            ['todo', $T(['sk' => 'Orientačný cenník obkladu vrátane montáže', 'en' => 'Indicative cladding price list including installation', 'hu' => 'Tájékoztató burkolati árlista szereléssel'])],
        ]),
        'transcription' => null,
        'automated_notes' => null,
        'ai_summary' => [
            'summary' => $T([
                'sk' => 'Ján Novák chce obložiť stenu nového showroomu (asi 140 m²) porcelánovou bridlicou a vyberá z troch dekorov. Termín otvorenia je pevný, preto potrebuje vzorky a cenu rýchlo. Dohodli sme zaslanie vzoriek a orientačného cenníka.',
                'en' => 'Ján Novák wants to clad a wall of his new showroom (about 140 m²) in porcelain slate and is choosing between three designs. The opening date is fixed, so he needs samples and a price quickly. We agreed to send samples and an indicative price list.',
                'hu' => 'Novák Ján új bemutatóterme egyik falát (kb. 140 m²) porcelánpalával szeretné burkolni, és három dekor közül választ. A nyitás időpontja fix, ezért gyorsan kellenek a minták és az ár. Megállapodtunk a minták és a tájékoztató árlista elküldéséről.',
            ]),
            'sentiment' => 'positive',
            'topics' => [
                $T(['sk' => 'Kamenný obklad', 'en' => 'Stone cladding', 'hu' => 'Kőburkolat']),
                $T(['sk' => 'Vzorky', 'en' => 'Samples', 'hu' => 'Minták']),
                $T(['sk' => 'Termín otvorenia', 'en' => 'Opening date', 'hu' => 'Nyitási időpont']),
            ],
            'actionItems' => [
                $T(['sk' => 'Poslať vzorky troch dekorov vo formáte 30 x 60 cm.', 'en' => 'Send samples of the three designs at 30 x 60 cm.', 'hu' => 'A három dekor mintáinak elküldése 30 x 60 cm-ben.']),
                $T(['sk' => 'Pripraviť orientačný cenník obkladu vrátane montáže.', 'en' => 'Prepare an indicative cladding price list including installation.', 'hu' => 'Tájékoztató burkolati árlista készítése szereléssel.']),
            ],
        ],
        'summary_generated' => 1,
        'leads' => ['lead-1'],
        'clients' => [],
        'users' => ['Sam'],
        'tasks' => [
            [1, ['sk' => 'Poslať vzorky Grigio, Antracite, Ardesia', 'en' => 'Send Grigio, Antracite and Ardesia samples', 'hu' => 'Grigio, Antracite, Ardesia minták küldése'],
                ['sk' => 'Kuriérom, formát 30 x 60 cm.', 'en' => 'By courier, 30 x 60 cm.', 'hu' => 'Futárral, 30 x 60 cm.'],
                'Sam', -16, -14, 'medium', 'done'],
            [2, ['sk' => 'Orientačný cenník obkladu', 'en' => 'Indicative cladding price list', 'hu' => 'Tájékoztató burkolati árlista'],
                ['sk' => 'Ceny za m² pre tri dekory + montáž.', 'en' => 'Per-m² prices for the three designs plus installation.', 'hu' => 'm²-árak a három dekorra + szerelés.'],
                'Sam', -16, -15, 'medium', 'done'],
        ],
    ];

    // ------------------------------------------------------------------ 3
    $meetings[] = [
        'id' => demo_id('meetings', 3),
        'title' => $T(['sk' => 'Kontrola partnerstva – SLA s Müller Naturstein', 'en' => 'Partner review – SLA with Müller Naturstein', 'hu' => 'Partneri áttekintés – SLA a Müller Natursteinnel']),
        'date' => demo_d(2),
        'lead_id' => 'lead-3',
        'lead_name' => 'Thomas Müller',
        'duration' => 45,
        'notes' => $blocks('m3', [
            ['h2', $T(['sk' => 'Program', 'en' => 'Agenda', 'hu' => 'Napirend'])],
            ['number', $T(['sk' => 'Návrh zmluvy a výnimka pre Statuario', 'en' => 'Draft agreement and the Statuario exception', 'hu' => 'Szerződéstervezet és a Statuario-kivétel'])],
            ['number', $T(['sk' => 'Meškanie Fiorana – dopad na novembrové objednávky', 'en' => 'The Fiorano delay – impact on November orders', 'hu' => 'A fioranói késés – hatás a novemberi rendelésekre'])],
            ['number', $T(['sk' => 'Cenník od januára', 'en' => 'Price list from January', 'hu' => 'Árlista januártól'])],
            ['quote', $T(['sk' => 'Thomas akceptuje 160 dosiek mesačne a 15 dní pre Statuario, ak to bude v SLA ako výnimka.', 'en' => 'Thomas accepts 160 slabs a month and 15 days for Statuario if the SLA lists it as an exception.', 'hu' => 'Thomas elfogadja a havi 160 lapot és a Statuario 15 napját, ha az SLA kivételként rögzíti.'])],
        ]),
        'transcription' => null,
        'automated_notes' => null,
        'ai_summary' => null,
        'summary_generated' => 0,
        'leads' => ['lead-3'],
        'clients' => [],
        'users' => ['Alex', 'Sam'],
        'tasks' => [],
    ];

    $insM = $pdo->prepare("INSERT INTO `meeting_notes` (`id`, `title`, `date`, `lead_id`, `lead_name`, `duration`, `notes`, `ai_summary_json`, `summary_generated`, `attached_leads_json`, `attached_clients_json`, `attached_users_json`, `archived`, `audio_file`, `transcription`, `automated_notes`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)");
    $insT = $pdo->prepare("INSERT INTO `meeting_tasks` (`id`, `meeting_id`, `title`, `description`, `start_date`, `assigned_user`, `due_date`, `priority`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $taskN = 0;
    foreach ($meetings as $m) {
        $insM->execute([
            $m['id'], $m['title'], $m['date'], $m['lead_id'], $m['lead_name'], $m['duration'], $m['notes'],
            $m['ai_summary'] !== null ? json_encode($m['ai_summary'], JSON_UNESCAPED_UNICODE) : null,
            $m['summary_generated'],
            json_encode($m['leads']), json_encode($m['clients']), json_encode($m['users']),
            $m['transcription'], $m['automated_notes'],
            $m['date'] . ' 17:00:00',
        ]);
        foreach ($m['tasks'] as [$n, $title, $desc, $user, $start, $due, $prio, $status]) {
            $taskN++;
            $insT->execute([demo_id('meeting-task', $taskN), $m['id'], $T($title), $T($desc), demo_d($start), $user, demo_d($due), $prio, $status]);
        }
    }
}

/** Speaker-labelled transcription of the weekly meeting (~40 minutes). */
function demo_meeting_transcript(callable $T): string {
    $turns = [
        ['Alex', ['sk' => 'Dobre, poďme na to, nech to stihneme do pol hodiny. Mám tu päť bodov: Fiorano, reklamácia u Horáka, Kováčová, Novák a potom peniaze – žeriav a Müller. Sam, začni s Fioranom.', 'en' => 'Right, let us start so we finish within half an hour. I have five points: Fiorano, the Horák complaint, Kováčová, Novák, and then money – the crane and Müller. Sam, start with Fiorano.', 'hu' => 'Rendben, kezdjük, hogy fél órán belül végezzünk. Öt pontom van: Fiorano, a Horák-reklamáció, Kováčová, Novák, aztán a pénz – a daru és Müller. Sam, kezdd Fioranóval.']],
        ['Sam', ['sk' => 'Takže objednávka 2291, tých dvadsaťštyri dosiek Calacatta, sa posúva o desať dní. Majú odstávku lisovacej linky. Expedícia bude {d:+6}, u nás to čakajú do {d:+9}.', 'en' => 'So order 2291, the twenty-four Calacatta slabs, is moving by ten days. Their press line is down. Dispatch will be {d:+6}, and they expect it here by {d:+9}.', 'hu' => 'Szóval a 2291-es rendelés, a huszonnégy Calacatta lap, tíz napot csúszik. Áll a préssoruk. A feladás {d:+6} lesz, nálunk {d:+9}-re várják.']],
        ['Alex', ['sk' => 'To je presne to, čoho som sa bál. Čo z toho je naviazané na konkrétne zákazky?', 'en' => 'That is exactly what I was afraid of. Which of those slabs are tied to specific jobs?', 'hu' => 'Pont ettől tartottam. Ezekből mi van konkrét munkához kötve?']],
        ['Sam', ['sk' => 'Šesť kusov ide na Trnavu, Kováčová, a zvyšok je sklad a Müllerova novembrová objednávka. Ponúkli nám, že šesť dosiek pošlú hneď zo skladu v Miláne. Ja som im napísal, že to chceme, ale ešte nepotvrdili termín.', 'en' => 'Six pieces are for Trnava, Kováčová, and the rest is stock plus Müller\'s November order. They offered to ship six slabs straight from their Milan warehouse. I wrote back that we want them, but they have not confirmed a date yet.', 'hu' => 'Hat darab Nagyszombatra megy, Kováčovának, a többi raktár és Müller novemberi rendelése. Felajánlották, hogy hat lapot azonnal küldenek a milánói raktárukból. Visszaírtam, hogy kérjük, de időpontot még nem erősítettek meg.']],
        ['Jordan', ['sk' => 'Tak to musíme dotlačiť, lebo Kováčová mi dnes ráno písala, že stolári jej osádzajú linku už zajtra. Montážnici odchádzajú {d:+4}, takže doska musí byť hore najneskôr {d:+3}.', 'en' => 'Then we have to push them, because Kováčová wrote to me this morning that the joiners are fitting her units tomorrow already. The installers leave on {d:+4}, so the worktop has to be in by {d:+3} at the latest.', 'hu' => 'Akkor rá kell szorítanunk őket, mert Kováčová ma reggel írt, hogy az asztalosok már holnap beszerelik a bútort. A szerelők {d:+4}-én elmennek, tehát a munkalapnak legkésőbb {d:+3}-ig fent kell lennie.']],
        ['Alex', ['sk' => 'Do {d:+3}? To je o dva dni skôr, než sme sa dohodli.', 'en' => 'By {d:+3}? That is two days earlier than we agreed.', 'hu' => '{d:+3}-ig? Az két nappal korábbi, mint amiben megegyeztünk.']],
        ['Jordan', ['sk' => 'Áno. Zameranie sme mali na {d:+5}, to už nejde. Navrhujem presunúť zameranie na zajtra o tretej, keď už bude linka stáť. Rezať by sme mohli hneď na druhý deň, ak budú dosky z Milána.', 'en' => 'Yes. We had the measurement on {d:+5}, that no longer works. I suggest moving the measurement to tomorrow at three, once the units are in. We could cut the very next day if the Milan slabs are here.', 'hu' => 'Igen. A felmérés {d:+5}-ra volt tervezve, az már nem megy. Azt javaslom, tegyük át holnap háromra, amikor már áll a bútor. Ha itt lesznek a milánói lapok, már másnap vághatnánk.']],
        ['Sam', ['sk' => 'Ak ich pošlú zajtra, kamión ide dva dni. Bude to tesné, ale reálne.', 'en' => 'If they ship tomorrow, the truck takes two days. Tight, but realistic.', 'hu' => 'Ha holnap feladják, a kamion két napig jön. Szoros, de reális.']],
        ['Alex', ['sk' => 'Dobre. Jordan, zavolaj jej ešte dnes, potvrď zajtra tri hodiny, a Sam, ty dnes vytlač z Fiorana termín na Miláno. Ak do zajtra obeda nepotvrdia, voláme mne a riešime náhradný dekor.', 'en' => 'Fine. Jordan, call her today and confirm tomorrow at three, and Sam, get a date for Milan out of Fiorano today. If they have not confirmed by tomorrow lunchtime, call me and we look for a substitute design.', 'hu' => 'Jó. Jordan, hívd fel még ma, és erősítsd meg a holnap hármat, Sam, te pedig ma szedd ki Fioranóból a milánói dátumot. Ha holnap ebédig nem erősítik meg, hívjatok, és helyettesítő dekort keresünk.']],
        ['Jordan', ['sk' => 'Jasné.', 'en' => 'Got it.', 'hu' => 'Rendben.']],
        ['Alex', ['sk' => 'Druhý bod, Horák. Videli ste tie fotky?', 'en' => 'Second point, Horák. Have you seen the photos?', 'hu' => 'Második pont, Horák. Láttátok a fotókat?']],
        ['Sam', ['sk' => 'Videl. Na rohu ostrova je vylomená hrana, asi dva centimetre, a pri výreze na varnú dosku je vlasová prasklina. Tá prasklina ma trápi viac.', 'en' => 'I have. There is a chipped edge on the island corner, about two centimetres, and a hairline crack by the hob cut-out. The crack worries me more.', 'hu' => 'Láttam. A sziget sarkán van egy kb. két centis csorba, és a főzőlap kivágásánál egy hajszálrepedés. A repedés jobban aggaszt.']],
        ['Jordan', ['sk' => 'Tú prasklinu som videl aj ja pri montáži? Nie, myslím, že nie. Skôr to vyzerá, že pri osádzaní varnej dosky na to niekto zatlačil. Ale to im nebudeme vyčítať.', 'en' => 'Did I see that crack during installation? No, I do not think so. It looks more like someone pressed on it while fitting the hob. But we are not going to blame them for it.', 'hu' => 'Láttam ezt a repedést a szereléskor? Nem, szerintem nem. Inkább úgy néz ki, hogy valaki ránehezedett a főzőlap beszerelésekor. De ezt nem fogjuk a szemükre hányni.']],
        ['Alex', ['sk' => 'Nie, nebudeme. Horák nám poslal polovicu faktúry, tri stodvadsať, a zvyšok drží, kým to nevyriešime. To je fér. Klient sa im sťahuje o dva týždne. Sam, vieš to opraviť na mieste?', 'en' => 'No, we will not. Horák paid half of the invoice, three thousand one hundred and twenty, and is holding the rest until we fix it. That is fair. Their client moves in in two weeks. Sam, can you repair it on site?', 'hu' => 'Nem fogjuk. Horák kifizette a számla felét, háromezer-százhúszat, a többit visszatartja, amíg meg nem oldjuk. Ez korrekt. Az ügyfelük két hét múlva költözik. Sam, meg tudod javítani a helyszínen?']],
        ['Sam', ['sk' => 'Hranu áno, zalepím, prebrúsim a vyleštím, bude to takmer neviditeľné. Prasklinu prelepím epoxidom zospodu a vystužím. Ak by sa ďalej šírila, menili by sme celý diel, ale to nečakám.', 'en' => 'The edge, yes – I will bond, sand and polish it and it will be almost invisible. The crack I will glue with epoxy from below and reinforce. If it kept spreading we would replace the whole piece, but I do not expect that.', 'hu' => 'Az élt igen – ragasztom, csiszolom, polírozom, szinte láthatatlan lesz. A repedést alulról epoxival ragasztom és megerősítem. Ha tovább terjedne, az egész darabot cserélnénk, de erre nem számítok.']],
        ['Alex', ['sk' => 'Kedy?', 'en' => 'When?', 'hu' => 'Mikor?']],
        ['Sam', ['sk' => 'Do piatku. Urobím fotky pred a po, nech to má Horák zdokumentované.', 'en' => 'By Friday. I will take before and after photos so Horák has it documented.', 'hu' => 'Péntekig. Előtte-utána fotókat készítek, hogy Horáknak meglegyen a dokumentáció.']],
        ['Alex', ['sk' => 'Super. Ja mu dnes odpíšem, že opravu robíme do piatku a že doplatok čakáme po prevzatí. Tretí bod som vlastne už mal, Kováčová. Štvrtý – Novák. Jordan?', 'en' => 'Great. I will reply to him today that we do the repair by Friday and expect the rest of the payment after sign-off. The third point we have actually covered, Kováčová. Fourth – Novák. Jordan?', 'hu' => 'Szuper. Ma visszaírok neki, hogy péntekig megjavítjuk, és az átvétel után várjuk a hátralékot. A harmadik pontot tulajdonképpen már megbeszéltük, Kováčová. Negyedik – Novák. Jordan?']],
        ['Jordan', ['sk' => 'Novák si vybral Grigio. Chce záväznú ponuku na stoštyridsať metrov vrátane montáže a termín začatia. Showroom otvárajú začiatkom mesiaca, takže by sme museli začať najneskôr {d:+10}.', 'en' => 'Novák chose Grigio. He wants a binding quote for a hundred and forty metres including installation, plus a start date. The showroom opens early next month, so we would have to start by {d:+10} at the latest.', 'hu' => 'Novák a Grigiót választotta. Kötelező ajánlatot kér száznegyven méterre szereléssel, és kezdési időpontot. A bemutatóterem a hónap elején nyit, így legkésőbb {d:+10}-én el kellene kezdenünk.']],
        ['Sam', ['sk' => 'Grigio máme skladom asi na deväťdesiat metrov. Zvyšok objednám, porcelán z Talianska nie je ten istý závod ako kremeň, tam meškanie nie je.', 'en' => 'We have about ninety metres of Grigio in stock. I will order the rest; the porcelain comes from a different Italian plant than the quartz, so no delay there.', 'hu' => 'Grigióból kb. kilencven méter van raktáron. A többit megrendelem; a porcelán másik olasz gyárból jön, mint a kvarc, ott nincs késés.']],
        ['Alex', ['sk' => 'Takže ponuku vieme poslať zajtra. Jordan, cena podľa cenníka, šesťdesiatštyri za meter plus montáž tridsaťosem, a daj mu päť percent za objem, nech to podpíše rýchlo. Zameranie by si spojil s tou cestou do Bratislavy {d:+4}.', 'en' => 'So we can send the quote tomorrow. Jordan, list price – sixty-four per metre plus thirty-eight for installation – and give him five percent for volume so he signs quickly. Combine the measurement with the Bratislava trip on {d:+4}.', 'hu' => 'Akkor holnap elküldhetjük az ajánlatot. Jordan, listaár – hatvannégy méterenként plusz harmincnyolc a szerelés –, és adj neki öt százalék mennyiségi kedvezményt, hogy gyorsan aláírja. A felmérést kösd össze a {d:+4}-i pozsonyi úttal.']],
        ['Jordan', ['sk' => 'Dobre. Len pripomínam, že Proliner ide o mesiac na kalibráciu, dva dni bude preč. Prodim nám ponúka náhradný, tak som povedal áno.', 'en' => 'OK. Just a reminder that the Proliner goes for calibration in a month and will be gone for two days. Prodim offers a loan unit, so I said yes.', 'hu' => 'Rendben. Csak emlékeztetek, hogy a Proliner egy hónap múlva kalibrálásra megy, két napig nem lesz itt. A Prodim csereeszközt ajánl, igent mondtam.']],
        ['Alex', ['sk' => 'Výborne. Posledný bod, peniaze. Prišla druhá upomienka od Kráľa za žeriav, tisíc tristoosemdesiat. Píšu, že ak nezaplatíme do {d:+4}, zrušia nám termín {d:+6}. To je ten Košice.', 'en' => 'Excellent. Last point, money. We got a second reminder from Kráľ for the crane, one thousand three hundred and eighty. They say if we do not pay by {d:+4}, they cancel our booking on {d:+6}. That is the Košice one.', 'hu' => 'Kiváló. Utolsó pont, pénz. Megjött Kráľtól a második felszólítás a daruért, ezerháromszáznyolcvan. Azt írják, ha {d:+4}-ig nem fizetünk, törlik a {d:+6}-i foglalásunkat. Az a kassai.']],
        ['Sam', ['sk' => 'To som myslel, že je zaplatené. Faktúra ležala u mňa v šuflíku, prepáčte.', 'en' => 'I thought that was paid. The invoice was sitting in my drawer, sorry.', 'hu' => 'Azt hittem, ki van fizetve. A számla nálam volt a fiókban, bocsánat.']],
        ['Alex', ['sk' => 'Nevadí, uhradím to ešte dnes. Ale dohodnime sa, že faktúry od dodávateľov idú hneď do CRM, nie do šuflíka. A posledné – Müller. Thomas súhlasí so stošesťdesiatimi doskami mesačne a s pätnástimi dňami pre Statuario, ak to bude v SLA ako výnimka. Hovor je {d:+2} o desiatej.', 'en' => 'No problem, I will pay it today. But let us agree that supplier invoices go straight into the CRM, not into a drawer. And last – Müller. Thomas agrees to a hundred and sixty slabs a month and fifteen days for Statuario if the SLA lists it as an exception. The call is on {d:+2} at ten.', 'hu' => 'Semmi gond, még ma kifizetem. De állapodjunk meg, hogy a beszállítói számlák azonnal a CRM-be kerülnek, nem a fiókba. És végül – Müller. Thomas elfogadja a havi százhatvan lapot és a Statuario tizenöt napját, ha az SLA kivételként rögzíti. A hívás {d:+2}-án tízkor lesz.']],
        ['Sam', ['sk' => 'Bude chcieť hovoriť aj o tom meškaní z Fiorana, to je v pozvánke.', 'en' => 'He will want to talk about the Fiorano delay too, it is in the invite.', 'hu' => 'A fioranói késésről is beszélni akar majd, benne van a meghívóban.']],
        ['Alex', ['sk' => 'Áno. Preto chcem mať do SLA zapísané, že pri meškaní dodávateľa ho informujeme do 48 hodín a ponúkneme náhradný dekor. A chcem držať na sklade rezervu – šesť dosiek z najpredávanejších dekorov. Sam, vieš mi do hovoru dať, koľko by to viazalo peňazí?', 'en' => 'Yes. That is why I want the SLA to say that if the supplier is late we inform him within 48 hours and offer a substitute design. And I want a stock buffer – six slabs of the best sellers. Sam, can you tell me before the call how much cash that would tie up?', 'hu' => 'Igen. Ezért szeretném, ha az SLA rögzítené, hogy beszállítói késés esetén 48 órán belül értesítjük, és helyettesítő dekort ajánlunk. És szeretnék raktári tartalékot – hat lapot a legkelendőbb dekorokból. Sam, meg tudod mondani a hívás előtt, mennyi pénzt kötne le?']],
        ['Sam', ['sk' => 'Odhadom okolo desaťtisíc. Pošlem presne zajtra.', 'en' => 'Around ten thousand, roughly. I will send the exact figure tomorrow.', 'hu' => 'Nagyjából tízezer. Holnap küldöm a pontos számot.']],
        ['Alex', ['sk' => 'Dobre. Ešte niečo? Nie? Tak zhrniem: Jordan – Kováčová zajtra o tretej a ponuka Novákovi. Sam – Miláno, oprava u Horáka do piatku, číslo za rezervu. Ja – žeriav dnes a SLA pred hovorom. Ďakujem.', 'en' => 'Good. Anything else? No? Then to sum up: Jordan – Kováčová tomorrow at three and the Novák quote. Sam – Milan, the Horák repair by Friday, the buffer figure. Me – the crane today and the SLA before the call. Thank you.', 'hu' => 'Jó. Még valami? Nincs? Akkor összefoglalom: Jordan – Kováčová holnap háromkor és a Novák-ajánlat. Sam – Milánó, a Horák-javítás péntekig, a tartalék összege. Én – a daru ma és az SLA a hívás előtt. Köszönöm.']],
    ];

    // Timestamps follow how long each turn takes to say, spread over the
    // meeting's 42 minutes, so the transcript matches the meeting's length.
    $texts = [];
    foreach ($turns as [$who, $text]) {
        $texts[] = [$who, $T($text)];
    }
    $total = array_sum(array_map(function ($t) { return mb_strlen($t[1]); }, $texts));
    $out = [];
    $elapsed = 0;
    foreach ($texts as [$who, $text]) {
        $sec = (int)round($elapsed / max(1, $total) * 41 * 60);
        $out[] = sprintf('[%02d:%02d] %s: %s', intdiv($sec, 60), $sec % 60, $who, $text);
        $elapsed += mb_strlen($text);
    }
    return implode("\n\n", $out);
}

/** The automated minutes (Markdown), as transcribe_meeting.php would produce them. */
function demo_meeting_minutes(callable $T): string {
    return $T([
        'sk' => "### Týždenná porada – výroba a obchod\n\n**Účastníci:** Alex, Sam, Jordan  \n**Trvanie:** 42 min\n\n#### 1. Meškanie Fiorana (PO-2291)\n- Expedícia 24 dosiek Calacatta sa posúva na {d:+6}, dodanie do {d:+9}.\n- Fiorano ponúka 6 dosiek zo skladu v Miláne – použijeme ich na zákazku Kováčová.\n- **Rozhodnutie:** ak Fiorano nepotvrdí termín do zajtra obeda, hľadáme náhradný dekor.\n\n#### 2. Reklamácia ostrova – Horák\n- Vylomená hrana (cca 2 cm) a vlasová prasklina pri výreze na varnú dosku.\n- Klient uhradil 50 % faktúry (3 120 EUR), zvyšok po vybavení reklamácie.\n- **Rozhodnutie:** oprava na mieste do piatku s fotodokumentáciou.\n\n#### 3. Kováčová – posunutá montáž\n- Montáž linky zajtra, doska musí byť osadená do {d:+3}.\n- **Rozhodnutie:** zameranie presunuté na zajtra 15:00.\n\n#### 4. Novák – obklad 140 m²\n- Vybraný dekor Grigio, skladom ~90 m², zvyšok sa objedná.\n- Ponuka: 64 EUR/m² + montáž 38 EUR/m², zľava 5 % za objem.\n\n#### 5. Financie a partneri\n- Druhá upomienka za žeriav (1 380 EUR) – úhrada dnes; faktúry dodávateľov odteraz hneď do CRM.\n- Müller: súhlas so 160 doskami mesačne a výnimkou 15 dní pre Statuario. Hovor {d:+2} o 10:00.\n- Do SLA doplniť informovanie o meškaní do 48 hodín a skladovú rezervu 6 dosiek.\n",
        'en' => "### Weekly meeting – production and sales\n\n**Attendees:** Alex, Sam, Jordan  \n**Duration:** 42 min\n\n#### 1. Fiorano delay (PO-2291)\n- Dispatch of 24 Calacatta slabs moves to {d:+6}, delivery by {d:+9}.\n- Fiorano offers 6 slabs from its Milan warehouse – they go to the Kováčová job.\n- **Decision:** if Fiorano has not confirmed a date by tomorrow lunchtime, we look for a substitute design.\n\n#### 2. Island complaint – Horák\n- Chipped edge (about 2 cm) and a hairline crack by the hob cut-out.\n- The client paid 50 % of the invoice (EUR 3,120); the rest follows once the complaint is closed.\n- **Decision:** on-site repair by Friday with before/after photos.\n\n#### 3. Kováčová – installation moved up\n- Units fitted tomorrow; the worktop must be installed by {d:+3}.\n- **Decision:** measurement moved to tomorrow at 15:00.\n\n#### 4. Novák – 140 m² cladding\n- Grigio chosen; about 90 m² in stock, the rest to be ordered.\n- Quote: EUR 64/m² + EUR 38/m² installation, 5 % volume discount.\n\n#### 5. Finance and partners\n- Second crane invoice reminder (EUR 1,380) – paid today; supplier invoices go straight into the CRM from now on.\n- Müller: agrees to 160 slabs a month and a 15-day Statuario exception. Call on {d:+2} at 10:00.\n- Add to the SLA: notice of delays within 48 hours and a 6-slab stock buffer.\n",
        'hu' => "### Heti értekezlet – gyártás és értékesítés\n\n**Résztvevők:** Alex, Sam, Jordan  \n**Időtartam:** 42 perc\n\n#### 1. Fioranói késés (PO-2291)\n- A 24 Calacatta lap feladása {d:+6}-ra tolódik, szállítás {d:+9}-ig.\n- Fiorano 6 lapot ajánl a milánói raktárából – ezek a Kováčová-munkára mennek.\n- **Döntés:** ha Fiorano holnap ebédig nem erősít meg időpontot, helyettesítő dekort keresünk.\n\n#### 2. Sziget-reklamáció – Horák\n- Csorba él (kb. 2 cm) és hajszálrepedés a főzőlap kivágásánál.\n- Az ügyfél kifizette a számla 50 %-át (3 120 EUR), a többit a reklamáció lezárása után.\n- **Döntés:** helyszíni javítás péntekig, előtte-utána fotókkal.\n\n#### 3. Kováčová – előrehozott szerelés\n- A bútort holnap szerelik; a munkalapnak {d:+3}-ig a helyén kell lennie.\n- **Döntés:** a felmérés holnap 15:00-ra került.\n\n#### 4. Novák – 140 m² burkolat\n- A Grigio lett kiválasztva; kb. 90 m² raktáron, a többit megrendeljük.\n- Ajánlat: 64 EUR/m² + 38 EUR/m² szerelés, 5 % mennyiségi kedvezmény.\n\n#### 5. Pénzügyek és partnerek\n- Második darus felszólítás (1 380 EUR) – ma kifizetve; a beszállítói számlák ezentúl azonnal a CRM-be kerülnek.\n- Müller: elfogadja a havi 160 lapot és a 15 napos Statuario-kivételt. Hívás {d:+2}-án 10:00-kor.\n- Az SLA-ba: késésről 48 órán belüli értesítés és 6 lapos raktári tartalék.\n",
    ]);
}
