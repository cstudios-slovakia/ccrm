import { useMemo } from "react";
import { leadClientLabels } from "../utils/leadClientLabel";
import type { LeadLike } from "../utils/leadClient";

/** Lead id -> client name to show under the lead (see utils/leadClientLabel.ts). */
export const useLeadClientLabels = (leads: LeadLike[]): Map<string, string> =>
    useMemo(() => leadClientLabels(leads), [leads]);

/** The client's name in small type under a lead's name; nothing when there is none. */
export function LeadClientLabel({ name }: { name?: string }) {
    if (!name) return null;
    return (
        <span className="block truncate text-micro font-medium leading-tight text-slate-500" title={name}>
            {name}
        </span>
    );
}
