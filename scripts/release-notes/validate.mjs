#!/usr/bin/env node
/**
 * The gate between the agent and Craft. Checks `classification.json` and, when
 * the decision is to publish, `article.json` against the article contract in
 * .agents/skills/ccrm-release-notes/SKILL.md. The agent runs it until it passes;
 * the scheduled run runs it again before publishing anything.
 *
 *   node scripts/release-notes/validate.mjs <runDir>
 *
 * Exit 0 and prints DECISION=publish|skip when valid; exit 1 with the list of problems otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGS, readJson } from './lib.mjs';

const runDir = process.argv[2];
if (!runDir || !fs.existsSync(path.join(runDir, 'context.json'))) {
  console.error('Usage: node scripts/release-notes/validate.mjs <runDir>  (a directory prepared by detect.mjs)');
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const context = readJson(path.join(runDir, 'context.json'));

/* ------------------------------------------------------- classification -- */

const CATEGORIES = ['feature', 'improvement', 'fix', 'excluded'];
const EXCLUSIONS = ['visual-polish', 'backend-invisible', 'dev-tooling', 'refactor', 'docs', 'tests', 'build', 'admin-ops', 'revert', 'already-announced', 'not-shipped'];

let classification = null;
try {
  classification = readJson(path.join(runDir, 'classification.json'));
} catch (e) {
  err(`classification.json missing or not JSON (${e.message})`);
}

let decision = null;
let shippedFixes = 0;
if (classification) {
  decision = classification.decision;
  if (!['publish', 'skip'].includes(decision)) err('classification.decision must be "publish" or "skip"');
  if (classification.kind !== context.kind) err(`classification.kind is "${classification.kind}", detect.mjs said "${context.kind}"`);
  if (!classification.reason?.trim()) err('classification.reason is empty — one or two sentences on why');
  const items = Array.isArray(classification.items) ? classification.items : [];
  if (!items.length) err('classification.items is empty — every commit in range must be accounted for');

  const covered = new Set();
  items.forEach((it, i) => {
    const where = `classification.items[${i}] "${it.title ?? '?'}"`;
    if (!CATEGORIES.includes(it.category)) err(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
    if (!it.title?.trim()) err(`${where}: title is empty`);
    if (!it.evidence?.trim()) err(`${where}: evidence is empty — say what in the diff/changelog shows it`);
    if (!Array.isArray(it.commits) || !it.commits.length) err(`${where}: commits[] is empty`);
    for (const c of it.commits ?? []) covered.add(String(c).slice(0, 7));
    if (it.category === 'excluded' && !EXCLUSIONS.includes(it.excludedBecause)) {
      err(`${where}: excluded items need excludedBecause ∈ ${EXCLUSIONS.join(', ')}`);
    }
  });
  const missing = context.commits.filter((c) => !covered.has(c.sha.slice(0, 7)));
  if (missing.length) err(`${missing.length} commit(s) not in any classification item: ${missing.slice(0, 10).map((c) => c.short).join(', ')}${missing.length > 10 ? ' …' : ''}`);

  const announceable = items.filter((it) => ['feature', 'improvement', 'fix'].includes(it.category));
  shippedFixes = items.filter((it) => it.category === 'fix').length;
  if (decision === 'skip' && announceable.length) err(`decision is "skip" but ${announceable.length} item(s) are feature/improvement/fix`);
  if (decision === 'publish' && !announceable.length) err('decision is "publish" but no item is a feature, improvement or fix');
}

/* -------------------------------------------------------------- article -- */

const BLOCKS = {
  textblock: { text: 'html' },
  image: { image: 'shot' },
  imageWithText: { image: 'shot', text: 'html', imageDirection: ['left', 'right'] },
  gallery: { images: 'shots', galleryColumns: ['2', '3'] },
  heading: { headingText: 'text', headingLevel: ['h2', 'h3'], moduleTag: 'text?' },
  callout: { calloutType: ['where', 'tip', 'info', 'warning'], text: 'html' },
  changeList: { listType: ['fixes', 'improvements'], headingText: 'text?', listItems: 'items' },
};
const IMAGE_BLOCKS = ['image', 'imageWithText', 'gallery'];
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'code', 'br']);

const shotFile = (lang, name) => path.join(runDir, 'shots', lang, `${name}.png`);
const manifests = Object.fromEntries(
  LANGS.map((lang) => {
    try {
      return [lang, readJson(path.join(runDir, 'shots', lang, 'shots.json'))];
    } catch {
      return [lang, {}];
    }
  }),
);

function checkLocalized(value, where, { html = false, optional = false } = {}) {
  if (value === undefined || value === null) {
    if (!optional) err(`${where}: missing`);
    return;
  }
  if (typeof value !== 'object') return err(`${where}: must be { sk, en, hu }`);
  for (const lang of LANGS) {
    const s = value[lang];
    if (typeof s !== 'string' || !s.trim()) {
      err(`${where}.${lang}: empty`);
      continue;
    }
    if (html) {
      for (const m of s.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
        const tag = m[1].toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) err(`${where}.${lang}: <${tag}> is not allowed (allowed: ${[...ALLOWED_TAGS].join(', ')})`);
        const attrs = m[2].trim();
        if (attrs && !(tag === 'a' && /^href="https?:\/\/[^"]+"$/.test(attrs))) err(`${where}.${lang}: attributes are not allowed on <${tag}> (${attrs.slice(0, 40)})`);
      }
      if (!/^\s*</.test(s)) err(`${where}.${lang}: HTML must start with a tag, e.g. <p>`);
    } else if (/<[a-z]/i.test(s)) err(`${where}.${lang}: plain text field contains HTML`);
  }
}

function checkShot(name, where) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) return err(`${where}: "${name}" is not a shot name (kebab-case, no extension)`);
  for (const lang of LANGS) {
    const file = shotFile(lang, name);
    if (!fs.existsSync(file)) err(`${where}: shots/${lang}/${name}.png does not exist`);
    else if (fs.statSync(file).size > 6 * 1024 * 1024) warn(`${where}: shots/${lang}/${name}.png is over 6 MB`);
  }
  usedShots.add(name);
}

const usedShots = new Set();
let article = null;
if (decision === 'publish') {
  try {
    article = readJson(path.join(runDir, 'article.json'));
  } catch (e) {
    err(`article.json missing or not JSON (${e.message})`);
  }
}

if (article) {
  if (article.version !== context.craftVersion) err(`article.version is "${article.version}", must be "${context.craftVersion}"`);
  if (article.releaseType !== context.kind) err(`article.releaseType is "${article.releaseType}", must be "${context.kind}"`);
  checkLocalized(article.title, 'title');
  for (const lang of LANGS) {
    const t = article.title?.[lang] ?? '';
    if (t && !t.includes(context.craftVersion)) err(`title.${lang} must contain the version "${context.craftVersion}"`);
    if (t.length > 110) err(`title.${lang} is ${t.length} chars, keep it under 110`);
  }

  const blocks = Array.isArray(article.blocks) ? article.blocks : [];
  if (!blocks.length) err('article.blocks is empty');
  if (blocks[0] && blocks[0].type !== 'textblock') err('the first block must be a textblock: the intro paragraph');

  blocks.forEach((b, i) => {
    const where = `blocks[${i}] (${b?.type})`;
    const spec = BLOCKS[b?.type];
    if (!spec) return err(`${where}: unknown type, use one of ${Object.keys(BLOCKS).join(', ')}`);
    for (const key of Object.keys(b)) if (key !== 'type' && !(key in spec)) err(`${where}: unknown field "${key}"`);
    for (const [key, kind] of Object.entries(spec)) {
      const v = b[key];
      if (Array.isArray(kind)) {
        if (!kind.includes(v)) err(`${where}.${key} must be one of ${kind.join(', ')}`);
      } else if (kind === 'html') checkLocalized(v, `${where}.${key}`, { html: true });
      else if (kind === 'text') checkLocalized(v, `${where}.${key}`);
      else if (kind === 'text?') checkLocalized(v, `${where}.${key}`, { optional: true });
      else if (kind === 'shot') checkShot(v, `${where}.${key}`);
      else if (kind === 'shots') {
        if (!Array.isArray(v) || v.length < 2 || v.length > 12) err(`${where}.${key}: a gallery holds 2–12 shots`);
        else v.forEach((s, j) => checkShot(s, `${where}.${key}[${j}]`));
      } else if (kind === 'items') {
        const counts = LANGS.map((lang) => (Array.isArray(v?.[lang]) ? v[lang].length : -1));
        if (counts.some((n) => n < 1)) err(`${where}.${key}: needs a non-empty array per language`);
        else if (new Set(counts).size !== 1) err(`${where}.${key}: languages have different item counts (${counts.join('/')})`);
        for (const lang of LANGS) for (const item of v?.[lang] ?? []) {
          if (typeof item !== 'string' || !item.trim() || /\n/.test(item)) err(`${where}.${key}.${lang}: each item is one non-empty line`);
          else if (/<[a-z]/i.test(item)) err(`${where}.${key}.${lang}: items are plain text`);
        }
      }
    }
  });

  // Every feature heading (h3) is followed by at least one screenshot before the next heading or list.
  blocks.forEach((b, i) => {
    if (b?.type !== 'heading' || b.headingLevel !== 'h3') return;
    let hasImage = false;
    for (let j = i + 1; j < blocks.length && !['heading', 'changeList'].includes(blocks[j]?.type); j++) {
      if (IMAGE_BLOCKS.includes(blocks[j]?.type)) hasImage = true;
    }
    if (!hasImage) err(`blocks[${i}] heading "${b.headingText?.sk}": a feature section needs at least one image, imageWithText or gallery`);
  });

  // Lists close the article: nothing but lists after the first one.
  const firstList = blocks.findIndex((b) => b?.type === 'changeList');
  if (firstList >= 0) {
    blocks.slice(firstList).forEach((b, k) => {
      if (b?.type !== 'changeList') err(`blocks[${firstList + k}] (${b?.type}): only changeList blocks may follow the first changeList`);
    });
  }
  const fixesLists = blocks.filter((b) => b?.type === 'changeList' && b.listType === 'fixes');
  if (shippedFixes > 0 && !fixesLists.length) err(`classification has ${shippedFixes} fix item(s) but the article has no changeList with listType "fixes"`);
  if (fixesLists.length > 1) err('use one "fixes" changeList');

  const headingsH3 = blocks.filter((b) => b?.type === 'heading' && b.headingLevel === 'h3').length;
  const imageBlocks = blocks.filter((b) => IMAGE_BLOCKS.includes(b?.type)).length;
  if (context.kind === 'major') {
    if (!blocks.some((b) => b?.type === 'heading' && b.headingLevel === 'h2')) err('a major article groups its features under an h2 heading');
    if (headingsH3 < 2) err(`a major article documents each new feature under its own h3 heading (found ${headingsH3})`);
  }
  if (classification?.items?.some((it) => it.category === 'feature') && imageBlocks === 0) err('new features need screenshots — the article has no image blocks');

  // Captions: one per used shot, in every language. Unused captions are probably a typo.
  const captions = article.captions ?? {};
  for (const name of usedShots) checkLocalized(captions[name], `captions["${name}"]`);
  for (const name of Object.keys(captions)) if (!usedShots.has(name)) warn(`captions["${name}"] belongs to no block`);

  // Numbered marks on a screenshot should be explained in the text next to it.
  for (const name of usedShots) {
    const marks = manifests.sk?.[name]?.marks ?? [];
    if (marks.length > 1) {
      const idx = blocks.findIndex((b) => b?.image === name || b?.images?.includes(name));
      const near = blocks.slice(Math.max(0, idx - 2), idx + 3).map((b) => JSON.stringify(b?.text?.sk ?? b?.listItems?.sk ?? '')).join(' ');
      for (const m of marks) if (!near.includes(`(${m.n})`)) err(`shot "${name}" has mark (${m.n}) "${m.label}" that the text next to it never explains — write "(${m.n}) …" in it`);
    }
  }
}

/* --------------------------------------------------------------- report -- */

for (const w of warnings) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`ERROR: ${e}`);
  console.log(`\n${errors.length} problem(s). Fix them and run again.`);
  process.exit(1);
}
console.log(`Valid. ${article ? `${article.blocks.length} blocks, ${usedShots.size} screenshots.` : ''}`);
console.log(`DECISION=${decision}`);
