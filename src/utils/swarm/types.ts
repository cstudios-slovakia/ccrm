/**
 * Type definitions for the CCRM Swarm Artificial Intelligence (SAI) engine.
 */

export interface SwarmEntityNode {
  id: string;
  name: string;
  type: string; // 'Client', 'Competitor', 'Regulator', 'ProjectManager', etc.
  summary: string;
  attributes?: Record<string, any>;
  sourceCrmId?: string;
}

export interface SwarmEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  relation: string; // 'CRITICIZES', 'LICENSES', 'REGULATES', etc.
  fact: string;
  validFromRound: number;
  invalidFromRound?: number | null;
}

export interface SwarmKnowledgeGraph {
  nodes: SwarmEntityNode[];
  edges: SwarmEdge[];
}

export interface SwarmAgentProfile {
  id: number;
  username: string;
  displayName: string;
  profession: string;
  mbti: string;
  stance: 'supportive' | 'opposing' | 'neutral' | 'observer';
  userChar: string; // Private LLM system prompt / cognitive bias
  publicBio: string; // Public-facing bio
  followerCount: number;
  karma?: number;
  sourceEntityId?: string;
  interestedTopics: string[];
}

export interface SwarmPost {
  id: number;
  roundNum: number;
  agentId: number;
  agentName: string;
  agentUsername: string;
  agentProfession: string;
  platform: 'chitchat' | 'forum' | 'twitter' | 'reddit';
  actionType: 'POST' | 'REPOST' | 'QUOTE' | 'LIKE' | 'COMMENT';
  targetPostId?: number;
  content: string;
  likesCount: number;
  quotesCount: number;
  commentsCount: number;
  sentimentScore: number; // -1.0 (opposing/hostile) to +1.0 (enthusiastic/supportive)
  createdAt: string;
}

export interface SwarmRoundMetrics {
  round: number;
  simulatedHour: number;
  averageSentiment: number;
  supportiveCount: number;
  opposingCount: number;
  neutralCount: number;
  totalInteractions: number;
  viralIndex: number;
}

export interface SwarmContextDocument {
  id: string;
  name: string;
  size: number;
  type: 'pdf' | 'markdown' | 'text';
  filePath?: string;
  content: string;
  extractedChars: number;
  uploadedAt: string;
}

export interface SimulationParameters {
  id?: string;
  title: string;
  hypothesis: string;
  seedDocument: string;
  lookbackMonths: 6 | 12 | 24;
  crmDataSources?: string[];
  contextDocuments?: SwarmContextDocument[];
  swarmScale: number; // 15, 30, 60
  totalRounds: number; // 5 to 30
  platforms: 'dual' | 'chitchat' | 'forum' | 'twitter' | 'reddit';
  diurnalCycle: boolean;
  llmModel: string;
}

export interface StrategicReport {
  title: string;
  summary: string;
  generatedAt: string;
  sections: {
    title: string;
    description?: string;
    content: string;
  }[];
  strategicPlaybook: {
    keyVulnerabilities: string[];
    actionableCounterMeasures: string[];
    salesObjectionPlaybook: { objection: string; rebuttal: string }[];
    recommendedGtmSequence: string[];
  };
}

export interface SimulationCheckpoint {
  simulationId: string;
  title: string;
  hypothesis: string;
  currentRound: number;
  totalRounds: number;
  status: 'draft' | 'prepared' | 'running' | 'paused' | 'completed' | 'failed';
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  metricsHistory: SwarmRoundMetrics[];
  finalReport?: StrategicReport | null;
}
