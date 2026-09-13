/**
 * Ontology & Graph Builder Service
 * Analyzes seed document + CRM context to extract active social actors and relationship edges.
 */

import { callLlmJson } from './llmProxyClient';
import type { SwarmKnowledgeGraph, SwarmContextDocument } from './types';

export async function buildKnowledgeGraph(
  seedDocument: string,
  crmContextText: string,
  hypothesis: string,
  modelName: string = 'gpt-5.6-luna',
  contextDocuments?: SwarmContextDocument[]
): Promise<SwarmKnowledgeGraph> {
  const systemPrompt = `You are an expert Swarm Intelligence Knowledge Architect.
Your task is to analyze a seed business scenario, attached specification/contract documents, and recent CRM context to extract key stakeholder ENTITIES and RELATIONSHIP EDGES for an upcoming social media market rehearsal.

CRITICAL RULES:
1. Every entity MUST be an active social participant capable of posting, reacting, or making buying decisions:
   - Specific individuals (e.g. Executives, Decision Makers, Project Managers)
   - B2B Client cohorts (e.g. Mid-Market Agencies, Enterprise Buyers)
   - Competitor companies (e.g. Traditional SaaS CRM, Legacy Vendor)
   - Regulatory or auditor bodies (e.g. European Data Protection Board, GDPR Auditor)
2. DO NOT create abstract concepts as entities (e.g. NEVER make "Sentiment", "Pricing Model", or "Growth" an entity).
3. Relationships must be active verbs (e.g. HODNOTÍ, KRITIZUJE, REGULUJE, KUPUJE_OD, KONKURUJE).
4. LANGUAGE REQUIREMENT: All entity names, summaries, and relationship facts MUST be written in natural, professional Slovak (Slovenčina).

Output JSON strictly matching this schema:
{
  "nodes": [
    {
      "id": "node_1",
      "name": "Majitelia stredne veľkých digitálnych agentúr",
      "type": "Client",
      "summary": "Digitálne agentúry hľadajúce cenovo dostupné sledovanie úloh bez poplatkov za každého používateľa."
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "relation": "HODNOTÍ",
      "fact": "Zvažujú doživotnú licenciu za 1 500 € v porovnaní s mesačnými SaaS poplatkami."
    }
  ]
}`;

  let docsSnippet = '';
  if (contextDocuments && contextDocuments.length > 0) {
    docsSnippet = '\n\nAttached Context Documents & Specifications (PDF / Markdown):\n' +
      contextDocuments.map(d => `--- File: ${d.name} (${d.type.toUpperCase()}) ---\n${d.content.slice(0, 8000)}`).join('\n\n');
  }

  const userPrompt = `Hypothesis / Prediction Goal:
${hypothesis}

Seed Document / Product Context:
${seedDocument.slice(0, 10000)}${docsSnippet}

Recent CRM Stakeholder Data:
${crmContextText.slice(0, 15000)}

Extract between 8 and 18 key entities and their inter-relationships in natural Slovak (Slovenčina).`;

  try {
    const result = await callLlmJson<{
      nodes: { id: string; name: string; type: string; summary: string }[];
      edges: { id: string; source: string; target: string; relation: string; fact: string }[];
    }>([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: modelName,
      temperature: 0.3,
      maxTokens: 8000
    });

    const nodes = (result.nodes && result.nodes.length > 0) ? result.nodes : [
      { id: 'node_1', name: 'Zákazníci a nákupcovia B2B', type: 'Client', summary: 'Cieľoví B2B nákupcovia analyzujúci ponuku.' },
      { id: 'node_2', name: 'Konkurenční poskytovatelia', type: 'Competitor', summary: 'Trhoví konkurenti reagujúci na stratégiu.' },
      { id: 'node_3', name: 'Regulátori a audítori', type: 'Authority', summary: 'Subjekty dohliadajúce na zmluvné podmienky.' }
    ];

    const edges = (result.edges && result.edges.length > 0) ? result.edges : [
      { id: 'edge_1', source: 'node_1', target: 'node_2', relation: 'POROVNÁVA', fact: 'Klienti porovnávajú ponuku s alternatívami.' }
    ];

    return {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type || 'Stakeholder',
        summary: n.summary || ''
      })),
      edges: edges.map((e, idx) => ({
        id: e.id || `edge_${idx}`,
        source: e.source,
        target: e.target,
        relation: e.relation || 'RELATES_TO',
        fact: e.fact || '',
        validFromRound: 0,
        invalidFromRound: null
      }))
    };
  } catch (err) {
    console.warn('Ontology extraction warning, falling back to foundational stakeholders:', err);
    return {
      nodes: [
        { id: 'node_1', name: 'Kľúčoví zákazníci & Rozhodovatelia', type: 'Client', summary: 'Zástupcovia cieľového segmentu.' },
        { id: 'node_2', name: 'Konkurenčné trhové platformy', type: 'Competitor', summary: 'Alternatívne riešenia na trhu.' },
        { id: 'node_3', name: 'Finanční kontrolóri & Compliance', type: 'Authority', summary: 'Dohľad nad rozpočtami a zmluvami.' }
      ],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_2', relation: 'POROVNÁVA', fact: 'Zákazníci vyhodnocujú cenovú a technickú ponuku.', validFromRound: 0, invalidFromRound: null }
      ]
    };
  }
}
