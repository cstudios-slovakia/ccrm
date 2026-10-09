<?php
/**
 * Demo seed module: sai (Synthetic AI market rehearsal).
 *
 * One completed simulation, stored exactly as a finished live run leaves it:
 * a `swarm_simulations` row whose checkpoint_state carries graph, agents,
 * posts and round metrics, the strategic report in `final_report`, and the
 * per-simulation `sim<id>_nodes/edges/agents/posts` tables. The SAI module
 * opens it through the normal resume path — no network or LLM call.
 *
 * The scenario is a port of src/utils/swarm/demoData.ts (a generic SaaS
 * pricing rehearsal) rewritten for the stone/countertop demo company.
 *
 * Its id deliberately does NOT start with 'demo-': SaiModule treats any such
 * id as the built-in client-side demo and would show that instead of this
 * row. wipe_demo.php drops every simulation, so prefix matching is not needed.
 */
require_once __DIR__ . '/helpers.php';
require_once dirname(__DIR__) . '/Swarm/SwarmManager.php';

const DEMO_SAI_SIM_ID = 'sai-demo-1';

function demo_seed_sai(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $L = function (array $byLang) use ($lang): string { return demo_t($byLang, $lang); };

    $manager = new \CCRM\Swarm\SwarmManager($pdo);
    $manager->deleteSimulation(DEMO_SAI_SIM_ID); // idempotent: drops its sharded tables too

    $data = demo_sai_scenario($L);

    $created = $manager->createSimulation([
        'id' => DEMO_SAI_SIM_ID,
        'title' => $data['title'],
        'hypothesis' => $data['hypothesis'],
        'seed_document' => $data['seed'],
        'lookback_months' => 12,
        'swarm_scale' => 30,
        'total_rounds' => 3,
        'status' => 'completed',
        'crm_data_sources' => ['leads', 'clients', 'projects', 'finance', 'emails'],
    ]);
    $prefix = preg_replace('/[^a-zA-Z0-9_]/', '', $created['table_prefix']);

    // --- Sharded tables -----------------------------------------------------
    $insNode = $pdo->prepare("INSERT INTO `{$prefix}nodes` (`id`, `entity_name`, `entity_type`, `summary`, `attributes`, `source_crm_id`) VALUES (?, ?, ?, ?, ?, ?)");
    foreach ($data['graph']['nodes'] as $n) {
        $insNode->execute([$n['id'], $n['name'], $n['type'], $n['summary'], json_encode($n['attributes'] ?? new \stdClass()), $n['sourceCrmId'] ?? null]);
    }
    $insEdge = $pdo->prepare("INSERT INTO `{$prefix}edges` (`id`, `source_node_id`, `target_node_id`, `relation_name`, `fact`, `valid_from_round`) VALUES (?, ?, ?, ?, ?, ?)");
    foreach ($data['graph']['edges'] as $e) {
        $insEdge->execute([$e['id'], $e['source'], $e['target'], $e['relation'], $e['fact'], $e['validFromRound']]);
    }
    $insAgent = $pdo->prepare("INSERT INTO `{$prefix}agents` (`agent_index`, `username`, `display_name`, `profession`, `mbti`, `stance`, `user_char`, `public_bio`, `follower_count`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($data['agents'] as $a) {
        $insAgent->execute([$a['id'], $a['username'], $a['displayName'], $a['profession'], $a['mbti'], $a['stance'], $a['userChar'], $a['publicBio'], $a['followerCount']]);
    }
    $insPost = $pdo->prepare("INSERT INTO `{$prefix}posts` (`id`, `round_num`, `agent_id`, `platform`, `action_type`, `target_post_id`, `content`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($data['posts'] as $p) {
        $insPost->execute([$p['id'], $p['roundNum'], $p['agentId'], $p['platform'], $p['actionType'], $p['targetPostId'] ?? null, $p['content'], demo_dt(-4, $p['createdAt'])]);
    }

    // --- Registry: the state the UI resumes from ------------------------------
    $checkpoint = [
        'simulationId' => DEMO_SAI_SIM_ID,
        'title' => $data['title'],
        'hypothesis' => $data['hypothesis'],
        'strategicQuestion' => $data['report']['executiveVerdict']['question'],
        'currentRound' => 3,
        'totalRounds' => 3,
        'total_rounds' => 3,
        'status' => 'completed',
        'graph' => $data['graph'],
        'agents' => $data['agents'],
        'posts' => $data['posts'],
        'metricsHistory' => $data['metrics'],
        'finalReport' => $data['report'],
        'crm_data_sources' => ['leads', 'clients', 'projects', 'finance', 'emails'],
        'model_name' => 'gpt-5.6-luna',
        'diurnal_cycle' => true,
    ];
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    $upd = $pdo->prepare("UPDATE `swarm_simulations`
        SET `current_round` = 3, `status` = 'completed', `checkpoint_state` = ?, `final_report` = ?, `created_at` = ?, `updated_at` = ?
        WHERE `id` = ?");
    $upd->execute([json_encode($checkpoint, $flags), json_encode($data['report'], $flags), demo_dt(-4, '08:55'), demo_dt(-4, '16:40'), DEMO_SAI_SIM_ID]);
}

/** The whole scenario, already resolved to the install language. */
function demo_sai_scenario(callable $L): array {
    $ans = [
        'yes' => $L(['sk' => 'Akceptujem (so zameraním a zárukou)', 'en' => 'Accept (with templating and warranty)', 'hu' => 'Elfogadom (felméréssel és garanciával)']),
        'maybe' => $L(['sk' => 'Váham / chcem projektovú cenu', 'en' => 'Hesitant / want project pricing', 'hu' => 'Bizonytalan / projektárat kér']),
        'no' => $L(['sk' => 'Odmietam (lacnejšia dielňa)', 'en' => 'Reject (cheaper workshop)', 'hu' => 'Elutasítom (olcsóbb műhely)']),
    ];

    $graph = [
        'nodes' => [
            ['id' => 'node_studios', 'type' => 'Partner',
                'name' => $L(['sk' => 'Kuchynské štúdiá a architekti', 'en' => 'Kitchen studios and architects', 'hu' => 'Konyhastúdiók és építészek']),
                'summary' => $L(['sk' => 'Prinášajú asi 55 % zákaziek. Citliví na cenu, ktorú musia obhájiť pred koncovým klientom, a na dodržanie termínu montáže.', 'en' => 'Bring in about 55 % of jobs. Sensitive to a price they have to defend to their client, and to installation dates being met.', 'hu' => 'A munkák kb. 55 %-át hozzák. Érzékenyek az árra, amelyet az ügyfél előtt kell megvédeniük, és a szerelési határidők betartására.'])],
            ['id' => 'node_homeowners', 'type' => 'Client',
                'name' => $L(['sk' => 'Majitelia domov pri rekonštrukcii', 'en' => 'Homeowners renovating', 'hu' => 'Felújító lakástulajdonosok']),
                'summary' => $L(['sk' => 'Kupujú raz za 15 rokov. Viac než cena ich trápi riziko poškodenia, meškanie a nejasná záruka.', 'en' => 'Buy once in 15 years. Damage risk, delays and an unclear warranty worry them more than price.', 'hu' => '15 évente egyszer vásárolnak. Az ár helyett inkább a sérülés kockázata, a késés és a homályos garancia aggasztja őket.'])],
            ['id' => 'node_wholesale', 'type' => 'Partner', 'sourceCrmId' => 'lead-3',
                'name' => $L(['sk' => 'Veľkoobchodný partner (Müller Naturstein)', 'en' => 'Wholesale partner (Müller Naturstein)', 'hu' => 'Nagykereskedelmi partner (Müller Naturstein)']),
                'summary' => $L(['sk' => 'Rokuje o rámcovej SLA na 160+ dosiek mesačne. Potrebuje pevnú štvrťročnú cenu.', 'en' => 'Negotiating a framework SLA for 160+ slabs a month. Needs a fixed quarterly price.', 'hu' => 'Havi 160+ lapra vonatkozó keret-SLA-ról tárgyal. Fix negyedéves árra van szüksége.'])],
            ['id' => 'node_rival', 'type' => 'Competitor',
                'name' => $L(['sk' => 'Nízkonákladová kamenárska dielňa', 'en' => 'Low-cost stone workshop', 'hu' => 'Fapados kőfaragó műhely']),
                'summary' => $L(['sk' => 'Ponúka o 15 % nižšie ceny, zameriava šablónou z preglejky a montáž nedáva s pevným termínom.', 'en' => 'Undercuts by 15 %, templates with plywood and gives no fixed installation date.', 'hu' => '15 %-kal olcsóbb, rétegelt lemez sablonnal mér, és nem vállal fix szerelési időpontot.'])],
            ['id' => 'node_supplier', 'type' => 'Supplier',
                'name' => 'Fiorano Stone Srl',
                'summary' => $L(['sk' => 'Hlavný dodávateľ kremeňa. Aktuálne meškanie 10 dní ohrozuje sľub montáže do 10 pracovných dní.', 'en' => 'Main quartz supplier. Its current 10-day delay threatens the 10-working-day installation promise.', 'hu' => 'A fő kvarcbeszállító. A jelenlegi 10 napos késése veszélyezteti a 10 munkanapos szerelési ígéretet.'])],
        ],
        'edges' => [
            ['id' => 'edge_1', 'source' => 'node_rival', 'target' => 'node_studios', 'validFromRound' => 1,
                'relation' => $L(['sk' => 'PODLIEZA', 'en' => 'UNDERCUTS', 'hu' => 'ALÁÍGÉR']),
                'fact' => $L(['sk' => 'Dielňa ponúka štúdiám províziu 5 % za každú odovzdanú zákazku.', 'en' => 'The workshop offers studios a 5 % commission on every job they pass on.', 'hu' => 'A műhely 5 % jutalékot kínál a stúdióknak minden továbbadott munkáért.'])],
            ['id' => 'edge_2', 'source' => 'node_studios', 'target' => 'node_homeowners', 'validFromRound' => 1,
                'relation' => $L(['sk' => 'ODPORÚČA', 'en' => 'RECOMMENDS', 'hu' => 'AJÁNLJA']),
                'fact' => $L(['sk' => 'Štúdiá rozhodujú o výbere kamenárstva v 7 z 10 kuchýň.', 'en' => 'Studios decide which stone workshop is used in 7 out of 10 kitchens.', 'hu' => 'A stúdiók 10 konyhából 7-ben döntenek a kőfaragó kiválasztásáról.'])],
            ['id' => 'edge_3', 'source' => 'node_supplier', 'target' => 'node_wholesale', 'validFromRound' => 2,
                'relation' => $L(['sk' => 'OHROZUJE', 'en' => 'THREATENS', 'hu' => 'VESZÉLYEZTETI']),
                'fact' => $L(['sk' => 'Meškanie zásielky PO-2291 posúva dodávky Statuario o 10 dní.', 'en' => 'The PO-2291 delay pushes Statuario deliveries back by 10 days.', 'hu' => 'A PO-2291 késése 10 nappal tolja ki a Statuario szállításokat.'])],
            ['id' => 'edge_4', 'source' => 'node_homeowners', 'target' => 'node_rival', 'validFromRound' => 2,
                'relation' => $L(['sk' => 'POROVNÁVA', 'en' => 'COMPARES', 'hu' => 'ÖSSZEHASONLÍTJA']),
                'fact' => $L(['sk' => 'Majitelia vidia na fórach fotky vylomených hrán po montáži lacnejšej konkurencie.', 'en' => 'Homeowners see forum photos of chipped edges after installs by the cheaper rival.', 'hu' => 'A tulajdonosok fórumokon látnak fotókat az olcsóbb versenytárs szerelése utáni csorba élekről.'])],
            ['id' => 'edge_5', 'source' => 'node_wholesale', 'target' => 'node_studios', 'validFromRound' => 3,
                'relation' => $L(['sk' => 'ZÁSOBUJE', 'en' => 'SUPPLIES', 'hu' => 'ELLÁTJA']),
                'fact' => $L(['sk' => 'Partner dodáva štúdiám v Rakúsku; fixná cena mu umožní prijať ich zákazky.', 'en' => 'The partner supplies studios in Austria; a fixed price lets it take on their jobs.', 'hu' => 'A partner ausztriai stúdiókat lát el; a fix ár lehetővé teszi, hogy elvállalja munkáikat.'])],
        ],
    ];

    $agents = [
        ['id' => 1, 'username' => 'zuzana_kuchyne', 'displayName' => 'Zuzana Kráľová', 'mbti' => 'ESTJ', 'stance' => 'opposing', 'followerCount' => 1840, 'karma' => 390, 'sourceEntityId' => 'node_studios',
            'profession' => $L(['sk' => 'Majiteľka kuchynského štúdia', 'en' => 'Kitchen studio owner', 'hu' => 'Konyhastúdió-tulajdonos']),
            'userChar' => $L(['sk' => 'Pragmatická majiteľka štúdia. Každé zdraženie musí vysvetliť klientovi, preto ho odmietne, ak nedostane prechodné obdobie a niečo hmatateľné navyše.', 'en' => 'Pragmatic studio owner. She has to explain every price rise to her client, so she rejects it unless she gets a transition period and something tangible on top.', 'hu' => 'Gyakorlatias stúdiótulajdonos. Minden áremelést meg kell magyaráznia ügyfelének, ezért elutasítja, ha nem kap átmeneti időszakot és valami kézzelfogható pluszt.']),
            'publicBio' => $L(['sk' => 'Kuchyne na mieru od 2009 | Trnava – Bratislava', 'en' => 'Custom kitchens since 2009 | Trnava – Bratislava', 'hu' => 'Egyedi konyhák 2009 óta | Nagyszombat – Pozsony']),
            'interestedTopics' => [$L(['sk' => 'ceny', 'en' => 'pricing', 'hu' => 'árak']), $L(['sk' => 'termíny', 'en' => 'deadlines', 'hu' => 'határidők']), $L(['sk' => 'provízie', 'en' => 'commissions', 'hu' => 'jutalékok'])]],
        ['id' => 2, 'username' => 'martin_rekonstrukcia', 'displayName' => 'Martin Baláž', 'mbti' => 'ISFJ', 'stance' => 'supportive', 'followerCount' => 320, 'karma' => 140, 'sourceEntityId' => 'node_homeowners',
            'profession' => $L(['sk' => 'Majiteľ domu, rekonštrukcia kuchyne', 'en' => 'Homeowner renovating his kitchen', 'hu' => 'Konyháját felújító háztulajdonos']),
            'userChar' => $L(['sk' => 'Opatrný kupujúci. Raz už zažil prasknutú dosku a mesiac čakania na opravu, takže záruka a pevný termín sú pre neho dôležitejšie než cena.', 'en' => 'Careful buyer. He once had a cracked worktop and waited a month for a fix, so warranty and a fixed date matter more to him than price.', 'hu' => 'Óvatos vásárló. Egyszer már megrepedt a munkalapja, és egy hónapot várt a javításra, ezért a garancia és a fix időpont fontosabb neki az árnál.']),
            'publicBio' => $L(['sk' => 'Otec dvoch detí | rekonštrukcia rodinného domu', 'en' => 'Father of two | renovating a family house', 'hu' => 'Kétgyermekes apa | családi ház felújítása']),
            'interestedTopics' => [$L(['sk' => 'záruka', 'en' => 'warranty', 'hu' => 'garancia']), $L(['sk' => 'spoľahlivosť', 'en' => 'reliability', 'hu' => 'megbízhatóság'])]],
        ['id' => 3, 'username' => 'kamen_express', 'displayName' => 'Rudolf Benko', 'mbti' => 'ENTJ', 'stance' => 'opposing', 'followerCount' => 2650, 'karma' => 210, 'sourceEntityId' => 'node_rival',
            'profession' => $L(['sk' => 'Konateľ, Kameň Express', 'en' => 'Managing director, Kamen Express', 'hu' => 'Ügyvezető, Kamen Express']),
            'userChar' => $L(['sk' => 'Konkurent, ktorý súťaží cenou. Snaží sa zdraženie označiť za predražovanie a láka štúdiá na províziu.', 'en' => 'Rival who competes on price. He frames the rise as overcharging and lures studios with commission.', 'hu' => 'Árban versenyző rivális. Az emelést túlárazásnak állítja be, és jutalékkal csábítja a stúdiókat.']),
            'publicBio' => $L(['sk' => 'Pracovné dosky za férové ceny | dodanie do 3 týždňov', 'en' => 'Worktops at fair prices | delivery within 3 weeks', 'hu' => 'Munkalapok korrekt áron | szállítás 3 héten belül']),
            'interestedTopics' => [$L(['sk' => 'cena', 'en' => 'price', 'hu' => 'ár']), $L(['sk' => 'konkurencia', 'en' => 'competition', 'hu' => 'verseny'])]],
        ['id' => 4, 'username' => 'thomas_naturstein', 'displayName' => 'Thomas Müller', 'mbti' => 'ISTJ', 'stance' => 'neutral', 'followerCount' => 2980, 'karma' => 560, 'sourceEntityId' => 'node_wholesale',
            'profession' => $L(['sk' => 'Konateľ, Müller Naturstein GmbH', 'en' => 'Managing director, Müller Naturstein GmbH', 'hu' => 'Ügyvezető, Müller Naturstein GmbH']),
            'userChar' => $L(['sk' => 'Veľkoodberateľ. Zdraženie akceptuje, ak bude cena pevná na štvrťrok a termíny zmluvne zaručené aj pri meškaní dodávateľa.', 'en' => 'High-volume buyer. Accepts a rise if the price is fixed for the quarter and dates are contractually guaranteed even when the supplier is late.', 'hu' => 'Nagy volumenű vevő. Elfogadja az emelést, ha az ár negyedévre fix, és a határidőket szerződés garantálja a beszállító késése esetén is.']),
            'publicBio' => $L(['sk' => 'Prírodný kameň pre Rakúsko a Bavorsko', 'en' => 'Natural stone for Austria and Bavaria', 'hu' => 'Természetes kő Ausztriának és Bajorországnak']),
            'interestedTopics' => ['SLA', $L(['sk' => 'objemy', 'en' => 'volumes', 'hu' => 'mennyiségek']), $L(['sk' => 'dodacie lehoty', 'en' => 'lead times', 'hu' => 'szállítási idők'])]],
        ['id' => 5, 'username' => 'ivana_interier', 'displayName' => 'Ing. arch. Ivana Szabová', 'mbti' => 'INFJ', 'stance' => 'supportive', 'followerCount' => 4120, 'karma' => 730, 'sourceEntityId' => 'node_studios',
            'profession' => $L(['sk' => 'Interiérová architektka', 'en' => 'Interior architect', 'hu' => 'Belsőépítész']),
            'userChar' => $L(['sk' => 'Architektka, ktorej meno je na každej realizácii. Presné 3D zameranie a čisté výrezy sú pre ňu argument, ktorý klientovi rada predá.', 'en' => 'Architect whose name is on every project. Precise 3D templating and clean cut-outs are a selling point she happily passes on to clients.', 'hu' => 'Építész, akinek a neve minden munkán ott van. A pontos 3D felmérés és a tiszta kivágások olyan érvek, amelyeket szívesen továbbad ügyfeleinek.']),
            'publicBio' => $L(['sk' => 'Interiéry, ktoré vydržia | Bratislava', 'en' => 'Interiors that last | Bratislava', 'hu' => 'Tartós belső terek | Pozsony']),
            'interestedTopics' => [$L(['sk' => 'kvalita', 'en' => 'quality', 'hu' => 'minőség']), $L(['sk' => 'zameranie', 'en' => 'templating', 'hu' => 'felmérés'])]],
        ['id' => 6, 'username' => 'peter_developer', 'displayName' => 'Peter Horák', 'mbti' => 'ENTP', 'stance' => 'neutral', 'followerCount' => 1510, 'karma' => 300, 'sourceEntityId' => 'node_homeowners',
            'profession' => $L(['sk' => 'Stavbyvedúci, Stavby Horák', 'en' => 'Site manager, Horak Construction', 'hu' => 'Építésvezető, Horák Építő']),
            'userChar' => $L(['sk' => 'Rieši byty po desiatkach a počíta celkové náklady vrátane reklamácií. Nedávno riešil vylomenú hranu na ostrove.', 'en' => 'Fits out flats by the dozen and counts total cost including complaints. Recently dealt with a chipped island edge.', 'hu' => 'Tucatszám készít lakásokat, és a teljes költséget számolja a reklamációkkal együtt. Nemrég egy csorba szigetéllel volt dolga.']),
            'publicBio' => $L(['sk' => 'Bytové domy na kľúč | západné Slovensko', 'en' => 'Turnkey apartment buildings | western Slovakia', 'hu' => 'Kulcsrakész társasházak | Nyugat-Szlovákia']),
            'interestedTopics' => [$L(['sk' => 'celkové náklady', 'en' => 'total cost', 'hu' => 'teljes költség']), $L(['sk' => 'reklamácie', 'en' => 'complaints', 'hu' => 'reklamációk'])]],
    ];

    $post = function (int $id, int $round, int $agentId, string $platform, string $type, array $text, int $likes, int $quotes, int $comments, float $sent, string $at, string $answer, ?int $target = null) use ($agents, $L): array {
        $a = $agents[$agentId - 1];
        $p = [
            'id' => $id, 'roundNum' => $round, 'agentId' => $agentId,
            'agentName' => $a['displayName'], 'agentUsername' => $a['username'], 'agentProfession' => $a['profession'],
            'platform' => $platform, 'actionType' => $type, 'content' => $L($text),
            'likesCount' => $likes, 'quotesCount' => $quotes, 'commentsCount' => $comments,
            'sentimentScore' => $sent, 'createdAt' => $at, 'supportedAnswer' => $answer,
        ];
        if ($target !== null) $p['targetPostId'] = $target;
        return $p;
    };

    $posts = [
        $post(101, 1, 1, 'chitchat', 'POST', [
            'sk' => 'O 8 % drahšie dosky uprostred sezóny? Mojim klientom to nevysvetlím. Ak nedostanem aspoň tri mesiace na staré ceny pre rozbehnuté projekty, budem sa musieť pozrieť inam.',
            'en' => '8 % dearer worktops in the middle of the season? I cannot explain that to my clients. Without at least three months at the old prices for running projects, I will have to look elsewhere.',
            'hu' => '8 %-kal drágább munkalapok a szezon közepén? Ezt nem tudom megmagyarázni az ügyfeleimnek. Ha a futó projektekre nem kapok legalább három hónapot a régi áron, máshol kell néznem.'],
            31, 6, 15, -0.6, '09:10', $ans['no']),
        $post(102, 1, 3, 'chitchat', 'POST', [
            'sk' => 'Rovnaký kremeň, o 15 % lacnejšie, a štúdiám dáme 5 % províziu. Za „3D zameranie" si nikto pripláca nemusí – my to zvládneme šablónou.',
            'en' => 'Same quartz, 15 % cheaper, and studios get a 5 % commission from us. Nobody needs to pay extra for "3D templating" – we do it with a template.',
            'hu' => 'Ugyanaz a kvarc 15 %-kal olcsóbban, és a stúdiók 5 % jutalékot kapnak tőlünk. A „3D felmérésért" senkinek sem kell felárat fizetnie – mi sablonnal csináljuk.'],
            44, 11, 21, -0.8, '09:40', $ans['no']),
        $post(103, 1, 2, 'chitchat', 'QUOTE', [
            'sk' => 'Šablónou? Presne tak mi minule vyrezali drez o 8 mm vedľa a na opravu som čakal mesiac. Desaťročná záruka na hrany a výrezy mi za 8 % stojí.',
            'en' => 'With a template? That is exactly how my sink was cut 8 mm off last time, and I waited a month for the fix. A 10-year warranty on edges and cut-outs is worth 8 % to me.',
            'hu' => 'Sablonnal? Pont így vágták el legutóbb 8 mm-rel a mosogatómat, és egy hónapot vártam a javításra. A 10 éves garancia az élekre és kivágásokra nekem megéri a 8 %-ot.'],
            58, 12, 19, 0.7, '10:20', $ans['yes'], 102),
        $post(104, 2, 4, 'forum', 'POST', [
            'sk' => 'Pre veľkoodber je kľúčové, či garancia 10 pracovných dní platí aj pri meškaní z Fiorana. Ak áno a cena bude pevná na štvrťrok, 8 % akceptujeme – stále je to pod nemeckou úrovňou.',
            'en' => 'For volume buyers the key question is whether the 10-working-day guarantee holds even when Fiorano is late. If it does and the price is fixed for the quarter, we accept 8 % – it is still below German levels.',
            'hu' => 'Nagy tételnél az a kulcs, hogy a 10 munkanapos garancia Fiorano késése esetén is érvényes-e. Ha igen, és az ár negyedévre fix, elfogadjuk a 8 %-ot – még így is a német szint alatt van.'],
            67, 14, 26, 0.3, '12:35', $ans['maybe']),
        $post(105, 2, 5, 'forum', 'POST', [
            'sk' => 'Proliner zameranie mi ušetrí jednu návštevu stavby a reklamácie výrezov prakticky zmizli. Klientom to podám ako „presnosť na milimeter" – za to si priplatia radšej než za značku dekoru.',
            'en' => 'Proliner templating saves me a site visit, and cut-out complaints have practically disappeared. I will sell it to clients as "precision to the millimetre" – they pay for that more readily than for a brand name.',
            'hu' => 'A Proliner felmérés egy helyszíni látogatást spórol meg, és a kivágási reklamációk gyakorlatilag eltűntek. Az ügyfeleknek „milliméteres pontosságként" adom el – ezért szívesebben fizetnek, mint egy márkanévért.'],
            73, 16, 18, 0.75, '13:05', $ans['yes']),
        $post(106, 2, 6, 'chitchat', 'POST', [
            'sk' => 'Prepočítal som to na 40 bytov: jedna reklamácia hrany ma stojí deň partie a zdržanie odovzdania. Pri 8 % navyše a záruke vychádzame lacnejšie než s dielňou, ktorá dáva o 15 % nižšiu cenu.',
            'en' => 'I ran it for 40 flats: one edge complaint costs me a crew day and a delayed handover. At 8 % more with the warranty we come out cheaper than with the workshop that is 15 % lower.',
            'hu' => 'Kiszámoltam 40 lakásra: egy élreklamáció egy brigádnapba és késleltetett átadásba kerül. 8 % többlettel és garanciával olcsóbban jövünk ki, mint a 15 %-kal olcsóbb műhellyel.'],
            49, 9, 13, 0.4, '14:20', $ans['maybe']),
        $post(107, 3, 1, 'chitchat', 'QUOTE', [
            'sk' => 'Dostali sme potvrdenie: staré ceny do konca štvrťroka pre všetky rozbehnuté projekty a zameranie zadarmo. Za týchto podmienok zostávam – a záruku budem klientom ukazovať ako výhodu.',
            'en' => 'Confirmed: old prices until the end of the quarter for all running projects, and free templating. On those terms I am staying – and I will show the warranty to clients as an advantage.',
            'hu' => 'Megerősítették: a negyedév végéig régi ár minden futó projektre, és ingyenes felmérés. Ilyen feltételekkel maradok – és a garanciát előnyként mutatom az ügyfeleknek.'],
            88, 17, 20, 0.55, '15:50', $ans['yes'], 101),
        $post(108, 3, 4, 'forum', 'COMMENT', [
            'sk' => 'Súhlasím s návrhom SLA, ak výnimka pre Statuario (15 dní) bude výslovne v zmluve. Pre ostatné dekory 10 pracovných dní podpíšeme.',
            'en' => 'We agree to the SLA draft if the Statuario exception (15 days) is written into the contract. For all other designs we will sign 10 working days.',
            'hu' => 'Elfogadjuk az SLA-tervezetet, ha a Statuario-kivétel (15 nap) kifejezetten bekerül a szerződésbe. A többi dekornál aláírjuk a 10 munkanapot.'],
            61, 8, 14, 0.5, '16:10', $ans['yes'], 104),
        $post(109, 3, 3, 'chitchat', 'POST', [
            'sk' => 'Uvidíme, ako dlho vydrží „záruka 10 rokov", keď im Taliansko zase nedodá. My aspoň nesľubujeme, čo nevieme splniť.',
            'en' => 'Let us see how long the "10-year warranty" lasts when Italy fails to deliver again. At least we do not promise what we cannot keep.',
            'hu' => 'Meglátjuk, meddig tart a „10 éves garancia", amikor Olaszország megint nem szállít. Mi legalább nem ígérünk olyat, amit nem tudunk teljesíteni.'],
            17, 2, 9, -0.5, '17:30', $ans['no']),
    ];

    $metrics = [
        ['round' => 1, 'simulatedHour' => 9, 'averageSentiment' => -0.24, 'supportiveCount' => 2, 'opposingCount' => 2, 'neutralCount' => 2, 'totalInteractions' => 150, 'viralIndex' => 38,
            'answerDistribution' => [$ans['yes'] => 2, $ans['maybe'] => 1, $ans['no'] => 3], 'leadingAnswer' => $ans['no'], 'consensusPercentage' => 50],
        ['round' => 2, 'simulatedHour' => 12, 'averageSentiment' => 0.21, 'supportiveCount' => 3, 'opposingCount' => 1, 'neutralCount' => 2, 'totalInteractions' => 310, 'viralIndex' => 61,
            'answerDistribution' => [$ans['yes'] => 3, $ans['maybe'] => 2, $ans['no'] => 1], 'leadingAnswer' => $ans['yes'], 'consensusPercentage' => 50],
        ['round' => 3, 'simulatedHour' => 15, 'averageSentiment' => 0.46, 'supportiveCount' => 4, 'opposingCount' => 1, 'neutralCount' => 1, 'totalInteractions' => 470, 'viralIndex' => 79,
            'answerDistribution' => [$ans['yes'] => 4, $ans['maybe'] => 1, $ans['no'] => 1], 'leadingAnswer' => $ans['yes'], 'consensusPercentage' => 74],
    ];

    $question = $L([
        'sk' => 'Akceptujú naši zákazníci 8 % zdraženie kremenných dosiek, ak pridáme bezplatné 3D zameranie, montáž do 10 pracovných dní a 10-ročnú záruku na hrany a výrezy?',
        'en' => 'Will our customers accept an 8 % price rise on quartz worktops if we add free 3D templating, installation within 10 working days and a 10-year warranty on edges and cut-outs?',
        'hu' => 'Elfogadják-e ügyfeleink a kvarc munkalapok 8 %-os áremelését, ha ingyenes 3D felmérést, 10 munkanapon belüli szerelést és 10 éves garanciát adunk az élekre és kivágásokra?',
    ]);

    $report = [
        'title' => $L(['sk' => 'Strategický briefing: 8 % zdraženie kremenných dosiek so zárukou a 3D zameraním', 'en' => 'Strategic briefing: an 8 % quartz worktop price rise with warranty and 3D templating', 'hu' => 'Stratégiai összefoglaló: 8 %-os kvarc munkalap-áremelés garanciával és 3D felméréssel']),
        'summary' => $L(['sk' => 'Simulácia preverila zdraženie kremenných dosiek o 8 % spojené s bezplatným laserovým zameraním, garanciou montáže do 10 pracovných dní a 10-ročnou zárukou. Počiatočný odpor kuchynských štúdií sa po potvrdení starých cien do konca štvrťroka zmenil na 74 % súhlas; konkurencia zostala izolovaná.', 'en' => 'The rehearsal tested an 8 % rise on quartz worktops combined with free laser templating, a 10-working-day installation guarantee and a 10-year warranty. Initial pushback from kitchen studios turned into 74 % approval once old prices were confirmed until the end of the quarter; the rival was left isolated.', 'hu' => 'A szimuláció a kvarc munkalapok 8 %-os áremelését vizsgálta ingyenes lézeres felméréssel, 10 munkanapos szerelési garanciával és 10 éves garanciával. A konyhastúdiók kezdeti ellenállása 74 %-os egyetértéssé vált, miután a negyedév végéig megerősítették a régi árakat; a versenytárs elszigetelődött.']),
        'generatedAt' => (new \DateTimeImmutable(demo_dt(-4, '16:40')))->format(DATE_ATOM),
        'executiveVerdict' => [
            'question' => $question,
            'directAnswer' => $L(['sk' => 'ÁNO, s prechodným obdobím pre štúdiá (74 % súhlas)', 'en' => 'YES, with a transition period for studios (74 % approval)', 'hu' => 'IGEN, a stúdióknak adott átmeneti időszakkal (74 % egyetértés)']),
            'confidenceScore' => 84,
            'summary' => $L(['sk' => 'Rozhodla hmatateľná hodnota: zákazníci a architekti vnímajú zameranie a záruku ako ochranu pred reklamáciami, ktoré ich stoja viac než 8 %. Jediným reálnym rizikom je meškanie dodávateľa, ktoré musí SLA výslovne riešiť.', 'en' => 'Tangible value carried it: customers and architects see templating and the warranty as protection against complaints that cost them more than 8 %. The only real risk is supplier delay, which the SLA must address explicitly.', 'hu' => 'A kézzelfogható érték döntött: az ügyfelek és az építészek a felmérést és a garanciát a 8 %-nál többe kerülő reklamációk elleni védelemnek tekintik. Az egyetlen valódi kockázat a beszállítói késés, amelyet az SLA-nak kifejezetten kezelnie kell.']),
            'answerBreakdown' => [
                ['answer' => $ans['yes'], 'sharePercentage' => 74, 'count' => 4, 'sentiment' => 0.6],
                ['answer' => $ans['maybe'], 'sharePercentage' => 16, 'count' => 1, 'sentiment' => 0.3],
                ['answer' => $ans['no'], 'sharePercentage' => 10, 'count' => 1, 'sentiment' => -0.7],
            ],
            'keyDrivers' => [
                ['title' => $L(['sk' => '1. Záruka na hrany a výrezy', 'en' => '1. Warranty on edges and cut-outs', 'hu' => '1. Garancia az élekre és kivágásokra']),
                    'explanation' => $L(['sk' => 'Koncoví zákazníci aj developeri počítajú cenu reklamácie, nie len cenu dosky.', 'en' => 'Homeowners and developers count the cost of a complaint, not just the price of the slab.', 'hu' => 'A tulajdonosok és a fejlesztők a reklamáció költségét számolják, nem csak a lap árát.']),
                    'quotes' => [$L(['sk' => 'Desaťročná záruka na hrany a výrezy mi za 8 % stojí.', 'en' => 'A 10-year warranty on edges and cut-outs is worth 8 % to me.', 'hu' => 'A 10 éves garancia az élekre és kivágásokra nekem megéri a 8 %-ot.'])]],
                ['title' => $L(['sk' => '2. Bezplatné 3D zameranie', 'en' => '2. Free 3D templating', 'hu' => '2. Ingyenes 3D felmérés']),
                    'explanation' => $L(['sk' => 'Architekti ho predávajú ako presnosť na milimeter a šetrí im návštevu stavby.', 'en' => 'Architects sell it as millimetre precision, and it saves them a site visit.', 'hu' => 'Az építészek milliméteres pontosságként adják el, és megspórol nekik egy helyszíni látogatást.']),
                    'quotes' => [$L(['sk' => 'Proliner zameranie mi ušetrí jednu návštevu stavby.', 'en' => 'Proliner templating saves me a site visit.', 'hu' => 'A Proliner felmérés megspórol egy helyszíni látogatást.'])]],
                ['title' => $L(['sk' => '3. Staré ceny do konca štvrťroka', 'en' => '3. Old prices until the end of the quarter', 'hu' => '3. Régi árak a negyedév végéig']),
                    'explanation' => $L(['sk' => 'Prechodné obdobie neutralizovalo odpor štúdií, ktoré majú rozbehnuté ponuky.', 'en' => 'The transition period neutralised pushback from studios with quotes already out.', 'hu' => 'Az átmeneti időszak semlegesítette a már kiadott ajánlatokkal rendelkező stúdiók ellenállását.']),
                    'quotes' => [$L(['sk' => 'Za týchto podmienok zostávam.', 'en' => 'On those terms I am staying.', 'hu' => 'Ilyen feltételekkel maradok.'])]],
            ],
            'tippingPoints' => [
                ['round' => 3,
                    'description' => $L(['sk' => 'Potvrdenie starých cien pre rozbehnuté projekty preklopilo Zuzanu Kráľovú (kuchynské štúdio).', 'en' => 'Confirming old prices for running projects won over Zuzana Kráľová (kitchen studio).', 'hu' => 'A futó projektek régi árának megerősítése meggyőzte Zuzana Kráľovát (konyhastúdió).']),
                    'impact' => $L(['sk' => 'Segment štúdií prešiel z odporu do podpory.', 'en' => 'The studio segment moved from opposition to support.', 'hu' => 'A stúdiószegmens ellenállásból támogatásba fordult.'])],
            ],
            'whatWouldChangeOutcome' => [
                $L(['sk' => 'Bez prechodného obdobia by štúdiá presunuli odhadom 30 % zákaziek ku konkurencii.', 'en' => 'Without a transition period, studios would move an estimated 30 % of jobs to the rival.', 'hu' => 'Átmeneti időszak nélkül a stúdiók becslés szerint a munkák 30 %-át a versenytárshoz vinnék.']),
                $L(['sk' => 'Ak by garancia termínu neplatila pri meškaní dodávateľa, veľkoobchodný partner by SLA nepodpísal.', 'en' => 'If the date guarantee did not cover supplier delays, the wholesale partner would not sign the SLA.', 'hu' => 'Ha a határidő-garancia nem vonatkozna a beszállítói késésre, a nagykereskedelmi partner nem írná alá az SLA-t.']),
            ],
            'actionableRecommendations' => [
                $L(['sk' => 'Pred oznámením osobne zavolať 10 najväčším štúdiám a potvrdiť staré ceny do konca štvrťroka.', 'en' => 'Call the 10 largest studios personally before the announcement and confirm old prices until the end of the quarter.', 'hu' => 'A bejelentés előtt személyesen hívja fel a 10 legnagyobb stúdiót, és erősítse meg a régi árakat a negyedév végéig.']),
                $L(['sk' => 'Do SLA s Müller Naturstein zapísať výnimku 15 dní pre Statuario.', 'en' => 'Write the 15-day Statuario exception into the Müller Naturstein SLA.', 'hu' => 'Írja be a 15 napos Statuario-kivételt a Müller Naturstein SLA-ba.']),
                $L(['sk' => 'Udržiavať skladovú rezervu 6 dosiek najžiadanejších dekorov proti meškaniu z Fiorana.', 'en' => 'Keep a 6-slab buffer of the best-selling designs against Fiorano delays.', 'hu' => 'Tartson 6 lapos tartalékot a legkelendőbb dekorokból a fioranói késések ellen.']),
            ],
        ],
        'sections' => [
            ['title' => $L(['sk' => '1. Konsenzus a polarizácia trhu', 'en' => '1. Consensus and market polarisation', 'hu' => '1. Konszenzus és piaci polarizáció']),
                'content' => $L([
                    'sk' => "Oznámenie rozdelilo trh na **sprostredkovateľov** (kuchynské štúdiá), ktorí musia cenu obhájiť, a **koncových zákazníkov**, ktorí hodnotia riziko.\n\n- **Sentiment** stúpol z **-0,24** v 1. kole na **+0,46** v 3. kole.\n- **Prechodné obdobie** odstránilo hlavnú námietku štúdií.\n- **Developer** potvrdil, že pri 40 bytoch vychádza drahšia ponuka so zárukou lacnejšie než lacná dielňa.",
                    'en' => "The announcement split the market into **intermediaries** (kitchen studios), who must defend the price, and **end customers**, who weigh the risk.\n\n- **Sentiment** rose from **-0.24** in round 1 to **+0.46** in round 3.\n- The **transition period** removed the studios' main objection.\n- A **developer** confirmed that across 40 flats the dearer offer with warranty beats the cheap workshop.",
                    'hu' => "A bejelentés két részre osztotta a piacot: a **közvetítőkre** (konyhastúdiók), akiknek meg kell védeniük az árat, és a **végső ügyfelekre**, akik a kockázatot mérlegelik.\n\n- A **hangulat** az 1. kör **-0,24**-es értékéről a 3. körre **+0,46**-ra nőtt.\n- Az **átmeneti időszak** megszüntette a stúdiók fő kifogását.\n- Egy **fejlesztő** megerősítette, hogy 40 lakásnál a drágább, garanciás ajánlat olcsóbb az olcsó műhelynél.",
                ])],
            ['title' => $L(['sk' => '2. Zraniteľnosti a hlavné námietky', 'en' => '2. Vulnerabilities and main objections', 'hu' => '2. Sebezhetőségek és fő kifogások']),
                'content' => $L([
                    'sk' => "1. **Termín pri meškaní dodávateľa** (*Thomas Müller*): garancia 10 pracovných dní musí platiť aj vtedy, keď Fiorano mešká.\n2. **Rozbehnuté ponuky** (*Zuzana Kráľová*): štúdiá nemôžu meniť ceny, ktoré už klientom poslali.",
                    'en' => "1. **Dates when the supplier is late** (*Thomas Müller*): the 10-working-day guarantee must hold even when Fiorano is late.\n2. **Quotes already sent** (*Zuzana Kráľová*): studios cannot change prices they have already sent to clients.",
                    'hu' => "1. **Határidő beszállítói késésnél** (*Thomas Müller*): a 10 munkanapos garanciának akkor is érvényesnek kell lennie, ha Fiorano késik.\n2. **Már kiküldött ajánlatok** (*Zuzana Kráľová*): a stúdiók nem módosíthatják az ügyfeleknek már elküldött árakat.",
                ])],
            ['title' => $L(['sk' => '3. Protistratégia konkurencie', 'en' => '3. The rival\'s counter-strategy', 'hu' => '3. A versenytárs ellenstratégiája']),
                'content' => $L([
                    'sk' => "Nízkonákladová dielňa ponúkla štúdiám 5 % províziu a cenu o 15 % nižšiu. Útok zlyhal, keď zákazníci zdieľali skúsenosti s nepresnými výrezmi pri zameraní šablónou.",
                    'en' => "The low-cost workshop offered studios a 5 % commission and a price 15 % lower. The attack failed once customers shared experiences of inaccurate cut-outs from template-based measuring.",
                    'hu' => "A fapados műhely 5 % jutalékot és 15 %-kal alacsonyabb árat kínált a stúdióknak. A támadás kudarcot vallott, amikor az ügyfelek megosztották tapasztalataikat a sablonos mérésből eredő pontatlan kivágásokról.",
                ])],
            ['title' => $L(['sk' => '4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?', 'en' => '4. 🎯 WHICH STRATEGY REACHES THE GOAL?', 'hu' => '4. 🎯 MELYIK STRATÉGIA VEZET CÉLHOZ?']),
                'content' => $L(['sk' => 'Na zavedenie zdraženia bez straty štúdií postupujte takto:', 'en' => 'To introduce the rise without losing studios, follow this sequence:', 'hu' => 'Az áremelés stúdiók elvesztése nélküli bevezetéséhez kövesse ezt a sorrendet:'])],
        ],
        'strategicPlaybook' => [
            'keyVulnerabilities' => [
                $L(['sk' => 'Garancia termínu nepokrýva meškanie dodávateľa.', 'en' => 'The date guarantee does not cover supplier delays.', 'hu' => 'A határidő-garancia nem fedi a beszállítói késést.']),
                $L(['sk' => 'Štúdiá s rozbehnutými ponukami bez prechodného obdobia.', 'en' => 'Studios with quotes already out and no transition period.', 'hu' => 'Kiküldött ajánlatokkal rendelkező stúdiók átmeneti időszak nélkül.']),
                $L(['sk' => 'Provízia konkurencie pre štúdiá.', 'en' => 'The rival\'s commission for studios.', 'hu' => 'A versenytárs jutaléka a stúdióknak.']),
            ],
            'actionableCounterMeasures' => [
                $L(['sk' => 'Skladová rezerva 6 dosiek najžiadanejších dekorov.', 'en' => 'A 6-slab stock buffer of the best-selling designs.', 'hu' => '6 lapos raktári tartalék a legkelendőbb dekorokból.']),
                $L(['sk' => 'Partnerský program pre štúdiá: prednostné termíny zamerania namiesto provízie.', 'en' => 'A partner programme for studios: priority templating slots instead of commission.', 'hu' => 'Partnerprogram a stúdióknak: elsőbbségi felmérési időpontok jutalék helyett.']),
                $L(['sk' => 'Zverejniť porovnanie: zameranie Prolinerom vs. šablóna, s fotkami reklamácií.', 'en' => 'Publish a comparison: Proliner templating vs. template, with complaint photos.', 'hu' => 'Tegyen közzé összehasonlítást: Proliner felmérés vs. sablon, reklamációs fotókkal.']),
            ],
            'salesObjectionPlaybook' => [
                ['objection' => $L(['sk' => 'Konkurencia je o 15 % lacnejšia.', 'en' => 'The competition is 15 % cheaper.', 'hu' => 'A versenytárs 15 %-kal olcsóbb.']),
                    'rebuttal' => $L(['sk' => 'Jedna reklamácia výrezu stojí deň montáže a posunuté odovzdanie. Naša 10-ročná záruka a laserové zameranie tieto náklady odstraňujú.', 'en' => 'One cut-out complaint costs an installation day and a delayed handover. Our 10-year warranty and laser templating remove that cost.', 'hu' => 'Egyetlen kivágási reklamáció egy szerelési napba és késleltetett átadásba kerül. 10 éves garanciánk és lézeres felmérésünk ezt a költséget megszünteti.'])],
                ['objection' => $L(['sk' => 'Klientom som už poslal ponuku so starou cenou.', 'en' => 'I have already sent my client a quote at the old price.', 'hu' => 'Az ügyfelemnek már elküldtem az ajánlatot a régi áron.']),
                    'rebuttal' => $L(['sk' => 'Všetky rozbehnuté projekty dodáme za staré ceny do konca štvrťroka.', 'en' => 'Every running project is delivered at the old prices until the end of the quarter.', 'hu' => 'Minden futó projektet a negyedév végéig a régi áron szállítunk.'])],
                ['objection' => $L(['sk' => 'Čo ak dodávateľ z Talianska zase mešká?', 'en' => 'What if the Italian supplier is late again?', 'hu' => 'Mi van, ha az olasz beszállító megint késik?']),
                    'rebuttal' => $L(['sk' => 'Pre najžiadanejšie dekory držíme skladovú rezervu a termín garantujeme zmluvne; výnimky (Statuario) uvádzame vopred.', 'en' => 'We hold stock of the best-selling designs and guarantee the date by contract; exceptions (Statuario) are stated up front.', 'hu' => 'A legkelendőbb dekorokból raktárkészletet tartunk, és a határidőt szerződésben garantáljuk; a kivételeket (Statuario) előre jelezzük.'])],
            ],
            'recommendedGtmSequence' => [
                $L(['sk' => '1. deň: osobné hovory s 10 najväčšími štúdiami a potvrdenie starých cien.', 'en' => 'Day 1: personal calls to the 10 largest studios, confirming old prices.', 'hu' => '1. nap: személyes hívások a 10 legnagyobb stúdiónak, a régi árak megerősítése.']),
                $L(['sk' => '7. deň: podpis SLA s Müller Naturstein vrátane výnimky pre Statuario.', 'en' => 'Day 7: sign the SLA with Müller Naturstein, including the Statuario exception.', 'hu' => '7. nap: az SLA aláírása a Müller Natursteinnel, a Statuario-kivétellel együtt.']),
                $L(['sk' => '14. deň: nový cenník s 3D zameraním a 10-ročnou zárukou na webe a v showroome.', 'en' => 'Day 14: new price list with 3D templating and the 10-year warranty on the website and in the showroom.', 'hu' => '14. nap: új árlista 3D felméréssel és 10 éves garanciával a weboldalon és a bemutatóteremben.']),
                $L(['sk' => '30. deň: kampaň „presnosť na milimeter" pre architektov.', 'en' => 'Day 30: "precision to the millimetre" campaign for architects.', 'hu' => '30. nap: „milliméteres pontosság" kampány építészeknek.']),
            ],
        ],
    ];

    return [
        'title' => $L(['sk' => 'Zdraženie kremenných dosiek o 8 % so zárukou a 3D zameraním', 'en' => '8 % quartz worktop price rise with warranty and 3D templating', 'hu' => '8 %-os kvarc munkalap-áremelés garanciával és 3D felméréssel']),
        'hypothesis' => $L(['sk' => 'Čo ak zdražíme kremenné pracovné dosky o 8 %, ale pridáme bezplatné 3D laserové zameranie, montáž do 10 pracovných dní a 10-ročnú záruku na hrany a výrezy, pričom štúdiám necháme staré ceny do konca štvrťroka?', 'en' => 'What if we raise quartz worktop prices by 8 % but add free 3D laser templating, installation within 10 working days and a 10-year warranty on edges and cut-outs, while keeping old prices for studios until the end of the quarter?', 'hu' => 'Mi lenne, ha 8 %-kal emelnénk a kvarc munkalapok árát, de ingyenes 3D lézeres felmérést, 10 munkanapon belüli szerelést és 10 éves garanciát adnánk az élekre és kivágásokra, a stúdióknak pedig a negyedév végéig meghagynánk a régi árakat?']),
        'seed' => $L(['sk' => 'Nový cenník kremenných dosiek: +8 %. V cene: 3D laserové zameranie (Proliner), montáž do 10 pracovných dní od zamerania, 10-ročná záruka na hrany a výrezy. Rozbehnuté projekty štúdií za staré ceny do konca štvrťroka.', 'en' => 'New quartz worktop price list: +8 %. Included: 3D laser templating (Proliner), installation within 10 working days of templating, 10-year warranty on edges and cut-outs. Studios\' running projects at old prices until the end of the quarter.', 'hu' => 'Új kvarc munkalap-árlista: +8 %. Az árban: 3D lézeres felmérés (Proliner), szerelés a felméréstől számított 10 munkanapon belül, 10 éves garancia az élekre és kivágásokra. A stúdiók futó projektjei a negyedév végéig a régi áron.']),
        'graph' => $graph,
        'agents' => $agents,
        'posts' => $posts,
        'metrics' => $metrics,
        'report' => $report,
    ];
}
