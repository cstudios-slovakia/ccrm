<?php
/**
 * Demo seed module: workflows.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('workflows', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * This file is also the single implementation behind
 * scripts/seed_demo_workflows.php: the CLI script requires it and calls
 * demo_workflows_definitions() / demo_workflows_write().
 *
 * Seven readable examples for Automations & Workflows — two simple, two
 * medium, three complex — touching every node type the builder has (trigger
 * with filters, condition with both branches, AI agent, and the actions create
 * lead / create client / create task / send e-mail / convert lead to project).
 * Lead states, sources and users are read from this instance, so the demos
 * point at states that actually exist here.
 *
 * Active by default only where a run needs nothing external. The ones that
 * send e-mail or call an AI provider are seeded switched off: a demo install
 * has neither SMTP nor an AI key, and an active workflow would log a failed
 * run every time somebody moves a lead.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

if (!function_exists('demo_workflows_definitions')) {

    /** Horizontal step between two chained nodes (cards are 320 px wide). */
    function demo_wf_col(int $index): int {
        return 100 + ($index * 400);
    }

    function demo_wf_node(string $id, string $type, string $name, array $data, int $x, int $y): array {
        return ['id' => $id, 'type' => $type, 'name' => $name, 'data' => $data, 'x' => $x, 'y' => $y];
    }

    /** $handle is 'true' / 'false' on a condition node, null everywhere else. */
    function demo_wf_edge(string $source, string $target, ?string $handle = null): array {
        return [
            'id' => 'edge-' . $source . '-' . $target . ($handle ? '-' . $handle : ''),
            'source' => $source,
            'target' => $target,
            'sourceHandle' => $handle,
        ];
    }

    /**
     * The seven demo workflows in the given language ('sk' | 'en' | 'hu').
     * Each entry: id, name, description, trigger_type, trigger_config, nodes, edges, active (default on/off).
     */
    function demo_workflows_definitions(PDO $pdo, string $lang): array {
        $T = static fn(array $byLang): string => demo_t($byLang, $lang);
        $col = 'demo_wf_col';
        $node = 'demo_wf_node';
        $edge = 'demo_wf_edge';
        $nl = "\n";

        $states = demo_lead_states($pdo);
        $stateNew = $states['new'];
        $stateOffer = $states['offer'];
        $stateWon = $states['won'];
        $sources = demo_lead_sources($pdo);
        $sourceWeb = demo_pick($sources, ['web', 'stránk', 'weboldal'], -1);

        // Whoever gets the internal notifications: an admin if there is one.
        $manager = ['name' => 'Admin', 'email' => 'admin@example.com'];
        try {
            $row = $pdo->query("SELECT `name`, `email` FROM `users` ORDER BY (`role` IN ('admin', 'Admin')) DESC, `id` ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['name'])) {
                $manager = ['name' => $row['name'], 'email' => $row['email'] ?: $manager['email']];
            }
        } catch (\Throwable $e) {
            // keep the placeholder; the operator can edit the node.
        }

        // The project type the "convert" step creates: the demo type if it exists, else any.
        $projectTypeId = demo_id('projects', 0);
        if (!demo_row_exists($pdo, 'project_types', $projectTypeId)) {
            $fallback = $pdo->query("SELECT `id` FROM `project_types` ORDER BY `created_at` ASC LIMIT 1")->fetchColumn();
            $projectTypeId = $fallback ?: '';
        }

        // Language for AI-written text.
        $aiLang = ['sk' => 'Slovak', 'en' => 'English', 'hu' => 'Hungarian'][$lang] ?? 'English';
        $wf = [];

        // --- 1. Simple: welcome e-mail for a web lead -------------------------------------
        $wf[] = [
            'id' => demo_id('workflows', 1), 'active' => 0,
            'name' => $T(['en' => 'Welcome e-mail for a web lead', 'sk' => 'Uvítací e-mail pre lead z webu', 'hu' => 'Üdvözlő e-mail weboldalról érkezett leadnek']),
            'description' => $T([
                'en' => 'Simple. A lead arrives from the website and immediately gets a confirmation e-mail with the name of the person who will call. Trigger filter on the lead source + one Send e-mail action.',
                'sk' => 'Jednoduché. Lead príde z webu a hneď dostane potvrdzujúci e-mail s menom osoby, ktorá mu zavolá. Filter triggera na zdroj leadu + jedna akcia Odoslať e-mail.',
                'hu' => 'Egyszerű. A weboldalról érkező lead azonnal megerősítő e-mailt kap annak nevével, aki felhívja. Trigger-szűrő a lead forrására + egy E-mail küldése művelet.',
            ]),
            'trigger_type' => 'lead_created', 'trigger_config' => ['leadSource' => $sourceWeb],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'New lead from ', 'sk' => 'Nový lead z ', 'hu' => 'Új lead innen: ']) . $sourceWeb, ['type' => 'lead_created'], $col(0), 140),
                $node('node-welcome-mail', 'action', $T(['en' => 'Send the welcome e-mail', 'sk' => 'Odoslať uvítací e-mail', 'hu' => 'Üdvözlő e-mail küldése']), [
                    'type' => 'send_email',
                    'to' => '{{$trigger.email}}',
                    'subject' => $T(['en' => 'Thank you for your enquiry, {{$trigger.name}}', 'sk' => 'Ďakujeme za váš dopyt, {{$trigger.name}}', 'hu' => 'Köszönjük az érdeklődését, {{$trigger.name}}']),
                    'body' => $T([
                        'en' => '<p>Hello {{$trigger.name}},</p><p>thank you for contacting us. Your enquiry is in our system and <b>{{$trigger.owner}}</b> will get back to you within one working day.</p><p>This is what we received:</p><ul><li>City: {{$trigger.city}}</li><li>Phone: {{$trigger.phone}}</li><li>Source: {{$trigger.source}}</li></ul><p>Kind regards,<br>The sales team</p>',
                        'sk' => '<p>Dobrý deň {{$trigger.name}},</p><p>ďakujeme, že ste nás kontaktovali. Váš dopyt je v našom systéme a <b>{{$trigger.owner}}</b> sa vám ozve do jedného pracovného dňa.</p><p>Toto sme od vás dostali:</p><ul><li>Mesto: {{$trigger.city}}</li><li>Telefón: {{$trigger.phone}}</li><li>Zdroj: {{$trigger.source}}</li></ul><p>S pozdravom,<br>Obchodný tím</p>',
                        'hu' => '<p>Tisztelt {{$trigger.name}}!</p><p>Köszönjük, hogy felkereste cégünket. Az érdeklődése rendszerünkben van, és <b>{{$trigger.owner}}</b> egy munkanapon belül jelentkezik.</p><p>Ezt kaptuk Öntől:</p><ul><li>Város: {{$trigger.city}}</li><li>Telefon: {{$trigger.phone}}</li><li>Forrás: {{$trigger.source}}</li></ul><p>Üdvözlettel,<br>Az értékesítési csapat</p>',
                    ]),
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-welcome-mail')],
        ];

        // --- 2. Simple: follow-up task after the offer went out -----------------------------
        $wf[] = [
            'id' => demo_id('workflows', 2), 'active' => 1,
            'name' => $T(['en' => 'Follow up after an offer is sent', 'sk' => 'Doťahovanie po odoslaní ponuky', 'hu' => 'Utánkövetés az ajánlat elküldése után']),
            'description' => $T([
                'en' => 'Simple. The moment a lead is moved to "' . $stateOffer . '", a follow-up task with a deadline and a time is opened for its owner. Trigger filter on the status change + one Create task action.',
                'sk' => 'Jednoduché. Keď sa lead presunie do stavu „' . $stateOffer . '“, jeho vlastníkovi sa otvorí úloha na doťahovanie s termínom a časom. Filter triggera na zmenu stavu + jedna akcia Vytvoriť úlohu.',
                'hu' => 'Egyszerű. Amint egy lead „' . $stateOffer . '” állapotba kerül, a tulajdonosának megnyílik egy utánkövetési feladat határidővel és időponttal. Trigger-szűrő az állapotváltásra + egy Feladat létrehozása művelet.',
            ]),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateOffer],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Lead moved to "', 'sk' => 'Lead presunutý do „', 'hu' => 'A lead állapota: „']) . $stateOffer . $T(['en' => '"', 'sk' => '“', 'hu' => '”']), ['type' => 'lead_status_changed'], $col(0), 140),
                $node('node-followup-task', 'action', $T(['en' => 'Open the follow-up task', 'sk' => 'Otvoriť úlohu na doťahovanie', 'hu' => 'Utánkövetési feladat megnyitása']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Follow up on the offer for {{$trigger.name}}', 'sk' => 'Doťahnuť ponuku pre {{$trigger.name}}', 'hu' => 'Az ajánlat követése: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'The lead moved from "{{$trigger.oldStatus}}" to "{{$trigger.newStatus}}".' . $nl . $nl . 'Value: {{$trigger.value}} EUR' . $nl . 'City: {{$trigger.city}}' . $nl . 'Phone: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Call the client, confirm the offer arrived and write the answer into the timeline.',
                        'sk' => 'Lead sa presunul zo stavu „{{$trigger.oldStatus}}“ do „{{$trigger.newStatus}}“.' . $nl . $nl . 'Hodnota: {{$trigger.value}} EUR' . $nl . 'Mesto: {{$trigger.city}}' . $nl . 'Telefón: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Zavolať klientovi, potvrdiť doručenie ponuky a odpoveď zapísať do časovej osi.',
                        'hu' => 'A lead „{{$trigger.oldStatus}}” állapotból „{{$trigger.newStatus}}” állapotba került.' . $nl . $nl . 'Érték: {{$trigger.value}} EUR' . $nl . 'Város: {{$trigger.city}}' . $nl . 'Telefon: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Hívd fel az ügyfelet, erősítsd meg, hogy az ajánlat megérkezett, és rögzítsd a választ az idővonalon.',
                    ]),
                    'priority' => 'high', 'deadline_days' => 3, 'deadline_time' => '09:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-followup-task')],
        ];

        // --- 3. Medium: manual button that logs a phone enquiry ------------------------------
        $wf[] = [
            'id' => demo_id('workflows', 3), 'active' => 1,
            'name' => $T(['en' => 'Log a phone enquiry (manual button)', 'sk' => 'Zaznamenať telefonický dopyt (tlačidlo)', 'hu' => 'Telefonos érdeklődés rögzítése (gomb)']),
            'description' => $T([
                'en' => 'Medium. A styled button in the header toolbar creates an empty lead, opens a task to qualify it and notifies ' . $manager['name'] . ' by e-mail. Shows the manual trigger with its own colour, style and icon, plus two actions branching out of one node.',
                'sk' => 'Stredne zložité. Štylizované tlačidlo v hlavičke vytvorí prázdny lead, otvorí úlohu na jeho kvalifikáciu a e-mailom upozorní používateľa ' . $manager['name'] . '. Ukazuje manuálny trigger s vlastnou farbou, štýlom a ikonou a dve akcie vetviace sa z jedného uzla.',
                'hu' => 'Közepes. A fejléc eszköztárában lévő gomb üres leadet hoz létre, feladatot nyit a minősítésére, és e-mailben értesíti: ' . $manager['name'] . '. Bemutatja a kézi triggert saját színnel, stílussal és ikonnal, valamint két műveletet, amelyek egy csomópontból ágaznak szét.',
            ]),
            'trigger_type' => 'manual', 'trigger_config' => ['buttonColor' => '#0f766e', 'buttonStyle' => 'full', 'buttonIcon' => 'Phone'],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Manual button in the header', 'sk' => 'Manuálne tlačidlo v hlavičke', 'hu' => 'Kézi gomb a fejlécben']), ['type' => 'manual'], $col(0), 300),
                $node('node-create-lead', 'action', $T(['en' => 'Create the placeholder lead', 'sk' => 'Vytvoriť zástupný lead', 'hu' => 'Helyőrző lead létrehozása']), [
                    'type' => 'create_lead', 'name' => $T(['en' => 'New phone enquiry', 'sk' => 'Nový telefonický dopyt', 'hu' => 'Új telefonos érdeklődés']),
                    'city' => '', 'status' => $stateNew, 'owner' => $manager['name'], 'value' => '0',
                ], $col(1), 140),
                $node('node-qualify-task', 'action', $T(['en' => 'Task: qualify the enquiry', 'sk' => 'Úloha: kvalifikovať dopyt', 'hu' => 'Feladat: az érdeklődés minősítése']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Qualify the new phone enquiry', 'sk' => 'Kvalifikovať nový telefonický dopyt', 'hu' => 'Az új telefonos érdeklődés minősítése']),
                    'description' => $T([
                        'en' => 'Logged from the header button by {{$trigger.triggered_by}}.' . $nl . $nl . 'New lead record: {{$input.name}} (ID {{$input.id}}), status {{$input.status}}.' . $nl . $nl . 'Call back, fill in the name, the company details and the contacts, then move the lead forward.',
                        'sk' => 'Zaznamenané tlačidlom v hlavičke používateľom {{$trigger.triggered_by}}.' . $nl . $nl . 'Nový záznam leadu: {{$input.name}} (ID {{$input.id}}), stav {{$input.status}}.' . $nl . $nl . 'Zavolať späť, doplniť meno, firemné údaje a kontakty a posunúť lead ďalej.',
                        'hu' => 'A fejléc gombjával rögzítette: {{$trigger.triggered_by}}.' . $nl . $nl . 'Új lead: {{$input.name}} (ID {{$input.id}}), állapot: {{$input.status}}.' . $nl . $nl . 'Hívd vissza, töltsd ki a nevet, a cégadatokat és a kapcsolatokat, majd vidd tovább a leadet.',
                    ]),
                    'priority' => 'high', 'deadline_days' => 1, 'deadline_time' => '08:30', 'owner' => $manager['name'],
                ], $col(2), 140),
                $node('node-notify-mail', 'action', $T(['en' => 'Notify the account manager', 'sk' => 'Upozorniť account manažéra', 'hu' => 'Ügyfélmenedzser értesítése']), [
                    'type' => 'send_email', 'to' => $manager['email'],
                    'subject' => $T(['en' => 'New phone enquiry logged in the CRM', 'sk' => 'Nový telefonický dopyt zaznamenaný v CRM', 'hu' => 'Új telefonos érdeklődés a CRM-ben']),
                    'body' => $T([
                        'en' => '<p>{{$trigger.triggered_by}} logged a new phone enquiry from the header button.</p><p>Lead ID: <b>{{$input.id}}</b><br>Status: {{$input.status}}</p><p>Open the CRM and qualify it.</p>',
                        'sk' => '<p>{{$trigger.triggered_by}} zaznamenal nový telefonický dopyt tlačidlom v hlavičke.</p><p>ID leadu: <b>{{$input.id}}</b><br>Stav: {{$input.status}}</p><p>Otvorte CRM a kvalifikujte ho.</p>',
                        'hu' => '<p>{{$trigger.triggered_by}} új telefonos érdeklődést rögzített a fejléc gombjával.</p><p>Lead azonosító: <b>{{$input.id}}</b><br>Állapot: {{$input.status}}</p><p>Nyissa meg a CRM-et és minősítse.</p>',
                    ]),
                ], $col(2), 620),
            ],
            'edges' => [
                $edge('node-trigger', 'node-create-lead'),
                $edge('node-create-lead', 'node-qualify-task'),
                $edge('node-create-lead', 'node-notify-mail'),
            ],
        ];

        // --- 4. Complex: AI triage of every incoming lead -------------------------------------
        $wf[] = [
            'id' => demo_id('workflows', 4), 'active' => 0,
            'name' => $T(['en' => 'AI triage of a new lead', 'sk' => 'AI triedenie nového leadu', 'hu' => 'Új lead AI-alapú osztályozása']),
            'description' => $T([
                'en' => 'Complex. Every new lead is split by type and value. Bigger business leads get an AI qualification note that lands both in a high-priority task and in an e-mail to ' . $manager['name'] . '; everything else goes to the nurture list. Shows a condition with both branches, an AI agent and its {{$ai.result}} output. Needs an AI key and SMTP.',
                'sk' => 'Zložité. Každý nový lead sa rozdelí podľa typu a hodnoty. Väčšie firemné leady dostanú AI kvalifikačnú poznámku, ktorá skončí v úlohe s vysokou prioritou aj v e-maile pre ' . $manager['name'] . '; ostatné idú do zoznamu na rozvíjanie. Ukazuje podmienku s oboma vetvami, AI agenta a jeho výstup {{$ai.result}}. Vyžaduje AI kľúč a SMTP.',
                'hu' => 'Összetett. Minden új lead típus és érték szerint szétválik. A nagyobb céges leadek AI minősítő jegyzetet kapnak, amely egy magas prioritású feladatba és egy e-mailbe kerül (' . $manager['name'] . '); a többi az ápolási listára megy. Bemutat egy kétágú feltételt, egy AI-ügynököt és annak {{$ai.result}} kimenetét. AI-kulcsot és SMTP-t igényel.',
            ]),
            'trigger_type' => 'lead_created', 'trigger_config' => [],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Any new lead', 'sk' => 'Akýkoľvek nový lead', 'hu' => 'Bármely új lead']), ['type' => 'lead_created'], $col(0), 340),
                $node('node-value-check', 'condition', $T(['en' => 'Business lead over 2 000 EUR?', 'sk' => 'Firemný lead nad 2 000 EUR?', 'hu' => 'Céges lead 2 000 EUR felett?']), [
                    'js_code' => 'return $trigger.clientType !== "person" && $trigger.value >= 2000;',
                ], $col(1), 340),
                $node('node-ai-note', 'ai_agent', $T(['en' => 'AI qualification note', 'sk' => 'AI kvalifikačná poznámka', 'hu' => 'AI minősítő jegyzet']), [
                    'provider' => 'gemini',
                    'prompt' => 'You are a CRM assistant for a stone countertop fabricator. Write a short qualification note (max 4 sentences) in ' . $aiLang . ' for the sales team about this new lead.' . $nl . $nl
                        . 'Name: {{$trigger.name}}' . $nl . 'Type: {{$trigger.clientType}}' . $nl . 'City: {{$trigger.city}}' . $nl
                        . 'Estimated value: {{$trigger.value}} EUR' . $nl . 'Source: {{$trigger.source}}' . $nl . 'Company ID: {{$trigger.companyId}}' . $nl . $nl
                        . 'Say what to ask on the first call and what the main risk is. Plain text, no markdown.',
                ], $col(2), 140),
                $node('node-hot-task', 'action', $T(['en' => 'Task: call the lead today', 'sk' => 'Úloha: dnes zavolať leadu', 'hu' => 'Feladat: a lead felhívása ma']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Qualify {{$trigger.name}} — AI note ready', 'sk' => 'Kvalifikovať {{$trigger.name}} — AI poznámka pripravená', 'hu' => '{{$trigger.name}} minősítése — az AI jegyzet kész']),
                    'description' => '{{$ai.result}}' . $nl . $nl . '---' . $nl . $T(['en' => 'Value: {{$trigger.value}} EUR · City: {{$trigger.city}} · Source: {{$trigger.source}}', 'sk' => 'Hodnota: {{$trigger.value}} EUR · Mesto: {{$trigger.city}} · Zdroj: {{$trigger.source}}', 'hu' => 'Érték: {{$trigger.value}} EUR · Város: {{$trigger.city}} · Forrás: {{$trigger.source}}']),
                    'priority' => 'high', 'deadline_days' => 1, 'deadline_time' => '10:00', 'owner' => '{{$trigger.owner}}',
                ], $col(3), 140),
                $node('node-hot-mail', 'action', $T(['en' => 'E-mail the AI note to the manager', 'sk' => 'Poslať AI poznámku manažérovi e-mailom', 'hu' => 'AI jegyzet e-mailben a vezetőnek']), [
                    'type' => 'send_email', 'to' => $manager['email'],
                    'subject' => 'AI triage: {{$trigger.name}} ({{$trigger.value}} EUR)',
                    'body' => $T([
                        'en' => '<p>A new business lead came in from <b>{{$trigger.source}}</b>.</p><p><b>AI note:</b></p><p>{{$ai.summary}}</p><p>Owner: {{$trigger.owner}} · City: {{$trigger.city}} · Phone: {{$trigger.phone}}</p>',
                        'sk' => '<p>Nový firemný lead prišiel zo zdroja <b>{{$trigger.source}}</b>.</p><p><b>AI poznámka:</b></p><p>{{$ai.summary}}</p><p>Vlastník: {{$trigger.owner}} · Mesto: {{$trigger.city}} · Telefón: {{$trigger.phone}}</p>',
                        'hu' => '<p>Új céges lead érkezett innen: <b>{{$trigger.source}}</b>.</p><p><b>AI jegyzet:</b></p><p>{{$ai.summary}}</p><p>Tulajdonos: {{$trigger.owner}} · Város: {{$trigger.city}} · Telefon: {{$trigger.phone}}</p>',
                    ]),
                ], $col(3), 620),
                $node('node-nurture-task', 'action', $T(['en' => 'Task: nurture list', 'sk' => 'Úloha: zoznam na rozvíjanie', 'hu' => 'Feladat: ápolási lista']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Send the info pack to {{$trigger.name}}', 'sk' => 'Poslať informačný balík pre {{$trigger.name}}', 'hu' => 'Tájékoztató csomag küldése: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'Smaller or private enquiry ({{$trigger.value}} EUR, {{$trigger.clientType}}).' . $nl . $nl . 'Send the standard info pack and check back in a week.' . $nl . 'E-mail: {{$trigger.email}} · Phone: {{$trigger.phone}}',
                        'sk' => 'Menší alebo súkromný dopyt ({{$trigger.value}} EUR, {{$trigger.clientType}}).' . $nl . $nl . 'Poslať štandardný informačný balík a o týždeň sa ozvať.' . $nl . 'E-mail: {{$trigger.email}} · Telefón: {{$trigger.phone}}',
                        'hu' => 'Kisebb vagy magán érdeklődés ({{$trigger.value}} EUR, {{$trigger.clientType}}).' . $nl . $nl . 'Küldd el a szokásos tájékoztató csomagot, és egy hét múlva érdeklődj.' . $nl . 'E-mail: {{$trigger.email}} · Telefon: {{$trigger.phone}}',
                    ]),
                    'priority' => 'low', 'deadline_days' => 7, 'deadline_time' => '14:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 780),
            ],
            'edges' => [
                $edge('node-trigger', 'node-value-check'),
                $edge('node-value-check', 'node-ai-note', 'true'),
                $edge('node-ai-note', 'node-hot-task'),
                $edge('node-ai-note', 'node-hot-mail'),
                $edge('node-value-check', 'node-nurture-task', 'false'),
            ],
        ];

        // --- 5. Complex: won deal turns into a client and an onboarding chain --------------------
        $wf[] = [
            'id' => demo_id('workflows', 5), 'active' => 0,
            'name' => $T(['en' => 'Won deal → client onboarding', 'sk' => 'Vyhraný obchod → onboarding klienta', 'hu' => 'Megnyert üzlet → ügyfél-bevezetés']),
            'description' => $T([
                'en' => 'Complex. When a lead reaches "' . $stateWon . '" the handover task opens immediately; companies additionally get a full client record, an onboarding task and an AI-written welcome e-mail, while private clients get a personal call instead. Shows a condition, chained actions and an AI agent feeding the last e-mail. Needs an AI key and SMTP.',
                'sk' => 'Zložité. Keď lead dosiahne stav „' . $stateWon . '“, ihneď sa otvorí úloha na odovzdanie; firmy navyše dostanú plný záznam klienta, úlohu na onboarding a uvítací e-mail napísaný AI, súkromní klienti namiesto toho osobný telefonát. Ukazuje podmienku, reťazené akcie a AI agenta, ktorý plní posledný e-mail. Vyžaduje AI kľúč a SMTP.',
                'hu' => 'Összetett. Amikor egy lead „' . $stateWon . '” állapotot ér el, azonnal megnyílik az átadási feladat; a cégek ezen felül teljes ügyfélrekordot, bevezetési feladatot és AI-val írt üdvözlő e-mailt kapnak, a magánügyfelek személyes hívást. Bemutat egy feltételt, láncolt műveleteket és egy AI-ügynököt, amely az utolsó e-mailt tölti. AI-kulcsot és SMTP-t igényel.',
            ]),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateWon],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Lead moved to "', 'sk' => 'Lead presunutý do „', 'hu' => 'A lead állapota: „']) . $stateWon . $T(['en' => '"', 'sk' => '“', 'hu' => '”']), ['type' => 'lead_status_changed'], $col(0), 440),
                $node('node-handover-task', 'action', $T(['en' => 'Task: hand over to production', 'sk' => 'Úloha: odovzdať do výroby', 'hu' => 'Feladat: átadás a gyártásnak']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Hand over the won deal for {{$trigger.name}}', 'sk' => 'Odovzdať vyhraný obchod pre {{$trigger.name}}', 'hu' => 'A megnyert üzlet átadása: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'The deal was won ({{$trigger.oldStatus}} → {{$trigger.newStatus}}).' . $nl . $nl . 'Value: {{$trigger.value}} EUR' . $nl . 'City: {{$trigger.city}}' . $nl . 'Owner: {{$trigger.owner}}' . $nl . $nl . 'File the signed offer and pass the technical details to production.',
                        'sk' => 'Obchod bol vyhraný ({{$trigger.oldStatus}} → {{$trigger.newStatus}}).' . $nl . $nl . 'Hodnota: {{$trigger.value}} EUR' . $nl . 'Mesto: {{$trigger.city}}' . $nl . 'Vlastník: {{$trigger.owner}}' . $nl . $nl . 'Založiť podpísanú ponuku a odovzdať technické detaily výrobe.',
                        'hu' => 'Az üzletet megnyertük ({{$trigger.oldStatus}} → {{$trigger.newStatus}}).' . $nl . $nl . 'Érték: {{$trigger.value}} EUR' . $nl . 'Város: {{$trigger.city}}' . $nl . 'Tulajdonos: {{$trigger.owner}}' . $nl . $nl . 'Iktasd az aláírt ajánlatot, és add át a műszaki részleteket a gyártásnak.',
                    ]),
                    'priority' => 'medium', 'deadline_days' => 2, 'deadline_time' => '11:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 960),
                $node('node-company-check', 'condition', $T(['en' => 'Is it a company?', 'sk' => 'Je to firma?', 'hu' => 'Cégről van szó?']), ['js_code' => 'return $trigger.clientType !== "person";'], $col(1), 440),
                $node('node-create-client', 'action', $T(['en' => 'Create the client record', 'sk' => 'Vytvoriť záznam klienta', 'hu' => 'Ügyfélrekord létrehozása']), [
                    'type' => 'create_client', 'name' => '{{$trigger.name}}', 'client_type' => 'business', 'status' => $stateWon,
                    'email' => '{{$trigger.email}}', 'phone' => '{{$trigger.phone}}', 'street' => '{{$trigger.address.street}}', 'city' => '{{$trigger.city}}',
                    'postal_code' => '{{$trigger.address.postalCode}}', 'country' => '{{$trigger.address.country}}', 'company_id' => '{{$trigger.companyId}}',
                    'tax_id' => '{{$trigger.taxId}}', 'vat_id' => '{{$trigger.vatId}}', 'contact_person' => '{{$trigger.contactPerson}}',
                    'website' => '{{$trigger.website}}', 'owner' => '{{$trigger.owner}}', 'value' => '{{$trigger.value}}',
                ], $col(2), 120),
                $node('node-onboarding-task', 'action', $T(['en' => 'Task: prepare the onboarding pack', 'sk' => 'Úloha: pripraviť onboardingový balík', 'hu' => 'Feladat: bevezetési csomag előkészítése']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Prepare the onboarding pack for {{$trigger.name}}', 'sk' => 'Pripraviť onboardingový balík pre {{$trigger.name}}', 'hu' => 'Bevezetési csomag előkészítése: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'A client record was created from the won lead.' . $nl . $nl . 'Client ID: {{$input.id}}' . $nl . 'Company ID: {{$input.company_id}}' . $nl . 'E-mail: {{$input.email}}' . $nl . $nl . 'Prepare the contract, the schedule and book the kickoff call.',
                        'sk' => 'Z vyhraného leadu vznikol záznam klienta.' . $nl . $nl . 'ID klienta: {{$input.id}}' . $nl . 'IČO: {{$input.company_id}}' . $nl . 'E-mail: {{$input.email}}' . $nl . $nl . 'Pripraviť zmluvu, harmonogram a dohodnúť úvodný hovor.',
                        'hu' => 'A megnyert leadből ügyfélrekord készült.' . $nl . $nl . 'Ügyfélazonosító: {{$input.id}}' . $nl . 'Cégjegyzékszám: {{$input.company_id}}' . $nl . 'E-mail: {{$input.email}}' . $nl . $nl . 'Készítsd elő a szerződést és az ütemtervet, és egyeztess egy indító hívást.',
                    ]),
                    'priority' => 'high', 'deadline_days' => 5, 'deadline_time' => '09:30', 'owner' => '{{$trigger.owner}}',
                ], $col(3), 120),
                $node('node-ai-onboarding', 'ai_agent', $T(['en' => 'AI onboarding e-mail', 'sk' => 'AI onboardingový e-mail', 'hu' => 'AI bevezető e-mail']), [
                    'provider' => 'gemini',
                    'prompt' => 'Write a short onboarding e-mail (max 150 words) in ' . $aiLang . ' to a new client of a stone countertop fabricator.' . $nl . $nl
                        . 'Client: {{$trigger.name}} from {{$trigger.city}}' . $nl . 'Deal value: {{$trigger.value}} EUR' . $nl . 'Account manager: {{$trigger.owner}}' . $nl . $nl
                        . 'Thank them, name the next steps (contract, kickoff call, schedule) and keep it warm but professional. Return plain text only, without a subject line.',
                ], $col(4), 120),
                $node('node-onboarding-mail', 'action', $T(['en' => 'Send the onboarding e-mail', 'sk' => 'Odoslať onboardingový e-mail', 'hu' => 'Bevezető e-mail küldése']), [
                    'type' => 'send_email', 'to' => '{{$trigger.email}}',
                    'subject' => $T(['en' => 'Welcome on board, {{$trigger.name}}', 'sk' => 'Vitajte u nás, {{$trigger.name}}', 'hu' => 'Üdvözöljük, {{$trigger.name}}']),
                    'body' => '<p>{{$ai.result}}</p><p>--<br>{{$trigger.owner}}</p>',
                ], $col(5), 120),
                $node('node-personal-task', 'action', $T(['en' => 'Task: personal onboarding call', 'sk' => 'Úloha: osobný onboardingový telefonát', 'hu' => 'Feladat: személyes bevezető hívás']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Personal onboarding call with {{$trigger.name}}', 'sk' => 'Osobný onboardingový telefonát s {{$trigger.name}}', 'hu' => 'Személyes bevezető hívás: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'Private client — no company record needed.' . $nl . $nl . 'Phone: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . 'Value: {{$trigger.value}} EUR' . $nl . $nl . 'Call them, agree the schedule and confirm it in writing.',
                        'sk' => 'Súkromný klient — záznam firmy netreba.' . $nl . $nl . 'Telefón: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . 'Hodnota: {{$trigger.value}} EUR' . $nl . $nl . 'Zavolať, dohodnúť harmonogram a potvrdiť ho písomne.',
                        'hu' => 'Magánügyfél — cégrekordra nincs szükség.' . $nl . $nl . 'Telefon: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . 'Érték: {{$trigger.value}} EUR' . $nl . $nl . 'Hívd fel, egyeztesd az ütemtervet, és erősítsd meg írásban.',
                    ]),
                    'priority' => 'medium', 'deadline_days' => 3, 'deadline_time' => '13:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 960),
            ],
            // The handover task is wired first on purpose: nodes run breadth-first in
            // edge order, so work that needs no AI key is done before the branch that
            // may stop at the AI agent.
            'edges' => [
                $edge('node-trigger', 'node-handover-task'),
                $edge('node-trigger', 'node-company-check'),
                $edge('node-company-check', 'node-create-client', 'true'),
                $edge('node-create-client', 'node-onboarding-task'),
                $edge('node-onboarding-task', 'node-ai-onboarding'),
                $edge('node-ai-onboarding', 'node-onboarding-mail'),
                $edge('node-company-check', 'node-personal-task', 'false'),
            ],
        ];

        // --- 6. Simple: every new lead gets a call task for its owner -----------------------------
        $wf[] = [
            'id' => demo_id('workflows', 6), 'active' => 1,
            'name' => $T(['en' => 'New lead → task for the owner', 'sk' => 'Nový lead → úloha pre vlastníka', 'hu' => 'Új lead → feladat a tulajdonosnak']),
            'description' => $T([
                'en' => 'Simple. Whenever a lead is created, its owner gets a task to call it back within a day, so no enquiry waits unanswered. One trigger and one Create task action — no filter.',
                'sk' => 'Jednoduché. Pri vytvorení každého leadu dostane jeho vlastník úlohu zavolať späť do jedného dňa, takže žiadny dopyt nezostane bez odpovede. Jeden trigger a jedna akcia Vytvoriť úlohu — bez filtra.',
                'hu' => 'Egyszerű. Minden új lead tulajdonosa feladatot kap, hogy egy napon belül visszahívja, így egy érdeklődés sem marad megválaszolatlanul. Egy trigger és egy Feladat létrehozása művelet — szűrő nélkül.',
            ]),
            'trigger_type' => 'lead_created', 'trigger_config' => [],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Any new lead', 'sk' => 'Akýkoľvek nový lead', 'hu' => 'Bármely új lead']), ['type' => 'lead_created'], $col(0), 140),
                $node('node-call-task', 'action', $T(['en' => 'Task: call the new lead', 'sk' => 'Úloha: zavolať novému leadu', 'hu' => 'Feladat: az új lead felhívása']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Call {{$trigger.name}} within 24 hours', 'sk' => 'Zavolať {{$trigger.name}} do 24 hodín', 'hu' => '{{$trigger.name}} felhívása 24 órán belül']),
                    'description' => $T([
                        'en' => 'New enquiry from {{$trigger.source}}.' . $nl . $nl . 'City: {{$trigger.city}}' . $nl . 'Phone: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Ask what they want to build, the stone they prefer and when the site is ready, then book the laser measurement.',
                        'sk' => 'Nový dopyt zo zdroja {{$trigger.source}}.' . $nl . $nl . 'Mesto: {{$trigger.city}}' . $nl . 'Telefón: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Opýtať sa, čo chcú realizovať, aký kameň preferujú a kedy bude stavba pripravená, potom dohodnúť laserové zameranie.',
                        'hu' => 'Új érdeklődés innen: {{$trigger.source}}.' . $nl . $nl . 'Város: {{$trigger.city}}' . $nl . 'Telefon: {{$trigger.phone}}' . $nl . 'E-mail: {{$trigger.email}}' . $nl . $nl . 'Kérdezd meg, mit szeretnének megvalósítani, melyik követ kedvelik, és mikor lesz kész a helyszín, majd egyeztess lézeres felmérést.',
                    ]),
                    'priority' => 'medium', 'deadline_days' => 1, 'deadline_time' => '10:00', 'owner' => '{{$trigger.owner}}',
                ], $col(1), 140),
            ],
            'edges' => [$edge('node-trigger', 'node-call-task')],
        ];

        // --- 7. Medium: accepted offer opens a project and its kickoff task ------------------------
        // "Offer accepted" is the lead reaching the won state: the accepted offer is what moves it there.
        $wf[] = [
            'id' => demo_id('workflows', 7), 'active' => 1,
            'name' => $T(['en' => 'Offer accepted → project and kickoff task', 'sk' => 'Ponuka prijatá → projekt a úloha na štart', 'hu' => 'Ajánlat elfogadva → projekt és indító feladat']),
            'description' => $T([
                'en' => 'Medium. When a lead reaches "' . $stateWon . '" (its offer was accepted) a project is created and paired with it, managed by the lead\'s owner, and the owner gets a task to plan the kickoff. A lead that already has such a project is left alone.',
                'sk' => 'Stredne zložité. Keď lead dosiahne stav „' . $stateWon . '“ (jeho ponuka bola prijatá), vytvorí sa a spáruje s ním projekt, ktorý riadi vlastník leadu, a vlastník dostane úlohu naplánovať štart. Lead, ktorý už takýto projekt má, sa preskočí.',
                'hu' => 'Közepes. Amikor egy lead „' . $stateWon . '” állapotot ér el (az ajánlatát elfogadták), létrejön egy hozzá párosított projekt, amelyet a lead tulajdonosa vezet, és a tulajdonos feladatot kap az indítás megtervezésére. Az a lead, amelynek már van ilyen projektje, kimarad.',
            ]),
            'trigger_type' => 'lead_status_changed', 'trigger_config' => ['fromStatus' => 'any', 'toStatus' => $stateWon],
            'nodes' => [
                $node('node-trigger', 'trigger', $T(['en' => 'Lead moved to "', 'sk' => 'Lead presunutý do „', 'hu' => 'A lead állapota: „']) . $stateWon . $T(['en' => '"', 'sk' => '“', 'hu' => '”']), ['type' => 'lead_status_changed'], $col(0), 140),
                $node('node-create-project', 'action', $T(['en' => 'Create the project', 'sk' => 'Vytvoriť projekt', 'hu' => 'Projekt létrehozása']), [
                    'type' => 'convert_lead_to_project', 'project_type_id' => $projectTypeId, 'status' => 'new', 'manager' => '', 'skip_if_exists' => true,
                ], $col(1), 140),
                $node('node-kickoff-task', 'action', $T(['en' => 'Task: plan the kickoff', 'sk' => 'Úloha: naplánovať štart', 'hu' => 'Feladat: az indítás megtervezése']), [
                    'type' => 'create_task',
                    'title' => $T(['en' => 'Plan the project kickoff for {{$trigger.name}}', 'sk' => 'Naplánovať štart projektu pre {{$trigger.name}}', 'hu' => 'A projekt indításának megtervezése: {{$trigger.name}}']),
                    'description' => $T([
                        'en' => 'The offer was accepted and project {{$input.project_id}} was created.' . $nl . $nl . 'Book the laser measurement, order the slabs and confirm the production slot with the client.',
                        'sk' => 'Ponuka bola prijatá a vznikol projekt {{$input.project_id}}.' . $nl . $nl . 'Dohodnúť laserové zameranie, objednať dosky a potvrdiť s klientom výrobný termín.',
                        'hu' => 'Az ajánlatot elfogadták, és létrejött a(z) {{$input.project_id}} projekt.' . $nl . $nl . 'Egyeztess lézeres felmérést, rendeld meg a lapokat, és erősítsd meg az ügyféllel a gyártási időpontot.',
                    ]),
                    'priority' => 'high', 'deadline_days' => 2, 'deadline_time' => '09:00', 'owner' => '{{$trigger.owner}}',
                ], $col(2), 140),
            ],
            'edges' => [
                $edge('node-trigger', 'node-create-project'),
                $edge('node-create-project', 'node-kickoff-task'),
            ],
        ];

        return $wf;
    }

    /**
     * Upsert workflows by id. $isActive: 1 / 0 forces every row, null keeps each
     * definition's own 'active' default. Returns the number written.
     */
    function demo_workflows_write(PDO $pdo, array $workflows, ?int $isActive = null): int {
        $stmt = $pdo->prepare(
            "INSERT INTO `workflows` (`id`, `name`, `description`, `trigger_type`, `trigger_config_json`, `nodes_json`, `edges_json`, `is_active`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               `name` = VALUES(`name`), `description` = VALUES(`description`), `trigger_type` = VALUES(`trigger_type`),
               `trigger_config_json` = VALUES(`trigger_config_json`), `nodes_json` = VALUES(`nodes_json`),
               `edges_json` = VALUES(`edges_json`), `is_active` = VALUES(`is_active`)"
        );
        foreach ($workflows as $wf) {
            $stmt->execute([
                $wf['id'], $wf['name'], $wf['description'], $wf['trigger_type'],
                json_encode((object)$wf['trigger_config'], JSON_UNESCAPED_UNICODE),
                json_encode($wf['nodes'], JSON_UNESCAPED_UNICODE),
                json_encode($wf['edges'], JSON_UNESCAPED_UNICODE),
                $isActive ?? (int)$wf['active'],
            ]);
        }
        return count($workflows);
    }
}

function demo_seed_workflows(PDO $pdo): void {
    $pdo->exec("DELETE FROM `workflow_logs` WHERE `workflow_id` LIKE 'demo-workflows-%'");
    $pdo->exec("DELETE FROM `workflow_queue` WHERE `workflow_id` LIKE 'demo-workflows-%'");
    $pdo->exec("DELETE FROM `workflows` WHERE `id` LIKE 'demo-workflows-%'");
    demo_workflows_write($pdo, demo_workflows_definitions($pdo, demo_lang($pdo)));
}
