import React from "react";
import { Building2, MapPin, Share2, Star, UserCheck, Users } from "lucide-react";
import { FacetedMultiSelect } from "../ui/FacetedMultiSelect";
import type { LeadFacetId, useLeadFacets } from "./useLeadFacets";

const ICONS: Partial<Record<LeadFacetId, React.ReactNode>> = {
  owner: <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  employees: <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  city: <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  source: <Share2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  division: <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />,
  rating: <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
};

/** One of the leads list's faceted filter dropdowns (the stage one can pin options as chips). */
export const LeadFacetSelect: React.FC<{ facets: ReturnType<typeof useLeadFacets>; id: LeadFacetId }> = ({ facets, id }) => (
  <FacetedMultiSelect
    className="h-10"
    icon={ICONS[id]}
    options={facets.options[id]}
    selected={facets.selection[id]}
    onChange={(next) => facets.setSelection(id, next)}
    allLabel={facets.allLabels[id]}
    pinned={id === "state" ? facets.pinnedStates : undefined}
    onTogglePin={id === "state" ? facets.togglePinnedState : undefined}
  />
);
