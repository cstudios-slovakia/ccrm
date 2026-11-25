import React from "react";
import { ExternalLink } from "lucide-react";
import type { Task } from "../../types";
import type { Language } from "../../utils/translations";

/**
 * Compact badge row for a read-only ClickUp task mirror:
 * - ClickUp origin pill
 * - Native ClickUp status pill (tinted with ClickUp's status color)
 * - Source ClickUp list pill (shown when multiple lists are linked to the project)
 * - Direct external link button (`Open in ClickUp`)
 */
export const ClickUpTaskBadge: React.FC<{
  task: Task;
  showListName?: boolean;
  showLink?: boolean;
  userLanguage: Language;
}> = ({ task, showListName = false, showLink = true, userLanguage }) => {
  if (task.externalSource !== "clickup") return null;
  const meta = task.clickupMeta;
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const statusColor =
    meta?.statusColor && /^#[0-9a-f]{3,8}$/i.test(meta.statusColor)
      ? meta.statusColor
      : null;

  return (
    <>
      <span
        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-micro font-bold text-violet-700"
        title={t("Synced from ClickUp (read-only)", "Synchronizované z ClickUpu (iba na čítanie)", "ClickUpból szinkronizálva (csak olvasható)")}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />
        ClickUp
      </span>

      {meta?.statusName && (
        <span
          className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-semibold border-gray-200 bg-gray-50 text-gray-700"
          style={
            statusColor
              ? {
                  backgroundColor: `${statusColor}1A`,
                  color: statusColor,
                  borderColor: `${statusColor}40`,
                }
              : undefined
          }
          title={t("ClickUp status", "Stav v ClickUpe", "ClickUp állapot")}
        >
          {meta.statusName}
        </span>
      )}

      {showListName && meta?.listName && (
        <span
          className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-micro font-medium text-gray-600 truncate max-w-40"
          title={meta.listName}
        >
          {meta.listName}
        </span>
      )}

      {showLink && task.externalUrl && (
        <a
          href={task.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={t("Open in ClickUp", "Otvoriť v ClickUpe", "Megnyitás ClickUpban")}
          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-1.5 py-0.5 text-micro font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          <span>{t("Open", "Otvoriť", "Megnyitás")}</span>
        </a>
      )}
    </>
  );
};
