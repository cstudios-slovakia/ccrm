import type { Locator } from '@playwright/test';

/**
 * Geometry- and stacking-context analysis for popup layers.
 *
 * The original crawler asked one question — "is the element at my centre point
 * me?" — and reported the immediate hit element as the cause. That names a
 * sibling button rather than the layer that actually wins the paint order, so
 * the finding was unactionable. This module instead resolves both sides to
 * their nearest *stacking context*, which is the thing whose z-index has to
 * change.
 */

export interface ElementDescriptor {
  tag: string;
  classes: string;
  zIndex: string;
  position: string;
  /** Set when this element establishes a stacking context, with the reason why. */
  stackingReason?: string;
}

export interface PanelAnalysis {
  mounted: boolean;
  rect: { x: number; y: number; width: number; height: number };
  /** Rendered with real dimensions and not hidden by CSS. */
  paintable: boolean;
  hiddenReason?: string;
  /** Sample points inside the panel that another layer paints over. */
  occludedPoints: number;
  totalPoints: number;
  occluder?: ElementDescriptor;
  /** Nearest stacking context above the occluder — the layer that wins. */
  occluderStackingContext?: ElementDescriptor;
  /** Nearest stacking context above the panel — the layer that loses. */
  panelStackingContext?: ElementDescriptor;
  /** Panel is (partly) outside the viewport. */
  outsideViewport: boolean;
  /** An ancestor with overflow!=visible that crops the panel. */
  clippedBy?: ElementDescriptor;
  optionCount: number;
}

/**
 * Runs entirely in the page so it can read live layout and hit-test.
 */
export async function analyzePanel(panel: Locator): Promise<PanelAnalysis> {
  return panel.evaluate((el: Element): PanelAnalysis => {
    const describe = (node: Element | null): ElementDescriptor | undefined => {
      if (!node) return undefined;
      const cs = window.getComputedStyle(node);
      const cls = typeof node.className === 'string' ? node.className : '';
      return {
        tag: node.tagName.toLowerCase(),
        classes: cls.trim().split(/\s+/).slice(0, 8).join(' '),
        zIndex: cs.zIndex,
        position: cs.position,
        stackingReason: stackingReason(node, cs),
      };
    };

    function stackingReason(node: Element, cs: CSSStyleDeclaration): string | undefined {
      if (node === document.documentElement) return 'root element';
      if (cs.position === 'fixed' || cs.position === 'sticky') return `position: ${cs.position}`;
      if (cs.position !== 'static' && cs.zIndex !== 'auto') return `position: ${cs.position} + z-index: ${cs.zIndex}`;
      if (cs.opacity !== '1') return `opacity: ${cs.opacity}`;
      if (cs.transform !== 'none') return 'transform';
      if (cs.filter !== 'none') return 'filter';
      if (cs.perspective && cs.perspective !== 'none') return 'perspective';
      if (cs.isolation === 'isolate') return 'isolation: isolate';
      if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return `mix-blend-mode: ${cs.mixBlendMode}`;
      if (cs.contain && /paint|layout|content|strict/.test(cs.contain)) return `contain: ${cs.contain}`;
      const wc = cs.willChange || '';
      if (/transform|opacity|filter/.test(wc)) return `will-change: ${wc}`;
      return undefined;
    }

    const nearestStackingContext = (node: Element | null): ElementDescriptor | undefined => {
      let cur: Element | null = node;
      while (cur) {
        const cs = window.getComputedStyle(cur);
        const reason = stackingReason(cur, cs);
        if (reason) return describe(cur);
        cur = cur.parentElement;
      }
      return undefined;
    };

    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const geometry = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    const optionCount = el.querySelectorAll('[role="option"], li, button').length;

    let hiddenReason: string | undefined;
    if (rect.width === 0 || rect.height === 0) {
      hiddenReason = `zero size (${geometry.width}x${geometry.height})`;
    } else if (cs.display === 'none') {
      hiddenReason = 'display: none';
    } else if (cs.visibility === 'hidden' || cs.visibility === 'collapse') {
      hiddenReason = `visibility: ${cs.visibility}`;
    } else if (parseFloat(cs.opacity) < 0.05) {
      hiddenReason = `opacity: ${cs.opacity}`;
    }

    // A panel that renders off-screen is broken in a different way than one
    // that renders behind something.
    const outsideViewport =
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= 0 ||
      rect.left >= window.innerWidth;

    // Nearest ancestor that crops us.
    let clippedBy: ElementDescriptor | undefined;
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      const acs = window.getComputedStyle(cur);
      if (acs.overflow !== 'visible' && acs.overflow !== '') {
        const ar = cur.getBoundingClientRect();
        const crops = rect.top < ar.top - 1 || rect.bottom > ar.bottom + 1 || rect.left < ar.left - 1 || rect.right > ar.right + 1;
        if (crops) clippedBy = describe(cur);
        break;
      }
    }

    if (hiddenReason || outsideViewport) {
      return {
        mounted: true,
        rect: geometry,
        paintable: false,
        hiddenReason,
        occludedPoints: 0,
        totalPoints: 0,
        outsideViewport,
        clippedBy,
        panelStackingContext: nearestStackingContext(el),
        optionCount,
      };
    }

    // Hit-test a spread of points rather than only the centre: a panel can be
    // half-covered by a drawer edge, which a single centre probe misses.
    const px = [0.15, 0.5, 0.85];
    const py = [0.1, 0.5, 0.9];
    const samples: Array<{ x: number; y: number }> = [];
    for (const fx of px) for (const fy of py) {
      samples.push({ x: rect.left + rect.width * fx, y: rect.top + rect.height * fy });
    }

    let occludedPoints = 0;
    let occluder: Element | null = null;
    for (const s of samples) {
      if (s.x < 0 || s.y < 0 || s.x > window.innerWidth || s.y > window.innerHeight) continue;
      const top = document.elementFromPoint(s.x, s.y);
      if (!top) {
        occludedPoints++;
        continue;
      }
      if (top === el || el.contains(top)) continue;
      occludedPoints++;
      if (!occluder) occluder = top;
    }

    return {
      mounted: true,
      rect: geometry,
      paintable: true,
      occludedPoints,
      totalPoints: samples.length,
      occluder: describe(occluder),
      occluderStackingContext: nearestStackingContext(occluder),
      panelStackingContext: nearestStackingContext(el),
      outsideViewport: false,
      clippedBy,
      optionCount,
    };
  });
}

/** Compact one-line evidence string for the report. */
export function formatEvidence(a: PanelAnalysis): string {
  const parts = [`panel ${a.rect.width}x${a.rect.height} at (${a.rect.x}, ${a.rect.y})`, `${a.optionCount} option(s)`];
  if (a.hiddenReason) parts.push(`hidden by ${a.hiddenReason}`);
  if (a.outsideViewport) parts.push('rendered outside the viewport');
  if (a.totalPoints) parts.push(`${a.occludedPoints}/${a.totalPoints} sample points covered`);
  if (a.panelStackingContext) parts.push(`panel layer ${describeShort(a.panelStackingContext)}`);
  if (a.occluderStackingContext) parts.push(`covering layer ${describeShort(a.occluderStackingContext)}`);
  else if (a.occluder) parts.push(`covering element ${describeShort(a.occluder)}`);
  if (a.clippedBy) parts.push(`clipped by ${describeShort(a.clippedBy)}`);
  return parts.join('; ');
}

function describeShort(d: ElementDescriptor): string {
  const z = d.zIndex === 'auto' ? 'z-auto' : `z-index ${d.zIndex}`;
  const reason = d.stackingReason ? `, ${d.stackingReason}` : '';
  return `<${d.tag} class="${d.classes}"> (${z}${reason})`;
}

/**
 * Turns the measurements into remediation a developer can act on without
 * re-deriving the diagnosis.
 */
export function proposeDropdownFix(a: PanelAnalysis, panelSelectorHint: string): string {
  const lines: string[] = [];

  if (a.hiddenReason?.startsWith('zero size')) {
    lines.push(
      `The options panel is in the DOM but has no size, so the trigger looks "open" while nothing is painted.`,
      `Check the code that positions the panel: if its fixed/absolute coordinates are computed from the`,
      `trigger's \`getBoundingClientRect()\` in a layout effect, a null/stale rect yields a collapsed box.`,
      `Verify the panel receives a width (\`minWidth\`/\`width\`) and that its content is rendered before measuring.`,
    );
    return lines.join('\n');
  }

  if (a.hiddenReason) {
    lines.push(
      `The options panel is mounted but not painted (${a.hiddenReason}).`,
      `If this is an enter animation, the panel never reached its final frame — check the animation's`,
      `\`animate\` target and that the element is not left at its \`initial\` state.`,
    );
    return lines.join('\n');
  }

  if (a.outsideViewport) {
    lines.push(
      `The options panel renders outside the visible viewport at (${a.rect.x}, ${a.rect.y}).`,
      `Its flip/clamp logic is not keeping the panel on screen. Clamp the computed \`top\`/\`left\` to the`,
      `viewport bounds and recompute on scroll and resize.`,
    );
    return lines.join('\n');
  }

  if (a.clippedBy) {
    lines.push(
      `The options panel is cropped by an ancestor with \`overflow\` other than \`visible\``,
      `(${describeShort(a.clippedBy)}).`,
      `Render the panel in a portal attached to \`document.body\` so it escapes the scroll container,`,
      `or give the container \`overflow: visible\` while the panel is open.`,
    );
    return lines.join('\n');
  }

  const panelZ = numericZ(a.panelStackingContext);
  const occZ = numericZ(a.occluderStackingContext);

  lines.push(
    `The options panel paints below another layer, so it is in the DOM but invisible to the user.`,
    ``,
    `Losing layer (the panel):   ${a.panelStackingContext ? describeShort(a.panelStackingContext) : 'no stacking context found'}`,
    `Winning layer (covering it): ${a.occluderStackingContext ? describeShort(a.occluderStackingContext) : describeShort(a.occluder!)}`,
    ``,
  );

  if (panelZ !== null && occZ !== null && occZ > panelZ) {
    lines.push(
      `Both layers are portalled siblings under \`document.body\`, so paint order is decided purely by`,
      `z-index: ${occZ} beats ${panelZ}. Raise the panel above the overlay — either lift the panel's`,
      `z-index above ${occZ}, or lower the overlay below ${panelZ}.`,
      ``,
      `Because this app has several overlay layers with hand-picked values, the durable fix is to replace`,
      `the ad-hoc numbers with a small shared scale (for example \`--z-drawer: 100\`, \`--z-popover: 200\`,`,
      `\`--z-toast: 300\`) and have ${panelSelectorHint} and the drawer both read from it. Otherwise the next`,
      `overlay added with a larger literal reintroduces exactly this bug.`,
    );
  } else {
    lines.push(
      `Compare the two stacking contexts above. The panel must either sit in a stacking context that wins,`,
      `or be rendered inside the covering layer's own subtree so it is no longer competing with it.`,
      `Note that a \`transform\`, \`filter\` or \`opacity\` on an ancestor creates a stacking context and traps`,
      `the panel regardless of how large its z-index is.`,
    );
  }

  return lines.join('\n');
}

function numericZ(d?: ElementDescriptor): number | null {
  if (!d) return null;
  const n = parseInt(d.zIndex, 10);
  return Number.isFinite(n) ? n : null;
}
