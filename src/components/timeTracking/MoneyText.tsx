import type { Language } from "../../utils/translations";
import { formatMoney } from "../../utils/currency";
import type { MoneyByCurrency } from "../../utils/timeTeam.ts";

/** Amounts per currency, side by side. Two currencies are never added. */
export function MoneyText({
  bag,
  language,
  tone = "plain",
  className = "",
}: {
  bag: MoneyByCurrency;
  language: Language;
  /** Amounts are slate. Only the Team matrix passes "cost" (violet). */
  tone?: "cost" | "plain";
  className?: string;
}) {
  const codes = Object.keys(bag).sort();
  const color = tone === "plain" ? "text-slate-900" : "text-violet-700";
  if (!codes.length) return <span className={`tabular-nums text-slate-300 ${className}`}>—</span>;
  return (
    <span className={`tabular-nums ${color} ${className}`}>
      {codes.map((code, i) => (
        <span key={code}>
          {i > 0 ? " · " : ""}
          {formatMoney(bag[code], code, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ))}
    </span>
  );
}
