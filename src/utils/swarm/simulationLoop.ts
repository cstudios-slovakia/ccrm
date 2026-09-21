/**
 * Swarm Simulation Loop
 * The core client-side asynchronous orchestrator that runs parallel agent turns,
 * feed recommendation, engagement updates, and round-by-round PHP checkpointing.
 */

import { callLlmJson } from './llmProxyClient';
import { rankFeedForAgent } from './recsysEngine';
import { saveRoundCheckpoint } from './checkpointClient';
import type { 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmKnowledgeGraph, 
  SwarmRoundMetrics, 
  SimulationCheckpoint,
  SwarmContextDocument
} from './types';

export interface RoundProgressCallback {
  (progress: {
    currentRound: number;
    totalRounds: number;
    newPosts: SwarmPost[];
    updatedGraph: SwarmKnowledgeGraph;
    metrics: SwarmRoundMetrics;
  }): void;
}

export class SwarmSimulationEngine {
  private simulationId: string;
  private title: string;
  private hypothesis: string;
  private strategicQuestion: string;
  private seedDocument: string;
  private contextDocuments: SwarmContextDocument[];
  private totalRounds: number;
  private diurnalCycle: boolean;
  private modelName: string;
  private language: string;

  private currentRound: number = 0;
  private agents: SwarmAgentProfile[] = [];
  private graph: SwarmKnowledgeGraph = { nodes: [], edges: [] };
  private posts: SwarmPost[] = [];
  private metricsHistory: SwarmRoundMetrics[] = [];

  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private wakeLock: any = null;
  private postIdCounter: number = 1;

  constructor(params: {
    simulationId: string;
    title: string;
    hypothesis: string;
    strategicQuestion?: string;
    seedDocument?: string;
    contextDocuments?: SwarmContextDocument[];
    totalRounds: number;
    diurnalCycle?: boolean;
    modelName?: string;
    language?: string;
    initialGraph: SwarmKnowledgeGraph;
    agents: SwarmAgentProfile[];
    initialPosts?: SwarmPost[];
    initialRound?: number;
    initialMetrics?: SwarmRoundMetrics[];
  }) {
    this.simulationId = params.simulationId;
    this.title = params.title;
    this.hypothesis = params.hypothesis;
    this.strategicQuestion = params.strategicQuestion || params.hypothesis;
    this.seedDocument = params.seedDocument || '';
    this.contextDocuments = params.contextDocuments || [];
    this.totalRounds = params.totalRounds;
    this.diurnalCycle = params.diurnalCycle ?? true;
    this.modelName = params.modelName || 'gpt-5.6-luna';
    this.language = params.language || 'sk';
    this.graph = params.initialGraph;
    this.agents = params.agents;
    this.posts = params.initialPosts || [];
    this.currentRound = params.initialRound || 0;
    this.metricsHistory = params.initialMetrics || [];
    this.postIdCounter = this.posts.length + 1;
  }

  public async start(onProgress: RoundProgressCallback): Promise<void> {
    this.isRunning = true;
    this.shouldStop = false;

    // 1. Acquire Wake Lock to prevent laptop from sleeping
    await this.acquireWakeLock();

    // 2. Add beforeunload listener
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (this.isRunning) {
        e.preventDefault();
        e.returnValue = 'Prebieha simulácia. Pokrok je uložený, no beh bude pozastavený.';
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);

    try {
      while (this.currentRound < this.totalRounds && !this.shouldStop) {
        this.currentRound += 1;
        const roundPosts = await this.executeRound(this.currentRound);
        
        // Dynamic graph update based on round interactions
        this.updateGraphDynamics(this.currentRound);

        // Calculate round metrics
        const metrics = this.computeRoundMetrics(this.currentRound, roundPosts);
        this.metricsHistory.push(metrics);

        // Update checkpoint to PHP server asynchronously
        const snapshot: SimulationCheckpoint = {
          simulationId: this.simulationId,
          title: this.title,
          hypothesis: this.hypothesis,
          currentRound: this.currentRound,
          totalRounds: this.totalRounds,
          status: this.currentRound >= this.totalRounds ? 'completed' : 'running',
          graph: this.graph,
          agents: this.agents,
          posts: this.posts,
          metricsHistory: this.metricsHistory
        };

        await saveRoundCheckpoint(this.simulationId, this.currentRound, snapshot, roundPosts);

        // Notify UI with dynamic graph update
        onProgress({
          currentRound: this.currentRound,
          totalRounds: this.totalRounds,
          newPosts: roundPosts,
          updatedGraph: this.graph,
          metrics
        });
      }
    } finally {
      this.isRunning = false;
      this.releaseWakeLock();
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    }
  }

  public stop(): void {
    this.shouldStop = true;
  }

  private async executeRound(roundNum: number): Promise<SwarmPost[]> {
    // Select active agents for this round based on diurnal pacing
    const activeAgents = this.selectActiveAgentsForRound(roundNum);
    const newRoundPosts: SwarmPost[] = [];

    // Concurrency pool: execute max 10 agents simultaneously to preserve network stability
    const concurrency = 10;
    for (let i = 0; i < activeAgents.length; i += concurrency) {
      if (this.shouldStop) break;
      const batch = activeAgents.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(agent => this.executeAgentTurn(agent, roundNum))
      );

      for (const res of batchResults) {
        if (res) {
          newRoundPosts.push(res);
          this.posts.push(res);
          // If post quotes or likes a previous post, update engagement
          if (res.targetPostId) {
            const target = this.posts.find(p => p.id === res.targetPostId);
            if (target) {
              if (res.actionType === 'QUOTE') target.quotesCount = (target.quotesCount || 0) + 1;
              if (res.actionType === 'LIKE') target.likesCount = (target.likesCount || 0) + 1;
              if (res.actionType === 'COMMENT') target.commentsCount = (target.commentsCount || 0) + 1;
            }
          }
        }
      }
    }

    return newRoundPosts;
  }

  private updateGraphDynamics(roundNum: number): void {
    if (!this.graph || !this.graph.nodes || this.graph.nodes.length === 0) return;

    // Aggregate stance changes and sentiment by entity
    const entityStanceMap = new Map<string, { supportive: number; opposing: number; neutral: number }>();

    for (const a of this.agents) {
      const entityId = a.sourceEntityId || 'node_1';
      if (!entityStanceMap.has(entityId)) {
        entityStanceMap.set(entityId, { supportive: 0, opposing: 0, neutral: 0 });
      }
      const data = entityStanceMap.get(entityId)!;
      if (a.stance === 'supportive') data.supportive++;
      else if (a.stance === 'opposing') data.opposing++;
      else data.neutral++;
    }

    // Update existing edges based on debate sentiment
    for (const edge of this.graph.edges) {
      const srcData = entityStanceMap.get(edge.source);
      if (srcData) {
        const total = srcData.supportive + srcData.opposing + srcData.neutral;
        if (total > 0) {
          const supportRatio = srcData.supportive / total;
          const opposeRatio = srcData.opposing / total;

          if (supportRatio >= 0.6) {
            edge.relation = this.language === 'hu' ? 'TÁMOGATJA' : this.language === 'en' ? 'SUPPORTS' : 'PODPORUJE';
          } else if (opposeRatio >= 0.5) {
            edge.relation = this.language === 'hu' ? 'ELLENZI' : this.language === 'en' ? 'OPPOSES' : 'ODMIETA';
          } else if (srcData.opposing > 0 && srcData.supportive > 0) {
            edge.relation = this.language === 'hu' ? 'VITATJA' : this.language === 'en' ? 'DEBATES' : 'POLEMIZUJE';
          }
          edge.validFromRound = roundNum;
        }
      }
    }
  }

  private async executeAgentTurn(
    agent: SwarmAgentProfile,
    roundNum: number
  ): Promise<SwarmPost | null> {
    // 1. Generate agent feed using RecSys
    const feed = rankFeedForAgent(agent, this.posts, roundNum, 5);

    const langLabel = this.language === 'hu' ? 'Hungarian (Magyar)' : this.language === 'en' ? 'English' : 'Slovak (Slovenčina)';
    const samplePost = this.language === 'hu'
      ? 'Érdemi szakmai érvelés, konkrét észrevétel vagy éles kritika magyar nyelven (1-3 mondat)'
      : this.language === 'en'
      ? 'Substantive professional argument, specific feedback, or rigorous critique in English (1-3 sentences)'
      : 'Vecný odborný argument, konkrétna pripomienka alebo kritika v slovenčine (1-3 vety)';

    let contextSnippet = '';
    if (this.seedDocument && this.seedDocument.trim().length > 0) {
      contextSnippet += `\n\nProduct & Business Context:\n${this.seedDocument.slice(0, 3000)}`;
    }
    if (this.contextDocuments && this.contextDocuments.length > 0) {
      contextSnippet += '\n\nAttached Specifications & Documents:\n' +
        this.contextDocuments.map(d => `- [${d.name}]: ${d.content.slice(0, 1500)}`).join('\n');
    }

    const systemPrompt = `You are roleplaying as ${agent.displayName} (@${agent.username}) in an autonomous market simulation.
Profession: ${agent.profession} | MBTI: ${agent.mbti}
Your Persona, Core Biases & Domain Expertise: "${agent.userChar}"
Current Stance: "${agent.stance}"
Current Supported Answer/Position: "${agent.currentAnswer || agent.stance}" (Confidence: ${agent.confidenceScore || 70}%)

CRITICAL ROLEPLAY & BEHAVIORAL RULES:
1. STRICT SEED ISOLATION: Speak and react strictly regarding the specific Strategic Question, Product & Business Context, and Attached Specifications provided below. NEVER mention or import unrelated industries or prior runs.
2. Speak strictly from the perspective of your profession (${agent.profession}) and cognitive bias.
3. Ground your comments in concrete scenario facts: cite pricing numbers, technical specs, user habits, aesthetic wear-and-tear, or competitive alternatives from the context.
4. ANSWER & DECISION ENGINE: You are not just posting generic chatter. You are evaluating the core Strategic Question. State your current position/answer clearly, defend it, or explain why you are skeptical.
5. If another agent's argument in the feed convinces or alarms you, update your position ("current_answer") and provide your "answer_shift_reason".
6. NEVER write empty filler like "I am watching this". Deliver punchy, realistic, debate-provoking commentary (1-3 sentences).

CRITICAL LANGUAGE REQUIREMENT:
You MUST write your commentary/reaction strictly in natural, authentic ${langLabel}.

Output JSON strictly matching:
{
  "action": "POST" | "QUOTE" | "COMMENT" | "LIKE" | "DO_NOTHING",
  "target_post_id": number | null,
  "content": "${samplePost}",
  "current_answer": "Short phrase (e.g. Forest Green, Matte Black, Oppose 20% increase, Candidate B, etc.)",
  "confidence_score": number between 0 and 100,
  "answer_shift_reason": "Optional short sentence if you changed your mind based on feed arguments",
  "updated_stance": "supportive" | "opposing" | "neutral",
  "sentiment_score": number between -1.0 and 1.0
}`;

    const feedText = feed.length > 0 
      ? feed.map(p => `[Post ID #${p.id} by ${p.agentName} (@${p.agentUsername}, ${p.agentProfession})]: "${p.content}" (Likes: ${p.likesCount}, Quotes: ${p.quotesCount})`).join('\n\n')
      : '(Timeline is quiet. No posts yet in this cycle.)';

    const userPrompt = `Strategic Question to Answer:
${this.strategicQuestion || this.hypothesis}${contextSnippet}

Recent Social Timeline Feed:
${feedText}

What action and stance do you take this round? (Write in ${langLabel})`;

    try {
      const decision = await callLlmJson<{
        action: 'POST' | 'QUOTE' | 'COMMENT' | 'LIKE' | 'DO_NOTHING';
        target_post_id?: number | null;
        content?: string;
        current_answer?: string;
        confidence_score?: number;
        answer_shift_reason?: string;
        updated_stance?: 'supportive' | 'opposing' | 'neutral';
        sentiment_score?: number;
      }>([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        model: this.modelName,
        temperature: 0.7,
        maxTokens: 1500
      });

      if (decision.action === 'DO_NOTHING') return null;

      // Track verdict shift if answer changed
      let verdictShift: { from?: string; to?: string; reason?: string } | undefined = undefined;
      if (decision.current_answer && agent.currentAnswer && decision.current_answer.toLowerCase().trim() !== agent.currentAnswer.toLowerCase().trim()) {
        verdictShift = {
          from: agent.currentAnswer,
          to: decision.current_answer,
          reason: decision.answer_shift_reason || undefined
        };
      }

      // Update agent state
      if (decision.updated_stance) {
        agent.stance = decision.updated_stance;
      }
      if (decision.current_answer) {
        agent.currentAnswer = decision.current_answer;
      }
      if (typeof decision.confidence_score === 'number') {
        agent.confidenceScore = Math.max(0, Math.min(100, Math.round(decision.confidence_score)));
      }
      if (decision.answer_shift_reason) {
        agent.answerReason = decision.answer_shift_reason;
      }

      const defaultFallbackContent = this.language === 'hu'
        ? `Értékelem a helyzetet és a feltételeket a(z) ${this.title} kapcsán.`
        : this.language === 'en'
        ? `Evaluating terms and impact regarding ${this.title}.`
        : `Vyhodnocujem podmienky a dopady k téme: ${this.title}.`;

      const newPost: SwarmPost = {
        id: this.postIdCounter++,
        roundNum,
        agentId: agent.id,
        agentName: agent.displayName,
        agentUsername: agent.username,
        agentProfession: agent.profession,
        platform: Math.random() > 0.4 ? 'chitchat' : 'forum',
        actionType: decision.action || 'POST',
        targetPostId: decision.target_post_id || undefined,
        content: decision.content || defaultFallbackContent,
        likesCount: 0,
        quotesCount: 0,
        commentsCount: 0,
        sentimentScore: typeof decision.sentiment_score === 'number' ? decision.sentiment_score : 0,
        createdAt: new Date().toISOString(),
        supportedAnswer: agent.currentAnswer,
        verdictShift
      };

      return newPost;
    } catch (err) {
      console.warn(`Agent ${agent.username} turn failed:`, err);
      return null;
    }
  }

  private selectActiveAgentsForRound(roundNum: number): SwarmAgentProfile[] {
    if (!this.diurnalCycle) return [...this.agents];

    // Simulate 24-hour day across total rounds
    const simulatedHour = ((roundNum - 1) * 3) % 24;
    let activityMultiplier = 0.7; // default work hour

    if (simulatedHour >= 0 && simulatedHour <= 5) activityMultiplier = 0.2; // quiet night
    else if (simulatedHour >= 6 && simulatedHour <= 8) activityMultiplier = 0.5; // morning wake
    else if (simulatedHour >= 19 && simulatedHour <= 22) activityMultiplier = 1.0; // peak evening debate

    const targetActiveCount = Math.max(3, Math.round(this.agents.length * activityMultiplier));
    
    // Shuffle and pick
    const shuffled = [...this.agents].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, targetActiveCount);
  }

  private computeRoundMetrics(roundNum: number, roundPosts: SwarmPost[]): SwarmRoundMetrics {
    const simulatedHour = ((roundNum - 1) * 3) % 24;
    
    let totalSent = 0;
    let supportive = 0;
    let opposing = 0;
    let neutral = 0;

    const answerDistribution: Record<string, number> = {};

    for (const a of this.agents) {
      if (a.stance === 'supportive') supportive++;
      else if (a.stance === 'opposing') opposing++;
      else neutral++;

      const ansKey = a.currentAnswer || (a.stance === 'supportive' ? 'Support' : a.stance === 'opposing' ? 'Oppose' : 'Undecided');
      answerDistribution[ansKey] = (answerDistribution[ansKey] || 0) + 1;
    }

    let leadingAnswer = '';
    let maxVotes = 0;
    for (const [ans, count] of Object.entries(answerDistribution)) {
      if (count > maxVotes) {
        maxVotes = count;
        leadingAnswer = ans;
      }
    }

    const consensusPercentage = this.agents.length > 0
      ? Math.round((maxVotes / this.agents.length) * 100)
      : 0;

    for (const p of roundPosts) {
      totalSent += p.sentimentScore;
    }

    const avgSent = roundPosts.length > 0 ? (totalSent / roundPosts.length) : 0;
    const interactions = roundPosts.reduce((sum, p) => sum + (p.quotesCount || 0) + (p.likesCount || 0) + (p.commentsCount || 0), roundPosts.length);

    return {
      round: roundNum,
      simulatedHour,
      averageSentiment: parseFloat(avgSent.toFixed(2)),
      supportiveCount: supportive,
      opposingCount: opposing,
      neutralCount: neutral,
      totalInteractions: interactions,
      viralIndex: Math.min(100, Math.round(interactions * 4.5)),
      answerDistribution,
      leadingAnswer,
      consensusPercentage
    };
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }
}
