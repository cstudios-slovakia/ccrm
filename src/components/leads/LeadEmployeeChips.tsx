import React from "react";
import { User } from "lucide-react";
import { displayEmployeeName } from "../../utils/nameOrder";
import { liftAccent } from "../../utils/accentColor";

/**
 * The leads list's "Employees" cell: the people assigned to a lead besides its Project Manager, as the
 * same small coloured chips the manager cell wears. Two are shown, the rest folds into "+n" (all names
 * in the tooltip). Empty when nobody is assigned.
 */
export const LeadEmployeeChips: React.FC<{ names: string[]; colorOf: (name: string) => string }> = ({ names, colorOf }) => {
  const list = names.filter(Boolean);
  if (list.length === 0) return <span className="text-slate-300">—</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <div className="flex items-center gap-1 flex-wrap" title={list.map((n) => displayEmployeeName(n)).join(", ")}>
      {shown.map((name) => {
        const color = colorOf(name);
        return (
          <span
            key={name}
            className="px-2 py-0.5 rounded-full border type-overline flex items-center gap-1 shadow-sm whitespace-nowrap"
            style={{ backgroundColor: `${color}15`, color: liftAccent(color), borderColor: `${color}30` }}
          >
            <User className="h-2.5 w-2.5 shrink-0" />
            {displayEmployeeName(name)}
          </span>
        );
      })}
      {rest > 0 && <span className="type-overline text-slate-400">+{rest}</span>}
    </div>
  );
};
