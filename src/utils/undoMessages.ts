/**
 * Wording for the "… deleted / archived — Undo" toasts and the hold-to-confirm
 * hints, in the three UI languages. Pure so the plural and gender rules (Slovak
 * is the awkward one) can be unit-tested.
 */
export type Lang = "sk" | "hu" | "en";

export type Verb = "delete" | "archive";

/** Narrows a loosely typed language prop to one of the three UI languages. */
export const asLang = (value: unknown): Lang => (value === "en" || value === "hu" ? value : "sk");

type Gender = "m" | "f" | "n";

export interface EntityLabel {
  en: readonly [one: string, many: string];
  sk: {
    one: string;
    /** 2–4 */
    few: string;
    /** 5+ (genitive plural) */
    many: string;
    gender: Gender;
    /** Masculine animate nouns take "-í" in the plural participle (klienti zmazaní). */
    animate?: boolean;
  };
  hu: string;
}

export const ENTITY = {
  task: { en: ["Task", "tasks"], sk: { one: "Úloha", few: "úlohy", many: "úloh", gender: "f" }, hu: "feladat" },
  lead: { en: ["Lead", "leads"], sk: { one: "Lead", few: "leady", many: "leadov", gender: "m" }, hu: "lead" },
  client: { en: ["Client", "clients"], sk: { one: "Klient", few: "klienti", many: "klientov", gender: "m", animate: true }, hu: "ügyfél" },
  project: { en: ["Project", "projects"], sk: { one: "Projekt", few: "projekty", many: "projektov", gender: "m" }, hu: "projekt" },
  meeting: { en: ["Meeting", "meetings"], sk: { one: "Stretnutie", few: "stretnutia", many: "stretnutí", gender: "n" }, hu: "megbeszélés" },
  invoice: { en: ["Document", "documents"], sk: { one: "Doklad", few: "doklady", many: "dokladov", gender: "m" }, hu: "dokumentum" },
  file: { en: ["File", "files"], sk: { one: "Súbor", few: "súbory", many: "súborov", gender: "m" }, hu: "fájl" },
  record: { en: ["Record", "records"], sk: { one: "Záznam", few: "záznamy", many: "záznamov", gender: "m" }, hu: "rekord" },
  item: { en: ["Item", "items"], sk: { one: "Položka", few: "položky", many: "položiek", gender: "f" }, hu: "tétel" },
  employee: { en: ["Employee", "employees"], sk: { one: "Zamestnanec", few: "zamestnanci", many: "zamestnancov", gender: "m", animate: true }, hu: "munkatárs" },
  email: { en: ["Email", "emails"], sk: { one: "E-mail", few: "e-maily", many: "e-mailov", gender: "m" }, hu: "e-mail" },
  workflow: { en: ["Workflow", "workflows"], sk: { one: "Workflow", few: "workflowy", many: "workflowov", gender: "m" }, hu: "munkafolyamat" },
  category: { en: ["Category", "categories"], sk: { one: "Kategória", few: "kategórie", many: "kategórií", gender: "f" }, hu: "kategória" },
  setting: { en: ["Option", "options"], sk: { one: "Možnosť", few: "možnosti", many: "možností", gender: "f" }, hu: "beállítás" },
  widget: { en: ["Widget", "widgets"], sk: { one: "Widget", few: "widgety", many: "widgetov", gender: "m" }, hu: "widget" },
  event: { en: ["Event", "events"], sk: { one: "Udalosť", few: "udalosti", many: "udalostí", gender: "f" }, hu: "esemény" },
  note: { en: ["Note", "notes"], sk: { one: "Poznámka", few: "poznámky", many: "poznámok", gender: "f" }, hu: "jegyzet" },
  recording: { en: ["Recording", "recordings"], sk: { one: "Nahrávka", few: "nahrávky", many: "nahrávok", gender: "f" }, hu: "felvétel" },
  ganttRow: { en: ["Gantt row", "Gantt rows"], sk: { one: "Riadok Gantt diagramu", few: "riadky Gantt diagramu", many: "riadkov Gantt diagramu", gender: "m" }, hu: "Gantt-sor" },
  attribute: { en: ["Attribute", "attributes"], sk: { one: "Atribút", few: "atribúty", many: "atribútov", gender: "m" }, hu: "attribútum" },
  fileField: { en: ["File field", "file fields"], sk: { one: "Pole súboru", few: "polia súborov", many: "polí súborov", gender: "n" }, hu: "fájlmező" },
  projectType: { en: ["Project type", "project types"], sk: { one: "Typ projektu", few: "typy projektov", many: "typov projektov", gender: "m" }, hu: "projekttípus" },
  status: { en: ["Status", "statuses"], sk: { one: "Stav", few: "stavy", many: "stavov", gender: "m" }, hu: "állapot" },
  product: { en: ["Product", "products"], sk: { one: "Tovar", few: "tovary", many: "tovarov", gender: "m" }, hu: "termék" },
  supplier: { en: ["Supplier", "suppliers"], sk: { one: "Dodávateľ", few: "dodávatelia", many: "dodávateľov", gender: "m", animate: true }, hu: "beszállító" },
  warehouse: { en: ["Warehouse", "warehouses"], sk: { one: "Sklad", few: "sklady", many: "skladov", gender: "m" }, hu: "raktár" },
  group: { en: ["Group", "groups"], sk: { one: "Skupina", few: "skupiny", many: "skupín", gender: "f" }, hu: "csoport" },
  chat: { en: ["Conversation", "conversations"], sk: { one: "História rozhovoru", few: "histórie rozhovorov", many: "histórií rozhovorov", gender: "f" }, hu: "beszélgetés" },
  decision: { en: ["Decision", "decisions"], sk: { one: "Rozhodnutie", few: "rozhodnutia", many: "rozhodnutí", gender: "n" }, hu: "döntés" },
  agent: { en: ["Agent", "agents"], sk: { one: "Agent", few: "agenti", many: "agentov", gender: "m", animate: true }, hu: "ügynök" },
  simulation: { en: ["Simulation", "simulations"], sk: { one: "Simulácia", few: "simulácie", many: "simulácií", gender: "f" }, hu: "szimuláció" },
  division: { en: ["Division", "divisions"], sk: { one: "Divízia", few: "divízie", many: "divízií", gender: "f" }, hu: "divízió" },
  source: { en: ["Source", "sources"], sk: { one: "Zdroj", few: "zdroje", many: "zdrojov", gender: "m" }, hu: "forrás" },
  user: { en: ["User", "users"], sk: { one: "Používateľ", few: "používatelia", many: "používateľov", gender: "m", animate: true }, hu: "felhasználó" },
  role: { en: ["Role", "roles"], sk: { one: "Rola", few: "roly", many: "rolí", gender: "f" }, hu: "szerepkör" },
  template: { en: ["Template", "templates"], sk: { one: "Šablóna", few: "šablóny", many: "šablón", gender: "f" }, hu: "sablon" },
  eventType: { en: ["Event type", "event types"], sk: { one: "Typ udalosti", few: "typy udalostí", many: "typov udalostí", gender: "m" }, hu: "eseménytípus" },
  log: { en: ["Log", "logs"], sk: { one: "Záznam", few: "záznamy", many: "záznamov", gender: "m" }, hu: "napló" },
  priceLevel: { en: ["Price level", "price levels"], sk: { one: "Cenová hladina", few: "cenové hladiny", many: "cenových hladín", gender: "f" }, hu: "árszint" },
} as const satisfies Record<string, EntityLabel>;

export type EntityKey = keyof typeof ENTITY;

const pick = <T,>(lang: Lang, sk: T, hu: T, en: T): T => (lang === "sk" ? sk : lang === "hu" ? hu : en);

export const undoLabel = (lang: Lang): string => pick(lang, "Krok späť", "Visszavonás", "Undo");
export const restoredMessage = (lang: Lang): string => pick(lang, "Obnovené", "Visszaállítva", "Restored");

/** Hint shown when the button is released before the hold finishes. */
export const holdHint = (lang: Lang, verb: Verb): string =>
  verb === "delete"
    ? pick(lang, "Podržte pre zmazanie", "Tartsa lenyomva a törléshez", "Hold to delete")
    : pick(lang, "Podržte pre archiváciu", "Tartsa lenyomva az archiváláshoz", "Hold to archive");

/** "Delete task, hold to confirm" — the accessible name of a hold button. */
export const holdAriaLabel = (lang: Lang, verb: Verb, what: string): string => {
  const action = verb === "delete"
    ? pick(lang, "Zmazať", "Törlés", "Delete")
    : pick(lang, "Archivovať", "Archiválás", "Archive");
  const suffix = pick(lang, "podržte pre potvrdenie", "tartsa lenyomva a megerősítéshez", "hold to confirm");
  return what ? `${action}: ${what}, ${suffix}` : `${action}, ${suffix}`;
};

/** Shortens a title for a toast (~40 chars) without cutting in the middle of nothing. */
export const trimTitle = (title: string | null | undefined, max = 40): string => {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
};

const quote = (lang: Lang, text: string): string =>
  lang === "sk" ? `„${text}“` : lang === "hu" ? `„${text}”` : `"${text}"`;

const skParticiple = (verb: Verb, form: "m" | "f" | "n" | "plAnimate" | "plOther" | "gen"): string => {
  const stem = verb === "delete" ? "zmazan" : "archivovan";
  const suffix = { m: "ý", f: "á", n: "é", plAnimate: "í", plOther: "é", gen: "ých" }[form];
  return stem + suffix;
};

const skBe = (gender: Gender): string => (gender === "m" ? "bol" : gender === "f" ? "bola" : "bolo");

const huVerb = (verb: Verb): string => (verb === "delete" ? "törölve" : "archiválva");
const enVerb = (verb: Verb): string => (verb === "delete" ? "deleted" : "archived");

/** `Task "Calculation" deleted` — one entity, named. */
export function singleMessage(lang: Lang, entity: EntityKey, verb: Verb, title: string | null | undefined): string {
  const e: EntityLabel = ENTITY[entity];
  const name = trimTitle(title);
  if (lang === "sk") {
    const g = e.sk.gender;
    const participle = skParticiple(verb, g);
    return name
      ? `${e.sk.one} ${quote(lang, name)} ${skBe(g)} ${participle}`
      : `${e.sk.one} ${skBe(g)} ${participle}`;
  }
  if (lang === "hu") {
    return name ? `A ${quote(lang, name)} ${e.hu} ${huVerb(verb)}` : `A ${e.hu} ${huVerb(verb)}`;
  }
  return name ? `${e.en[0]} ${quote(lang, name)} ${enVerb(verb)}` : `${e.en[0]} ${enVerb(verb)}`;
}

/** `3 tasks deleted` — one hold, one toast, one Undo for a whole selection. */
export function bulkMessage(lang: Lang, entity: EntityKey, verb: Verb, count: number): string {
  const e: EntityLabel = ENTITY[entity];
  if (lang === "sk") {
    if (count === 1) return `1 ${e.sk.one.toLowerCase()} ${skBe(e.sk.gender)} ${skParticiple(verb, e.sk.gender)}`;
    if (count >= 2 && count <= 4) {
      const form = e.sk.animate ? "plAnimate" : "plOther";
      return `${count} ${e.sk.few} ${skParticiple(verb, form)}`;
    }
    return `${count} ${e.sk.many} ${skParticiple(verb, "gen")}`;
  }
  if (lang === "hu") return `${count} ${e.hu} ${huVerb(verb)}`;
  return `${count} ${count === 1 ? e.en[0].toLowerCase() : e.en[1]} ${enVerb(verb)}`;
}
