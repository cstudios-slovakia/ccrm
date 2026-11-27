import React, { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import type { Language } from "../utils/translations";
import {
  isEmbeddedHere,
  isQaRunHere,
  promptInstall,
  readInstallDismissedAt,
  usePwaInstall,
  writeInstallDismissedAt,
} from "../utils/pwaInstall";
import { shouldOfferInstall } from "../utils/pwaInstallLogic";
import { PRODUCT_NAME } from "../utils/brand";

interface PwaInstallBannerProps {
  language: Language;
  /** Who is signed in; the "not now" is remembered per user. */
  userKey: string;
}

/**
 * The automatic, dismissible offer to install CCRM. Shown only to a signed-in user
 * whose browser is offering the install, outside the installed app, the mini
 * window and QA runs. "Not now" is remembered for 30 days. It never gates anything.
 */
export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({ language, userKey }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);
  const brand = PRODUCT_NAME;
  const { canInstall, isInstalled } = usePwaInstall();
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => readInstallDismissedAt(userKey));
  const [busy, setBusy] = useState(false);

  // Another user on the same browser has their own answer.
  useEffect(() => setDismissedAt(readInstallDismissedAt(userKey)), [userKey]);

  const offer = shouldOfferInstall({
    signedIn: true,
    canInstall,
    isInstalled,
    embedded: isEmbeddedHere(),
    qaRun: isQaRunHere(),
    dismissedAt,
    now: Date.now(),
  });

  // Two flags so it can animate both ways: `mounted` keeps it in the DOM while it
  // leaves, `open` drives the transition.
  const [mounted, setMounted] = useState(offer);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (offer) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(frame);
    }
    setOpen(false);
    const timer = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [offer]);

  if (!mounted) return null;

  const notNow = () => {
    const now = Date.now();
    writeInstallDismissedAt(userKey, now);
    setDismissedAt(now);
  };

  const install = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "dismissed") notNow();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] motion-reduce:transition-none ${
        open ? "grid-rows-[1fr] opacity-100 duration-300 ease-out" : "grid-rows-[0fr] opacity-0 duration-150 ease-in"
      }`}
    >
      <div className="overflow-hidden">
        <div
          role="region"
          aria-label={t(`Install ${brand} app`, `Inštalácia aplikácie ${brand}`, `${brand} alkalmazás telepítése`)}
          data-testid="pwa-install-banner"
          className={`mb-4 bg-white border border-entity-border px-4 py-3 rounded-lg flex items-center justify-between gap-3 shadow-xs transition-transform motion-reduce:transition-none ${
            open ? "translate-y-0 duration-300 ease-out" : "-translate-y-2 duration-150 ease-in"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-entity-subtle border border-entity-border rounded-md shrink-0">
              <Download className="h-4.5 w-4.5 text-entity-text" />
            </div>
            <div className="min-w-0">
              <p className="text-ui font-bold text-gray-900">
                {t(`Install ${brand} as an app`, `Nainštalujte ${brand} ako aplikáciu`, `Telepítse a ${brand}-et alkalmazásként`)}
              </p>
              <p className="text-caption text-gray-500 font-medium">
                {t(
                  "Open it from your taskbar or dock, see today's tasks on its icon and keep a small tasks window on top.",
                  "Otvárajte ho z panela úloh alebo docku, dnešné úlohy uvidíte na jeho ikone a malé okno s úlohami zostane navrchu.",
                  "Nyissa meg a tálcáról vagy a dokkból, lássa a mai feladatokat az ikonján, és tartson egy kis feladatablakot felül.",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={install}
              disabled={busy}
              data-testid="pwa-banner-install"
              className="px-3.5 py-1.5 bg-entity-solid hover:bg-entity-solid-hover text-white text-ui font-semibold rounded-md shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-entity-ring focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("Install", "Nainštalovať", "Telepítés")}
            </button>
            <button
              type="button"
              onClick={notNow}
              data-testid="pwa-banner-dismiss"
              className="px-2.5 py-1.5 text-ui font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md cursor-pointer transition-all duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-entity-ring hidden ws-sm:block"
            >
              {t("Not now", "Teraz nie", "Most nem")}
            </button>
            <button
              type="button"
              onClick={notNow}
              aria-label={t("Dismiss", "Zavrieť", "Bezárás")}
              title={t("Dismiss", "Zavrieť", "Bezárás")}
              className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-700 cursor-pointer transition-all duration-150 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-entity-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
