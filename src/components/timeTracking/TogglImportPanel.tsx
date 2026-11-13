import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Surface } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { CustomSelect } from "../ui/CustomSelect";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import type { Language } from "../../utils/translations";
import { PRODUCT_NAME } from "../../utils/brand";

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
  /** Entries from a Toggl project that is not paired, left in Toggl (skipUnpaired). */
  skippedUnpaired: number;
  /** New entries that land without a project (no Toggl project, or unpaired and not skipped). */
  withoutProject: number;
  /** Entries imported earlier without a project whose Toggl project is paired now. */
  projectsToFill: number;
  projectsFilled: number;
  /** Of those, locked entries a non-admin cannot change. */
  projectsFillLocked: number;
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
  const brand = PRODUCT_NAME;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipUnpaired, setSkipUnpaired] = useState(true);
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
      // A reload keeps mappings edited here whose save has not landed yet.
      setProjectMap((prev) => ({ ...next.projectMap, ...prev }));
      setUserMap((prev) => ({ ...next.defaultUserMap, ...next.userMap, ...prev }));
    } catch (e) {
      setError(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t));
    } finally {
      setLoading(false);
    }
  };

  // Every dropdown change is saved on its own (shortly after, so a burst of picks is one
  // request). Saves run one after another, each carrying the whole map, so the last pick wins.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pendingMaps = useRef<{ projectMap: Record<string, string>; userMap: Record<string, string> } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const flushSave = () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const maps = pendingMaps.current;
    if (!maps) return;
    pendingMaps.current = null;
    saveChain.current = saveChain.current.then(async () => {
      try {
        await postImport({ mode: "saveMap", ...maps });
        if (!pendingMaps.current) setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    });
  };
  const saveMaps = (nextProjects: Record<string, string>, nextUsers: Record<string, string>) => {
    pendingMaps.current = { projectMap: nextProjects, userMap: nextUsers };
    setSaveState("saving");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 400);
  };
  // Leaving the section right after a pick still saves it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushSave(), []);

  useEffect(() => {
    if (canEdit) void load();
    // The catalog is loaded once when the section opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const run = async (mode: "preview" | "commit") => {
    setLoading(true);
    setError(null);
    try {
      const body = await postImport({ mode, from, to, projectMap, userMap, skipUnpaired });
      const n = (v: unknown) => Number(v) || 0;
      setPreview({
        alreadyImported: n(body.alreadyImported),
        ready: n(body.ready),
        total: n(body.total),
        skippedUsers: n(body.skippedUsers),
        skippedUnpaired: n(body.skippedUnpaired),
        withoutProject: n(body.withoutProject),
        projectsToFill: n(body.projectsToFill),
        projectsFilled: n(body.projectsFilled),
        projectsFillLocked: n(body.projectsFillLocked),
        imported: n(body.imported),
        preview: body.preview !== false,
      });
      if (mode === "commit") {
        const filled = n(body.projectsFilled);
        window.showToast?.(t(
          `Imported ${n(body.imported)} entries.${filled > 0 ? ` Project set on ${filled} imported earlier.` : ""}`,
          `Importovaných záznamov: ${n(body.imported)}.${filled > 0 ? ` Projekt doplnený pri ${filled} skôr importovaných.` : ""}`,
          `Importált bejegyzések: ${n(body.imported)}.${filled > 0 ? ` ${filled} korábban importált bejegyzés projektje beállítva.` : ""}`,
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
          `One-way import into ${brand}. Toggl hours on the employee summary stay where they are. Clockify is not imported. The same Toggl entry is never imported twice; an entry imported without a project gets one when you pair its Toggl project and import again.`,
          `Jednosmerný import do ${brand}. Hodiny z Toggl v súhrne zamestnanca zostávajú. Clockify sa neimportuje. Ten istý záznam z Toggl sa nikdy neimportuje dvakrát; záznam importovaný bez projektu ho dostane, keď jeho projekt v Toggl priradíte a importujete znova.`,
          `Egyirányú import a ${brand}-be. A Toggl-órák a munkatárs összesítőjében megmaradnak. A Clockify nem importálható. Ugyanaz a Toggl-bejegyzés nem kerül be kétszer; a projekt nélkül importált bejegyzés megkapja a projektjét, ha a Toggl-projektet hozzárendeli és újra importál.`,
        )}
      </p>
      {error && <p className="text-ui text-rose-700">{error}</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={loading} onClick={() => void load()} data-testid="toggl-import-reload" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {t("Reload from Toggl", "Načítať znova z Toggl", "Újratöltés a Togglból")}
          </button>
          <span className="text-caption text-slate-500">
            {t(
              "Projects and users are read from Toggl when this section opens. Reload to see ones added since.",
              "Projekty a používatelia sa načítajú z Toggl pri otvorení tejto sekcie. Nové, pridané medzitým, zobrazíte opätovným načítaním.",
              "A projektek és felhasználók a szakasz megnyitásakor töltődnek be a Togglból. Az azóta hozzáadottakhoz töltse újra.",
            )}
          </span>
        </div>
      )}

      {catalog && (
        <div className="grid gap-4">
          {saveState !== "idle" && (
            <p
              data-testid="toggl-import-map-status"
              aria-live="polite"
              className={`text-caption font-medium ${saveState === "error" ? "text-rose-700" : saveState === "saved" ? "text-emerald-700" : "text-slate-500"}`}
            >
              {saveState === "saving"
                ? t("Saving the mapping…", "Ukladá sa priradenie…", "Hozzárendelés mentése…")
                : saveState === "saved"
                  ? t("Mapping saved.", "Priradenie uložené.", "Hozzárendelés mentve.")
                  : t("The mapping could not be saved. Pick again or press Preview.", "Priradenie sa nepodarilo uložiť. Vyberte znova alebo stlačte Náhľad.", "A hozzárendelést nem sikerült menteni. Válasszon újra, vagy nyomja meg az Előnézetet.")}
            </p>
          )}
          <MappingList
            title={t("Projects", "Projekty", "Projektek")}
            rows={catalog.projects}
            options={catalog.ccrmProjects}
            value={projectMap}
            onChange={(next) => {
              setProjectMap(next);
              saveMaps(next, userMap);
            }}
            emptyLabel={t("Leave unassigned", "Nepriradiť", "Nincs hozzárendelve")}
            disabled={!canEdit}
            t={t}
            testId="toggl-import-projects"
          />
          <MappingList
            title={t("Users", "Používatelia", "Felhasználók")}
            rows={catalog.users}
            options={catalog.ccrmUsers}
            value={userMap}
            onChange={(next) => {
              setUserMap(next);
              saveMaps(projectMap, next);
            }}
            emptyLabel={t("Skip this user", "Preskočiť používateľa", "Felhasználó kihagyása")}
            disabled={!canEdit}
            t={t}
            testId="toggl-import-users"
          />
        </div>
      )}

      <div className="grid gap-3 border-t border-slate-100 pt-4">
        <h4 className="type-label text-slate-600">{t("Period to import", "Obdobie na import", "Importálandó időszak")}</h4>
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
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={skipUnpaired}
            onChange={(e) => {
              setSkipUnpaired(e.target.checked);
              setPreview(null);
            }}
            className="mt-0.5 size-4 accent-teal-600"
            data-testid="toggl-import-skip-unpaired"
          />
          <span className="grid gap-0.5">
            <span className="text-ui text-slate-800">{t("Skip entries from Toggl projects that are not paired", "Preskočiť záznamy z nepriradených projektov Toggl", "A hozzá nem rendelt Toggl-projektek bejegyzéseinek kihagyása")}</span>
            <span className="text-caption text-slate-500">
              {t(
                "They stay in Toggl and come in with their project once you pair it. Turn this off to import them without a project.",
                "Zostanú v Toggl a prenesú sa aj s projektom, keď ho priradíte. Ak to vypnete, importujú sa bez projektu.",
                "A Togglban maradnak, és a projekt hozzárendelése után a projekttel együtt kerülnek be. Kikapcsolva projekt nélkül importálódnak.",
              )}
            </span>
          </span>
        </label>
      </div>

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
          {preview.skippedUnpaired > 0 ? ` ${t(`${preview.skippedUnpaired} left in Toggl (project not paired).`, `${preview.skippedUnpaired} ponechaných v Toggl (projekt nie je priradený).`, `${preview.skippedUnpaired} a Togglban marad (a projekt nincs hozzárendelve).`)}` : ""}
          {preview.withoutProject > 0 ? ` ${t(`${preview.withoutProject} without a project.`, `${preview.withoutProject} bez projektu.`, `${preview.withoutProject} projekt nélkül.`)}` : ""}
          {preview.preview && preview.projectsToFill > 0 ? ` ${t(`${preview.projectsToFill} imported earlier will get their project.`, `${preview.projectsToFill} skôr importovaných dostane projekt.`, `${preview.projectsToFill} korábban importált bejegyzés megkapja a projektjét.`)}` : ""}
          {!preview.preview && preview.projectsFilled > 0 ? ` ${t(`Project set on ${preview.projectsFilled} imported earlier.`, `Projekt doplnený pri ${preview.projectsFilled} skôr importovaných.`, `${preview.projectsFilled} korábban importált bejegyzés projektje beállítva.`)}` : ""}
          {preview.projectsFillLocked > 0 ? ` ${t(`${preview.projectsFillLocked} imported earlier are locked; an administrator can set their project.`, `${preview.projectsFillLocked} skôr importovaných je zamknutých; projekt im môže doplniť administrátor.`, `${preview.projectsFillLocked} korábban importált bejegyzés zárolva; a projektjüket adminisztrátor állíthatja be.`)}` : ""}
        </p>
      )}
    </Surface>
  );
}

const MAPPING_PAGE_SIZE = 20;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function MappingList({
  title,
  rows,
  options,
  value,
  onChange,
  emptyLabel,
  disabled,
  t,
  testId,
}: {
  title: string;
  rows: Named[];
  options: Named[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  emptyLabel: string;
  disabled: boolean;
  t: (en: string, sk: string, hu: string) => string;
  testId: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const optionLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const opt of options) m.set(opt.id, opt.name || opt.email || opt.id);
    return m;
  }, [options]);

  const selectOptions = useMemo(
    () => [{ value: "", label: emptyLabel }, ...options.map((opt) => ({ value: opt.id, label: optionLabel.get(opt.id) ?? opt.id }))],
    [options, optionLabel, emptyLabel],
  );

  // Matches the Toggl name (or e-mail) or the name it is mapped to, ignoring case and diacritics.
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return rows;
    return rows.filter((row) => fold(`${row.name} ${row.email ?? ""} ${optionLabel.get(value[row.id] ?? "") ?? ""}`).includes(q));
  }, [rows, query, value, optionLabel]);

  if (rows.length === 0) return null;

  const pageCount = Math.max(1, Math.ceil(filtered.length / MAPPING_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const first = current * MAPPING_PAGE_SIZE;
  const visible = filtered.slice(first, first + MAPPING_PAGE_SIZE);
  const mappedCount = rows.filter((row) => (value[row.id] ?? "") !== "").length;
  const pagerBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer";

  return (
    <div className="grid gap-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="type-label text-slate-600">
          {title}{" "}
          <span className="font-normal text-slate-400">
            · {t(`${mappedCount} of ${rows.length} mapped`, `priradené ${mappedCount} z ${rows.length}`, `${mappedCount} / ${rows.length} hozzárendelve`)}
          </span>
        </h4>
        <label className="relative w-full ws-sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={t("Search…", "Hľadať…", "Keresés…")}
            aria-label={`${title}: ${t("search", "hľadať", "keresés")}`}
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-ui outline-none focus:border-primary"
            data-testid={`${testId}-search`}
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="py-3 text-ui text-slate-500">{t("Nothing matches the search.", "Hľadaniu nič nezodpovedá.", "Nincs találat.")}</p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((row) => (
            <li key={row.id} className="grid items-center gap-2 ws-sm:grid-cols-2">
              <span className="truncate text-ui text-slate-800">{row.name || row.id}</span>
              <CustomSelect
                searchable
                disabled={disabled}
                value={value[row.id] ?? ""}
                onChange={(v) => onChange({ ...value, [row.id]: v })}
                options={selectOptions}
              />
            </li>
          ))}
        </ul>
      )}
      {filtered.length > MAPPING_PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-caption text-slate-500">
          <span data-testid={`${testId}-range`}>
            {first + 1}–{Math.min(first + MAPPING_PAGE_SIZE, filtered.length)} {t("of", "z", "/")} {filtered.length}
          </span>
          <button type="button" className={pagerBtn} disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={t("Previous page", "Predchádzajúca strana", "Előző oldal")} data-testid={`${testId}-prev`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={pagerBtn} disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} aria-label={t("Next page", "Ďalšia strana", "Következő oldal")} data-testid={`${testId}-next`}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
