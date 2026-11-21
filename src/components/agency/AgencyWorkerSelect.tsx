import React, { useEffect, useMemo, useState } from "react";
import { UserCheck } from "lucide-react";
import type { AgencyWorker } from "../../types/agency";
import { fetchAgencyBootstrap } from "../../utils/agencyApi";
import type { Language } from "../../utils/translations";
import { CustomSelect, type DropdownOption } from "../ui/CustomSelect";

let cachedWorkers: AgencyWorker[] | null = null;
let inflightFetch: Promise<AgencyWorker[]> | null = null;

async function loadWorkers(): Promise<AgencyWorker[]> {
  if (!inflightFetch) {
    inflightFetch = fetchAgencyBootstrap()
      .then((res) => {
        cachedWorkers = res.workers || [];
        return cachedWorkers;
      })
      .catch(() => cachedWorkers || [])
      .finally(() => {
        inflightFetch = null;
      });
  }
  return inflightFetch;
}

interface AgencyWorkerSelectProps {
  value: string;
  onChange: (workerId: string) => void;
  lang: Language;
  disabled?: boolean;
  emptyLabel?: string;
  fallbackLabel?: string;
  unstyled?: boolean;
  className?: string;
  testId?: string;
}

export const AgencyWorkerSelect: React.FC<AgencyWorkerSelectProps> = ({
  value,
  onChange,
  lang,
  disabled = false,
  emptyLabel,
  fallbackLabel,
  unstyled = false,
  className,
  testId,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const [workers, setWorkers] = useState<AgencyWorker[]>(() => cachedWorkers || []);

  useEffect(() => {
    let alive = true;
    loadWorkers().then((list) => {
      if (alive) setWorkers(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo<DropdownOption[]>(() => {
    const base: DropdownOption[] = [
      { value: "", label: emptyLabel || t("-- None --", "-- Žiadny --", "-- Nincs --") },
      ...workers.map((w) => {
        const passportObj = w.profile?.passport as Record<string, unknown> | undefined;
        const badge = (typeof passportObj?.number === "string" && passportObj.number.trim()) || w.workerCode || "";
        return {
          value: w.id,
          label: badge ? `${w.fullName} (${badge})` : w.fullName,
        };
      }),
    ];
    if (value && !workers.some((w) => w.id === value)) {
      base.push({ value, label: fallbackLabel || value });
    }
    return base;
  }, [workers, value, emptyLabel, fallbackLabel, lang]);

  return (
    <div data-testid={testId}>
      <CustomSelect
        searchable
        unstyled={unstyled}
        value={value}
        disabled={disabled}
        onChange={onChange}
        icon={unstyled ? <UserCheck className="h-4 w-4 shrink-0 text-gray-500" /> : undefined}
        options={options}
        className={className}
      />
    </div>
  );
};
