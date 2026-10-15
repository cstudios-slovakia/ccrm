import React, { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Bookmark,
  CheckCircle2,
  Download,
  Loader2,
  MonitorSmartphone,
  Mic,
  PictureInPicture2,
  Share,
  SquarePlus,
  Zap,
} from "lucide-react";
import type { Language } from "../utils/translations";
import { usePwaInstall, writeInstallDismissedAt } from "../utils/pwaInstall";
import { installCardState } from "../utils/pwaInstallLogic";
import { isAppBadgeSupported } from "../utils/appBadge";
import { buildBookmarklet } from "../utils/launchIntent";
import { openTasksMiniWindow } from "../utils/popOut";

interface PwaInstallCardProps {
  systemLanguage: Language;
  /** Same key the install banner uses, so installing from here silences it too. */
  userKey: string;
}

const secondaryButton =
  "px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-ui font-bold text-slate-700 shadow-2xs " +
  "flex items-center gap-2 cursor-pointer transition-all duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Settings → Profile: install CCRM as a desktop app and use the things that come
 * with it (shortcuts, badge, mini window, share). Never shows a button that does
 * nothing: Install exists only while the browser is actually offering it.
 */
export const PwaInstallCard: React.FC<PwaInstallCardProps> = ({ systemLanguage, userKey }) => {
  const t = (en: string, sk: string, hu: string) => (systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en);
  const { canInstall, isInstalled, isStandalone, platform, isSecureContext, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [popBusy, setPopBusy] = useState(false);
  const state = installCardState({ isInstalled, canInstall, platform, isSecureContext });
  const badgeSupported = isAppBadgeSupported();

  // React refuses javascript: URLs in JSX, so the bookmarklet is set on the element.
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmarkletRef.current?.setAttribute("href", buildBookmarklet(window.location.origin));
  }, []);

  const handleInstall = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      // A "no" in the browser dialog counts as a "not now" for the automatic banner too.
      if (outcome === "dismissed") writeInstallDismissedAt(userKey);
    } finally {
      setBusy(false);
    }
  };

  const handlePopOut = async () => {
    setPopBusy(true);
    try {
      const result = await openTasksMiniWindow();
      if (result === "blocked") {
        (window as any).showToast?.(
          t(
            "Your browser blocked the pop-up window. Allow pop-ups for CCRM and try again.",
            "Prehliadač zablokoval vyskakovacie okno. Povoľte pre CCRM vyskakovacie okná a skúste znova.",
            "A böngésző letiltotta a felugró ablakot. Engedélyezze a felugró ablakokat a CCRM-hez, és próbálja újra.",
          ),
          "warning",
        );
      }
    } finally {
      setPopBusy(false);
    }
  };

  const benefits: { icon: React.ReactNode; text: string; on: boolean }[] = [
    {
      icon: <Zap className="h-4 w-4" />,
      on: true,
      text: t(
        "Shortcuts on the app icon: My tasks, New voice task, New task (right-click the icon on the taskbar or dock).",
        "Skratky na ikone aplikácie: Moje úlohy, Nová hlasová úloha, Nová úloha (pravý klik na ikonu v paneli úloh alebo docku).",
        "Gyorsparancsok az alkalmazás ikonján: Saját feladatok, Új hangfeladat, Új feladat (jobb gomb az ikonon a tálcán vagy a dokkban).",
      ),
    },
    {
      icon: <BadgeCheck className="h-4 w-4" />,
      on: badgeSupported,
      text: badgeSupported
        ? t(
            "A badge on the icon with the number of missed and today's tasks.",
            "Odznak na ikone s počtom zmeškaných a dnešných úloh.",
            "Jelvény az ikonon a lejárt és a mai feladatok számával.",
          )
        : t(
            "Task-count badge on the icon (Windows and macOS; this browser does not support it).",
            "Odznak s počtom úloh na ikone (Windows a macOS; tento prehliadač ho nepodporuje).",
            "Feladatszámláló jelvény az ikonon (Windows és macOS; ez a böngésző nem támogatja).",
          ),
    },
    {
      icon: <Bell className="h-4 w-4" />,
      on: true,
      text: t(
        "Task notifications that open the app straight on the task.",
        "Upozornenia na úlohy, ktoré otvoria aplikáciu priamo na úlohe.",
        "Feladatértesítések, amelyek közvetlenül a feladatnál nyitják meg az alkalmazást.",
      ),
    },
    {
      icon: <PictureInPicture2 className="h-4 w-4" />,
      on: true,
      text: t(
        "A small “Pop out” tasks window that stays on top while you work in other apps.",
        "Malé okno „Samostatné okno“ s úlohami, ktoré zostáva navrchu, kým pracujete v iných aplikáciách.",
        "Kis „Kiemelés” feladatablak, amely más alkalmazások használata közben is felül marad.",
      ),
    },
  ];

  return (
    <div className="space-y-2 border-t border-slate-200/80 pt-4" data-testid="pwa-install-card" data-state={state}>
      <div className="flex items-center justify-between">
        <label className="type-overline text-slate-600 flex items-center gap-1.5">
          <MonitorSmartphone className="h-3.5 w-3.5 text-indigo-500" />
          {t("Install CCRM app", "Inštalácia aplikácie CCRM", "CCRM alkalmazás telepítése")}
        </label>
        <span
          className={`px-2.5 py-0.5 rounded-lg type-overline transition-colors duration-200 ${
            state === "installed"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {state === "installed"
            ? t("Installed", "Nainštalované", "Telepítve")
            : t("Not installed", "Nenainštalované", "Nincs telepítve")}
        </span>
      </div>

      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
        {/* Main message + the one action that fits this browser */}
        <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
          <div className="text-ui text-slate-600 leading-relaxed max-w-md font-medium space-y-1.5">
            {state === "installed" && (
              <p className="flex items-start gap-1.5 text-emerald-700 font-bold">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {isStandalone
                    ? t("You are using the installed app.", "Používate nainštalovanú aplikáciu.", "A telepített alkalmazást használja.")
                    : t(
                        "CCRM is installed on this device — open it from your apps, taskbar or dock.",
                        "CCRM je nainštalované v tomto zariadení — otvorte ho zo zoznamu aplikácií, panela úloh alebo docku.",
                        "A CCRM telepítve van ezen az eszközön — nyissa meg az alkalmazások, a tálca vagy a dokk közül.",
                      )}
                </span>
              </p>
            )}
            {state === "can-install" && (
              <p>
                {t(
                  "Install CCRM as an app: its own window, a taskbar or dock icon, shortcuts and a task badge. No store, no admin rights.",
                  "Nainštalujte CCRM ako aplikáciu: vlastné okno, ikona v paneli úloh alebo docku, skratky a odznak s úlohami. Bez obchodu a bez práv správcu.",
                  "Telepítse a CCRM-et alkalmazásként: saját ablak, tálca- vagy dokkikon, gyorsparancsok és feladatjelvény. Áruház és rendszergazdai jog nélkül.",
                )}
              </p>
            )}
            {state === "ios-instructions" && (
              <ol className="list-decimal pl-4 space-y-1">
                <li className="flex items-center gap-1.5">
                  {t("Tap", "Ťuknite na", "Koppintson a")} <Share className="h-4 w-4 text-indigo-600 inline" />
                  <b>{t("Share", "Zdieľať", "Megosztás")}</b>
                </li>
                <li className="flex items-center gap-1.5">
                  {t("Choose", "Vyberte", "Válassza a")} <SquarePlus className="h-4 w-4 text-indigo-600 inline" />
                  <b>{t("Add to Home Screen", "Pridať na plochu", "Hozzáadás a főképernyőhöz")}</b>
                </li>
              </ol>
            )}
            {state === "chromium-manual" && (
              <p>
                {t(
                  "Your browser is not offering the install button right now. Use the install icon at the right end of the address bar, or open the browser menu (⋮) → Cast, save and share → Install page as app.",
                  "Prehliadač práve neponúka tlačidlo inštalácie. Použite ikonu inštalácie vpravo v paneli s adresou alebo menu prehliadača (⋮) → Odoslať, uložiť a zdieľať → Nainštalovať stránku ako aplikáciu.",
                  "A böngésző jelenleg nem kínálja fel a telepítés gombot. Használja a címsor jobb szélén lévő telepítés ikont, vagy a böngészőmenüt (⋮) → Átküldés, mentés és megosztás → Oldal telepítése alkalmazásként.",
                )}
              </p>
            )}
            {state === "insecure" && (
              <p>
                {t(
                  "Installing needs a secure (HTTPS) connection. Open CCRM through its https:// address to install it.",
                  "Inštalácia vyžaduje zabezpečené pripojenie (HTTPS). Otvorte CCRM cez adresu https:// a nainštalujte ho.",
                  "A telepítéshez biztonságos (HTTPS) kapcsolat kell. Nyissa meg a CCRM-et a https:// címen, és telepítse.",
                )}
              </p>
            )}
            {state === "unsupported" && (
              <p>
                {t(
                  "This browser cannot install web apps. Open CCRM in Google Chrome or Microsoft Edge to install it as an app.",
                  "Tento prehliadač nevie inštalovať webové aplikácie. Otvorte CCRM v Google Chrome alebo Microsoft Edge a nainštalujte ho ako aplikáciu.",
                  "Ez a böngésző nem tud webalkalmazást telepíteni. Nyissa meg a CCRM-et Google Chrome-ban vagy Microsoft Edge-ben, és telepítse alkalmazásként.",
                )}
              </p>
            )}
          </div>

          {state === "can-install" && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={busy}
              data-testid="pwa-install-button"
              className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-ui font-bold text-white shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-lg active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>{t("Install", "Nainštalovať", "Telepítés")}</span>
            </button>
          )}
        </div>

        {/* What the installed app gives */}
        <ul className="space-y-1.5 text-caption text-slate-600" data-testid="pwa-benefits">
          {benefits.map((b, i) => (
            <li key={i} className={`flex items-start gap-2 ${b.on ? "" : "text-slate-400"}`}>
              <span className={`mt-0.5 shrink-0 ${b.on ? "text-indigo-500" : "text-slate-300"}`}>{b.icon}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>

        {/* Things that work with or without installing */}
        <div className="border-t border-slate-200/80 pt-3 space-y-3">
          <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-2">
            <p className="text-caption text-slate-600 max-w-md">
              {t(
                "Keep My Tasks in a small always-on-top window. Use Pop out here, or on the Tasks page.",
                "Majte Moje úlohy v malom okne vždy navrchu. Použite Samostatné okno tu alebo na stránke Úlohy.",
                "Tartsa a Saját feladatokat egy kis, mindig felül lévő ablakban. Használja a Kiemelés gombot itt vagy a Feladatok oldalon.",
              )}
            </p>
            <button type="button" onClick={handlePopOut} disabled={popBusy} data-testid="pwa-pop-out" className={`shrink-0 ${secondaryButton}`}>
              <PictureInPicture2 className="h-4 w-4 text-indigo-600" />
              <span>{t("Pop out tasks", "Samostatné okno úloh", "Feladatok kiemelése")}</span>
            </button>
          </div>

          <div className="space-y-1.5" data-testid="pwa-share-help">
            <p className="type-label text-slate-700 flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-indigo-500" />
              {t("Create tasks from other websites", "Vytváranie úloh z iných stránok", "Feladatok létrehozása más weboldalakról")}
            </p>
            <p className="text-caption text-slate-600">
              {t(
                "With the app installed on Windows or ChromeOS, use the browser's Share command (menu ⋮ → Cast, save and share → Share…) and pick CCRM: the page title and link become a task. Selected text can be shared the same way wherever the browser or the system offers “Share”.",
                "S nainštalovanou aplikáciou vo Windows alebo ChromeOS použite príkaz Zdieľať v prehliadači (menu ⋮ → Odoslať, uložiť a zdieľať → Zdieľať…) a vyberte CCRM: z názvu a odkazu stránky sa stane úloha. Označený text sa dá zdieľať rovnako všade, kde prehliadač alebo systém ponúka „Zdieľať“.",
                "Windows vagy ChromeOS rendszeren telepített alkalmazással használja a böngésző Megosztás parancsát (menü ⋮ → Átküldés, mentés és megosztás → Megosztás…), és válassza a CCRM-et: az oldal címe és hivatkozása feladattá válik. A kijelölt szöveg ugyanígy osztható meg mindenhol, ahol a böngésző vagy a rendszer felkínálja a „Megosztás” lehetőséget.",
              )}
            </p>
            <p className="text-caption text-slate-600">
              {t(
                "On macOS and Linux, Chrome cannot share into installed apps. Drag this button to your bookmarks bar, then click it on any page: the selected text (or the page title) and its link open as a new CCRM task.",
                "V macOS a Linuxe Chrome nevie zdieľať do nainštalovaných aplikácií. Presuňte toto tlačidlo na panel záložiek a kliknite naň na ľubovoľnej stránke: označený text (alebo názov stránky) a jej odkaz sa otvoria ako nová úloha v CCRM.",
                "macOS és Linux rendszeren a Chrome nem tud telepített alkalmazásba megosztani. Húzza ezt a gombot a könyvjelzősávra, majd kattintson rá bármely oldalon: a kijelölt szöveg (vagy az oldal címe) és a hivatkozása új CCRM-feladatként nyílik meg.",
              )}
            </p>
            <a
              ref={bookmarkletRef}
              data-testid="pwa-bookmarklet"
              draggable
              onClick={(e) => e.preventDefault()}
              title={t("Drag me to the bookmarks bar", "Presuňte ma na panel záložiek", "Húzzon a könyvjelzősávra")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 text-ui font-bold text-indigo-700 cursor-grab transition-all duration-150 ease-out hover:-translate-y-px hover:bg-indigo-100 active:cursor-grabbing active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <Bookmark className="h-3.5 w-3.5" />
              {t("Send to CCRM", "Poslať do CCRM", "Küldés a CCRM-nek")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
