import type { ReactNode } from "react";
import { Surface } from "../layout";

export const primaryButton =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-entity-solid hover:bg-entity-solid-hover px-5 text-ui font-bold text-white shadow-2xs transition-colors cursor-pointer";
export const secondaryButton =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-ui font-semibold text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer";

const TONES = {
  slate: "bg-gray-50 border-gray-100 text-gray-500",
  amber: "bg-amber-50 border-amber-100 text-amber-500",
  rose: "bg-rose-50 border-rose-100 text-rose-500",
  green: "bg-green-50 border-green-100 text-green-600",
} as const;

/** A screen the module shows instead of its tabs: not set up, not linked, did not open. */
export const StateCard = ({
  icon,
  tone = "slate",
  title,
  body,
  actions,
  testId,
}: {
  icon: ReactNode;
  tone?: keyof typeof TONES;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) => (
  <div className="flex flex-1 items-center justify-center py-12 animate-in fade-in duration-300" data-testid={testId}>
    <Surface className="flex w-full max-w-lg flex-col items-center text-center">
      <div className={`mb-5 flex size-16 items-center justify-center rounded-lg border shadow-sm [&>svg]:size-8 ${TONES[tone]}`}>{icon}</div>
      <h2 className="type-card-title text-gray-800">{title}</h2>
      {body && <p className="type-body mt-3 max-w-sm text-gray-500">{body}</p>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </Surface>
  </div>
);
