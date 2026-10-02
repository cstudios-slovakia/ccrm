#!/usr/bin/env node
/**
 * Publishes a validated article to Craft through the `ccrm-news` module
 * (docs/release-notes/craft-module/). Uploads the screenshots, then creates — or,
 * on a re-run, replaces — the `updateNotes` entry for the version.
 *
 *   node scripts/release-notes/publish.mjs <runDir>             publish (live or draft, per RELEASE_NOTES_PUBLISH)
 *   node scripts/release-notes/publish.mjs <runDir> --dry-run   build the payload, send nothing
 *   node scripts/release-notes/publish.mjs --check              ask the module whether Craft is set up
 *
 * Refuses to send anything unless validate.mjs passes with DECISION=publish —
 * in the cloud routine the agent runs this itself, so the gate lives here.
 *
 * Configuration, from the environment or RELEASE_NOTES_HOME/.env:
 *   CRAFT_NEWS_BASE         https://ccrm.softwaresolutions.sk   (site URL the module answers on)
 *   CRAFT_NEWS_TOKEN        manual runs only; a cloud session gets it from the environment's API credential
 *   RELEASE_NOTES_PUBLISH   live (default) | draft — draft saves the entry disabled
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, SITE_FOR_LANG, craftNews as call, loadEnv, parseArgs, readJson, writeJson } from './lib.mjs';

loadEnv();
const args = parseArgs();
const MODE = (process.env.RELEASE_NOTES_PUBLISH ?? 'live').toLowerCase();
const dryRun = !!args['dry-run'];

/* ---------------------------------------------------------------- check -- */

if (args.check) {
  const ping = await call('ccrm-news/ping');
  console.log(JSON.stringify(ping, null, 2));
  if (ping.missing?.length) {
    console.log(`\nCraft is missing: ${ping.missing.join(', ')} — see docs/RELEASE-NOTES.md, "Craft CMS changes".`);
    process.exit(1);
  }
  console.log('\nCraft is ready for automated release notes.');
  process.exit(0);
}

/* -------------------------------------------------------------- publish -- */

const runDir = args._[0];
if (!runDir) {
  console.error('Usage: node scripts/release-notes/publish.mjs <runDir> [--dry-run] | --check');
  process.exit(1);
}
const gate = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate.mjs'), runDir], { encoding: 'utf8' });
if (gate.status !== 0 || !/DECISION=publish/.test(gate.stdout)) {
  console.error(`Not publishing: validate.mjs did not pass with DECISION=publish.
${gate.stdout}${gate.stderr}`);
  process.exit(1);
}

const context = readJson(path.join(runDir, 'context.json'));
const article = readJson(path.join(runDir, 'article.json'));

const ping = dryRun
  ? { translatable: {}, missing: [] }
  : await call('ccrm-news/ping');
const usedTypes = [...new Set(article.blocks.map((b) => b.type))];
const missingTypes = usedTypes.filter((t) => (ping.missing ?? []).includes(`blockType:${t}`));
if (missingTypes.length) {
  console.error(`Craft has no matrix entry type for: ${missingTypes.join(', ')}. Create them (docs/RELEASE-NOTES.md) or re-run after.`);
  process.exit(1);
}

// Screenshots in every language only when Craft keeps image relations per site;
// otherwise all sites share the Slovak ones.
const perSiteImages = !!(ping.translatable?.image && ping.translatable?.images);
const shotLangs = perSiteImages ? LANGS : ['sk'];

const cacheFile = path.join(runDir, 'assets.json');
const cache = fs.existsSync(cacheFile) ? readJson(cacheFile) : {};
const usedShots = [...new Set(article.blocks.flatMap((b) => (b.image ? [b.image] : b.images ?? [])))];
const versionSlug = article.version.replace(/\./g, '-');
let fakeId = 900000;

for (const lang of shotLangs) {
  for (const name of usedShots) {
    const key = `${lang}/${name}`;
    if (cache[key]) continue;
    const file = path.join(runDir, 'shots', lang, `${name}.png`);
    const title = article.captions?.[name]?.[lang] ?? name;
    if (dryRun) {
      cache[key] = { assetId: ++fakeId, url: `(dry-run) ${file}` };
      continue;
    }
    const form = new FormData();
    form.append('version', article.version);
    form.append('filename', `${versionSlug}-${name}-${lang}.png`);
    form.append('title', title);
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/png' }), `${name}.png`);
    const res = await call('ccrm-news/asset', { method: 'POST', body: form });
    cache[key] = { assetId: res.assetId, url: res.url };
    writeJson(cacheFile, cache); // a retry after a failure re-uses what already went up
    console.log(`[release-notes] uploaded ${key} → asset #${res.assetId}`);
  }
}
writeJson(cacheFile, cache);

const assetId = (lang, name) => (cache[`${perSiteImages ? lang : 'sk'}/${name}`] ?? {}).assetId;

/** Same defaults the app shows for a list without a heading (UpdateNoteBlocks.tsx). */
const LIST_HEADINGS = {
  fixes: { sk: 'Opravené chyby', en: 'Bug fixes', hu: 'Javított hibák' },
  improvements: { sk: 'Vylepšenia', en: 'Improvements', hu: 'Fejlesztések' },
};

function toCraftBlock(b, lang) {
  switch (b.type) {
    case 'textblock':
      return { type: 'textblock', fields: { text: b.text[lang] } };
    case 'image':
      return { type: 'image', fields: { image: [assetId(lang, b.image)] } };
    case 'imageWithText':
      return { type: 'imageWithText', fields: { image: [assetId(lang, b.image)], text: b.text[lang], imageDirection: b.imageDirection === 'right' } };
    case 'gallery':
      return { type: 'gallery', fields: { images: b.images.map((n) => assetId(lang, n)), galleryColumns: b.galleryColumns } };
    case 'heading':
      return { type: 'heading', fields: { headingText: b.headingText[lang], headingLevel: b.headingLevel, moduleTag: b.moduleTag?.[lang] ?? '' } };
    case 'callout':
      return { type: 'callout', fields: { calloutType: b.calloutType, text: b.text[lang] } };
    case 'changeList':
      // The heading is the block's (required) Title in Craft, so it is never sent empty.
      return { type: 'changeList', fields: { listType: b.listType, headingText: b.headingText?.[lang] || LIST_HEADINGS[b.listType][lang], listItems: b.listItems[lang].join('\n') } };
    default:
      throw new Error(`Unknown block type ${b.type}`);
  }
}

const payload = {
  version: article.version,
  releaseType: article.releaseType,
  sourceCommit: context.headSha,
  enabled: MODE !== 'draft',
  postDate: new Date().toISOString(),
  sites: Object.fromEntries(
    LANGS.map((lang) => [SITE_FOR_LANG[lang], { title: article.title[lang], blocks: article.blocks.map((b) => toCraftBlock(b, lang)) }]),
  ),
};
writeJson(path.join(runDir, 'publish-payload.json'), payload);

if (dryRun) {
  console.log(`[release-notes] dry run: payload written to ${path.join(runDir, 'publish-payload.json')}`);
  process.exit(0);
}

const result = await call('ccrm-news/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
writeJson(path.join(runDir, 'publish.json'), result);
console.log(`[release-notes] ${result.created ? 'created' : 'updated'} entry #${result.entryId} "${article.title.sk}" (${payload.enabled ? 'live' : 'draft'})`);
if (result.skippedSites?.length) console.log(`[release-notes] not translated in Craft, left as Slovak: ${result.skippedSites.join('; ')}`);
if (result.cpEditUrl) console.log(`[release-notes] ${result.cpEditUrl}`);
