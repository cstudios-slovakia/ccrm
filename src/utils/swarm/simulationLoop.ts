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
  SimulationCheckpoint 
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
  private totalRounds: number;
  private diurnalCycle: boolean;
  private modelName: string;

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
    totalRounds: number;
    diurnalCycle?: boolean;
    modelName?: string;
    initialGraph: SwarmKnowledgeGraph;
    agents: SwarmAgentProfile[];
    initialPosts?: SwarmPost[];
    initialRound?: number;
    initialMetrics?: SwarmRoundMetrics[];
  }) {
    this.simulationId = params.simulationId;
    this.title = params.title;
    this.hypothesis = params.hypothesis;
    this.totalRounds = params.totalRounds;
    this.diurnalCycle = params.diurnalCycle ?? true;
    this.modelName = params.modelName || 'gpt-5.6-luna';
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

        // Notify UI
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

  private async executeAgentTurn(
    agent: SwarmAgentProfile,
    roundNum: number
  ): Promise<SwarmPost | null> {
    // 1. Generate agent feed using RecSys
    const feed = rankFeedForAgent(agent, this.posts, roundNum, 5);

    const systemPrompt = `You are ${agent.displayName} (@${agent.username}).
Profession: ${agent.profession} | MBTI: ${agent.mbti}
Your Persona & Biases: "${agent.userChar}"
Current Stance on the scenario: "${agent.stance}"

You are reading your social media timeline in a market rehearsal.
Decide on ONE action:
- "POST": Share your own fresh thought or reaction.
- "QUOTE": Quote an existing post and critique, praise, or analyze it.
- "COMMENT": Reply directly to a post.
- "LIKE": Endorse a post.
- "DO_NOTHING": Stay silent this round.

CRITICAL LANGUAGE REQUIREMENT:
You MUST write the "content" text in natural, authentic Slovak (Slovenčina). Do NOT write in English.

Output JSON strictly matching:
{
  "action": "POST" | "QUOTE" | "COMMENT" | "LIKE" | "DO_NOTHING",
  "target_post_id": number | null,
  "content": "Krátky príspevok alebo reakcia v slovenčine (1-3 vety) v rámci vašej role",
  "updated_stance": "supportive" | "opposing" | "neutral",
  "sentiment_score": number between -1.0 and 1.0
}`;

    const feedText = feed.length > 0 
      ? feed.map(p => `[Post ID #${p.id} by ${p.agentName} (@${p.agentUsername})]: "${p.content}" (Likes: ${p.likesCount}, Quotes: ${p.quotesCount})`).join('\n\n')
      : '(Timeline is quiet. No posts yet.)';

    const userPrompt = `Simulation Scenario:
${this.hypothesis}

Recent Timeline Feed:
${feedText}

What action do you take this round? (Write in Slovak / slovenčina)`;

    try {
      const decision = await callLlmJson<{
        action: 'POST' | 'QUOTE' | 'COMMENT' | 'LIKE' | 'DO_NOTHING';
        target_post_id?: number | null;
        content?: string;
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

      // Update agent stance
      if (decision.updated_stance) {
        agent.stance = decision.updated_stance;
      }

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
        content: decision.content || `Sledujem vývoj ohľadom: ${this.title}.`,
        likesCount: 0,
        quotesCount: 0,
        commentsCount: 0,
        sentimentScore: typeof decision.sentiment_score === 'number' ? decision.sentiment_score : 0,
        createdAt: new Date().toISOString()
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

    for (const a of this.agents) {
      if (a.stance === 'supportive') supportive++;
      else if (a.stance === 'opposing') opposing++;
      else neutral++;
    }

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
      viralIndex: Math.min(100, Math.round(interactions * 4.5))
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
