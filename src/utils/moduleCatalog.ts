import React, { useMemo } from "react";
import * as Icons from "lucide-react";
import {
  BarChart3,
  Briefcase,
  Coins,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  ListTodo,
  Mail,
  Brain,
  Package,
  PencilLine,
  ShoppingCart,
  Sliders,
  Sparkles,
  TableProperties,
  Users,
  Workflow,
} from "lucide-react";
import type { Language } from "./translations";
import { getTranslation } from "./translations";
import type { CustomDashboard, UnifiedEntryRegistry } from "../types";
import { SOCIAL_MEDIA_ENABLED } from "./featureFlags";
import { isHomeDashboard } from "./dashboardWidgets";
import { EmployeeTieIcon } from "../components/icons/EmployeeTieIcon";
import { FlockIcon } from "../components/icons/FlockIcon";
import { applySectionVisual } from "./sectionVisuals";

/**
 * The one list of modules an admin can show or hide.
 *
 * Settings -> Visible Modules and the module setup wizard both render this, so
 * they list exactly the same modules under the same ids — those ids are what
 * `integrationsConfig.disabledModules` stores and what the Sidebar and Start
 * menu filter on. It used to be defined inline in VisibleModulesSettings.tsx.
 */

export type ModuleCategoryId = "operations" | "analytics" | "collaboration" | "system";

export interface ModuleItemConfig {
  id: string;
  category: ModuleCategoryId;
  title: string;
  /** The terse one-liner Settings shows. */
  description: string;
  /** Two or three sentences for the wizard: what the module does and who it is for. */
  longDescription: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  bgColor?: string;
  badge?: string;
  /** A dynamic entry (custom dashboard or registry) — it has no screenshot. */
  isCustom?: boolean;
  /** Public URL of the module's screenshot; absent for custom entries. */
  screenshot?: string;
}

export interface ModuleCategoryConfig {
  id: ModuleCategoryId;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

const makeT = (language: Language) => (en: string, sk: string, hu: string) =>
  language === "sk" ? sk : language === "hu" ? hu : en;

/**
 * Screenshots live in public/module-screenshots/<moduleId>.webp and are produced
 * by scripts/capture-module-screenshots.mjs. Relative on purpose: Vite's base is
 * "./", and the app is served from the docroot at "/".
 */
export const MODULE_SCREENSHOT_DIR = "module-screenshots";
export const moduleScreenshotUrl = (id: string) => `${MODULE_SCREENSHOT_DIR}/${id}.webp`;

/** Ids of the built-in modules that have a screenshot, in catalog order. */
export const SCREENSHOT_MODULE_IDS = [
  "tasks",
  "projects",
  "tickets",
  "leads",
  "clients",
  "warehouse",
  "invoices",
  "orders",
  "financial",
  "employees",
  "dashboard",
  "overview",
  "meetings",
  "files",
  "email",
  "rag_ai",
  "sai",
  "automation",
  "social_media",
  "updates",
] as const;

type Triple = readonly [en: string, sk: string, hu: string];

/** What each built-in module does and who it is for. Written for someone who has never seen the app. */
const LONG_DESCRIPTIONS: Record<(typeof SCREENSHOT_MODULE_IDS)[number], Triple> = {
  tasks: [
    "A shared task board for the whole team, with Kanban columns, sprints and a calendar. Assign work, set due dates and reminders, and link tasks to leads, clients or projects. Everyone sees at a glance what is on their plate today.",
    "Spoločná úlohová nástenka pre celý tím s kanban stĺpcami, šprintmi a kalendárom. Prideľujte prácu, nastavujte termíny a pripomienky a prepájajte úlohy s leadmi, klientmi alebo projektmi. Každý na prvý pohľad vidí, čo ho dnes čaká.",
    "Közös feladattábla az egész csapatnak Kanban oszlopokkal, sprintekkel és naptárral. Oszthat ki munkát, állíthat be határidőket és emlékeztetőket, és kapcsolhatja a feladatokat leadekhez, ügyfelekhez vagy projektekhez. Mindenki első pillantásra látja, mi vár rá ma.",
  ],
  projects: [
    "Plan and track customer projects from start to finish, with timelines, a Gantt chart, budgets and milestones. Each project keeps its tasks, files and finances together, so you always know where it stands. Choose it if you deliver work over weeks or months.",
    "Plánujte a sledujte zákazky od začiatku do konca – s časovou osou, Ganttovým diagramom, rozpočtom a míľnikmi. Každý projekt drží úlohy, súbory aj financie pokope, takže viete, v akom je stave. Hodí sa, ak dodávate prácu v horizonte týždňov či mesiacov.",
    "Tervezze és kövesse az ügyfélprojekteket az elejétől a végéig: ütemtervvel, Gantt-diagrammal, költségvetéssel és mérföldkövekkel. Minden projekt egy helyen tartja a feladatokat, fájlokat és pénzügyeket, így mindig tudja, hol tart. Akkor ideális, ha a munkát hetek vagy hónapok alatt teljesíti.",
  ],
  tickets: [
    "A support desk for customer requests, with ticket statuses, SLA tracking and replies. Reports can arrive from the website widget or from a monitored mailbox, and customers can follow progress on a public status board. Use it if you help customers after the sale.",
    "Podpora zákazníkov s tiketmi, stavmi, sledovaním SLA a odpoveďami. Hlásenia môžu prísť z widgetu na webe alebo zo sledovanej schránky a zákazníci môžu postup sledovať na verejnej stavovej tabuli. Použite ju, ak pomáhate zákazníkom aj po predaji.",
    "Ügyfélszolgálati rendszer az ügyfélkérésekhez: jegyállapotokkal, SLA-követéssel és válaszokkal. A bejelentések érkezhetnek a weboldal widgetjéből vagy egy figyelt postafiókból, az ügyfelek pedig nyilvános állapottáblán követhetik a haladást. Akkor érdemes használni, ha az értékesítés után is támogatja az ügyfeleit.",
  ],
  leads: [
    "Your sales pipeline: capture every enquiry, move it through your own stages and see what is worth following up. Switch between a table and a Kanban board, track offer values and turn a won lead into a client or project in one click. Start here if you sell to new customers.",
    "Váš predajný lievik: zaznamenajte každý dopyt, posúvajte ho cez vlastné fázy a zistite, čo sa oplatí dotiahnuť. Prepínajte medzi tabuľkou a kanban nástenkou, sledujte hodnoty ponúk a vyhraný lead premeňte na klienta či projekt jedným klikom. Začnite tu, ak predávate novým zákazníkom.",
    "Az értékesítési tölcsére: rögzítsen minden megkeresést, vigye végig a saját szakaszain, és lássa, mit érdemes tovább követni. Váltson táblázat és Kanban tábla között, kövesse az ajánlatok értékét, a megnyert leadet pedig egy kattintással ügyféllé vagy projektté alakíthatja. Itt érdemes kezdeni, ha új ügyfeleknek ad el.",
  ],
  clients: [
    "Your address book and customer history in one place: profiles, contacts, notes, files and everything you have sent or agreed. Open a client to see their timeline, projects, invoices and open tasks. The whole team works from the same picture of each customer.",
    "Adresár a história zákazníkov na jednom mieste: profily, kontakty, poznámky, súbory a všetko, čo ste poslali alebo dohodli. Po otvorení klienta uvidíte jeho časovú os, projekty, faktúry a otvorené úlohy. Celý tím tak pracuje s rovnakým obrazom o každom zákazníkovi.",
    "Címtár és ügyféltörténet egy helyen: profilok, kapcsolattartók, jegyzetek, fájlok és minden, amit elküldött vagy megállapodtak. Egy ügyfelet megnyitva látja az idővonalát, projektjeit, számláit és nyitott feladatait. Így az egész csapat ugyanazt a képet látja minden ügyfélről.",
  ],
  warehouse: [
    "Track stock across one or more warehouses: items, batches with expiry dates, suppliers and every receipt, issue and transfer. Costs are averaged automatically and low stock is easy to spot. Skip it if you do not hold physical goods.",
    "Sledujte zásoby vo viacerých skladoch: položky, šarže s dátumom spotreby, dodávateľov a každý príjem, výdaj a presun. Náklady sa priemerujú automaticky a nízke zásoby hneď vidíte. Ak nemáte fyzický tovar, môžete ho vypnúť.",
    "Kövesse a készletet egy vagy több raktárban: cikkeket, lejárati dátumos tételeket, beszállítókat, valamint minden bevételezést, kiadást és áthelyezést. A költségek automatikusan átlagolódnak, az alacsony készlet pedig könnyen észrevehető. Kapcsolja ki, ha nem tárol fizikai árut.",
  ],
  invoices: [
    "Create price offers from branded PDF templates, send them to clients and follow their status from draft to approved. Numbering and VAT are handled for you, and offers can be issued through SuperFaktúra or iDoklad. Invoices are issued from orders and clients and are kept in the Documents registry.",
    "Vytvárajte cenové ponuky z firemných PDF šablón, posielajte ich klientom a sledujte ich stav od návrhu po schválenie. Číslovanie aj DPH sa vyriešia za vás a ponuky viete vystaviť aj cez SuperFaktúru alebo iDoklad. Faktúry sa vystavujú z objednávok a od klientov a nájdete ich v Registri dokumentov.",
    "Készítsen árajánlatokat arculatának megfelelő PDF-sablonokból, küldje el őket az ügyfeleknek, és kövesse az állapotukat a piszkozattól a jóváhagyásig. A sorszámozást és az áfát automatikusan kezeli, az ajánlatokat pedig a SuperFaktúrán vagy az iDokladon keresztül is kiállíthatja. A számlákat a rendelésekből és az ügyfelektől állíthatja ki, és a Dokumentumtárban találja őket.",
  ],
  orders: [
    "Handle orders from your e-shop and from commercial deals, including guest checkout, deliveries and a status pipeline from new to shipped. Every order links back to its client, so nothing gets lost between sale and delivery. Useful if customers buy products from you directly.",
    "Spracúvajte objednávky z e-shopu aj obchodné objednávky vrátane nákupu bez registrácie, doručenia a stavov od novej po odoslanú. Každá objednávka je prepojená s klientom, takže sa nič nestratí medzi predajom a doručením. Hodí sa, ak vaši zákazníci kupujú produkty priamo u vás.",
    "Kezelje a webáruház és az üzleti ügyletek rendeléseit, a vendégként leadott rendeléseket, a szállításokat és az új rendeléstől a kiszállításig tartó állapotokat. Minden rendelés az ügyfélhez kapcsolódik, így az eladás és a kiszállítás között semmi sem vész el. Hasznos, ha az ügyfelek közvetlenül Öntől vásárolnak termékeket.",
  ],
  financial: [
    "See where your money is going: a cash flow trend, a weekly matrix, a ledger of income and expenses, and recurring rules for rent, wages and subscriptions. Forecasts show where your balance is heading. Switch it off if you keep your books elsewhere.",
    "Prehľad o tom, kam idú vaše peniaze: trend cashflow, týždenná matica, kniha príjmov a výdavkov a trvalé pravidlá pre nájom, mzdy či predplatné. Prognózy ukazujú, kam smeruje váš zostatok. Vypnite ho, ak účtovníctvo vediete inde.",
    "Lássa, hová megy a pénze: cashflow-trend, heti mátrix, a bevételek és kiadások könyve, valamint ismétlődő szabályok a bérleti díjra, bérekre és előfizetésekre. Az előrejelzések megmutatják, merre tart az egyenlege. Kapcsolja ki, ha a könyvelést máshol vezeti.",
  ],
  employees: [
    "Your staff directory with employment details, payroll, time tracking and leave. Employees see their own employment, and managers can approve vacations and record salary payments. Sensitive data is visible only to people with the right permissions.",
    "Zoznam zamestnancov so zamestnaneckými údajmi, mzdami, meraním času a dovolenkami. Zamestnanci vidia svoje zamestnanie, vedúci môžu schvaľovať dovolenky a evidovať výplaty. Citlivé údaje uvidia len ľudia s príslušným oprávnením.",
    "A munkatársak névsora a munkaviszonyi adatokkal, bérszámfejtéssel, időkövetéssel és szabadságokkal. A munkatársak a saját munkaviszonyukat látják, a vezetők pedig jóváhagyhatják a szabadságokat és rögzíthetik a bérkifizetéseket. Az érzékeny adatokat csak a megfelelő jogosultságú emberek látják.",
  ],
  dashboard: [
    "Your start screen: a board of live widgets with metrics, charts and tables that you arrange yourself. Add new widgets in plain words, and build further dashboards for each team. It is the first thing most people see after logging in.",
    "Vaša úvodná obrazovka: nástenka živých widgetov s metrikami, grafmi a tabuľkami, ktorú si usporiadate sami. Nové widgety pridáte jednoduchým opisom a pre každý tím viete vytvoriť ďalšie nástenky. Väčšina ľudí ju vidí ako prvú po prihlásení.",
    "A kezdőképernyője: élő widgetekből álló tábla mutatókkal, diagramokkal és táblázatokkal, amelyet saját maga rendezhet el. Új widgetet egyszerű szavakkal is hozzáadhat, és minden csapatnak készíthet további irányítópultot. A bejelentkezés után a legtöbben ezt látják először.",
  ],
  overview: [
    "An executive overview with key business figures, your sales funnel and marketing performance in one report. It helps owners and managers judge how the business is doing without opening each module. Best for anyone who needs the big picture.",
    "Manažérsky prehľad s kľúčovými číslami firmy, predajným lievikom a výkonom marketingu v jednom reporte. Majiteľom a vedúcim pomáha posúdiť, ako firma funguje, bez otvárania každého modulu. Najlepšie pre tých, ktorí potrebujú celkový obraz.",
    "Vezetői áttekintés a vállalkozás kulcsszámaival, az értékesítési tölcsérrel és a marketingteljesítménnyel egyetlen jelentésben. Segít a tulajdonosoknak és vezetőknek megítélni, hogyan megy a cég, anélkül hogy minden modult megnyitnának. A teljes képre kíváncsiaknak ideális.",
  ],
  meetings: [
    "Record a meeting and let AI turn it into a transcript, a summary and a list of agreed actions. Notes stay searchable and can be linked to the client or project they belong to. It saves you from writing minutes by hand.",
    "Nahrajte stretnutie a nechajte AI vytvoriť prepis, zhrnutie a zoznam dohodnutých krokov. Zápisy ostávajú vyhľadateľné a dajú sa prepojiť s klientom alebo projektom. Ušetrí vás od ručného písania zápisníc.",
    "Rögzítsen egy megbeszélést, és az AI elkészíti belőle az átiratot, az összefoglalót és a megállapodott teendők listáját. A jegyzetek kereshetők maradnak, és az ügyfélhez vagy projekthez kapcsolhatók. Megkíméli a jegyzőkönyvek kézi írásától.",
  ],
  files: [
    "A central library for the documents and attachments your team uploads across clients, projects and employees. Find, preview and download them from one screen instead of hunting through each record. Handy when files are scattered.",
    "Centrálna knižnica dokumentov a príloh, ktoré váš tím nahráva ku klientom, projektom a zamestnancom. Nájdete, zobrazíte a stiahnete ich z jednej obrazovky namiesto hľadania v každom zázname. Praktické, keď sú súbory roztrúsené.",
    "Központi könyvtár a dokumentumokhoz és mellékletekhez, amelyeket a csapat az ügyfelekhez, projektekhez és munkatársakhoz tölt fel. Egyetlen képernyőn kereshet, megtekinthet és letölthet, ahelyett hogy minden rekordban keresgélne. Akkor hasznos, ha a fájlok szétszórtak.",
  ],
  email: [
    "A built-in mail client for your company mailbox (IMAP and SMTP), so you can read and reply without leaving the CRM. Messages can be summarised by AI and tied to the right client. You need to connect a mailbox before it works.",
    "Zabudovaný poštový klient pre firemnú schránku (IMAP a SMTP), takže môžete čítať a odpovedať bez opustenia CRM. Správy vie AI zhrnúť a priradiť k správnemu klientovi. Aby fungoval, treba najprv pripojiť schránku.",
    "Beépített levelezőkliens a céges postafiókhoz (IMAP és SMTP), így a CRM elhagyása nélkül olvashat és válaszolhat. Az üzeneteket az AI összefoglalhatja, és a megfelelő ügyfélhez kapcsolhatja. A működéshez előbb csatlakoztatnia kell egy postafiókot.",
  ],
  rag_ai: [
    "An AI assistant that answers questions from your own company knowledge, such as documents, notes and CRM records. You can create several agents for different jobs. It needs an OpenAI key to be set up in the settings.",
    "AI asistent, ktorý odpovedá na otázky z vašich firemných znalostí, napríklad dokumentov, poznámok a záznamov v CRM. Pre rôzne úlohy môžete vytvoriť viacero agentov. Vyžaduje nastavený kľúč OpenAI v nastaveniach.",
    "AI-asszisztens, amely a saját céges tudásából – például dokumentumokból, jegyzetekből és CRM-rekordokból – válaszol a kérdésekre. Különböző feladatokra több ügynököt is létrehozhat. Működéséhez be kell állítani egy OpenAI-kulcsot a beállításokban.",
  ],
  sai: [
    "Swarm AI rehearsals for your market and strategy: describe a scenario and a swarm of AI agents simulates how it could play out, before you commit real money or time. Use it to test pricing, messaging or plans. It is an advanced, optional tool.",
    "Swarm AI nácvik pre váš trh a stratégiu: opíšete scenár a roj AI agentov nasimuluje, ako by sa mohol vyvinúť, skôr než vynaložíte skutočné peniaze či čas. Využite ho na testovanie cien, komunikácie alebo plánov. Ide o pokročilý, voliteľný nástroj.",
    "Swarm AI próbák a piacához és stratégiájához: leír egy forgatókönyvet, az AI-ügynökök rajai pedig lejátsszák, hogyan alakulhat, mielőtt valódi pénzt vagy időt fektetne bele. Használja árazás, kommunikáció vagy tervek tesztelésére. Haladó, opcionális eszköz.",
  ],
  automation: [
    "Build rules that run on their own: when something happens in the CRM or a webhook arrives, send an email, create a task or update a record. A visual builder makes this possible without writing code. It takes repetitive work off your team.",
    "Vytvárajte pravidlá, ktoré bežia samé: keď sa v CRM niečo stane alebo príde webhook, odošle sa e-mail, vytvorí úloha alebo upraví záznam. Vizuálny editor to umožní bez programovania. Odstráni opakujúcu sa prácu z pliec vášho tímu.",
    "Hozzon létre magától futó szabályokat: ha a CRM-ben történik valami vagy webhook érkezik, a rendszer e-mailt küld, feladatot hoz létre vagy módosít egy rekordot. A vizuális szerkesztő kódolás nélkül lehetővé teszi ezt. Leveszi az ismétlődő munkát a csapat válláról.",
  ],
  social_media: [
    "Plan and publish posts to your social networks from one calendar. Schedule content ahead of time and keep an overview of what goes out where. Useful for teams who run their own channels.",
    "Plánujte a publikujte príspevky na sociálnych sieťach z jedného kalendára. Obsah si naplánujete vopred a máte prehľad, čo kam ide. Užitočné pre tímy, ktoré spravujú vlastné kanály.",
    "Tervezze meg és tegye közzé a közösségi média bejegyzéseit egyetlen naptárból. Előre időzítheti a tartalmakat, és áttekintheti, mi hová kerül. Hasznos a saját csatornáikat kezelő csapatoknak.",
  ],
  updates: [
    "Release notes for every version of the CRM, with screenshots of what is new and what has changed. Open it after an update to see which features you can start using. It is read-only and needs no setup.",
    "Poznámky k vydaniu pre každú verziu CRM so snímkami toho, čo je nové a čo sa zmenilo. Otvorte ich po aktualizácii a zistíte, ktoré funkcie môžete začať používať. Sú len na čítanie a nevyžadujú žiadne nastavenie.",
    "Kiadási jegyzetek a CRM minden verziójáról, képernyőképekkel arról, mi az új és mi változott. Frissítés után nyissa meg, hogy lássa, mely funkciókat kezdheti használni. Csak olvasható, és nem igényel beállítást.",
  ],
};

/** Custom dashboards and registries have no fixed purpose, so they get a generic line. */
const CUSTOM_DASHBOARD_LONG: Triple = [
  "A dashboard that someone on your team built with their own widgets. It appears in the navigation next to the built-in modules, so the people who need it can open it in one click.",
  "Nástenka, ktorú si niekto z vášho tímu zostavil z vlastných widgetov. Zobrazuje sa v navigácii vedľa vstavaných modulov, takže ju tí, ktorí ju potrebujú, otvoria jedným klikom.",
  "Egy irányítópult, amelyet a csapat egyik tagja saját widgetekből állított össze. A beépített modulok mellett jelenik meg a navigációban, így akinek szüksége van rá, egy kattintással megnyithatja.",
];
const CUSTOM_REGISTRY_LONG: Triple = [
  "A custom database registry you defined for your own records, with the fields and folders you chose. It sits in the navigation next to the built-in modules and keeps that data in one place.",
  "Vlastná databázová evidencia, ktorú ste si vytvorili pre svoje záznamy, s poľami a priečinkami podľa vášho výberu. V navigácii sa zobrazuje vedľa vstavaných modulov a drží tieto údaje na jednom mieste.",
  "Egy saját adatbázis-nyilvántartás a saját rekordjaihoz, az Ön által választott mezőkkel és mappákkal. A beépített modulok mellett jelenik meg a navigációban, és egy helyen tartja ezeket az adatokat.",
];

/**
 * Builds the module list. Pure — no React — so it can be called from anywhere;
 * `useModuleCatalog` is the memoised hook around it.
 */
export function buildModuleCatalog(
  language: Language,
  customDashboards: CustomDashboard[] = [],
  unifiedEntries: UnifiedEntryRegistry[] = []
): ModuleItemConfig[] {
  const t = makeT(language);
  const long = (id: (typeof SCREENSHOT_MODULE_IDS)[number]) => t(...LONG_DESCRIPTIONS[id]);
  const shot = (id: (typeof SCREENSHOT_MODULE_IDS)[number]) => moduleScreenshotUrl(id);

  const list: ModuleItemConfig[] = [
    // 1. OPERATIONS & CRM
    {
      id: "tasks",
      category: "operations",
      title: getTranslation(language, "sidebar.tasks"),
      description: t("Kanban workflow, sprints & team tasks", "Kanban nástenka, šprinty a tímové úlohy", "Kanban tábla, sprintek és feladatok"),
      longDescription: long("tasks"),
      screenshot: shot("tasks"),
      icon: ListTodo,
      color: "#ff5d00",
      bgColor: "rgba(255, 93, 0, 0.12)",
      badge: t("Core", "Hlavné", "Alap"),
    },
    {
      id: "time-tracking",
      category: "operations",
      title: t("Time tracking", "Evidencia času", "Időkövetés"),
      description: t("Timer, daily log, and the real cost of every hour", "Časovač, denný záznam a skutočná cena každej hodiny", "Időzítő, napi napló és minden óra valós költsége"),
      longDescription: t(
        "Track time with a timer, hours-only daily rows or a calendar, against projects, tasks and tickets. Every hour is priced at the worker's real cost, from their salary and the working days of that month, so each project shows what its labour really cost. Employees only ever see their own time unless you give them the team view.",
        "Zaznamenávajte čas časovačom, denným výkazom v hodinách alebo v kalendári, voči projektom, úlohám a tiketom. Každá hodina sa ocení skutočnými nákladmi pracovníka podľa jeho mzdy a pracovných dní daného mesiaca, takže každý projekt ukáže, koľko naozaj stála práca. Zamestnanci vidia iba vlastný čas, kým im nedáte pohľad na tím.",
        "Rögzítse az időt időzítővel, csak órákat tartalmazó napi sorokkal vagy naptárban, projektekhez, feladatokhoz és jegyekhez. Minden órát a munkatárs valós költségén számol el a rendszer, a fizetéséből és az adott hónap munkanapjaiból, így minden projekt megmutatja, mennyibe került a munka. A munkatársak csak a saját idejüket látják, amíg nem ad nekik csapatnézetet.",
      ),
      icon: Icons.Timer || ListTodo,
      color: "#0d9488",
      bgColor: "rgba(13, 148, 136, 0.12)",
    },
    {
      id: "projects",
      category: "operations",
      title: t("Projects", "Projekty", "Projektek"),
      description: t("Project timelines, budget & milestones", "Časové osy, rozpočty a míľniky projektov", "Projekt ütemtervek, költségvetések"),
      longDescription: long("projects"),
      screenshot: shot("projects"),
      icon: Briefcase,
      color: "#a855f7",
      bgColor: "rgba(168, 85, 247, 0.12)",
    },
    {
      id: "tickets",
      category: "operations",
      title: getTranslation(language, "sidebar.tickets"),
      description: t("Support tickets, SLA tracking, widget reports & email polling", "Tikety podpory, SLA, hlásenia z widgetu a e-maily", "Támogatási jegyek, SLA követés, widget jelentések és e-mail"),
      longDescription: long("tickets"),
      screenshot: shot("tickets"),
      icon: Icons.LifeBuoy || Icons.Ticket || Briefcase,
      color: "#6366f1",
      bgColor: "rgba(99, 102, 241, 0.12)",
    },
    {
      id: "leads",
      category: "operations",
      title: getTranslation(language, "sidebar.leads"),
      description: t("Pipeline stages, conversions & leads datagrid", "Fázy predaja, konverzie a datagrid leadov", "Értékesítési tölcsér és leadek"),
      longDescription: long("leads"),
      screenshot: shot("leads"),
      icon: TableProperties,
      color: "#2563eb",
      bgColor: "rgba(37, 99, 235, 0.12)",
    },
    {
      id: "clients",
      category: "operations",
      title: getTranslation(language, "sidebar.clients"),
      description: t("Client profiles, address book & contract history", "Profily klientov, adresár a história zmlúv", "Ügyfélprofilok és előzmények"),
      longDescription: long("clients"),
      screenshot: shot("clients"),
      icon: Users,
      color: "#059669",
      bgColor: "rgba(5, 150, 105, 0.12)",
    },
    {
      id: "warehouse",
      category: "operations",
      title: getTranslation(language, "sidebar.warehouse"),
      description: t("Inventory stock, FEFO batches & material movements", "Skladové zásoby, FEFO šarže a pohyby materiálu", "Raktárkészlet, FEFO tételek és mozgások"),
      longDescription: long("warehouse"),
      screenshot: shot("warehouse"),
      icon: Package,
      color: "#1e3a8a",
      bgColor: "rgba(30, 58, 138, 0.12)",
    },
    {
      id: "invoices",
      category: "operations",
      title: t("Price Offers", "Cenové ponuky", "Árajánlatok"),
      description: t("Price offers, PDF templates & accounting sync", "Cenové ponuky, PDF šablóny a prepojenie na účtovníctvo", "Árajánlatok, PDF sablonok és könyvelési kapcsolat"),
      longDescription: long("invoices"),
      screenshot: shot("invoices"),
      icon: FileText,
      color: "#6366f1",
      bgColor: "rgba(99, 102, 241, 0.12)",
    },
    {
      id: "orders",
      category: "operations",
      title: t("Orders", "Objednávky", "Rendelések"),
      description: t("E-shop & commercial orders, guest checkout, deliveries & status pipeline", "E-shop a obchodné objednávky, nákup bez registrácie, doprava a stavy", "Webáruház és kereskedelmi rendelések, vendég vásárlás, szállítás"),
      longDescription: long("orders"),
      screenshot: shot("orders"),
      icon: ShoppingCart,
      color: "#0284c7",
      bgColor: "rgba(2, 132, 199, 0.12)",
    },
    {
      id: "financial",
      category: "operations",
      title: getTranslation(language, "sidebar.financial"),
      description: t("Cash flow trend, matrix table, ledger & recurring rules", "Trend cashflow, tabuľka, pohyby a trvalé príkazy", "Cashflow trend, mátrix tábla, mozgások"),
      longDescription: long("financial"),
      screenshot: shot("financial"),
      icon: Coins,
      color: "#10b981",
      bgColor: "rgba(16, 185, 129, 0.12)",
    },
    {
      id: "employees",
      category: "operations",
      title: getTranslation(language, "sidebar.employees"),
      description: t("Your employment, staff directory, payroll, time tracking & leave", "Vaše zamestnanie, zoznam zamestnancov, mzdy, meranie času a dovolenky", "Munkaviszonya, munkatársak, bérek, időkövetés és szabadságok"),
      longDescription: long("employees"),
      screenshot: shot("employees"),
      icon: EmployeeTieIcon,
      color: "#c29b62",
      bgColor: "rgba(194, 155, 98, 0.12)",
    },

    // 2. ANALYTICS & REGISTRIES
    {
      id: "dashboard",
      category: "analytics",
      title: getTranslation(language, "sidebar.dashboard"),
      description: t("Widget board of live metrics, charts & tables", "Nástenka so živými metrikami, grafmi a tabuľkami", "Élő mutatók, diagramok és táblázatok"),
      longDescription: long("dashboard"),
      screenshot: shot("dashboard"),
      icon: LayoutDashboard,
      color: "#4f46e5",
      bgColor: "rgba(79, 70, 229, 0.12)",
      badge: t("Start Screen", "Úvodná obrazovka", "Kezdőképernyő"),
    },
    {
      id: "overview",
      category: "analytics",
      title: getTranslation(language, "sidebar.analytics"),
      description: t("Executive BI overview & marketing funnel metrics", "Manažérske BI reporty a marketingové metriky", "Vezetői BI és marketing mutatók"),
      longDescription: long("overview"),
      screenshot: shot("overview"),
      icon: BarChart3,
      color: "#0891b2",
      bgColor: "rgba(8, 145, 178, 0.12)",
    },

    // Dynamic custom dashboards
    ...customDashboards
      .filter((d) => !d.archived && !isHomeDashboard(d.id))
      .map((d): ModuleItemConfig => {
        const IconComp = (Icons as any)[d.icon] || LayoutDashboard;
        return {
          id: `dash_${d.id}`,
          category: "analytics",
          title: d.name,
          description: t("Custom AI & Widget Dashboard", "Vlastná AI nástenka", "Egyéni AI irányítópult"),
          longDescription: t(...CUSTOM_DASHBOARD_LONG),
          icon: IconComp,
          color: d.color || "#4f46e5",
          bgColor: `${d.color || "#4f46e5"}1f`,
          badge: "Custom",
          isCustom: true,
        };
      }),

    // Dynamic unified entry custom database registries
    ...unifiedEntries
      .filter((ue) => !ue.archived)
      .map((ue): ModuleItemConfig => {
        const IconComp = (Icons as any)[ue.icon] || FolderOpen;
        return {
          id: `ue_${ue.id}`,
          category: "analytics",
          title: ue.name,
          description: t("Custom Database Registry", "Vlastná databázová evidencia", "Egyéni adatbázis-nyilvántartás"),
          longDescription: t(...CUSTOM_REGISTRY_LONG),
          icon: IconComp,
          color: ue.color || "#6366f1",
          bgColor: `${ue.color || "#6366f1"}1f`,
          badge: "DB",
          isCustom: true,
        };
      }),

    // 3. COLLABORATION & AI
    {
      id: "meetings",
      category: "collaboration",
      title: getTranslation(language, "sidebar.meetings"),
      description: t("Voice recordings, AI notes & meeting minutes", "Hlasové nahrávky, AI poznámky a zápisy zo stretnutí", "Hangfelvételek, AI jegyzetek és memók"),
      longDescription: long("meetings"),
      screenshot: shot("meetings"),
      icon: PencilLine,
      color: "#4f46e5",
      bgColor: "rgba(79, 70, 229, 0.12)",
    },
    {
      id: "files",
      category: "collaboration",
      title: getTranslation(language, "sidebar.files"),
      description: t("Central cloud document repository & attachments", "Centrálne úložisko dokumentov a príloh", "Központi dokumentumtár és csatolmányok"),
      longDescription: long("files"),
      screenshot: shot("files"),
      icon: FolderOpen,
      color: "#b45309",
      bgColor: "rgba(180, 83, 9, 0.12)",
    },
    {
      id: "whatsapp",
      category: "collaboration",
      title: t("WhatsApp", "WhatsApp", "WhatsApp"),
      description: t("Your WhatsApp chats, digest and tasks, inside the CRM", "Vaše WhatsApp chaty, prehľad a úlohy priamo v CRM", "WhatsApp-csevegései, összefoglalója és feladatai a CRM-ben"),
      longDescription: t(
        "The full WAAI app inside the CRM, already signed in as you: chats with a composer and voice notes, the AI digest, tasks and the AI lookup. Chats are paired with your clients, leads and projects, so a client's page opens its chat in one click, and the tasks WAAI finds in a conversation land on the right client and project.",
        "Celá aplikácia WAAI priamo v CRM, už prihlásená ako vy: chaty s písaním správ a hlasovými správami, AI prehľad, úlohy a AI vyhľadávanie. Chaty sú spárované s vašimi klientmi, leadmi a projektmi, takže stránka klienta otvorí jeho chat jedným klikom a úlohy, ktoré WAAI nájde v konverzácii, pristanú pri správnom klientovi a projekte.",
        "A teljes WAAI alkalmazás a CRM-ben, már az Ön nevében belépve: csevegések íróval és hangüzenetekkel, az AI-összefoglaló, feladatok és az AI-keresés. A csevegések párosítva vannak az ügyfelekkel, érdeklődőkkel és projektekkel, így az ügyfél oldaláról egy kattintással megnyílik a csevegése, a WAAI által a beszélgetésben talált feladatok pedig a megfelelő ügyfélhez és projekthez kerülnek.",
      ),
      icon: Icons.MessageCircle || PencilLine,
      color: "#16a34a",
      bgColor: "rgba(22, 163, 74, 0.12)",
    },
    {
      id: "email",
      category: "collaboration",
      title: t("Mail Client", "Pošta", "Levelezés"),
      description: t("Integrated IMAP/SMTP corporate email client", "Integrovaná firemná pošta a schránka", "Integrált vállalati levelezőkliens"),
      longDescription: long("email"),
      screenshot: shot("email"),
      icon: Mail,
      color: "#db2777",
      bgColor: "rgba(219, 39, 119, 0.12)",
    },
    {
      id: "rag_ai",
      category: "collaboration",
      title: t("RAG AI Assistant", "RAG AI Asistent", "RAG AI Asszisztens"),
      description: t("Vector-indexed company knowledge AI chat", "Firemný znalostný AI asistent s vektorovou DB", "Vállalati tudásbázis AI asszisztens"),
      longDescription: long("rag_ai"),
      screenshot: shot("rag_ai"),
      icon: Brain,
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.12)",
      badge: "AI",
    },
    {
      id: "sai",
      category: "collaboration",
      title: "SAI",
      description: t("Swarm AI predictive market rehearsals & strategic simulation", "Prediktívna simulácia trhu a strategický nácvik so Swarm AI", "Prediktív szimuláció és stratégiai próba Swarm AI-val"),
      longDescription: long("sai"),
      screenshot: shot("sai"),
      icon: FlockIcon,
      color: "#8b5cf6",
      bgColor: "rgba(139, 92, 246, 0.12)",
      badge: "Swarm AI",
    },
    {
      id: "automation",
      category: "collaboration",
      title: t("Automation", "Automatizácia", "Automatizálás"),
      description: t("Event triggers, webhook integrations & rule builder", "Udalosťové spúšťače, webhooky a automatické pravidlá", "Eseményvezérelt munkafolyamatok és webhookok"),
      longDescription: long("automation"),
      screenshot: shot("automation"),
      icon: Workflow,
      color: "#6b21a8",
      bgColor: "rgba(107, 33, 168, 0.12)",
    },
  ];

  if (SOCIAL_MEDIA_ENABLED) {
    list.push({
      id: "social_media",
      category: "collaboration",
      title: t("Social Media", "Sociálne siete", "Közösségi média"),
      description: t("Social post scheduling & cross-platform publishing", "Plánovanie príspevkov a publikovanie na sociálne siete", "Közösségi média bejegyzések időzítése"),
      longDescription: long("social_media"),
      screenshot: shot("social_media"),
      icon: Globe,
      color: "#f43f5e",
      bgColor: "rgba(244, 63, 94, 0.12)",
    });
  }

  // 4. SYSTEM & TOOLS
  list.push({
    id: "updates",
    category: "system",
    title: t("Updates & What's New", "Novinky a verzie", "Újdonságok"),
    description: t("System changelog, release notes & improvements", "História verzií, novinky a vylepšenia systému", "Verziótörténet és újdonságok"),
    longDescription: long("updates"),
    screenshot: shot("updates"),
    icon: Sparkles,
    color: "#d97706",
    bgColor: "rgba(217, 119, 6, 0.12)",
  });

  return list.map(applySectionVisual);
}

/**
 * Memoised on the three inputs that actually change the list. (The Settings
 * page used to depend on its own `t` closure as well, which is a new function
 * every render and so rebuilt the list every render.)
 */
export function useModuleCatalog(
  language: Language,
  customDashboards: CustomDashboard[] = [],
  unifiedEntries: UnifiedEntryRegistry[] = []
): ModuleItemConfig[] {
  return useMemo(
    () => buildModuleCatalog(language, customDashboards, unifiedEntries),
    [language, customDashboards, unifiedEntries]
  );
}

/** The four groups the modules are filed under, in display order. */
export function getModuleCategories(language: Language): ModuleCategoryConfig[] {
  return [
    {
      id: "operations",
      title: getTranslation(language, "settings.modules.cat.operations"),
      icon: Briefcase,
      color: "#6366f1",
      bgColor: "bg-indigo-50/80 text-indigo-700 border-indigo-200",
    },
    {
      id: "analytics",
      title: getTranslation(language, "settings.modules.cat.analytics"),
      icon: BarChart3,
      color: "#0891b2",
      bgColor: "bg-cyan-50/80 text-cyan-700 border-cyan-200",
    },
    {
      id: "collaboration",
      title: getTranslation(language, "settings.modules.cat.collaboration"),
      icon: Brain,
      color: "#8b5cf6",
      bgColor: "bg-purple-50/80 text-purple-700 border-purple-200",
    },
    {
      id: "system",
      title: getTranslation(language, "settings.modules.cat.system"),
      icon: Sliders,
      color: "#475569",
      bgColor: "bg-slate-100 text-slate-700 border-slate-200",
    },
  ];
}
