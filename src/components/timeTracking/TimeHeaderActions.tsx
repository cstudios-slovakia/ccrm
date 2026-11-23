import { useEffect, useRef, useState } from "react";
import { EllipsisVertical, Plus, Settings as SettingsIcon } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { requestNewTimeEntry } from "./timeCreateBridge";

/**
 * The page header's actions: "+ Add entry manually" (opens the new-entry drawer) and a ⋯ menu.
 * The menu holds Settings; it is a menu, not a list of links, so later entries can join it.
 */
export function TimeHeaderActions({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { t } = useTimeTracking();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const control = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-ui font-semibold text-gray-700 transition-colors hover:bg-gray-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-entity";
  return (
    <>
      <button type="button" onClick={() => requestNewTimeEntry({})} data-testid="time-add-entry" className={`${control} px-4`}>
        <Plus className="size-4" />
        {t("Add entry manually", "Pridať záznam ručne", "Bejegyzés kézi hozzáadása")}
      </button>
      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("More actions", "Ďalšie akcie", "További műveletek")}
          title={t("More actions", "Ďalšie akcie", "További műveletek")}
          data-testid="time-more-menu"
          className={`${control} w-10`}
        >
          <EllipsisVertical className="size-4" />
        </button>
        {open && (
          <div role="menu" className="absolute right-0 top-full z-[960] mt-2 min-w-52 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate("settings/projects/time");
              }}
              data-testid="time-settings-link"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-ui font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              <SettingsIcon className="size-4 text-gray-500" />
              {t("Settings", "Nastavenia", "Beállítások")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
