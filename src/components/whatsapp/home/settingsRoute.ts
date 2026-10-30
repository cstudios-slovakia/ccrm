/**
 * Which settings section `#whatsapp/settings/<section>` opens. The sections are WAAI's own five (Settings in WAAI:
 * System, WhatsApp accounts, AI, CRM, Account); the first two, like WAAI, are open to everyone and the AI and CRM
 * ones only to an administrator. The ids this tab used before it took WAAI's layout still open the section that now
 * holds their content, so saved addresses keep working.
 */

export const SETTINGS_SECTIONS = ["system", "whatsapp", "ai", "crm", "account"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const ADMIN_ONLY: readonly SettingsSection[] = ["ai", "crm"];

const OLD_IDS: Record<string, SettingsSection> = {
  accounts: "whatsapp",
  members: "whatsapp",
  invites: "whatsapp",
  reactions: "system",
  language: "system",
  people: "crm",
  reset: "account",
};

/** The section an address names, or null for a bare `whatsapp/settings` (the menu on a phone, the first section beside it). */
export function settingsSection(route: string): SettingsSection | null {
  const id = route.toLowerCase().split("/")[2] ?? "";
  if ((SETTINGS_SECTIONS as readonly string[]).includes(id)) return id as SettingsSection;
  return OLD_IDS[id] ?? null;
}

/** The sections this person may open, in WAAI's order. */
export function visibleSections(admin: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((id) => admin || !ADMIN_ONLY.includes(id));
}

export function settingsRoute(section: SettingsSection | null): string {
  return section === null ? "whatsapp/settings" : `whatsapp/settings/${section}`;
}
