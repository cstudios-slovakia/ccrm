import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_SECTION_REFS,
  LEGACY_SETTINGS_ROUTES,
  SETTINGS_CATEGORIES,
  SETTINGS_GROUP_ORDER,
  categoryKey,
  cleanRecents,
  findCategory,
  firstVisibleRef,
  groupLabelKey,
  isSectionVisible,
  parseSettingsRoute,
  pushRecent,
  resolveSectionRef,
  sectionKey,
  visibleCategories,
  visibleGroups,
} from "./settingsRegistry.ts";
import type { SettingsVisibilityContext } from "./settingsRegistry.ts";
import { buildSearchIndex, foldText, highlightSegments, searchSettings } from "./settingsSearch.ts";
import { settingsNavEn, settingsNavHu, settingsNavSk } from "../../utils/translations.settingsNav.ts";

const LANGS = { en: settingsNavEn, sk: settingsNavSk, hu: settingsNavHu } as const;

// The tab ids of the old SETTINGS_TABS list (plus `general`, which only old notes use).
const OLD_TAB_IDS = [
  "branding", "modules", "license", "invoicing", "projects", "tickets", "orders", "tasks",
  "finance", "unified", "sources", "states", "managers", "rbac", "email", "api", "ads",
  "social", "ai", "errors", "audit", "danger", "general",
];

const everything = (over: Partial<SettingsVisibilityContext> = {}): SettingsVisibilityContext => ({
  getPermission: () => "edit",
  isAdmin: true,
  flags: { social: true, projectAutoCreate: true },
  ...over,
});

const allKeys = (): string[] => {
  const keys: string[] = [];
  for (const g of SETTINGS_GROUP_ORDER) keys.push(groupLabelKey(g));
  for (const c of SETTINGS_CATEGORIES) {
    for (const part of ["title", "desc", "hint", "subtitle", "help_title", "help_body"] as const) keys.push(categoryKey(c.id, part));
    for (const s of c.sections) for (const part of ["title", "hint", "kw"] as const) keys.push(sectionKey(c.id, s.id, part));
    for (const r of c.related) keys.push(r.labelKey);
  }
  return keys;
};

test("every category, section and related link has en, sk and hu text", () => {
  for (const [lang, table] of Object.entries(LANGS)) {
    for (const key of allKeys()) {
      assert.ok(table[key] && table[key].trim().length > 0, `${lang} is missing ${key}`);
    }
  }
});

test("the three languages carry exactly the same keys", () => {
  const en = Object.keys(settingsNavEn).sort();
  assert.deepEqual(Object.keys(settingsNavSk).sort(), en);
  assert.deepEqual(Object.keys(settingsNavHu).sort(), en);
});

test("placeholders survive translation", () => {
  for (const key of Object.keys(settingsNavEn)) {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    assert.equal(names(settingsNavSk[key]), names(settingsNavEn[key]), `sk placeholders differ in ${key}`);
    assert.equal(names(settingsNavHu[key]), names(settingsNavEn[key]), `hu placeholders differ in ${key}`);
  }
});

test("no emoji anywhere in the settings navigation text", () => {
  const emoji = /[☀-➿️\u{1F300}-\u{1FAFF}]/u;
  for (const [lang, table] of Object.entries(LANGS)) {
    for (const [key, value] of Object.entries(table)) assert.ok(!emoji.test(value), `${lang} ${key} contains an emoji`);
  }
});

test("tile text stays within the two-line budget", () => {
  for (const c of SETTINGS_CATEGORIES) {
    for (const [lang, table] of Object.entries(LANGS)) {
      assert.ok(table[categoryKey(c.id, "desc")].length <= 110, `${lang} ${c.id} description is too long for two lines`);
      assert.ok(table[categoryKey(c.id, "hint")].length <= 56, `${lang} ${c.id} phone hint is too long for two lines`);
    }
  }
});

test("section ids are unique inside a category and refs are unique overall", () => {
  for (const c of SETTINGS_CATEGORIES) {
    assert.equal(new Set(c.sections.map((s) => s.id)).size, c.sections.length, `${c.id} repeats a section id`);
  }
  assert.equal(new Set(ALL_SECTION_REFS).size, ALL_SECTION_REFS.length);
});

test("12 categories in three groups, in the approved order", () => {
  assert.deepEqual(
    SETTINGS_CATEGORIES.map((c) => c.id),
    ["company", "access", "modules", "leads", "projects", "offers", "orders", "finance", "tickets", "email", "integrations", "system"],
  );
  assert.deepEqual(visibleGroups(everything()).map((g) => [g.id, g.categories.length]), [["organization", 3], ["work", 6], ["connections", 3]]);
});

test("related links point at sections that exist", () => {
  for (const c of SETTINGS_CATEGORIES) {
    for (const r of c.related) assert.ok(resolveSectionRef(r.to), `${c.id} links to unknown ${r.to}`);
  }
});

test("every old #settings/<id> lands on a real category or section", () => {
  for (const id of OLD_TAB_IDS) {
    const parsed = parseSettingsRoute(`settings/${id}`);
    assert.equal(parsed.kind, "category", `settings/${id} did not resolve`);
    const category = findCategory(parsed.categoryId);
    assert.ok(category, `settings/${id} -> unknown category ${parsed.categoryId}`);
    if (parsed.sectionId) assert.ok(resolveSectionRef(`${parsed.categoryId}/${parsed.sectionId}`), `settings/${id} -> unknown section`);
  }
});

test("old ids that are not categories are rewritten to the new route", () => {
  assert.equal(parseSettingsRoute("settings/invoicing").redirectTo, "settings/company/billing");
  assert.equal(parseSettingsRoute("settings/branding").redirectTo, "settings/company/profile");
  assert.equal(parseSettingsRoute("settings/managers").redirectTo, "settings/access/users");
  assert.equal(parseSettingsRoute("settings/rbac").redirectTo, "settings/access/roles");
  assert.equal(parseSettingsRoute("settings/danger").redirectTo, "settings/system/reset");
  assert.equal(parseSettingsRoute("settings/states").redirectTo, "settings/leads/stages");
  assert.equal(parseSettingsRoute("settings/tasks").redirectTo, "settings/projects/tasks");
  assert.equal(parseSettingsRoute("settings/ai").redirectTo, "settings/integrations/ai");
  for (const [oldId, target] of Object.entries(LEGACY_SETTINGS_ROUTES)) {
    assert.ok(resolveSectionRef(target), `${oldId} -> ${target} does not exist`);
  }
});

test("old ids that are also categories open that category without a redirect", () => {
  for (const id of ["projects", "tickets", "orders", "finance", "email", "modules"]) {
    const p = parseSettingsRoute(`settings/${id}`);
    assert.equal(p.categoryId, id);
    assert.equal(p.sectionId, null);
    assert.equal(p.redirectTo, null);
  }
});

test("the custom record types keep their create / edit sub-routes", () => {
  const created = parseSettingsRoute("settings/unified/new");
  assert.equal(created.redirectTo, "settings/modules/records/new");
  assert.deepEqual(created.rest, ["new"]);
  const edited = parseSettingsRoute("settings/modules/records/edit/ue_7");
  assert.equal(edited.categoryId, "modules");
  assert.equal(edited.sectionId, "records");
  assert.deepEqual(edited.rest, ["edit", "ue_7"]);
  assert.equal(edited.redirectTo, null);
});

test("current routes parse as they are written; unknown ones fall home", () => {
  const p = parseSettingsRoute("settings/company/billing");
  assert.deepEqual([p.kind, p.categoryId, p.sectionId, p.redirectTo], ["category", "company", "billing", null]);
  assert.equal(parseSettingsRoute("settings").kind, "home");
  assert.equal(parseSettingsRoute("settings/nonsense").kind, "home");
  const typo = parseSettingsRoute("settings/company/nope");
  assert.equal(typo.categoryId, "company");
  assert.equal(typo.sectionId, null);
  assert.equal(typo.redirectTo, "settings/company");
  assert.equal(parseSettingsRoute("settings/company/billing?x=1").sectionId, "billing");
});

test("a category with no permitted section is hidden, others stay", () => {
  const onlyTraffic = everything({ getPermission: (k) => (k === "traffic_sources" ? "view" : "nothing"), isAdmin: false });
  const ids = visibleCategories(onlyTraffic).map((c) => c.def.id);
  assert.deepEqual(ids, ["company", "leads", "projects"]);
  const company = visibleCategories(onlyTraffic).find((c) => c.def.id === "company")!;
  assert.deepEqual(company.sections.map((s) => s.id), ["divisions"]);

  const nothing = everything({ getPermission: () => "nothing", isAdmin: false });
  assert.deepEqual(visibleCategories(nothing), []);
  assert.equal(firstVisibleRef(nothing), null);
});

test("each section keeps the permission its old tab used", () => {
  const perm = (ref: string) => resolveSectionRef(ref)!.section.permKey;
  assert.equal(perm("company/profile"), "general_config");
  assert.equal(perm("company/divisions"), "traffic_sources");
  assert.equal(perm("access/users"), "pm_managers");
  assert.equal(perm("access/roles"), "pm_managers");
  assert.equal(perm("leads/stages"), "pipeline_stages");
  assert.equal(perm("leads/assignment"), "pipeline_stages");
  assert.equal(perm("leads/sources"), "traffic_sources");
  assert.equal(perm("finance/ledger"), "financial");
  assert.equal(perm("integrations/ai"), "ai_config");
  assert.equal(perm("system/reset"), "system_reset");
});

test("the audit log is administrators only, whatever the permission says", () => {
  const audit = resolveSectionRef("access/audit")!.section;
  assert.equal(isSectionVisible(audit, everything({ isAdmin: false })), false);
  assert.equal(isSectionVisible(audit, everything({ isAdmin: true })), true);
});

test("social media stays behind its feature flag", () => {
  const social = resolveSectionRef("integrations/social")!.section;
  assert.equal(isSectionVisible(social, everything({ flags: { social: false, projectAutoCreate: true } })), false);
  assert.equal(isSectionVisible(social, everything()), true);
});

test("recents are capped, de-duplicated and cleaned of dead ids", () => {
  let r: string[] = [];
  for (const ref of ["company/profile", "leads/stages", "company/profile", "email/outgoing"]) r = pushRecent(r, ref);
  assert.deepEqual(r, ["email/outgoing", "company/profile", "leads/stages"]);
  assert.equal(pushRecent(["a/1", "a/2", "a/3", "a/4", "a/5", "a/6"], "b/1").length, 6);
  assert.deepEqual(cleanRecents(["company/profile", "gone/section", 4, "company/profile", "access/audit"], everything({ isAdmin: false })), ["company/profile"]);
  assert.deepEqual(cleanRecents("nope", everything()), []);
});

// ── search ────────────────────────────────────────────────────────────────────

const indexFor = (lang: keyof typeof LANGS, ctx = everything()) =>
  buildSearchIndex(visibleCategories(ctx), (k) => LANGS[lang][k] ?? k);

test("foldText drops accents and case", () => {
  assert.equal(foldText("IČO"), "ico");
  assert.equal(foldText("Šablóny ponúk"), "sablony ponuk");
  assert.equal(foldText("Számlázási adatok, őrű"), "szamlazasi adatok, oru");
});

test("search finds IČO, with and without diacritics", () => {
  for (const q of ["IČO", "ico", "ICO"]) {
    const refs = searchSettings(indexFor("en"), q).flatMap((g) => g.hits.map((h) => h.ref));
    assert.ok(refs.includes("company/billing"), `"${q}" should find Billing details`);
  }
});

test("search finds SMTP in the outgoing server, the test send and ticket intake", () => {
  const refs = searchSettings(indexFor("en"), "SMTP").flatMap((g) => g.hits.map((h) => h.ref));
  for (const want of ["email/outgoing", "email/test", "tickets/intake"]) assert.ok(refs.includes(want), `SMTP should find ${want}`);
});

test("search works in the other languages and across words", () => {
  const sk = searchSettings(indexFor("sk"), "fakturacne").flatMap((g) => g.hits.map((h) => h.ref));
  assert.ok(sk.includes("company/billing"));
  const hu = searchSettings(indexFor("hu"), "szamlazasi").flatMap((g) => g.hits.map((h) => h.ref));
  assert.ok(hu.includes("company/billing"));
  const two = searchSettings(indexFor("en"), "payment due");
  assert.deepEqual(two.flatMap((g) => g.hits.map((h) => h.ref)).slice(0, 1), ["offers/defaults"]);
});

test("search shows only what the user may see", () => {
  const ctx = everything({ getPermission: (k) => (k === "general_config" ? "view" : "nothing"), isAdmin: false });
  const refs = searchSettings(indexFor("en", ctx), "roles").flatMap((g) => g.hits.map((h) => h.ref));
  assert.ok(!refs.includes("access/roles"));
  assert.deepEqual(searchSettings(indexFor("en", ctx), "pipeline stages"), []);
});

test("search ranks a title match first and groups by category", () => {
  const groups = searchSettings(indexFor("en"), "invoice");
  assert.equal(groups[0].categoryId, "offers");
  assert.equal(groups[0].hits[0].ref, "offers/defaults");
  assert.equal(new Set(groups.map((g) => g.categoryId)).size, groups.length);
  assert.deepEqual(searchSettings(indexFor("en"), "   "), []);
  assert.deepEqual(searchSettings(indexFor("en"), "zzzzqq"), []);
});

test("highlight keeps the original characters", () => {
  assert.deepEqual(highlightSegments("IČO, DIČ, IČ DPH", "ico"), [
    { text: "IČO", match: true },
    { text: ", DIČ, IČ DPH", match: false },
  ]);
  assert.deepEqual(highlightSegments("Payment methods", "pay meth"), [
    { text: "Pay", match: true },
    { text: "ment ", match: false },
    { text: "meth", match: true },
    { text: "ods", match: false },
  ]);
  assert.deepEqual(highlightSegments("Nothing here", "xyz"), [{ text: "Nothing here", match: false }]);
  assert.deepEqual(highlightSegments("Anything", ""), [{ text: "Anything", match: false }]);
});
