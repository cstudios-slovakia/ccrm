import { useEffect, useState } from "react";
import { Surface } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import type { Language } from "../../utils/translations";

interface Named {
  id: string;
  name: string;
  email?: string;
}

interface Catalog {
  projects: Named[];
  users: Named[];
  ccrmProjects: Named[];
  ccrmUsers: Named[];
  projectMap: Record<string, string>;
  userMap: Record<string, string>;
  defaultUserMap: Record<string, string>;
}

interface Preview {
  alreadyImported: number;
  ready: number;
  total: number;
  skippedUsers: number;
  unmappedProjects: number;
  imported: number;
  preview: boolean;
}

const asRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
};

const postImport = async (payload: Record<string, unknown>): Promise<any> => {
  const res = await fetch("/api/time_entries.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "import", ...payload }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success !== true) {
    throw new TimeApiError(body?.code || "save_failed", res.status);
  }
  return body;
};

/**
 * Settings → map Toggl projects and users, preview a date range, import.
 * Idempotent: the server skips rows whose Toggl id is already stored.
 */
export function TogglImportPanel({ language, t, canEdit }: { language: Language; t: (en: string, sk: string, hu: string) => string; canEdit: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await postImport({ mode: "catalog" });
      const next: Catalog = {
        projects: body.projects ?? [],
        users: body.users ?? [],
        ccrmProjects: body.ccrmProjects ?? [],
        ccrmUsers: body.ccrmUsers ?? [],
        projectMap: asRecord(body.projectMap),
        userMap: asRecord(body.userMap),
        defaultUserMap: asRecord(body.defaultUserMap),
      };
      setCatalog(next);
      setProjectMap(next.projectMap);
      const users: Record<string, string> = { ...next.defaultUserMap, ...next.userMap };
      setUserMap(users);
    } catch (e) {
      setError(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canEdit) void load();
    // The catalog is loaded once when the section opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const run = async (mode: "preview" | "commit") => {
    setLoading(true);
    setError(null);
    try {
      const body = await postImport({ mode, from, to, projectMap, userMap });
      setPreview({
        alreadyImported: Number(body.alreadyImported) || 0,
        ready: Number(body.ready) || 0,
        total: Number(body.total) || 0,
        skippedUsers: Number(body.skippedUsers) || 0,
        unmappedProjects: Number(body.unmappedProjects) || 0,
        imported: Number(body.imported) || 0,
        preview: body.preview !== false,
      });
      if (mode === "commit") {
        window.showToast?.(t(
          `Imported ${Number(body.imported) || 0} entries.`,
          `Importovaných záznamov: ${Number(body.imported) || 0}.`,
          `Importált bejegyzések: ${Number(body.imported) || 0}.`,
        ));
      }
    } catch (e) {
      setError(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t));
    } finally {
      setLoading(false);
    }
  };

  const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none focus:border-primary disabled:bg-slate-50";

  return (
    <Surface className="space-y-4" data-testid="toggl-import">
      <h3 className="type-card-title text-slate-900">{t("Map projects and import from Toggl", "Mapovať projekty a importovať z Toggl", "Projektek hozzárendelése és importálás Togglból")}</h3>
      <p className="text-body text-slate-500">
        {t(
          "One-way import into CCRM. Toggl hours on the employee summary stay where they are. Clockify is not imported. The same Toggl entry is never imported twice.",
          "Jednosmerný import do CCRM. Hodiny z Toggl v súhrne zamestnanca zostávajú. Clockify sa neimportuje. Ten istý záznam z Toggl sa nikdy neimportuje dvakrát.",
          "Egyirányú import a CCRM-be. A Toggl-órák a munkatárs összesítőjében megmaradnak. A Clockify nem importálható. Ugyanaz a Toggl-bejegyzés nem kerül be kétszer.",
        )}
      </p>
      {error && <p className="text-ui text-rose-700">{error}</p>}
      <div className="grid gap-3 ws-sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="type-label text-slate-600">{t("From", "Od", "Ettől")}</span>
          <input type="date" disabled={!canEdit} value={from} onChange={(e) => setFrom(e.target.value)} className={field} data-testid="toggl-import-from" />
        </label>
        <label className="grid gap-1">
          <span className="type-label text-slate-600">{t("To", "Do", "Eddig")}</span>
          <input type="date" disabled={!canEdit} value={to} onChange={(e) => setTo(e.target.value)} className={field} data-testid="toggl-import-to" />
        </label>
      </div>

      {catalog && (
        <div className="grid gap-4">
          <MappingList
            title={t("Projects", "Projekty", "Projektek")}
            rows={catalog.projects}
            options={catalog.ccrmProjects}
            value={projectMap}
            onChange={setProjectMap}
            emptyLabel={t("Leave unassigned", "Nepriradiť", "Nincs hozzárendelve")}
            disabled={!canEdit}
          />
          <MappingList
            title={t("Users", "Používatelia", "Felhasználók")}
            rows={catalog.users}
            options={catalog.ccrmUsers}
            value={userMap}
            onChange={setUserMap}
            emptyLabel={t("Skip this user", "Preskočiť používateľa", "Felhasználó kihagyása")}
            disabled={!canEdit}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!canEdit || loading} onClick={() => void run("preview")} data-testid="toggl-import-preview" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-ui font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
          {loading ? t("Loading…", "Načítava sa…", "Betöltés…") : t("Preview", "Náhľad", "Előnézet")}
        </button>
        {canEdit && (
          <HoldToConfirmButton
            onConfirm={() => void run("commit")}
            lang={language}
            what={`${from} – ${to}`}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer"
          >
            {t("Hold to import", "Podržte pre import", "Tartsa az importhoz")}
          </HoldToConfirmButton>
        )}
      </div>

      {preview && (
        <p className="text-ui text-slate-700" data-testid="toggl-import-result">
          {t(
            `${preview.alreadyImported} entries already imported. ${preview.preview ? preview.ready : preview.imported} ${preview.preview ? "ready to import" : "imported"} of ${preview.total}.`,
            `${preview.alreadyImported} záznamov už bolo importovaných. ${preview.preview ? preview.ready : preview.imported} ${preview.preview ? "pripravených na import" : "importovaných"} z ${preview.total}.`,
            `${preview.alreadyImported} bejegyzés már importálva. ${preview.preview ? preview.ready : preview.imported} ${preview.preview ? "importálásra kész" : "importálva"} a ${preview.total} közül.`,
          )}
          {preview.skippedUsers > 0 ? ` ${t(`${preview.skippedUsers} skipped (no user).`, `${preview.skippedUsers} preskočených (bez používateľa).`, `${preview.skippedUsers} kihagyva (nincs felhasználó).`)}` : ""}
          {preview.unmappedProjects > 0 ? ` ${t(`${preview.unmappedProjects} without a project.`, `${preview.unmappedProjects} bez projektu.`, `${preview.unmappedProjects} projekt nélkül.`)}` : ""}
        </p>
      )}
    </Surface>
  );
}

function MappingList({
  title,
  rows,
  options,
  value,
  onChange,
  emptyLabel,
  disabled,
}: {
  title: string;
  rows: Named[];
  options: Named[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  emptyLabel: string;
  disabled: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h4 className="type-label text-slate-600">{title}</h4>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id} className="grid items-center gap-2 ws-sm:grid-cols-2">
            <span className="truncate text-ui text-slate-800">{row.name || row.id}</span>
            <select
              disabled={disabled}
              value={value[row.id] ?? ""}
              onChange={(e) => onChange({ ...value, [row.id]: e.target.value })}
              className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-ui"
            >
              <option value="">{emptyLabel}</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name || opt.email || opt.id}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
