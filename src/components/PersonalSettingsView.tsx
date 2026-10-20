import React, { useState } from "react";
import { User, Mail, Settings, Save, RefreshCw, CheckCircle2, AlertCircle, AlertOctagon, Bot, Bell, Volume2 } from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import { PasskeySettings } from "./PasskeySettings";
import { McpAssistantSettings } from "./McpAssistantSettings";
import type { UserProfile } from "../types";
import { getTranslation, type Language } from "../utils/translations";
import type { Appearance, ThemeMode } from "../utils/theme";
import { CustomSelect } from "./ui/CustomSelect";
import { ThemeSettings } from "./ThemeSettings";
import { SidebarSettings } from "./SidebarSettings";
import { ViewSizeSettings } from "./ViewSizeSettings";
import { SecretInput } from "./ui/SecretInput";
import {
  requestBrowserNotificationPermission,
  getBrowserNotificationPermission,
  sendTaskPushNotification,
  sendTestPushNotification,
  type NotificationPermissionState,
} from "../utils/browserNotifications";
import { PageHeader } from "./layout";
import { PwaInstallCard } from "./PwaInstallCard";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { clearErrorLogsWithUndo } from "../utils/errorLogs";
import { asLang } from "../utils/undoMessages";

interface PersonalSettingsViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  setUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  systemLanguage: Language;
  userLanguage: Language;
  setUserLanguage: (lang: Language) => void;
  userTheme?: string;
  setUserTheme?: (theme: string) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  appearance: Appearance;
  onSync: () => void;
  errorSidebarEnabled: boolean;
  setErrorSidebarEnabled: (enabled: boolean) => void;
  /** Tab to open on, from the route (`personal-settings/email`). */
  initialSubTab?: string;
  /**
   * self.account: may this person change their own login name and e-mail? Off locks both fields (the
   * server ignores the change too). Password and preferences are never locked.
   */
  canChangeAccount?: boolean;
}

const SUB_TABS = ["profile", "email", "mcp", "errors"] as const;
type SubTab = (typeof SUB_TABS)[number];

export const PersonalSettingsView: React.FC<PersonalSettingsViewProps> = ({
  currentUser,
  users: _users,
  setUsers,
  systemLanguage,
  userLanguage,
  setUserLanguage,
  userTheme,
  setUserTheme,
  themeMode,
  setThemeMode,
  appearance,
  onSync,
  errorSidebarEnabled,
  setErrorSidebarEnabled,
  initialSubTab,
  canChangeAccount = true
}) => {
  const activeLang = userLanguage || systemLanguage;
  const t = (en: string, sk: string, hu: string) => activeLang === "sk" ? sk : activeLang === "hu" ? hu : en;

  const [activeSubTab, setActiveSubTab] = useState<SubTab>(
    (SUB_TABS as readonly string[]).includes(initialSubTab ?? "") ? (initialSubTab as SubTab) : "profile"
  );
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(() => getBrowserNotificationPermission());

  React.useEffect(() => {
    const update = () => setNotifPermission(getBrowserNotificationPermission());
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestBrowserNotificationPermission(currentUser);
    setNotifPermission(getBrowserNotificationPermission());
    if (granted) {
      sendTaskPushNotification({
        title: t("Notifications Active", "Upozornenia aktívne", "Értesítések bekapcsolva"),
        body: t("You will now receive alerts for task updates.", "Budete dostávať hlásenia o úlohách.", "Mostantól értesítéseket kap a feladatokról."),
        type: "info",
      });
    } else if (Notification.permission === "denied") {
      (window as any).showToast?.(t(
        "Notifications are blocked by your browser. Please allow notifications in site settings (click the lock icon in the browser address bar).",
        "Upozornenia sú zablokované prehliadačom. Povoľte ich v nastaveniach stránky (kliknite na zámok v paneli adries).",
        "Az értesítések le vannak tiltva a böngészőben. Engedélyezze őket az oldal beállításaiban (kattintson a lakat ikonra a címsorban)."
      ), "warning");
    }
  };

  const handleTestNotification = () => {
    sendTaskPushNotification({
      title: t("Test Notification", "Testovacie upozornenie", "Teszt értesítés"),
      body: t("Desktop & sound alerts are working perfectly!", "Upozornenia na ploche a zvuky fungujú správne!", "Az asztali és hangértesítések hibátlanul működnek!"),
      type: "info",
    });
    sendTestPushNotification(currentUser).catch(() => {});
  };

  const fetchErrorLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch("/api/error_logs.php");
      const data = await response.json();
      if (data.success) {
        setErrorLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to fetch error logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // The hold on the button is the confirmation; the logs are deleted on the server
  // when the undo window closes (utils/errorLogs).
  const clearErrorLogs = () => {
    clearErrorLogsWithUndo({ logs: errorLogs, setLogs: setErrorLogs, lang: asLang(activeLang) });
  };

  const handleClearCacheAndReload = async () => {
    if (confirm(t("Are you sure you want to clear the browser cache and reload the application?", "Naozaj chcete vymazať vyrovnávaciu pamäť prehliadača a znova načítať aplikáciu?", "Biztosan törli a böngésző gyorsítótárát és újratölti az alkalmazást?"))) {
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        } catch (e) {
          console.warn("Failed to clear service worker caches:", e);
        }
      }
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        } catch (e) {
          console.warn("Failed to unregister service workers:", e);
        }
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = window.location.origin + window.location.pathname + '?t=' + Date.now() + window.location.hash;
    }
  };

  React.useEffect(() => {
    if (activeSubTab === "errors") {
      fetchErrorLogs();
    }
  }, [activeSubTab]);

  // User profile states
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [password, setPassword] = useState(currentUser.password || "");

  // Fill in every field, in a fixed key order, so that the form state and anything
  // read back from the profile can be compared as plain JSON strings.
  const normalizeEmailSettings = (s: any) => ({
    provider: s?.provider || "smtp",
    imapHost: s?.imapHost || "",
    imapPort: s?.imapPort || "993",
    imapSecure: s?.imapSecure !== undefined ? s.imapSecure : "ssl",
    smtpHost: s?.smtpHost || "",
    smtpPort: s?.smtpPort || "465",
    smtpSecure: s?.smtpSecure !== undefined ? s.smtpSecure : "ssl",
    imapUsername: s?.imapUsername || s?.username || "",
    imapPassword: s?.imapPassword || s?.password || "",
    smtpUsername: s?.smtpUsername || s?.username || "",
    smtpPassword: s?.smtpPassword || s?.password || "",
    exchangeUrl: s?.exchangeUrl || "",
    exchangeDomain: s?.exchangeDomain || "",
    exchangeMailbox: s?.exchangeMailbox || "",
    username: s?.username || "",
    password: s?.password || "",
    // Must be carried over, otherwise reloading the stored profile drops the
    // "already configured" flag and throws the user back into the form.
    isValidated: s?.isValidated === true
  });

  const loadEmailSettings = () => {
    try {
      if (currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string'
          ? JSON.parse(currentUser.metadata_json)
          : currentUser.metadata_json;
        if (metadata.emailSettings) {
          return normalizeEmailSettings(metadata.emailSettings);
        }
      }
    } catch (e) {
      console.warn("Error parsing user metadata_json", e);
    }
    return normalizeEmailSettings({});
  };

  const [emailSettings, setEmailSettings] = useState<any>(loadEmailSettings);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  // Fingerprint of the settings we last read out of (or wrote into) the profile.
  // `currentUser` is a fresh object on every background poll, so reloading the
  // form on its identity alone wiped whatever was being typed. We only reload
  // when the *stored* settings actually changed — and never on top of edits in
  // progress, so a poll landing mid-typing can no longer clear the inputs.
  const loadedEmailSigRef = React.useRef<string | null>(null);

  // Mirror of the live form state for the effect below, which must not
  // re-subscribe on every keystroke.
  const emailSettingsRef = React.useRef(emailSettings);
  React.useEffect(() => {
    emailSettingsRef.current = emailSettings;
  });

  React.useEffect(() => {
    const next = loadEmailSettings();
    const nextSig = JSON.stringify(next);
    if (loadedEmailSigRef.current === null) {
      // First run: state was already initialised from this same profile.
      loadedEmailSigRef.current = nextSig;
      return;
    }
    if (nextSig === loadedEmailSigRef.current) return;
    // Stored settings genuinely moved (another device, another tab). Adopt them
    // only if the user has nothing unsaved in the form.
    if (JSON.stringify(emailSettingsRef.current) !== loadedEmailSigRef.current) return;
    loadedEmailSigRef.current = nextSig;
    setEmailSettings(next);
  }, [currentUser]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      (window as any).showToast(t("Name and email are strictly required!", "Meno a e-mail sú povinné!", "A név és az e-mail kötelező!"));
      return;
    }

    setUsers(prev => prev.map(u => {
      if (u.email === currentUser.email) {
        const updated = {
          ...u,
          // Locked by the role (self.account): keep the stored login name and e-mail.
          name: canChangeAccount ? name.trim() : u.name,
          email: canChangeAccount ? email.trim() : u.email,
          password: password.trim()
        };
        // Update session storage current user in real-time
        sessionStorage.setItem("crm_current_user_rbac", JSON.stringify(updated));
        return updated;
      }
      return u;
    }));

    setTimeout(() => {
      onSync();
      setPassword("");
      (window as any).showToast(t("Profile updated successfully!", "Profil bol úspešne aktualizovaný!", "A profil sikeresen frissítve!"));
    }, 100);
  };

  const handleSaveEmailSettings = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedSettings = normalizeEmailSettings({ ...emailSettings, isValidated: true });
    setEmailSettings(updatedSettings);
    // These are now the stored settings, so the profile coming back from the
    // server must not read as an external change that reloads the form.
    loadedEmailSigRef.current = JSON.stringify(updatedSettings);

    setUsers(prev => prev.map(u => {
      if (u.email === currentUser.email) {
        let meta = {};
        try {
          if (u.metadata_json) {
            meta = typeof u.metadata_json === 'string'
              ? JSON.parse(u.metadata_json)
              : u.metadata_json;
          }
        } catch (err) {}

        const updated = {
          ...u,
          metadata_json: JSON.stringify({
            ...meta,
            emailSettings: updatedSettings
          })
        };
        sessionStorage.setItem("crm_current_user_rbac", JSON.stringify(updated));
        return updated;
      }
      return u;
    }));

    setTimeout(() => {
      onSync();
      (window as any).showToast(t("Email settings saved successfully!", "E-mailové nastavenia boli uložené!", "Az e-mail beállítások elmentve!"));
    }, 100);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/mail_broker.php?action=test_credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailSettings)
      });
      const data = await response.json();
      if (data.success) {
        setTestResult({
          status: "success",
          message: t(
            "Successfully connected and authenticated with your mail server!",
            "Pripojenie k e-mailovému serveru úspešne overené!",
            "Sikeres kapcsolódás és hitelesítés a levelezőszerverrel!"
          )
        });
      } else {
        setTestResult({
          status: "error",
          message: data.error || t("Connection failed. Please verify your host and login details.", "Pripojenie zlyhalo. Skontrolujte hostiteľa a prihlasovacie údaje.", "A kapcsolódás sikertelen. Ellenőrizze a kiszolgálót és a bejelentkezési adatokat.")
        });
      }
    } catch (e) {
      setTestResult({
        status: "error",
        message: t("Network request to mail broker API failed.", "Sieťová požiadavka na API mailového sprostredkovateľa zlyhala.", "A levelezőszerver API-hoz intézett hálózati kérés sikertelen.")
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16">
      {/* Title */}
      <PageHeader
        icon={<Settings className="h-6 w-6 text-pink-500" />}
        title={t("Personal Settings", "Osobné nastavenia", "Személyes beállítások")}
        subtitle={t(
            "Manage your credentials and configure your unified SMTP / IMAP email inbox",
            "Spravujte svoj profil a nakonfigurujte SMTP / IMAP prepojenie schránky",
            "Kezelje hitelesítő adatait és állítsa be egységes SMTP / IMAP e-mail postafiókját"
          )}
      />

      <div className={`grid grid-cols-1 ws-lg:grid-cols-[--spacing(64)_minmax(0,1fr)] gap-8 items-start`}>
        {/* Left Side Navigation Sidebar */}
        <div className="space-y-2 ws-lg:sticky ws-lg:top-24 select-none shrink-0">
          <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col gap-1.5">
            <span className="type-overline text-slate-400 px-3 pb-2.5 border-b border-slate-200 mb-1.5 block">
              {t("Account Categories", "Nastavenia Konta", "Fiók kategóriák")}
            </span>
            <button
              type="button"
              onClick={() => setActiveSubTab("profile")}
              className={`w-full text-left px-4 py-3 rounded-2xl type-overline transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "profile"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border border-indigo-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <User className="h-4 w-4" /> {t("My Profile", "Základný profil", "Saját profil")}
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("email")}
              className={`w-full text-left px-4 py-3 rounded-2xl type-overline transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "email"
                  ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20 border border-pink-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Mail className="h-4 w-4" /> {t("Email Server", "E-mailová schránka", "E-mail szerver")}
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("mcp")}
              className={`w-full text-left px-4 py-3 rounded-2xl type-overline transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "mcp"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 border border-emerald-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Bot className="h-4 w-4 text-emerald-400" /> {t("AI Assistant (MCP)", "AI Asistent (MCP)", "MI Asszisztens (MCP)")}
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("errors")}
              className={`w-full text-left px-4 py-3 rounded-2xl type-overline transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "errors"
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/20 border border-red-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <AlertOctagon className={`h-4 w-4 ${activeSubTab === "errors" ? "text-white" : "text-red-500"}`} /> {t("Error Logs", "Chyby a Výnimky", "Hibanaplók")}
            </button>

            <div className="border-t border-slate-100 my-1 pt-2.5">
              <button
                type="button"
                onClick={handleClearCacheAndReload}
                className="w-full text-left px-4 py-3 rounded-2xl type-overline transition-all flex items-center gap-2 cursor-pointer text-amber-700 hover:text-amber-950 hover:bg-amber-50 border border-transparent"
              >
                <RefreshCw className="h-4 w-4 text-amber-500" /> {t("Clear Cache & Reload", "Vymazať cache a načítať", "Gyorsítótár törlése és újratöltés")}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Workspace Panels */}
        <div className="min-w-0">

          {/* TAB 1: User Profile Settings */}
          {activeSubTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass max-w-2xl">
              <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                <User className="h-4.5 w-4.5 text-indigo-500" /> {t("Personal Information", "Osobné Údaje", "Személyes adatok")}
              </h3>

              {!canChangeAccount && (
                <p className="type-meta text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2" data-testid="personal-account-locked">
                  {getTranslation(systemLanguage, "personal.account_locked")}
                </p>
              )}

              <div className="space-y-1.5">
                <label className="type-overline text-slate-600">{t("Display Name", "Meno a priezvisko", "Megjelenítendő név")}</label>
                <input
                  type="text"
                  required
                  value={name}
                  readOnly={!canChangeAccount}
                  aria-readonly={!canChangeAccount}
                  data-testid="personal-name"
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl ${canChangeAccount ? "bg-white" : "bg-slate-50 text-slate-500 cursor-not-allowed"} border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="type-overline text-slate-600">{t("Email Address", "E-mailová adresa", "E-mail cím")}</label>
                <input
                  type="email"
                  required
                  value={email}
                  readOnly={!canChangeAccount}
                  aria-readonly={!canChangeAccount}
                  data-testid="personal-email"
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl ${canChangeAccount ? "bg-white" : "bg-slate-50 text-slate-500 cursor-not-allowed"} border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="type-overline text-slate-600">{t("New Password", "Nové heslo", "Új jelszó")}</label>
                <PasswordInput
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-ui text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <PasskeySettings systemLanguage={activeLang} />

              <div className="space-y-1.5">
                <label className="type-overline text-slate-600">{t("Display Language", "Jazyk rozhrania", "Megjelenítési nyelv")}</label>
                <CustomSelect
                  value={userLanguage}
                  onChange={(v) => setUserLanguage(v as Language)}
                  options={[
                    { value: "sk", label: "🇸🇰 Slovenčina" },
                    { value: "en", label: "🇬🇧 English" },
                    { value: "hu", label: "🇭🇺 Magyar" },
                  ]}
                />
              </div>

              <ThemeSettings
                systemLanguage={activeLang}
                userTheme={userTheme}
                setUserTheme={setUserTheme}
                themeMode={themeMode}
                setThemeMode={setThemeMode}
                appearance={appearance}
              />

              <ViewSizeSettings systemLanguage={activeLang} />

              <SidebarSettings systemLanguage={activeLang} />

              {/* Notification Settings */}
              <div className="space-y-2 border-t border-slate-200/80 pt-4">
                <div className="flex items-center justify-between">
                  <label className="type-overline text-slate-600 flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-indigo-500" />
                    {t("Desktop & Push Notifications", "Upozornenia na ploche", "Asztali értesítések")}
                  </label>
                  <span className={`px-2.5 py-0.5 rounded-lg type-overline ${
                    notifPermission === "granted"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : notifPermission === "denied"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    {notifPermission === "granted"
                      ? t("Active / Allowed", "Aktívne / Povolené", "Aktív / Engedélyezve")
                      : notifPermission === "denied"
                      ? t("Blocked by browser", "Zablokované prehliadačom", "Letiltva a böngészőben")
                      : t("Not enabled", "Nepovolené", "Nincs engedélyezve")}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3">
                  <p className="text-ui text-slate-600 leading-relaxed max-w-md font-medium">
                    {t(
                      "Get alerted with an audio chime and desktop notification when a new task is assigned to you or completed.",
                      "Získajte okamžité zvukové a obrazové upozornenie pri priradení novej úlohy alebo jej dokončení.",
                      "Azonnali hang- és asztali értesítést kap, ha feladatot rendelnek Önhöz vagy befejeznek."
                    )}
                  </p>
                  <div className="shrink-0 flex items-center gap-2">
                    {notifPermission !== "granted" ? (
                      <button
                        type="button"
                        onClick={handleEnableNotifications}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-ui font-bold text-white shadow-md shadow-indigo-600/20 active:scale-95 transition flex items-center gap-2 cursor-pointer"
                      >
                        <Bell className="h-4 w-4" />
                        <span>{t("Enable Notifications", "Zapnúť upozornenia", "Értesítések bekapcsolása")}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleTestNotification}
                        className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-ui font-bold text-slate-700 shadow-2xs active:scale-95 transition flex items-center gap-2 cursor-pointer"
                      >
                        <Volume2 className="h-4 w-4 text-indigo-600" />
                        <span>{t("Test Alert", "Otestovať zvuk a hlásenie", "Riasztás tesztelése")}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <PwaInstallCard systemLanguage={activeLang} userKey={currentUser.email || currentUser.name || "anon"} />

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-ui font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {t("Save Changes", "Uložiť zmeny", "Változások mentése")}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Email Server Config */}
          {activeSubTab === "email" && (
            <div className="grid grid-cols-1 ws-xl:grid-cols-12 gap-8 max-w-5xl">
              {emailSettings.isValidated === true ? (
                <div className="ws-xl:col-span-8 glass-panel p-6 rounded-3xl space-y-6 border-2 border-emerald-500 bg-emerald-50 shadow-glass flex flex-col justify-between text-left animate-fade-in">
                  <div>
                    <h3 className="text-body font-heading font-bold text-emerald-950 flex items-center gap-2 border-b-2 border-emerald-300 pb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 animate-bounce" />
                      {t("Email Integration Active", "E-mailová Integrácia Aktívna", "E-mail integráció aktív")}
                    </h3>

                    <div className="mt-4 space-y-4">
                      <p className="text-ui text-slate-700 font-medium">
                        {t(
                          "Your email server credentials have been successfully validated. A pink envelope navigation shortcut is now active in your sidebar.",
                          "Váš mailový účet je správne prepojený a overený. V ľavom menu sa zobrazuje ružová ikona obálky pre prístup k schránke.",
                          "Az e-mail szerver hitelesítő adatai sikeresen ellenőrizve. Egy rózsaszín boríték ikon mostantól aktív az oldalsávban a postafiók eléréséhez."
                        )}
                      </p>

                      <div className="bg-white/80 border border-emerald-200 rounded-2xl p-4 space-y-2.5 text-ui text-slate-700 shadow-sm">
                        <div>
                          <span className="type-overline text-slate-400 block">{t("Service Provider / Protocol", "Poskytovateľ služby / Protokol", "Szolgáltató / Protokoll")}</span>
                          <span className="font-bold uppercase text-emerald-950 font-heading">{emailSettings.provider === 'exchange' ? 'Microsoft Exchange' : t("IMAP / SMTP Server", "IMAP / SMTP server", "IMAP / SMTP szerver")}</span>
                        </div>
                        {emailSettings.provider === 'smtp' ? (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="type-overline text-slate-400 block">{t("IMAP Incoming Server", "Prichádzajúci server IMAP", "IMAP bejövő szerver")}</span>
                                <span className="font-mono font-bold text-slate-800">{emailSettings.imapHost}:{emailSettings.imapPort} ({emailSettings.imapSecure})</span>
                              </div>
                              <div>
                                <span className="type-overline text-slate-400 block">{t("IMAP Username", "Používateľské meno IMAP", "IMAP felhasználónév")}</span>
                                <span className="font-bold text-slate-800">{emailSettings.imapUsername}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="type-overline text-slate-400 block">{t("SMTP Outgoing Server", "Odchádzajúci server SMTP", "SMTP kimenő szerver")}</span>
                                <span className="font-mono font-bold text-slate-800">{emailSettings.smtpHost}:{emailSettings.smtpPort} ({emailSettings.smtpSecure})</span>
                              </div>
                              <div>
                                <span className="type-overline text-slate-400 block">{t("SMTP Username", "Používateľské meno SMTP", "SMTP felhasználónév")}</span>
                                <span className="font-bold text-slate-800">{emailSettings.smtpUsername}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="type-overline text-slate-400 block">{t("Exchange Endpoint URL", "URL koncového bodu Exchange", "Exchange végpont URL")}</span>
                              <span className="font-mono font-bold text-slate-800 break-all">{emailSettings.exchangeUrl || t("Office365 default", "Predvolené Office365", "Office365 alapértelmezett")}</span>
                            </div>
                            <div>
                              <span className="type-overline text-slate-400 block">{t("Username", "Používateľské meno", "Felhasználónév")}</span>
                              <span className="font-bold text-slate-800">{emailSettings.username}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-emerald-100">
                    <button
                      type="button"
                      onClick={() => {
                        const resetSettings = normalizeEmailSettings({ ...emailSettings, isValidated: false });
                        setEmailSettings(resetSettings);
                        loadedEmailSigRef.current = JSON.stringify(resetSettings);
                        setUsers((prev: any) => prev.map((u: any) => {
                          if (u.email === currentUser.email) {
                            let meta = {};
                            try {
                              if (u.metadata_json) {
                                meta = typeof u.metadata_json === 'string'
                                  ? JSON.parse(u.metadata_json)
                                  : u.metadata_json;
                              }
                            } catch (e) {}
                            const updated = {
                              ...u,
                              metadata_json: JSON.stringify({
                                ...meta,
                                emailSettings: resetSettings
                              })
                            };
                            sessionStorage.setItem("crm_current_user_rbac", JSON.stringify(updated));
                            return updated;
                          }
                          return u;
                        }));
                        setTestResult(null);
                        setTimeout(() => onSync(), 100);
                      }}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-ui font-semibold text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
                    >
                      {t("Reset Server Settings", "Resetovať nastavenia", "Szerverbeállítások visszaállítása")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSaveEmailSettings} className="ws-xl:col-span-8 glass-panel p-6 rounded-3xl space-y-5 border border-white/60 bg-white/95 shadow-glass">
                    <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200 pb-3">
                      <Mail className="h-4.5 w-4.5 text-pink-500" /> {t("Mail Server Integration", "Konfigurácia Mailového Servera", "Levelezőszerver integráció")}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="type-overline text-slate-400">{t("Integration Service", "Protokol / Služba", "Integrációs szolgáltatás")}</label>
                        <CustomSelect
                          value={emailSettings.provider}
                          onChange={(v) => setEmailSettings((prev: any) => ({ ...prev, provider: v }))}
                          options={[
                            { value: "smtp", label: t("IMAP / SMTP Server", "IMAP / SMTP server", "IMAP / SMTP szerver") },
                            { value: "exchange", label: "MS Exchange" },
                          ]}
                        />
                      </div>
                      {emailSettings.provider === "exchange" && (
                        <div className="space-y-1">
                          <label className="type-overline text-slate-400">{t("Username / Login Address", "E-mail používateľa", "Felhasználónév / Bejelentkezési cím")}</label>
                          <input
                            type="email"
                            required
                            value={emailSettings.username}
                            onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, username: e.target.value }))}
                            placeholder={t("e.g. user@domain.sk", "napr. user@domain.sk", "pl. user@domain.sk")}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none focus:bg-white"
                          />
                        </div>
                      )}
                    </div>

                    {emailSettings.provider === "smtp" ? (
                      <>
                        {/* IMAP Config Panel */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <span className="type-overline text-pink-600 block">
                            {t("1. Incoming Mail Configuration (IMAP)", "1. Nastavenia prichádzajúcej pošty (IMAP)", "1. Bejövő levelezés beállítása (IMAP)")}
                          </span>
                          <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("IMAP Server Host", "Hostiteľ servera IMAP", "IMAP szerver hoszt")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapHost}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapHost: e.target.value }))}
                                placeholder="imap.domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("IMAP Port", "Port IMAP", "IMAP port")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapPort}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapPort: e.target.value }))}
                                placeholder="993"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("Connection Security", "Zabezpečenie pripojenia", "Kapcsolat biztonsága")}</label>
                              <CustomSelect
                                value={emailSettings.imapSecure}
                                onChange={(v) => setEmailSettings((prev: any) => ({ ...prev, imapSecure: v }))}
                                options={[
                                  { value: "ssl", label: t("SSL / TLS (Secure)", "SSL / TLS (Zabezpečené)", "SSL / TLS (Biztonságos)") },
                                  { value: "tls", label: "STARTTLS" },
                                  { value: "none", label: t("None / Unencrypted", "Žiadne / Nešifrované", "Nincs / Titkosítatlan") },
                                ]}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("IMAP Username", "Používateľské meno IMAP", "IMAP felhasználónév")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapUsername}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapUsername: e.target.value }))}
                                placeholder="imap-login@domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("IMAP Password", "Heslo IMAP", "IMAP jelszó")}</label>
                              <SecretInput
                                required
                                mono={false}
                                language={activeLang}
                                value={emailSettings.imapPassword}
                                onChange={(next) => setEmailSettings((prev: any) => ({ ...prev, imapPassword: next }))}
                                placeholder={t("IMAP password", "Heslo IMAP", "IMAP jelszó")}
                                inputClassName="py-2"
                              />
                            </div>
                          </div>
                        </div>

                        {/* SMTP Config Panel */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <span className="type-overline text-pink-600 block">
                            {t("2. Outgoing Mail Configuration (SMTP)", "2. Nastavenia odchádzajúcej pošty (SMTP)", "2. Kimenő levelezés beállítása (SMTP)")}
                          </span>
                          <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("SMTP Server Host", "Hostiteľ servera SMTP", "SMTP szerver hoszt")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpHost}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpHost: e.target.value }))}
                                placeholder="smtp.domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("SMTP Port", "Port SMTP", "SMTP port")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpPort}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpPort: e.target.value }))}
                                placeholder="465"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("Connection Security", "Zabezpečenie pripojenia", "Kapcsolat biztonsága")}</label>
                              <CustomSelect
                                value={emailSettings.smtpSecure}
                                onChange={(v) => setEmailSettings((prev: any) => ({ ...prev, smtpSecure: v }))}
                                options={[
                                  { value: "ssl", label: t("SSL / TLS (Secure)", "SSL / TLS (Zabezpečené)", "SSL / TLS (Biztonságos)") },
                                  { value: "tls", label: "STARTTLS" },
                                  { value: "none", label: t("None / Unencrypted", "Žiadne / Nešifrované", "Nincs / Titkosítatlan") },
                                ]}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("SMTP Username", "Používateľské meno SMTP", "SMTP felhasználónév")}</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpUsername}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpUsername: e.target.value }))}
                                placeholder="smtp-login@domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="type-overline text-slate-400">{t("SMTP Password", "Heslo SMTP", "SMTP jelszó")}</label>
                              <SecretInput
                                required
                                mono={false}
                                language={activeLang}
                                value={emailSettings.smtpPassword}
                                onChange={(next) => setEmailSettings((prev: any) => ({ ...prev, smtpPassword: next }))}
                                placeholder={t("SMTP password", "Heslo SMTP", "SMTP jelszó")}
                                inputClassName="py-2"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="border-t border-slate-100 pt-3 space-y-3">
                        <span className="type-overline text-indigo-600 block">{t("Microsoft Exchange Settings", "Nastavenia Microsoft Exchange", "Microsoft Exchange beállítások")}</span>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="type-overline text-slate-400">{t("Exchange Server URL", "URL servera Exchange", "Exchange szerver URL")}</label>
                            <input
                              type="text"
                              value={emailSettings.exchangeUrl}
                              onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, exchangeUrl: e.target.value }))}
                              placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="type-overline text-slate-400">{t("AD Domain (optional)", "Doména AD (voliteľné)", "AD tartomány (opcionális)")}</label>
                            <input
                              type="text"
                              value={emailSettings.exchangeDomain}
                              onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, exchangeDomain: e.target.value }))}
                              placeholder="INTERNAL"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-ui text-slate-800 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {emailSettings.provider === "exchange" && (
                      <div className="space-y-1 border-t border-slate-100 pt-3">
                        <label className="type-overline text-slate-400">{t("Account Password", "Heslo k účtu / App Password", "Fiók jelszava")}</label>
                        <SecretInput
                          required
                          mono={false}
                          language={activeLang}
                          value={emailSettings.password}
                          onChange={(next) => setEmailSettings((prev: any) => ({ ...prev, password: next }))}
                          placeholder={t("Account or app password", "Heslo k účtu alebo App Password", "Fiók- vagy alkalmazásjelszó")}
                          inputClassName="py-2"
                        />
                      </div>
                    )}

                    {/* Validation outcome */}
                    {testResult && (
                      <div className={`p-4 rounded-2xl flex items-start gap-3 border ${
                        testResult.status === "success"
                          ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                          : "bg-rose-50/60 border-rose-200 text-rose-900"
                      }`}>
                        {testResult.status === "success" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <p className="text-caption font-semibold">{testResult.message}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="px-4.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 hover:border-slate-800 hover:text-slate-950 type-overline flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        {isTesting ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {t("Test Connection", "Otestovať pripojenie", "Kapcsolat tesztelése")}
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-ui font-semibold text-white shadow-lg shadow-pink-600/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Save className="h-4 w-4" /> {t("Save Integration", "Uložiť integráciu", "Integráció mentése")}
                      </button>
                    </div>
                  </form>

                  {/* MS Exchange and settings tips sidebar */}
                  <div className="ws-xl:col-span-4 space-y-4">
                    <div className="glass-panel p-5 rounded-3xl bg-slate-50 border border-slate-200/60 space-y-3.5">
                      <h4 className="type-overline text-slate-500 pb-2 border-b border-slate-200">
                        {t("Microsoft Exchange Instructions", "Pokyny pre Microsoft Exchange", "Microsoft Exchange útmutató")}
                      </h4>
                      <ul className="text-micro leading-relaxed text-slate-600 space-y-2.5 font-medium list-disc pl-4.5">
                        <li>
                          <strong className="text-slate-800">{t("Server Endpoints:", "Koncové body servera:", "Szerver végpontok:")}</strong> {t("Autodiscovery URL is recommended, e.g.,", "Odporúča sa adresa URL automatického zisťovania, napr.,", "Az automatikus felderítési URL ajánlott, pl.,")} <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-micro">https://outlook.office365.com/EWS/Exchange.asmx</code>.
                        </li>
                        <li>
                          <strong className="text-slate-800">{t("OAuth Requirements:", "Požiadavky OAuth:", "OAuth követelmények:")}</strong> {t("Multi-factor authentication accounts must generate a specific", "Účty s viacfaktorovým overením musia vygenerovať osobitné", "A többtényezős hitelesítést használó fiókoknak külön kell létrehozniuk egy")} <strong className="text-slate-800">App Password</strong> {t("inside Azure / Microsoft security preferences.", "v nastaveniach zabezpečenia Azure / Microsoft.", "jelszót az Azure / Microsoft biztonsági beállításaiban.")}
                        </li>
                        <li>
                          <strong className="text-slate-800">{t("IMAP protocol status:", "Stav protokolu IMAP:", "IMAP protokoll állapota:")}</strong> {t("Ensure IMAP/SMTP connectivity is enabled for the mailbox under Microsoft Admin center policies.", "Uistite sa, že je pre schránku povolené pripojenie IMAP/SMTP v zásadách centra Microsoft Admin.", "Győződjön meg róla, hogy az IMAP/SMTP kapcsolat engedélyezve van a postafiókhoz a Microsoft Admin központ házirendjeiben.")}
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: MCP (Model Context Protocol) AI Integration */}
          {activeSubTab === "mcp" && <McpAssistantSettings currentUser={currentUser} activeLang={activeLang} />}

          {/* TAB 4: Error Logs Exception Tracking */}
          {activeSubTab === "errors" && (
            <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass">

              {/* Toggle Error Sidebar */}
              <div className="flex items-center justify-between p-4.5 bg-slate-50 border border-slate-200/60 rounded-2xl">
                <div className="flex flex-col gap-0.5">
                  <span className="text-ui font-bold text-slate-900">{t("Error Sidebar Panel", "Panel chýb na boku", "Hiba oldalsáv panel")}</span>
                  <span className="text-micro text-slate-500 font-medium">
                    {t(
                      "Show quick access to background error logs in the main sidebar",
                      "Zobraziť rýchly prístup k chybám na hlavnom bočnom paneli",
                      "Gyors hozzáférés megjelenítése a háttérhiba-naplókhoz a fő oldalsávban"
                    )}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={errorSidebarEnabled}
                    onChange={(e) => {
                      setErrorSidebarEnabled(e.target.checked);
                      if (typeof (window as any).showToast === "function") {
                        (window as any).showToast(e.target.checked
                          ? t("Error sidebar enabled!", "Panel chýb zapnutý!", "Hiba oldalsáv bekapcsolva!")
                          : t("Error sidebar disabled!", "Panel chýb vypnutý!", "Hiba oldalsáv kikapcsolva!")
                        );
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2">
                  <AlertOctagon className="h-4.5 w-4.5 text-red-500 animate-pulse" /> {t("System Errors & Exceptions", "Systémové chyby a výnimky", "Rendszerhibák és kivételek")}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={fetchErrorLogs}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl type-overline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> {t("Refresh", "Obnoviť", "Frissítés")}
                  </button>
                  <HoldToConfirmButton
                      tone="danger"
                      lang={asLang(activeLang)}
                      what={t("error logs", "chybové záznamy", "hibanaplók")}
                      onConfirm={clearErrorLogs}
                      className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl type-overline flex items-center gap-1"
                  >
                    {t("Clear Logs", "Vymazať záznamy", "Naplók törlése")}
                  </HoldToConfirmButton>
                </div>
              </div>

              {isLoadingLogs ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : errorLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-bold text-ui">
                  {t("No system errors found.", "Nenašli sa žiadne systémové chyby.", "Nem található rendszerhiba.")}
                </div>
              ) : (
                <div className="table-sticky-scroll">
                  <table className="w-full text-left text-ui border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-50">
                      <tr className="border-b border-slate-200 text-slate-500 type-overline">
                        <th className="sticky top-0 z-10 bg-slate-50 py-3 px-4">{t("Timestamp", "Čas", "Időbélyeg")}</th>
                        <th className="sticky top-0 z-10 bg-slate-50 py-3 px-4">{t("Method", "Metóda", "Metódus")}</th>
                        <th className="sticky top-0 z-10 bg-slate-50 py-3 px-4">URI</th>
                        <th className="sticky top-0 z-10 bg-slate-50 py-3 px-4">{t("Message", "Chyba", "Üzenet")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorLogs.map((log: any) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="border-b border-slate-100 hover:bg-red-50/40 transition-all cursor-pointer font-medium text-slate-700"
                        >
                          <td className="py-3 px-4 font-mono text-micro whitespace-nowrap text-slate-500">
                            {log.created_at}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-md type-overline ${
                              log.request_method === 'POST'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-50 text-slate-700'
                            }`}>
                              {log.request_method}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-micro text-slate-600 truncate max-w-xs">
                            {log.request_uri}
                          </td>
                          <td className="py-3 px-4 font-bold text-red-600 truncate max-w-sm">
                            {log.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Exception Detail Popup Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] text-left">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-red-600">
                <AlertOctagon className="h-5 w-5 shrink-0" />
                <h3 className="font-heading font-extrabold text-slate-900 text-ui">
                  {t("Exception / Error Details", "Detail výnimky / chyby", "Kivétel / hiba részletei")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-bold text-body"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 font-medium text-slate-700 text-ui">
              <div className="grid grid-cols-1 ws-md:grid-cols-3 gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="type-overline text-slate-400 block">{t("Date & Time", "Dátum a čas", "Dátum és idő")}</span>
                  <span className="font-mono text-micro text-slate-700 font-bold">{selectedLog.created_at}</span>
                </div>
                <div>
                  <span className="type-overline text-slate-400 block">{t("Method & URI", "Metóda & URI", "Metódus és URI")}</span>
                  <span className="font-mono text-micro text-slate-700 font-bold">{selectedLog.request_method} {selectedLog.request_uri}</span>
                </div>
                <div>
                  <span className="type-overline text-slate-400 block">{t("File & Line", "Súbor a riadok", "Fájl és sor")}</span>
                  <span className="font-mono text-micro text-slate-700 font-bold">{selectedLog.file ? `${selectedLog.file.split('/').pop()}:${selectedLog.line}` : 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="type-overline text-slate-400 block">{t("Error Message", "Chybová správa", "Hibaüzenet")}</span>
                <div className="p-3 bg-red-50 text-red-800 rounded-xl font-mono text-caption font-bold border border-red-100 whitespace-pre-wrap leading-relaxed">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.file && (
                <div className="space-y-1">
                  <span className="type-overline text-slate-400 block">{t("Full File Path", "Úplná cesta k súboru", "Teljes fájlútvonal")}</span>
                  <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl font-mono text-micro border border-slate-100">
                    {selectedLog.file} ({t("Line", "Riadok", "Sor")} {selectedLog.line})
                  </div>
                </div>
              )}

              {selectedLog.trace && (
                <div className="space-y-1">
                  <span className="type-overline text-slate-400 block">{t("Stack Trace", "Zásobník volaní", "Hívási verem")}</span>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-micro overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 max-h-64">
                    {selectedLog.trace}
                  </pre>
                </div>
              )}

              {selectedLog.payload && (
                <div className="space-y-1">
                  <span className="type-overline text-slate-400 block">{t("Request Payload", "Telo požiadavky", "Kérés tartalma")}</span>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-micro overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 max-h-48">
                    {selectedLog.payload}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
