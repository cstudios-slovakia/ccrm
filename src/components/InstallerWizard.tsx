import React, { useState } from "react";
import { Database, ShieldCheck, Server, Key, AlertCircle, CheckCircle2, Loader2, Sparkles, Languages } from "lucide-react";

interface InstallerWizardProps {
  onInstallSuccess: () => void;
  systemLanguage?: "en" | "sk" | "hu";
}

export const InstallerWizard: React.FC<InstallerWizardProps> = ({ onInstallSuccess, systemLanguage = "sk" }) => {
  const [step, setStep] = useState(1);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("3306");
  const [dbname, setDbname] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [installType, setInstallType] = useState<"fresh" | "demo">("demo");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [generatedCreds, setGeneratedCreds] = useState<{ email: string; password: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "sk" | "hu">(systemLanguage);

  const t = {
    en: {
      title: "CCRM Installation Wizard",
      subtitle: "Set up your secure MySQL database connection in a few seconds",
      step1: "Credentials",
      step2: "Seeding",
      step3: "Finish",
      host: "Database Host Address",
      port: "Port Number",
      dbname: "Database Name",
      user: "Username",
      pass: "Password",
      btnNext: "Test & Continue",
      btnBack: "Back",
      btnInstall: "Run Setup & Migrate",
      error_title: "Connection Failed",
      success_title: "Setup Complete!",
      success_desc: "CCRM has been successfully configured and migrated.",
      success_btn: "Proceed to Application",
      type_demo: "Seed with Demo Data (Recommended)",
      type_demo_desc: "Installs a fully populated CRM containing mock leads, pipelines, calendar logs, and project tasks for instant trial.",
      type_fresh: "Start Fresh (Empty Database)",
      type_fresh_desc: "Prepares an empty relational database structure and generates a default master administrator account.",
      checking: "Establishing secure PDO handshake..."
    },
    sk: {
      title: "Inštalačný sprievodca CCRM",
      subtitle: "Nastavte si bezpečné pripojenie k databáze MySQL v priebehu niekoľkých sekúnd",
      step1: "Údaje",
      step2: "Dáta",
      step3: "Dokončiť",
      host: "Adresa databázového hostiteľa",
      port: "Číslo portu",
      dbname: "Názov databázy",
      user: "Používateľské meno",
      pass: "Heslo",
      btnNext: "Testovať a pokračovať",
      btnBack: "Späť",
      btnInstall: "Spustiť inštaláciu",
      error_title: "Pripojenie zlyhalo",
      success_title: "Inštalácia úspešná!",
      success_desc: "CCRM bol úspešne nakonfigurovaný a databáza bola migrovaná.",
      success_btn: "Prejsť do aplikácie",
      type_demo: "Nainštalovať demo dáta (odporúčané)",
      type_demo_desc: "Nainštaluje plne naplnený CRM obsahujúci ukážkové leady, pipeline, záznamy v kalendári a úlohy na okamžité testovanie.",
      type_fresh: "Čistá inštalácia (prázdna databáza)",
      type_fresh_desc: "Pripraví prázdnu relačnú databázovú štruktúru a vygeneruje predvolený hlavný administrátorský účet.",
      checking: "Nadväzuje sa bezpečné spojenie..."
    },
    hu: {
      title: "CCRM Telepítési Varázsló",
      subtitle: "Állítsa be a biztonságos MySQL adatbázis-kapcsolatot néhány másodperc alatt",
      step1: "Adatok",
      step2: "Magvetés",
      step3: "Befejezés",
      host: "Adatbázis kiszolgáló címe",
      port: "Port száma",
      dbname: "Adatbázis neve",
      user: "Felhasználónév",
      pass: "Jelszó",
      btnNext: "Tesztelés és folytatás",
      btnBack: "Vissza",
      btnInstall: "Telepítés futtatása",
      error_title: "A kapcsolódás sikertelen",
      success_title: "A telepítés befejeződött!",
      success_desc: "A CCRM sikeresen konfigurálva és migrálva lett.",
      success_btn: "Továbblépés az alkalmazásba",
      type_demo: "Demo adatok telepítése (Ajánlott)",
      type_demo_desc: "Egy teljesen feltöltött CRM-et telepít ukrán leadekkel, csatornákkal, naptárakkal és feladatokkal az azonnali próba érdekében.",
      type_fresh: "Friss indítás (Üres adatbázis)",
      type_fresh_desc: "Előkészít egy üres adatbázis-szerkezetet, és létrehoz egy alapértelmezett rendszergazdai fiókot.",
      checking: "Biztonságos kapcsolat létrehozása..."
    }
  };

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/setup.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, dbname, user, pass, type: "test_only" })
      });

      const data = await res.json().catch(() => null);
      // test_only only verifies the connection — it never writes config or seeds.
      if (res.ok && data && data.success) {
        setStep(2);
      } else {
        setError((data && data.message) || (lang === "sk" ? "Nepodarilo sa overiť pripojenie. Skontrolujte parametre." : "Connection validation failed. Check settings."));
      }
    } catch (err) {
      setError(lang === "sk" ? "Nepodarilo sa overiť pripojenie. Skontrolujte parametre." : "Connection validation failed. Check settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/setup.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host, port, dbname, user, pass,
          type: installType,
          adminName, adminEmail, adminPassword
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.generatedPassword) {
          setGeneratedCreds({ email: data.adminEmail, password: data.generatedPassword });
        }
        setStep(3);
      } else {
        setError(data.message || "Setup failed.");
      }
    } catch (err) {
      setError(lang === "sk" ? "Inštalačný proces zlyhal." : "Installation process failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 md:p-8 font-sans select-none relative overflow-hidden">
      
      {/* Dynamic blurred glow spots */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full filter blur-[120px] bg-indigo-500/10 animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full filter blur-[100px] bg-purple-500/10 animate-pulse" />
      </div>

      <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-[32px] shadow-2xl backdrop-blur-xl p-6 md:p-10 relative z-10 text-white animate-in zoom-in duration-300">
        
        {/* Language selector in Header */}
        <div className="absolute top-6 right-6 flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-wider">
          <Languages className="h-3.5 w-3.5" />
          <button onClick={() => setLang("en")} className={`hover:text-indigo-400 ${lang === "en" ? "text-indigo-400" : ""}`}>EN</button>
          <span>&bull;</span>
          <button onClick={() => setLang("sk")} className={`hover:text-indigo-400 ${lang === "sk" ? "text-indigo-400" : ""}`}>SK</button>
          <span>&bull;</span>
          <button onClick={() => setLang("hu")} className={`hover:text-indigo-400 ${lang === "hu" ? "text-indigo-400" : ""}`}>HU</button>
        </div>

        {/* Brand Banner */}
        <div className="flex flex-col items-center justify-center text-center space-y-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Database className="h-7 w-7 text-white animate-bounce" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-heading font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 to-purple-200">
              {t[lang].title}
            </h2>
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-black mt-1 max-w-md mx-auto leading-normal">
              {t[lang].subtitle}
            </p>
          </div>
        </div>

        {/* Steps tracker progress bar */}
        <div className="flex items-center justify-center gap-2 mb-8 max-w-xs mx-auto">
          <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-indigo-500" : "bg-white/10"}`} />
          <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-indigo-500" : "bg-white/10"}`} />
          <div className={`h-1.5 flex-1 rounded-full ${step >= 3 ? "bg-indigo-500" : "bg-white/10"}`} />
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-250 text-xs font-semibold mb-6 animate-shake">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-extrabold uppercase text-[10px] tracking-wider block">{t[lang].error_title}</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Loader Screen overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-[32px] z-50 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">{t[lang].checking}</span>
          </div>
        )}

        {/* STEP 1: Database Parameters connection Form */}
        {step === 1 && (
          <form onSubmit={handleTestConnection} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Host Address */}
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block pl-0.5">{t[lang].host}</label>
                <div className="relative">
                  <Server className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Port Number */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block pl-0.5">{t[lang].port}</label>
                <input
                  type="text"
                  required
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-650 text-center focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                />
              </div>

            </div>

            {/* Database Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block pl-0.5">{t[lang].dbname}</label>
              <input
                type="text"
                required
                value={dbname}
                onChange={(e) => setDbname(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* User Login */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block pl-0.5">{t[lang].user}</label>
                <input
                  type="text"
                  required
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-450 uppercase tracking-wider block pl-0.5">{t[lang].pass}</label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                  />
                </div>
              </div>

            </div>

            {/* Form actions */}
            <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 w-fit">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {lang === "sk" ? "Zadajte údaje vašej databázy" : lang === "hu" ? "Adja meg az adatbázis adatait" : "Enter your database credentials"}
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-[0.99] hover:scale-[1.01] shrink-0"
              >
                {t[lang].btnNext}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Seeding Choice options */}
        {step === 2 && (
          <div className="space-y-6">
            
            <div className="space-y-4">
              
              {/* Option A: Seed Demo Data */}
              <button
                onClick={() => setInstallType("demo")}
                className={`w-full p-5 rounded-[24px] border text-left transition-all relative overflow-hidden group ${
                  installType === "demo"
                    ? "bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    installType === "demo" ? "bg-indigo-500/20 text-indigo-400" : "bg-white/5 text-slate-400"
                  }`}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="font-heading font-black text-xs uppercase tracking-wide group-hover:text-indigo-300 transition-colors">
                      {t[lang].type_demo}
                    </span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {t[lang].type_demo_desc}
                    </p>
                  </div>
                </div>
              </button>

              {/* Option B: Fresh Install */}
              <button
                onClick={() => setInstallType("fresh")}
                className={`w-full p-5 rounded-[24px] border text-left transition-all relative overflow-hidden group ${
                  installType === "fresh"
                    ? "bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    installType === "fresh" ? "bg-indigo-500/20 text-indigo-400" : "bg-white/5 text-slate-400"
                  }`}>
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="font-heading font-black text-xs uppercase tracking-wide group-hover:text-indigo-300 transition-colors">
                      {t[lang].type_fresh}
                    </span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {t[lang].type_fresh_desc}
                    </p>
                  </div>
                </div>
              </button>

              {/* Administrator account (fresh install only) */}
              {installType === "fresh" && (
                <div className="p-5 rounded-[24px] border border-white/10 bg-white/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <span className="font-heading font-black text-[10px] uppercase tracking-widest text-slate-300 flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" />
                    {lang === "sk" ? "Administrátorský účet" : lang === "hu" ? "Rendszergazdai fiók" : "Administrator account"}
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder={lang === "sk" ? "Meno" : lang === "hu" ? "Név" : "Name"}
                      className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                    />
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={lang === "sk" ? "E-mail (prihlásenie)" : lang === "hu" ? "E-mail (belépés)" : "Email (login)"}
                      className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                    />
                  </div>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder={lang === "sk" ? "Heslo" : lang === "hu" ? "Jelszó" : "Password"}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                  />
                  <p className="text-[9px] text-slate-500 leading-relaxed">
                    {lang === "sk"
                      ? "Ak necháte polia prázdne, vytvorí sa účet admin@crm.com s náhodným heslom, ktoré sa zobrazí po inštalácii."
                      : lang === "hu"
                      ? "Ha üresen hagyja, létrejön az admin@crm.com fiók egy véletlenszerű jelszóval, amely a telepítés után jelenik meg."
                      : "Leave blank to create admin@crm.com with a random password shown after install."}
                  </p>
                </div>
              )}

            </div>

            {/* Stepper navigation actions */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-4 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-wider rounded-2xl transition-all active:scale-[0.99] border border-white/10"
              >
                {t[lang].btnBack}
              </button>
              
              <button
                onClick={handleRunSetup}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.99] hover:scale-[1.01]"
              >
                {t[lang].btnInstall}
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: Complete & Successful migration finish Screen */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center text-center space-y-6 py-4 animate-in fade-in zoom-in duration-500">
            <div className="h-16 w-16 rounded-3xl bg-indigo-550/20 flex items-center justify-center border border-indigo-500 shadow-lg shadow-indigo-500/10">
              <CheckCircle2 className="h-10 w-10 text-indigo-450 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-heading font-black uppercase tracking-wider text-indigo-300">
                {t[lang].success_title}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm font-semibold leading-normal">
                {t[lang].success_desc}
              </p>
            </div>

            {generatedCreds && (
              <div className="w-full max-w-sm p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 block">
                  {lang === "sk" ? "Uložte si tieto údaje" : lang === "hu" ? "Mentse el ezeket az adatokat" : "Save these credentials"}
                </span>
                <div className="text-xs font-mono text-slate-100 space-y-1 break-all">
                  <div>{generatedCreds.email}</div>
                  <div className="font-black">{generatedCreds.password}</div>
                </div>
                <p className="text-[9px] text-amber-200/80 leading-relaxed">
                  {lang === "sk" ? "Heslo sa už nezobrazí. Po prihlásení si ho zmeňte." : lang === "hu" ? "A jelszó többé nem jelenik meg. Belépés után változtassa meg." : "This password will not be shown again. Change it after logging in."}
                </p>
              </div>
            )}

            <button
              onClick={onInstallSuccess}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.99] hover:scale-[1.01]"
            >
              {t[lang].success_btn}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
