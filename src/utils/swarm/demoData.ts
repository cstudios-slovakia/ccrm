import type { 
  SimulationCheckpoint, 
  SwarmKnowledgeGraph, 
  SwarmAgentProfile, 
  SwarmPost, 
  SwarmRoundMetrics, 
  StrategicReport
} from './types';

export const DEMO_GRAPH: SwarmKnowledgeGraph = {
  nodes: [
    {
      id: "node_procurement",
      name: "Enterprise SaaS Procurement",
      type: "Buyer",
      summary: "Corporate buying committee managing budget approvals, GDPR security reviews, and SLA enforceability."
    },
    {
      id: "node_scaleup",
      name: "High-Growth Digital Agencies",
      type: "Client",
      summary: "20-80 employee teams relying on rapid task tracking and multi-channel team communication."
    },
    {
      id: "node_legacy_crm",
      name: "Legacy CRM Competitor",
      type: "Competitor",
      summary: "Established market incumbent charging high per-seat fees and pushing multi-year vendor lock-ins."
    },
    {
      id: "node_smb",
      name: "Boutique Consultancies & SMBs",
      type: "Client",
      summary: "Budget-conscious smaller organizations hypersensitive to unexpected cost creep."
    },
    {
      id: "node_auditor",
      name: "EU Data Sovereignty Auditor",
      type: "Regulator",
      summary: "Compliance experts evaluating GDPR Article 28 data processing and EU server hosting."
    }
  ],
  edges: [
    {
      id: "edge_1",
      source: "node_legacy_crm",
      target: "node_procurement",
      relation: "CRITICIZES",
      fact: "Competitor sales reps are telling procurement leads that modern fast-growing CRMs lack formal SLA penalties.",
      validFromRound: 1
    },
    {
      id: "edge_2",
      source: "node_procurement",
      target: "node_scaleup",
      relation: "EVALUATES",
      fact: "Corporate buyers cross-checking vendor reviews and real customer satisfaction from agency peers.",
      validFromRound: 1
    },
    {
      id: "edge_3",
      source: "node_scaleup",
      target: "node_legacy_crm",
      relation: "CHALLENGES",
      fact: "Agencies voicing frustration with legacy seat fees and welcoming integrated WhatsApp engineer channels.",
      validFromRound: 2
    },
    {
      id: "edge_4",
      source: "node_auditor",
      target: "node_procurement",
      relation: "REGULATES",
      fact: "Security compliance requires verified Frankfurt AWS/Hetzner data residency clauses.",
      validFromRound: 2
    }
  ]
};

export const DEMO_AGENTS: SwarmAgentProfile[] = [
  {
    id: 1,
    username: "sarah_procure_eu",
    displayName: "Sarah Jenkins",
    profession: "Director of Enterprise Procurement",
    mbti: "ESTJ",
    stance: "opposing",
    userChar: "Hard-nosed B2B buyer. Will immediately reject price increases unless supported by hard contractual downtime penalties and audited SOC2 reports.",
    publicBio: "Global Procurement Director | SaaS Cost Optimization | Board Member",
    followerCount: 2410,
    karma: 412,
    sourceEntityId: "node_procurement",
    interestedTopics: ["pricing", "SLA", "procurement", "contracts"]
  },
  {
    id: 2,
    username: "marcus_scaleup",
    displayName: "Marcus Vance",
    profession: "VP Operations @ Hyperion Media",
    mbti: "ENTP",
    stance: "supportive",
    userChar: "Fast-moving agency operator. Sees immense value in dedicated engineer WhatsApp channels that eliminate third-party consultants.",
    publicBio: "Scaling agencies to 8-figures | Workflow nerd | Async obsessed",
    followerCount: 5820,
    karma: 890,
    sourceEntityId: "node_scaleup",
    interestedTopics: ["efficiency", "WhatsApp", "automation", "SLA"]
  },
  {
    id: 3,
    username: "david_nexacore",
    displayName: "David Chen",
    profession: "Chief Commercial Officer @ LegacyCRM",
    mbti: "ENTJ",
    stance: "opposing",
    userChar: "Competitor executive seeking to seed doubt regarding stability and SLA enforceability among enterprise prospects.",
    publicBio: "Enterprise Software Leader | 20+ Yrs Building Resilient Systems",
    followerCount: 8430,
    karma: 340,
    sourceEntityId: "node_legacy_crm",
    interestedTopics: ["CRM", "competition", "reliability", "enterprise"]
  },
  {
    id: 4,
    username: "elena_compliance",
    displayName: "Dr. Elena Rostova",
    profession: "Principal GDPR & Cloud Security Auditor",
    mbti: "INTJ",
    stance: "neutral",
    userChar: "Meticulous legal and security reviewer. Focused strictly on data residency guarantees and sub-processor agreements.",
    publicBio: "Cloud Privacy Researcher | GDPR Auditor | Munich / Vienna",
    followerCount: 3190,
    karma: 620,
    sourceEntityId: "node_auditor",
    interestedTopics: ["GDPR", "security", "data-residency", "compliance"]
  },
  {
    id: 5,
    username: "tomas_founder",
    displayName: "Tomáš Horváth",
    profession: "Founder @ Studio Kvantum",
    mbti: "INFP",
    stance: "supportive",
    userChar: "Longtime customer who values personal communication. The 6-month grandfathering policy makes him feel protected.",
    publicBio: "Product Designer & Agency Founder | Bratislava | Tech Enthusiast",
    followerCount: 1420,
    karma: 480,
    sourceEntityId: "node_smb",
    interestedTopics: ["pricing", "grandfathering", "support", "community"]
  },
  {
    id: 6,
    username: "alex_revops",
    displayName: "Alex Mercer",
    profession: "Head of Revenue Operations",
    mbti: "ISTJ",
    stance: "neutral",
    userChar: "Spreadsheet-driven operator comparing total cost of ownership across competitors.",
    publicBio: "RevOps Specialist | B2B Metrics | High-Performance Funnels",
    followerCount: 2890,
    karma: 510,
    sourceEntityId: "node_procurement",
    interestedTopics: ["TCO", "pricing", "ROI", "contracts"]
  }
];

export const DEMO_POSTS: SwarmPost[] = [
  // Round 1: Initial reactions & skepticism
  {
    id: 101,
    roundNum: 1,
    agentId: 1,
    agentName: "Sarah Jenkins",
    agentUsername: "sarah_procure_eu",
    agentProfession: "Director of Enterprise Procurement",
    platform: "twitter",
    actionType: "POST",
    content: "Seeing reports of a 25% price hike for enterprise CRM tiers. Unless this comes with ironclad contractual penalty vouchers for downtime, this won't survive procurement review.",
    likesCount: 28,
    quotesCount: 7,
    commentsCount: 14,
    sentimentScore: -0.65,
    createdAt: "09:12 AM"
  },
  {
    id: 102,
    roundNum: 1,
    agentId: 3,
    agentName: "David Chen",
    agentUsername: "david_nexacore",
    agentProfession: "CCO @ LegacyCRM",
    platform: "twitter",
    actionType: "POST",
    content: "Classic bait-and-switch. Lightweight vendors price cheap to acquire logos, then shock customers with 25% increases when renewals hit. Check out our price lock guarantee today.",
    likesCount: 45,
    quotesCount: 12,
    commentsCount: 19,
    sentimentScore: -0.85,
    createdAt: "09:34 AM"
  },
  {
    id: 103,
    roundNum: 1,
    agentId: 2,
    agentName: "Marcus Vance",
    agentUsername: "marcus_scaleup",
    agentProfession: "VP Operations @ Hyperion",
    platform: "twitter",
    actionType: "QUOTE",
    targetPostId: 101,
    content: "Hold on Sarah. Did you see what's included? Direct WhatsApp support with their core engineers + 99.9% uptime SLA. We currently pay an external agency €400/mo for integration maintenance. This actually saves us money.",
    likesCount: 62,
    quotesCount: 15,
    commentsCount: 22,
    sentimentScore: 0.75,
    createdAt: "10:15 AM"
  },

  // Round 2: Market debate & competitor counter-tactics
  {
    id: 104,
    roundNum: 2,
    agentId: 4,
    agentName: "Dr. Elena Rostova",
    agentUsername: "elena_compliance",
    agentProfession: "GDPR & Cloud Auditor",
    platform: "reddit",
    actionType: "POST",
    content: "Regarding the enterprise tier update: the key question is whether the SLA specifies Frankfurt/EU data residency and dedicated database instances. If yes, the 25% increase is well below market standard for dedicated EU sovereign hosting.",
    likesCount: 89,
    quotesCount: 18,
    commentsCount: 31,
    sentimentScore: 0.35,
    createdAt: "12:40 PM"
  },
  {
    id: 105,
    roundNum: 2,
    agentId: 5,
    agentName: "Tomáš Horváth",
    agentUsername: "tomas_founder",
    agentProfession: "Founder @ Studio Kvantum",
    platform: "twitter",
    actionType: "POST",
    content: "Gotta give credit where it's due: the 6-month grandfathering grace period for existing customers is genuine respect. No surprise bill at the end of the month.",
    likesCount: 54,
    quotesCount: 6,
    commentsCount: 8,
    sentimentScore: 0.80,
    createdAt: "01:10 PM"
  },

  // Round 3: Consensus crystallization
  {
    id: 106,
    roundNum: 3,
    agentId: 6,
    agentName: "Alex Mercer",
    agentUsername: "alex_revops",
    agentProfession: "Head of Revenue Operations",
    platform: "reddit",
    actionType: "POST",
    content: "Did the math on total cost of ownership: At €249/mo with zero per-seat tax and free database migration, it's still 60% cheaper than Salesforce or HubSpot enterprise plans with comparable SLAs.",
    likesCount: 112,
    quotesCount: 24,
    commentsCount: 42,
    sentimentScore: 0.70,
    createdAt: "03:45 PM"
  },
  {
    id: 107,
    roundNum: 3,
    agentId: 1,
    agentName: "Sarah Jenkins",
    agentUsername: "sarah_procure_eu",
    agentProfession: "Director of Enterprise Procurement",
    platform: "twitter",
    actionType: "QUOTE",
    targetPostId: 103,
    content: "Update: Reviewed the revised SLA terms with automated credit vouchers if response time exceeds 60 mins. With the 6-month grandfathering window, this is acceptable. Good negotiation.",
    likesCount: 94,
    quotesCount: 19,
    commentsCount: 17,
    sentimentScore: 0.55,
    createdAt: "04:30 PM"
  },
  {
    id: 108,
    roundNum: 3,
    agentId: 3,
    agentName: "David Chen",
    agentUsername: "david_nexacore",
    agentProfession: "CCO @ LegacyCRM",
    platform: "twitter",
    actionType: "POST",
    content: "Notice how quickly their defenders mobilized today. But enterprise risk isn't just about price. Let's see how their support queue holds up during the next AWS availability zone blip.",
    likesCount: 19,
    quotesCount: 3,
    commentsCount: 11,
    sentimentScore: -0.45,
    createdAt: "06:10 PM"
  }
];

export const DEMO_METRICS_HISTORY: SwarmRoundMetrics[] = [
  {
    round: 1,
    simulatedHour: 9,
    averageSentiment: -0.32,
    supportiveCount: 1,
    opposingCount: 4,
    neutralCount: 1,
    totalInteractions: 145,
    viralIndex: 38
  },
  {
    round: 2,
    simulatedHour: 12,
    averageSentiment: 0.08,
    supportiveCount: 2,
    opposingCount: 2,
    neutralCount: 2,
    totalInteractions: 290,
    viralIndex: 64
  },
  {
    round: 3,
    simulatedHour: 15,
    averageSentiment: 0.42,
    supportiveCount: 4,
    opposingCount: 1,
    neutralCount: 1,
    totalInteractions: 480,
    viralIndex: 82
  }
];

export const DEMO_STRATEGIC_REPORT: StrategicReport = {
  title: "Predictive Market Rehearsal Briefing: Q4 Enterprise Pricing & SLA Restructure",
  summary: "Simulated rollout of a 25% enterprise price increase bundled with 99.9% uptime SLA and direct engineer WhatsApp support. The market moved from initial procurement skepticism to 72% net consensus approval after clarifying automated downtime credit vouchers and 6-month grandfathering.",
  generatedAt: new Date().toISOString(),
  sections: [
    {
      title: "1. Executive Consensus & Market Polarization",
      content: `The initial announcement triggered an immediate polarization split between **procurement gatekeepers** (who flagged the price hike as arbitrary) and **agency operations leads** (who enthusiastically welcomed direct engineer WhatsApp channels).
      
Key findings:
- **Net Sentiment Swing**: Began at **-0.32** in Round 1 and recovered to **+0.42** by Round 3.
- **Grandfathering Effect**: The 6-month grace period for existing accounts completely defused SMB backlash, converting early critics into public brand defenders.
- **TCO Framing**: Independent revenue operations leads validated that €249/mo without per-seat taxes remains over 60% more cost-effective than legacy incumbents.`
    },
    {
      title: "2. Critical Vulnerabilities & Primary Objections",
      content: `Simulation agents raised two critical failure points that must be resolved prior to public release:
      
1. **Downtime Enforceability** (*Sarah Jenkins, Procurement*):
   > *"Seeing reports of a 25% price hike... Unless this comes with ironclad contractual penalty vouchers for downtime, this won't survive procurement review."*
   - Buyers demand automatic credit vouchers (e.g. 5% billing credit per 30 mins downtime) rather than passive status-page apologies.
2. **Data Sovereignty Verification** (*Dr. Elena Rostova, GDPR Auditor*):
   > *"The key question is whether the SLA specifies Frankfurt/EU data residency and dedicated database instances."*
   - Explicit confirmation of EU hosting and GDPR Article 28 compliance must be featured in the announcement headline.`
    },
    {
      title: "3. Competitor Counter-Strategy Analysis",
      content: `The legacy market competitor (*David Chen / LegacyCRM*) attempted to execute a rapid FUD campaign:
      
- **Tactic**: Labeled the price adjustment a "bait-and-switch" and launched aggressive migration discounts targeting price-sensitive SMBs.
- **Why It Failed in the Simulation**: The existence of the grandfathered grace period neutralized their attack. Customers publicly defended the brand, noting that legacy vendors charge 4x more in seat taxes.`
    },
    {
      title: "4. 🎯 WHAT STRATEGY TO USE TO ACHIEVE THE GOAL?",
      content: `To successfully execute this pricing increase without customer churn and with accelerated enterprise adoption, execute the following play:`
    }
  ],
  strategicPlaybook: {
    keyVulnerabilities: [
      "Lack of explicit automated refund vouchers if the 1-hour SLA is breached.",
      "Competitor attempting to sow fear among SMB customers regarding cascading price hikes.",
      "Security compliance officers demanding proof of Frankfurt/EU data residency."
    ],
    actionableCounterMeasures: [
      "Introduce an automated 'Zero-Downtime Guarantee' with pre-calculated invoice credits.",
      "Publish an explicit 'Lifetime Price Freeze Commitment' for all lower-tier SMB packages.",
      "Add a dedicated 'Data Sovereignty & Security Whitepaper' downloadable from the pricing page."
    ],
    salesObjectionPlaybook: [
      {
        objection: "A 25% price increase is too steep in the current macro climate.",
        rebuttal: "Our enterprise tier includes dedicated 1-on-1 engineer WhatsApp access, which directly replaces third-party developer integration retainer fees that typically cost €400+ per month."
      },
      {
        objection: "How do we know your 99.9% uptime SLA isn't just marketing talk?",
        rebuttal: "Our contracts include automatic billing credit vouchers applied with zero paperwork if critical uptime dips below 99.9% in any calendar month."
      },
      {
        objection: "We are worried our historical data will be lost during tier migration.",
        rebuttal: "All enterprise upgrades include a dedicated migration concierge engineer who validates every database record and workflow before cutover."
      }
    ],
    recommendedGtmSequence: [
      "Day 1: Private VIP briefing to top 20 enterprise accounts offering an extended 12-month grandfathering option.",
      "Day 7: Publish EU Data Sovereignty one-pager and automated SLA credit terms.",
      "Day 14: Public announcement of the new tier highlighting the WhatsApp developer bridge and migration concierge.",
      "Day 30: Run comparative TCO marketing campaign against legacy per-seat CRM vendors."
    ]
  }
};

export const DEMO_SIMULATION_CHECKPOINT: SimulationCheckpoint = {
  simulationId: "demo-pricing-rehearsal",
  title: "Q4 Enterprise Pricing Restructuring Rehearsal",
  hypothesis: "What if we increase annual enterprise rates by 25% while adding 99.9% uptime SLA, direct WhatsApp dev support, and 6-month grandfathering?",
  currentRound: 3,
  totalRounds: 3,
  status: "completed",
  graph: DEMO_GRAPH,
  agents: DEMO_AGENTS,
  posts: DEMO_POSTS,
  metricsHistory: DEMO_METRICS_HISTORY,
  finalReport: DEMO_STRATEGIC_REPORT
};

export function getDemoAnalystAnswer(question: string): string {
  const q = question.toLowerCase();

  if (q.includes('price') || q.includes('increase') || q.includes('25%') || q.includes('cost')) {
    return `Based on the simulation transcript, the 25% price increase succeeded because it was bundled with high-value operational assets (direct engineer WhatsApp access and 99.9% SLA). Independent RevOps agents calculated that eliminating third-party integrator fees saved clients more than the €50/mo price delta. The key risk was initial procurement skepticism from Sarah Jenkins, which vanished once contractual downtime credits were guaranteed.`;
  }

  if (q.includes('competitor') || q.includes('david') || q.includes('nexacore') || q.includes('attack')) {
    return `Competitor CCO David Chen attempted to orchestrate a 'bait-and-switch' narrative, encouraging enterprise clients to switch to LegacyCRM. However, his campaign failed to gain traction because existing clients pointed out that LegacyCRM charges aggressive per-seat fees that are 60% more expensive overall.`;
  }

  if (q.includes('objection') || q.includes('rebuttal') || q.includes('sales')) {
    return `The primary sales objection was downtime enforceability. Buyers were not satisfied with a standard uptime promise; they demanded financial penalties. In our strategic playbook, we recommend arming your sales reps with the 'Automated Invoice Credit' rebuttal, which turned Sarah Jenkins from an active opposer into a supporter.`;
  }

  if (q.includes('strategy') || q.includes('recommend') || q.includes('goal') || q.includes('gtm')) {
    return `To achieve your goal with zero churn:
1. Contact your top 20 enterprise accounts personally before the public announcement.
2. Clearly state that existing contracts are grandfathered for 6 months.
3. Feature the Frankfurt data residency and automatic SLA credit vouchers prominently in your press release.`;
  }

  return `In this simulation, the market reached a 72% positive consensus by Round 3. The biggest leverage point was the direct engineer WhatsApp communication channel, which customers valued far above traditional email support tickets. Would you like to inspect specific agent reactions or drill down into competitor counter-moves?`;
}

export function getDemoAgentAnswer(agentName: string, _question?: string): string {
  const name = agentName.toLowerCase();
  
  if (name.includes('sarah') || name.includes('jenkins') || name.includes('procure')) {
    return `Look, as Head of Procurement, my mandate is risk mitigation. When a vendor asks for 25% more money, my default answer is 'no'. But when you attached automated credit vouchers for SLA breaches and guaranteed Frankfurt data residency, you addressed my contractual risk. Give me that in writing, and I will sign off on the renewal.`;
  }

  if (name.includes('marcus') || name.includes('vance') || name.includes('scaleup')) {
    return `Honestly, that WhatsApp channel to your core developers is a game changer for us. Last month we spent 3 days waiting on a support ticket with our old CRM while our clients were waiting. If my team can ping an engineer directly on WhatsApp, €249/month is a no-brainer.`;
  }

  if (name.includes('david') || name.includes('chen') || name.includes('nexacore')) {
    return `We're keeping a close eye on your move. It's easy to promise 99.9% uptime when you're small, but enterprise clients will quickly realize that boutique tools can't match LegacyCRM's global redundancy. We'll be ready to welcome any customers who experience support delays.`;
  }

  if (name.includes('elena') || name.includes('rostova') || name.includes('compliance')) {
    return `My priority is GDPR Article 28 compliance and sovereign hosting. Provided your SLA contractually confirms data processing exclusively within AWS Frankfurt/Hetzner with zero US sub-processor transfer liabilities, the pricing increase is well justified.`;
  }

  return `I reviewed the proposed strategic announcement during the simulation. The grandfathering policy and transparent communication gave our team the confidence to continue building our business on your platform.`;
}
