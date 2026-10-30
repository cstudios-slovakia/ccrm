// Phase 5 & 6 contract types and helpers.
// Pure contract shapes are generated into `../api/contract.ts` by `npm run sync:waai-contract` and re-exported here.

export type {
  AiSettingsResponse,
  AiSettingsResponse as AiSettings,
  AskCitation,
  AskRequest,
  AskResponse,
  CrmSettingsResponse,
  CrmSettingsResponse as CrmSettings,
  DigestMeeting,
  DigestRequest,
  DigestResponse,
  DigestWindow,
  HomeTask,
  InvitesResponse,
  MembersResponse,
  PeopleResponse,
  PreferencesResponse,
  QuickReactionsRequest,
  TaskCrmRequest,
  TasksResponse,
  WaAccountRow,
  WaAccountsResponse,
} from '../api/contract';

/** Citations the answer actually points at with `[n]`. None cited means none shown. */
export function citedOnly<T extends { index: number }>(answer: string, citations: T[]): T[] {
  const cited = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) cited.add(Number(match[1]));
  return cited.size > 0 ? citations.filter((c) => cited.has(c.index)) : [];
}
