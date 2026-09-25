import React, { useState, useEffect } from "react";
import {
  LogIn,
  Key,
  Mail,
  Terminal,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Circle,
  Loader2,
  Sunrise,
  Sun,
  Sunset,
  Moon
} from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import type { UserProfile } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { FeralGradientBackground } from "./FeralGradientBackground";
import { hasCookieAccess, hasPersistentStorage } from "../utils/safeStorage";
import { passwordRules, PASSWORD_MIN_LENGTH } from "../utils/passwordRules";
import {
  getCurrentLoginTheme,
  formatLocalizedClock,
  formatLocalizedDate
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

  // Update real-time clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeTheme = getCurrentLoginTheme(currentTime);
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
  // Which account the link is for, or that it is dead — known before the user
  // types a new password, not after.
  const [resetTokenEmail, setResetTokenEmail] = useState<string | null>(null);
  const [resetTokenInvalid, setResetTokenInvalid] = useState(false);
  // A successful reset signs the browser in; this is the account it opened.
  const [resetSignedInUser, setResetSignedInUser] = useState<UserProfile | null>(null);
  const newPasswordRules = passwordRules(newPassword);

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
        fetch("/api/password_reset.php?action=inspect&token=" + encodeURIComponent(token))
          .then(r => r.json())
          .then(d => {
            if (cancelled) return;
            if (d && d.valid && d.email) setResetTokenEmail(String(d.email));
            else setResetTokenInvalid(true);
          })
          .catch(() => { /* the reset call reports a dead link itself */ });
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
    if (!newPasswordRules.length || !newPasswordRules.mix) {
      setResetError(tr("The password does not meet the rules above.", "Heslo nespĺňa pravidlá vyššie.", "A jelszó nem felel meg a fenti szabályoknak."));
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
        setResetSignedInUser(data.user ? (data.user as UserProfile) : null);
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
      if (res.status === 429 || (data && data.locked)) {
        setError(tr(
          "Too many failed attempts. Sign-in is blocked for 15 minutes — try again later.",
          "Príliš veľa neúspešných pokusov. Prihlásenie je na 15 minút zablokované — skúste to neskôr.",
          "Túl sok sikertelen próbálkozás. A bejelentkezés 15 percre le van tiltva — próbálja újra később."
        ));
        return;
      }
      const remaining = data && typeof data.attempts_remaining === "number" ? data.attempts_remaining : null;
      // The allowance is generous, so only say how much is left once it runs low.
      if (remaining !== null && remaining <= 5) {
        setError(getTranslation(systemLanguage, "login.error_pass") + " " + tr(
          `Attempts left: ${remaining}. After that, sign-in is blocked for 15 minutes.`,
          `Zostávajúce pokusy: ${remaining}. Potom bude prihlásenie na 15 minút zablokované.`,
          `Hátralévő próbálkozások: ${remaining}. Utána a bejelentkezés 15 percre le lesz tiltva.`
        ));
        return;
      }
      setError(getTranslation(systemLanguage, "login.error_pass"));
    } catch (err) {
      setError(tr("Could not reach the server. Check your connection and try again.", "Server neodpovedá. Skontrolujte pripojenie a skúste to znova.", "A kiszolgáló nem érhető el. Ellenőrizze a kapcsolatot, és próbálja újra."));
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
      {/* Dynamic Animated Background: Universal Feral WebGL Gradient Shader with smooth real-time color morphing */}
      {!isModal && <FeralGradientBackground phaseId={activeTheme.id} />}

      {/* LEFT AREA: Atmospheric Executive Time-of-Day Hero Panel.
          It sits on the time-of-day shader, not an app surface, so its ink follows
          activeTheme.isLight; `force-light` keeps the app's dark mode from
          inverting the palette underneath it. */}
      {!isModal && (
        <div className="force-light flex-1 hidden lg:flex flex-col justify-center items-start relative z-10 pr-12 xl:pr-20 py-8 min-h-[580px] max-w-2xl animate-in fade-in duration-700 select-none">
          {/* Middle Body: Digital Clock & Executive Localized Greeting.
              The shader runs from pale sky to deep colour behind this block, so
              bare text lost contrast somewhere in every phase; a soft glass pane
              gives it one steady backdrop, matching the login card. */}
          <div
            className={`space-y-6 rounded-[32px] border backdrop-blur-md p-8 xl:p-10 shadow-xl transition-colors duration-700 ${
              activeTheme.isLight
                ? "bg-white/40 border-white/50 shadow-slate-900/5"
                : "bg-slate-950/35 border-white/10 shadow-black/20"
            }`}
          >
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
                    activeTheme.isLight ? "text-slate-900/45" : "text-white/40"
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
                  activeTheme.isLight ? "text-slate-800" : "text-white/65"
                }`}
              >
                {phaseQuoteText}
              </p>
            </div>
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
          className={`w-full bg-white/85 border border-white/40 rounded-[32px] shadow-2xl backdrop-blur-2xl p-6 sm:p-8 md:p-10 transition-all duration-500 ${activeTheme.cardGlowClass}`}
        >
          {/* Mobile-Only Time Greeting Header */}
          {!isModal && (
            <div className="flex lg:hidden items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg border ${activeTheme.badgeClass}`}>
                  {renderPhaseIcon(activeTheme.icon, "h-3.5 w-3.5")}
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {phaseBadgeText}
                  </span>
                  <span className="text-xs font-bold text-slate-800">
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
              <h2 className="text-2xl font-heading font-black text-slate-900 tracking-tight uppercase">
                {systemName}
              </h2>
              <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest mt-1">
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
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block pl-0.5">
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
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block pl-0.5">
                {getTranslation(systemLanguage, "login.password")}
              </label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
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
                    : "border-slate-300 bg-white group-hover:border-slate-400"
                }`}
              >
                {rememberMe && <CheckCircle className="h-3 w-3 text-white" />}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 group-hover:text-slate-700 transition-colors">
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
              {/* Two hairlines either side of the label rather than one line
                  behind it: the card is translucent, so a patch masking the line
                  showed up as a box. */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {getTranslation(systemLanguage, "login.quick_presets")}
                </span>
                <div className="flex-1 border-t border-slate-200" />
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
                      className="w-full p-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 text-left transition-all flex items-center justify-between group active:scale-95 shadow-sm"
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
                          <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{user.name}</span>
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
                <div className="mt-3 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 text-left leading-normal animate-in fade-in slide-in-from-top-4 duration-300">
                  {resetToken ? (
                    resetDone ? (
                      <div className="space-y-3 text-center">
                        <CheckCircle className="h-7 w-7 text-emerald-500 mx-auto" />
                        <p className="text-[11px] font-semibold text-slate-600">
                          {resetSignedInUser
                            ? tr("Your password has been changed and you are signed in.", "Vaše heslo bolo zmenené a ste prihlásení.", "A jelszava megváltozott, és be van jelentkezve.")
                            : tr("Your password has been updated. You can now sign in.", "Vaše heslo bolo zmenené. Teraz sa môžete prihlásiť.", "A jelszava frissült. Most már bejelentkezhet.")}
                        </p>
                        {resetSignedInUser ? (
                          <button
                            type="button"
                            onClick={() => onLoginSuccess(resetSignedInUser)}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                          >
                            <LogIn className="h-3.5 w-3.5" /> {tr("Continue to CCRM", "Pokračovať do CCRM", "Tovább a CCRM-be")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setResetToken(""); setShowResetInfo(false); setResetDone(false); }}
                            className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
                          >
                            {tr("Back to login", "Späť na prihlásenie", "Vissza a bejelentkezéshez")}
                          </button>
                        )}
                      </div>
                    ) : resetTokenInvalid ? (
                      <div className="space-y-3 text-center">
                        <AlertCircle className="h-7 w-7 text-rose-500 mx-auto" />
                        <p className="text-[11px] font-semibold text-slate-600">
                          {tr("This reset link is invalid or has expired. Request a new one.", "Tento odkaz na obnovenie je neplatný alebo vypršal. Vyžiadajte si nový.", "Ez a visszaállítási link érvénytelen vagy lejárt. Kérjen újat.")}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
                            setResetToken("");
                            setResetTokenInvalid(false);
                            setResetRequested(false);
                          }}
                          className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-500"
                        >
                          {tr("Request a new link", "Vyžiadať nový odkaz", "Új link kérése")}
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); submitNewPassword(); }} className="space-y-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          {tr("Set a new password", "Nastavte nové heslo", "Új jelszó beállítása")}
                        </p>
                        {resetTokenEmail && (
                          <p className="text-[11px] font-semibold text-slate-600 break-all">
                            {tr("For the account", "Pre konto", "Fiók:")} <span className="text-slate-900">{resetTokenEmail}</span>
                          </p>
                        )}
                        <PasswordInput
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={tr("New password", "Nové heslo", "Új jelszó")}
                          className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                        <PasswordInput
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={tr("Confirm new password", "Potvrďte nové heslo", "Új jelszó megerősítése")}
                          className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                        <ul className="space-y-1" aria-label={tr("Password rules", "Pravidlá hesla", "Jelszószabályok")}>
                          {([
                            [newPasswordRules.length, tr(`At least ${PASSWORD_MIN_LENGTH} characters`, `Aspoň ${PASSWORD_MIN_LENGTH} znakov`, `Legalább ${PASSWORD_MIN_LENGTH} karakter`)],
                            [newPasswordRules.mix, tr("Upper and lower case letters and a digit", "Veľké aj malé písmeno a číslica", "Kis- és nagybetű, valamint számjegy")],
                          ] as const).map(([met, label]) => (
                            <li key={label} data-met={met ? "true" : "false"} className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${met ? "text-emerald-600" : "text-slate-500"}`}>
                              {met ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
                              {label}
                            </li>
                          ))}
                        </ul>
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
                      <div className="flex items-start gap-2 text-[10px] font-semibold text-slate-600">
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-px" />
                        <span>{tr("If an account exists for that email, a reset link has been sent. Please check your inbox.", "Ak pre danú e-mailovú adresu existuje účet, odkaz na obnovenie hesla bol odoslaný. Skontrolujte si prosím svoju schránku.", "Ha létezik fiók ehhez az e-mail-címhez, a visszaállítási linket elküldtük. Kérjük, ellenőrizze a postaládáját.")}</span>
                      </div>
                    ) : (
                      <form onSubmit={(e) => { e.preventDefault(); requestPasswordReset(); }} className="space-y-2.5">
                        <p className="text-[10px] font-semibold text-slate-600">
                          {tr("Enter your email and we'll send you a password reset link.", "Zadajte svoj e-mail a pošleme vám odkaz na obnovenie hesla.", "Adja meg az e-mail-címét, és küldünk egy jelszó-visszaállítási linket.")}
                        </p>
                        <input
                          type="email"
                          required
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder={tr("Your email", "Váš e-mail", "Az Ön e-mail-címe")}
                          className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
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
                    <span className="block text-[10px] font-semibold text-slate-600 leading-normal">
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
