import { SettingsCard } from "./SettingsCard";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import type { StartWhileRunning, TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";

type Parallel = TimeTrackingSettings["parallel"];

const radio = (name: string, value: string, current: string, text: string, onChange: (v: string) => void, disabled: boolean) => (
  <label key={value} className="flex cursor-pointer items-center gap-3 text-ui text-gray-800">
    <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onChange(value)} className="size-4 accent-[var(--entity-accent-solid)]" data-testid={`${name}-${value}`} />
    {text}
  </label>
);

/** Settings → Time tracking → "Parallel tracking": the company rule (docs/TIME-TRACKING-V2.md D5.2, C3-C5). */
export function ParallelTrackingBlock({ t, canEdit, parallel, onChange }: { t: TFn; canEdit: boolean; parallel: Parallel; onChange: (p: Parallel) => void }) {
  const set = (patch: Partial<Parallel>) => onChange({ ...parallel, ...patch });
  const off = !canEdit || !parallel.enabled;
  const pick = (v: string) => set({ sameProject: v as Parallel["sameProject"] });
  return (
    <SettingsCard
      title={t("Parallel tracking", "Súbežné sledovanie", "Párhuzamos követés")}
      titleTestId="tt-parallel"
      description={t(
        "Each project receives the full time; each person's cost is split. The role permission \"Track time in parallel\" decides who may.",
        "Každý projekt dostane celý čas; náklad osoby sa rozdelí. Kto môže, určuje oprávnenie roly „Sledovať čas súbežne“.",
        "Minden projekt a teljes időt megkapja; a személy költsége megoszlik. Hogy kinek szabad, azt a „Idő követése párhuzamosan” szerepkör-jogosultság dönti el.",
      )}
    >
      <label className="flex cursor-pointer items-center gap-3 text-ui text-gray-800">
        <input type="checkbox" disabled={!canEdit} checked={parallel.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-4 accent-[var(--entity-accent-solid)]" data-testid="tt-parallel-enabled" />
        {t("Allow several timers to run at once", "Povoliť beh viacerých časovačov naraz", "Több időzítő futhat egyszerre")}
      </label>
      <label className="grid gap-1 ws-sm:max-w-48">
        <span className="type-label text-gray-600">{t("Maximum at once", "Maximum naraz", "Legfeljebb egyszerre")}</span>
        <input
          type="number"
          min={2}
          max={10}
          disabled={off}
          value={parallel.maxParallel}
          onChange={(e) => set({ maxParallel: Math.min(10, Math.max(2, Math.round(Number(e.target.value)) || 2)) })}
          className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-ui outline-none focus:border-entity disabled:bg-gray-50"
          data-testid="tt-parallel-max"
        />
      </label>
      <fieldset className="grid gap-2" disabled={off}>
        <legend className="type-label mb-1 text-gray-600">{t("Two timers on the same project", "Dva časovače na tom istom projekte", "Két időzítő ugyanazon a projekten")}</legend>
        {radio("tt-parallel-same", "differentTasks", parallel.sameProject, t("Allowed on different tasks only", "Povolené len pri rôznych úlohách", "Csak különböző feladatokon"), pick, off)}
        {radio("tt-parallel-same", "never", parallel.sameProject, t("Never", "Nikdy", "Soha"), pick, off)}
        {radio("tt-parallel-same", "always", parallel.sameProject, t("Always", "Vždy", "Mindig"), pick, off)}
      </fieldset>
    </SettingsCard>
  );
}

/** The person's own "When I start a timer while another runs" preference; only offered once the company allows parallel. */
export function StartWhileRunningBlock() {
  const tt = useTimeTracking();
  const { t } = tt;
  const options: { v: StartWhileRunning; text: string }[] = [
    { v: "ask", text: t("Ask me", "Opýtať sa", "Kérdezzen") },
    { v: "switch", text: t("Switch to the new timer", "Prepnúť na nový časovač", "Váltás az új időzítőre") },
    { v: "parallel", text: t("Run in parallel", "Spustiť súbežne", "Futtatás párhuzamosan") },
  ];
  return (
    <SettingsCard title={t("When I start a timer while another runs", "Keď spustím časovač, kým beží iný", "Ha időzítőt indítok, amíg másik fut")} titleTestId="tt-start-while-running">
      {tt.settings.parallel.enabled ? (
        <div className="grid gap-2">
          {options.map((o) => (
            <label key={o.v} className="flex cursor-pointer items-center gap-3 text-ui text-gray-800">
              <input type="radio" name="tt-start-while-running" checked={tt.startWhileRunning === o.v} onChange={() => void tt.saveStartWhileRunning(o.v)} className="size-4 accent-[var(--entity-accent-solid)]" data-testid={`tt-swr-${o.v}`} />
              {o.text}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-body text-gray-500">{t("Your company has not enabled parallel tracking, so a new timer always replaces the running one.", "Vaša firma nepovolila súbežné sledovanie, nový časovač vždy nahradí bežiaci.", "A cége nem engedélyezte a párhuzamos követést, ezért az új időzítő mindig leváltja a futót.")}</p>
      )}
    </SettingsCard>
  );
}
