import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { QAReport } from './reportCollector';
import { analyzePanel, formatEvidence, proposeDropdownFix } from './diagnostics';
import { SETTLE, captureEvidence, readViewState, waitForAppReady, waitForStableRect } from './appDriver';

/**
 * Replays a user flow exported from Chrome DevTools → Recorder.
 *
 * Chrome does not emit Playwright selectors. Each step carries a ranked list of
 * alternatives in Chrome's own dialects — `aria/`, `text/`, `pierce/`, `xpath/`
 * and plain CSS — and a runner that only understands CSS fails on almost every
 * click of a real export. All five are handled here.
 */

export const RECORDINGS_DIR = path.resolve('tests', 'recordings');

export interface RecorderStep {
  type: string;
  url?: string;
  width?: number;
  height?: number;
  selectors?: Array<string | string[]>;
  value?: string;
  key?: string;
  x?: number;
  y?: number;
  count?: number;
  visible?: boolean;
  expression?: string;
  timeout?: number;
  duration?: number;
}

export interface Recording {
  title?: string;
  steps: RecorderStep[];
}

export function listRecordings(): string[] {
  if (!fs.existsSync(RECORDINGS_DIR)) return [];
  return fs
    .readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(RECORDINGS_DIR, f));
}

export function loadRecording(file: string): Recording {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (!Array.isArray(parsed.steps)) {
    throw new Error(`${path.basename(file)} is not a Chrome Recorder export: no "steps" array.`);
  }
  return parsed;
}

/** Flattens Chrome's `string[][]` selector matrix into a ranked list of strings. */
function selectorCandidates(step: RecorderStep): string[] {
  if (!step.selectors) return [];
  const out: string[] = [];
  for (const entry of step.selectors) {
    if (Array.isArray(entry)) {
      // Nested arrays describe a frame/shadow path; the leaf is what we query.
      if (entry.length > 0) out.push(entry[entry.length - 1]);
    } else if (typeof entry === 'string') {
      out.push(entry);
    }
  }
  return out.filter(Boolean);
}

/**
 * Translates one Chrome selector into candidate Playwright locators.
 *
 * `aria/` is the interesting case: it is an accessible-name match, which has no
 * single Playwright equivalent, so several strategies are offered in order.
 */
export function resolveSelector(page: Page, selector: string): Locator[] {
  // aria/Accessible Name  or  aria/Accessible Name[role="button"]
  if (selector.startsWith('aria/')) {
    const body = selector.slice('aria/'.length);
    const roleMatch = body.match(/^(.*?)\[role="([^"]+)"\]\s*$/);
    const name = (roleMatch ? roleMatch[1] : body).trim();
    const role = roleMatch?.[2];
    const options: Locator[] = [];
    if (role) {
      options.push(page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true }));
      options.push(page.getByRole(role as Parameters<Page['getByRole']>[0], { name }));
    }
    options.push(page.getByLabel(name, { exact: true }));
    options.push(page.locator(`[aria-label="${cssEscape(name)}"]`));
    options.push(page.getByTitle(name));
    options.push(page.getByRole('button', { name, exact: true }));
    options.push(page.getByText(name, { exact: true }));
    return options;
  }

  if (selector.startsWith('text/')) {
    const text = selector.slice('text/'.length).trim();
    return [page.getByText(text, { exact: true }), page.getByText(text)];
  }

  // Playwright's CSS engine pierces shadow roots already.
  if (selector.startsWith('pierce/')) {
    return [page.locator(selector.slice('pierce/'.length))];
  }

  // Chrome writes `xpath/` immediately followed by the expression, which itself
  // starts with `/`, producing the `xpath///*[...]` triple slash.
  if (selector.startsWith('xpath/')) {
    return [page.locator(`xpath=${selector.slice('xpath/'.length)}`)];
  }

  if (selector.startsWith('css/')) {
    return [page.locator(selector.slice('css/'.length))];
  }

  // Plain CSS, or an already-Playwright selector such as `button:has-text(...)`.
  return [page.locator(selector)];
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** First candidate that resolves to a visible element, across all selectors of a step. */
async function findTarget(page: Page, step: RecorderStep): Promise<{ locator: Locator; selector: string } | null> {
  const candidates = selectorCandidates(step);
  for (const selector of candidates) {
    for (const locator of resolveSelector(page, selector)) {
      const first = locator.first();
      const visible = await first.isVisible({ timeout: 900 }).catch(() => false);
      if (visible) return { locator: first, selector };
    }
  }
  // Second pass: accept an attached-but-not-yet-visible element rather than
  // failing a step because of a 100ms animation.
  for (const selector of candidates) {
    for (const locator of resolveSelector(page, selector)) {
      const first = locator.first();
      const attached = await first
        .waitFor({ state: 'attached', timeout: 700 })
        .then(() => true)
        .catch(() => false);
      if (attached) return { locator: first, selector };
    }
  }
  return null;
}

export interface ReplayResult {
  completedSteps: number;
  totalSteps: number;
  failed: boolean;
}

/**
 * Runs the flow and asserts continuously.
 *
 * A bare replay only fails when a selector goes missing — it would happily walk
 * past a dropdown rendered behind a drawer, because such a panel is "visible"
 * to any DOM-based check. After every step this therefore re-uses the crawler's
 * own occlusion analysis and error-screen detection, which is what turns a
 * recorded journey into a regression test for the bug it was recorded for.
 */
export async function replayRecording(page: Page, recording: Recording, moduleName: string): Promise<ReplayResult> {
  const steps = recording.steps ?? [];
  let completed = 0;
  let failed = false;

  for (const [i, step] of steps.entries()) {
    const label = `step ${i + 1}/${steps.length} (${step.type})`;

    try {
      switch (step.type) {
        case 'setViewport':
          if (step.width && step.height) {
            await page.setViewportSize({ width: step.width, height: step.height });
          }
          break;

        case 'navigate': {
          const target = step.url ?? '/';
          const url = target.startsWith('http') ? new URL(target) : null;
          // Replay against the base URL under test, keeping the recorded route.
          await page.goto(url ? `${url.pathname}${url.search}${url.hash}` : target, {
            waitUntil: 'domcontentloaded',
          });
          await waitForAppReady(page);
          break;
        }

        case 'click':
        case 'doubleClick':
        case 'hover': {
          const found = await findTarget(page, step);
          if (!found) {
            throw new Error(`no element matched any of: ${selectorCandidates(step).join(' | ')}`);
          }
          await found.locator.scrollIntoViewIfNeeded().catch(() => {});
          if (step.type === 'click') await found.locator.click({ timeout: 5000 });
          else if (step.type === 'doubleClick') await found.locator.dblclick({ timeout: 5000 });
          else await found.locator.hover({ timeout: 5000 });
          await page.waitForTimeout(SETTLE.content);
          break;
        }

        case 'change': {
          const found = await findTarget(page, step);
          if (!found) {
            throw new Error(`no element matched any of: ${selectorCandidates(step).join(' | ')}`);
          }
          const tag = await found.locator.evaluate((el: Element) => el.tagName.toLowerCase());
          if (tag === 'select') {
            await found.locator.selectOption(step.value ?? '', { timeout: 5000 });
          } else {
            await found.locator.fill(step.value ?? '', { timeout: 5000 });
          }
          await page.waitForTimeout(SETTLE.micro);
          break;
        }

        case 'keyDown':
        case 'keyUp': {
          // Chrome records press-and-release as two steps; a single press on the
          // keyUp keeps modifier-free shortcuts working without double-firing.
          if (step.type === 'keyUp' && step.key) {
            await page.keyboard.press(normalizeKey(step.key));
            await page.waitForTimeout(SETTLE.micro);
          }
          break;
        }

        case 'scroll': {
          await page.evaluate(
            ([x, y]) => window.scrollBy(x ?? 0, y ?? 0),
            [step.x ?? 0, step.y ?? 200] as const,
          );
          await page.waitForTimeout(SETTLE.micro);
          break;
        }

        case 'waitForElement': {
          const found = await findTarget(page, step);
          if (!found) {
            throw new Error(`waitForElement never matched: ${selectorCandidates(step).join(' | ')}`);
          }
          if (step.visible !== false) {
            await found.locator.waitFor({ state: 'visible', timeout: step.timeout ?? 8000 });
          }
          break;
        }

        case 'waitForExpression': {
          if (step.expression) {
            await page.waitForFunction(
              (expr: string) => Boolean(eval(expr)),
              step.expression,
              { timeout: step.timeout ?? 8000 },
            );
          }
          break;
        }

        case 'close':
        case 'emulateNetworkConditions':
        case 'setUserAgent':
          // Recorded but irrelevant to a replay under test.
          break;

        default:
          QAReport.pass(moduleName, `skipped unsupported recorder step "${step.type}"`);
          break;
      }
    } catch (err) {
      failed = true;
      QAReport.record({
        module: moduleName,
        target: `${label}`,
        action: `Replay ${label} of "${recording.title ?? 'recording'}"`,
        expected: 'The recorded step replays against the current build.',
        actual: `The step could not be performed: ${(err as Error).message.split('\n')[0]}`,
        category: 'INTERACTION_FAILED',
        severity: 'HIGH',
        url: page.url(),
        details: `Recorded selectors: ${selectorCandidates(step).join(' | ') || '(none)'}`,
        proposedFix:
          'Either the UI moved and the recording needs re-recording, or the control genuinely disappeared.\n' +
          'Compare the recorded selectors against the current markup before assuming the recording is stale.',
        screenshotPath: await captureEvidence(page, `recorder-${moduleName}-step${i + 1}`),
      });
      break;
    }

    completed++;
    if (await assertAfterStep(page, moduleName, label)) failed = true;
  }

  if (!failed) {
    QAReport.pass(moduleName, `replayed all ${completed} step(s) of "${recording.title ?? 'recording'}"`);
  }
  return { completedSteps: completed, totalSteps: steps.length, failed };
}

function normalizeKey(key: string): string {
  const map: Record<string, string> = {
    Return: 'Enter',
    Esc: 'Escape',
    Spacebar: 'Space',
  };
  return map[key] ?? key;
}

/**
 * Post-step assertions. This is what makes a replay useful for finding bugs
 * rather than just proving selectors still resolve.
 */
async function assertAfterStep(page: Page, moduleName: string, label: string): Promise<boolean> {
  let found = false;

  const state = await readViewState(page);
  if (state.errorScreen) {
    QAReport.record({
      module: moduleName,
      target: label,
      action: `Replay ${label}`,
      expected: 'The step leaves the app on a working screen.',
      actual: `An error screen was rendered: "${state.errorScreen}"`,
      category: 'ERROR_SCREEN',
      severity: 'HIGH',
      url: page.url(),
      screenshotPath: await captureEvidence(page, `recorder-error-${label}`),
    });
    found = true;
  }

  // If the step opened a popover, prove the user can actually see it.
  const panel = page.locator('[role="listbox"]').last();
  if ((await panel.count()) > 0) {
    await waitForStableRect(panel, 1200);
    const analysis = await analyzePanel(panel);
    const broken = !analysis.paintable || analysis.outsideViewport || analysis.occludedPoints > 0 || Boolean(analysis.clippedBy);
    if (broken) {
      QAReport.record({
        module: moduleName,
        target: `Options panel opened at ${label}`,
        action: `Replay ${label}, which opens a dropdown`,
        expected: 'The options panel is fully visible so the recorded selection can be made.',
        actual: analysis.paintable
          ? `The panel is covered by another layer (${analysis.occludedPoints}/${analysis.totalPoints} probe points blocked).`
          : `The panel is not painted (${analysis.hiddenReason ?? 'outside the viewport'}).`,
        category: analysis.paintable ? 'DROPDOWN_OCCLUDED' : 'DROPDOWN_OPENED_BUT_INVISIBLE',
        severity: 'HIGH',
        url: page.url(),
        details: formatEvidence(analysis),
        proposedFix: proposeDropdownFix(analysis, 'the options panel'),
        screenshotPath: await captureEvidence(page, `recorder-occluded-${label}`),
      });
      found = true;
    }
  }

  return found;
}
