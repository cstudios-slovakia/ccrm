import type { Locator, Page } from '@playwright/test';
import { QAReport, type DefectCategory, type Severity } from './reportCollector';
import { analyzePanel, formatEvidence, proposeDropdownFix } from './diagnostics';
import {
  SETTLE,
  captureEvidence,
  dismissOverlays,
  gotoView,
  readViewState,
  waitForNoPopover,
  waitForOpaque,
  waitForStableRect,
  type ConsoleCapture,
  type ViewState,
} from './appDriver';

/** Labels we must never click: they destroy data or end the session. */
const DESTRUCTIVE = /vymaza|zmaza|odstrani|delete|remove|reset|wipe|odhlasi|logout|sign\s*out|obnovi[ťt]\s+syst/i;

/**
 * Buttons whose whole job is to create something — the entry points to forms.
 *
 * Matched as prefixes rather than whole words on purpose: Slovak labels end in
 * diacritics ("Vytvoriť", "Pridať"), and `\b` does not fire between a non-ASCII
 * letter and a space, so a word-boundary anchor silently matches nothing.
 */
const CREATE_INTENT = /^[\s+＋]*(nov[aáeéyýuú]?|prida|vytvor|zaloz|založ|(add|new|create|import)\b)/i;

const EDIT_INTENT = /upravi|úprav|(^|\s)edit(\s|$)/i;

const SUBMIT_LABELS = /^[\s]*(uloz|ulož|save|vytvor|prida|potvrd|odosl|(submit|create|confirm)\b)/i;

/** Throws that originate in bundled deps, not in `src/`. */
const THIRD_PARTY_THROW = /node_modules|\/deps\/|shadergradient|@react-three|three\/|fancybox/i;

/**
 * Playwright "element intercepts pointer events" noise from sticky search /
 * filter chrome that `scrollIntoView({ block: "center" })` tucks a control under.
 * That is a harness scroll artefact, not a broken button.
 */
const STICKY_CHROME_INTERCEPT =
  /glass-panel|placeholder="|Vyhľad|Search clients|flex flex-col sm:flex-row items-center gap-3/i;

function isStickyChromeIntercept(log: string): boolean {
  return /intercepts pointer events/.test(log) && STICKY_CHROME_INTERCEPT.test(log);
}

export interface CrawlLimits
{
  /** Create-buttons to open per view. */
  maxActions: number;
  /** Tab-like buttons to click per strip. */
  maxTabs: number;
  /** Dropdowns to audit per page-level scope (forms are unlimited). */
  maxDropdowns: number;
  /** Edit drawers to open per view. */
  maxEdits: number;
}

const DEFAULT_LIMITS: CrawlLimits = { maxActions: 4, maxTabs: 8, maxDropdowns: 12, maxEdits: 1 };

interface RecordInput {
  target: string;
  action: string;
  expected: string;
  actual: string;
  category: DefectCategory;
  severity: Severity;
  details?: string;
  proposedFix?: string;
  screenshotPath?: string;
}

/**
 * Drives one view through a deep interaction audit.
 *
 * Design rules, each of which the previous implementation broke:
 *  - Every check states an `expected` result and compares it to `actual`.
 *  - Nothing is swallowed. A failed interaction is a finding, not a no-op.
 *  - Discovery is exhaustive within bounds; nothing is capped to "the first one".
 *  - A control that does not respond is a defect, never a pass.
 */
export class ViewCrawler {
  readonly page: Page;
  readonly module: string;
  private readonly console: ConsoleCapture;
  private readonly limits: CrawlLimits;

  constructor(page: Page, module: string, consoleCapture: ConsoleCapture, limits: Partial<CrawlLimits> = {}) {
    this.page = page;
    this.module = module;
    this.console = consoleCapture;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  private record(input: RecordInput) {
    QAReport.record({
      module: this.module,
      url: this.page.url(),
      ...input,
    });
  }

  private pass(action: string) {
    QAReport.pass(this.module, action);
  }

  /**
   * Clicks a control, coping with the app's habit of re-laying out underneath
   * the pointer.
   *
   * A plain `click()` fails whenever another element owns the hit point at that
   * instant, and this UI reflows enough that the interceptor differs between
   * retries. Rather than either giving up (losing coverage of everything behind
   * that control) or forcing blindly (hiding a genuine overlap), this waits for
   * the layout to settle, retries, and only then dispatches the click directly
   * on the element — recording that a real pointer never reached it.
   */
  private async robustClick(
    locator: Locator,
    target: string,
    action: string,
    expected: string,
    timeout = 2500,
  ): Promise<'clicked' | 'dispatched' | 'failed'> {
    const bringIntoView = () =>
      locator.evaluate((el: Element) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' })).catch(() => {});

    await bringIntoView();
    try {
      await locator.click({ timeout });
      return 'clicked';
    } catch {
      /* fall through to a settled retry */
    }

    await waitForStableRect(locator, 1200);
    await bringIntoView();
    let log = '';
    try {
      await locator.click({ timeout });
      return 'clicked';
    } catch (err) {
      log = (err as Error).message.replace(/\s+/g, ' ').replace(/\u001b\[[0-9;]*m/g, '').trim();
    }

    const chromeIntercept = isStickyChromeIntercept(log);
    if (chromeIntercept) {
      const forced = await locator.click({ timeout: 1500, force: true }).then(
        () => true,
        () => false,
      );
      this.record({
        target,
        action,
        expected: 'A real mouse click on the control reaches it.',
        actual:
          'The control sits under sticky search/filter chrome after scroll — a harness artefact, not a dead button.',
        category: 'INTERACTION_FAILED',
        severity: 'LOW',
        details:
          'scrollIntoView tucked the trigger under a sticky panel. The audit continued with a force click.\n' +
          `Playwright log: ${log.slice(0, 900)}`,
      });
      return forced ? 'dispatched' : 'failed';
    }

    const dispatched = await locator
      .evaluate((el: Element) => {
        (el as HTMLElement).click();
        return true;
      })
      .catch(() => false);

    if (!dispatched) {
      this.record({
        target,
        action,
        expected,
        actual: `The control could not be activated at all: ${log.slice(0, 140)}`,
        category: 'INTERACTION_FAILED',
        severity: 'HIGH',
        details: `Playwright log: ${log.slice(0, 1200)}`,
        screenshotPath: await captureEvidence(this.page, `click-fail-${target}`),
      });
      return 'failed';
    }

    const interceptor = log.match(/(<[^>]{0,220}>)[^<]{0,60}intercepts pointer events/)?.[1];
    this.record({
      target,
      action,
      expected: 'A real mouse click on the control reaches it.',
      actual: interceptor
        ? `A real click never reached the control — ${interceptor} sits on top of the point the user would click.`
        : 'A real click never reached the control; the layout kept shifting under the pointer.',
      category: 'INTERACTION_FAILED',
      severity: 'LOW',
      details:
        'The audit continued by dispatching the click directly on the element, so everything behind this ' +
        `control was still tested. Playwright log: ${log.slice(0, 900)}`,
    });
    return 'dispatched';
  }

  // ---------------------------------------------------------------- view health

  /**
   * Asserts the view rendered the way opening it is supposed to: content on
   * screen, no error panel. `context` names how we got here.
   */
  async assertViewHealthy(context: string, expected: string): Promise<ViewState> {
    const state = await readViewState(this.page);

    if (state.errorScreen) {
      this.record({
        target: context,
        action: `Open "${context}"`,
        expected,
        actual: `An error screen was rendered instead: "${state.errorScreen}"`,
        category: 'ERROR_SCREEN',
        severity: 'HIGH',
        details: `URL hash at failure: \`${state.hash}\`. Heading: "${state.heading}".`,
        proposedFix: this.proposeErrorScreenFix(state),
        screenshotPath: await captureEvidence(this.page, `error-${this.module}-${context}`),
      });
      return state;
    }

    if (state.textLength < 40) {
      this.record({
        target: context,
        action: `Open "${context}"`,
        expected,
        actual: `The workspace rendered almost nothing (${state.textLength} characters of visible text).`,
        category: 'VIEW_RENDERED_EMPTY',
        severity: 'HIGH',
        details: `URL hash: \`${state.hash}\`. A working view renders either data or an explicit empty state; both produce text.`,
        proposedFix:
          'Check the browser console for a render exception and confirm the lazy chunk for this route resolves.\n' +
          'If the view depends on a collection that is empty, it should render an explicit empty state rather than nothing.',
        screenshotPath: await captureEvidence(this.page, `blank-${this.module}-${context}`),
      });
      return state;
    }

    this.pass(`${context} rendered (${state.textLength} chars, heading "${state.heading}")`);
    return state;
  }

  private proposeErrorScreenFix(state: ViewState): string {
    const hash = state.hash;
    // The signature failure in this app: a route parameter parsed without
    // stripping the query string.
    if (/\?/.test(hash) && /sa nepodarilo nájsť|could not be resolved|nem feloldható/.test(state.errorScreen ?? '')) {
      const [base, query] = hash.replace(/^#/, '').split('?');
      const param = base.split('-').slice(1).join('-');
      return [
        `The route hash carries a query string (\`${hash}\`) but the route parameter was parsed from the raw`,
        `hash, so the query became part of the identifier: the lookup searched for \`${param}?${query}\``,
        `instead of \`${param}\`.`,
        ``,
        `Strip the query before extracting the parameter. In \`src/App.tsx\` the \`client-\` branch does:`,
        ``,
        `    const clientName = decodeURIComponent(activeTab.replace("client-", ""));`,
        ``,
        `It needs to drop everything from \`?\` onward first, e.g.:`,
        ``,
        `    const raw = activeTab.split("?")[0];`,
        `    const clientName = decodeURIComponent(raw.replace("client-", ""));`,
        ``,
        `Every prefixed route that a sub-view can append \`?tab=\` to has the same exposure (\`client-\`,`,
        `\`lead-\`, \`project-\`, \`ue-\`, \`user-\`). The durable fix is one shared hash parser that returns`,
        `\`{ route, params }\` and to have every branch consume that instead of calling \`.replace()\` on the`,
        `raw hash.`,
      ].join('\n');
    }

    return [
      `The view rendered its error state. Reproduce by opening \`${hash}\` directly, then read the message`,
      `text: it names the lookup that failed. Trace that identifier back to the collection it is resolved`,
      `against and check whether the value being searched for matches what the data actually contains.`,
    ].join('\n');
  }

  /** Records any console errors / uncaught exceptions seen so far and clears them. */
  drainConsole(context: string) {
    if (this.console.exceptions.length > 0) {
      // An exception thrown inside a bundled dependency is one bug, not one per
      // view. Attributing it to a fixed module collapses it to a single finding
      // instead of repeating it for every screen that renders the component.
      const thirdParty = this.console.exceptions.filter((e) => THIRD_PARTY_THROW.test(e));
      const appOwn = this.console.exceptions.filter((e) => !THIRD_PARTY_THROW.test(e));

      if (thirdParty.length > 0) {
        const library =
          thirdParty[0].match(/(?:deps|node_modules)\/([^/?:\s]+)/)?.[1] ??
          ( /shadergradient/i.test(thirdParty[0]) ? 'shadergradient' : 'a bundled dependency');
        QAReport.record({
          module: 'Third-party libraries',
          target: library,
          action: `Load any view that mounts ${library}`,
          expected: 'No uncaught JavaScript exceptions during render.',
          actual: `${library} throws an uncaught exception on load.`,
          category: 'UNCAUGHT_EXCEPTION',
          severity: 'LOW',
          details: thirdParty[0].slice(0, 500),
          proposedFix:
            `The throw is inside ${library}, not in application code. It is noise for this audit:\n` +
            'do not treat it as a CCRM defect unless a user-visible screen is actually broken.\n' +
            'Guard the mount, pin/update the dependency, or drop it if the visual is not worth the exception.',
        });
      }

      if (appOwn.length > 0) {
        this.record({
          target: context,
          action: `Interact with ${context}`,
          expected: 'No uncaught JavaScript exceptions.',
          actual: `${appOwn.length} uncaught exception(s) were thrown.`,
          category: 'UNCAUGHT_EXCEPTION',
          severity: 'HIGH',
          details: appOwn.slice(0, 5).join(' | ').slice(0, 800),
          proposedFix:
            'An uncaught exception means React unmounted or a handler died mid-flight. The stack is included\n' +
            'above; fix at the throw site rather than wrapping the boundary.',
        });
      }

      this.console.exceptions.length = 0;
    }

    if (this.console.errors.length > 0) {
      this.record({
        target: context,
        action: `Interact with ${context}`,
        expected: 'No errors logged to the console.',
        actual: `${this.console.errors.length} console error(s) were logged.`,
        category: 'CONSOLE_ERROR',
        severity: 'MEDIUM',
        details: this.console.errors.slice(0, 5).join(' | ').slice(0, 600),
      });
      this.console.errors.length = 0;
    }
  }

  // ------------------------------------------------------------------ dropdowns

  /**
   * Opens one dropdown and proves the user can actually see and use it.
   *
   * This is where the "looks opened but it's not visible" class of bug is
   * caught. Crucially, every negative outcome is a finding: a dropdown that
   * fails to mount, mounts at zero size, mounts off-screen, mounts behind
   * another layer, or refuses a selection.
   */
  async auditDropdown(trigger: Locator, scopeLabel: string, opts: { select: boolean }): Promise<void> {
    const info = await trigger
      .evaluate((el: Element) => {
        // Name the control the way the user sees it: by its field label, not by
        // whatever value happens to be selected. Walking up and taking the first
        // <label> found is not enough — a wrapper holding several fields would
        // hand back a neighbour's caption — so prefer the closest label that
        // precedes this control in document order.
        let label = '';
        let node: Element | null = el;
        for (let depth = 0; depth < 4 && node && !label; depth++) {
          node = node.parentElement;
          if (!node) break;
          const labels = Array.from(node.querySelectorAll('label')).filter((l) =>
            (l as HTMLElement).innerText?.trim(),
          );
          if (labels.length === 0) continue;
          const preceding = labels.filter(
            (l) => l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
          const chosen = preceding.length > 0 ? preceding[preceding.length - 1] : labels[0];
          label = (chosen as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
        }
        if (!label) label = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
        return {
          label,
          value: (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '',
          disabled: (el as HTMLButtonElement).disabled === true,
        };
      })
      .catch(() => null);

    if (!info || info.disabled) return;

    const name = info.label || info.value || 'Dropdown';
    const target = `${name}${info.label && info.value ? ` (currently "${info.value}")` : ''}`;
    const action = `Click the "${name}" dropdown in ${scopeLabel}`;
    const expected = 'The options panel opens, is fully visible on screen, and an option can be selected.';

    // A previous panel may still be animating out; opening now would hand back
    // the fading panel instead of the new one.
    await waitForNoPopover(this.page);

    if ((await this.robustClick(trigger, target, action, expected, 3000)) === 'failed') return;

    const panel = this.page.locator('[role="listbox"]').last();
    const mounted = await panel.waitFor({ state: 'attached', timeout: 2000 }).then(
      () => true,
      () => false,
    );

    if (!mounted) {
      const expanded = await trigger.getAttribute('aria-expanded').catch(() => null);
      this.record({
        target,
        action,
        expected,
        actual:
          expanded === 'true'
            ? 'The trigger reports aria-expanded="true" but no options panel was ever added to the DOM.'
            : 'Nothing happened — no options panel was added to the DOM and the trigger stayed collapsed.',
        category: 'DROPDOWN_DID_NOT_OPEN',
        severity: 'HIGH',
        details: `Waited 2s for an element with [role="listbox"]. aria-expanded="${expanded}".`,
        proposedFix:
          'The trigger\'s open state and the panel render are out of sync. Check that the open flag actually\n' +
          'reaches the panel branch, and that the portal target exists at the moment the flag flips.',
        screenshotPath: await captureEvidence(this.page, `no-panel-${name}`),
      });
      await this.closeDropdown(trigger);
      return;
    }

    // Let the enter animation finish before measuring anything: reading
    // geometry or opacity mid-flight is what made the old crawler misreport
    // both the visibility and the occluding layer.
    await waitForStableRect(panel, 1500);
    await waitForOpaque(panel, 1200);
    const analysis = await analyzePanel(panel);
    const evidence = formatEvidence(analysis);

    if (!analysis.paintable || analysis.outsideViewport) {
      this.record({
        target,
        action,
        expected,
        actual: analysis.outsideViewport
          ? `The panel opened but was positioned outside the viewport, so the user sees nothing.`
          : `The panel opened but is not painted (${analysis.hiddenReason}), so the user sees nothing.`,
        category: 'DROPDOWN_OPENED_BUT_INVISIBLE',
        severity: 'HIGH',
        details: evidence,
        proposedFix: proposeDropdownFix(analysis, 'the options panel'),
        screenshotPath: await captureEvidence(this.page, `invisible-${name}`),
      });
      await this.closeDropdown(trigger);
      return;
    }

    if (analysis.clippedBy || analysis.occludedPoints > 0) {
      const fully = analysis.occludedPoints === analysis.totalPoints;
      this.record({
        target,
        action,
        expected,
        actual: fully
          ? 'The panel opened in the DOM but is completely hidden behind another layer — the trigger looks open while nothing is visible.'
          : `The panel opened but ${analysis.occludedPoints} of ${analysis.totalPoints} probe points are covered by another layer, so part of the list is unreachable.`,
        category: 'DROPDOWN_OCCLUDED',
        severity: fully ? 'HIGH' : 'MEDIUM',
        details: evidence,
        proposedFix: proposeDropdownFix(analysis, 'the options panel'),
        screenshotPath: await captureEvidence(this.page, `occluded-${name}`),
      });
      await this.closeDropdown(trigger);
      return;
    }

    if (analysis.optionCount === 0) {
      this.record({
        target,
        action,
        expected,
        actual: 'The panel opened and is visible but contains no options to choose from.',
        category: 'DROPDOWN_NOT_SELECTABLE',
        severity: 'MEDIUM',
        details: evidence,
      });
      await this.closeDropdown(trigger);
      return;
    }

    if (!opts.select) {
      this.pass(`Dropdown "${name}" in ${scopeLabel} opened, fully visible, ${analysis.optionCount} option(s)`);
      await this.closeDropdown(trigger);
      return;
    }

    // Prove a choice can actually be made and lands on the trigger. Pick an
    // option that is not already applied, otherwise "nothing changed" is the
    // correct outcome and would read as a defect.
    const before = info.value;
    const option = panel
      .locator('[role="option"]:not([disabled]):not([aria-selected="true"]), button:not([disabled]):not([aria-selected="true"])')
      .first();
    if (!(await option.isVisible({ timeout: 600 }).catch(() => false))) {
      this.pass(`Dropdown "${name}" in ${scopeLabel} opened and is fully visible (single option)`);
      await this.closeDropdown(trigger);
      return;
    }
    const optionText = (await option.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const clicked = await option.click({ timeout: 2500 }).then(
      () => true,
      () => false,
    );

    if (!clicked) {
      this.record({
        target,
        action: `Select an option in the "${name}" dropdown in ${scopeLabel}`,
        expected: 'Clicking an option applies it and closes the panel.',
        actual: 'The option could not be clicked.',
        category: 'DROPDOWN_NOT_SELECTABLE',
        severity: 'HIGH',
        details: evidence,
        screenshotPath: await captureEvidence(this.page, `option-click-fail-${name}`),
      });
      await this.closeDropdown(trigger);
      return;
    }

    await this.page.waitForTimeout(SETTLE.content);
    const after = await trigger.innerText().catch(() => '');
    const stillOpen = await this.page.locator('[role="listbox"]').count();

    if (stillOpen > 0) {
      this.record({
        target,
        action: `Select "${optionText}" in the "${name}" dropdown in ${scopeLabel}`,
        expected: 'The panel closes once an option is chosen.',
        actual: 'The panel stayed open after the option was clicked.',
        category: 'DROPDOWN_NOT_SELECTABLE',
        severity: 'MEDIUM',
      });
      await this.closeDropdown(trigger);
      return;
    }

    // Triggers are styled `uppercase`, and innerText returns the transformed
    // text, so the comparison has to be case-insensitive or every filter pill
    // reads as "the selection was not applied".
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const changed = norm(after) !== norm(before);
    if (!changed && optionText && !norm(before).includes(norm(optionText))) {
      this.record({
        target,
        action: `Select "${optionText}" in the "${name}" dropdown in ${scopeLabel}`,
        expected: `The trigger shows the chosen option ("${optionText}").`,
        actual: `The trigger still shows "${before}" — the selection was not applied.`,
        category: 'DROPDOWN_NOT_SELECTABLE',
        severity: 'HIGH',
        proposedFix:
          'The option click is not propagating the new value. Check the change handler is wired to the\n' +
          'option (not only to the trigger) and that the parent actually stores what it receives.',
      });
      return;
    }

    this.pass(`Dropdown "${name}" in ${scopeLabel} opened, visible, and applied "${optionText}"`);
  }

  private async closeDropdown(trigger: Locator) {
    if ((await this.page.locator('[role="listbox"]').count()) === 0) return;
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(SETTLE.micro);
    if ((await this.page.locator('[role="listbox"]').count()) > 0) {
      await trigger.click({ timeout: 1500, force: true }).catch(() => {});
      await this.page.waitForTimeout(SETTLE.micro);
    }
  }

  /** Audits every dropdown inside a scope, not just the first one. */
  async auditAllDropdowns(scope: Locator, scopeLabel: string, opts: { select: boolean; unlimited?: boolean }) {
    const triggers = scope.locator('button[aria-haspopup="listbox"]');
    const total = await triggers.count();
    const limit = opts.unlimited ? total : Math.min(total, this.limits.maxDropdowns);
    for (let i = 0; i < limit; i++) {
      // Re-resolve each time: filling a form can re-render the field list.
      const trigger = scope.locator('button[aria-haspopup="listbox"]').nth(i);
      if (!(await trigger.isVisible({ timeout: 400 }).catch(() => false))) continue;
      await this.auditDropdown(trigger, scopeLabel, opts);
    }
    if (total > limit) {
      this.pass(`${scopeLabel}: audited ${limit} of ${total} dropdowns (per-scope cap)`);
    }
  }

  /**
   * Finds the listbox trigger that belongs to a field label (e.g. "Čas termínu"),
   * walking up from the <label> rather than guessing by index.
   */
  async findDropdownTriggerByLabel(scope: Locator, label: RegExp): Promise<Locator | null> {
    const found = await scope
      .evaluate((root: Element, source: string) => {
        const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        document.querySelectorAll('[data-qa-named-dd]').forEach((el) => el.removeAttribute('data-qa-named-dd'));
        const re = new RegExp(fold(source), 'i');
        for (const lab of Array.from(root.querySelectorAll('label'))) {
          const text = (lab as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '';
          if (!re.test(fold(text))) continue;
          let node: Element | null = lab.parentElement;
          for (let d = 0; d < 5 && node && node !== root.parentElement; d++) {
            const btn = node.querySelector('button[aria-haspopup="listbox"]');
            if (btn) {
              btn.setAttribute('data-qa-named-dd', '1');
              return true;
            }
            node = node.parentElement;
          }
        }
        return false;
      }, label.source)
      .catch(() => false);
    if (!found) return null;
    const loc = this.page.locator('[data-qa-named-dd="1"]').first();
    return (await loc.count()) > 0 ? loc : null;
  }

  /** Native <select> elements, which the app also uses in places. */
  async auditNativeSelects(scope: Locator, scopeLabel: string) {
    const selects = scope.locator('select');
    const count = Math.min(await selects.count(), this.limits.maxDropdowns);
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      if (!(await sel.isVisible({ timeout: 300 }).catch(() => false))) continue;
      const options = await sel.locator('option').count();
      if (options <= 1) continue;
      const name = (await sel.getAttribute('name')) ?? (await sel.getAttribute('aria-label')) ?? `select #${i + 1}`;
      const ok = await sel.selectOption({ index: 1 }).then(
        () => true,
        () => false,
      );
      if (!ok) {
        this.record({
          target: name,
          action: `Choose an option in the "${name}" select in ${scopeLabel}`,
          expected: 'The option is applied.',
          actual: 'The select would not accept a selection.',
          category: 'DROPDOWN_NOT_SELECTABLE',
          severity: 'MEDIUM',
        });
      } else {
        this.pass(`Native select "${name}" in ${scopeLabel} accepted a selection`);
      }
    }
  }

  // ----------------------------------------------------------------- tab strips

  /**
   * Finds groups of sibling buttons that behave like tabs and clicks every one,
   * asserting the view changed *and* stayed healthy. Bug class caught here: a
   * tab that navigates but lands on an error screen.
   */
  async auditTabStrips(scopeLabel: string) {
    const strips = await this.page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return [];
      const groups: Array<{ index: number; labels: string[]; active: boolean[] }> = [];
      const containers = new Set<Element>();

      const explicit = main.querySelectorAll('[role="tab"]');
      explicit.forEach((t) => t.parentElement && containers.add(t.parentElement));

      // Heuristic strip: >=2 sibling buttons with short labels in a flex row.
      main.querySelectorAll('div').forEach((div) => {
        const cls = typeof div.className === 'string' ? div.className : '';
        if (!/\bflex\b/.test(cls)) return;
        const kids = Array.from(div.children).filter((c) => c.tagName === 'BUTTON');
        if (kids.length < 2) return;
        const labels = kids.map((k) => (k as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '');
        if (labels.some((l) => l.length === 0 || l.length > 42)) return;
        // A row of tabs is separated from its content by a bottom border, or is
        // an explicit segmented control.
        if (!/border-b|rounded-2xl|rounded-xl|bg-slate-50|gap-2/.test(cls)) return;
        containers.add(div);
      });

      let i = 0;
      for (const c of containers) {
        (c as HTMLElement).setAttribute('data-qa-strip', String(i));
        const buttons = Array.from(c.children).filter(
          (k) => k.tagName === 'BUTTON' || k.getAttribute?.('role') === 'tab',
        );
        // Which tab is currently open. Every tab still gets clicked — re-clicking
        // the open one is a real user action and, in this app, the one that
        // rewrites the URL — but a no-op result is only a defect for a tab that
        // was *not* already showing.
        const transparent = (c: string) => c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
        const backgrounds = buttons.map((k) => window.getComputedStyle(k).backgroundColor);
        const anyTransparent = backgrounds.some(transparent);
        groups.push({
          index: i,
          labels: buttons.map((k) => (k as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? ''),
          active: buttons.map((k, idx) => {
            if (k.getAttribute('aria-selected') === 'true') return true;
            const cls = typeof k.className === 'string' ? k.className : '';
            if (/\btext-white\b/.test(cls)) return true;
            // Segmented controls mark the open tab with an opaque pill while the
            // others stay transparent.
            return anyTransparent && !transparent(backgrounds[idx]);
          }),
        });
        i++;
      }
      return groups;
    });

    for (const strip of strips) {
      const container = this.page.locator(`[data-qa-strip="${strip.index}"]`);
      if (!(await container.isVisible({ timeout: 300 }).catch(() => false))) continue;

      const limit = Math.min(strip.labels.length, this.limits.maxTabs);
      for (let i = 0; i < limit; i++) {
        const label = strip.labels[i];
        if (!label || DESTRUCTIVE.test(label)) continue;
        const wasAlreadyOpen = strip.active[i];

        const button = this.page.locator(`[data-qa-strip="${strip.index}"] > button`).nth(i);
        if (!(await button.isVisible({ timeout: 300 }).catch(() => false))) continue;

        const before = await readViewState(this.page);
        const outcome = await this.robustClick(
          button,
          `Tab "${label}"`,
          `Click the "${label}" tab in ${scopeLabel}`,
          'The tab activates and its panel is shown.',
        );
        if (outcome === 'failed') continue;

        await this.page.waitForTimeout(SETTLE.content);
        const after = await readViewState(this.page);

        if (after.errorScreen) {
          this.record({
            target: `Tab "${label}"`,
            action: `Click the "${label}" tab in ${scopeLabel}`,
            expected: `The "${label}" panel is shown with its content.`,
            actual: `The view changed but rendered an error screen: "${after.errorScreen}"`,
            category: 'TAB_SWITCH_WRONG_RESULT',
            severity: 'HIGH',
            details: `Hash before: \`${before.hash}\` → after: \`${after.hash}\`.`,
            proposedFix: this.proposeErrorScreenFix(after),
            screenshotPath: await captureEvidence(this.page, `tab-error-${label}`),
          });
          // Get back to a usable screen before continuing.
          if (before.hash !== after.hash) {
            await gotoView(this.page, before.hash);
          }
          continue;
        }

        if (after.fingerprint === before.fingerprint && after.hash === before.hash) {
          if (wasAlreadyOpen) {
            this.pass(`Tab "${label}" in ${scopeLabel} was already open and stayed healthy when re-clicked`);
          } else {
            this.record({
              target: `Tab "${label}"`,
              action: `Click the "${label}" tab in ${scopeLabel}`,
              expected: `The "${label}" panel is shown.`,
              actual: 'Nothing on screen changed — the tab appears inert.',
              category: 'TAB_SWITCH_WRONG_RESULT',
              severity: 'LOW',
              details: 'Content fingerprint and URL were identical before and after the click.',
            });
          }
          continue;
        }

        this.pass(`Tab "${label}" in ${scopeLabel} switched to a healthy panel`);
      }
    }

    await this.page.evaluate(() =>
      document.querySelectorAll('[data-qa-strip]').forEach((el) => el.removeAttribute('data-qa-strip')),
    );
  }

  // ------------------------------------------------------------------- overlays

  /** Marks the topmost visible overlay so it can be addressed as a scope. */
  async markTopOverlay(): Promise<Locator | null> {
    const found = await this.page.evaluate(() => {
      document.querySelectorAll('[data-qa-overlay]').forEach((el) => el.removeAttribute('data-qa-overlay'));
      const layers = Array.from(document.querySelectorAll('.fixed.inset-0')).filter((el) => {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 240 && r.height > 240;
      });
      if (layers.length === 0) return false;
      const top = layers.reduce((best, el) => {
        const z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
        const bz = parseInt(window.getComputedStyle(best).zIndex, 10) || 0;
        return z >= bz ? el : best;
      });
      top.setAttribute('data-qa-overlay', '1');
      return true;
    });
    return found ? this.page.locator('[data-qa-overlay]') : null;
  }

  /**
   * Clicks each create-intent button, then exercises the form it opens: fills
   * every field, audits every dropdown inside it, submits, and verifies the
   * submit produced its expected result.
   */
  async auditCreateFlows(scopeLabel: string) {
    const candidates = await this.page.evaluate((patterns: { create: string; destructive: string }) => {
      const createRe = new RegExp(patterns.create, 'i');
      const destructiveRe = new RegExp(patterns.destructive, 'i');
      const roots: Element[] = [];
      const main = document.querySelector('main');
      const header = document.querySelector('header');
      if (main) roots.push(main);
      if (header) roots.push(header);
      const raw: Array<{ index: number; label: string; rank: number }> = [];
      let i = 0;
      for (const root of roots) {
        root.querySelectorAll('button').forEach((btn) => {
          const el = btn as HTMLButtonElement;
          if (el.disabled) return;
          const label = (
            el.innerText?.replace(/\s+/g, ' ').trim() ||
            el.getAttribute('title') ||
            el.getAttribute('aria-label') ||
            ''
          ).replace(/\s+/g, ' ').trim();
          const hasPlus = Boolean(el.querySelector('svg.lucide-plus'));
          const labeledCreate = Boolean(label) && createRe.test(label);
          if (!labeledCreate && !hasPlus) return;
          if (destructiveRe.test(label)) return;
          if (el.getAttribute('aria-haspopup') === 'listbox') return;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return;
          el.setAttribute('data-qa-action', String(i));
          raw.push({
            index: i,
            label: label || 'Add (icon only)',
            rank: labeledCreate ? 0 : 1,
          });
          i++;
        });
      }
      raw.sort((a, b) => a.rank - b.rank || a.index - b.index);
      return raw;
    }, { create: CREATE_INTENT.source, destructive: DESTRUCTIVE.source });

    const limit = Math.min(candidates.length, this.limits.maxActions);
    for (let n = 0; n < limit; n++) {
      const { index, label } = candidates[n];
      const button = this.page.locator(`[data-qa-action="${index}"]`);
      if (!(await button.isVisible({ timeout: 400 }).catch(() => false))) continue;

      const before = await readViewState(this.page);
      const clicked = await button.click({ timeout: 3500 }).then(
        () => true,
        () => false,
      );
      if (!clicked) {
        this.record({
          target: `Button "${label}"`,
          action: `Click "${label}" in ${scopeLabel}`,
          expected: 'The create form opens.',
          actual: 'The button could not be clicked.',
          category: 'INTERACTION_FAILED',
          severity: 'MEDIUM',
        });
        continue;
      }

      await this.page.waitForTimeout(SETTLE.overlay);
      const after = await readViewState(this.page);

      if (after.errorScreen) {
        this.record({
          target: `Button "${label}"`,
          action: `Click "${label}" in ${scopeLabel}`,
          expected: 'A create form opens without breaking the view.',
          actual: `An error screen appeared: "${after.errorScreen}"`,
          category: 'ERROR_SCREEN',
          severity: 'HIGH',
          proposedFix: this.proposeErrorScreenFix(after),
          screenshotPath: await captureEvidence(this.page, `action-error-${label}`),
        });
        await gotoView(this.page, before.hash);
        continue;
      }

      const overlay = await this.markTopOverlay();
      if (!overlay) {
        // Not every create button opens an overlay; some navigate or expand a
        // panel inline. Only a total absence of change is suspicious.
        if (after.fingerprint === before.fingerprint && after.hash === before.hash) {
          this.record({
            target: `Button "${label}"`,
            action: `Click "${label}" in ${scopeLabel}`,
            expected: 'A form, drawer or panel opens so a new record can be created.',
            actual: 'Nothing on screen changed — the button appears inert.',
            category: 'INTERACTION_FAILED',
            severity: 'MEDIUM',
            details: 'No overlay was mounted, the URL did not change, and the content fingerprint was identical.',
            screenshotPath: await captureEvidence(this.page, `inert-${label}`),
          });
        } else {
          this.pass(`Button "${label}" in ${scopeLabel} changed the view without opening an overlay`);
        }
        continue;
      }

      const formLabel = `the "${label}" form`;
      this.pass(`Button "${label}" in ${scopeLabel} opened ${formLabel}`);

      await this.fillAllFields(overlay, formLabel);
      await this.auditAllDropdowns(overlay, formLabel, { select: true, unlimited: true });
      await this.auditNativeSelects(overlay, formLabel);
      await this.submitForm(overlay, formLabel, label);

      this.drainConsole(formLabel);

      if (!(await dismissOverlays(this.page))) {
        this.record({
          target: formLabel,
          action: `Close ${formLabel}`,
          expected: 'Escape or the close button dismisses the form.',
          actual: 'The overlay was still open after pressing Escape and clicking every close control.',
          category: 'MODAL_WOULD_NOT_CLOSE',
          severity: 'MEDIUM',
          screenshotPath: await captureEvidence(this.page, `stuck-overlay-${label}`),
        });
        await gotoView(this.page, before.hash);
      }
    }

    await this.page.evaluate(() =>
      document.querySelectorAll('[data-qa-action]').forEach((el) => el.removeAttribute('data-qa-action')),
    );
  }

  /**
   * Opens one edit drawer per module (pencil / "Upraviť") and audits every
   * dropdown inside it. Submit is skipped so a half-filled edit cannot look
   * like a broken save.
   */
  async auditEditFlows(scopeLabel: string) {
    const candidates = await this.page.evaluate((patterns: { edit: string; destructive: string }) => {
      const editRe = new RegExp(patterns.edit, 'i');
      const destructiveRe = new RegExp(patterns.destructive, 'i');
      const main = document.querySelector('main');
      if (!main) return [];
      const out: Array<{ index: number; label: string }> = [];
      let i = 0;
      main.querySelectorAll('button').forEach((btn) => {
        const el = btn as HTMLButtonElement;
        if (el.disabled) return;
        const label = (
          el.innerText?.replace(/\s+/g, ' ').trim() ||
          el.getAttribute('title') ||
          el.getAttribute('aria-label') ||
          ''
        ).replace(/\s+/g, ' ').trim();
        const hasPencil = Boolean(el.querySelector('svg.lucide-pencil, svg.lucide-square-pen'));
        if (!editRe.test(label) && !hasPencil) return;
        if (destructiveRe.test(label)) return;
        if (el.getAttribute('aria-haspopup') === 'listbox') return;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        el.setAttribute('data-qa-edit', String(i));
        out.push({ index: i, label: label || 'Edit (icon only)' });
        i++;
      });
      return out;
    }, { edit: EDIT_INTENT.source, destructive: DESTRUCTIVE.source });

    const limit = Math.min(candidates.length, this.limits.maxEdits);
    for (let n = 0; n < limit; n++) {
      const { index, label } = candidates[n];
      const button = this.page.locator(`[data-qa-edit="${index}"]`);
      if (!(await button.isVisible({ timeout: 400 }).catch(() => false))) continue;

      const before = await readViewState(this.page);
      const clicked = await button.click({ timeout: 3500 }).then(
        () => true,
        () => false,
      );
      if (!clicked) continue;

      await this.page.waitForTimeout(SETTLE.overlay);
      const after = await readViewState(this.page);
      if (after.errorScreen) {
        this.record({
          target: `Button "${label}"`,
          action: `Click "${label}" in ${scopeLabel}`,
          expected: 'The edit form opens without breaking the view.',
          actual: `An error screen appeared: "${after.errorScreen}"`,
          category: 'ERROR_SCREEN',
          severity: 'HIGH',
          proposedFix: this.proposeErrorScreenFix(after),
          screenshotPath: await captureEvidence(this.page, `edit-error-${label}`),
        });
        await gotoView(this.page, before.hash);
        continue;
      }

      const overlay = await this.markTopOverlay();
      if (!overlay) {
        if (after.fingerprint !== before.fingerprint || after.hash !== before.hash) {
          this.pass(`Button "${label}" in ${scopeLabel} switched into an inline edit view`);
        }
        continue;
      }

      const formLabel = `the "${label}" edit form`;
      this.pass(`Button "${label}" in ${scopeLabel} opened ${formLabel}`);
      await this.auditAllDropdowns(overlay, formLabel, { select: true, unlimited: true });
      this.drainConsole(formLabel);

      if (!(await dismissOverlays(this.page))) {
        await gotoView(this.page, before.hash);
      }
    }

    await this.page.evaluate(() =>
      document.querySelectorAll('[data-qa-edit]').forEach((el) => el.removeAttribute('data-qa-edit')),
    );
  }

  // ---------------------------------------------------------------- form filling

  /** Fills every writable field in a scope and verifies the value stuck. */
  async fillAllFields(scope: Locator, scopeLabel: string) {
    const plan = await scope.evaluate((root: Element) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const d = new Date(Date.now() + 7 * 86_400_000);
      const future = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const fieldLabel = (el: Element): string => {
        const id = el.getAttribute('id');
        if (id) {
          const forLabel = root.ownerDocument.querySelector(`label[for="${id}"]`);
          const t = (forLabel as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim();
          if (t) return t;
        }
        let node: Element | null = el;
        for (let depth = 0; depth < 4 && node; depth++) {
          node = node.parentElement;
          if (!node || node === root) break;
          const lbl = node.querySelector('label');
          const t = (lbl as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim();
          if (t) return t;
        }
        return el.getAttribute('placeholder') ?? el.getAttribute('aria-label') ?? el.getAttribute('name') ?? 'field';
      };

      const out: Array<{ index: number; kind: string; label: string; value: string; required: boolean }> = [];
      let i = 0;
      root.querySelectorAll('input, textarea').forEach((raw) => {
        const el = raw as HTMLInputElement | HTMLTextAreaElement;
        if (el.disabled || el.readOnly) return;
        const r = el.getBoundingClientRect();
        const type = (el.getAttribute('type') ?? (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
        if (type === 'hidden' || type === 'file' || type === 'color' || type === 'range' || type === 'submit' || type === 'button') return;
        // A visually hidden checkbox is driven by a styled sibling label, not by
        // the input itself. Toggling it directly is not something a user can do,
        // so reporting it as unfillable would be a false alarm.
        if (r.width < 4 || r.height < 4) return;

        const label = fieldLabel(el);
        let kind = type;
        let value = '';
        switch (type) {
          case 'email': value = 'qa.tester@example.com'; break;
          case 'tel': value = '+421900000111'; break;
          case 'number': value = '12'; break;
          case 'date': value = future; break;
          case 'time': value = '14:30'; break;
          case 'datetime-local': value = `${future}T14:30`; break;
          case 'month': value = future.slice(0, 7); break;
          case 'url': value = 'https://example.com'; break;
          case 'password': value = 'QaTest1234!'; break;
          case 'checkbox':
          case 'radio': kind = type; break;
          case 'textarea': value = 'QA automated audit — generated description.'; break;
          default: kind = 'text'; value = `QA ${label}`.slice(0, 48); break;
        }
        el.setAttribute('data-qa-field', String(i));
        out.push({ index: i, kind, label, value, required: el.required === true });
        i++;
      });
      return out;
    });

    for (const field of plan) {
      const el = scope.locator(`[data-qa-field="${field.index}"]`);
      if (!(await el.isVisible({ timeout: 300 }).catch(() => false))) continue;

      let ok = true;
      let detail = '';
      try {
        if (field.kind === 'checkbox' || field.kind === 'radio') {
          await el.check({ timeout: 2500 });
        } else {
          await el.fill(field.value, { timeout: 2500 });
        }
      } catch (err) {
        ok = false;
        detail = (err as Error).message.split('\n')[0];
      }

      if (ok && field.kind !== 'checkbox' && field.kind !== 'radio') {
        const readBack = await el.inputValue().catch(() => '');
        if (!readBack) {
          ok = false;
          detail = 'The field accepted input but read back empty, so the value was not stored.';
        }
      }

      if (!ok) {
        this.record({
          target: `Field "${field.label}"`,
          action: `Fill "${field.label}" (${field.kind}) in ${scopeLabel}`,
          expected: 'The field accepts input and keeps the value.',
          actual: detail || 'The field could not be filled.',
          category: 'FORM_FIELD_NOT_FILLABLE',
          severity: field.required ? 'HIGH' : 'MEDIUM',
          details: `Attempted value: "${field.value}".`,
        });
      }
    }

    if (plan.length > 0) {
      this.pass(`Filled ${plan.length} field(s) in ${scopeLabel}`);
    }

    await scope
      .evaluate((root: Element) =>
        root.querySelectorAll('[data-qa-field]').forEach((el) => el.removeAttribute('data-qa-field')),
      )
      .catch(() => {});
  }

  /**
   * Submits the form and checks the result. Native validity is consulted first
   * so a field the crawler genuinely could not satisfy is reported as such
   * rather than as a broken save.
   */
  async submitForm(scope: Locator, scopeLabel: string, originLabel: string) {
    const validity = await scope
      .evaluate((root: Element) => {
        const form = root.querySelector('form') as HTMLFormElement | null;
        if (!form) return { hasForm: false, valid: true, invalidFields: [] as string[] };
        const valid = form.checkValidity();
        const invalidFields = Array.from(form.querySelectorAll(':invalid'))
          .map((el) => el.getAttribute('name') ?? el.getAttribute('placeholder') ?? el.tagName.toLowerCase())
          .slice(0, 6);
        return { hasForm: true, valid, invalidFields };
      })
      .catch(() => ({ hasForm: false, valid: true, invalidFields: [] as string[] }));

    if (validity.hasForm && !validity.valid) {
      this.record({
        target: scopeLabel,
        action: `Submit ${scopeLabel} after filling every discoverable field`,
        expected: 'Every required field is fillable, so the form is valid and can be submitted.',
        actual: `The form is still invalid after filling: ${validity.invalidFields.join(', ')}.`,
        category: 'FORM_FIELD_NOT_FILLABLE',
        severity: 'MEDIUM',
        details:
          'These controls did not accept a value the browser considers valid. Either they are custom controls ' +
          'without a form value, or their constraints reject the generated input.',
      });
      return;
    }

    const submit = scope
      .locator('button[type="submit"], button:has-text("Uložiť"), button:has-text("Save"), button:has-text("Vytvoriť"), button:has-text("Potvrdiť")')
      .filter({ hasNotText: DESTRUCTIVE })
      .first();

    if (!(await submit.isVisible({ timeout: 800 }).catch(() => false))) {
      // Some drawers are read-only detail panes; that is not a defect.
      return;
    }

    const label = (await submit.innerText().catch(() => 'Submit')).replace(/\s+/g, ' ').trim();
    if (!SUBMIT_LABELS.test(label) && (await submit.getAttribute('type')) !== 'submit') return;

    const before = await readViewState(this.page);
    const clicked = await submit.click({ timeout: 4000 }).then(
      () => true,
      () => false,
    );
    if (!clicked) {
      this.record({
        target: scopeLabel,
        action: `Click "${label}" in ${scopeLabel}`,
        expected: 'The record is saved.',
        actual: 'The submit button could not be clicked.',
        category: 'INTERACTION_FAILED',
        severity: 'HIGH',
      });
      return;
    }

    await this.page.waitForTimeout(SETTLE.overlay);
    const after = await readViewState(this.page);

    if (after.errorScreen) {
      this.record({
        target: scopeLabel,
        action: `Submit ${scopeLabel} via "${label}"`,
        expected: 'The record is saved and the form closes.',
        actual: `Submitting produced an error screen: "${after.errorScreen}"`,
        category: 'FORM_SUBMIT_WRONG_RESULT',
        severity: 'HIGH',
        proposedFix: this.proposeErrorScreenFix(after),
        screenshotPath: await captureEvidence(this.page, `submit-error-${originLabel}`),
      });
      return;
    }

    if (after.overlayCount >= before.overlayCount) {
      // Still open. A visible validation message is a legitimate outcome; total
      // silence is not.
      const message = await scope
        .evaluate((root: Element) => {
          const text = (root as HTMLElement).innerText ?? '';
          const m = text.match(/[^\n]*(povinn|vyplň|required|invalid|chyba|nesprávn)[^\n]*/i);
          return m ? m[0].replace(/\s+/g, ' ').trim().slice(0, 160) : null;
        })
        .catch(() => null);

      if (message) {
        this.pass(`${scopeLabel} rejected the submit with a visible message: "${message}"`);
        return;
      }

      this.record({
        target: scopeLabel,
        action: `Submit ${scopeLabel} via "${label}"`,
        expected: 'The form saves and closes, or explains why it cannot.',
        actual: 'The form stayed open and showed no message — the user gets no feedback at all.',
        category: 'FORM_SUBMIT_WRONG_RESULT',
        severity: 'HIGH',
        details: `Overlays before: ${before.overlayCount}, after: ${after.overlayCount}.`,
        proposedFix:
          'Either the submit handler threw before completing, or a guard returned early without surfacing a\n' +
          'reason. Make every early return in the submit path set a user-visible message.',
        screenshotPath: await captureEvidence(this.page, `submit-silent-${originLabel}`),
      });
      return;
    }

    this.pass(`${scopeLabel} submitted successfully via "${label}"`);
  }

  // ------------------------------------------------------------ record drilldown

  /**
   * Opens the first row of a register and audits the detail view behind it,
   * including its sub-tabs and its deep-link routing.
   */
  async auditRecordDrilldown(homeHash: string) {
    const row = this.page.locator('main table tbody tr').first();
    if (!(await row.isVisible({ timeout: 800 }).catch(() => false))) return;

    const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 60);
    const isEmptyState = await row.locator('td[colspan]').count();
    if (isEmptyState > 0) {
      this.record({
        target: 'Register table',
        action: `Read the first row of the ${this.module} table`,
        expected: 'The register lists seeded records so the detail view can be opened.',
        actual: `The table rendered its empty state ("${rowText}").`,
        category: 'VIEW_RENDERED_EMPTY',
        severity: 'LOW',
        details:
          'The crawler could not reach the detail view for this module. If this module should have data, the ' +
          'test fixture in tests/e2e/helpers/fixture.ts needs a record for it.',
      });
      return;
    }

    const before = await readViewState(this.page);
    await row.click({ timeout: 3000 }).catch(() => {});
    await this.page.waitForTimeout(SETTLE.overlay);
    const after = await readViewState(this.page);

    if (after.hash === before.hash && after.fingerprint === before.fingerprint && after.overlayCount === before.overlayCount) {
      this.record({
        target: `Table row "${rowText}"`,
        action: `Click the first row of the ${this.module} table`,
        expected: 'The record detail opens.',
        actual: 'Nothing happened — the row is not interactive.',
        category: 'INTERACTION_FAILED',
        severity: 'MEDIUM',
      });
      return;
    }

    await this.assertViewHealthy(`${rowText} detail`, 'The record detail view renders with the record loaded.');

    // Sub-tabs inside a detail view are where the ?tab= routing bug lives.
    await this.auditTabStrips(`${rowText} detail`);
    await this.auditDeepLinkRouting(after.hash);

    await dismissOverlays(this.page);
    await gotoView(this.page, homeHash);
  }

  /**
   * Re-enters the detail route by URL with a `?tab=` query, the way a bookmark
   * or a shared link would. A route parser that forgets to strip the query
   * fails exactly here.
   */
  async auditDeepLinkRouting(detailHash: string) {
    if (!/^#[a-z]+-/.test(detailHash)) return;
    const base = detailHash.split('?')[0];

    for (const tab of ['timeline', 'files', 'leads', 'invoices']) {
      const target = `${base}?tab=${tab}`;
      await gotoView(this.page, target);
      const state = await readViewState(this.page);

      if (state.errorScreen) {
        this.record({
          target: `Deep link ${target}`,
          action: `Open the record detail directly at \`${target}\``,
          expected: `The record loads with the "${tab}" tab preselected.`,
          actual: `An error screen was rendered: "${state.errorScreen}"`,
          category: 'NAVIGATION_WRONG_RESULT',
          severity: 'HIGH',
          details: `Loading \`${base}\` without the query works, so the query string is what breaks the lookup.`,
          proposedFix: this.proposeErrorScreenFix(state),
          screenshotPath: await captureEvidence(this.page, `deeplink-${tab}`),
        });
        // One report per route is enough; the cause is shared.
        return;
      }
      this.pass(`Deep link \`${target}\` loaded the record without error`);
    }
  }
}
