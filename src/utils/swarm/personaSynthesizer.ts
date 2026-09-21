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
  modelName: string = 'gpt-5.6-luna',
  language: string = 'sk',
  onBatchComplete?: (batchAgents: SwarmAgentProfile[]) => void
): Promise<SwarmAgentProfile[]> {
  const langLabel = language === 'hu' ? 'Hungarian (Magyar)' : language === 'en' ? 'English' : 'Slovak (Slovenčina)';
  const sampleProfession = language === 'hu'
    ? 'SaaS beszerzési és operációs igazgató'
    : language === 'en'
    ? 'Director of SaaS Procurement & Operations'
    : 'Riaditeľka nákupu SaaS nástrojov';

  const sampleUserChar = language === 'hu'
    ? 'Szigorú B2B beszerző 12 éves vállalati tapasztalattal. Kiemelten fókuszál a GDPR megfelelőségre, szerződéses kockázatokra és a licencmegújításokra.'
    : language === 'en'
    ? 'Strict B2B procurement buyer with 12 years enterprise experience. Laser-focused on GDPR, contract risk, and licensing renewals.'
    : 'Prísna B2B nákupkyňa s 12-ročnou praxou v korporáte. Extrémne zameraná na GDPR, zmluvné riziká a obnovu licencií. Ľahko prehliada marketingový AI hype.';

  const sampleBio = language === 'hu'
    ? 'Vállalati beszerzési & operációs vezető | Budapest / Pozsony | Adatszuverenitás és hatékonyság'
    : language === 'en'
    ? 'Enterprise Procurement & Ops Leader | Data sovereignty & SaaS efficiency'
    : 'Líderka podnikového nákupu & prevádzky | Berlín / Bratislava | Zameraná na dátovú suverenitu';

  const systemPrompt = `You are an expert Social Agent Profile Architect for market simulations.
Given a list of stakeholder entities extracted from a business scenario, generate a diverse swarm of autonomous social media profiles (Chitchat/Forum accounts).

CRITICAL GROUNDING & ISOLATION MANDATE:
1. STRICT SEED ISOLATION: Generate personas that belong STRICTLY and EXCLUSIVELY to the stakeholder entities provided below.
2. DO NOT import, infer, or hallucinate personas or companies from unrelated business domains, unrelated industries, or prior simulation runs.
3. Every persona's profession, role, biases, and commentary style must directly correspond to the business scenario and product domain of the current seed.
4. Ensure cognitive, demographic, and stance diversity:
   - Some agents should be early-adopting and enthusiastic.
   - Some agents must be highly skeptical, conservative, budget-constrained, or compliance-obsessed.
   - Some agents must represent competitors actively spreading counter-narratives or FUD.
   - Include realistic professions, diverse MBTI types (INTJ, ESTP, INFJ, etc.), and distinct communication styles.
5. LANGUAGE REQUIREMENT: All professions, userChar (personality traits/biases), and publicBio MUST be written in natural, professional ${langLabel}.

Output JSON strictly matching this schema:
{
  "agents": [
    {
      "username": "sarah_operations_88",
      "displayName": "Sarah Jenkins",
      "profession": "${sampleProfession}",
      "mbti": "ESTJ",
      "stance": "opposing",
      "initial_answer": "Opposes or favors a specific alternative based on profession and biases",
      "confidence_score": 75,
      "answer_reason": "Short 1-sentence motivation grounded in persona.",
      "userChar": "${sampleUserChar}",
      "publicBio": "${sampleBio}",
      "followerCount": 840,
      "interestedTopics": ["GDPR", "pricing", "CRM", "compliance"],
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

  let cumulativeAgentCount = 0;
  const batchPromises = batchSizes.map(async (batchSize, batchIdx) => {
    const userPrompt = `Simulation Goal:
${hypothesis}

Entities in Knowledge Graph (Strictly ground personas to these entities only):
${JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, type: n.type, summary: n.summary })), null, 2)}

Generate exactly ${batchSize} unique, richly described agent profiles (Batch ${batchIdx + 1} of ${batchSizes.length}) strictly representing these entities in natural ${langLabel}.`;

    try {
      const result = await callLlmJson<{
        agents: {
          username: string;
          displayName: string;
          profession: string;
          mbti: string;
          stance: 'supportive' | 'opposing' | 'neutral' | 'observer';
          initial_answer?: string;
          confidence_score?: number;
          answer_reason?: string;
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

      const agentsList = result.agents || [];
      if (onBatchComplete && agentsList.length > 0) {
        const formattedBatch: SwarmAgentProfile[] = agentsList.map((a, idx) => ({
          id: cumulativeAgentCount + idx + 1,
          username: a.username ? a.username.replace(/[^a-zA-Z0-9_]/g, '') : `agent_${cumulativeAgentCount + idx + 1}`,
          displayName: a.displayName || `Participant ${cumulativeAgentCount + idx + 1}`,
          profession: a.profession || (nodes[0]?.name || 'Stakeholder'),
          mbti: a.mbti || 'INTJ',
          stance: a.stance || 'neutral',
          currentAnswer: a.initial_answer || (a.stance === 'supportive' ? 'Support' : a.stance === 'opposing' ? 'Oppose' : 'Undecided'),
          confidenceScore: a.confidence_score || (a.stance === 'neutral' ? 50 : 75),
          answerReason: a.answer_reason || a.userChar?.slice(0, 120),
          userChar: a.userChar || 'Autonomous market participant.',
          publicBio: a.publicBio || a.profession || 'Market participant',
          followerCount: a.followerCount || 500,
          interestedTopics: a.interestedTopics || ['Strategy'],
          sourceEntityId: a.sourceEntityId || (nodes[0]?.id || 'node_1')
        }));
        cumulativeAgentCount += formattedBatch.length;
        onBatchComplete(formattedBatch);
      }
      return agentsList;
    } catch (batchErr) {
      console.warn(`Batch ${batchIdx + 1} persona synthesis warning, recovering with default personas:`, batchErr);
      return [];
    }
  });

  const allBatches = await Promise.all(batchPromises);
  const rawAgents = allBatches.flat();

  // If rawAgents is fewer than targetCount due to any network/token glitch, fill missing with diverse personas grounded in current nodes
  const STANCES: ('supportive' | 'opposing' | 'neutral' | 'observer')[] = ['supportive', 'opposing', 'neutral', 'observer'];
  const MBTIS = ['INTJ', 'ESTJ', 'ENTP', 'INFP', 'ISTJ', 'ENFJ', 'ISFP', 'ENTJ'];

  const finalAgents: SwarmAgentProfile[] = [];
  for (let idx = 0; idx < targetCount; idx++) {
    const targetNode = nodes[idx % Math.max(1, nodes.length)] || { id: 'node_1', name: 'Stakeholder', type: 'Client', summary: '' };
    const existing = rawAgents[idx];
    if (existing) {
      finalAgents.push({
        id: idx + 1,
        username: existing.username ? existing.username.replace(/[^a-zA-Z0-9_]/g, '') : `agent_${idx + 1}`,
        displayName: existing.displayName || `${targetNode.name} #${idx + 1}`,
        profession: existing.profession || targetNode.name,
        mbti: existing.mbti || MBTIS[idx % MBTIS.length],
        stance: existing.stance || STANCES[idx % STANCES.length],
        currentAnswer: existing.initial_answer || (existing.stance === 'supportive' ? 'Support' : existing.stance === 'opposing' ? 'Oppose' : 'Undecided'),
        confidenceScore: existing.confidence_score || (existing.stance === 'neutral' ? 50 : 75),
        answerReason: existing.answer_reason || existing.userChar?.slice(0, 120),
        userChar: existing.userChar || targetNode.summary || `Representative for ${targetNode.name}.`,
        publicBio: existing.publicBio || `${existing.profession || targetNode.name}`,
        followerCount: existing.followerCount || Math.floor(Math.random() * 800 + 100),
        interestedTopics: Array.isArray(existing.interestedTopics) ? existing.interestedTopics : ['Strategy', 'Pricing'],
        sourceEntityId: existing.sourceEntityId || targetNode.id
      });
    } else {
      const stance = STANCES[idx % STANCES.length];
      finalAgents.push({
        id: idx + 1,
        username: `participant_${idx + 1}`,
        displayName: `${targetNode.name} #${idx + 1}`,
        profession: targetNode.name,
        mbti: MBTIS[idx % MBTIS.length],
        stance: stance,
        currentAnswer: stance === 'supportive' ? 'Support' : stance === 'opposing' ? 'Oppose' : 'Undecided',
        confidenceScore: stance === 'neutral' ? 50 : 70,
        answerReason: `Representative stance based on ${targetNode.name}.`,
        userChar: targetNode.summary || `Representative for ${targetNode.name} with stance: ${stance}.`,
        publicBio: `${targetNode.name} | Active Participant`,
        followerCount: Math.floor(Math.random() * 500 + 100),
        interestedTopics: ['Strategy', 'Market'],
        sourceEntityId: targetNode.id
      });
    }
  }

  return finalAgents;
}
