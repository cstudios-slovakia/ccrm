import React, { useState, useEffect } from "react";
import {
  LogIn,
  Key,
  Mail,
  Terminal,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  ShieldCheck,
  Zap,
  Activity,
  RefreshCw
} from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import type { UserProfile } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import LightRays from "./LightRays";
import { FeralSkyGradient } from "./FeralSkyGradient";
import { hasCookieAccess, hasPersistentStorage } from "../utils/safeStorage";
import {
  getCurrentLoginTheme,
  formatLocalizedClock,
  formatLocalizedDate,
  type TimePhaseId,
  LOGIN_PHASES
} from "../utils/loginTheme";

interface LoginViewProps {
  users: UserProfile[];
  onLoginSuccess: (user: UserProfile) => void;
  systemName: string;
  systemLanguage: Language;
  isDemoMode: boolean;
  isModal?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  users,
  onLoginSuccess,
  systemName,
  systemLanguage,
  isDemoMode,
  isModal
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showResetInfo, setShowResetInfo] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Time-of-day adaptive engine state
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [previewPhase, setPreviewPhase] = useState<TimePhaseId | null>(null);

  // Update real-time clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeTheme = getCurrentLoginTheme(currentTime, previewPhase || undefined);
  const clock = formatLocalizedClock(currentTime);
  const dateStr = formatLocalizedDate(currentTime, systemLanguage);

  // Probed once on mount rather than on every render
  const [browserStorageBlocked] = useState(
    () => !hasCookieAccess() || !hasPersistentStorage("localStorage") || !hasPersistentStorage("sessionStorage")
  );

  // --- Password reset (email-based, only when a mail server is configured) ---
  const [resetAvailable, setResetAvailable] = useState<boolean | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetToken, setResetToken] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const tr = (en: string, sk: string, hu: string) =>
    systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Discover whether email-based reset is possible, and pick up a reset token
  // from the link the user followed (e.g. /?reset_token=...).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/password_reset.php?action=status")
      .then(r => r.json())
      .then(d => { if (!cancelled) setResetAvailable(!!(d && d.available)); })
      .catch(() => { if (!cancelled) setResetAvailable(false); });
    try {
      const token = new URLSearchParams(window.location.search).get("reset_token");
      if (token) {
        setResetToken(token);
        setShowResetInfo(true);
      }
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, []);

  const requestPasswordReset = async () => {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError(null);
    try {
      const res = await fetch("/api/password_reset.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email: resetEmail.trim(), lang: systemLanguage })
      });
      const data = await res.json().catch(() => null);
      if (data && data.available === false) {
        setResetAvailable(false);
      } else {
        setResetRequested(true);
      }
    } catch {
      // Still show the generic confirmation — we never reveal delivery state.
      setResetRequested(true);
    } finally {
      setResetLoading(false);
    }
  };

  const submitNewPassword = async () => {
    setResetError(null);
    if (newPassword.length < 8) {
      setResetError(tr("Password must be at least 8 characters.", "Heslo musí mať aspoň 8 znakov.", "A jelszónak legalább 8 karakter hosszúnak kell lennie."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(tr("Passwords do not match.", "Heslá sa nezhodujú.", "A jelszavak nem egyeznek."));
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch("/api/password_reset.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", token: resetToken, password: newPassword })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success) {
        setResetDone(true);
        // Drop the token from the URL so a refresh returns to normal login.
        try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
      } else {
        setResetError((data && data.message) || tr("This reset link is invalid or has expired.", "Tento odkaz na obnovenie je neplatný alebo vypršal.", "Ez a visszaállítási link érvénytelen vagy lejárt."));
      }
    } catch {
      setResetError(tr("Network error. Please try again.", "Chyba siete. Skúste to znova.", "Hálózati hiba. Próbálja újra."));
    } finally {
      setResetLoading(false);
    }
  };

  // Verify credentials server-side. Passwords are never sent to or compared in
  // the browser; api/login.php checks the bcrypt hash and opens a session.
  const authenticate = async (loginEmail: string, loginPassword: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword, remember: rememberMe })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success && data.user) {
        onLoginSuccess(data.user as UserProfile);
        return;
      }
      setError(getTranslation(systemLanguage, "login.error_pass"));
    } catch (err) {
      setError(getTranslation(systemLanguage, "login.error_pass"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    authenticate(email, password);
  };

  const handleQuickLogin = (user: UserProfile) => {
    setEmail(user.email);
    setPassword("password");
    authenticate(user.email, "password");
  };

  const renderPhaseIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case "sunrise":
        return <Sunrise className={className} />;
      case "sun":
        return <Sun className={className} />;
      case "sunset":
        return <Sunset className={className} />;
      case "moon":
      default:
        return <Moon className={className} />;
    }
  };

  const phaseBadgeText = activeTheme.badge[systemLanguage] || activeTheme.badge.en;
  const phaseGreetingText = activeTheme.greeting[systemLanguage] || activeTheme.greeting.en;
  const phaseSubtitleText = activeTheme.subtitle[systemLanguage] || activeTheme.subtitle.en;
  const phaseQuoteText = activeTheme.quote[systemLanguage] || activeTheme.quote.en;

  return (
    <div
      className={
        isModal
          ? "w-full flex items-center justify-center bg-white border border-slate-200/50 rounded-[32px] shadow-2xl p-6 md:p-12 relative overflow-hidden select-none font-sans"
          : `min-h-screen w-full flex items-center justify-center lg:justify-end p-6 md:p-12 lg:pr-24 xl:pr-32 relative overflow-hidden select-none font-sans transition-all duration-700 ${activeTheme.bgClass}`
      }
      style={{
        background: isModal ? undefined : activeTheme.backgroundGradient
      }}
    >
      {/* Custom Keyframe Animations for Floating Aurora Glow Blobs */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes float-blob-1 {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(60px, -60px) scale(1.08); }
          66% { transform: translate(-40px, 50px) scale(0.95); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-blob-2 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-70px, 40px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-blob-3 {
          0% { transform: translate(0px, 0px) scale(1); }
          40% { transform: translate(80px, -40px) scale(1.06); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .aurora-blob-1 { animation: float-blob-1 16s infinite ease-in-out; }
        .aurora-blob-2 { animation: float-blob-2 19s infinite ease-in-out; }
        .aurora-blob-3 { animation: float-blob-3 17s infinite ease-in-out; }
      `
        }}
      />

      {/* Dynamic Animated Background: FeralSkyGradient for Day, LightRays for Dawn/Sunset/Night */}
      {!isModal && (
        <>
          {activeTheme.id === "day" ? (
            <FeralSkyGradient />
          ) : (
            <>
              <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <LightRays
                  raysOrigin="left"
                  raysColor={activeTheme.raysColor}
                  raysSpeed={activeTheme.raysSpeed}
                  lightSpread={activeTheme.lightSpread}
                  rayLength={activeTheme.rayLength}
                  pulsating={activeTheme.pulsating ?? false}
                  fadeDistance={1.9}
                  saturation={1.1}
                  followMouse
                  mouseInfluence={0.08}
                  noiseAmount={0}
                  distortion={0}
                />
              </div>

              {/* Atmospheric Aurora Glowing Blobs */}
              <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden opacity-75">
                <div
                  className={`absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] aurora-blob-1 transition-colors duration-1000 ${activeTheme.blobColors.blob1}`}
                />
                <div
                  className={`absolute top-1/2 -left-20 w-80 h-80 rounded-full blur-[100px] aurora-blob-2 transition-colors duration-1000 ${activeTheme.blobColors.blob2}`}
                />
                <div
                  className={`absolute -bottom-32 left-1/4 w-[30rem] h-[30rem] rounded-full blur-[120px] aurora-blob-3 transition-colors duration-1000 ${activeTheme.blobColors.blob3}`}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* LEFT AREA: Atmospheric Executive Time-of-Day Hero Panel */}
      {!isModal && (
        <div className="flex-1 hidden lg:flex flex-col justify-between items-start relative z-10 pr-12 xl:pr-20 py-8 min-h-[580px] max-w-2xl animate-in fade-in duration-700 select-none">
          
          {/* Top Header: Time Phase Indicator Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-md shadow-lg transition-all duration-500 ${activeTheme.badgeClass}`}
            >
              <div className="relative flex items-center justify-center">
                {renderPhaseIcon(activeTheme.icon, "h-4 w-4 animate-pulse")}
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider">
                {phaseBadgeText}
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80" />
              <span className="text-[10px] font-mono font-bold opacity-75">
                {clock.hoursStr}:{clock.minutesStr}
              </span>
            </div>

            {previewPhase && (
              <button
                type="button"
                onClick={() => setPreviewPhase(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border transition-all active:scale-95 ${
                  activeTheme.isLight
                    ? "bg-white/70 hover:bg-white/90 text-slate-800 border-blue-200 shadow-sm"
                    : "bg-white/10 hover:bg-white/20 text-white/80 border-white/15"
                }`}
                title={tr("Reset to live time", "Vrátiť na reálny čas", "Visszaállítás a valós időre")}
              >
                <RefreshCw className="h-3 w-3" />
                <span>{tr("Live Mode", "Živý čas", "Valós idő")}</span>
              </button>
            )}
          </div>

          {/* Middle Body: Digital Clock & Executive Localized Greeting */}
          <div className="space-y-6 my-auto">
            {/* Live Digital Clock */}
            <div className="space-y-1">
              <div
                className={`flex items-baseline font-mono font-black tracking-tight ${
                  activeTheme.isLight ? "text-slate-900 drop-shadow-sm" : "text-white/95 drop-shadow-md"
                }`}
              >
                <span className="text-5xl xl:text-7xl">{clock.hoursStr}</span>
                <span
                  className={`text-4xl xl:text-6xl mx-1 animate-pulse ${
                    activeTheme.isLight ? "text-blue-600/70" : "text-white/40"
                  }`}
                >
                  :
                </span>
                <span className="text-5xl xl:text-7xl">{clock.minutesStr}</span>
                <span
                  className={`text-2xl xl:text-3xl ml-2 font-semibold ${
                    activeTheme.isLight ? "text-slate-600" : "text-white/45"
                  }`}
                >
                  .{clock.secondsStr}
                </span>
              </div>
              <p
                className={`text-xs xl:text-sm font-extrabold uppercase tracking-widest pl-1 ${
                  activeTheme.isLight ? "text-slate-700 drop-shadow-none" : "text-white/60 drop-shadow"
                }`}
              >
                {dateStr}
              </p>
            </div>

            {/* Dynamic Greeting & Brand Slogan */}
            <div className="space-y-2.5 max-w-lg">
              <h1
                className={`text-3xl xl:text-4xl font-heading font-black tracking-tight leading-tight ${
                  activeTheme.isLight ? "text-slate-900 drop-shadow-sm" : "text-white drop-shadow-md"
                }`}
              >
                {phaseGreetingText}
              </h1>
              <p className={`text-base xl:text-lg font-bold bg-gradient-to-r ${activeTheme.accentGradient} bg-clip-text text-transparent leading-snug`}>
                {phaseSubtitleText}
              </p>
              <p
                className={`text-xs xl:text-sm font-medium leading-relaxed ${
                  activeTheme.isLight ? "text-slate-700" : "text-white/65"
                }`}
              >
                {phaseQuoteText}
              </p>
            </div>

            {/* Enterprise Micro Telemetry Status Chips */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div
                className={`p-3 rounded-2xl border backdrop-blur-md space-y-1 transition-all ${
                  activeTheme.isLight
                    ? "bg-white/70 border-white/80 shadow-sm hover:bg-white/85"
                    : "bg-white/[0.06] border-white/10 hover:bg-white/[0.09]"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    activeTheme.isLight ? "text-emerald-700" : "text-emerald-400"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Gateway</span>
                </div>
                <div
                  className={`text-[11px] font-bold truncate ${
                    activeTheme.isLight ? "text-slate-900" : "text-white/90"
                  }`}
                >
                  Online · 99.99%
                </div>
              </div>

              <div
                className={`p-3 rounded-2xl border backdrop-blur-md space-y-1 transition-all ${
                  activeTheme.isLight
                    ? "bg-white/70 border-white/80 shadow-sm hover:bg-white/85"
                    : "bg-white/[0.06] border-white/10 hover:bg-white/[0.09]"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    activeTheme.isLight ? "text-amber-700" : "text-amber-400"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Engine</span>
                </div>
                <div
                  className={`text-[11px] font-bold truncate ${
                    activeTheme.isLight ? "text-slate-900" : "text-white/90"
                  }`}
                >
                  &lt; 1ms Core Sync
                </div>
              </div>

              <div
                className={`p-3 rounded-2xl border backdrop-blur-md space-y-1 transition-all ${
                  activeTheme.isLight
                    ? "bg-white/70 border-white/80 shadow-sm hover:bg-white/85"
                    : "bg-white/[0.06] border-white/10 hover:bg-white/[0.09]"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    activeTheme.isLight ? "text-sky-700" : "text-sky-400"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Security</span>
                </div>
                <div
                  className={`text-[11px] font-bold truncate ${
                    activeTheme.isLight ? "text-slate-900" : "text-white/90"
                  }`}
                >
                  TLS 1.3 · Vault
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Dock: Interactive Time Atmosphere Previewer */}
          <div className="pt-4 flex items-center gap-2 flex-wrap">
            <span
              className={`text-[9px] font-black uppercase tracking-widest mr-1 ${
                activeTheme.isLight ? "text-slate-600" : "text-white/40"
              }`}
            >
              {tr("Atmosphere:", "Atmosféra:", "Hangulat:")}
            </span>
            
            {(["dawn", "day", "sunset", "night"] as TimePhaseId[]).map((phaseId) => {
              const phase = LOGIN_PHASES[phaseId];
              const isSelected = activeTheme.id === phaseId;
              return (
                <button
                  key={phaseId}
                  type="button"
                  onClick={() => setPreviewPhase(phaseId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 border ${
                    isSelected
                      ? activeTheme.isLight
                        ? "bg-blue-600 border-blue-600 text-white shadow-md scale-105"
                        : "bg-white/20 border-white/40 text-white shadow-md scale-105"
                      : activeTheme.isLight
                        ? "bg-white/60 hover:bg-white/85 border-blue-200/80 text-slate-700 hover:text-slate-950"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  {renderPhaseIcon(phase.icon, "h-3 w-3")}
                  <span>{phase.badge[systemLanguage] || phase.badge.en}</span>
                </button>
              );
            })}
          </div>

        </div>
      )}

      {/* RIGHT COLUMN: Light-themed glass login card panel */}
      <div
        className={
          isModal
            ? "w-full relative z-10"
            : "flex-1 max-w-[430px] h-full flex items-center justify-center lg:justify-end relative z-10 w-full ml-auto"
        }
      >
        <div
          className={`w-full bg-white/85 dark:bg-slate-900/85 border border-white/40 rounded-[32px] shadow-2xl backdrop-blur-2xl p-6 sm:p-8 md:p-10 transition-all duration-500 ${activeTheme.cardGlowClass}`}
        >
          {/* Mobile-Only Time Greeting Header */}
          {!isModal && (
            <div className="flex lg:hidden items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg border ${activeTheme.badgeClass}`}>
                  {renderPhaseIcon(activeTheme.icon, "h-3.5 w-3.5")}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {phaseBadgeText}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {phaseGreetingText}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                {clock.hoursStr}:{clock.minutesStr}
              </span>
            </div>
          )}

          {/* Core System Brand */}
          <div className="flex flex-col items-center justify-center text-center space-y-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Terminal className="h-6 w-6 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-black text-slate-900 dark:text-white tracking-tight uppercase">
                {systemName}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-widest mt-1">
                {getTranslation(systemLanguage, "login.subtitle")}
              </p>
            </div>
          </div>

          {/* Browser is refusing cookies alert */}
          {browserStorageBlocked && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 mb-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold leading-relaxed animate-in fade-in slide-in-from-top-4 duration-300"
            >
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-black uppercase tracking-wider text-[10px] text-amber-700">
                  {getTranslation(systemLanguage, "login.storage_blocked_title")}
                </p>
                <p className="font-medium text-amber-800">
                  {getTranslation(systemLanguage, "login.storage_blocked_desc")}
                </p>
              </div>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block pl-0.5">
                {getTranslation(systemLanguage, "login.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={tr("e.g. alex@crm.com", "napr. alex@crm.com", "pl. alex@crm.com")}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block pl-0.5">
                {getTranslation(systemLanguage, "login.password")}
              </label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none group w-fit">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`h-4 w-4 rounded-md border-2 transition-all duration-150 group-active:scale-90 flex items-center justify-center ${
                  rememberMe
                    ? "bg-indigo-600 border-indigo-600"
                    : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-slate-400"
                }`}
              >
                {rememberMe && <CheckCircle className="h-3 w-3 text-white" />}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                {systemLanguage === "sk" ? "Zapamätať prihlásenie" : systemLanguage === "hu" ? "Bejelentkezés megjegyzése" : "Remember me"}
              </span>
            </label>

            {/* Error Alert Display */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold animate-shake">
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 hover:scale-[1.01] active:scale-[0.99]"
            >
              <LogIn className="h-4 w-4 stroke-[2.5]" /> {getTranslation(systemLanguage, "login.authenticate")}
            </button>
          </form>

          {isDemoMode ? (
            <>
              {/* Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-700" />
                </div>
                <span className="relative px-3 bg-white/80 dark:bg-slate-900 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {getTranslation(systemLanguage, "login.quick_presets")}
                </span>
              </div>

              {/* Quick Swapper Cards */}
              <div className="space-y-2">
                {users.map((user) => {
                  const roleColor = user.role.toLowerCase() === "admin" ? "#f43f5e" : "#3b82f6";
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => handleQuickLogin(user)}
                      className="w-full p-2.5 rounded-2xl bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-left transition-all flex items-center justify-between group active:scale-95 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-8 w-8 rounded-xl font-heading font-black text-[10px] flex items-center justify-center border transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: `${user.color}15`,
                            color: user.color,
                            borderColor: `${user.color}35`
                          }}
                        >
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{user.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{user.email}</span>
                        </div>
                      </div>
                      
                      <span
                        className="px-2.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: `${roleColor}10`,
                          color: roleColor,
                          borderColor: `${roleColor}25`
                        }}
                      >
                        {user.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-6">
              {!resetToken && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowResetInfo(!showResetInfo)}
                    className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-500 transition-colors"
                  >
                    {tr("Forgot Password?", "Zabudli ste heslo?", "Elfelejtette a jelszavát?")}
                  </button>
                </div>
              )}

              {(showResetInfo || resetToken) && (
                <div className="mt-3 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/50 text-left leading-normal animate-in fade-in slide-in-from-top-4 duration-300">
                  {resetToken ? (
                    resetDone ? (
                      <div className="space-y-3 text-center">
                        <CheckCircle className="h-7 w-7 text-emerald-500 mx-auto" />
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {tr("Your password has been updated. You can now sign in.", "Vaše heslo bolo zmenené. Teraz sa môžete prihlásiť.", "A jelszava frissült. Most már bejelentkezhet.")}
                        </p>
                        <button
                          type="button"
                          onClick={() => { setResetToken(""); setShowResetInfo(false); setResetDone(false); }}
                          className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
                        >
                          {tr("Back to login", "Späť na prihlásenie", "Vissza a bejelentkezéshez")}
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); submitNewPassword(); }} className="space-y-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {tr("Set a new password", "Nastavte nové heslo", "Új jelszó beállítása")}
                        </p>
                        <PasswordInput
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={tr("New password", "Nové heslo", "Új jelszó")}
                          className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                        <PasswordInput
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={tr("Confirm new password", "Potvrďte nové heslo", "Új jelszó megerősítése")}
                          className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                        {resetError && (
                          <div className="flex items-start gap-1.5 text-[10px] font-semibold text-rose-600">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" /> <span>{resetError}</span>
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                        >
                          {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                          {tr("Update password", "Zmeniť heslo", "Jelszó frissítése")}
                        </button>
                      </form>
                    )
                  ) : resetAvailable === null ? (
                    <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tr("Checking…", "Kontrolujem…", "Ellenőrzés…")}
                    </div>
                  ) : resetAvailable ? (
                    resetRequested ? (
                      <div className="flex items-start gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-px" />
                        <span>{tr("If an account exists for that email, a reset link has been sent. Please check your inbox.", "Ak pre danú e-mailovú adresu existuje účet, odkaz na obnovenie hesla bol odoslaný. Skontrolujte si prosím svoju schránku.", "Ha létezik fiók ehhez az e-mail-címhez, a visszaállítási linket elküldtük. Kérjük, ellenőrizze a postaládáját.")}</span>
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); requestPasswordReset(); }} className="space-y-2.5">
                        <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          {tr("Enter your email and we'll send you a password reset link.", "Zadajte svoj e-mail a pošleme vám odkaz na obnovenie hesla.", "Adja meg az e-mail-címét, és küldünk egy jelszó-visszaállítási linket.")}
                        </p>
                        <input
                          type="email"
                          required
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder={tr("Your email", "Váš e-mail", "Az Ön e-mail-címe")}
                          className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                        >
                          {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          {tr("Send reset link", "Odoslať odkaz", "Link küldése")}
                        </button>
                      </form>
                    )
                  ) : (
                    <span className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 leading-normal">
                      {tr("To restore access, please contact your CCRM database administrator.", "Pre obnovenie prístupu kontaktujte prosím správcu databázy CCRM.", "A hozzáférés visszaállításához forduljon a CCRM adatbázis-adminisztrátorához.")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
};
