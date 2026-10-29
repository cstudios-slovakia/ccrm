/**
 * Which settings section `#whatsapp/settings/<section>` opens. Unknown sections fall back to accounts.
 */

export const SETTINGS_SECTIONS = ["accounts", "reactions", "language", "ai", "crm", "people", "members", "invites", "reset"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function settingsSection(route: string): SettingsSection {
  const section = route.toLowerCase().split("/")[2] ?? "";
  return (SETTINGS_SECTIONS as readonly string[]).includes(section) ? (section as SettingsSection) : "accounts";
}

export function settingsRoute(section: SettingsSection): string {
  return section === "accounts" ? "whatsapp/settings" : `whatsapp/settings/${section}`;
}
