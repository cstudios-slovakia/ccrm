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
- LANGUAGE REQUIREMENT: All professions, userChar (personality traits/biases), and publicBio MUST be written in natural, professional Slovak (Slovenčina).

Output JSON strictly matching this schema:
{
  "agents": [
    {
      "username": "sarah_operations_88",
      "displayName": "Sarah Jenkins",
      "profession": "Riaditeľka nákupu SaaS nástrojov",
      "mbti": "ESTJ",
      "stance": "opposing",
      "userChar": "Prísna B2B nákupkyňa s 12-ročnou praxou v korporáte. Extrémne zameraná na GDPR, zmluvné riziká a obnovu licencií. Ľahko prehliada marketingový AI hype.",
      "publicBio": "Líderka podnikového nákupu & prevádzky | Berlín / Bratislava | Zameraná na dátovú suverenitu",
      "followerCount": 840,
      "interestedTopics": ["GDPR", "ceny", "CRM", "compliance"],
      "sourceEntityId": "node_1"
    }
  ]
}`;

  // If targetCount > 20, synthesize in parallel batches to prevent token limit truncation
  const batchSizes: number[] = [];
  let remaining = targetCount;
  while (remaining > 0) {
    const size = Math.min(20, remaining);
    batchSizes.push(size);
    remaining -= size;
  }

  const batchPromises = batchSizes.map(async (batchSize, batchIdx) => {
    const userPrompt = `Simulation Goal:
${hypothesis}

Entities in Knowledge Graph:
${JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })), null, 2)}

Generate exactly ${batchSize} unique, richly described agent profiles (Batch ${batchIdx + 1} of ${batchSizes.length}) representing these entities in natural Slovak (Slovenčina).`;

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
      temperature: 0.7,
      maxTokens: 5000
    });

    return result.agents || [];
  });

  const allBatches = await Promise.all(batchPromises);
  const rawAgents = allBatches.flat();

  return rawAgents.slice(0, targetCount).map((a, idx) => ({
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
