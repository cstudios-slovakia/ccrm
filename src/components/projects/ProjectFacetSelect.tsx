import React from "react";
import { Building2, Star, Users } from "lucide-react";
import { FacetedMultiSelect } from "../ui/FacetedMultiSelect";
import type { ProjectFacetId, useProjectFacets } from "./useProjectFacets";

const ICONS: Partial<Record<ProjectFacetId, React.ReactNode>> = {
  division: <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  manager: <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  rating: <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
};

/** One of the projects list's faceted filter dropdowns (the status one can pin options as chips). */
export const ProjectFacetSelect: React.FC<{ facets: ReturnType<typeof useProjectFacets>; id: ProjectFacetId }> = ({ facets, id }) => (
  <FacetedMultiSelect
    className="h-10"
    icon={ICONS[id]}
    options={facets.options[id]}
    selected={facets.selection[id]}
    onChange={(next) => facets.setSelection(id, next)}
    allLabel={facets.allLabels[id]}
    summary={id === "status" ? facets.statusSummary : undefined}
    pinned={id === "status" ? facets.pinnedStatuses : undefined}
    onTogglePin={id === "status" ? facets.togglePinnedStatus : undefined}
  />
);
