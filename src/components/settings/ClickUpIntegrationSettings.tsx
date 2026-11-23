import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, PlugZap, RefreshCw, AlertCircle } from "lucide-react";
import type { Language } from "../../utils/translations";
import { isSecretMask } from "../../utils/aiConfig";
import { withBrand } from "../../utils/brand";
import { CustomSelect } from "../ui/CustomSelect";
import { SecretInput } from "../ui/SecretInput";
import { SaveStatus, SectionCard, SettingsGroup } from "./SectionCard";
import { useAutosave } from "./useAutosave";

interface ClickUpTeam {
  id: string;
  name: string;
}

interface ClickUpConfigState {
  enabled: boolean;
  hasToken: boolean;
  apiToken: string;
  teamId: string;
  teamName: string;
  webhookActive: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

interface ClickUpStatusResponse {
  success: boolean;
  config: ClickUpConfigState;
  connected: boolean;
  linkedProjectsCount: number;
  syncedTasksCount: number;
}

const ENDPOINT = "/api/clickup.php";

const showToast = (message: string, variant?: "error" | "warning") =>
  (window as unknown as { showToast?: (m: string, v?: string) => void }).showToast?.(message, variant);

const secondaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-ui font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const primaryBtn =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-entity-solid px-5 text-ui font-bold text-white shadow-xs transition-colors hover:bg-entity-solid-hover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const fmtStamp = (value: string | null, lang: Language): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const locale = lang === "sk" ? "sk-SK" : lang === "hu" ? "hu-HU" : "en-GB";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
};

/**
 * Settings -> Connections & system -> Integrations -> ClickUp:
 * stores an encrypted workspace API token (`pk_...`) and lets projects link
 * one or more ClickUp lists as read-only task & subtask mirrors.
 */
export const ClickUpIntegrationSettings: React.FC<{
  activeLang: Language;
  canEdit: boolean;
  onConnectionChange?: (connected: boolean) => void;
}> = ({ activeLang, canEdit, onConnectionChange }) => {
  const t = (en: string, sk: string, hu: string) =>
    activeLang === "sk" ? sk : activeLang === "hu" ? hu : en;

  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Draft settings synced via useAutosave
  const [enabled, setEnabled] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [hadStoredToken, setHadStoredToken] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");

  // Baseline JSON of the last server-confirmed state
  const [storedJson, setStoredJson] = useState<string | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  // Auxiliary server metadata & connection-test results
  const [connected, setConnected] = useState(false);
  const [webhookActive, setWebhookActive] = useState(false);
  const [linkedProjectsCount, setLinkedProjectsCount] = useState(0);
  const [syncedTasksCount, setSyncedTasksCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const [teams, setTeams] = useState<ClickUpTeam[]>([]);
  const [testing, setTesting] = useState(false);
  const [testedUser, setTestedUser] = useState<{ username: string; email: string } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const applyServerStatus = useCallback((data: ClickUpStatusResponse) => {
    const cfg = data.config;
    const snap = JSON.stringify({
      enabled: Boolean(cfg.enabled),
      apiToken: cfg.apiToken || "",
      teamId: cfg.teamId || "",
      teamName: cfg.teamName || "",
    });
    setEnabled(Boolean(cfg.enabled));
    setApiToken(cfg.apiToken || "");
    setHadStoredToken(Boolean(cfg.hasToken));
    setTeamId(cfg.teamId || "");
    setTeamName(cfg.teamName || "");
    setStoredJson(snap);
    setConnected(Boolean(data.connected));
    setWebhookActive(Boolean(cfg.webhookActive));
    setLinkedProjectsCount(Number(data.linkedProjectsCount || 0));
    setSyncedTasksCount(Number(data.syncedTasksCount || 0));
    setLastSyncAt(cfg.lastSyncAt ?? null);
    setLastSyncError(cfg.lastSyncError ?? null);
    if (cfg.teamId && cfg.teamName) {
      setTeams((prev) =>
        prev.some((x) => x.id === cfg.teamId) ? prev : [{ id: cfg.teamId, name: cfg.teamName }, ...prev],
      );
    }
    onConnectionChangeRef.current?.(Boolean(data.connected));
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${ENDPOINT}?action=status`, { credentials: "same-origin" });
      const data = (await res.json().catch(() => null)) as ClickUpStatusResponse | null;
      if (res.ok && data?.success && data.config) {
        applyServerStatus(data);
        setLoaded(true);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    }
  }, [applyServerStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const draftJson = useMemo(
    () =>
      JSON.stringify({
        enabled,
        apiToken,
        teamId,
        teamName,
      }),
    [enabled, apiToken, teamId, teamName],
  );

  const dirty = loaded && storedJson !== null && draftJson !== storedJson;

  const saveConfig = useCallback(
    async (rawJson: string) => {
      try {
        const draft = JSON.parse(rawJson) as {
          enabled: boolean;
          apiToken: string;
          teamId: string;
          teamName: string;
        };
        const clearToken = hadStoredToken && draft.apiToken.trim() === "";
        const res = await fetch(ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_config",
            enabled: draft.enabled,
            apiToken: draft.apiToken,
            clearToken,
            teamId: draft.teamId,
            teamName: draft.teamName,
          }),
        });
        const data = (await res.json().catch(() => null)) as (ClickUpStatusResponse & { message?: string }) | null;
        if (res.ok && data?.success && data.config) {
          applyServerStatus(data);
        } else {
          showToast(
            data?.message ||
              t(
                "Failed to save ClickUp settings.",
                "Nastavenia ClickUp sa nepodarilo uložiť.",
                "A ClickUp-beállítások mentése nem sikerült.",
              ),
            "error",
          );
        }
      } catch {
        showToast(
          t(
            "Failed to save ClickUp settings.",
            "Nastavenia ClickUp sa nepodarilo uložiť.",
            "A ClickUp-beállítások mentése nem sikerült.",
          ),
          "error",
        );
      }
    },
    [applyServerStatus, hadStoredToken, activeLang],
  );

  const saveStatus = useAutosave({
    value: draftJson,
    dirty,
    enabled: canEdit && loaded,
    save: saveConfig,
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_connection",
          apiToken: isSecretMask(apiToken) ? apiToken : apiToken.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const fetchedTeams: ClickUpTeam[] = Array.isArray(data.teams) ? data.teams : [];
        setTeams(fetchedTeams);
        setTestedUser(
          data.user
            ? { username: String(data.user.username || ""), email: String(data.user.email || "") }
            : null,
        );
        if (!teamId && fetchedTeams.length > 0) {
          setTeamId(fetchedTeams[0].id);
          setTeamName(fetchedTeams[0].name);
          if (!enabled) setEnabled(true);
        } else if (teamId) {
          const match = fetchedTeams.find((tm) => tm.id === teamId);
          if (match && match.name !== teamName) setTeamName(match.name);
        }
      } else {
        setTestedUser(null);
        setTestError(
          data?.message ||
            t(
              "Connection failed. Check your ClickUp API token.",
              "Pripojenie zlyhalo. Skontrolujte API token ClickUp.",
              "A csatlakozás sikertelen. Ellenőrizze a ClickUp API tokent.",
            ),
        );
      }
    } catch {
      setTestedUser(null);
      setTestError(
        t(
          "Network error while testing ClickUp.",
          "Chyba siete pri testovaní ClickUp.",
          "Hálózati hiba a ClickUp tesztelése közben.",
        ),
      );
    } finally {
      setTesting(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_all" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        if (data.config) {
          setLastSyncAt(data.config.lastSyncAt ?? null);
          setLastSyncError(data.config.lastSyncError ?? null);
        }
        setLinkedProjectsCount(Number(data.linkedProjectsCount ?? linkedProjectsCount));
        setSyncedTasksCount(Number(data.syncedTasksCount ?? syncedTasksCount));
        showToast(
          t(
            `Synced ${data.synced ?? 0} ClickUp tasks across ${data.projects ?? 0} projects.`,
            `Synchronizovaných ${data.synced ?? 0} ClickUp úloh v ${data.projects ?? 0} projektoch.`,
            `${data.synced ?? 0} ClickUp feladat szinkronizálva ${data.projects ?? 0} projektben.`,
          ),
        );
      } else {
        showToast(
          data?.message ||
            t(
              "ClickUp sync failed.",
              "Synchronizácia ClickUp zlyhala.",
              "A ClickUp szinkronizálása sikertelen.",
            ),
          "error",
        );
      }
    } catch {
      showToast(
        t(
          "ClickUp sync failed.",
          "Synchronizácia ClickUp zlyhala.",
          "A ClickUp szinkronizálása sikertelen.",
        ),
        "error",
      );
    } finally {
      setSyncingAll(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard title="ClickUp" tone="warning" testId="settings-clickup-error">
        <p className="type-body text-amber-800">
          {t(
            "ClickUp settings could not be loaded. Reload the page and try again.",
            "Nastavenia ClickUp sa nepodarilo načítať. Obnovte stránku a skúste znova.",
            "A ClickUp-beállításokat nem sikerült betölteni. Töltse újra az oldalt.",
          )}
        </p>
      </SectionCard>
    );
  }

  if (!loaded) {
    return <div className="h-44 rounded-lg bg-gray-50 animate-pulse" />;
  }

  const workspaceOptions = teams.map((tm) => ({ value: tm.id, label: tm.name }));
  const canProbeToken = canEdit && (isSecretMask(apiToken) || apiToken.trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="ClickUp"
        description={withBrand(
          t(
            "Connect your ClickUp workspace so projects can mirror selected lists and subtasks into {product} for counting and time tracking.",
            "Prepojte workspace v ClickUpe, aby si projekty mohli vybrať zoznamy úloh a podúloh do {product} na výkazy a sledovanie času.",
            "Kapcsolja össze a ClickUp munkaterületet, hogy a projektek átvehessék a kijelölt listák feladatait és alfeladatait a {product} rendszerbe.",
          ),
        )}
        action={<SaveStatus lang={activeLang} status={saveStatus} />}
        testId="settings-clickup-connection"
      >
        <SettingsGroup>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-entity-solid"
              checked={enabled}
              disabled={!canEdit}
              onChange={(e) => setEnabled(e.target.checked)}
              data-testid="clickup-enabled-toggle"
            />
            <span className="flex flex-col">
              <span className="type-label text-gray-800">
                {t("Enable ClickUp integration", "Povoliť integráciu ClickUp", "ClickUp integráció engedélyezése")}
              </span>
              <span className="type-meta text-gray-500">
                {t(
                  "Shows the ClickUp Lists selector on projects and keeps linked tasks mirrored.",
                  "Zobrazí výber zoznamov ClickUp v projektoch a udržiava prepojené úlohy synchronizované.",
                  "Megjeleníti a ClickUp listaválasztót a projekteknél, és szinkronban tartja a feladatokat.",
                )}
              </span>
            </span>
          </label>
        </SettingsGroup>

        <SettingsGroup
          title={t("Personal API token", "Osobný API token", "Személyes API token")}
          description={t(
            "In ClickUp open Settings -> Apps -> API Token (starts with pk_). Stored encrypted on the server.",
            "V ClickUpe otvorte Settings -> Apps -> API Token (začína pk_). Ukladá sa šifrovane na serveri.",
            "A ClickUpban nyissa meg a Settings -> Apps -> API Token menüt (pk_ kezdetű). A szerveren titkosítva tároljuk.",
          )}
        >
          <div className="flex flex-col gap-3 ws-md:flex-row ws-md:items-start">
            <div className="flex-1 min-w-0">
              <SecretInput
                value={apiToken}
                onChange={setApiToken}
                disabled={!canEdit}
                language={activeLang}
                placeholder="pk_..."
                inputClassName="border-gray-200 bg-white focus:border-entity-border focus:ring-entity-solid/25"
              />
            </div>
            <button
              type="button"
              className={primaryBtn}
              disabled={!canProbeToken || testing}
              onClick={handleTestConnection}
              data-testid="clickup-test-btn"
            >
              {testing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PlugZap className="h-4 w-4" aria-hidden="true" />
              )}
              {t("Test connection", "Otestovať pripojenie", "Kapcsolat tesztelése")}
            </button>
          </div>

          {testedUser && (
            <div
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 type-body text-emerald-800"
              data-testid="clickup-test-success"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>
                {t("Connected as", "Pripojené ako", "Csatlakoztatva mint")}{" "}
                <strong>{testedUser.username || testedUser.email}</strong>
                {testedUser.email && testedUser.username ? ` (${testedUser.email})` : ""}
              </span>
            </div>
          )}

          {testError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 type-body text-rose-800"
              data-testid="clickup-test-error"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{testError}</span>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup
          title={t("Workspace", "Workspace", "Munkaterület")}
          description={t(
            "Choose the ClickUp workspace whose spaces and lists projects can pick from.",
            "Vyberte ClickUp workspace, z ktorého priestorov a zoznamov si budú projekty vyberať.",
            "Válassza ki a ClickUp munkaterületet, amelynek listáiból a projektek választhatnak.",
          )}
        >
          {workspaceOptions.length > 0 ? (
            <CustomSelect
              value={teamId}
              disabled={!canEdit}
              onChange={(val) => {
                const chosen = teams.find((tm) => tm.id === val);
                setTeamId(val);
                setTeamName(chosen?.name || val);
              }}
              placeholder={t("Select a ClickUp workspace", "Vyberte workspace", "Válasszon munkaterületet")}
              options={workspaceOptions}
            />
          ) : (
            <p className="type-body text-gray-500">
              {t(
                "Run \"Test connection\" to load available ClickUp workspaces.",
                "Kliknite na \"Otestovať pripojenie\" na načítanie dostupných workspaceov.",
                "Kattintson a \"Kapcsolat tesztelése\" gombra a munkaterületek betöltéséhez.",
              )}
            </p>
          )}
        </SettingsGroup>
      </SectionCard>

      <SectionCard
        title={t("Synchronization", "Synchronizácia", "Szinkronizálás")}
        description={withBrand(
          t(
            "Synced ClickUp tasks stay visible under their project and count across {product} reports and time tracking, while staying hidden from main task lists.",
            "Synchronizované úlohy z ClickUpu sa zobrazia v projekte a započítajú sa do prehľadov a času v {product}, no nezobrazia sa v hlavnom zozname úloh.",
            "A szinkronizált ClickUp feladatok a projektnél látszanak, és beleszámítanak a {product} riportokba és időkövetésbe, de nem jelennek meg a fő feladatlistákban.",
          ),
        )}
        action={
          <button
            type="button"
            className={secondaryBtn}
            disabled={!canEdit || !connected || syncingAll}
            onClick={handleSyncAll}
            data-testid="clickup-sync-all-btn"
          >
            <RefreshCw className={`h-4 w-4 ${syncingAll ? "animate-spin" : ""}`} aria-hidden="true" />
            {syncingAll
              ? t("Syncing…", "Synchronizujem…", "Szinkronizálás…")
              : t("Sync all projects", "Synchronizovať všetky projekty", "Összes projekt szinkronizálása")}
          </button>
        }
        testId="settings-clickup-sync"
      >
        <div className="grid grid-cols-1 gap-4 ws-sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5">
            <div className="type-meta text-gray-500">
              {t("Status", "Stav", "Állapot")}
            </div>
            <div className="mt-1 flex items-center gap-2 type-label text-gray-900">
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-300"}`}
              />
              {connected
                ? webhookActive
                  ? t("Connected (Webhook + Cron)", "Pripojené (Webhook + Cron)", "Csatlakoztatva (Webhook + Cron)")
                  : t("Connected (Cron / Manual)", "Pripojené (Cron / Manuálne)", "Csatlakoztatva (Cron / Kézi)")
                : t("Not connected", "Nepripojené", "Nincs csatlakoztatva")}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5">
            <div className="type-meta text-gray-500">
              {t("Linked projects / tasks", "Prepojené projekty / úlohy", "Kapcsolt projektek / feladatok")}
            </div>
            <div className="mt-1 type-label tabular-nums text-gray-900">
              {linkedProjectsCount} / {syncedTasksCount}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3.5">
            <div className="type-meta text-gray-500">
              {t("Last sync", "Posledná synchronizácia", "Utolsó szinkronizálás")}
            </div>
            <div className="mt-1 type-label text-gray-900">
              {fmtStamp(lastSyncAt, activeLang)}
            </div>
          </div>
        </div>

        {lastSyncError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 type-body text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{lastSyncError}</span>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
