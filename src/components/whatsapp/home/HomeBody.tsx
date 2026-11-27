import type { WaaiClient } from "../api/waaiClient.ts";
import { AskTab } from "../ask/AskTab";
import { DigestTab } from "../digest/DigestTab";
import type { WaTab } from "../lib/routes.ts";
import { SettingsTab } from "../settings/SettingsTab";
import { TasksTab } from "../tasks/TasksTab";

/** Digest, Tasks, Ask and Settings. Chats stay with the phase that owns that tab. */
export const HomeBody = ({
  tab,
  route,
  client,
  language,
  admin,
  onOpenRecord,
}: {
  tab: Exclude<WaTab, "chats">;
  route: string;
  client: WaaiClient;
  language: string;
  admin: boolean;
  onOpenRecord: (kind: "lead" | "project" | "task", id: string) => void;
}) => {
  if (tab === "digest") return <DigestTab client={client} language={language} />;
  if (tab === "tasks") return <TasksTab client={client} language={language} onOpenRecord={onOpenRecord} />;
  if (tab === "ask") return <AskTab client={client} language={language} />;
  return <SettingsTab client={client} language={language} route={route} admin={admin} />;
};
