/** The slice of WAAI's module API these tabs speak. Vendored by hand until `contract.ts` is regenerated from the merged package. */

export type DigestWindow = "today" | "d3" | "d7" | "d30";

export interface HomeTask {
  id: string;
  title: string;
  description: string | null;
  assignee: string;
  due_at: string | null;
  status: "open" | "completed";
  conversation_id: string | null;
  conversation_title: string | null;
  source_message_id: string | null;
  origin: "waai" | "crm";
  crm_sync_state: string;
  crm_error: string | null;
  crm_url: string | null;
  crm_task_id: string | null;
  crm_linked: boolean;
}

export interface DigestMeeting {
  title: string;
  when: string;
  chat: string;
  conversation_id: string | null;
  message_id: string | null;
}

export interface DigestResponse {
  id: string | null;
  window: DigestWindow;
  cached: boolean;
  chat_count: number;
  narrative: string;
  tasks: HomeTask[];
  meetings: DigestMeeting[];
  has_audio: boolean;
  audio_url: string | null;
  auto_audio: boolean;
  created_at: string | null;
}

export interface TasksResponse {
  tasks: HomeTask[];
  crm_push_enabled: boolean;
}

export interface AskResponse {
  answer: string;
  sources: { index: number; message_id: string; conversation_id: string; conversation_title: string | null; snippet: string }[];
}

export interface PreferencesResponse {
  auto_detect_summary_lang: boolean;
  quick_reactions: string[];
  quick_reaction_count: number;
}

export interface WaAccountRow {
  id: string;
  status: string;
  display_name: string | null;
  phone_number: string | null;
  last_error: string | null;
  owner_email: string | null;
}

export interface AiSettings {
  provider: string;
  openai_key_set: boolean;
  anthropic_key_set: boolean;
  prompts: { general: string; summary: string; task: string; general_file_name: string | null; summary_file_name: string | null; task_file_name: string | null };
  models: { text: string; embed: string; transcribe: string };
  cost_limit_usd: number;
  speech: { model: string; speed: number };
  digest_audio_auto: boolean;
}

export interface CrmSettings {
  push_enabled: boolean;
  pull_enabled: boolean;
  paused_reason: string | null;
  default_country: string;
  last_ping: { ok: boolean; at: string; error?: string } | null;
  accounts: { id: string; label: string; crm_user_id: string | null }[];
  contacts: { id: string; label: string; crm_user_id: string | null }[];
  linked_chats: { conversation_id: string; title: string; entity_type: string; crm_id: string; source: string }[];
  task_errors: { id: string; title: string; crm_error: string | null }[];
}

export interface PeopleResponse {
  crm_users: { crm_user_id: string; name: string; active: boolean }[];
  waai_users: { id: string; email: string; role: "admin" | "member"; crm_user_id: string | null }[];
}
