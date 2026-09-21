/**
 * CRM Context Service
 * Pulls recent leads, clients, and past objections strictly filtered by lookback horizon.
 */

export interface CrmContextBundle {
  lookback_months: number;
  cutoff_date: string;
  total_clients_sampled: number;
  total_objections_sampled: number;
  character_count: number;
  formatted_context: string;
}

export async function fetchCrmContext(lookbackMonths: number = 12, sources?: string[]): Promise<CrmContextBundle> {
  // If sources array is explicitly provided and empty, all CRM sources are disabled
  if (sources !== undefined && sources.length === 0) {
    return {
      lookback_months: lookbackMonths,
      cutoff_date: new Date().toISOString(),
      total_clients_sampled: 0,
      total_objections_sampled: 0,
      character_count: 0,
      formatted_context: ''
    };
  }

  const sourcesParam = sources && sources.length > 0 ? encodeURIComponent(sources.join(',')) : (sources !== undefined && sources.length === 0 ? 'none' : '');
  const sourcesQuery = sourcesParam ? `&sources=${sourcesParam}` : '';
  const response = await fetch(`api/swarm.php?action=fetch_crm_context&lookback_months=${lookbackMonths}${sourcesQuery}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CRM context: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.success || !data.context) {
    throw new Error(data.message || 'Unknown error fetching CRM context');
  }

  return data.context as CrmContextBundle;
}
