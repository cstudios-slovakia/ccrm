/**
 * Recommendation System (RecSys) Engine
 * Native implementation of OASIS's multi-factor ranking formula:
 * Score(p, i) = 0.4 * Recency + 0.3 * Popularity + 0.3 * Relevance
 */

import { SwarmPost, SwarmAgentProfile } from './types';

export function rankFeedForAgent(
  agent: SwarmAgentProfile,
  allPosts: SwarmPost[],
  currentRound: number,
  limit: number = 6
): SwarmPost[] {
  // Filter out agent's own posts
  const candidatePosts = allPosts.filter(p => p.agentId !== agent.id);
  if (candidatePosts.length === 0) return [];

  const scoredPosts = candidatePosts.map(post => {
    // 1. Recency: higher score for recent rounds
    const roundDiff = Math.max(0, currentRound - post.roundNum);
    const recency = 1 / (roundDiff + 1);

    // 2. Popularity: logarithm of engagement
    const engagement = (post.likesCount || 0) + 2 * (post.quotesCount || 0) + 2 * (post.commentsCount || 0);
    const popularity = Math.min(1, Math.log10(engagement + 1) / 2);

    // 3. Relevance: topic overlap with agent's interested topics
    let relevance = 0.1;
    const postLower = post.content.toLowerCase();
    for (const topic of agent.interestedTopics) {
      if (postLower.includes(topic.toLowerCase())) {
        relevance += 0.35;
      }
    }
    relevance = Math.min(1, relevance);

    // Multi-factor weighted score
    const totalScore = 0.4 * recency + 0.3 * popularity + 0.3 * relevance;

    return { post, score: totalScore };
  });

  // Sort descending by score
  scoredPosts.sort((a, b) => b.score - a.score);

  return scoredPosts.slice(0, limit).map(item => item.post);
}
