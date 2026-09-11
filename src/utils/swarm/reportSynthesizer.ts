/**
 * Report Synthesizer Service
 * ReAct Chief Analyst that compiles the final grounded predictive briefing,
 * including the mandatory "What Strategy to Use to Achieve the Goal?" strategic playbook.
 */

import { callLlmJson } from './llmProxyClient';
import type { SwarmPost, SwarmAgentProfile, SwarmKnowledgeGraph, StrategicReport } from './types';

export async function generateStrategicReport(params: {
  title: string;
  hypothesis: string;
  seedDocument: string;
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  modelName?: string;
}): Promise<StrategicReport> {
  const { title, hypothesis, seedDocument, graph: _graph, agents, posts, modelName } = params;

  // Filter top quoted or impactful posts
  const impactfulPosts = [...posts]
    .sort((a, b) => (b.quotesCount + b.likesCount + b.commentsCount) - (a.quotesCount + a.likesCount + a.commentsCount))
    .slice(0, 25);

  const supportiveAgents = agents.filter(a => a.stance === 'supportive').length;
  const opposingAgents = agents.filter(a => a.stance === 'opposing').length;
  const neutralAgents = agents.filter(a => a.stance === 'neutral').length;

  const systemPrompt = `You are the Chief Intelligence Analyst for an enterprise market rehearsal simulation.
Your job is to analyze the complete transcript of the multi-agent simulation and produce an authoritative, highly strategic executive briefing.

MANDATORY REQUIREMENTS:
1. Grounding: All analysis must quote actual agent posts and identify real failure points from the simulation data.
2. Structure: You must provide 3 primary analytical chapters AND a mandatory 4th strategic playbook:
   - Chapter 1: Executive Consensus & Market Polarization
   - Chapter 2: Critical Vulnerabilities & Top Objections (quote exact skeptical agents)
   - Chapter 3: Competitor Counter-Strategy Analysis
   - Chapter 4: 🎯 WHAT STRATEGY TO USE TO ACHIEVE THE GOAL?
3. Strategic Playbook: Provide direct actionable counter-measures, specific sales objection rebuttals, and a clear sequence of moves to win the market.

Output JSON strictly matching this schema:
{
  "title": "Predictive Market Rehearsal Briefing: ...",
  "summary": "High-level 2-sentence executive summary of the simulated outcome.",
  "sections": [
    {
      "title": "1. Executive Consensus & Market Polarization",
      "content": "Detailed markdown content with statistics and agent breakdown..."
    },
    {
      "title": "2. Critical Vulnerabilities & Primary Objections",
      "content": "Detailed markdown content quoting specific skeptical agents..."
    },
    {
      "title": "3. Competitor Counter-Strategy Analysis",
      "content": "Detailed markdown content analyzing how competitors retaliated..."
    },
    {
      "title": "4. 🎯 What Strategy to Use to Achieve the Goal?",
      "content": "Detailed playbook explaining exact positioning, adjustments, and pricing tweaks..."
    }
  ],
  "strategicPlaybook": {
    "keyVulnerabilities": ["Vulnerability 1", "Vulnerability 2"],
    "actionableCounterMeasures": ["Counter-measure 1", "Counter-measure 2"],
    "salesObjectionPlaybook": [
      {
        "objection": "Common prospect objection discovered in sim",
        "rebuttal": "Exact turn-key script for sales reps to overcome it"
      }
    ],
    "recommendedGtmSequence": ["Step 1: ...", "Step 2: ...", "Step 3: ..."]
  }
}`;

  const userPrompt = `Rehearsal Title: ${title}
Target Hypothesis / What-If Variable:
${hypothesis}

Simulation Metrics:
- Total Agents: ${agents.length} (Supportive: ${supportiveAgents}, Opposing: ${opposingAgents}, Neutral: ${neutralAgents})
- Total Interactions / Posts Logged: ${posts.length}

Most Impactful Posts & Debates from the Simulation:
${impactfulPosts.map(p => `- [Round ${p.roundNum}] ${p.agentName} (@${p.agentUsername}, ${p.agentProfession}): "${p.content}" (Likes: ${p.likesCount}, Quotes: ${p.quotesCount})`).join('\n')}

Original Product Brief Seed:
${seedDocument.slice(0, 4000)}

Synthesize the final authoritative strategic report.`;

  const report = await callLlmJson<StrategicReport>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], {
    model: modelName || 'gpt-5.6-luna',
    temperature: 0.4,
    maxTokens: 3000
  });

  report.generatedAt = new Date().toISOString();
  return report;
}
