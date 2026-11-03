/**
 * Built-in interactive SAI demo (the demo toggle and the guided walkthrough).
 *
 * One bundle per language - demoData.{sk,hu,en}.ts - all telling the same Lapidea scenario
 * (docs/DEMO-MODE.md C12: a 15-year warranty on premium sintered stone, priced +12 %). This
 * index picks the bundle by the system language ('en' is the fallback). The stored demo
 * simulations (demo-sai-1, demo-sai-2) are a different thing: the PHP demo seed writes those.
 */
import type { DemoBundle, DemoCannedAnswer } from './demoData.types.ts';
import { DEMO_SK } from './demoData.sk.ts';
import { DEMO_HU } from './demoData.hu.ts';
import { DEMO_EN } from './demoData.en.ts';

export type { DemoBundle } from './demoData.types.ts';

/** The id of the built-in demo simulation. The stored demo rows must not use it (they are demo-sai-*). */
export const DEMO_SIMULATION_ID = 'demo-pricing-rehearsal';

/** True for the built-in client-side demo and for the transient runs of the demo toggle (demo-sim-*). */
export function isBuiltInDemoSimulationId(id: unknown): boolean {
  return typeof id === 'string' && (id === DEMO_SIMULATION_ID || id.startsWith('demo-sim-'));
}

export function getDemoData(language?: string): DemoBundle {
  return language === 'sk' ? DEMO_SK : language === 'hu' ? DEMO_HU : DEMO_EN;
}

function pick(list: DemoCannedAnswer[], haystack: string): string | null {
  const h = haystack.toLowerCase();
  const hit = list.find(a => a.keywords.some(k => h.includes(k)));
  return hit ? hit.answer : null;
}

export function getDemoAnalystAnswer(question: string, language?: string): string {
  const d = getDemoData(language);
  return pick(d.analystAnswers, question) ?? d.analystFallback;
}

export function getDemoAgentAnswer(agentName: string, language?: string, agentUsername = ''): string {
  const d = getDemoData(language);
  return pick(d.agentAnswers, `${agentName} ${agentUsername}`) ?? d.agentFallback;
}
