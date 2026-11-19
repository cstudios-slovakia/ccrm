import { useEffect, useState } from "react";
import { Download, Lock } from "lucide-react";
import { Switch } from "../ui/Switch";
import { Surface } from "../layout";
import type { Language } from "../../utils/translations";
import { EXTENSION_VERSION } from "../../utils/timeTrackerRules.ts";
import type { TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { loadActivityRules, saveActivityRules, searchTrackerProjects, type ActivitySite, type TrackerProject } from "../../utils/timeTrackerApi.ts";
import { PairedBrowsers } from "./PairedBrowsers";
import { ProjectLabel } from "./ProjectLabel";
import { projectDisplayName } from "../../utils/projects.ts";
import type { Lead, Project } from "../../types";

interface Props {
  language: Language;
  t: TFn;
  canEdit: boolean;
  isAdmin: boolean;
  extension: TimeTrackingSettings["extension"];
  onExtension: (next: TimeTrackingSettings["extension"]) => void;
  /** The company's projects, to show a watched site's project by name. */
  projects?: Project[];
  /** Client names for projects that have no name of their own. */
  leads?: Lead[];
}

/** Download, pairing, watched sites. Activity capture stays off until the user opts in. */
export function ExtensionSettings({ language, t, canEdit, isAdmin, extension, onExtension, projects: knownProjects = [], leads = [] }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [minMinutes, setMinMinutes] = useState(5);
  const [sites, setSites] = useState<ActivitySite[]>([]);
  const [pattern, setPattern] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<TrackerProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none transition-colors focus:border-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

  useEffect(() => {
    void loadActivityRules()
      .then((rules) => {
        setEnabled(rules.enabled);
        setMinMinutes(rules.minMinutes);
        setSites(rules.sites);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = projectQuery.trim();
    if (q.length < 1) {
      setProjects([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchTrackerProjects(q).then(setProjects).catch(() => setProjects([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [projectQuery]);

  const saveRules = async () => {
    setSaving(true);
    try {
      const saved = await saveActivityRules({ enabled, minMinutes, sites });
      setEnabled(saved.enabled);
      setSites(saved.sites);
      window.showToast?.(t("Activity rules saved.", "Pravidlá aktivity boli uložené.", "A tevékenységi szabályok mentve."));
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setSaving(false);
    }
  };

  const addSite = () => {
    const next = pattern.trim();
    if (!next) return;
    setSites((curr) => [...curr, { pattern: next, projectId }]);
    setPattern("");
    setProjectId(null);
    setProjectQuery("");
    setProjects([]);
  };

  return (
    <Surface className="space-y-4" data-testid="tt-extension-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="type-card-title text-slate-900">{t("Chrome extension", "Rozšírenie Chrome", "Chrome-bővítmény")}</h3>
          <p className="text-body text-slate-500">{t("Zip for Load unpacked. A Web Store listing comes later.", "Zip na načítanie rozbaleného rozšírenia. Záznam v obchode pribudne neskôr.", "Zip a kicsomagolt betöltéshez. Az áruházi bejegyzés később jön.")}</p>
        </div>
        <a
          href={`${import.meta.env.BASE_URL}downloads/ccrm-time-tracker.zip`}
          download
          data-testid="tt-extension-download"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-ui font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <Download className="size-4" />
          {t("Download", "Stiahnuť", "Letöltés")}
          <span className="text-micro font-semibold opacity-80">v{EXTENSION_VERSION}</span>
        </a>
      </div>
      <ol className="grid list-none gap-3 ws-sm:grid-cols-3" data-testid="tt-extension-steps">
        {[
          { n: 1, title: t("Install", "Inštalácia", "Telepítés"), body: t("Download the zip and unzip it. In Chrome open Extensions, turn on Developer mode and press Load unpacked.", "Stiahnite zip a rozbaľte ho. V Chrome otvorte Rozšírenia, zapnite Režim pre vývojárov a stlačte Načítať rozbalené.", "Töltse le a zipet, és csomagolja ki. A Chrome-ban nyissa meg a Bővítményeket, kapcsolja be a Fejlesztői módot, és nyomja meg a Kicsomagolt betöltése gombot.") },
          { n: 2, title: t("Pair", "Spárovanie", "Párosítás"), body: t("Choose the unzipped folder, then press New code below and enter it in the extension.", "Vyberte rozbalený priečinok, nižšie stlačte Nový kód a zadajte ho do rozšírenia.", "Válassza a kicsomagolt mappát, nyomja meg lent az Új kódot, és írja be a bővítménybe.") },
          { n: 3, title: t("Track", "Sledovanie", "Követés"), body: t("Start and stop timers from the extension, or switch on activity capture below.", "Spúšťajte a zastavujte časovače z rozšírenia, alebo nižšie zapnite zaznamenávanie aktivity.", "Indítsa és állítsa le az időzítőket a bővítményből, vagy kapcsolja be lent a tevékenység rögzítését.") },
        ].map((step) => (
          <li key={step.n} className="rounded-xl border border-slate-200 p-3">
            <span className="mb-2 flex size-6 items-center justify-center rounded-full bg-teal-50 text-micro font-semibold text-teal-700">{step.n}</span>
            <p className="text-ui font-semibold text-slate-900">{step.title}</p>
            <p className="text-body text-slate-600">{step.body}</p>
          </li>
        ))}
      </ol>

      {isAdmin && (
        <div className="grid gap-3 rounded-xl border border-slate-200 p-3">
          <p className="type-label text-slate-600">{t("Company", "Firma", "Cég")}</p>
          <label className="flex items-center gap-3 text-ui text-slate-800 cursor-pointer">
            <Switch checked={extension.enabled} disabled={!canEdit} onChange={(next) => onExtension({ ...extension, enabled: next })} />
            {t("Extension can pair", "Rozšírenie sa môže spárovať", "A bővítmény párosíthat")}
          </label>
          <label className="flex items-center gap-3 text-ui text-slate-800 cursor-pointer">
            <Switch checked={extension.activityCaptureAllowed} disabled={!canEdit} onChange={(next) => onExtension({ ...extension, activityCaptureAllowed: next })} />
            {t("Allow activity capture", "Povoliť zaznamenávanie aktivity", "Tevékenység rögzítésének engedélyezése")}
          </label>
          <label className="grid max-w-48 gap-1">
            <span className="type-label text-slate-600">{t("Keep unsorted items (days)", "Ponechať nezaradené (dni)", "Rendezetlen elemek megőrzése (nap)")}</span>
            <input
              disabled={!canEdit}
              type="number"
              min={1}
              max={365}
              value={extension.unsortedRetentionDays}
              onChange={(e) => onExtension({ ...extension, unsortedRetentionDays: Math.max(1, Math.min(365, Number(e.target.value) || 30)) })}
              className={field}
            />
          </label>
          <p className="type-meta text-slate-500">{t("Company switches are stored with Save settings.", "Firemné prepínače sa uložia tlačidlom Uložiť nastavenia.", "A céges kapcsolók a Beállítások mentése gombbal tárolódnak.")}</p>
        </div>
      )}

      <div>
        <h4 className="type-card-title text-slate-900">{t("Paired browsers", "Spárované prehliadače", "Párosított böngészők")}</h4>
        <PairedBrowsers t={t} language={language} />
      </div>

      <div className="grid gap-3 border-t border-slate-100 pt-4">
        <div>
          <h4 className="type-card-title text-slate-900">{t("Activity capture", "Zaznamenávanie aktivity", "Tevékenység rögzítése")}</h4>
          <p className="flex items-start gap-1.5 text-body text-slate-500">
            <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <span>{t("Off until you turn it on. It records the domain, the page title and the times — never the address path or the page itself — and only while no timer is running. Unsorted activity is private: managers never see it.", "Vypnuté, kým to nezapnete. Zaznamenáva doménu, názov stránky a časy — nikdy nie cestu adresy ani samotnú stránku — a len kým nebeží časovač. Nezaradená aktivita je súkromná: manažéri ju nikdy nevidia.", "Kikapcsolva, amíg be nem kapcsolja. A domaint, az oldal címét és az időket rögzíti — soha nem a cím elérési útját vagy magát az oldalt — és csak akkor, ha nem fut időzítő. A rendezetlen tevékenység privát: a vezetők soha nem látják.")}</span>
          </p>
        </div>
        <label className="flex items-center gap-3 text-ui text-slate-800 cursor-pointer">
          <Switch checked={enabled} onChange={setEnabled} testId="tt-activity-opt-in" />
          {t("Capture watched sites", "Sledovať vybrané stránky", "Figyelt oldalak rögzítése")}
        </label>
        <label className="grid max-w-48 gap-1">
          <span className="type-label text-slate-600">{t("Ignore visits shorter than (minutes)", "Ignorovať návštevy kratšie ako (minúty)", "Ennél rövidebb látogatások kihagyása (perc)")}</span>
          <input type="number" min={1} max={120} value={minMinutes} onChange={(e) => setMinMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 5)))} className={field} />
        </label>
        <ul className="grid gap-1">
          {sites.map((site, index) => (
            <li key={`${site.pattern}-${index}`} className="flex items-center gap-2 text-ui text-slate-700">
              <span className="font-semibold">{site.pattern}</span>
              {(() => {
                if (!site.projectId) return <span className="type-meta text-slate-500">{t("no project", "bez projektu", "nincs projekt")}</span>;
                const known = knownProjects.find((p) => p.id === site.projectId);
                return known ? (
                  <ProjectLabel projectId={known.id} name={projectDisplayName(known, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"))} compact className="type-meta" />
                ) : (
                  <span className="type-meta text-slate-400">{site.projectId}</span>
                );
              })()}
              <button type="button" onClick={() => setSites((curr) => curr.filter((_, i) => i !== index))} className="ml-auto text-ui font-semibold text-slate-400 hover:text-rose-600 cursor-pointer">
                {t("Remove", "Odstrániť", "Eltávolítás")}
              </button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 ws-sm:grid-cols-2">
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={t("github.com", "github.com", "github.com")} className={field} />
          <input value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder={t("Suggested project", "Navrhovaný projekt", "Javasolt projekt")} className={field} />
        </div>
        {projects.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setProjectId(project.id);
                  setProjectQuery(project.name);
                  setProjects([]);
                }}
                className={`block w-full px-3 py-2 text-left text-ui hover:bg-slate-50 cursor-pointer ${projectId === project.id ? "bg-teal-50 font-semibold" : ""}`}
              >
                {project.name}
                {project.clientName ? <span className="type-meta text-slate-500"> · {project.clientName}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addSite} className="h-9 rounded-xl border border-slate-200 px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer">
            {t("Add site", "Pridať stránku", "Oldal hozzáadása")}
          </button>
          <button type="button" onClick={() => void saveRules()} disabled={saving} className="h-9 rounded-xl bg-slate-900 px-3 text-ui font-semibold text-white transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-60 cursor-pointer">
            {t("Save activity rules", "Uložiť pravidlá aktivity", "Tevékenységi szabályok mentése")}
          </button>
        </div>
      </div>
    </Surface>
  );
}
