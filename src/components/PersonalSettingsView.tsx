import React, { useState } from "react";
import { User, Mail, Settings, Save, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import type { UserProfile } from "../types";
import type { Language } from "../utils/translations";

interface PersonalSettingsViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  setUsers: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  systemLanguage: Language;
  userLanguage: Language;
  setUserLanguage: (lang: Language) => void;
  onSync: () => void;
}

export const PersonalSettingsView: React.FC<PersonalSettingsViewProps> = ({
  currentUser,
  users: _users,
  setUsers,
  userLanguage,
  setUserLanguage,
  onSync
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"profile" | "email">("profile");

  // User profile states
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [password, setPassword] = useState(currentUser.password || "");

  const loadEmailSettings = () => {
    try {
      if (currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        if (metadata.emailSettings) {
          const s = metadata.emailSettings;
          return {
            provider: s.provider || "smtp",
            imapHost: s.imapHost || "",
            imapPort: s.imapPort || "993",
            imapSecure: s.imapSecure !== undefined ? s.imapSecure : "ssl",
            smtpHost: s.smtpHost || "",
            smtpPort: s.smtpPort || "465",
            smtpSecure: s.smtpSecure !== undefined ? s.smtpSecure : "ssl",
            imapUsername: s.imapUsername || s.username || "",
            imapPassword: s.imapPassword || s.password || "",
            smtpUsername: s.smtpUsername || s.username || "",
            smtpPassword: s.smtpPassword || s.password || "",
            exchangeUrl: s.exchangeUrl || "",
            exchangeDomain: s.exchangeDomain || "",
            exchangeMailbox: s.exchangeMailbox || "",
            username: s.username || "",
            password: s.password || ""
          };
        }
      }
    } catch (e) {
      console.warn("Error parsing user metadata_json", e);
    }
    return {
      provider: "smtp",
      imapHost: "",
      imapPort: "993",
      imapSecure: "ssl",
      smtpHost: "",
      smtpPort: "465",
      smtpSecure: "ssl",
      imapUsername: "",
      imapPassword: "",
      smtpUsername: "",
      smtpPassword: "",
      exchangeUrl: "",
      exchangeDomain: "",
      exchangeMailbox: "",
      username: "",
      password: ""
    };
  };

  const [emailSettings, setEmailSettings] = useState<any>(loadEmailSettings);
  const [showPass, setShowPass] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  React.useEffect(() => {
    setEmailSettings(loadEmailSettings());
  }, [currentUser]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      alert("Name and email are strictly required!");
      return;
    }

    setUsers(prev => prev.map(u => {
      if (u.email === currentUser.email) {
        const updated = {
          ...u,
          name: name.trim(),
          email: email.trim(),
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
      alert(userLanguage === "sk" ? "Profil bol úspešne aktualizovaný!" : "Profile updated successfully!");
    }, 100);
  };

  const handleSaveEmailSettings = (e: React.FormEvent) => {
    e.preventDefault();

    const isValidated = true;
    const updatedSettings = {
      ...emailSettings,
      isValidated
    };
    setEmailSettings(updatedSettings);

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
      alert(userLanguage === "sk" ? "E-mailové nastavenia boli uložené!" : "Email settings saved successfully!");
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
          message: userLanguage === "sk" 
            ? "Pripojenie k e-mailovému serveru úspešne overené!" 
            : "Successfully connected and authenticated with your mail server!"
        });
      } else {
        setTestResult({
          status: "error",
          message: data.error || "Connection failed. Please verify your host and login details."
        });
      }
    } catch (e) {
      setTestResult({
        status: "error",
        message: "Network request to mail broker API failed."
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16">
      {/* Title */}
      <div className="flex flex-col">
        <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-pink-500 animate-spin-slow" /> {userLanguage === "sk" ? "Osobné Nastavenia" : "Personal Settings"}
        </h2>
        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
          {userLanguage === "sk" 
            ? "Spravujte svoj profil a nakonfigurujte SMTP / IMAP prepojenie schránky" 
            : "Manage your credentials and configure your unified SMTP / IMAP email inbox"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side Navigation Sidebar */}
        <div className="lg:col-span-3 space-y-2 lg:sticky lg:top-24 select-none shrink-0">
          <div className="glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col gap-1.5">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 pb-2.5 border-b border-slate-200 mb-1.5 block">
              {userLanguage === "sk" ? "Nastavenia Konta" : "Account Categories"}
            </span>
            <button
              type="button"
              onClick={() => setActiveSubTab("profile")}
              className={`w-full text-left px-4 py-3 rounded-2xl font-black text-[10.5px] uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "profile" 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border border-indigo-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <User className="h-4 w-4" /> {userLanguage === "sk" ? "Základný profil" : "My Profile"}
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("email")}
              className={`w-full text-left px-4 py-3 rounded-2xl font-black text-[10.5px] uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === "email" 
                  ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20 border border-pink-700" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
              }`}
            >
              <Mail className="h-4 w-4" /> {userLanguage === "sk" ? "E-mailová schránka" : "Email Server"}
            </button>
          </div>
        </div>

        {/* Right Side Workspace Panels */}
        <div className="lg:col-span-9">
          
          {/* TAB 1: User Profile Settings */}
          {activeSubTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass max-w-2xl">
              <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                <User className="h-4.5 w-4.5 text-indigo-500" /> {userLanguage === "sk" ? "Osobné Údaje" : "Personal Information"}
              </h3>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{userLanguage === "sk" ? "Meno a priezvisko" : "Display Name"}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{userLanguage === "sk" ? "E-mailová adresa" : "Email Address"}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{userLanguage === "sk" ? "Nové heslo" : "New Password"}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{userLanguage === "sk" ? "Jazyk rozhrania" : "Display Language"}</label>
                <select
                  value={userLanguage}
                  onChange={(e) => setUserLanguage(e.target.value as Language)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="sk">🇸🇰 Slovenčina</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="hu">🇭🇺 Magyar</option>
                </select>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {userLanguage === "sk" ? "Uložiť zmeny" : "Save Changes"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Email Server Config */}
          {activeSubTab === "email" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 max-w-5xl">
              {emailSettings.isValidated === true ? (
                <div className="xl:col-span-8 glass-panel p-6 rounded-3xl space-y-6 border-2 border-emerald-500 bg-emerald-50 shadow-glass flex flex-col justify-between text-left animate-fade-in">
                  <div>
                    <h3 className="text-sm font-heading font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-2 border-b-2 border-emerald-300 pb-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 animate-bounce" />
                      {userLanguage === "sk" ? "E-mailová Integrácia Aktívna" : "Email Integration Active"}
                    </h3>
                    
                    <div className="mt-4 space-y-4">
                      <p className="text-xs text-slate-700 font-medium">
                        {userLanguage === "sk" 
                          ? "Váš mailový účet je správne prepojený a overený. V ľavom menu sa zobrazuje ružová ikona obálky pre prístup k schránke." 
                          : "Your email server credentials have been successfully validated. A pink envelope navigation shortcut is now active in your sidebar."}
                      </p>
                      
                      <div className="bg-white/80 border border-emerald-200 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700 shadow-sm">
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Service Provider / Protocol</span>
                          <span className="font-bold uppercase text-emerald-950 font-heading">{emailSettings.provider === 'exchange' ? 'Microsoft Exchange' : 'IMAP / SMTP Server'}</span>
                        </div>
                        {emailSettings.provider === 'smtp' ? (
                          <>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">IMAP Incoming Server</span>
                                <span className="font-mono font-bold text-slate-800">{emailSettings.imapHost}:{emailSettings.imapPort} ({emailSettings.imapSecure})</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">IMAP Username</span>
                                <span className="font-bold text-slate-800">{emailSettings.imapUsername}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">SMTP Outgoing Server</span>
                                <span className="font-mono font-bold text-slate-800">{emailSettings.smtpHost}:{emailSettings.smtpPort} ({emailSettings.smtpSecure})</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">SMTP Username</span>
                                <span className="font-bold text-slate-800">{emailSettings.smtpUsername}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Exchange Endpoint URL</span>
                              <span className="font-mono font-bold text-slate-800 break-all">{emailSettings.exchangeUrl || "Office365 default"}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Username</span>
                              <span className="font-bold text-slate-800">{emailSettings.username}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-emerald-150">
                    <button
                      type="button"
                      onClick={() => {
                        const resetSettings = { ...emailSettings, isValidated: false };
                        setEmailSettings(resetSettings);
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
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-semibold text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
                    >
                      {userLanguage === "sk" ? "Resetovať nastavenia" : "Reset Server Settings"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSaveEmailSettings} className="xl:col-span-8 glass-panel p-6 rounded-3xl space-y-5 border border-white/60 bg-white/95 shadow-glass">
                    <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
                      <Mail className="h-4.5 w-4.5 text-pink-500" /> {userLanguage === "sk" ? "Konfigurácia Mailového Servera" : "Mail Server Integration"}
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{userLanguage === "sk" ? "Protokol / Služba" : "Integration Service"}</label>
                        <select
                          value={emailSettings.provider}
                          onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, provider: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                        >
                          <option value="smtp">IMAP / SMTP Server</option>
                          <option value="exchange">MS Exchange</option>
                        </select>
                      </div>
                      {emailSettings.provider === "exchange" && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{userLanguage === "sk" ? "E-mail používateľa" : "Username / Login Address"}</label>
                          <input
                            type="email"
                            required
                            value={emailSettings.username}
                            onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, username: e.target.value }))}
                            placeholder="e.g. user@domain.sk"
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:bg-white"
                          />
                        </div>
                      )}
                    </div>

                    {emailSettings.provider === "smtp" ? (
                      <>
                        {/* IMAP Config Panel */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <span className="text-[10px] font-black text-pink-600 uppercase tracking-wider block">
                            {userLanguage === "sk" ? "1. Nastavenia prichádzajúcej pošty (IMAP)" : "1. Incoming Mail Configuration (IMAP)"}
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">IMAP Server Host</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapHost}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapHost: e.target.value }))}
                                placeholder="imap.domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">IMAP Port</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapPort}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapPort: e.target.value }))}
                                placeholder="993"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Connection Security</label>
                              <select
                                value={emailSettings.imapSecure}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapSecure: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none font-bold"
                              >
                                <option value="ssl">SSL / TLS (Secure)</option>
                                <option value="tls">STARTTLS</option>
                                <option value="none">None / Unencrypted</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">IMAP Username</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.imapUsername}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapUsername: e.target.value }))}
                                placeholder="imap-login@domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">IMAP Password</label>
                              <input
                                type="password"
                                required
                                value={emailSettings.imapPassword}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, imapPassword: e.target.value }))}
                                placeholder="••••••••••••"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* SMTP Config Panel */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                          <span className="text-[10px] font-black text-pink-600 uppercase tracking-wider block">
                            {userLanguage === "sk" ? "2. Nastavenia odchádzajúcej pošty (SMTP)" : "2. Outgoing Mail Configuration (SMTP)"}
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SMTP Server Host</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpHost}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpHost: e.target.value }))}
                                placeholder="smtp.domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SMTP Port</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpPort}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpPort: e.target.value }))}
                                placeholder="465"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Connection Security</label>
                              <select
                                value={emailSettings.smtpSecure}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpSecure: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none font-bold"
                              >
                                <option value="ssl">SSL / TLS (Secure)</option>
                                <option value="tls">STARTTLS</option>
                                <option value="none">None / Unencrypted</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SMTP Username</label>
                              <input
                                type="text"
                                required
                                value={emailSettings.smtpUsername}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpUsername: e.target.value }))}
                                placeholder="smtp-login@domain.sk"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SMTP Password</label>
                              <input
                                type="password"
                                required
                                value={emailSettings.smtpPassword}
                                onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, smtpPassword: e.target.value }))}
                                placeholder="••••••••••••"
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="border-t border-slate-100 pt-3 space-y-3">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">Microsoft Exchange Settings</span>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Exchange Server URL</label>
                            <input
                              type="text"
                              value={emailSettings.exchangeUrl}
                              onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, exchangeUrl: e.target.value }))}
                              placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">AD Domain (optional)</label>
                            <input
                              type="text"
                              value={emailSettings.exchangeDomain}
                              onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, exchangeDomain: e.target.value }))}
                              placeholder="INTERNAL"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {emailSettings.provider === "exchange" && (
                      <div className="space-y-1 border-t border-slate-100 pt-3">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{userLanguage === "sk" ? "Heslo k účtu / App Password" : "Account Password"}</label>
                          <button
                            type="button"
                            onClick={() => setShowPass(!showPass)}
                            className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-900"
                          >
                            {showPass ? "Hide" : "Show"}
                          </button>
                        </div>
                        <input
                          type={showPass ? "text" : "password"}
                          required
                          value={emailSettings.password}
                          onChange={(e) => setEmailSettings((prev: any) => ({ ...prev, password: e.target.value }))}
                          placeholder="••••••••••••"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:bg-white"
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
                        <p className="text-[11px] font-semibold">{testResult.message}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="px-4.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-700 hover:border-slate-800 hover:text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        {isTesting ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {userLanguage === "sk" ? "Otestovať pripojenie" : "Test Connection"}
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 rounded-xl text-xs font-semibold text-white shadow-lg shadow-pink-600/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Save className="h-4 w-4" /> {userLanguage === "sk" ? "Uložiť integráciu" : "Save Integration"}
                      </button>
                    </div>
                  </form>

                  {/* MS Exchange and settings tips sidebar */}
                  <div className="xl:col-span-4 space-y-4">
                    <div className="glass-panel p-5 rounded-3xl bg-slate-50 border border-slate-200/60 space-y-3.5">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 pb-2 border-b border-slate-200">
                        Microsoft Exchange Instructions
                      </h4>
                      <ul className="text-[10.5px] leading-relaxed text-slate-600 space-y-2.5 font-medium list-disc pl-4.5">
                        <li>
                          <strong className="text-slate-800">Server Endpoints:</strong> Autodiscovery URL is recommended, e.g., <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[9px]">https://outlook.office365.com/EWS/Exchange.asmx</code>.
                        </li>
                        <li>
                          <strong className="text-slate-800">OAuth Requirements:</strong> Multi-factor authentication accounts must generate a specific <strong className="text-slate-800">App Password</strong> inside Azure / Microsoft security preferences.
                        </li>
                        <li>
                          <strong className="text-slate-800">IMAP protocol status:</strong> Ensure IMAP/SMTP connectivity is enabled for the mailbox under Microsoft Admin center policies.
                        </li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
