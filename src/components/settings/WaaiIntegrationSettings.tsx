import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import type { Language } from "../../utils/translations";
import { WAAI_SCOPES, normalizeEmbedOrigin, parseIpList, waaiEnvSnippet, waaiSsoEnvSnippet } from "../../utils/waaiIntegration";
import { SectionCard, SettingsGroup } from "./SectionCard";
import { useConfirmDialog } from "../ui/ConfirmDialog";

type T = (en: string, sk: string, hu: string) => string;

interface ClientView {
  is_active: boolean;
  scopes: string[];
  allowed_ips: string[];
  require_direct: boolean;
  owner_user_ids: string[];
  feed_scope: "owners" | "all";
  embed_url: string | null;
  module_ui: "native" | "embedded";
  module_transport: "proxy" | "direct";
  has_sso_secret: boolean;
  default_deadline_days: number;
}

interface TokenRow {
  id: string;
  prefix: string;
  state: "active" | "revoked" | "expired";
  created_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
}

interface Status {
  client: ClientView | null;
  tokens: TokenRow[];
  users: { id: string; name: string }[];
}

/** What the endpoint answers: the status, plus the one-time token after issuing, or the refused fields. */
type Reply = Status & { success?: boolean; token?: string; sso_secret?: string; fields?: Record<string, string> };

const ENDPOINT = "/api/integration_admin.php";

const showToast = (message: string, variant?: "error" | "warning") =>
  (window as unknown as { showToast?: (m: string, v?: string) => void }).showToast?.(message, variant);

const SCOPE_LABEL: Record<string, [string, string, string]> = {
  "users:read": ["Read the user list", "Čítať zoznam používateľov", "Felhasználólista olvasása"],
  "directory:read": ["Read clients and projects (names, phones)", "Čítať klientov a projekty (mená, telefóny)", "Ügyfelek és projektek olvasása (nevek, telefonszámok)"],
  "tasks:push": ["Create and update tasks", "Vytvárať a upravovať úlohy", "Feladatok létrehozása és módosítása"],
  "tasks:pull": ["Read and complete tasks", "Čítať a dokončovať úlohy", "Feladatok olvasása és befejezése"],
  "whatsapp:links": ["Pair chats with clients and projects", "Párovať chaty s klientmi a projektmi", "Csevegések párosítása ügyfelekkel és projektekkel"],
  "timeline:push": ["Add entries to the client timeline", "Pridávať záznamy do histórie klienta", "Bejegyzések hozzáadása az ügyfél idővonalához"],
};

const inputCls =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50";
const primaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-5 text-ui font-bold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const secondaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-ui font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ checked, onChange, label, hint, disabled }) => (
  <label className="flex cursor-pointer items-start gap-3">
    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="flex flex-col">
      <span className="type-label text-slate-800">{label}</span>
      {hint && <span className="type-meta text-slate-500">{hint}</span>}
    </span>
  </label>
);

const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, hint, error, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="type-label text-slate-800">{label}</span>
    {children}
    {error ? <span className="type-meta text-rose-600">{error}</span> : hint ? <span className="type-meta text-slate-500">{hint}</span> : null}
  </label>
);

/** A labelled group of radio buttons, each with a line of explanation. */
function Choice<V extends string>({ name, label, value, onChange, options }: {
  name: string;
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string; hint: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-label text-slate-800 mb-1">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${value === o.value ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <input type="radio" name={name} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="flex flex-col">
            <span className="type-label text-slate-800">{o.label}</span>
            <span className="type-meta text-slate-500">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const fmtDate = (value: string | null, lang: Language): string => {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  const locale = lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-GB";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
};

const CopyButton: React.FC<{ text: string; t: T }> = ({ text, t }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={secondaryBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          showToast(t("Could not copy. Select the text and copy it by hand.", "Kopírovanie sa nepodarilo. Označte text a skopírujte ho ručne.", "A másolás nem sikerült. Jelölje ki a szöveget, és másolja ki kézzel."), "error");
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copied ? t("Copied!", "Skopírované!", "Másolva!") : t("Copy", "Kopírovať", "Másolás")}
    </button>
  );
};

/**
 * Settings → Integrations → WhatsApp (WAAI): the connection of the machine API (/api/v1) that WAAI's
 * ai-worker uses, and the access tokens it signs in with. Administrators only (the endpoint is too).
 */
export const WaaiIntegrationSettings: React.FC<{ activeLang: Language }> = ({ activeLang }) => {
  const t: T = (en, sk, hu) => (activeLang === "sk" ? sk : activeLang === "hu" ? hu : en);
  const [confirm, confirmNode] = useConfirmDialog();

  const [status, setStatus] = useState<Status | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The form: separate state so typing does not touch what the server last returned.
  const [active, setActive] = useState(true);
  const [address, setAddress] = useState("");
  const [moduleUi, setModuleUi] = useState<"native" | "embedded">("embedded");
  const [transport, setTransport] = useState<"proxy" | "direct">("proxy");
  const [owners, setOwners] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>([...WAAI_SCOPES]);
  const [ipText, setIpText] = useState("");
  const [direct, setDirect] = useState(false);
  const [feedScope, setFeedScope] = useState<"owners" | "all">("owners");
  const [days, setDays] = useState("7");
  const [expiry, setExpiry] = useState("");
  // The plaintext token lives in the browser only until the admin leaves or dismisses it.
  const [newToken, setNewToken] = useState<string | null>(null);
  // Same for a new sign-in secret.
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  // Earliest expiry the date picker offers: tomorrow (fixed on mount, so render stays pure).
  const [minExpiry] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));

  const applyStatus = useCallback((s: Status) => {
    setStatus(s);
    const c = s.client;
    if (c) {
      setActive(c.is_active);
      setAddress(c.embed_url ?? "");
      setModuleUi(c.module_ui);
      setTransport(c.module_transport);
      setOwners(c.owner_user_ids);
      setScopes(c.scopes);
      setIpText(c.allowed_ips.join("\n"));
      setDirect(c.require_direct);
      setFeedScope(c.feed_scope);
      setDays(String(c.default_deadline_days));
    }
  }, []);

  const call = useCallback(async (body?: object): Promise<{ ok: boolean; status: number; data: Reply }> => {
    const res = await fetch(ENDPOINT, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const data = (await res.json().catch(() => null)) as Reply | null;
    return { ok: res.ok && data?.success === true, status: res.status, data: data as Reply };
  }, []);

  useEffect(() => {
    let alive = true;
    call()
      .then((r) => {
        if (!alive) return;
        if (r.ok) applyStatus(r.data);
        else setLoadFailed(true);
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [call, applyStatus]);

  const save = async () => {
    const errors: Record<string, string> = {};
    const origin = normalizeEmbedOrigin(address);
    if (origin === null) errors.embed_url = t("Use the address without a path, e.g. https://wa.example.sk", "Zadajte adresu bez cesty, napr. https://wa.example.sk", "Útvonal nélküli címet adjon meg, pl. https://wa.example.sk");
    // A direct connection is the browser calling WAAI's own address; the embedded interface loads from it too.
    if ((transport === "direct" || moduleUi === "embedded") && origin === "") {
      errors.embed_url = t("Enter the WAAI address.", "Zadajte adresu WAAI.", "Adja meg a WAAI címét.");
    }
    const { ips, invalid } = parseIpList(ipText);
    if (invalid.length) errors.allowed_ips = t(`Not an IP address or block: ${invalid.join(", ")}`, `Nie je IP adresa ani blok: ${invalid.join(", ")}`, `Nem IP-cím vagy tartomány: ${invalid.join(", ")}`);
    if (!/^\d{1,3}$/.test(days) || Number(days) > 365) errors.default_deadline_days = t("A number of days from 0 to 365", "Počet dní od 0 do 365", "Napok száma 0 és 365 között");
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const r = await call({
        action: "save_client",
        name: "WAAI",
        is_active: active,
        scopes,
        allowed_ips: ips,
        require_direct: direct,
        owner_user_ids: owners,
        feed_scope: feedScope,
        embed_url: origin ?? "",
        module_ui: moduleUi,
        module_transport: transport,
        default_deadline_days: Number(days),
      });
      if (r.ok) {
        applyStatus(r.data);
        showToast(t("Connection settings saved.", "Nastavenia pripojenia boli uložené.", "A kapcsolat beállításai mentve."));
      } else if (r.status === 422 && r.data?.fields) {
        setFieldErrors(r.data.fields);
      } else {
        showToast(t("Could not save the settings.", "Nastavenia sa nepodarilo uložiť.", "A beállításokat nem sikerült menteni."), "error");
      }
    } catch {
      showToast(t("Could not save the settings.", "Nastavenia sa nepodarilo uložiť.", "A beállításokat nem sikerült menteni."), "error");
    } finally {
      setSaving(false);
    }
  };

  const issueToken = async () => {
    setIssuing(true);
    try {
      const r = await call({ action: "issue_token", expires_at: expiry || undefined });
      if (r.ok && r.data.token) {
        applyStatus(r.data);
        setNewToken(r.data.token);
        setExpiry("");
      } else if (r.status === 409 || r.status === 422) {
        showToast(r.status === 409 && !status?.client
          ? t("Save the connection settings first.", "Najprv uložte nastavenia pripojenia.", "Először mentse a kapcsolat beállításait.")
          : t("Could not create the token (at most 10 active tokens; expiry must be a future date).", "Token sa nepodarilo vytvoriť (najviac 10 aktívnych tokenov; platnosť musí byť v budúcnosti).", "A tokent nem sikerült létrehozni (legfeljebb 10 aktív token; a lejáratnak jövőbeli dátumnak kell lennie)."), "error");
      } else {
        showToast(t("Could not create the token.", "Token sa nepodarilo vytvoriť.", "A tokent nem sikerült létrehozni."), "error");
      }
    } catch {
      showToast(t("Could not create the token.", "Token sa nepodarilo vytvoriť.", "A tokent nem sikerült létrehozni."), "error");
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async (tok: TokenRow) => {
    const ok = await confirm({
      title: t("Revoke this token?", "Odvolať tento token?", "Visszavonja ezt a tokent?"),
      message: t(
        `WAAI stops being able to sign in with ${tok.prefix}… at once.`,
        `WAAI sa s tokenom ${tok.prefix}… okamžite prestane vedieť prihlásiť.`,
        `A WAAI a ${tok.prefix}… tokennel azonnal nem tud többé bejelentkezni.`
      ),
      confirmLabel: t("Revoke", "Odvolať", "Visszavonás"),
      cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
      danger: true,
    });
    if (!ok) return;
    const r = await call({ action: "revoke_token", id: tok.id });
    if (r.ok) applyStatus(r.data);
    else showToast(t("Could not revoke the token.", "Token sa nepodarilo odvolať.", "A tokent nem sikerült visszavonni."), "error");
  };

  const rotateSecret = async () => {
    if (status?.client?.has_sso_secret) {
      const ok = await confirm({
        title: t("Create a new sign-in secret?", "Vytvoriť nový prihlasovací kľúč?", "Új belépési kulcsot hoz létre?"),
        message: t(
          "The old one stops working in CCRM at once. People already inside WhatsApp stay signed in; the next sign-in needs the new secret in WAAI. Put it in WAAI first as `new,old` if you want no gap.",
          "Starý okamžite prestane fungovať v CRM. Kto je už vo WhatsAppe, zostane prihlásený; ďalšie prihlásenie potrebuje nový kľúč vo WAAI. Ak nechcete medzeru, vložte ho do WAAI najprv ako `nový,starý`.",
          "A régi azonnal megszűnik működni a CCRM-ben. Aki már a WhatsAppban van, bejelentkezve marad; a következő belépéshez az új kulcs kell a WAAI-ban. Ha nem akar kiesést, előbb `új,régi` alakban tegye a WAAI-ba."
        ),
        confirmLabel: t("Create new secret", "Vytvoriť nový kľúč", "Új kulcs létrehozása"),
        cancelLabel: t("Cancel", "Zrušiť", "Mégse"),
        danger: true,
      });
      if (!ok) return;
    }
    setRotating(true);
    try {
      const r = await call({ action: "rotate_sso_secret" });
      if (r.ok && r.data.sso_secret) {
        applyStatus(r.data);
        setNewSecret(r.data.sso_secret);
      } else if (r.status === 409) {
        showToast(t("Save the connection settings first.", "Najprv uložte nastavenia pripojenia.", "Először mentse a kapcsolat beállításait."), "error");
      } else {
        showToast(t("Could not create the secret.", "Kľúč sa nepodarilo vytvoriť.", "A kulcsot nem sikerült létrehozni."), "error");
      }
    } catch {
      showToast(t("Could not create the secret.", "Kľúč sa nepodarilo vytvoriť.", "A kulcsot nem sikerült létrehozni."), "error");
    } finally {
      setRotating(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard title={t("WhatsApp (WAAI)", "WhatsApp (WAAI)", "WhatsApp (WAAI)")}>
        <p className="type-body text-rose-700">{t("Could not load the connection. Reload the page and try again.", "Pripojenie sa nepodarilo načítať. Obnovte stránku a skúste to znova.", "A kapcsolat betöltése nem sikerült. Töltse újra az oldalt, és próbálja újra.")}</p>
      </SectionCard>
    );
  }
  if (!status) {
    return (
      <SectionCard title={t("WhatsApp (WAAI)", "WhatsApp (WAAI)", "WhatsApp (WAAI)")}>
        <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" aria-label={t("Loading", "Načítava sa", "Betöltés")} />
      </SectionCard>
    );
  }

  const hasClient = status.client !== null;
  const stateLabel: Record<TokenRow["state"], string> = {
    active: t("Active", "Aktívny", "Aktív"),
    revoked: t("Revoked", "Odvolaný", "Visszavonva"),
    expired: t("Expired", "Vypršal", "Lejárt"),
  };
  const stateCls: Record<TokenRow["state"], string> = {
    active: "bg-emerald-50 text-emerald-700",
    revoked: "bg-slate-100 text-slate-500",
    expired: "bg-amber-50 text-amber-700",
  };
  const lastUsed = status.tokens.map((x) => x.last_used_at).filter(Boolean).sort().pop() ?? null;
  const toggleIn = (list: string[], value: string, on: boolean) => (on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value));

  return (
    <div className="flex flex-col gap-6">
      {confirmNode}

      <SectionCard
        title={t("Connection", "Pripojenie", "Kapcsolat")}
        description={t(
          "WAAI is the WhatsApp assistant. It calls CCRM to read the user list and to create and update tasks. CCRM never calls WAAI and never stores its password.",
          "WAAI je WhatsApp asistent. Volá CRM, aby si prečítal zoznam používateľov a vytváral a upravoval úlohy. CRM nikdy nevolá WAAI a neukladá jeho heslo.",
          "A WAAI a WhatsApp asszisztens. A CCRM-et hívja a felhasználólista olvasásához, valamint feladatok létrehozásához és módosításához. A CCRM sosem hívja a WAAI-t, és nem tárolja a jelszavát."
        )}
        action={
          <button type="button" className={primaryBtn} disabled={saving} onClick={save}>
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {t("Save", "Uložiť", "Mentés")}
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-5 ws-lg:grid-cols-2">
          <Toggle
            checked={active}
            onChange={setActive}
            label={t("Connection enabled", "Pripojenie zapnuté", "Kapcsolat bekapcsolva")}
            hint={t("Off: every WAAI request is refused (401), tokens stay as they are.", "Vypnuté: každá požiadavka z WAAI sa odmietne (401), tokeny zostanú.", "Kikapcsolva: minden WAAI-kérés elutasításra kerül (401), a tokenek megmaradnak.")}
          />
          <Field
            label={t("WAAI address", "Adresa WAAI", "A WAAI címe")}
            hint={t(
              "The standalone WAAI, e.g. https://wa.example.sk. Optional for the native interface through this CRM (then only used for “Open in a new tab”); needed for the embedded interface and for a direct connection.",
              "Samostatná WAAI, napr. https://wa.example.sk. Pre natívne rozhranie cez toto CRM je voliteľná (použije sa len pri „Otvoriť v novej karte“); potrebná je pre vložené rozhranie a pre priame pripojenie.",
              "Az önálló WAAI, pl. https://wa.example.sk. A CRM-en keresztüli natív felülethez nem kötelező (csak a „Megnyitás új lapon” használja); a beágyazott felülethez és a közvetlen kapcsolathoz szükséges."
            )}
            error={fieldErrors.embed_url}
          >
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://wa.example.sk" inputMode="url" autoComplete="off" />
          </Field>
        </div>

        <SettingsGroup
          title={t("WhatsApp module", "Modul WhatsApp", "WhatsApp modul")}
          description={t(
            "How the WhatsApp module looks and how it reaches WAAI.",
            "Ako modul WhatsApp vyzerá a ako sa dostane k WAAI.",
            "Hogyan néz ki a WhatsApp modul, és hogyan éri el a WAAI-t."
          )}
        >
          <div className="grid grid-cols-1 gap-5 ws-lg:grid-cols-2">
            <Choice
              name="waai-module-ui"
              label={t("Interface", "Rozhranie", "Felület")}
              value={moduleUi}
              onChange={setModuleUi}
              options={[
                { value: "native", label: t("Native", "Natívne", "Natív"), hint: t("Part of the CRM: same look, dialogs and text size. Still being completed.", "Súčasť CRM: rovnaký vzhľad, dialógy a veľkosť písma. Stále sa dokončuje.", "A CRM része: azonos megjelenés, párbeszédablakok és betűméret. Még készül.") },
                { value: "embedded", label: t("Embedded", "Vložené", "Beágyazott"), hint: t("The full WAAI app in a frame. Needs the WAAI address.", "Celá aplikácia WAAI v ráme. Vyžaduje adresu WAAI.", "A teljes WAAI alkalmazás egy keretben. A WAAI címe szükséges.") },
              ]}
            />
            <Choice
              name="waai-module-transport"
              label={t("Connection", "Pripojenie", "Kapcsolat")}
              value={transport}
              onChange={setTransport}
              options={[
                { value: "proxy", label: t("Through this CRM", "Cez toto CRM", "Ezen a CRM-en keresztül"), hint: t("The browser talks to the CRM's own address (/waai-api); no extra DNS record. Needs the proxy of the VPS setup.", "Prehliadač komunikuje s adresou samotného CRM (/waai-api); netreba ďalší DNS záznam. Vyžaduje proxy z nastavenia VPS.", "A böngésző a CRM saját címével kommunikál (/waai-api); nincs szükség extra DNS-rekordra. A VPS-beállítás proxyját igényli.") },
                { value: "direct", label: t("Directly to WAAI", "Priamo na WAAI", "Közvetlenül a WAAI-hoz"), hint: t("The browser calls the WAAI address. WAAI needs MODULE_API_CORS=1, and this CRM must allow that address in its security policy (connect-src, media-src).", "Prehliadač volá adresu WAAI. WAAI potrebuje MODULE_API_CORS=1 a toto CRM musí túto adresu povoliť vo svojej bezpečnostnej politike (connect-src, media-src).", "A böngésző a WAAI címét hívja. A WAAI-nak MODULE_API_CORS=1 kell, és ennek a CRM-nek engedélyeznie kell a címet a biztonsági szabályzatában (connect-src, media-src).") },
              ]}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup
          title={t("Owners", "Vlastníci", "Tulajdonosok")}
          description={t(
            "WAAI creates tasks on behalf of these users. Pick everyone who has a WhatsApp account connected to WAAI.",
            "WAAI vytvára úlohy v mene týchto používateľov. Vyberte každého, kto má v WAAI pripojený WhatsApp účet.",
            "A WAAI ezen felhasználók nevében hoz létre feladatokat. Válassza ki mindenkit, akinek WhatsApp-fiókja kapcsolódik a WAAI-hoz."
          )}
        >
          <div className="grid grid-cols-1 gap-2 ws-sm:grid-cols-2 ws-lg:grid-cols-3">
            {status.users.map((u) => (
              <Toggle key={u.id} checked={owners.includes(u.id)} onChange={(on) => setOwners(toggleIn(owners, u.id, on))} label={u.name} />
            ))}
          </div>
          {fieldErrors.owner_user_ids && <span className="type-meta text-rose-600">{fieldErrors.owner_user_ids}</span>}
        </SettingsGroup>

        <SettingsGroup
          title={t("What WAAI may do", "Čo smie WAAI robiť", "Mit tehet a WAAI")}
          description={t("Each permission can be switched off on its own.", "Každé oprávnenie sa dá vypnúť samostatne.", "Minden jogosultság külön kikapcsolható.")}
        >
          <div className="grid grid-cols-1 gap-2 ws-lg:grid-cols-2">
            {WAAI_SCOPES.map((s) => (
              <Toggle key={s} checked={scopes.includes(s)} onChange={(on) => setScopes(toggleIn(scopes, s, on))} label={t(...SCOPE_LABEL[s])} hint={s} />
            ))}
          </div>
          {fieldErrors.scopes && <span className="type-meta text-rose-600">{fieldErrors.scopes}</span>}
        </SettingsGroup>

        <div className="grid grid-cols-1 gap-5 ws-lg:grid-cols-2">
          <Field
            label={t("Allowed addresses", "Povolené adresy", "Engedélyezett címek")}
            hint={t(
              "IP addresses or blocks WAAI calls from, one per line. Empty = any address (the token is still required).",
              "IP adresy alebo bloky, z ktorých WAAI volá, každá na riadok. Prázdne = ľubovoľná adresa (token je stále potrebný).",
              "Azok az IP-címek vagy tartományok, ahonnan a WAAI hív, soronként egy. Üres = bármely cím (a token ettől még kötelező)."
            )}
            error={fieldErrors.allowed_ips}
          >
            <textarea className={`${inputCls} min-h-24 py-2 font-mono`} value={ipText} onChange={(e) => setIpText(e.target.value)} placeholder="172.31.250.10" spellCheck={false} />
          </Field>
          <div className="flex flex-col gap-5">
            <Toggle
              checked={direct}
              onChange={setDirect}
              label={t("Direct connection only", "Iba priame pripojenie", "Csak közvetlen kapcsolat")}
              hint={t("Refuse requests that came through a proxy. Use when WAAI and CCRM share a private network.", "Odmietnuť požiadavky, ktoré prešli cez proxy. Použite, keď WAAI a CRM zdieľajú súkromnú sieť.", "Elutasítja a proxyn át érkező kéréseket. Akkor használja, ha a WAAI és a CCRM közös privát hálózaton van.")}
            />
            <Field
              label={t("Days to deadline when the chat names none", "Dní do termínu, ak chat žiadny neuvádza", "Határidő napokban, ha a csevegés nem nevez meg")}
              hint={t("Tasks from WhatsApp need a deadline in CCRM: today plus this many days.", "Úlohy z WhatsAppu potrebujú v CRM termín: dnes plus tento počet dní.", "A WhatsApp-feladatoknak a CCRM-ben határidő kell: a mai nap plusz ennyi nap.")}
              error={fieldErrors.default_deadline_days}
            >
              <input className={`${inputCls} max-w-32`} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
            </Field>
            <Field
              label={t("Tasks WAAI may read back", "Úlohy, ktoré môže WAAI čítať", "A WAAI által visszaolvasható feladatok")}
              hint={t("Only used when WAAI pulls CRM tasks (off at first).", "Použije sa, len keď WAAI preberá úlohy z CRM (spočiatku vypnuté).", "Csak akkor számít, ha a WAAI CCRM-feladatokat húz le (kezdetben ki van kapcsolva).")}
            >
              <select className={inputCls} value={feedScope} onChange={(e) => setFeedScope(e.target.value as "owners" | "all")}>
                <option value="owners">{t("Only the owners' tasks", "Iba úlohy vlastníkov", "Csak a tulajdonosok feladatai")}</option>
                <option value="all">{t("All tasks", "Všetky úlohy", "Minden feladat")}</option>
              </select>
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Access tokens", "Prístupové tokeny", "Hozzáférési tokenek")}
        description={t(
          "WAAI signs in with a token. A token is shown once, when you create it. Create the new one before revoking the old one and nothing is interrupted.",
          "WAAI sa prihlasuje tokenom. Token sa zobrazí raz, pri vytvorení. Nový vytvorte pred odvolaním starého a nič sa nepreruší.",
          "A WAAI tokennel jelentkezik be. A token egyszer, létrehozáskor látható. Az újat hozza létre a régi visszavonása előtt, így nem szakad meg a működés."
        )}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className={`${inputCls} w-auto`}
              value={expiry}
              min={minExpiry}
              onChange={(e) => setExpiry(e.target.value)}
              aria-label={t("Expires on (optional)", "Platí do (voliteľné)", "Lejárat (nem kötelező)")}
              title={t("Expires on (optional)", "Platí do (voliteľné)", "Lejárat (nem kötelező)")}
            />
            <button type="button" className={primaryBtn} disabled={issuing || !hasClient} onClick={issueToken}>
              {issuing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {t("Create token", "Vytvoriť token", "Token létrehozása")}
            </button>
          </div>
        }
      >
        {!hasClient && (
          <p className="type-body text-slate-500">{t("Save the connection settings first, then create a token.", "Najprv uložte nastavenia pripojenia, potom vytvorte token.", "Először mentse a kapcsolat beállításait, utána hozzon létre tokent.")}</p>
        )}

        {newToken && (
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="type-label text-amber-900">
              {t("Copy it now. It is not shown again.", "Skopírujte ho hneď. Znova sa nezobrazí.", "Másolja ki most. Többé nem jelenik meg.")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-caption text-slate-800" data-testid="waai-new-token">{newToken}</code>
              <CopyButton text={newToken} t={t} />
            </div>
            <p className="type-meta text-amber-900">
              {t("Put these lines in WAAI's .env (the ai-worker container only), then restart it:", "Tieto riadky vložte do .env súboru WAAI (iba kontajner ai-worker) a kontajner reštartujte:", "Ezeket a sorokat tegye a WAAI .env fájljába (csak az ai-worker konténerhez), majd indítsa újra:")}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 font-mono text-caption text-slate-800">{waaiEnvSnippet(window.location.origin, newToken)}</pre>
              <CopyButton text={waaiEnvSnippet(window.location.origin, newToken)} t={t} />
            </div>
            <div>
              <button type="button" className={secondaryBtn} onClick={() => setNewToken(null)}>
                {t("I have saved it", "Uložil som si ho", "Elmentettem")}
              </button>
            </div>
          </div>
        )}

        {status.tokens.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100">
            {status.tokens.map((tok) => (
              <li key={tok.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-ui text-slate-800">ccrm_int_{tok.prefix}…</code>
                    <span className={`rounded-full px-2 py-0.5 type-overline ${stateCls[tok.state]}`}>{stateLabel[tok.state]}</span>
                  </div>
                  <span className="type-meta text-slate-500">
                    {t("Created", "Vytvorený", "Létrehozva")} {fmtDate(tok.created_at, activeLang)}
                    {tok.expires_at && ` · ${t("expires", "platí do", "lejár")} ${fmtDate(tok.expires_at, activeLang)}`}
                    {" · "}
                    {tok.last_used_at ? `${t("last used", "naposledy použitý", "utoljára használva")} ${fmtDate(tok.last_used_at, activeLang)}${tok.last_used_ip ? ` (${tok.last_used_ip})` : ""}` : t("never used", "nepoužitý", "még nem használt")}
                  </span>
                </div>
                {tok.state === "active" && (
                  <button type="button" className={`${secondaryBtn} text-rose-700`} onClick={() => revoke(tok)}>
                    <Trash2 className="h-4 w-4" />
                    {t("Revoke", "Odvolať", "Visszavonás")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {hasClient && (
          <p className="type-meta text-slate-500">
            {lastUsed
              ? t(`WAAI last called CCRM on ${fmtDate(lastUsed, activeLang)}.`, `WAAI naposledy volal CRM ${fmtDate(lastUsed, activeLang)}.`, `A WAAI utoljára ${fmtDate(lastUsed, activeLang)} hívta a CCRM-et.`)
              : t("WAAI has not called CCRM yet.", "WAAI zatiaľ nevolal CRM.", "A WAAI még nem hívta a CCRM-et.")}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t("Sign-in to the WhatsApp module", "Prihlásenie do modulu WhatsApp", "Belépés a WhatsApp modulba")}
        description={t(
          "The WhatsApp module shows WAAI inside CCRM and signs each user in as the WAAI user they are linked to. CCRM signs a 60-second token with this secret; WAAI checks it with the same secret. It is separate from the access token above and is shown once.",
          "Modul WhatsApp zobrazí WAAI priamo v CRM a prihlási každého používateľa ako používateľa WAAI, s ktorým je prepojený. CRM podpíše 60-sekundový token týmto kľúčom a WAAI ho overí rovnakým kľúčom. Je oddelený od prístupového tokenu vyššie a zobrazí sa raz.",
          "A WhatsApp modul a WAAI-t a CCRM-ben jeleníti meg, és mindenkit azon WAAI-felhasználóként léptet be, akihez kötve van. A CCRM ezzel a kulccsal ír alá egy 60 másodperces tokent, a WAAI ugyanezzel a kulccsal ellenőrzi. Független a fenti hozzáférési tokentől, és egyszer látható."
        )}
        action={
          <button type="button" className={primaryBtn} disabled={rotating || !hasClient} onClick={rotateSecret}>
            {rotating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {status.client?.has_sso_secret ? t("Create new secret", "Vytvoriť nový kľúč", "Új kulcs létrehozása") : t("Create secret", "Vytvoriť kľúč", "Kulcs létrehozása")}
          </button>
        }
      >
        {!hasClient && (
          <p className="type-body text-slate-500">{t("Save the connection settings first, then create the secret.", "Najprv uložte nastavenia pripojenia, potom vytvorte kľúč.", "Először mentse a kapcsolat beállításait, utána hozza létre a kulcsot.")}</p>
        )}
        {hasClient && (
          <p className="type-body text-slate-600">
            {status.client?.has_sso_secret
              ? t("A secret is set.", "Kľúč je nastavený.", "A kulcs be van állítva.")
              : t("No secret yet: the WhatsApp module cannot sign anyone in.", "Zatiaľ žiadny kľúč: modul WhatsApp nemôže nikoho prihlásiť.", "Még nincs kulcs: a WhatsApp modul nem tud senkit beléptetni.")}
            {" "}
            {status.client?.embed_url || (status.client?.module_ui === "native" && status.client.module_transport === "proxy")
              ? ""
              : t("Enter the WAAI address above as well.", "Zadajte vyššie aj adresu WAAI.", "Adja meg fent a WAAI címét is.")}
          </p>
        )}

        {newSecret && (
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="type-label text-amber-900">
              {t("Copy it now. It is not shown again.", "Skopírujte ho hneď. Znova sa nezobrazí.", "Másolja ki most. Többé nem jelenik meg.")}
            </p>
            <p className="type-meta text-amber-900">
              {t(
                "Put these lines in WAAI's .env (the web container, and caddy for the last one), then restart them. To swap without a gap, write CCRM_SSO_SECRET as new,old first.",
                "Tieto riadky vložte do .env súboru WAAI (kontajner web a pre posledný riadok caddy) a reštartujte ich. Ak chcete kľúč vymeniť bez prerušenia, najprv zapíšte CCRM_SSO_SECRET ako nový,starý.",
                "Ezeket a sorokat tegye a WAAI .env fájljába (a web konténerhez, az utolsót pedig a caddyhez), majd indítsa újra őket. Kiesés nélküli cseréhez az CCRM_SSO_SECRET-et írja előbb új,régi alakban."
              )}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 font-mono text-caption text-slate-800" data-testid="waai-new-secret">{waaiSsoEnvSnippet(window.location.origin, newSecret)}</pre>
              <CopyButton text={waaiSsoEnvSnippet(window.location.origin, newSecret)} t={t} />
            </div>
            <div>
              <button type="button" className={secondaryBtn} onClick={() => setNewSecret(null)}>
                {t("I have saved it", "Uložil som si ho", "Elmentettem")}
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
