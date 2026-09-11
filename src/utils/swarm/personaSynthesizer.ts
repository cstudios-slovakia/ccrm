/**
 * Persona Synthesizer Service
 * Expands knowledge graph entities into diverse, autonomous agent profiles with distinct MBTIs, biases, and stances.
 */

import { callLlmJson } from './llmProxyClient';
import type { SwarmEntityNode, SwarmAgentProfile } from './types';

export async function synthesizeAgentProfiles(
  nodes: SwarmEntityNode[],
  targetCount: number = 30,
  hypothesis: string,
  modelName: string = 'gpt-5.6-luna'
): Promise<SwarmAgentProfile[]> {
  const systemPrompt = `You are an expert Social Agent Profile Architect for market simulations.
Given a list of stakeholder entities extracted from a business scenario, generate a diverse swarm of autonomous social media profiles (Chitchat/Forum accounts).

Ensure cognitive, demographic, and stance diversity:
- Some agents should be early-adopting and enthusiastic.
- Some agents must be highly skeptical, conservative, budget-constrained, or compliance-obsessed.
- Some agents must represent competitors actively spreading counter-narratives or FUD.
- Include realistic professions, diverse MBTI types (INTJ, ESTP, INFJ, etc.), and distinct communication styles.

Output JSON strictly matching this schema:
{
  "agents": [
    {
      "username": "sarah_operations_88",
      "displayName": "Sarah Jenkins",
      "profession": "Head of SaaS Procurement",
      "mbti": "ESTJ",
      "stance": "opposing",
      "userChar": "Strict B2B buyer with 12 years of enterprise experience. Hyper-focused on GDPR, security liabilities, and contract renewals. Dismisses AI hype easily.",
      "publicBio": "Enterprise Ops & Procurement Leader | Berlin | Passionate about data sovereignty",
      "followerCount": 840,
      "interestedTopics": ["GDPR", "pricing", "CRM", "compliance"],
      "sourceEntityId": "node_1"
    }
  ]
}`;

  const userPrompt = `Simulation Goal:
${hypothesis}

Entities in Knowledge Graph:
${JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })), null, 2)}

Generate exactly ${targetCount} unique, richly described agent profiles representing these entities.`;

  const result = await callLlmJson<{
    agents: {
      username: string;
      displayName: string;
      profession: string;
      mbti: string;
      stance: 'supportive' | 'opposing' | 'neutral' | 'observer';
      userChar: string;
      publicBio: string;
      followerCount?: number;
      interestedTopics?: string[];
      sourceEntityId?: string;
    }[];
  }>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], {
    model: modelName,
    temperature: 0.7
  });

  return result.agents.map((a, idx) => ({
    id: idx + 1,
    username: a.username ? a.username.replace(/[^a-zA-Z0-9_]/g, '') : `agent_${idx + 1}`,
    displayName: a.displayName || `Agent ${idx + 1}`,
    profession: a.profession || 'Market Participant',
    mbti: a.mbti || 'INTJ',
    stance: a.stance || 'neutral',
    userChar: a.userChar || 'Participant in market discussions.',
    publicBio: a.publicBio || `${a.profession || 'Professional'}`,
    followerCount: a.followerCount || Math.floor(Math.random() * 800 + 100),
    interestedTopics: Array.isArray(a.interestedTopics) ? a.interestedTopics : ['pricing', 'CRM', 'software'],
    sourceEntityId: a.sourceEntityId
  }));
}
