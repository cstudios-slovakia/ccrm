import type { DemoBundle } from './demoData.types.ts';

/**
 * Built-in interactive demo, English edition (US conventions): Lapidea Stone Inc.
 * Cast names come from docs/DEMO-MODE.md Part D (C1, C2, C3, C6, L10); the rival is invented.
 * Scenario: a 15-year warranty on premium sintered stone, priced +12 % (C12).
 */

const YES = 'Accept (warranty in writing)';
const MAYBE = 'Hesitant / want a project price';
const NO = 'Reject (cheaper workshop)';

const graph: DemoBundle['graph'] = {
  nodes: [
    { id: 'node_premium', name: 'Hotels and developers', type: 'Buyer', summary: 'Specify large premium surfaces and must pass a documented warranty on to guests or buyers. They judge the cost over the life of the building, not the price per slab.' },
    { id: 'node_studios', name: 'Partner kitchen studios', type: 'Partner', summary: 'Resell Lapidea worktops in 8–10 kitchens a month. Every price rise has to be defended to the end client, and a callback costs them a crew day.' },
    { id: 'node_homeowners', name: 'Private homeowners', type: 'Client', summary: 'Buy a kitchen once in 15 years. They worry more about chipped edges and a vague warranty than about the price.' },
    { id: 'node_rival', name: 'Low-cost stone workshops', type: 'Competitor', summary: 'Sell imported slabs 15 % cheaper with a 5-year warranty and push studios with a commission on every job they pass on.' },
    { id: 'node_supplier', name: 'Slab producers', type: 'Supplier', summary: 'A 15-year promise is only credible if the producer stands behind the material side of it; the Italian slab maker has not confirmed that yet.' }
  ],
  edges: [
    { id: 'edge_1', source: 'node_rival', target: 'node_studios', relation: 'UNDERCUTS', fact: 'The workshops offer studios a 5 % commission and a price 15 % lower on comparable sintered stone.', validFromRound: 1 },
    { id: 'edge_2', source: 'node_studios', target: 'node_homeowners', relation: 'RECOMMENDS', fact: 'Studios decide which workshop makes the worktop in most of their kitchens.', validFromRound: 1 },
    { id: 'edge_3', source: 'node_premium', target: 'node_rival', relation: 'COMPARES', fact: 'Hotel and developer buyers put the 15-year certificate next to the rival\'s 5-year warranty.', validFromRound: 2 },
    { id: 'edge_4', source: 'node_supplier', target: 'node_premium', relation: 'BACKS', fact: 'A producer guarantee on the material is what makes a 15-year warranty bankable for the buyer.', validFromRound: 2 },
    { id: 'edge_5', source: 'node_homeowners', target: 'node_rival', relation: 'DOUBTS', fact: 'Homeowners share forum photos of chipped edges after installs by cheaper workshops.', validFromRound: 3 }
  ]
};

const agents: DemoBundle['agents'] = [
  {
    id: 1, username: 'lucy_kitchenline', displayName: 'Lucy Meyer', profession: 'Owner, KitchenLine Studio', mbti: 'ESTJ', stance: 'opposing',
    userChar: 'Pragmatic studio owner. Every price rise must be explained to her clients, so she rejects +12 % unless she gets a transition period and something tangible on top.',
    publicBio: 'Custom kitchens since 2009 | Aurora, CO', followerCount: 1840, karma: 390, sourceEntityId: 'node_studios',
    interestedTopics: ['pricing', 'deadlines', 'commission', 'warranty']
  },
  {
    id: 2, username: 'andrea_wilson', displayName: 'Andrea Wilson', profession: 'Homeowner, renovated her kitchen', mbti: 'ISFJ', stance: 'supportive',
    userChar: 'Careful buyer. A chipped edge cost her a month of waiting, so a long written warranty matters more to her than the price.',
    publicBio: 'Home cook | Littleton, CO', followerCount: 320, karma: 140, sourceEntityId: 'node_homeowners',
    interestedTopics: ['warranty', 'reliability', 'care']
  },
  {
    id: 3, username: 'dale_stonediscount', displayName: 'Dale Brennan', profession: 'Managing director, StoneDiscount', mbti: 'ENTJ', stance: 'opposing',
    userChar: 'Rival who competes on price. He calls the rise overcharging and lures studios with commission.',
    publicBio: 'Same stone, lower price | Denver Metro', followerCount: 2650, karma: 210, sourceEntityId: 'node_rival',
    interestedTopics: ['pricing', 'commission', 'competition']
  },
  {
    id: 4, username: 'thomas_architekten', displayName: 'Thomas Müller', profession: 'Principal, Müller Architekten (Munich)', mbti: 'ISTJ', stance: 'neutral',
    userChar: 'Exact and sceptical. He specifies sintered stone for six villas a year and wants to know who actually carries the warranty risk.',
    publicBio: 'Architecture & interiors | Munich', followerCount: 2980, karma: 560, sourceEntityId: 'node_supplier',
    interestedTopics: ['warranty', 'material', 'specification']
  },
  {
    id: 5, username: 'mark_highland', displayName: 'Mark Fisher', profession: 'Development manager, Highland Park Residences', mbti: 'ENTP', stance: 'neutral',
    userChar: 'Counts the lifetime cost of 12 villas. A callback costs him a crew day and a late handover; a transferable warranty is a selling point for his buyers.',
    publicBio: 'Residential development | Denver', followerCount: 1510, karma: 300, sourceEntityId: 'node_premium',
    interestedTopics: ['total cost', 'handover', 'warranty']
  },
  {
    id: 6, username: 'beth_aurum', displayName: 'Beth Lucas', profession: 'General manager, Hotel Aurum', mbti: 'INFJ', stance: 'supportive',
    userChar: 'Runs a boutique hotel. A cracked reception desk in season is a disaster, so she pays for a certificate that covers edges, joints and cut-outs for 15 years.',
    publicBio: 'Hospitality | Aspen, CO', followerCount: 4120, karma: 480, sourceEntityId: 'node_premium',
    interestedTopics: ['guest experience', 'warranty', 'maintenance']
  }
];

const mk = (id: number, round: number, agentIdx: number, platform: 'chitchat' | 'forum', actionType: 'POST' | 'QUOTE' | 'COMMENT', content: string,
  likes: number, quotes: number, comments: number, sentiment: number, createdAt: string, supportedAnswer: string, targetPostId?: number): DemoBundle['posts'][number] => {
  const a = agents[agentIdx - 1];
  const p: DemoBundle['posts'][number] = {
    id, roundNum: round, agentId: agentIdx, agentName: a.displayName, agentUsername: a.username, agentProfession: a.profession,
    platform, actionType, content, likesCount: likes, quotesCount: quotes, commentsCount: comments, sentimentScore: sentiment, createdAt, supportedAnswer
  };
  if (targetPostId !== undefined) p.targetPostId = targetPostId;
  return p;
};

const posts: DemoBundle['posts'] = [
  mk(101, 1, 1, 'chitchat', 'POST', 'Premium sintered stone 12 % dearer, in the middle of the season? My clients will ask why. Unless I get a transition period on running quotes, I will not sell it.', 28, 7, 14, -0.6, '09:12', NO),
  mk(102, 1, 3, 'chitchat', 'POST', 'Same sintered stone, 15 % cheaper, and studios keep a 5 % commission. A "15-year warranty" is a marketing word. Nobody has been around that long.', 45, 12, 19, -0.8, '09:34', NO),
  mk(103, 1, 2, 'chitchat', 'QUOTE', 'Marketing? A chipped edge cost me a month of waiting. If the 15 years are in writing and cover edges, joints and cut-outs, 12 % is nothing.', 62, 15, 22, 0.7, '10:15', YES, 101),
  mk(104, 2, 4, 'forum', 'POST', 'The key question for a specifier: who carries the material part of the 15 years? If the slab producer backs it and the certificate is transferable, we can specify it.', 89, 18, 31, 0.3, '12:40', MAYBE),
  mk(105, 2, 6, 'forum', 'POST', 'For a hotel the certificate is a selling point, not a cost. A reception desk and spa wall that stay perfect for 15 years — I will pay 12 % for that and put it in our brochure.', 54, 6, 8, 0.8, '13:10', YES),
  mk(106, 3, 5, 'forum', 'POST', 'I ran it for 12 villas: one callback costs a crew day and delays the handover. With the warranty transferable to my buyers, the 12 % pays for itself on the first avoided one.', 112, 24, 42, 0.7, '15:45', YES),
  mk(107, 3, 1, 'chitchat', 'QUOTE', 'Confirmed: running quotes stay at the old price until the end of the quarter, and I get the certificate to show clients. On those terms I am in.', 94, 19, 17, 0.55, '16:30', YES, 103),
  mk(108, 3, 3, 'chitchat', 'POST', 'Let us see how long that "15-year warranty" lasts. We at least do not promise what we cannot keep.', 19, 3, 11, -0.45, '18:10', NO)
];

const metricsHistory: DemoBundle['metricsHistory'] = [
  { round: 1, simulatedHour: 9, averageSentiment: -0.32, supportiveCount: 1, opposingCount: 3, neutralCount: 2, totalInteractions: 140, viralIndex: 35,
    answerDistribution: { [YES]: 1, [MAYBE]: 2, [NO]: 3 }, leadingAnswer: NO, consensusPercentage: 50 },
  { round: 2, simulatedHour: 12, averageSentiment: 0.08, supportiveCount: 2, opposingCount: 2, neutralCount: 2, totalInteractions: 290, viralIndex: 64,
    answerDistribution: { [YES]: 3, [MAYBE]: 1, [NO]: 2 }, leadingAnswer: YES, consensusPercentage: 50 },
  { round: 3, simulatedHour: 15, averageSentiment: 0.42, supportiveCount: 4, opposingCount: 1, neutralCount: 1, totalInteractions: 480, viralIndex: 82,
    answerDistribution: { [YES]: 4, [MAYBE]: 1, [NO]: 1 }, leadingAnswer: YES, consensusPercentage: 71 }
];

const QUESTION = 'Will our premium customers accept a 12 % price rise on sintered stone if we add a 15-year written, transferable warranty?';

const report: DemoBundle['report'] = {
  title: 'Strategic briefing: a 15-year warranty on premium sintered stone, priced +12 %',
  summary: 'The simulation tested a 12 % rise on premium sintered stone (Stratos Nero Marquina, Lumina Statuario) bundled with a written 15-year warranty on edges, joints and cut-outs. The market moved from the first reaction — studios and the low-cost rival against — to a 71 % consensus once the warranty was shown to be transferable and running quotes were protected.',
  generatedAt: new Date().toISOString(),
  executiveVerdict: {
    question: QUESTION,
    directAnswer: 'YES, if the warranty is in writing and transferable (71 % approval)',
    confidenceScore: 86,
    summary: 'What decided it was tangible protection: hotels and developers read the certificate as an asset they can pass on, and studios stay once running quotes keep the old price.',
    answerBreakdown: [
      { answer: YES, sharePercentage: 71, count: 4, sentiment: 0.65 },
      { answer: MAYBE, sharePercentage: 19, count: 1, sentiment: 0.1 },
      { answer: NO, sharePercentage: 10, count: 1, sentiment: -0.8 }
    ],
    keyDrivers: [
      { title: '1. A warranty that travels with the building', explanation: 'Hotels and developers can show the certificate to guests and buyers, so the 12 % buys them something they can resell.', quotes: ['For a hotel the certificate is a selling point, not a cost.'] },
      { title: '2. Fewer callbacks for studios and developers', explanation: 'A callback costs a crew day and a late handover; the buyers who count that cost see 12 % as cheap insurance.', quotes: ['The 12 % pays for itself on the first avoided callback.'] },
      { title: '3. Premium positioning against a 5-year rival', explanation: 'Put next to a 5-year warranty, 15 years stops the price comparison and starts a quality comparison.', quotes: ['If the 15 years are in writing, 12 % is nothing.'] }
    ],
    tippingPoints: [
      { round: 3, description: 'Confirming the old price on running quotes until the end of the quarter turned the studio owner from opposition to support.', impact: 'The studio segment moved from opposing to supportive.' }
    ],
    whatWouldChangeOutcome: [
      'Without a transition period on running quotes, studios would move an estimated 30 % of their jobs to the low-cost rival.',
      'If the slab producer does not back the material part, specifiers like the Munich studio would not put the 15 years into their specification.'
    ],
    actionableRecommendations: [
      'Call the ten largest studios before the announcement and confirm the old price for quotes already issued.',
      'Get the slab producer\'s written back-to-back guarantee before the first certificate is signed.',
      'Print the warranty as a numbered, transferable certificate with every premium order.'
    ]
  },
  sections: [
    { title: '1. Consensus and market polarisation', content: `The announcement split the market into **intermediaries** (studios), who must defend the price, and **end buyers** (hotels, developers, homeowners), who weigh the lifetime cost.

Key findings:
- **Sentiment swing**: from **-0.32** in round 1 to **+0.42** in round 3.
- **The certificate matters most**: buyers who read it as a transferable asset moved first.
- **Studios follow the price protection**: they stayed once running quotes kept the old price.` },
    { title: '2. Vulnerabilities and main objections', content: `Two weak points must be solved before the announcement:

1. **Who carries the material risk** (*Thomas Müller*): the producer must back the 15 years in writing.
2. **Transition for running quotes** (*Lucy Meyer*): without it studios will say no on principle.` },
    { title: '3. The rival\'s counter-strategy', content: `The low-cost workshop offered studios a 5 % commission and a price 15 % lower and called the warranty a marketing word.

- **Why it failed**: customers shared forum photos of chipped edges after cheaper installs, and the certificate made the claim checkable.` },
    { title: '4. 🎯 WHICH STRATEGY REACHES THE GOAL?', content: 'To introduce the rise without losing studios, follow the playbook below.' }
  ],
  strategicPlaybook: {
    keyVulnerabilities: [
      'The material part of the 15 years is not yet backed in writing by the slab producer.',
      'Studios with running quotes feel the rise as a surprise.',
      'The rival can keep calling the warranty "just marketing" until the first certificate is shown.'
    ],
    actionableCounterMeasures: [
      'Agree a back-to-back guarantee with the slab producer and name it on the certificate.',
      'Keep the old price on every quote issued before the announcement until the end of the quarter.',
      'Publish a sample certificate and a short care guide on the website.'
    ],
    salesObjectionPlaybook: [
      { objection: 'Twelve percent more for the same slab is too much.', rebuttal: 'It is not the same slab: it comes with a numbered 15-year certificate for edges, joints and cut-outs that you can hand over to your buyer.' },
      { objection: 'Nobody can promise 15 years.', rebuttal: 'The certificate names who stands behind the material and who behind the workmanship, and it is transferable, so you can check it.' },
      { objection: 'The other workshop is 15 percent cheaper.', rebuttal: 'Add one callback and a crew day and the difference is gone; our certificate covers that callback.' }
    ],
    recommendedGtmSequence: [
      'Day 1: private call to the ten largest studios, old price confirmed for running quotes.',
      'Day 7: show the sample certificate to the hotel and developer clients.',
      'Day 14: public announcement with the certificate and the care guide.',
      'Day 30: comparison page "5 years vs. 15 years" for specifiers and homeowners.'
    ]
  }
};

const SEED = 'Premium sintered stone line (Stratos, Lumina): price +12 %, a numbered 15-year transferable warranty on edges, joints and cut-outs, old price on running quotes until the end of the quarter.';

export const DEMO_EN: DemoBundle = {
  graph,
  agents,
  posts,
  metricsHistory,
  report,
  checkpoint: {
    simulationId: 'demo-pricing-rehearsal',
    title: '15-year warranty on premium sintered stone, priced +12 %',
    hypothesis: 'What if we raise premium sintered stone by 12 % but add a numbered, transferable 15-year warranty on edges, joints and cut-outs, and keep the old price on running quotes until the end of the quarter?',
    strategicQuestion: QUESTION,
    currentRound: 3,
    totalRounds: 3,
    status: 'completed',
    graph, agents, posts, metricsHistory, finalReport: report
  },
  activeNodeId: 'node_premium',
  seedDocument: SEED,
  proposalText: SEED,
  scenarioLabel: '15-year warranty on premium sintered stone (+12 % price)',
  cardTitle: 'Interactive demo: 15-year warranty on premium sintered stone, priced +12 %',
  cardDescription: 'Explore the pre-configured simulation (+12 % price, numbered 15-year transferable warranty, old price on running quotes). Try the War Room, the Strategic Briefing and the Q&A hub.',
  analystAnswers: [
    { keywords: ['price', 'cost', '12', 'rise', 'increase'], answer: 'The 12 % rise worked because it came with something tangible: a numbered 15-year warranty that hotels and developers can hand on to their own buyers. The developer agent worked out that a single avoided callback (a crew day plus a delayed handover) pays for the rise, so the price stopped being the main argument.' },
    { keywords: ['rival', 'competitor', 'dale', 'cheaper', 'discount'], answer: 'The low-cost rival tried to call the warranty "a marketing word" and offered studios a 5 % commission. It failed once customers shared photos of chipped edges after cheaper installs and the certificate made Lapidea\'s promise checkable.' },
    { keywords: ['objection', 'sales', 'argue', 'answer'], answer: 'The main objection was "nobody can promise 15 years". The briefing recommends naming on the certificate who stands behind the material and who behind the workmanship, and letting the buyer transfer it. The playbook has three ready rebuttals.' },
    { keywords: ['strategy', 'recommend', 'goal', 'plan', 'gtm', 'next'], answer: `To introduce the rise without losing studios:
1. Call the ten largest studios first and confirm the old price on quotes already issued.
2. Get the slab producer's written back-to-back guarantee before the first certificate is signed.
3. Hand out a numbered, transferable certificate with every premium order.` }
  ],
  analystFallback: 'By round 3 the simulated market reached a 71 % positive consensus. The strongest argument was the transferable 15-year certificate; the weakest point is still who carries the material part of the warranty. Ask me about the rival, the objections or the recommended plan.',
  agentAnswers: [
    { keywords: ['lucy', 'meyer', 'kitchenline'], answer: 'I run a studio, so my first reaction to a 12 % rise is no: I have to explain it to every client. What changed my mind was the old price on quotes that are already out, and a certificate I can show at the kitchen table. That I can sell.' },
    { keywords: ['andrea', 'wilson'], answer: 'After the chipped edge on my last worktop I waited a month for a repair. A warranty on edges, joints and cut-outs in writing, for 15 years, is exactly what I would pay a little more for.' },
    { keywords: ['dale', 'brennan', 'stonediscount'], answer: 'We watch what they do. A 15-year promise is easy to print. We will keep offering the same stone cheaper and let the customers do the maths.' },
    { keywords: ['thomas', 'müller', 'muller', 'architekten'], answer: 'My question is simple: who carries the material risk for 15 years? If the slab producer confirms it in writing and the certificate is transferable, I will put it in the specification for my villa projects.' },
    { keywords: ['mark', 'fisher', 'highland'], answer: 'For 12 villas I count total cost. One callback is a crew day and a late handover. A transferable warranty also helps me sell the villas, so I treat the 12 % as insurance, not as a price rise.' },
    { keywords: ['beth', 'lucas', 'aurum'], answer: 'A reception desk that cracks in season is a disaster for us. A certificate for 15 years goes straight into our brochure. Yes, I will pay 12 % for that.' }
  ],
  agentFallback: 'I read the proposal during the simulation. The transferable certificate and the old price on running quotes gave us enough confidence to go ahead with premium sintered stone.'
};
