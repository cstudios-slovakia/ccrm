import React, { useState, useEffect, useMemo } from "react";
import { Brain, RefreshCw } from "lucide-react";
import { hasAiConfigured } from "../../utils/aiConfig";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import type { Employee, EmployeeSalary, EmployeeVacation } from "../../types";
import { employeeKind, identityComplete, identityOf } from "../../utils/employeeIdentity";

interface UseEmployeeAiSummaryArgs {
  employee: Employee;
  employeeSalaries: EmployeeSalary[];
  employeeVacations: EmployeeVacation[];
  vacationStats: Record<string, { used: number; allowance: number; name: string; color: string }>;
  vacationTypes: { id: string; name: string }[];
  systemLanguage?: string;
  integrationsConfig?: any;
  t: (en: string, sk: string, hu: string) => string;
}

export const useEmployeeAiSummary = ({
  employee,
  employeeSalaries,
  employeeVacations,
  vacationStats,
  vacationTypes,
  systemLanguage,
  integrationsConfig,
  t
}: UseEmployeeAiSummaryArgs) => {
  // Deterministic problem detection + AI Summary state
  const detectedEmployeeProblems = useMemo(() => {
    const probs: string[] = [];
    if (employee.isActive === false) {
      probs.push(t("Employee profile is currently inactive", "Profil zamestnanca je neaktívny", "Az alkalmazott profilja jelenleg inaktív"));
    }
    const unpaidSalaries = employeeSalaries.filter((s) => s.status !== "paid");
    if (unpaidSalaries.length > 0) {
      const totalUnpaid = unpaidSalaries.reduce((sum, s) => sum + (Number(s.totalSalary || 0) - Number(s.totalPaid || 0)), 0);
      probs.push(
        t(
          `${unpaidSalaries.length} unpaid salary record(s) (${totalUnpaid.toFixed(2)} €)`,
          `${unpaidSalaries.length} neuhradená mzda / záznam (${totalUnpaid.toFixed(2)} €)`,
          `${unpaidSalaries.length} kifizetetlen bérrekord (${totalUnpaid.toFixed(2)} €)`
        )
      );
    }
    const pendingVacations = employeeVacations.filter((v) => v.status === "pending");
    if (pendingVacations.length > 0) {
      probs.push(
        t(
          `${pendingVacations.length} pending vacation/absence request(s) awaiting approval`,
          `${pendingVacations.length} čakajúca žiadosť o dovolenku/absenciu na schválenie`,
          `${pendingVacations.length} jóváhagyásra váró szabadság-/távolléti kérelem`
        )
      );
    }
    if ((employee.files || []).length === 0) {
      probs.push(t("No employment contract or document uploaded", "Chýba nahraná pracovná zmluva alebo dokument", "Nincs feltöltött munkaszerződés vagy dokumentum"));
    }
    if (!employee.email && !employee.phone) {
      probs.push(t("Missing contact details (email and phone)", "Chýbajú kontaktné údaje (e-mail a telefón)", "Hiányzó elérhetőségek (e-mail és telefon)"));
    }
    if (!identityComplete(identityOf(employee))) {
      probs.push(t("Incomplete identity / personal details", "Neúplné osobné / identifikačné údaje", "Hiányos személyes / azonosító adatok"));
    }
    for (const [vtId, stat] of Object.entries(vacationStats)) {
      const rem = stat.allowance - stat.used;
      if (rem < 0) {
        const vtName = vacationTypes.find((v) => v.id === vtId)?.name || vtId;
        probs.push(
          t(
            `Exceeded ${vtName} allowance by ${Math.abs(rem)} day(s)`,
            `Prekročený nárok (${vtName}) o ${Math.abs(rem)} dní`,
            `Túllépett keret (${vtName}): ${Math.abs(rem)} nap`
          )
        );
      }
    }
    return probs;
  }, [employee, employeeSalaries, employeeVacations, vacationStats, vacationTypes, systemLanguage]);

  const employeeAiFingerprint = useMemo(() => {
    const salFp = employeeSalaries.map((s) => `${s.id}:${s.status}:${s.totalSalary}`).join(",");
    const vacFp = employeeVacations.map((v) => `${v.id}:${v.status}:${v.daysCount}`).join(",");
    return `${employee.id}|${employee.name}|${employee.isActive}|${employee.position || ""}|${employee.salaryAmount || 0}|${(employee.files || []).length}|${salFp}|${vacFp}|${systemLanguage}`;
  }, [employee, employeeSalaries, employeeVacations, systemLanguage]);

  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiProblems, setAiProblems] = useState<string[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  const generateEmployeeAiSummary = React.useCallback(
    async (force = false) => {
      const storageKey = `ccrm_ai_sum_emp_${employee.id}`;
      if (!force && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.fp === employeeAiFingerprint && parsed.summary) {
              setAiSummary(parsed.summary);
              setAiProblems(Array.isArray(parsed.problems) ? parsed.problems : []);
              return;
            }
          }
        } catch {}
      }

      if (!hasAiConfigured(integrationsConfig)) {
        return;
      }

      setIsGeneratingSummary(true);
      try {
        const response = await fetchWithTimeout(
          "/api/summarize_client_lead.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: employee.name,
              type: "employee",
              systemLanguage,
              tasks: [],
              events: employeeVacations.slice(0, 12).map((v) => ({
                title: `${v.vacationTypeId || "annual"} (${v.status || "approved"})`,
                date: `${v.startDate} -> ${v.endDate} (${v.daysCount}d)`,
                notes: v.note || "",
              })),
              priceOffers: [],
              otherData: {
                position: employee.position || "N/A",
                department: employee.department || "N/A",
                isActive: employee.isActive !== false,
                kind: employeeKind(employee),
                salaryType: employee.salaryType || "monthly",
                salaryAmount: employee.salaryAmount || 0,
                email: employee.email || null,
                phone: employee.phone || null,
                contractsUploaded: (employee.files || []).length,
                recentSalaries: employeeSalaries.slice(0, 8).map((s) => ({
                  period: s.periodKey || `${s.year}-${String(s.periodNumber || 1).padStart(2, "0")}`,
                  amount: s.totalSalary,
                  paid: s.totalPaid,
                  status: s.status,
                  dueDate: s.dueDate,
                })),
                detectedProblems: detectedEmployeeProblems,
                notes: employee.notes || "",
              },
            }),
          },
          25_000
        );
        const data = await response.json();
        if (data.success && data.summary) {
          const probs = Array.isArray(data.problems) ? data.problems.filter(Boolean) : [];
          setAiSummary(data.summary);
          setAiProblems(probs);
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({ fp: employeeAiFingerprint, summary: data.summary, problems: probs })
            );
          } catch {}
        }
      } catch (err) {
        console.error("Failed to generate employee AI summary:", err);
      } finally {
        setIsGeneratingSummary(false);
      }
    },
    [employee, employeeSalaries, employeeVacations, detectedEmployeeProblems, employeeAiFingerprint, integrationsConfig, systemLanguage]
  );

  useEffect(() => {
    generateEmployeeAiSummary(false);
  }, [generateEmployeeAiSummary]);

  const combinedEmployeeProblems = useMemo(() => {
    const merged = [...aiProblems];
    for (const p of detectedEmployeeProblems) {
      if (!merged.some((existing) => existing.toLowerCase().includes(p.slice(0, 18).toLowerCase()))) {
        merged.push(p);
      }
    }
    return merged;
  }, [aiProblems, detectedEmployeeProblems]);

  return { aiSummary, isGeneratingSummary, generateEmployeeAiSummary, combinedEmployeeProblems };
};

interface EmployeeAiSummaryBannerProps {
  combinedEmployeeProblems: string[];
  isGeneratingSummary: boolean;
  aiSummary: string;
  integrationsConfig?: any;
  generateEmployeeAiSummary: (force?: boolean) => Promise<void>;
  t: (en: string, sk: string, hu: string) => string;
}

export const EmployeeAiSummaryBanner = ({
  combinedEmployeeProblems,
  isGeneratingSummary,
  aiSummary,
  integrationsConfig,
  generateEmployeeAiSummary,
  t
}: EmployeeAiSummaryBannerProps) => (
    <>
      <div
        data-testid="employee-ai-summary"
        className={`rounded-2xl border p-4 shadow-sm transition-colors ${
          combinedEmployeeProblems.length > 0
            ? "bg-rose-50/75 border-rose-200/80"
            : "bg-amber-50/40 border-[#c29b62]/30"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain
              className={`size-4 shrink-0 ${
                combinedEmployeeProblems.length > 0 ? "text-rose-600" : "text-[#9e7638]"
              } ${isGeneratingSummary ? "animate-pulse" : ""}`}
            />
            <span
              className={`text-micro font-bold uppercase tracking-wider ${
                combinedEmployeeProblems.length > 0 ? "text-rose-700" : "text-[#9e7638]"
              }`}
            >
              {t("AI Employee Summary & Problem Monitor", "AI Zhrnutie zamestnanca a riziká", "AI Alkalmazotti Összefoglaló és Problémák")}
            </span>
            {combinedEmployeeProblems.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-rose-100 text-rose-700 border border-rose-200">
                ⚠️ {combinedEmployeeProblems.length}{" "}
                {t("problem(s)", "problém(y)", "probléma")}
              </span>
            )}
          </div>
          {hasAiConfigured(integrationsConfig) && (
            <button
              type="button"
              onClick={() => generateEmployeeAiSummary(true)}
              disabled={isGeneratingSummary}
              className="p-1 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              title={t("Regenerate AI Summary", "Pregenerovať AI zhrnutie", "AI összefoglaló újragenerálása")}
            >
              <RefreshCw className={`size-3.5 ${isGeneratingSummary ? "animate-spin text-[#9e7638]" : ""}`} />
            </button>
          )}
        </div>

        {combinedEmployeeProblems.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="employee-ai-problems">
            {combinedEmployeeProblems.map((prob, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 border border-rose-200 text-rose-800 text-caption font-semibold shadow-2xs"
              >
                <span className="size-1.5 rounded-full bg-rose-500 shrink-0" />
                {prob}
              </span>
            ))}
          </div>
        )}

        <p className="mt-2 text-caption text-slate-700 leading-relaxed">
          {isGeneratingSummary && !aiSummary ? (
            <span className="italic text-slate-400">
              {t("Analyzing employee records, salaries, and absences...", "Analyzujem záznamy, mzdy a dovolenky zamestnanca...", "Alkalmazotti adatok, bérek és szabadságok elemzése...")}
            </span>
          ) : aiSummary ? (
            aiSummary
          ) : combinedEmployeeProblems.length > 0 ? (
            t(
              `Attention required: ${combinedEmployeeProblems.join("; ")}.`,
              `Vyžaduje pozornosť: ${combinedEmployeeProblems.join("; ")}.`,
              `Figyelmet igényel: ${combinedEmployeeProblems.join("; ")}.`
            )
          ) : (
            t(
              "No open compliance, contract, or payroll issues detected for this employee.",
              "Pre tohto zamestnanca neboli zistené žiadne otvorené zmluvné ani mzdové problémy.",
              "Nem található nyitott szerződéses vagy bérszámfejtési probléma ennél az alkalmazottnál."
            )
          )}
        </p>
      </div>
    </>
);
