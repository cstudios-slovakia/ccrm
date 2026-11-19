import { AlertCircle } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";

/** The solid amber "Assign project" pill. Unsorted suggestions keep their own dashed style. */
export function AssignProjectChip({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const { t } = useTimeTracking();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-micro font-semibold text-amber-700 hover:bg-amber-100 cursor-pointer ${className}`}
      data-testid="assign-project-chip"
    >
      <AlertCircle className="size-3 shrink-0" />
      {t("Assign project", "Priradiť projekt", "Projekt hozzárendelése")}
    </button>
  );
}
