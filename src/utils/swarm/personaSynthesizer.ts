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

  // Synthesize in parallel batches of up to 10 agents to prevent token limit truncation and ensure blazing speed
  const batchSizes: number[] = [];
  let remaining = targetCount;
  while (remaining > 0) {
    const size = Math.min(10, remaining);
    batchSizes.push(size);
    remaining -= size;
  }

  const batchPromises = batchSizes.map(async (batchSize, batchIdx) => {
    const userPrompt = `Simulation Goal:
${hypothesis}

Entities in Knowledge Graph:
${JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })), null, 2)}

Generate exactly ${batchSize} unique, richly described agent profiles (Batch ${batchIdx + 1} of ${batchSizes.length}) representing these entities in natural Slovak (Slovenčina).`;

    try {
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
        maxTokens: 6000
      });

      return result.agents || [];
    } catch (batchErr) {
      console.warn(`Batch ${batchIdx + 1} persona synthesis warning, recovering with default personas:`, batchErr);
      return [];
    }
  });

  const allBatches = await Promise.all(batchPromises);
  const rawAgents = allBatches.flat();

  // If rawAgents is fewer than targetCount due to any network/token glitch, fill missing with diverse personas
  const STANCES: ('supportive' | 'opposing' | 'neutral' | 'observer')[] = ['supportive', 'opposing', 'neutral', 'observer'];
  const MBTIS = ['INTJ', 'ESTJ', 'ENTP', 'INFP', 'ISTJ', 'ENFJ', 'ISFP', 'ENTJ'];
  const ROLES = [
    'Riaditeľ nákupu IT systémov',
    'Manažér predaja & CRM špecialista',
    'Finančný kontrolór & Analytik',
    'Zakladateľ digitálnej agentúry',
    'Špecialista pre ochranu osobných údajov (DPO)',
    'Obchodný riaditeľ B2B služieb',
    'Vedúci zákazníckej podpory'
  ];

  const finalAgents: SwarmAgentProfile[] = [];
  for (let idx = 0; idx < targetCount; idx++) {
    const existing = rawAgents[idx];
    if (existing) {
      finalAgents.push({
        id: idx + 1,
        username: existing.username ? existing.username.replace(/[^a-zA-Z0-9_]/g, '') : `agent_${idx + 1}`,
        displayName: existing.displayName || `Účastník ${idx + 1}`,
        profession: existing.profession || ROLES[idx % ROLES.length],
        mbti: existing.mbti || MBTIS[idx % MBTIS.length],
        stance: existing.stance || STANCES[idx % STANCES.length],
        userChar: existing.userChar || `Účastník trhových diskusií zameraný na ${ROLES[idx % ROLES.length]}.`,
        publicBio: existing.publicBio || `${existing.profession || ROLES[idx % ROLES.length]}`,
        followerCount: existing.followerCount || Math.floor(Math.random() * 800 + 100),
        interestedTopics: Array.isArray(existing.interestedTopics) ? existing.interestedTopics : ['CRM', 'ceny', 'softvér'],
        sourceEntityId: existing.sourceEntityId || (nodes[idx % Math.max(1, nodes.length)]?.id)
      });
    } else {
      const role = ROLES[idx % ROLES.length];
      const stance = STANCES[idx % STANCES.length];
      finalAgents.push({
        id: idx + 1,
        username: `trh_ucastnik_${idx + 1}`,
        displayName: `Účastník ${idx + 1}`,
        profession: role,
        mbti: MBTIS[idx % MBTIS.length],
        stance: stance,
        userChar: `Autonómny účastník trhu (${role}) s postojom: ${stance}.`,
        publicBio: `${role} | Aktívny účastník trhu`,
        followerCount: Math.floor(Math.random() * 500 + 100),
        interestedTopics: ['CRM', 'B2B', 'ceny'],
        sourceEntityId: nodes[idx % Math.max(1, nodes.length)]?.id
      });
    }
  }

  return finalAgents;
}
