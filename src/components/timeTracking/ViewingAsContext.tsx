import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";

export type ViewingAsMode = "me" | "team" | "user";

/** Shared by List, Day, and the selector beside the tab bar. */
export interface ViewingAsValue {
  mode: ViewingAsMode;
  userId: string | null;
  setMode: (mode: ViewingAsMode) => void;
  setUserId: (userId: string | null) => void;
}

interface EntriesFocus {
  userId: string;
  from: string;
  to: string;
  nonce: number;
}

const ViewingAsContext = createContext<ViewingAsValue | null>(null);

let state: { mode: ViewingAsMode; userId: string | null } = { mode: "me", userId: null };
let focus: EntriesFocus | null = null;
let nonce = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

const update = (next: Partial<typeof state>) => {
  state = { ...state, ...next };
  emit();
};

const snapshot = (): ViewingAsValue => ({
  mode: state.mode,
  userId: state.userId,
  setMode: (mode) => update({ mode, userId: mode === "user" ? state.userId : null }),
  setUserId: (userId) => update({ userId, mode: userId ? "user" : "me" }),
});

const useStoreTick = (enabled: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [enabled]);
};

export function ViewingAsProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const value = useMemo(() => snapshot(), [tick]);
  return <ViewingAsContext.Provider value={value}>{children}</ViewingAsContext.Provider>;
}

/** The provider's value, or the module store when the page has not mounted one yet. */
export function useViewingAs(): ViewingAsValue {
  const ctx = useContext(ViewingAsContext);
  useStoreTick(!ctx);
  return ctx ?? snapshot();
}

/** Null when `TimeTrackingView` has not wrapped the page. List and Day then keep the `scope` prop. */
export function useViewingAsOptional(): ViewingAsValue | null {
  return useContext(ViewingAsContext);
}

/** Map the phase-1 scope string (`me` / `all` / a user id) onto the context shape. */
export function viewingFromScope(scope: string): ViewingAsValue {
  const mode: ViewingAsMode = scope === "all" ? "team" : !scope || scope === "me" ? "me" : "user";
  return {
    mode,
    userId: mode === "user" ? scope : null,
    setMode: (next) => update({ mode: next, userId: next === "user" ? state.userId : null }),
    setUserId: (userId) => update({ userId, mode: userId ? "user" : "me" }),
  };
}

export function useEntriesFocus(): EntriesFocus | null {
  useStoreTick(true);
  return focus;
}

export function clearEntriesFocus() {
  if (!focus) return;
  focus = null;
  emit();
}

/** List shows this person and date range. Also asks the tab bar to select List. */
export function requestOpenList(userId: string, from: string, to: string) {
  focus = { userId, from, to, nonce: ++nonce };
  update({ mode: "user", userId });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ccrm-time-tab", { detail: "list" }));
  }
}

export function EntriesFocusBanner({ users }: { users: { id?: string; name: string }[] }) {
  const current = useEntriesFocus();
  const provided = useViewingAsOptional();
  const { t } = useTimeTracking();
  if (!current) return null;
  const name = users.find((u) => u.id === current.userId)?.name || current.userId;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-ui text-teal-900" data-testid="entries-focus">
      <span>
        {t("Showing entries for", "Záznamy pre", "Bejegyzések:")} <b>{name}</b>
      </span>
      <button
        type="button"
        onClick={() => {
          provided?.setMode("me");
          provided?.setUserId(null);
          clearEntriesFocus();
        }}
        className="ml-auto h-8 rounded-lg px-2 font-semibold text-teal-800 transition-all hover:bg-teal-100 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {t("Clear", "Zrušiť", "Törlés")}
      </button>
    </div>
  );
}
