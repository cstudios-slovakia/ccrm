import React from "react";
import {
  KeyRound, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Trash2,
  Users, CalendarClock, Info, CheckCircle2, Loader2,
} from "lucide-react";
import { getTranslation, formatTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import type { LicenseState, LicenseErrorCode } from "../utils/license";
import { activateLicense, refreshLicense, removeLicense } from "../utils/licenseApi";
import { formatDateLocalized, formatTimestampLocalized } from "../utils/localTime";

interface LicenseSettingsProps {
  state: LicenseState | null;
  language: Language;
  /** Read-only for anyone who is not an administrator. */
  canEdit: boolean;
  /** Hands the newly-fetched state back so the banner and seat checks follow. */
  onStateChange: (next: LicenseState) => void;
}

/** Row of the summary grid. */
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">{label}</span>
    <div className="text-xs font-bold text-slate-800 break-words">{children}</div>
  </div>
);

/**
 * Settings → Licence.
 *
 * Three jobs, in the order someone actually needs them: say plainly what the
 * licence is doing right now, let an administrator enter a new key, and explain
 * what a lapsed licence does and does not affect — that last one is not padding.
 * "Licence expired" reads as "the software is about to stop working" unless the
 * screen says otherwise, and here it never does.
 */
export const LicenseSettings: React.FC<LicenseSettingsProps> = ({
  state,
  language,
  canEdit,
  onStateChange,
}) => {
  const t = (key: string) => getTranslation(language, key);

  const [keyInput, setKeyInput] = React.useState("");
  const [busy, setBusy] = React.useState<null | "activate" | "refresh" | "remove">(null);
  const [error, setError] = React.useState<LicenseErrorCode | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const status = state?.status ?? "unconfigured";
  const configured = state?.configured ?? false;

  const run = async (
    kind: "activate" | "refresh" | "remove",
    action: () => Promise<{ ok: boolean; error: LicenseErrorCode | null; state: LicenseState | null }>,
    successKey: string
  ) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      // The endpoint returns the resulting state on success AND on failure, so
      // the screen tells the truth either way — a refused activation still
      // refreshes "last checked" and any new error the server recorded.
      if (result.state) onStateChange(result.state);
      if (result.ok) {
        setNotice(t(successKey));
        if (kind === "activate") setKeyInput("");
      } else {
        setError(result.error ?? "unknown");
      }
    } finally {
      setBusy(null);
    }
  };

  const statusVisual = (() => {
    switch (status) {
      case "active":
        return { Icon: ShieldCheck, tone: "text-emerald-600", chip: "bg-emerald-50 border-emerald-200 text-emerald-700" };
      case "expiring":
        return { Icon: ShieldAlert, tone: "text-amber-600", chip: "bg-amber-50 border-amber-200 text-amber-700" };
      case "unconfigured":
        return { Icon: Info, tone: "text-slate-400", chip: "bg-slate-50 border-slate-200 text-slate-600" };
      default:
        return { Icon: ShieldX, tone: "text-rose-600", chip: "bg-rose-50 border-rose-200 text-rose-700" };
    }
  })();
  const { Icon: StatusIcon } = statusVisual;

  const daysLine = (() => {
    if (!state || state.daysRemaining === null) return null;
    return state.daysRemaining >= 0
      ? formatTranslation(language, "license.days_left", { days: state.daysRemaining })
      : formatTranslation(language, "license.days_ago", { days: Math.abs(state.daysRemaining) });
  })();

  const seatsLine = (() => {
    if (!state) return null;
    if (state.maxUsers === null) return t("license.seats_unlimited");
    return formatTranslation(language, "license.seats_used", {
      used: state.seatsUsed,
      max: state.maxUsers,
    });
  })();

  const overSeats = !!state && state.maxUsers !== null && state.seatsUsed > state.maxUsers;
  const atSeats = !!state && state.maxUsers !== null && state.seatsUsed === state.maxUsers;

  return (
    <div className="lg:col-span-12 space-y-6">
      <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">

        {/* Heading + status chip */}
        <div className="flex items-start justify-between gap-4 flex-wrap border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-heading font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
              <KeyRound className="h-4.5 w-4.5 text-indigo-500" aria-hidden="true" />
              {t("license.title")}
            </h3>
            <p className="text-[11px] font-semibold text-slate-500">{t("license.subtitle")}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${statusVisual.chip}`}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`license.status.${status}`)}
          </span>
        </div>

        {/* Licensing was never switched on for this build: say so instead of
            offering an activation form that cannot succeed. */}
        {!configured && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t("license.not_configured_notice")}</span>
          </div>
        )}

        {configured && state && (
          <>
            {/* What the licence says */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 p-5 rounded-2xl bg-slate-50/70 border border-slate-100">
              {state.keyMasked && (
                <Field label={t("license.key_installed")}>
                  <code className="font-mono text-[11px] tracking-wider">{state.keyMasked}</code>
                </Field>
              )}
              {state.customer && <Field label={t("license.customer")}>{state.customer}</Field>}
              {state.plan && <Field label={t("license.plan")}>{state.plan}</Field>}
              <Field label={t("license.expires")}>
                {state.expiresAt ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {formatDateLocalized(state.expiresAt, language)}
                    {daysLine && <span className="font-semibold text-slate-500">({daysLine})</span>}
                  </span>
                ) : (
                  t("license.expires_never")
                )}
              </Field>
              <Field label={t("license.seats")}>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {seatsLine}
                </span>
              </Field>
              {state.activatedAt && (
                <Field label={t("license.activated_at")}>
                  {formatTimestampLocalized(state.activatedAt, language)}
                </Field>
              )}
              <Field label={t("license.last_check")}>
                {state.lastCheckAt
                  ? formatTimestampLocalized(state.lastCheckAt, language)
                  : t("license.last_check_never")}
              </Field>
              <Field label={t("license.status_label")}>
                <span className={state.updatesAllowed ? "text-emerald-700" : "text-rose-700"}>
                  {state.updatesAllowed ? t("license.updates_allowed") : t("license.updates_blocked")}
                </span>
              </Field>
            </div>

            {/* Seat pressure. Worth its own line: an admin who cannot add a
                colleague needs to know why before they try. */}
            {(overSeats || atSeats) && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2.5">
                <Users className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{overSeats ? t("license.seats_over") : t("license.seats_full")}</span>
              </div>
            )}

            {/* The licence server has not answered in a while, but the licence
                is still good. Explaining this beats an unexplained stale date. */}
            {state.offlineDays !== null && state.offlineDays >= 2 && state.valid && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold flex items-start gap-2.5">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{formatTranslation(language, "license.offline_notice", { days: state.offlineDays })}</span>
              </div>
            )}
          </>
        )}

        {/* Enter a key. Admins only — everyone else reads the state above. */}
        {configured && canEdit && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!keyInput.trim() || busy) return;
              run("activate", () => activateLicense(keyInput.trim()), "license.activated_ok");
            }}
          >
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block pl-0.5">
              {t("license.key_label")}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={t("license.key_placeholder")}
                spellCheck={false}
                autoComplete="off"
                disabled={busy !== null}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold font-mono tracking-wider focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy !== null || keyInput.trim() === ""}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {busy === "activate" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t("license.activating")}
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("license.activate")}
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] font-semibold text-slate-400 pl-0.5">{t("license.key_hint")}</p>
          </form>
        )}

        {/* Outcome of the last action. */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-200">
            <ShieldX className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t(`license.error.${error}`)}</span>
          </div>
        )}
        {notice && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in duration-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {/* Maintenance actions. */}
        {configured && canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("refresh", refreshLicense, "license.checked_ok")}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} aria-hidden="true" />
              {busy === "refresh" ? t("license.rechecking") : t("license.recheck")}
            </button>
            {state && state.keyMasked !== "" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(t("license.remove_confirm"))) return;
                  run("remove", removeLicense, "license.removed_ok");
                }}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("license.remove")}
              </button>
            )}
          </div>
        )}

        {/* What a licence actually controls. Last, and always shown. */}
        <p className="text-[11px] font-semibold text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
          {t("license.updates_explainer")}
        </p>
      </div>
    </div>
  );
};
