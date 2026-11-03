import test from 'node:test';
import assert from 'node:assert/strict';
import { getDemoData, isBuiltInDemoSimulationId, getDemoAnalystAnswer, getDemoAgentAnswer, DEMO_SIMULATION_ID } from './demoData.ts';

const LANGS = ['sk', 'hu', 'en'] as const;

test('only the built-in checkpoint id and demo-sim-* are the client-side demo; stored demo-sai-* rows are not', () => {
  assert.equal(isBuiltInDemoSimulationId(DEMO_SIMULATION_ID), true);
  assert.equal(isBuiltInDemoSimulationId('demo-sim-1730000000000'), true);
  assert.equal(isBuiltInDemoSimulationId('demo-sai-1'), false);
  assert.equal(isBuiltInDemoSimulationId('demo-sai-2'), false);
  assert.equal(isBuiltInDemoSimulationId('sim_abc123'), false);
  assert.equal(isBuiltInDemoSimulationId(undefined), false);
});

test('the language picks the bundle; unknown languages fall back to English', () => {
  assert.notEqual(getDemoData('sk'), getDemoData('hu'));
  assert.notEqual(getDemoData('hu'), getDemoData('en'));
  assert.equal(getDemoData('de'), getDemoData('en'));
  assert.equal(getDemoData(undefined), getDemoData('en'));
});

test('the three bundles have the same shape and numbers (the scenario is one story)', () => {
  const [a, b, c] = LANGS.map(l => getDemoData(l));
  for (const x of [b, c]) {
    assert.equal(x.graph.nodes.length, a.graph.nodes.length);
    assert.deepEqual(x.graph.nodes.map(n => n.id), a.graph.nodes.map(n => n.id));
    assert.deepEqual(x.graph.edges.map(e => [e.id, e.source, e.target, e.validFromRound]), a.graph.edges.map(e => [e.id, e.source, e.target, e.validFromRound]));
    assert.deepEqual(x.agents.map(g => [g.id, g.stance, g.followerCount, g.sourceEntityId]), a.agents.map(g => [g.id, g.stance, g.followerCount, g.sourceEntityId]));
    assert.deepEqual(x.posts.map(p => [p.id, p.roundNum, p.agentId, p.actionType, p.targetPostId, p.likesCount, p.sentimentScore]), a.posts.map(p => [p.id, p.roundNum, p.agentId, p.actionType, p.targetPostId, p.likesCount, p.sentimentScore]));
    assert.deepEqual(x.metricsHistory.map(m => [m.round, m.supportiveCount, m.opposingCount, m.neutralCount, m.consensusPercentage]), a.metricsHistory.map(m => [m.round, m.supportiveCount, m.opposingCount, m.neutralCount, m.consensusPercentage]));
    assert.equal(x.report.executiveVerdict?.answerBreakdown?.length, a.report.executiveVerdict?.answerBreakdown?.length);
    assert.deepEqual(x.report.executiveVerdict?.answerBreakdown?.map(r => r.sharePercentage), a.report.executiveVerdict?.answerBreakdown?.map(r => r.sharePercentage));
    assert.equal(x.report.sections.length, a.report.sections.length);
    assert.equal(x.report.strategicPlaybook.salesObjectionPlaybook.length, a.report.strategicPlaybook.salesObjectionPlaybook.length);
    assert.equal(x.analystAnswers.length, a.analystAnswers.length);
    assert.equal(x.agentAnswers.length, a.agentAnswers.length);
  }
});

test('every bundle is internally consistent', () => {
  for (const l of LANGS) {
    const d = getDemoData(l);
    const nodeIds = new Set(d.graph.nodes.map(n => n.id));
    assert.ok(nodeIds.has(d.activeNodeId), `${l}: active node exists`);
    for (const e of d.graph.edges) assert.ok(nodeIds.has(e.source) && nodeIds.has(e.target), `${l}: edge ${e.id} ends exist`);
    for (const g of d.agents) assert.ok(!g.sourceEntityId || nodeIds.has(g.sourceEntityId), `${l}: agent ${g.id} node exists`);
    const postIds = new Set(d.posts.map(p => p.id));
    for (const p of d.posts) {
      assert.ok(d.agents.some(g => g.id === p.agentId && g.displayName === p.agentName && g.username === p.agentUsername), `${l}: post ${p.id} agent`);
      if (p.targetPostId !== undefined) assert.ok(postIds.has(p.targetPostId), `${l}: post ${p.id} target`);
    }
    // each round's answer distribution adds up to the number of agents
    for (const m of d.metricsHistory) assert.equal(Object.values(m.answerDistribution ?? {}).reduce((s, n) => s + n, 0), d.agents.length, `${l}: round ${m.round} votes`);
    assert.equal(d.checkpoint.simulationId, DEMO_SIMULATION_ID);
    assert.equal(d.checkpoint.graph, d.graph);
    // client-side data cannot follow the install currency: no money amounts
    const text = JSON.stringify(d);
    assert.ok(!/[€$£]|\bEUR\b|\bUSD\b|\bHUF\b|\bFt\b/.test(text), `${l}: no currency in the demo text`);
    // nothing of the retired SaaS scenario is left
    assert.ok(!/Enterprise|LegacyCRM|Hyperion|WhatsApp|Cstudios/.test(text), `${l}: old scenario gone`);
  }
});

test('the demo Q&A answers in the bundle language and falls back', () => {
  assert.match(getDemoAnalystAnswer('Aký je plán?', 'sk'), /štúdi/);
  assert.match(getDemoAnalystAnswer('Mi a stratégia?', 'hu'), /stúdió/);
  assert.match(getDemoAnalystAnswer('What is the price effect?', 'en'), /12 %/);
  assert.equal(getDemoAnalystAnswer('???', 'en'), getDemoData('en').analystFallback);
  assert.match(getDemoAgentAnswer('Lucy Meyer', 'en', 'lucy_kitchenline'), /studio/);
  assert.match(getDemoAgentAnswer('Lukács Beáta', 'hu', 'beata_aurum'), /recepci/);
  assert.equal(getDemoAgentAnswer('Nobody', 'sk'), getDemoData('sk').agentFallback);
});
