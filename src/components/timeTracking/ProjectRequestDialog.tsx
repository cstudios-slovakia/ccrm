import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { ProjectPicker } from "./ProjectPicker";
import type { TimeDeps } from "./shared";
import { rememberTimeCreate } from "./timeCreateBridge";

/**
 * "Require a project before Stop": when the server answers `project_required`, the timer does not
 * fail — this dialog asks which project the time belongs to and the stop is retried with it.
 */
export function ProjectRequestDialog({ deps }: { deps: TimeDeps }) {
  rememberTimeCreate({
    onCreateProject: deps.onCreateProject,
    projectTypes: deps.projectTypes,
    currency: deps.currency,
    language: deps.language,
  });
  useEffect(() => () => rememberTimeCreate({ projectTypes: [], currency: "EUR", language: "en" }), []);
  const { projectRequest, t } = useTimeTracking();
  if (!projectRequest || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4" data-testid="project-request-dialog">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => projectRequest.resolve(null)} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="type-panel-title text-slate-900">{t("Which project is this for?", "Pre ktorý projekt to je?", "Melyik projekthez tartozik?")}</h3>
            <p className="type-meta text-slate-500">{t("Pick a project to stop the timer.", "Vyberte projekt na zastavenie časovača.", "Az időzítő leállításához válasszon projektet.")}</p>
          </div>
          <button type="button" onClick={() => projectRequest.resolve(null)} aria-label={t("Cancel", "Zrušiť", "Mégse")} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <ProjectPicker
          inline
          projects={deps.projects}
          leads={deps.leads}
          projectTypes={deps.projectTypes}
          value={null}
          onChange={(id) => projectRequest.resolve(id)}
          t={t}
          onCreateProject={deps.onCreateProject}
        />
      </div>
    </div>,
    document.body,
  );
}
