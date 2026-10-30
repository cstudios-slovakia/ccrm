import { AlertTriangle, ExternalLink, Link2, Loader2 } from "lucide-react";
import type { TaskDto } from "../../api/contract.ts";
import { getPanelI18n } from "./panelI18n.ts";

interface Props {
  task: Pick<
    TaskDto,
    "origin" | "crm_sync_state" | "crm_state" | "crm_error" | "crm_task_id" | "crm_linked"
  >;
  language?: string;
  onOpenRecord?: (kind: "lead" | "project" | "task", id: string) => void;
  className?: string;
}

function formatCrmState(state: string | null): string {
  if (!state) return "";
  const s = state.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CrmTaskInfo = ({
  task,
  language = "en",
  onOpenRecord,
  className = "",
}: Props) => {
  const t = getPanelI18n(language).tasks;
  const isLinked = task.origin === "crm" || task.crm_sync_state !== "none" || task.crm_linked;

  if (!isLinked) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* CRM Origin Badge */}
      <span className="type-meta inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 font-medium text-green-700">
        <Link2 className="size-3" aria-hidden />
        {t.crmBadge}
      </span>

      {/* Sync State */}
      {task.crm_sync_state === "pending" && (
        <span className="type-meta inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {t.crmPending}
        </span>
      )}

      {task.crm_sync_state === "error" && (
        <span
          className="type-meta inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700"
          title={task.crm_error ?? t.crmError}
        >
          <AlertTriangle className="size-3" aria-hidden />
          {t.crmError}
        </span>
      )}

      {task.crm_sync_state === "gone" && (
        <span className="type-meta inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600">
          {t.crmGone}
        </span>
      )}

      {/* CRM State Code (todo / in_progress / review / done) */}
      {task.crm_state && task.crm_sync_state !== "gone" && (
        <span className="type-meta inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          {formatCrmState(task.crm_state)}
        </span>
      )}

      {/* Open in CRM button */}
      {task.crm_task_id && onOpenRecord && (
        <button
          type="button"
          onClick={() => onOpenRecord("task", task.crm_task_id!)}
          className="type-meta inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100"
          title={t.openInCrm}
        >
          <ExternalLink className="size-3" aria-hidden />
          {t.openInCrm}
        </button>
      )}
    </div>
  );
};
