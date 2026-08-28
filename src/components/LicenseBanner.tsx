import React from "react";
import { KeyRound, ShieldAlert, X } from "lucide-react";
import { getTranslation, formatTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import {
  licenseNoticeSignature,
  licenseNoticeTone,
  shouldShowLicenseBanner,
  readSessionDismissal,
  writeSessionDismissal,
} from "../utils/license";
import type { LicenseState } from "../utils/license";
import { useUserPref } from "../utils/userPrefs";
import { formatDateLocalized } from "../utils/localTime";

interface LicenseBannerProps {
  state: LicenseState | null;
  language: Language;
  isAdmin: boolean;
  /** Opens Settings → Licence. Only rendered for admins. */
  onOpenLicenseSettings: () => void;
}

/**
 * The advance warning that a licence is lapsing.
 *
 * Deliberately an ordinary block at the top of the workspace, not a modal and
 * not a toast: nothing here is urgent enough to interrupt someone mid-task, and
 * the whole point of warning early is that there is still time. The wording
 * always carries the reassurance that the CRM itself is unaffected, because the
 * first thing a user assumes when they see "licence" in red is that something is
 * about to be taken away from them.
 *
 * Two ways out, matching what each one honestly means:
 *   Close           — gone for this browser session.
 *   Don't show again — gone until the licence situation itself changes (a new
 *                     key, or expiring becoming expired). See
 *                     licenseNoticeSignature.
 */
export const LicenseBanner: React.FC<LicenseBannerProps> = ({
  state,
  language,
  isAdmin,
  onOpenLicenseSettings,
}) => {
  const [suppressed, setSuppressed] = useUserPref("licenseNoticeSuppressed");
  const [sessionDismissed, setSessionDismissed] = React.useState<string | null>(() =>
    readSessionDismissal()
  );

  const visible = shouldShowLicenseBanner({
    state,
    suppressedSignature: suppressed,
    sessionDismissedSignature: sessionDismissed,
    isAdmin,
  });

  if (!visible || !state) return null;

  const t = (key: string) => getTranslation(language, key);
  const signature = licenseNoticeSignature(state);
  const tone = licenseNoticeTone(state);
  const days = state.daysRemaining;
  const expiresOn = state.expiresAt ? formatDateLocalized(state.expiresAt, language) : "";

  // The expiring case is the one with a number in it, and it has three shapes:
  // "tomorrow", "today", and "in N days". Reading "expires in 1 days" is exactly
  // the sort of detail that makes a warning look automated and get ignored.
  const headline = (() => {
    switch (state.status) {
      case "expiring":
        if (days !== null && days <= 0) return t("license.banner.expiring_today");
        if (days === 1) return t("license.banner.expiring_one");
        return formatTranslation(language, "license.banner.expiring", {
          days: days ?? 0,
          date: expiresOn,
        });
      case "expired":
        return formatTranslation(language, "license.banner.expired", { date: expiresOn });
      case "revoked":
        return t("license.banner.revoked");
      case "suspended":
        return t("license.banner.suspended");
      case "invalid":
        return t("license.banner.invalid");
      default:
        return t("license.banner.none");
    }
  })();

  const palette =
    tone === "warning"
      ? {
          shell: "bg-amber-50 border-amber-200",
          icon: "text-amber-600",
          title: "text-amber-900",
          body: "text-amber-700",
          action: "bg-amber-600 hover:bg-amber-500 border-amber-700",
          quiet: "text-amber-700 hover:text-amber-900 hover:bg-amber-100/70",
        }
      : {
          shell: "bg-rose-50 border-rose-200",
          icon: "text-rose-600",
          title: "text-rose-900",
          body: "text-rose-700",
          action: "bg-rose-600 hover:bg-rose-500 border-rose-700",
          quiet: "text-rose-700 hover:text-rose-900 hover:bg-rose-100/70",
        };

  return (
    <div
      role="status"
      className={`mb-5 rounded-3xl border ${palette.shell} px-5 py-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300`}
    >
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <ShieldAlert className={`h-6 w-6 shrink-0 mt-0.5 ${palette.icon}`} aria-hidden="true" />

        <div className="flex-1 min-w-[240px] space-y-1">
          <p className={`text-sm font-heading font-black tracking-tight ${palette.title}`}>
            {headline}
          </p>
          <p className={`text-xs font-semibold leading-relaxed ${palette.body}`}>
            {t("license.banner.reassurance")}
            {!isAdmin && ` ${t("license.banner.admin_only")}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Only an administrator can enter a key, so only an administrator is
              offered the button that goes there. */}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenLicenseSettings}
              className={`px-3.5 py-2 rounded-xl border text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${palette.action}`}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              {t("license.banner.enter_key")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              writeSessionDismissal(signature);
              setSessionDismissed(signature);
            }}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${palette.quiet}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t("license.banner.close")}
          </button>
          <button
            type="button"
            onClick={() => setSuppressed(signature)}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${palette.quiet}`}
          >
            {t("license.banner.never")}
          </button>
        </div>
      </div>
    </div>
  );
};
