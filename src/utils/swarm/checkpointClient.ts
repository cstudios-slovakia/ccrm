/**
 * Checkpoint Client
 * Synchronizes round snapshots to PHP MySQL persistence for crash-proof resume.
 */

import { SimulationCheckpoint, SwarmPost } from './types';

export async function initServerSimulation(data: {
  id?: string;
  title: string;
  hypothesis: string;
  seed_document: string;
  lookback_months: number;
  swarm_scale: number;
  total_rounds: number;
}): Promise<{ success: boolean; id: string; table_prefix: string }> {
  const response = await fetch('api/swarm.php?action=create_simulation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`Failed to initialize simulation on server: HTTP ${response.status}`);
  }

  return response.json();
}

export async function saveRoundCheckpoint(
  simulationId: string,
  round: number,
  snapshot: SimulationCheckpoint,
  newPosts: SwarmPost[] = []
): Promise<{ success: boolean; round: number; status: string }> {
  const response = await fetch('api/swarm.php?action=checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation_id: simulationId,
      round,
      snapshot,
      new_posts: newPosts.map(p => ({
        agent_id: p.agentId,
        platform: p.platform,
        action_type: p.actionType,
        target_post_id: p.targetPostId,
        content: p.content
      }))
    })
  });

  if (!response.ok) {
    console.warn(`Checkpoint save failed for round ${round}: HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchResumeCheckpoint(simulationId: string): Promise<SimulationCheckpoint | null> {
  const response = await fetch(`api/swarm.php?action=resume&simulation_id=${encodeURIComponent(simulationId)}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.success || !data.simulation) return null;

  return data.simulation.checkpoint as SimulationCheckpoint;
}

export async function listPastSimulations(): Promise<any[]> {
  const response = await fetch('api/swarm.php?action=list');
  if (!response.ok) return [];
  const data = await response.json();
  return data.simulations || [];
}

export async function deleteServerSimulation(simulationId: string): Promise<boolean> {
  const response = await fetch(`api/swarm.php?action=delete&simulation_id=${encodeURIComponent(simulationId)}`, {
    method: 'POST'
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.success === true;
}
