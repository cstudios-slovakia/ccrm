import React, { useState, useEffect } from "react";
import { X, Calendar } from "lucide-react";
import type { Employee, EmployeeSettings, EmployeeVacation } from "../../types";
import { entityAccentStyle } from "../../utils/entityAccent";

interface VacationRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  selectedEmployeeId?: string | null;
  vacationToEdit?: EmployeeVacation | null;
  settings: EmployeeSettings;
  onSave: (vacation: EmployeeVacation) => void;
  systemLanguage?: string;
  currentUserEmail?: string;
}

export const VacationRequestModal: React.FC<VacationRequestModalProps> = ({
  isOpen,
  onClose,
  employees,
  selectedEmployeeId,
  vacationToEdit,
  settings,
  onSave,
  systemLanguage = "sk",
  currentUserEmail = ""
}) => {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [vacationTypeId, setVacationTypeId] = useState<string>("annual");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [daysCount, setDaysCount] = useState<number>(1);
  const [status, setStatus] = useState<"requested" | "approved" | "rejected" | "taken" | "pending">("approved");
  const [note, setNote] = useState<string>("");

  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "hu") return hu;
    if (systemLanguage === "sk") return sk;
    return en;
  };

  const vacationTypes = settings.vacationTypes && settings.vacationTypes.length > 0
    ? settings.vacationTypes
    : [
        { id: "annual", name: "Dovolenka", defaultAllowance: 25, color: "#c29b62" },
        { id: "sick", name: "PN", defaultAllowance: 10, color: "#ef4444" },
        { id: "doctor", name: "Lekár", defaultAllowance: 7, color: "#3b82f6" },
        { id: "unpaid", name: "Neplatené voľno", defaultAllowance: 0, color: "#8b5cf6" }
      ];

  // Helper to calculate working days (excluding Saturday & Sunday)
  const calcWorkingDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 1;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 1;

    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dayOfWeek = cur.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  };

  useEffect(() => {
    if (vacationToEdit) {
      setEmployeeId(vacationToEdit.employeeId);
      setVacationTypeId(vacationToEdit.vacationTypeId || "annual");
      setStartDate(vacationToEdit.startDate);
      setEndDate(vacationToEdit.endDate);
      setDaysCount(vacationToEdit.daysCount || 1);
      setStatus(vacationToEdit.status || "approved");
      setNote(vacationToEdit.note || "");
    } else {
      const todayStr = new Date().toISOString().split("T")[0];
      setEmployeeId(selectedEmployeeId || (employees.length > 0 ? employees[0].id : ""));
      setVacationTypeId("annual");
      setStartDate(todayStr);
      setEndDate(todayStr);
      setDaysCount(1);
      setStatus("approved");
      setNote("");
    }
  }, [vacationToEdit, selectedEmployeeId, employees, isOpen]);

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (!endDate || endDate < val) {
      setEndDate(val);
      setDaysCount(calcWorkingDays(val, val));
    } else {
      setDaysCount(calcWorkingDays(val, endDate));
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (startDate) {
      setDaysCount(calcWorkingDays(startDate, val));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !startDate || !endDate) return;

    const vac: EmployeeVacation = {
      id: vacationToEdit?.id || `vac_${Date.now()}`,
      employeeId,
      vacationTypeId,
      startDate,
      endDate,
      daysCount: Number(daysCount) || 1,
      status,
      note: note.trim() || undefined,
      approvedBy: vacationToEdit?.approvedBy || currentUserEmail || "Admin",
      createdAt: vacationToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSave(vac);
    onClose();
  };

  return (
    <div style={entityAccentStyle("employees") as React.CSSProperties} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-entity-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-entity-solid text-white flex items-center justify-center shadow-2xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-title-sm font-bold text-gray-900">
                {vacationToEdit
                  ? t("Edit Vacation Record", "Úprava záznamu voľna", "Szabadság módosítása")
                  : t("Request / Record Vacation", "Zadať dovolenku / voľno", "Szabadság rögzítése")}
              </h2>
              <p className="text-ui text-gray-500">
                {t("Record days off, sick leaves, doctor visits", "Evidencia čerpania dovolenky, PN alebo lekára", "Szabadság, betegszabadság, orvosi igazolás")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Employee selector */}
          <div>
            <label className="block text-ui font-semibold text-gray-500 mb-1">
              {t("Employee", "Zamestnanec", "Alkalmazott")}
            </label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!selectedEmployeeId && !vacationToEdit}
              className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.pin ? `(${emp.pin})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Vacation Type */}
          <div>
            <label className="block text-ui font-semibold text-gray-500 mb-1">
              {t("Leave Type", "Typ voľna", "Szabadság típusa")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {vacationTypes.map((vt) => {
                const isSelected = vacationTypeId === vt.id;
                return (
                  <button
                    key={vt.id}
                    type="button"
                    onClick={() => setVacationTypeId(vt.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-md border text-ui font-medium transition text-left ${
                      isSelected
                        ? "border-[#c29b62] bg-entity-subtle text-gray-900 ring-1 ring-[#c29b62]"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: vt.color || "#c29b62" }}
                    />
                    <span className="truncate">{vt.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-ui font-medium text-gray-700 mb-1">
                {t("From Date", "Od dátumu", "Kezdő dátum")}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
              />
            </div>
            <div>
              <label className="block text-ui font-medium text-gray-700 mb-1">
                {t("To Date", "Do dátumu", "Befejező dátum")}
              </label>
              <input
                type="date"
                required
                value={endDate}
                min={startDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
              />
            </div>
          </div>

          {/* Days count & status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-ui font-medium text-gray-700 mb-1">
                {t("Working Days", "Počet pracovných dní", "Munkanapok száma")}
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={daysCount}
                onChange={(e) => setDaysCount(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
              />
            </div>

            <div>
              <label className="block text-ui font-medium text-gray-700 mb-1">
                {t("Approval Status", "Stav schválenia", "Jóváhagyási állapot")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
              >
                <option value="approved">{t("Approved", "Schválené", "Jóváhagyva")}</option>
                <option value="pending">{t("Pending Approval", "Čaká na schválenie", "Függőben")}</option>
                <option value="rejected">{t("Rejected", "Zamietnuté", "Elutasítva")}</option>
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-ui font-medium text-gray-700 mb-1">
              {t("Note / Reason (optional)", "Poznámka / Dôvod", "Megjegyzés / Indoklás")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("e.g. Summer holiday with family", "napr. Letná rodinná dovolenka", "pl. Családi nyaralás")}
              className="w-full px-3 py-2 text-body bg-white border border-gray-200 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#c29b62]"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-body font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition"
            >
              {t("Cancel", "Zrušiť", "Mégse")}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-body font-semibold text-white bg-[#c29b62] hover:bg-[#b58b4c] rounded-md shadow-md shadow-2xs transition"
            >
              {t("Save Vacation", "Uložiť", "Mentés")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VacationRequestModal;
