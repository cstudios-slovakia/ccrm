import { useEffect, useState } from "react";
import { Download, Lock } from "lucide-react";
import { Switch } from "../ui/Switch";
import { SettingsCard } from "./SettingsCard";
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
  const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none transition-colors focus:border-primary";

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

  const steps = [
    { n: 1, title: t("Install", "Inštalácia", "Telepítés"), body: t("Download the zip and unzip it. In Chrome open chrome://extensions, turn on Developer mode and press Load unpacked.", "Stiahnite zip a rozbaľte ho. V Chrome otvorte chrome://extensions, zapnite Režim pre vývojárov a stlačte Načítať rozbalené.", "Töltse le a zipet, és csomagolja ki. A Chrome-ban nyissa meg a chrome://extensions oldalt, kapcsolja be a Fejlesztői módot, és nyomja meg a Kicsomagolt betöltése gombot.") },
    { n: 2, title: t("Pair", "Spárovanie", "Párosítás"), body: t("Choose the unzipped folder, then create a one-time code in the pairing card below and enter it in the extension.", "Vyberte rozbalený priečinok, v karte spárovania nižšie vytvorte jednorazový kód a zadajte ho do rozšírenia.", "Válassza a kicsomagolt mappát, hozzon létre egy egyszer használatos kódot az alábbi párosítókártyán, és írja be a bővítménybe.") },
    { n: 3, title: t("Track", "Sledovanie", "Követés"), body: t("Start and stop timers from the Chrome toolbar. The icon shows the running time.", "Spúšťajte a zastavujte časovače z lišty Chrome. Ikona zobrazuje bežiaci čas.", "Indítsa és állítsa le az időzítőket a Chrome eszköztárából. Az ikon a futó időt mutatja.") },
  ];

  return (
    <div className="space-y-6" data-testid="tt-extension-settings">
      <SettingsCard
        title={t("Chrome extension", "Rozšírenie Chrome", "Chrome-bővítmény")}
        description={t("Start and stop timers from the Chrome toolbar. With activity capture on, it also suggests entries from the sites you work on.", "Spúšťajte a zastavujte časovače z lišty Chrome. So zapnutým zaznamenávaním aktivity navrhuje záznamy aj podľa stránok, na ktorých pracujete.", "Indítsa és állítsa le az időzítőket a Chrome eszköztárából. Bekapcsolt tevékenység-rögzítés mellett bejegyzéseket is javasol azokból az oldalakból, amelyeken dolgozik.")}
        action={
          <a
            href={`${import.meta.env.BASE_URL}downloads/ccrm-time-tracker.zip`}
            download
            data-testid="tt-extension-download"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-ui font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Download className="size-4" />
            {t("Download (.zip)", "Stiahnuť (.zip)", "Letöltés (.zip)")}
            <span className="text-micro font-semibold opacity-80">v{EXTENSION_VERSION}</span>
          </a>
        }
      >
        <ol className="grid list-none gap-3 ws-sm:grid-cols-3" data-testid="tt-extension-steps">
          {steps.map((step) => (
            <li key={step.n} className="rounded-2xl border border-slate-200 p-3">
              <p className="text-ui font-semibold text-slate-900">{step.n} · {step.title}</p>
              <p className="mt-1 type-meta text-slate-500">{step.body}</p>
            </li>
          ))}
        </ol>

        {isAdmin && (
          <div className="grid gap-3 rounded-2xl border border-slate-200 p-3">
            <p className="type-label text-slate-600">{t("Company", "Firma", "Cég")}</p>
            <label className="flex items-center gap-3 text-ui text-slate-800 cursor-pointer">
              <Switch checked={extension.enabled} disabled={!canEdit} onChange={(next) => onExtension({ ...extension, enabled: next })} tone="emerald" />
              {t("Extension can pair", "Rozšírenie sa môže spárovať", "A bővítmény párosíthat")}
            </label>
            <label className="flex items-center gap-3 text-ui text-slate-800 cursor-pointer">
              <Switch checked={extension.activityCaptureAllowed} disabled={!canEdit} onChange={(next) => onExtension({ ...extension, activityCaptureAllowed: next })} tone="emerald" />
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
      </SettingsCard>

      <SettingsCard title={t("Paired browsers", "Spárované prehliadače", "Párosított böngészők")}>
        <PairedBrowsers t={t} language={language} />
      </SettingsCard>

      <SettingsCard
        title={t("Suggest entries from my activity", "Navrhovať záznamy z mojej aktivity", "Bejegyzések javaslata a tevékenységemből")}
        description={t("When no timer runs, the extension notes time spent on the sites below and puts it in your Unsorted inbox. Nothing becomes a time entry until you assign it.", "Kým nebeží časovač, rozšírenie si zaznamenáva čas na stránkach nižšie a vkladá ho do vašej schránky Nezaradené. Nič sa nestane záznamom času, kým ho nepriradíte.", "Amíg nem fut időzítő, a bővítmény feljegyzi az alábbi oldalakon töltött időt, és a Rendezetlen postaládába teszi. Semmi nem lesz időbejegyzés, amíg nem rendeli hozzá.")}
        action={<Switch checked={enabled} onChange={setEnabled} testId="tt-activity-opt-in" tone="emerald" label={t("Capture watched sites", "Sledovať vybrané stránky", "Figyelt oldalak rögzítése")} />}
      >
        <p className="flex items-start gap-1.5 type-meta text-slate-500">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          <span>{t("Off until you turn it on. It records the domain, the page title and the times, never the address path or the page itself. Unsorted activity is private: managers never see it.", "Vypnuté, kým to nezapnete. Zaznamenáva doménu, názov stránky a časy, nikdy nie cestu adresy ani samotnú stránku. Nezaradená aktivita je súkromná: manažéri ju nikdy nevidia.", "Kikapcsolva, amíg be nem kapcsolja. A domaint, az oldal címét és az időket rögzíti, soha nem a cím elérési útját vagy magát az oldalt. A rendezetlen tevékenység privát: a vezetők soha nem látják.")}</span>
        </p>
        <div className="grid gap-2">
          <span className="type-label text-slate-600">{t("Watched sites → suggested project", "Sledované stránky → navrhovaný projekt", "Figyelt oldalak → javasolt projekt")}</span>
          {sites.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200" data-testid="tt-watched-sites">
              {sites.map((site, index) => (
                <li key={`${site.pattern}-${index}`} className="flex items-center gap-3 px-3 py-2 text-ui text-slate-700">
                  <span className="min-w-0 shrink-0 font-semibold text-slate-900">{site.pattern}</span>
                  <span className="text-slate-400" aria-hidden>→</span>
                  {(() => {
                    if (!site.projectId) return <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="size-2.5 rounded-full bg-amber-500" />{t("no suggestion", "bez návrhu", "nincs javaslat")}</span>;
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
          )}
        </div>
        <div className="grid gap-2 ws-sm:grid-cols-2">
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={t("github.com", "github.com", "github.com")} aria-label={t("Site", "Stránka", "Oldal")} className={field} />
          <input value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder={t("Suggested project", "Navrhovaný projekt", "Javasolt projekt")} aria-label={t("Suggested project", "Navrhovaný projekt", "Javasolt projekt")} className={field} />
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
                className={`block w-full px-3 py-2 text-left text-ui hover:bg-slate-50 cursor-pointer ${projectId === project.id ? "bg-primary/5 font-semibold" : ""}`}
              >
                {project.name}
                {project.clientName ? <span className="type-meta text-slate-500"> · {project.clientName}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="type-label text-slate-600">{t("Ignore blocks shorter than (min)", "Ignorovať bloky kratšie ako (min)", "Ennél rövidebb blokkok kihagyása (perc)")}</span>
            <input type="number" min={1} max={120} value={minMinutes} onChange={(e) => setMinMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 5)))} className={`${field} w-24`} />
          </label>
          <button type="button" onClick={addSite} className="h-9 rounded-xl border border-slate-200 px-3 text-ui font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 cursor-pointer">
            {t("+ Add site", "+ Pridať stránku", "+ Oldal hozzáadása")}
          </button>
          <button type="button" onClick={() => void saveRules()} disabled={saving} className="h-9 rounded-xl bg-slate-900 px-3 text-ui font-semibold text-white transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-60 cursor-pointer">
            {t("Save activity rules", "Uložiť pravidlá aktivity", "Tevékenységi szabályok mentése")}
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}
