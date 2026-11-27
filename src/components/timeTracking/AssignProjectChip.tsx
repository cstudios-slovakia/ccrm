import { AlertCircle } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";

/**
 * The solid amber "Assign project" pill. Unsorted suggestions keep their own dashed style.
 * Without `onClick` it is a plain label, so it is never a button that does nothing.
 */
export function AssignProjectChip({ onClick, className = "" }: { onClick?: () => void; className?: string }) {
  const { t } = useTimeTracking();
  const look = `inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-micro font-semibold text-amber-700 ${className}`;
  const body = (
    <>
      <AlertCircle className="size-3 shrink-0" />
      {t("Assign project", "Priradiť projekt", "Projekt hozzárendelése")}
    </>
  );
  if (!onClick) return <span className={look} data-testid="assign-project-chip">{body}</span>;
  return (
    <button type="button" onClick={onClick} className={`${look} cursor-pointer hover:bg-amber-100`} data-testid="assign-project-chip">
      {body}
    </button>
  );
}
