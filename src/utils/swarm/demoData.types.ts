import type {
  SimulationCheckpoint,
  SwarmKnowledgeGraph,
  SwarmAgentProfile,
  SwarmPost,
  SwarmRoundMetrics,
  StrategicReport
} from './types.ts';

/** A canned reply of the demo Q&A: used when the question contains any of the keywords (lower case). */
export interface DemoCannedAnswer {
  keywords: string[];
  answer: string;
}

/**
 * Everything the built-in interactive SAI demo shows, in ONE language.
 * One bundle per language lives in demoData.{sk,hu,en}.ts; demoData.ts picks by language.
 * The scenario is the same in all three (docs/DEMO-MODE.md C12): Lapidea, a 15-year
 * warranty on premium sintered stone priced +12 %. No money amounts appear in the texts
 * (this data is client-side and cannot follow the install's currency); only percentages.
 */
export interface DemoBundle {
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  metricsHistory: SwarmRoundMetrics[];
  report: StrategicReport;
  checkpoint: SimulationCheckpoint;
  /** Graph node highlighted in the guided walkthrough. */
  activeNodeId: string;
  /** Seed document of the scenario (what the "proposal" says). */
  seedDocument: string;
  /** Step 1 of the walkthrough types this out. */
  proposalText: string;
  /** One line used as the scenario label in the walkthrough and as the report's proposal. */
  scenarioLabel: string;
  /** The "Interactive Demo" card in the SAI list. */
  cardTitle: string;
  cardDescription: string;
  analystAnswers: DemoCannedAnswer[];
  analystFallback: string;
  /** Matched against the agent's display name + username (lower case). */
  agentAnswers: DemoCannedAnswer[];
  agentFallback: string;
}
