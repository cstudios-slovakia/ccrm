/**
 * Chat Assistant Service
 * Provides:
 * 1. Conversational Q&A with the Chief Analyst about simulation findings.
 * 2. Direct 1-on-1 cross-examination of any simulated agent in-character.
 */

import { callLlmProxy } from './llmProxyClient';
import type { LLMMessage } from './llmProxyClient';
import type { SwarmAgentProfile, SwarmPost, StrategicReport } from './types';

export async function askChiefAnalyst(params: {
  userQuestion: string;
  chatHistory: { sender: 'user' | 'assistant'; text: string }[];
  report: StrategicReport | null;
  posts: SwarmPost[];
  modelName?: string;
}): Promise<string> {
  const { userQuestion, chatHistory, report, posts, modelName } = params;

  const systemPrompt = `You are the Chief Intelligence Analyst who observed the full multi-agent market rehearsal.
The user is an executive cross-examining you about what happened during the simulation.

Context:
Report Summary: ${report ? report.summary : 'Simulation completed'}
Key Objections: ${report ? JSON.stringify(report.strategicPlaybook?.keyVulnerabilities) : '[]'}
Strategic Playbook: ${report ? JSON.stringify(report.strategicPlaybook?.actionableCounterMeasures) : '[]'}

Sample Posts from the simulation:
${posts.slice(0, 30).map(p => `- ${p.agentName} (@${p.agentUsername}, ${p.agentProfession}): "${p.content}"`).join('\n')}

Always base your answers on actual simulation events, agent quotes, and strategic logic. Be concise, direct, and actionable.

CRITICAL LANGUAGE REQUIREMENT:
You MUST respond strictly in natural, professional Slovak (Slovenčina). Do NOT respond in English.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(m => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text
    })),
    { role: 'user', content: userQuestion }
  ];

  return callLlmProxy(messages, {
    model: modelName || 'gpt-5.6-luna',
    temperature: 0.5
  });
}

export async function interviewAgent(params: {
  agent: SwarmAgentProfile;
  userQuestion: string;
  chatHistory: { sender: 'user' | 'assistant'; text: string }[];
  agentPosts: SwarmPost[];
  hypothesis: string;
  modelName?: string;
}): Promise<string> {
  const { agent, userQuestion, chatHistory, agentPosts, hypothesis, modelName } = params;

  const systemPrompt = `You are roleplaying as ${agent.displayName} (@${agent.username}).
Profession: ${agent.profession} | MBTI: ${agent.mbti}
Your Persona & Biases: "${agent.userChar}"
Your Stance on the scenario: "${agent.stance}"

You recently participated in a market discussion about: "${hypothesis}".
Here are the exact comments and tweets you posted during that discussion:
${agentPosts.map(p => `- Round ${p.roundNum}: "${p.content}"`).join('\n') || '- You observed quietly.'}

The user (an executive) is now interviewing you directly. 
Stay strictly in character! Express your authentic reservations, budgets, priorities, or enthusiasm. Speak naturally in first person.

CRITICAL LANGUAGE REQUIREMENT:
You MUST answer strictly in natural Slovak (Slovenčina) in first person ("ja"). Do NOT answer in English.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(m => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text
    })),
    { role: 'user', content: userQuestion }
  ];

  return callLlmProxy(messages, {
    model: modelName || 'gpt-5.6-luna',
    temperature: 0.7
  });
}
