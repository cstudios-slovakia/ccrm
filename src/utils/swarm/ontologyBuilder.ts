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
  contextDocuments?: SwarmContextDocument[],
  language: string = 'sk'
): Promise<SwarmKnowledgeGraph> {
  const langLabel = language === 'hu' ? 'Hungarian (Magyar)' : language === 'en' ? 'English' : 'Slovak (Slovenčina)';
  const sampleSummary = language === 'hu'
    ? 'Digitális ügynökségek, amelyek megfizethető feladatkövetést keresnek felhasználónkénti díjak nélkül.'
    : language === 'en'
    ? 'Digital agencies seeking cost-effective task tracking without per-user licensing fees.'
    : 'Digitálne agentúry hľadajúce cenovo dostupné sledovanie úloh bez poplatkov za každého používateľa.';

  const sampleFact = language === 'hu'
    ? 'Összehasonlítják a konstrukciót a hagyományos havi előfizetéses SaaS modellekkel.'
    : language === 'en'
    ? 'Evaluating proposal pricing versus recurring monthly SaaS subscription fees.'
    : 'Zvažujú doživotnú licenciu za 1 500 € v porovnaní s mesačnými SaaS poplatkami.';

  const systemPrompt = `You are an expert Swarm Intelligence Knowledge Architect.
Your task is to analyze a seed business scenario, attached specification/contract documents, and recent CRM context to extract key stakeholder ENTITIES and RELATIONSHIP EDGES for an upcoming social media market rehearsal.

CRITICAL RULES:
1. STRICT SEED DATA GROUNDING MANDATE:
   - You must extract stakeholder entities and relationship edges ONLY and EXCLUSIVELY from the specific Seed Scenario, Hypothesis, and Attached Documents provided in this prompt.
   - NEVER assume, hallucinate, import, or leak data from unrelated industries (e.g. stonemasonry, construction, manufacturing, fireplaces) or prior simulation runs.
   - If the seed scenario is about a digital/tech agency or PR campaign, EVERY entity must be strictly related to digital technology, business executives, marketing media (e.g. Forbes), or agency competitors.
2. Every entity MUST be an active social participant capable of posting, reacting, or making buying decisions:
   - Specific individuals (e.g. Executives, Decision Makers, Project Managers)
   - B2B Client cohorts (e.g. Mid-Market Agencies, Enterprise Buyers)
   - Competitor companies in the same industry (e.g. Digital Agencies, Tech Consultancies)
   - Regulatory or auditor bodies (e.g. European Data Protection Board, GDPR Auditor)
3. DO NOT create abstract concepts as entities (e.g. NEVER make "Sentiment", "Pricing Model", or "Growth" an entity).
4. Relationships must be active verbs (e.g. ${language === 'hu' ? 'ÉRTÉKELI, KRITIZÁLJA, SZABÁLYOZZA, VÁSÁROL_TŐLE, VERSENG' : language === 'en' ? 'EVALUATES, CRITICIZES, REGULATES, BUYS_FROM, COMPETES_WITH' : 'HODNOTÍ, KRITIZUJE, REGULUJE, KUPUJE_OD, KONKURUJE'}).
5. CRITICAL LANGUAGE REQUIREMENT: All entity names, summaries, and relationship facts MUST be written in natural, professional ${langLabel}.

Output JSON strictly matching this schema:
{
  "nodes": [
    {
      "id": "node_1",
      "name": "${language === 'hu' ? 'Közepes méretű digitális ügynökségek tulajdonosai' : language === 'en' ? 'Mid-market Digital Agency Owners' : 'Majitelia stredne veľkých digitálnych agentúr'}",
      "type": "Client",
      "summary": "${sampleSummary}"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "relation": "${language === 'hu' ? 'ÉRTÉKELI' : language === 'en' ? 'EVALUATES' : 'HODNOTÍ'}",
      "fact": "${sampleFact}"
    }
  ]
}`;

  let docsSnippet = '';
  if (contextDocuments && contextDocuments.length > 0) {
    docsSnippet = '\n\nAttached Context Documents & Specifications (PDF / Markdown):\n' +
      contextDocuments.map(d => `--- File: ${d.name} (${d.type.toUpperCase()}) ---\n${d.content.slice(0, 8000)}`).join('\n\n');
  }

  const crmSection = crmContextText && crmContextText.trim().length > 0
    ? `\n\nRecent CRM Stakeholder Data:\n${crmContextText.slice(0, 15000)}`
    : '\n\nRecent CRM Stakeholder Data:\n(None - Grounding relies strictly and exclusively on the Seed Document and Attached Documents provided above)';

  const userPrompt = `Hypothesis / Prediction Goal:
${hypothesis}

Seed Document / Product Context:
${seedDocument.slice(0, 10000)}${docsSnippet}${crmSection}

Extract a comprehensive ecosystem graph of between 15 and 35 key entities (individuals, institutions, customer cohorts, competitors, regulators, media, and civic bodies) and their inter-relationships in natural ${langLabel}. Capture all distinct social actors mentioned or implied in the scenario.`;

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

    const validTypes: ('Client' | 'Competitor' | 'Regulator' | 'Agency' | 'Stakeholder')[] = [
      'Client', 'Competitor', 'Regulator', 'Agency', 'Stakeholder'
    ];

    const rawNodes = (result.nodes && result.nodes.length > 0) ? result.nodes : [
      { id: 'node_1', name: 'B2B Rozhodovatelia & Kľúčoví zákazníci', type: 'Client', summary: 'Cieľoví B2B nákupcovia a manažéri analyzujúci ponuku.' },
      { id: 'node_2', name: 'Konkurenční poskytovatelia', type: 'Competitor', summary: 'Trhoví konkurenti reagujúci na stratégiu a cenotvorbu.' },
      { id: 'node_3', name: 'Regulačné a certifikačné orgány', type: 'Regulator', summary: 'Subjekty dohliadajúce na zmluvné podmienky a legislatívu.' },
      { id: 'node_4', name: 'Digitálne a marketingové agentúry', type: 'Agency', summary: 'Agentúrni partneri a integrátori.' },
      { id: 'node_5', name: 'Odborná verejnosť & Médiá', type: 'Stakeholder', summary: 'Priemyselné médiá a mienkotvorní analytici.' }
    ];

    const nodes = rawNodes.map((n, i) => ({
      id: n.id || `node_${i + 1}`,
      name: n.name || `Subjekt ${i + 1}`,
      type: validTypes.includes(n.type as any) ? (n.type as any) : 'Stakeholder',
      summary: n.summary || ''
    }));

    const nodeIds = new Set(nodes.map(n => n.id));

    const rawEdges = (result.edges && result.edges.length > 0) ? result.edges : [
      { id: 'edge_1', source: nodes[0].id, target: nodes[1].id, relation: 'POROVNÁVA', fact: 'Klienti porovnávajú ponuku s alternatívami.' },
      { id: 'edge_2', source: nodes[1].id, target: nodes[0].id, relation: 'KONKURUJE', fact: 'Konkurencia ponúka alternatívne podmienky.' }
    ];

    const edges = rawEdges
      .filter(e => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target)
      .map((e, idx) => ({
        id: e.id || `edge_${idx + 1}`,
        source: e.source,
        target: e.target,
        relation: e.relation || 'HODNOTÍ',
        fact: e.fact || '',
        validFromRound: 0,
        invalidFromRound: null
      }));

    // If edges got filtered out, guarantee at least 1-2 valid edges between existing nodes
    const finalEdges = edges.length > 0 ? edges : [
      { id: 'edge_1', source: nodes[0].id, target: nodes[Math.min(1, nodes.length - 1)].id, relation: 'HODNOTÍ', fact: 'Subjekty analyzujú podmienky.', validFromRound: 0, invalidFromRound: null }
    ];

    return {
      nodes,
      edges: finalEdges
    };
  } catch (err) {
    console.warn('Ontology extraction warning, falling back to foundational stakeholders:', err);
    return {
      nodes: [
        { id: 'node_1', name: 'Kľúčoví zákazníci & Rozhodovatelia', type: 'Client', summary: 'Zástupcovia cieľového segmentu a B2B nákupcovia.' },
        { id: 'node_2', name: 'Konkurenčné trhové platformy', type: 'Competitor', summary: 'Alternatívne riešenia a platformy na trhu.' },
        { id: 'node_3', name: 'Finanční kontrolóri & Compliance', type: 'Regulator', summary: 'Dohľad nad rozpočtami, zmluvami a reguláciou.' },
        { id: 'node_4', name: 'Digitálne a servisné agentúry', type: 'Agency', summary: 'Servisní a technologickí partneri.' },
        { id: 'node_5', name: 'Odborní analytici & Obchodné médiá', type: 'Stakeholder', summary: 'Trhoví komentátori a ekonomické médiá.' }
      ],
      edges: [
        { id: 'edge_1', source: 'node_1', target: 'node_2', relation: 'POROVNÁVA', fact: 'Zákazníci vyhodnocujú cenovú a technickú ponuku.', validFromRound: 0, invalidFromRound: null },
        { id: 'edge_2', source: 'node_2', target: 'node_1', relation: 'KONKURUJE', fact: 'Konkurenti aktívne reagujú na trhové zmeny.', validFromRound: 0, invalidFromRound: null },
        { id: 'edge_3', source: 'node_1', target: 'node_3', relation: 'KONZULTUJE', fact: 'Overovanie zmluvných podmienok a rozpočtov.', validFromRound: 0, invalidFromRound: null }
      ]
    };
  }
}
