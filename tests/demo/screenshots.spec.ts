import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installDemoBackend } from './demoMocks';

/**
 * Captures the presentation screenshots, one file per numbered section of the
 * marketing site's feature nav (01 Obchod & Zákazky … 10 Vlastné evidencie).
 *
 * Nothing here asserts product behaviour — a failure means the app did not
 * render in time, not that a feature is broken. Run it with `npm run shots`.
 */

const OUT = 'presentation-screenshots';

let counter = 0;

/* Not wiped: file names are stable, so a run overwrites what it produces. A
   `--grep`ped run of one section would otherwise delete the other nine. */
test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await installDemoBackend(page);
});

/**
 * Hash routing means changing only the fragment keeps React mounted, so a view
 * would inherit whatever sub-tab or filter the previous shot left behind. A
 * throwaway query parameter forces a real document load every time.
 */
async function open(page: Page, hash: string) {
  counter++;
  const fragment = hash.startsWith('#') ? hash : `#${hash}`;
  await page.goto(`/?shot=${counter}${fragment}`, { waitUntil: 'domcontentloaded' });
  await ready(page);

  /* Views are lazy chunks and the dev server compiles them on first request. On
     a cold run that occasionally overshoots the wait, and the shot that follows
     would be of an empty workspace. One reload is enough — the chunk is built
     by then — and a silently blank screenshot is the one failure mode this
     whole run exists to avoid. */
  const empty = await page.evaluate(() => ((document.querySelector('main') as HTMLElement | null)?.innerText ?? '').trim().length < 120);
  if (empty) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
  }
}

async function ready(page: Page) {
  const preset = page.locator('button:has-text("erik@rekonstav.sk"), button:has-text("Erik")').first();
  if (await preset.isVisible({ timeout: 700 }).catch(() => false)) {
    await preset.click({ force: true }).catch(() => {});
  }
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  // Every view is a lazy chunk: wait for real content, not the Suspense spinner.
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector('main');
        if (!main) return false;
        if (main.querySelector('.animate-spin')) return false;
        return ((main as HTMLElement).innerText ?? '').trim().length > 80;
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  // framer-motion enter animations and Chart.js first paint.
  await page.waitForTimeout(1400);
}

/** Whole app shell — sidebar plus workspace. The default framing. */
async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Just the workspace, for a tighter crop when the sidebar adds nothing. */
async function shotMain(page: Page, name: string) {
  const main = page.locator('main').first();
  await main.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => shot(page, name));
}

/**
 * Scrolls the workspace down before shooting.
 *
 * `main` is the scroll container, not the window, so `window.scrollBy` does
 * nothing here. Used where the interesting thing — a cash-flow chart, an
 * analytics panel — starts below the fold.
 */
async function shotScrolled(page: Page, name: string, y: number) {
  await page.evaluate((offset) => document.querySelector('main')?.scrollTo({ top: offset }), y);
  await page.waitForTimeout(700);
  await shot(page, name);
  await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }));
}

/**
 * Clicks the first visible match of any of the given texts.
 *
 * Half of what these shots need to open — a meeting, a project, a workflow — is
 * a clickable `<div>` card, not a button or a link, so a role-based query alone
 * finds nothing. `getByText` resolves to the innermost node holding the label
 * and the click bubbles up to whichever ancestor carries the handler.
 */
async function clickText(page: Page, texts: string[], timeout = 2500) {
  for (const text of texts) {
    const byRole = page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="tab"]:has-text("${text}")`).first();
    if (await byRole.isVisible({ timeout }).catch(() => false)) {
      await byRole.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1100);
      return true;
    }
    const byText = page.getByText(text, { exact: false }).first();
    if (await byText.isVisible({ timeout: 800 }).catch(() => false)) {
      await byText.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1100);
      return true;
    }
  }
  return false;
}

/**
 * Expands the navigation rail.
 *
 * The sidebar defaults to the 80px icon rail and the expanded panel *floats over*
 * the workspace, so it is only opened for the shot that is about navigation —
 * everywhere else it would cover the content the screenshot is meant to show.
 */
async function expandSidebar(page: Page) {
  const toggle = page.locator('button[aria-label="Prepnúť navigačný panel"]').first();
  if (!(await toggle.isVisible({ timeout: 2000 }).catch(() => false))) return false;
  await toggle.click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  return true;
}

/* -------------------------------------------------------------------------- */

test('00 — prehľad, navigácia a úlohy', async ({ page }) => {
  /* `#overview` is the marketing performance dashboard; `#dashboard` is the
     widget board and `#tasks` the task panel with the calendar. Only the funnel
     is captured from overview: the KPI cards above it read 0 € because that view
     decides "won" from the English state name `accepted`, which no Slovak
     pipeline uses. See the note in demoData's SETTINGS — fixing it in the data
     would cost the leads screen its phases. */
  await open(page, '#overview');
  await shotScrolled(page, '00-prehlad-lievik', 340);

  await open(page, '#dashboard');
  await shot(page, '00-nastenka');

  if (await expandSidebar(page)) await shot(page, '00-navigacia-moduly');

  await open(page, '#tasks');
  await shot(page, '00-ulohy');
});

test('01 — Obchod & Zákazky', async ({ page }) => {
  await open(page, '#leads');
  await expect(page.locator('main')).toContainText('Novák Stavby', { timeout: 15_000 });
  await shot(page, '01-obchod-zakazky-zoznam');
  // The pipeline header pushes the table down; this frames the rows themselves.
  await shotScrolled(page, '01-obchod-zakazky-tabulka', 420);

  // The list/kanban switch is a pair of small labelled buttons in the toolbar.
  const kanban = page.getByRole('button', { name: /kanban/i }).first();
  if (await kanban.isVisible({ timeout: 3000 }).catch(() => false)) {
    await kanban.click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, '01-obchod-zakazky-kanban');
    await shotMain(page, '01-obchod-zakazky-kanban-detail');
  }
});

test('02 — Adresár & Registre', async ({ page }) => {
  await open(page, '#clients');
  await shot(page, '02-adresar-zoznam');

  await open(page, `#client-${encodeURIComponent('Silvia Hrušková')}`);
  await shot(page, '02-adresar-profil-klienta');
  // The timeline — the part of the profile worth showing — is below the fold.
  await shotScrolled(page, '02-adresar-casova-os', 620);
});

test('03 — Sklad & Hospodárstvo', async ({ page }) => {
  await open(page, '#warehouse');
  await shot(page, '03-sklad-zasoby');
  await shotScrolled(page, '03-sklad-katalog', 440);

  await open(page, '#warehouse/movements');
  await shot(page, '03-sklad-pohyby');

  await open(page, '#warehouse/analytics');
  await shot(page, '03-sklad-analytika');

  await open(page, '#warehouse/suppliers');
  await shot(page, '03-sklad-dodavatelia');
});

test('04 — Financie & Cash Flow', async ({ page }) => {
  await open(page, '#financial/overview');
  await shot(page, '04-financie-prehlad');
  // The cash-flow chart starts just below the fold at this height.
  await shotScrolled(page, '04-financie-cash-flow', 300);

  await open(page, '#financial/table');
  await shot(page, '04-financie-transakcie');

  await open(page, '#financial/recurring');
  await shot(page, '04-financie-opakovane');

  await open(page, '#invoices');
  await shot(page, '04-fakturacia-doklady');
  await shotScrolled(page, '04-fakturacia-zoznam', 420);
});

test('05 — Hlasová Zasadačka', async ({ page }) => {
  await open(page, '#meetings');
  await shot(page, '05-zasadacka-zoznam');

  // Open the richest meeting so the AI summary and action items are on screen.
  const opened = await clickText(page, ['Pondelková porada', 'Rokovanie — Novák']);
  if (opened) {
    await page.waitForTimeout(1000);
    await shot(page, '05-zasadacka-zapis-ai');

    // The two tabs that carry the section's actual story: what was said, and
    // what the model made of it.
    if (await clickText(page, ['Prepis nahrávky'])) await shot(page, '05-zasadacka-prepis');
    if (await clickText(page, ['AI Výstup'])) await shot(page, '05-zasadacka-ai-vystup');
  }
});

test('06 — Projekty & Gantt', async ({ page }) => {
  await open(page, '#projects');
  await shot(page, '06-projekty-zoznam');

  const opened = await clickText(page, ['Silvia Hrušková', 'Rekonštrukcia strechy']);
  if (opened) {
    await page.waitForTimeout(1200);
    await shot(page, '06-projekty-detail');
    // The Gantt pane is `flex-1` inside the detail card, so it only shows two
    // task rows at the standard height. A taller viewport is the difference
    // between a screenshot of a Gantt chart and a screenshot of its header.
    await page.setViewportSize({ width: 1600, height: 1200 });
    await clickText(page, ['Gantt', 'Harmonogram']);
    await page.waitForTimeout(1400);
    // Zoom the day columns out so the whole schedule fits the pane, not just week one.
    const zoomOut = page.locator('button:has(svg.lucide-minus)').first();
    for (let i = 0; i < 4; i++) await zoomOut.click({ force: true }).catch(() => {});
    await page.waitForTimeout(700);
    await shot(page, '06-projekty-gantt');
    await shotMain(page, '06-projekty-gantt-detail');
    await page.setViewportSize({ width: 1600, height: 1100 });
  }
});

test('07 — RAG AI & Agenti', async ({ page }) => {
  await open(page, '#rag_ai');
  await page.waitForTimeout(1500);
  await shot(page, '07-rag-ai-chat');
  await shotMain(page, '07-rag-ai-chat-detail');
});

test('08 — Automatizácie & Siete', async ({ page }) => {
  await open(page, '#automation');
  await expect(page.locator('main')).toContainText('Nový dopyt z webu', { timeout: 15_000 });
  await shot(page, '08-automatizacie-zoznam');

  const opened = await clickText(page, ['Nový dopyt z webu']);
  if (opened) {
    await page.waitForTimeout(1600);
    // Fit the canvas to the graph — at 100 % only two of the four nodes fit,
    // and the point of this shot is that the workflow is a visual graph.
    await page.locator('button[title*="Prispôsobiť všetky uzly"]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, '08-automatizacie-builder');
    await shotMain(page, '08-automatizacie-builder-detail');
  }
});

test('09 — Nástenky vlastnými slovami', async ({ page }) => {
  await open(page, '#dash_dash-obchod');
  await page.waitForTimeout(2200); // Chart.js draws after its data arrives
  await shot(page, '09-nastenka-obchod');
  await shotScrolled(page, "09-nastenka-obchod-grafy", 260);

  await shotScrolled(page, '09-nastenka-obchod-tabulka', 560);

  await open(page, '#dash_dash-cashflow');
  await page.waitForTimeout(2200);
  await shot(page, '09-nastenka-cashflow');
  await shotScrolled(page, '09-nastenka-cashflow-grafy', 400);
});

test('10 — Vlastné evidencie na mieru', async ({ page }) => {
  await open(page, '#ue_ue-zmluvy');
  await shot(page, '10-evidencie-zmluvy');
  /* The registry opens at the root, where each folder is a single collapsed row;
     stepping inside one is what shows it actually holding records. The second
     path segment is the folder's id — and the view only reads it as a folder
     when that id starts with `folder-`, which is why the demo rows are named
     the way they are. */
  await open(page, '#ue_ue-zmluvy/folder-zod');
  await shot(page, '10-evidencie-zmluvy-priecinok');

  await open(page, '#ue_ue-revizie');
  await shot(page, '10-evidencie-revizie');

  await open(page, '#ue_ue-revizie/folder-vozpark');
  await shot(page, '10-evidencie-revizie-priecinok');

  await open(page, '#ue_ue-technika');
  await shot(page, '10-evidencie-technika');
});
