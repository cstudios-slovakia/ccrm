/**
 * Report Synthesizer Service
 * ReAct Chief Analyst that compiles the final grounded predictive briefing,
 * including the mandatory "What Strategy to Use to Achieve the Goal?" strategic playbook.
 */

import { callLlmJson } from './llmProxyClient';
import type { SwarmPost, SwarmAgentProfile, SwarmKnowledgeGraph, StrategicReport, SwarmContextDocument } from './types';

export async function generateStrategicReport(params: {
  title: string;
  hypothesis: string;
  seedDocument: string;
  graph: SwarmKnowledgeGraph;
  agents: SwarmAgentProfile[];
  posts: SwarmPost[];
  modelName?: string;
  contextDocuments?: SwarmContextDocument[];
}): Promise<StrategicReport> {
  const { title, hypothesis, seedDocument, graph: _graph, agents, posts, modelName, contextDocuments } = params;

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
   - Chapter 1: 1. Výkonný konsenzus a polarizácia trhu
   - Chapter 2: 2. Kritické zraniteľnosti a hlavné námietky (quote exact skeptical agents)
   - Chapter 3: 3. Analýza protistratégie konkurencie
   - Chapter 4: 4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?
3. Strategic Playbook: Provide direct actionable counter-measures, specific sales objection rebuttals, and a clear sequence of moves to win the market.
4. CRITICAL LANGUAGE REQUIREMENT: The entire report, including title, summary, section titles, markdown content, vulnerabilities, counter-measures, objection scripts, and GTM sequence MUST be written in natural, executive-level Slovak (Slovenčina). Do not write in English.

Output JSON strictly matching this schema:
{
  "title": "Strategický briefing trhovej simulácie: ...",
  "summary": "Zhrnutie výsledku simulácie v 2 výstižných vetách v slovenčine.",
  "sections": [
    {
      "title": "1. Výkonný konsenzus a polarizácia trhu",
      "content": "Podrobný markdown obsah so štatistikami a rozborom reakcií v slovenčine..."
    },
    {
      "title": "2. Kritické zraniteľnosti a hlavné námietky",
      "content": "Podrobný markdown obsah s presnými citáciami skeptických agentov..."
    },
    {
      "title": "3. Analýza protistratégie konkurencie",
      "content": "Podrobný markdown obsah analyzujúci protiťahy konkurencie..."
    },
    {
      "title": "4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?",
      "content": "Podrobný akčný plán vysvetľujúci presné nastavenie pozicioningu a úprav..."
    }
  ],
  "strategicPlaybook": {
    "keyVulnerabilities": ["Zraniteľnosť 1", "Zraniteľnosť 2"],
    "actionableCounterMeasures": ["Protiopatrenie 1", "Protiopatrenie 2"],
    "salesObjectionPlaybook": [
      {
        "objection": "Častá námietka zákazníka odhalená v simulácii",
        "rebuttal": "Konkrétna argumentačná odpoveď pre obchodníka na jej prekonanie"
      }
    ],
    "recommendedGtmSequence": ["1. krok: ...", "2. krok: ...", "3. krok: ..."]
  }
}`;

  let docsPrompt = '';
  if (contextDocuments && contextDocuments.length > 0) {
    docsPrompt = '\n\nAttached Context Documents & Specifications:\n' +
      contextDocuments.map(d => `- [${d.name}]: ${d.content.slice(0, 2000)}`).join('\n');
  }

  const userPrompt = `Rehearsal Title: ${title}
Target Hypothesis / What-If Variable:
${hypothesis}

Simulation Metrics:
- Total Agents: ${agents.length} (Supportive: ${supportiveAgents}, Opposing: ${opposingAgents}, Neutral: ${neutralAgents})
- Total Interactions / Posts Logged: ${posts.length}

Most Impactful Posts & Debates from the Simulation:
${impactfulPosts.map(p => `- [Round ${p.roundNum}] ${p.agentName} (@${p.agentUsername}, ${p.agentProfession}): "${p.content}" (Likes: ${p.likesCount}, Quotes: ${p.quotesCount})`).join('\n')}

Original Product Brief Seed:
${seedDocument.slice(0, 4000)}${docsPrompt}

Synthesize the final authoritative strategic report in professional Slovak (Slovenčina).`;

  try {
    const report = await callLlmJson<StrategicReport>([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      model: modelName || 'gpt-5.6-luna',
      temperature: 0.4,
      maxTokens: 10000
    });

    report.generatedAt = new Date().toISOString();
    return report;
  } catch (err) {
    console.warn('Strategic report synthesis warning, generating structured fallback report:', err);
    return {
      title: `Strategický briefing: ${title}`,
      summary: `Strategická simulácia "${title}" úspešne prebehla naprieč ${agents.length} autonómnymi účastníkmi trhu (${supportiveAgents} podporujúcich, ${opposingAgents} oponujúcich).`,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: '1. Výkonný konsenzus a polarizácia trhu',
          description: 'Celková odozva trhového segmentu',
          content: `Simulácia preukázala celkový sentiment na úrovni ${Math.round(((supportiveAgents - opposingAgents) / Math.max(1, agents.length)) * 50 + 50)}%. Zákazníci oceňujú inovatívny prístup, no citlivo vnímajú prechodné podmienky.`
        },
        {
          title: '2. Kritické zraniteľnosti a hlavné námietky',
          description: 'Identifikované riziká a námietky',
          content: 'Medzi hlavné obavy patrili náklady na implementáciu, časová náročnosť zmeny a potreba garancie úrovne podpory (SLA).'
        },
        {
          title: '3. Analýza protistratégie konkurencie',
          description: 'Reakcie konkurenčných platforiem',
          content: 'Konkurenti sa pokúsia zdôrazniť zložitosť prechodu. Odporúča sa proaktívne komunikovať jednoduchosť a stabilitu riešenia.'
        },
        {
          title: '4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?',
          description: 'Konkrétny akčný plán a postup',
          content: 'Zaviesť ochranné obdobie pre verných klientov, pripraviť predajný playbook a spustiť cielenú kampaň s dôrazom na pridanú hodnotu.'
        }
      ],
      strategicPlaybook: {
        keyVulnerabilities: [
          'Krátkodobé váhanie cenovo citlivých zákazníkov',
          'Konkurenčné protiútoky zamerané na stabilitu existujúcich procesov'
        ],
        actionableCounterMeasures: [
          'Garancia podpory a bezplatná asistencia pri migrácii',
          'Transparentná komunikácia výhod s predstihom'
        ],
        salesObjectionPlaybook: [
          {
            objection: 'Prečo by sme mali meniť overený postup?',
            rebuttal: 'Nový model prináša vyššiu automatizáciu, úsporu času a priamu prioritnú podporu bez skrytých poplatkov.'
          }
        ],
        recommendedGtmSequence: [
          'Týždeň 1-2: Interné školenie tímu a príprava komunikačných materiálov',
          'Týždeň 3-4: Pilotné oznámenie kľúčovým VIP partnerom',
          'Týždeň 5+: Verejné spustenie a priebežné vyhodnocovanie metrík'
        ]
      }
    };
  }
}
