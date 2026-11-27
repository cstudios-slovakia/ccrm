import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Puzzle, X } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { entityAccentStyle } from "../../utils/entityAccent";
import type { Language } from "../../utils/translations";
import { ExtensionDownloadButton, ExtensionInstallSteps } from "./ExtensionSettings";
import { PairedBrowsers } from "./PairedBrowsers";

/**
 * Self-service Chrome Extension modal accessible directly from `#time-tracking`
 * so every user can download the zip, generate a one-time pairing code, and manage
 * their paired browsers without needing access to company settings.
 */
export function ChromeExtensionDialog({ open, onClose, language }: { open: boolean; onClose: () => void; language: Language }) {
  const { t, settings } = useTimeTracking();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={entityAccentStyle("time-tracking") as React.CSSProperties}
      className="fixed inset-0 z-[100001] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("Chrome extension", "Rozšírenie Chrome", "Chrome-bővítmény")}
      data-testid="time-extension-dialog"
    >
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
              <Puzzle className="size-4.5" />
            </div>
            <div>
              <h3 className="type-panel-title text-gray-900">{t("Chrome extension", "Rozšírenie Chrome", "Chrome-bővítmény")}</h3>
              <p className="type-meta text-gray-500">
                {t("Download the extension, generate a one-time code, and track time right from Chrome.", "Stiahnite si rozšírenie, vygenerujte jednorazový kód a sledujte čas priamo z Chrome.", "Töltse le a bővítményt, hozzon létre egyszer használatos kódot, és kövesse az időt közvetlenül a Chrome-ból.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExtensionDownloadButton t={t} />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close", "Zavrieť", "Bezárás")}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5">
          <ExtensionInstallSteps t={t} />

          {!settings.extension.enabled ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-ui text-amber-900" data-testid="time-extension-disabled-note">
              {t("Extension pairing is turned off in company settings.", "Párovanie rozšírenia je vo firemných nastaveniach vypnuté.", "A bővítmény párosítása ki van kapcsolva a céges beállításokban.")}
            </div>
          ) : (
            <PairedBrowsers t={t} language={language} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
