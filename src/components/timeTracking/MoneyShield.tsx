import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";

/**
 * Money in time tracking is hidden until the person clicks the eye in the toolbar; the click reveals
 * every amount of the open section at once, and switching section hides them again. Outside the
 * time-tracking shell (a project's Time tab, a task) the context says "revealed", so nothing changes there.
 */
export const MONEY_MASK = "•••••";

interface Shield {
  revealed: boolean;
  /** How many views on screen show an amount; the toolbar button appears only when there is one. */
  present: number;
  toggle: () => void;
  hide: () => void;
  mark: (delta: number) => void;
}

const OUTSIDE: Shield = { revealed: true, present: 0, toggle: () => {}, hide: () => {}, mark: () => {} };
const ShieldContext = createContext<Shield>(OUTSIDE);

export function MoneyShieldProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [present, setPresent] = useState(0);
  const toggle = useCallback(() => setRevealed((v) => !v), []);
  const hide = useCallback(() => setRevealed(false), []);
  const mark = useCallback((delta: number) => setPresent((n) => Math.max(0, n + delta)), []);
  const value = useMemo(() => ({ revealed, present, toggle, hide, mark }), [revealed, present, toggle, hide, mark]);
  return <ShieldContext.Provider value={value}>{children}</ShieldContext.Provider>;
}

export const useMoneyShield = (): Shield => useContext(ShieldContext);

/** True when amounts are readable now (always true outside the shell). */
export const useMoneyRevealed = (): boolean => useContext(ShieldContext).revealed;

/** A formatter that answers with the mask while amounts are hidden. */
export function useMaskedMoney<A extends unknown[]>(format: (...args: A) => string): (...args: A) => string {
  const revealed = useMoneyRevealed();
  return useMemo(() => (revealed ? format : () => MONEY_MASK), [revealed, format]);
}

/** A view calls this with "do I show any amount right now"; the toolbar button follows. */
export function useMoneyPresent(has: boolean): void {
  const { mark } = useContext(ShieldContext);
  useEffect(() => {
    if (!has) return undefined;
    mark(1);
    return () => mark(-1);
  }, [has, mark]);
}

/** The toolbar button: shows or hides every amount of the open section. Absent while no amount is on screen. */
export function MoneyRevealButton() {
  const { t } = useTimeTracking();
  const { revealed, present, toggle } = useContext(ShieldContext);
  if (present === 0) return null;
  const label = revealed ? t("Hide amounts", "Skryť sumy", "Összegek elrejtése") : t("Show amounts", "Zobraziť sumy", "Összegek megjelenítése");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={revealed}
      aria-label={label}
      title={label}
      data-testid="money-reveal"
      className={`inline-flex size-9 items-center justify-center rounded-md border cursor-pointer transition-colors duration-150 motion-reduce:transition-none active:scale-95 ${revealed ? "border-entity bg-entity-subtle text-entity-text" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}
    >
      {revealed ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}
