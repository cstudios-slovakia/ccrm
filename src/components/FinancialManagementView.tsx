import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Coins, TrendingUp, TrendingDown,
  Plus, Search, Calendar, Layers, CheckCircle2,
  Clock, RefreshCw,
  Trash2,
  User, Briefcase, BarChart3,
  X, Globe,
  ChevronDown, ChevronUp, ChevronRight,
  Landmark, Check, Pencil,
  CalendarDays, Target, Maximize2, Minimize2,
  ArrowUpRight, ArrowDownRight, ArrowUpDown,
  SlidersHorizontal,
  Copy, Sparkles
} from "lucide-react";
import type {
  FinancialRecord,
  FinancialCategory,
  FinancialType,
  FinancialStatus,
  FinancialRecurringFrequency,
  Project,
  Lead,
  UserProfile
} from "../types";
import type { Language } from "../utils/translations";
import { formatMoney } from "../utils/currency";
import { todayLocal, formatDateLocalized } from "../utils/localTime";

interface SearchableCategorySelectProps {
  value: string;
  onChange: (catId: string) => void;
  categories: FinancialCategory[];
  filterType?: FinancialType | "all";
  allowAll?: boolean;
  placeholder?: string;
  t: (en: string, sk: string, hu: string) => string;
}

const SearchableCategorySelect: React.FC<SearchableCategorySelectProps> = ({
  value,
  onChange,
  categories,
  filterType = "all",
  allowAll = true,
  placeholder,
  t
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  const selectedCategory = categories.find((c) => c.id === value);

  // Build full hierarchy breadcrumb for search and display
  const getCategoryPath = (cat: FinancialCategory): string => {
    const parts = [cat.name];
    let curr = cat;
    while (curr.parentId) {
      const p = categories.find((c) => c.id === curr.parentId);
      if (!p) break;
      parts.unshift(p.name);
      curr = p;
    }
    return parts.join(" ➔ ");
  };

  const filteredCategories = useMemo(() => {
    return categories
      .filter((c) => filterType === "all" || c.type === filterType)
      .filter((c) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        const fullPath = getCategoryPath(c).toLowerCase();
        return fullPath.includes(q);
      });
  }, [categories, filterType, search]);

  const expenseCategories = filteredCategories.filter((c) => c.type === "expense");
  const incomeCategories = filteredCategories.filter((c) => c.type === "income");

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedCategory ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedCategory.color || (selectedCategory.type === "income" ? "#10b981" : "#f43f5e") }}
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {getCategoryPath(selectedCategory)}
              </span>
              <span
                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                  selectedCategory.type === "income"
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                }`}
              >
                {selectedCategory.type === "income" ? t("Income", "Príjem", "Bevétel") : t("Expense", "Výdavok", "Kiadás")}
              </span>
            </>
          ) : (
            <span className="text-slate-600 dark:text-slate-400 font-medium truncate">
              {placeholder || (allowAll ? t("All Categories", "Všetky kategórie", "Minden kategória") : t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon kategóriát --"))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {selectedCategory && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(allowAll ? "all" : "");
              }}
              className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
              title={t("Clear selection", "Zrušiť výber", "Törlés")}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-500" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col min-w-[280px]">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/70 dark:bg-slate-800/50">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search categories...", "Hľadať kategórie...", "Keresés a kategóriákban...")}
              className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "all" || !value
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span>{t("All Categories", "Všetky kategórie", "Minden kategória")}</span>
                {(value === "all" || !value) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {/* Expense Categories Group */}
            {expenseCategories.length > 0 && (
              <div className="pt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                  <TrendingDown className="h-3 w-3" />
                  <span>{t("Expenses", "Výdavky", "Kiadások")}</span>
                </div>
                {expenseCategories.map((c) => {
                  const isSelected = value === c.id;
                  const indent = c.level === 1 ? "" : c.level === 2 ? "pl-5" : "pl-8";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${indent} ${
                        isSelected
                          ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.color || "#f43f5e" }}
                        />
                        <span className={c.level === 1 ? "font-bold text-slate-900 dark:text-white" : "font-normal"}>
                          {c.level === 1 ? c.name : c.level === 2 ? `↳ ${c.name}` : `↳↳ ${c.name}`}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Income Categories Group */}
            {incomeCategories.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  <span>{t("Incomes", "Príjmy", "Bevételek")}</span>
                </div>
                {incomeCategories.map((c) => {
                  const isSelected = value === c.id;
                  const indent = c.level === 1 ? "" : c.level === 2 ? "pl-5" : "pl-8";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${indent} ${
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.color || "#10b981" }}
                        />
                        <span className={c.level === 1 ? "font-bold text-slate-900 dark:text-white" : "font-normal"}>
                          {c.level === 1 ? c.name : c.level === 2 ? `↳ ${c.name}` : `↳↳ ${c.name}`}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredCategories.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                {t("No categories found", "Nenašli sa žiadne kategórie", "Nem található kategória")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SearchableScopeSelectProps {
  value: string; // e.g. "all", "global", "project:xxx", "client:yyy"
  onChange: (val: string) => void;
  projects: Project[];
  leads: Lead[];
  allowAll?: boolean;
  allowGlobal?: boolean;
  placeholder?: string;
  t: (en: string, sk: string, hu: string) => string;
}

const SearchableScopeSelect: React.FC<SearchableScopeSelectProps> = ({
  value,
  onChange,
  projects,
  leads,
  allowAll = true,
  allowGlobal = true,
  placeholder,
  t
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Determine current label and icon
  const selectedInfo = useMemo(() => {
    if (value === "all" || !value) {
      return {
        label: placeholder || (allowAll ? t("All Entity Scopes", "Všetky prepojenia", "Minden hatókör") : t("-- Select Link --", "-- Vyberte prepojenie --", "-- Válasszon --")),
        type: "all"
      };
    }
    if (value === "global") {
      return {
        label: t("Global Company-Wide Only", "Globálne firemné", "Vállalati szintű"),
        type: "global"
      };
    }
    if (value.startsWith("project:")) {
      const pid = value.replace("project:", "");
      if (pid === "all") return { label: t("All Projects", "Všetky projekty", "Minden projekt"), type: "project" };
      const p = projects.find((proj) => proj.id === pid);
      const lead = leads.find((l) => l.id === p?.leadId || l.id === p?.clientId);
      return {
        label: lead ? `${lead.name} (${p?.id.slice(0, 8)})` : `Projekt ${pid.slice(0, 8)}`,
        subtext: lead?.city || "",
        type: "project"
      };
    }
    if (value.startsWith("client:")) {
      const cid = value.replace("client:", "");
      if (cid === "all") return { label: t("All Clients", "Všetci klienti", "Minden ügyfél"), type: "client" };
      const l = leads.find((lead) => lead.id === cid);
      return {
        label: l ? l.name : cid,
        subtext: l?.city || l?.phone || "",
        type: "client"
      };
    }
    return { label: value, type: "other" };
  }, [value, projects, leads, allowAll, placeholder, t]);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
      const matchName = (lead?.name || "").toLowerCase().includes(q);
      const matchCity = (lead?.city || "").toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      return matchName || matchCity || matchId;
    });
  }, [projects, leads, search]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase().trim();
    return leads.filter((l) => {
      const matchName = l.name.toLowerCase().includes(q);
      const matchCity = (l.city || "").toLowerCase().includes(q);
      const matchPhone = (l.phone || "").toLowerCase().includes(q);
      const matchEmail = (l.email || "").toLowerCase().includes(q);
      return matchName || matchCity || matchPhone || matchEmail;
    });
  }, [leads, search]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-xl text-xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedInfo.type === "global" ? (
            <Globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          ) : selectedInfo.type === "project" ? (
            <Briefcase className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          ) : selectedInfo.type === "client" ? (
            <User className="h-3.5 w-3.5 text-teal-500 shrink-0" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
            {selectedInfo.label}
          </span>
          {selectedInfo.subtext && (
            <span className="text-[10px] text-slate-400 shrink-0 font-normal">
              ({selectedInfo.subtext})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && value !== "all" && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(allowAll ? "all" : "");
              }}
              className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
              title={t("Clear selection", "Zrušiť výber", "Törlés")}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180 text-emerald-500" : ""}`} />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-[100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col min-w-[300px]">
          {/* Search Header */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/70 dark:bg-slate-800/50">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search projects or clients...", "Hľadať projekty alebo klientov...", "Keresés projekt vagy ügyfél szerint...")}
              className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* List Options */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "all" || !value
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t("All Entity Scopes", "Všetky prepojenia", "Minden hatókör")}</span>
                </div>
                {(value === "all" || !value) && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {allowGlobal && (
              <button
                type="button"
                onClick={() => {
                  onChange("global");
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                  value === "global"
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-slate-500" />
                  <span>{t("Global Company-Wide Only", "Globálne firemné", "Vállalati szintű")}</span>
                </div>
                {value === "global" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            )}

            {/* Projects Group */}
            {filteredProjects.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" />
                  <span>{t("Projects", "Projekty", "Projektek")}</span>
                </div>
                {filteredProjects.map((p) => {
                  const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
                  const isSelected = value === `project:${p.id}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChange(`project:${p.id}`);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {lead ? lead.name : `Projekt ${p.id.slice(0, 8)}`}
                        </span>
                        {lead?.city && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            • {lead.city}
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          #{p.id.slice(0, 6)}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Clients Group */}
            {filteredLeads.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 mt-1">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-500 flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  <span>{t("Clients", "Klienti", "Ügyfelek")}</span>
                </div>
                {filteredLeads.map((l) => {
                  const isSelected = value === `client:${l.id}`;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        onChange(`client:${l.id}`);
                        setIsOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {l.name}
                        </span>
                        {l.city && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            • {l.city}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredProjects.length === 0 && filteredLeads.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                {t("No projects or clients found", "Nenašli sa žiadne projekty ani klienti", "Nem található projekt vagy ügyfél")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FinancialManagementViewProps {
  financialRecords: FinancialRecord[];
  setFinancialRecords: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  financialCategories: FinancialCategory[];
  setFinancialCategories: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  projects: Project[];
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  currencyCode?: string | null;
  onOpenProject?: (projectId: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export const FinancialManagementView: React.FC<FinancialManagementViewProps> = ({
  financialRecords = [],
  setFinancialRecords,
  financialCategories = [],
  setFinancialCategories,
  projects = [],
  leads = [],
  userLanguage,
  currencyCode,
  onOpenProject,
  onOpenClient
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const money = (v: number) => formatMoney(v, currencyCode, userLanguage);

  // Helper to parse subtab & query parameters from URL hash
  const parseFinancialUrlState = () => {
    const raw = window.location.hash.replace("#", "");
    const [pathPart, queryPart] = raw.split("?");
    const parts = (pathPart || "").split("/");
    const sub = (parts[1] || parts[0] || "").toLowerCase();

    let tab: "overview" | "table" | "movements" | "recurring" | "categories" = "overview";
    if (sub === "table" || sub === "tabulka" || sub === "matrix" || sub === "overview-table" || sub === "prehlad") tab = "table";
    else if (sub === "movements" || sub === "pohyby" || sub === "transactions" || sub === "mozgasok" || sub === "incomes" || sub === "expenses") tab = "movements";
    else if (sub === "recurring" || sub === "pravidelne" || sub === "rendszeres") tab = "recurring";
    else if (sub === "categories" || sub === "kategorie" || sub === "kategoriak") tab = "categories";

    const params = new URLSearchParams(queryPart || "");
    return {
      tab,
      search: params.get("q") || "",
      scope: (params.get("scope") as "all" | "global" | "project" | "client") || "all",
      project: params.get("project") || "all",
      client: params.get("client") || "all",
      status: params.get("status") || "all",
      time: (params.get("time") as "this_month" | "next_month" | "this_quarter" | "this_year" | "all" | "custom") || "this_month",
      category: params.get("category") || "all",
    };
  };

  const initialUrlState = parseFinancialUrlState();

  // Main navigation tabs
  const [activeTab, setActiveTab] = useState<"overview" | "table" | "movements" | "recurring" | "categories">(initialUrlState.tab);

  // Overview Matrix Table State
  const [tableGranularity, setTableGranularity] = useState<"week" | "month" | "quarter" | "year">("month");
  const [tableYear, setTableYear] = useState<number>(new Date().getFullYear());
  const [tableValueMode, setTableValueMode] = useState<"both" | "real" | "estimated" | "total">("both");
  const [expandedCatIds, setExpandedCatIds] = useState<Set<string>>(() => new Set());
  const [tableSearchQuery, setTableSearchQuery] = useState("");

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };



  const expandAllExpenseCategories = () => {
    const expenseCatIds = financialCategories.filter((c) => c.type === "expense").map((c) => c.id);
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      expenseCatIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const collapseAllExpenseCategories = () => {
    const expenseCatIds = new Set(financialCategories.filter((c) => c.type === "expense").map((c) => c.id));
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      expenseCatIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const expandAllIncomeCategories = () => {
    const incomeCatIds = financialCategories.filter((c) => c.type === "income").map((c) => c.id);
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      incomeCatIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const collapseAllIncomeCategories = () => {
    const incomeCatIds = new Set(financialCategories.filter((c) => c.type === "income").map((c) => c.id));
    setExpandedCatIds((prev) => {
      const next = new Set(prev);
      incomeCatIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const areAllExpensesExpanded = useMemo(() => {
    const expenseCatsWithChildren = financialCategories.filter(
      (c) => c.type === "expense" && financialCategories.some((sub) => sub.parentId === c.id)
    );
    if (expenseCatsWithChildren.length === 0) return false;
    return expenseCatsWithChildren.every((c) => expandedCatIds.has(c.id));
  }, [financialCategories, expandedCatIds]);

  const areAllIncomesExpanded = useMemo(() => {
    const incomeCatsWithChildren = financialCategories.filter(
      (c) => c.type === "income" && financialCategories.some((sub) => sub.parentId === c.id)
    );
    if (incomeCatsWithChildren.length === 0) return false;
    return incomeCatsWithChildren.every((c) => expandedCatIds.has(c.id));
  }, [financialCategories, expandedCatIds]);

  // Hash listener to handle browser back / forward / external deep links
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseFinancialUrlState();
      setActiveTab(parsed.tab);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update hash when tab is switched
  const handleTabChange = (tabId: "overview" | "table" | "movements" | "recurring" | "categories") => {
    setActiveTab(tabId);
    window.location.hash = tabId === "overview" ? "financial/overview" : `financial/${tabId}`;
  };

  // Modal states for Create/Edit Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);

  // Smoothly animated close handler
  const handleCloseModal = () => {
    setIsClosingModal(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosingModal(false);
    }, 280);
  };

  // Category Tree Manager Modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catTreeType, setCatTreeType] = useState<FinancialType>("expense");
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState<string>("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");

  // Transaction Form fields
  const [formType, setFormType] = useState<FinancialType>("expense");
  const [formSubtype, setFormSubtype] = useState<string>("regular");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmountPlanned, setFormAmountPlanned] = useState<number | "">("");
  const [formAmountReal, setFormAmountReal] = useState<number | "">("");
  const [formStatus, setFormStatus] = useState<FinancialStatus>("planned");
  const [formIssueDate, setFormIssueDate] = useState(todayLocal());
  const [formDueDate, setFormDueDate] = useState("");
  const [formPaidDate, setFormPaidDate] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("bank_transfer");
  const [formScope, setFormScope] = useState<"global" | "project" | "client">("global");
  const [formProjectId, setFormProjectId] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formTaxRate, setFormTaxRate] = useState<number>(20);

  // Recurrence Form fields
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurringFreq, setFormRecurringFreq] = useState<FinancialRecurringFrequency>("monthly");
  const [formWeeklyDay, setFormWeeklyDay] = useState<number>(1); // Monday
  const [formMonthlyType, setFormMonthlyType] = useState<"day_of_month" | "nth_weekday">("day_of_month");
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formWeekOfMonth, setFormWeekOfMonth] = useState<number>(1); // 1 = 1st
  const [formNthDayOfWeek, setFormNthDayOfWeek] = useState<number>(1);
  const [formYearlyMonth, setFormYearlyMonth] = useState<number>(1);
  const [formRecurringStartDate, setFormRecurringStartDate] = useState(todayLocal());
  const [formRecurringEndDate, setFormRecurringEndDate] = useState("");



  // ==========================================
  // 3. MOVEMENTS TAB STATE & DATA LOGIC (TAB 3)
  // ==========================================
  const [movementsSearch, setMovementsSearch] = useState(initialUrlState.search);
  const [movementsType, setMovementsType] = useState<"all" | "income" | "expense">("all");
  const [movementsCategoryId, setMovementsCategoryId] = useState<string>(initialUrlState.category !== "all" ? initialUrlState.category : "all");
  const [movementsScope, setMovementsScope] = useState<"all" | "global" | "project" | "client">(initialUrlState.scope);
  const [movementsProjectId, setMovementsProjectId] = useState<string>(initialUrlState.project);
  const [movementsClientId, setMovementsClientId] = useState<string>(initialUrlState.client);
  const [movementsMinAmount, setMovementsMinAmount] = useState<string>("");
  const [movementsMaxAmount, setMovementsMaxAmount] = useState<string>("");
  const [movementsDatePreset, setMovementsDatePreset] = useState<"all" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom">("all");
  const [movementsStartDate, setMovementsStartDate] = useState<string>("");
  const [movementsEndDate, setMovementsEndDate] = useState<string>("");
  const [movementsSortOrder, setMovementsSortOrder] = useState<"desc" | "asc">("desc");
  const [movementsVisibleCount, setMovementsVisibleCount] = useState<number>(40);
  const [isMovementsAdvancedOpen, setIsMovementsAdvancedOpen] = useState<boolean>(false);

  // Sentinel ref for infinite scroll
  const movementsSentinelRef = useRef<HTMLDivElement | null>(null);

  // Helper to get 3-level breadcrumbs for any category ID
  const getCategoryBreadcrumbs = (catId?: string | null): FinancialCategory[] => {
    if (!catId) return [];
    const cat = financialCategories.find((c) => c.id === catId);
    if (!cat) return [];
    const path: FinancialCategory[] = [cat];
    let current = cat;
    while (current.parentId) {
      const parent = financialCategories.find((c) => c.id === current.parentId);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    return path;
  };

  // Movements Filter Hook
  const filteredMovements = useMemo(() => {
    let list = [...financialRecords];

    // 1. Search Query
    if (movementsSearch.trim()) {
      const q = movementsSearch.toLowerCase();
      list = list.filter((r) => {
        const project = projects.find((p) => p.id === r.projectId);
        const projectLead = project ? leads.find((l) => l.id === project.clientId || l.id === project.leadId) : null;
        const projectTitle = project ? (projectLead ? `${projectLead.name} (${project.id.slice(0, 8)})` : `Projekt ${project.id.slice(0, 8)}`) : "";
        const client = leads.find((l) => l.id === r.clientId || l.id === project?.clientId || l.id === project?.leadId);
        const catBreadcrumbs = getCategoryBreadcrumbs(r.categoryId).map((c) => c.name).join(" ");
        return (
          r.title.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q)) ||
          (catBreadcrumbs && catBreadcrumbs.toLowerCase().includes(q)) ||
          (projectTitle && projectTitle.toLowerCase().includes(q)) ||
          (client && client.name.toLowerCase().includes(q))
        );
      });
    }

    // 2. Type Filter (income vs expense)
    if (movementsType !== "all") {
      list = list.filter((r) => r.type === movementsType);
    }

    // 3. Category Filter (match self or any descendants)
    if (movementsCategoryId !== "all") {
      const descendantCatIds = new Set<string>([movementsCategoryId]);
      const addChildren = (parentId: string) => {
        financialCategories.filter((c) => c.parentId === parentId).forEach((child) => {
          descendantCatIds.add(child.id);
          addChildren(child.id);
        });
      };
      addChildren(movementsCategoryId);
      list = list.filter((r) => r.categoryId && descendantCatIds.has(r.categoryId));
    }

    // 4. Scope / Project / Client
    if (movementsScope === "global") {
      list = list.filter((r) => !r.projectId && !r.clientId);
    } else if (movementsScope === "project") {
      if (movementsProjectId !== "all") {
        list = list.filter((r) => r.projectId === movementsProjectId);
      } else {
        list = list.filter((r) => !!r.projectId);
      }
    } else if (movementsScope === "client") {
      if (movementsClientId !== "all") {
        list = list.filter((r) => r.clientId === movementsClientId);
      } else {
        list = list.filter((r) => !!r.clientId);
      }
    }

    // 5. Value Range
    if (movementsMinAmount !== "") {
      const min = parseFloat(movementsMinAmount);
      if (!isNaN(min)) {
        list = list.filter((r) => (r.amountReal > 0 ? r.amountReal : r.amountPlanned) >= min);
      }
    }
    if (movementsMaxAmount !== "") {
      const max = parseFloat(movementsMaxAmount);
      if (!isNaN(max)) {
        list = list.filter((r) => (r.amountReal > 0 ? r.amountReal : r.amountPlanned) <= max);
      }
    }

    // 6. Date Range / Presets
    if (movementsDatePreset === "this_month") {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      list = list.filter((r) => (r.paidDate || r.issueDate || "").startsWith(ym));
    } else if (movementsDatePreset === "last_month") {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      list = list.filter((r) => (r.paidDate || r.issueDate || "").startsWith(ym));
    } else if (movementsDatePreset === "this_quarter") {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      const startM = q * 3 + 1;
      const endM = q * 3 + 3;
      const y = now.getFullYear();
      const start = `${y}-${String(startM).padStart(2, "0")}-01`;
      const end = `${y}-${String(endM).padStart(2, "0")}-31`;
      list = list.filter((r) => {
        const date = r.paidDate || r.issueDate || "";
        return date >= start && date <= end;
      });
    } else if (movementsDatePreset === "this_year") {
      const y = String(new Date().getFullYear());
      list = list.filter((r) => (r.paidDate || r.issueDate || "").startsWith(y));
    } else if (movementsDatePreset === "custom") {
      if (movementsStartDate) {
        list = list.filter((r) => (r.paidDate || r.issueDate || "") >= movementsStartDate);
      }
      if (movementsEndDate) {
        list = list.filter((r) => (r.paidDate || r.issueDate || "") <= movementsEndDate);
      }
    }

    // 7. Chronological Sorting
    list.sort((a, b) => {
      const dateA = a.paidDate || a.issueDate || "";
      const dateB = b.paidDate || b.issueDate || "";
      if (movementsSortOrder === "desc") {
        return dateB.localeCompare(dateA);
      } else {
        return dateA.localeCompare(dateB);
      }
    });

    return list;
  }, [
    financialRecords,
    movementsSearch,
    movementsType,
    movementsCategoryId,
    movementsScope,
    movementsProjectId,
    movementsClientId,
    movementsMinAmount,
    movementsMaxAmount,
    movementsDatePreset,
    movementsStartDate,
    movementsEndDate,
    movementsSortOrder,
    financialCategories,
    projects,
    leads
  ]);

  // Group filtered movements by Month with summary subtotals
  const groupedMovementsByMonth = useMemo(() => {
    const groups: Array<{
      monthKey: string; // e.g. "2026-08"
      monthLabel: string; // e.g. "August 2026"
      totalIncome: number;
      totalExpense: number;
      net: number;
      records: FinancialRecord[];
    }> = [];

    const map = new Map<string, (typeof groups)[0]>();

    filteredMovements.forEach((rec) => {
      const dateStr = rec.paidDate || rec.issueDate || "1970-01-01";
      const monthKey = dateStr.slice(0, 7); // "YYYY-MM"

      let group = map.get(monthKey);
      if (!group) {
        const [yStr, mStr] = monthKey.split("-");
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;
        const d = new Date(y, isNaN(m) ? 0 : m, 1);
        const monthName = d.toLocaleDateString(
          userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US",
          {
            month: "long",
            year: "numeric"
          }
        );
        const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        group = {
          monthKey,
          monthLabel,
          totalIncome: 0,
          totalExpense: 0,
          net: 0,
          records: []
        };
        map.set(monthKey, group);
        groups.push(group);
      }

      const amount = rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned;
      if (rec.type === "income") {
        group.totalIncome += amount;
      } else {
        group.totalExpense += amount;
      }
      group.net = group.totalIncome - group.totalExpense;
      group.records.push(rec);
    });

    return groups;
  }, [filteredMovements, userLanguage]);

  // Total summary of all currently filtered movements
  const movementsSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredMovements.forEach((r) => {
      const val = r.amountReal > 0 ? r.amountReal : r.amountPlanned;
      if (r.type === "income") income += val;
      else expense += val;
    });
    return { income, expense, net: income - expense, count: filteredMovements.length };
  }, [filteredMovements]);

  // Infinite Scroll IntersectionObserver
  useEffect(() => {
    if (activeTab !== "movements") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setMovementsVisibleCount((prev) => {
            if (prev < filteredMovements.length) {
              return prev + 40;
            }
            return prev;
          });
        }
      },
      { rootMargin: "300px" }
    );

    if (movementsSentinelRef.current) {
      observer.observe(movementsSentinelRef.current);
    }

    return () => observer.disconnect();
  }, [activeTab, filteredMovements.length]);

  // Reset visible count when filters change
  useEffect(() => {
    setMovementsVisibleCount(40);
  }, [
    movementsSearch,
    movementsType,
    movementsCategoryId,
    movementsScope,
    movementsProjectId,
    movementsClientId,
    movementsMinAmount,
    movementsMaxAmount,
    movementsDatePreset,
    movementsStartDate,
    movementsEndDate,
    movementsSortOrder
  ]);

  const hasActiveMovementsFilters =
    movementsSearch !== "" ||
    movementsType !== "all" ||
    movementsCategoryId !== "all" ||
    movementsScope !== "all" ||
    movementsProjectId !== "all" ||
    movementsClientId !== "all" ||
    movementsMinAmount !== "" ||
    movementsMaxAmount !== "" ||
    movementsDatePreset !== "all" ||
    movementsStartDate !== "" ||
    movementsEndDate !== "";

  const clearAllMovementsFilters = () => {
    setMovementsSearch("");
    setMovementsType("all");
    setMovementsCategoryId("all");
    setMovementsScope("all");
    setMovementsProjectId("all");
    setMovementsClientId("all");
    setMovementsMinAmount("");
    setMovementsMaxAmount("");
    setMovementsDatePreset("all");
    setMovementsStartDate("");
    setMovementsEndDate("");
  };

  // ==========================================
  // 4. RECURRING EXPENSES TAB STATE & LOGIC
  // ==========================================
  const [recurringSearch, setRecurringSearch] = useState("");
  const [recurringFreqFilter, setRecurringFreqFilter] = useState<string>("all");
  const [recurringStatusFilter, setRecurringStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [recurringScopeFilter, setRecurringScopeFilter] = useState<string>("all");

  // Helper to open modal for creating a new recurring expense
  const handleOpenCreateRecurringModal = (type: FinancialType = "expense", scope: "global" | "project" | "client" = "global") => {
    setEditingRecord(null);
    setFormType(type);
    setFormSubtype("expense");
    setFormTitle("");
    setFormDescription("");
    setFormCategoryId("");
    setFormAmountPlanned("");
    setFormAmountReal("");
    setFormStatus("planned");
    setFormIssueDate(todayLocal());
    setFormDueDate("");
    setFormPaidDate("");
    setFormPaymentMethod("bank_transfer");
    setFormScope(scope);
    setFormProjectId("");
    setFormClientId("");
    setFormInvoiceNumber("");
    setFormTaxRate(20);
    setFormIsRecurring(true);
    setFormRecurringFreq("monthly");
    setFormMonthlyType("day_of_month");
    setFormDayOfMonth(1);
    setFormWeekOfMonth(1);
    setFormWeeklyDay(1);
    setFormNthDayOfWeek(1);
    setFormYearlyMonth(1);
    setFormRecurringStartDate(todayLocal());
    setFormRecurringEndDate("");
    setIsModalOpen(true);
  };

  // Helper to duplicate a recurring expense rule
  const handleDuplicateRecurring = (rec: FinancialRecord) => {
    const copy: FinancialRecord = {
      ...rec,
      id: `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: `${rec.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setFinancialRecords((prev) => [copy, ...prev]);
    (window as any).showToast?.(t("Recurring expense duplicated", "Pravidelný výdavok bol skopírovaný", "Ismétlődő tétel duplikálva"));
  };

  // Helper to toggle active vs paused status
  const handleToggleRecurringActive = (recId: string) => {
    setFinancialRecords((prev) =>
      prev.map((r) => {
        if (r.id === recId) {
          const nextStatus: FinancialStatus = r.status === "cancelled" ? "planned" : "cancelled";
          return {
            ...r,
            status: nextStatus,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      })
    );
  };

  // Helper to calculate monthly equivalent cost of a recurring expense
  const getMonthlyEquivalent = (amount: number, freq?: FinancialRecurringFrequency | null): number => {
    if (!freq || freq === "monthly") return amount;
    if (freq === "weekly") return amount * (52 / 12);
    if (freq === "yearly") return amount / 12;
    return amount;
  };

  // Helper to compute human-readable recurrence description
  const getRecurrenceDescription = (rec: FinancialRecord) => {
    const cfg = rec.recurringConfig || {};
    const freq = rec.recurringFrequency || "monthly";

    if (freq === "weekly") {
      const days = [
        t("Sunday", "Nedeľa", "Vasárnap"),
        t("Monday", "Pondelok", "Hétfő"),
        t("Tuesday", "Utorok", "Kedd"),
        t("Wednesday", "Streda", "Szerda"),
        t("Thursday", "Štvrtok", "Csütörtök"),
        t("Friday", "Piatok", "Péntek"),
        t("Saturday", "Sobota", "Szombat")
      ];
      const dayName = days[cfg.dayOfWeek ?? 1];
      return t(`Every week on ${dayName}`, `Každý týždeň v: ${dayName}`, `Minden héten: ${dayName}`);
    }

    if (freq === "yearly") {
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      const mName = months[(cfg.month ?? 1) - 1] || "Jan";
      return t(`Every year in ${mName}`, `Každý rok v mesiaci ${mName}`, `Minden évben: ${mName}`);
    }

    if (cfg.monthlyType === "nth_weekday") {
      const ordinals = [
        t("1st", "1.", "1."),
        t("2nd", "2.", "2."),
        t("3rd", "3.", "3."),
        t("4th", "4.", "4."),
        t("Last", "Posledný", "Utolsó")
      ];
      const days = [
        t("Sunday", "Nedeľa", "Vasárnap"),
        t("Monday", "Pondelok", "Hétfő"),
        t("Tuesday", "Utorok", "Kedd"),
        t("Wednesday", "Streda", "Szerda"),
        t("Thursday", "Štvrtok", "Csütörtök"),
        t("Friday", "Piatok", "Péntek"),
        t("Saturday", "Sobota", "Szombat")
      ];
      const ord = ordinals[(cfg.weekOfMonth ?? 1) - 1] || `${cfg.weekOfMonth}.`;
      const dName = days[cfg.dayOfWeek ?? 1];
      return t(`Monthly on the ${ord} ${dName}`, `Mesačne v: ${ord} ${dName}`, `Havonta: ${ord} ${dName}`);
    }

    const day = cfg.dayOfMonth ?? 1;
    return t(`Monthly on day ${day}`, `Mesačne ${day}. dňa`, `Havonta ${day}. napon`);
  };

  // Helper to calculate the next due date for a recurring rule
  const getNextRecurringDueDate = (rec: FinancialRecord): { dateStr: string; daysLeft: number } => {
    const today = new Date();
    const cfg = rec.recurringConfig || {};
    const freq = rec.recurringFrequency || "monthly";

    let targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (freq === "monthly") {
      const dayOfMonth = Math.min(cfg.dayOfMonth ?? 1, 28);
      targetDate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
      if (targetDate < today) {
        targetDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
      }
    } else if (freq === "weekly") {
      const targetDay = cfg.dayOfWeek ?? 1; // Monday = 1
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
    } else if (freq === "yearly") {
      const month = (cfg.month ?? 1) - 1;
      targetDate = new Date(today.getFullYear(), month, 1);
      if (targetDate < today) {
        targetDate = new Date(today.getFullYear() + 1, month, 1);
      }
    }

    const diffTime = targetDate.getTime() - today.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const dateStr = targetDate.toISOString().split("T")[0];
    return { dateStr, daysLeft };
  };

  // Filtered recurring records list
  const filteredRecurringRecords = useMemo(() => {
    let list = financialRecords.filter((r) => r.isRecurring);

    if (recurringSearch.trim()) {
      const q = recurringSearch.toLowerCase();
      list = list.filter((r) => {
        const catBreadcrumbs = getCategoryBreadcrumbs(r.categoryId).map((c) => c.name).join(" ");
        return (
          r.title.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (catBreadcrumbs && catBreadcrumbs.toLowerCase().includes(q))
        );
      });
    }

    if (recurringFreqFilter !== "all") {
      list = list.filter((r) => (r.recurringFrequency || "monthly") === recurringFreqFilter);
    }

    if (recurringStatusFilter === "active") {
      list = list.filter((r) => r.status !== "cancelled");
    } else if (recurringStatusFilter === "paused") {
      list = list.filter((r) => r.status === "cancelled");
    }

    if (recurringScopeFilter === "global") {
      list = list.filter((r) => !r.projectId && !r.clientId);
    } else if (recurringScopeFilter === "project") {
      list = list.filter((r) => !!r.projectId);
    } else if (recurringScopeFilter === "client") {
      list = list.filter((r) => !!r.clientId);
    }

    return list;
  }, [financialRecords, recurringSearch, recurringFreqFilter, recurringStatusFilter, recurringScopeFilter, financialCategories]);

  // Summary KPIs for recurring overhead
  const recurringMetrics = useMemo<{
    activeCount: number;
    pausedCount: number;
    totalMonthlyExpense: number;
    totalMonthlyIncome: number;
    totalAnnualExpense: number;
    totalAnnualIncome: number;
    nextUpcoming: { record: FinancialRecord; daysLeft: number; dateStr: string } | null;
  }>(() => {
    const allRecurring = financialRecords.filter((r) => r.isRecurring);
    const activeRecurring = allRecurring.filter((r) => r.status !== "cancelled");
    const activeExpenses = activeRecurring.filter((r) => r.type === "expense");
    const activeIncomes = activeRecurring.filter((r) => r.type === "income");

    const totalMonthlyExpense = activeExpenses.reduce((sum, r) => {
      const amount = r.amountReal > 0 ? r.amountReal : r.amountPlanned;
      return sum + getMonthlyEquivalent(amount, r.recurringFrequency);
    }, 0);

    const totalMonthlyIncome = activeIncomes.reduce((sum, r) => {
      const amount = r.amountReal > 0 ? r.amountReal : r.amountPlanned;
      return sum + getMonthlyEquivalent(amount, r.recurringFrequency);
    }, 0);

    const totalAnnualExpense = totalMonthlyExpense * 12;
    const totalAnnualIncome = totalMonthlyIncome * 12;

    // Find closest upcoming recurring charge
    let nextUpcoming: { record: FinancialRecord; daysLeft: number; dateStr: string } | null = null;
    activeExpenses.forEach((rec) => {
      const { dateStr, daysLeft } = getNextRecurringDueDate(rec);
      if (!nextUpcoming || daysLeft < nextUpcoming.daysLeft) {
        nextUpcoming = { record: rec, daysLeft, dateStr };
      }
    });

    return {
      activeCount: activeRecurring.length,
      pausedCount: allRecurring.length - activeRecurring.length,
      totalMonthlyExpense,
      totalMonthlyIncome,
      totalAnnualExpense,
      totalAnnualIncome,
      nextUpcoming
    };
  }, [financialRecords]);

  // Quick seed standard overhead templates
  const handleQuickSeedRecurringExpenses = () => {
    const rentCat = financialCategories.find(c => c.name.includes("Nájom") || c.name.includes("Rent") || c.name.includes("Office"))?.id || null;
    const itCat = financialCategories.find(c => c.name.includes("Software") || c.name.includes("Hosting") || c.name.includes("IT"))?.id || null;
    const salaryCat = financialCategories.find(c => c.name.includes("Mzdy") || c.name.includes("Salaries") || c.name.includes("Personnel"))?.id || null;
    const accountCat = financialCategories.find(c => c.name.includes("Účtovníctvo") || c.name.includes("Accounting") || c.name.includes("Admin"))?.id || null;

    const templates: FinancialRecord[] = [
      {
        id: `fr-rec-${Date.now()}-1`,
        type: "expense",
        subtype: "expense",
        title: "Office Rent & Coworking Hub",
        description: "Monthly lease for central studio office and desk spaces",
        categoryId: rentCat,
        categoryPath: "Office & Rent > Coworking",
        amountPlanned: 1250,
        amountReal: 1250,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 1, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-2`,
        type: "expense",
        subtype: "expense",
        title: "AWS Cloud & Production Servers",
        description: "Cloud database hosting, Kubernetes cluster, and S3 storage",
        categoryId: itCat,
        categoryPath: "Software & Cloud > Hosting",
        amountPlanned: 420,
        amountReal: 420,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 15, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-3`,
        type: "expense",
        subtype: "expense",
        title: "Senior Lead Developer Retainer",
        description: "Core software engineering and architecture services",
        categoryId: salaryCat,
        categoryPath: "Salaries > Developers",
        amountPlanned: 3800,
        amountReal: 3800,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 25, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `fr-rec-${Date.now()}-4`,
        type: "expense",
        subtype: "expense",
        title: "Accounting & Tax Advisory Retainer",
        description: "Monthly payroll processing, VAT filings and financial reporting",
        categoryId: accountCat,
        categoryPath: "Admin & Operations > Accounting",
        amountPlanned: 290,
        amountReal: 290,
        currency: currencyCode || "EUR",
        status: "planned",
        issueDate: todayLocal(),
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringConfig: { dayOfMonth: 10, monthlyType: "day_of_month" },
        recurringStartDate: todayLocal(),
        projectId: null,
        clientId: null,
        taxRate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    setFinancialRecords((prev) => [...templates, ...prev]);
    (window as any).showToast?.(t("Added standard recurring overhead templates", "Pridané šablóny pravidelných výdavkov", "Alapértelmezett rendszeres kiadások hozzáadva"));
  };

  // State for Trend Graph interaction
  const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null);
  const [isWeeklyTableOpen, setIsWeeklyTableOpen] = useState(false);

  // Trend Graph Mode: "relative" (weekly net cash flow) vs "cumulative" (running bank account balance)
  const [trendMode, setTrendMode] = useState<"relative" | "cumulative">(() => {
    return (localStorage.getItem("crm_financial_trend_mode") as "relative" | "cumulative") || "relative";
  });

  // User calibrated Bank Account Balances per week (independent key per week: startIso "2026-08-17")
  const [weeklyBankBalances, setWeeklyBankBalances] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("crm_financial_weekly_bank_balances");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error parsing weekly bank balances", e);
    }
    return {};
  });

  const [defaultBankBalance] = useState<number>(() => {
    const saved = localStorage.getItem("crm_financial_current_bank_balance");
    return saved !== null ? parseFloat(saved) : 48500;
  });

  // Modal / Popover state for calibrating any week
  const [calibratingWeek, setCalibratingWeek] = useState<{
    startIso: string;
    weekLabel: string;
    dateRangeLabel: string;
    year: number;
    currentValue: number;
    isManual: boolean;
  } | null>(null);
  const [calibratingVal, setCalibratingVal] = useState<string>("");

  const handleOpenCalibrator = (b: {
    startIso: string;
    weekLabel: string;
    dateRangeLabel: string;
    year: number;
    cumulativeBalance: number;
    isManuallyCalibrated: boolean;
  }) => {
    setCalibratingWeek({
      startIso: b.startIso,
      weekLabel: b.weekLabel,
      dateRangeLabel: b.dateRangeLabel,
      year: b.year,
      currentValue: b.cumulativeBalance,
      isManual: b.isManuallyCalibrated
    });
    setCalibratingVal(String(b.cumulativeBalance));
  };

  const handleSaveWeeklyCalibration = (startIso: string, val: number) => {
    const sanitized = isNaN(val) ? 0 : val;
    const updated = { ...weeklyBankBalances, [startIso]: sanitized };
    setWeeklyBankBalances(updated);
    localStorage.setItem("crm_financial_weekly_bank_balances", JSON.stringify(updated));
    setCalibratingWeek(null);
  };

  const handleResetWeeklyCalibration = (startIso: string) => {
    const updated = { ...weeklyBankBalances };
    delete updated[startIso];
    setWeeklyBankBalances(updated);
    localStorage.setItem("crm_financial_weekly_bank_balances", JSON.stringify(updated));
    setCalibratingWeek(null);
  };

  const handleSetTrendMode = (mode: "relative" | "cumulative") => {
    setTrendMode(mode);
    localStorage.setItem("crm_financial_trend_mode", mode);
  };

  // 18-Week Dataset: 4 Past Weeks + Current Week + 13 Future Weeks (Next 3 Months)
  const weeklyTrendData = useMemo(() => {
    const now = new Date();

    const getISOWeek = (d: Date) => {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
      }
      return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    };

    const pad = (n: number) => String(n).padStart(2, "0");
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Find Monday of current week
    const currentDay = now.getDay();
    const mondayDiff = currentDay === 0 ? -6 : 1 - currentDay;
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayDiff, 0, 0, 0, 0);

    const totalPastWeeks = 4;
    const totalFutureWeeks = 13; // 3 months = ~13 weeks

    const buckets: {
      index: number;
      weekNum: number;
      year: number;
      weekLabel: string;
      dateRangeLabel: string;
      startIso: string;
      endIso: string;
      isPast: boolean;
      isCurrent: boolean;
      isFuture: boolean;
      incomeReal: number;
      incomePlanned: number;
      incomeProjected: number;
      totalIncome: number;
      expenseReal: number;
      expensePlanned: number;
      expenseProjected: number;
      totalExpense: number;
      netDifference: number;
      cumulativeBalance: number;
      isManuallyCalibrated: boolean;
      manualCalibratedAmount?: number;
      items: {
        title: string;
        amount: number;
        type: "income" | "expense";
        isRecurring: boolean;
        frequency?: string;
      }[];
    }[] = [];

    for (let i = -totalPastWeeks; i <= totalFutureWeeks; i++) {
      const weekStart = new Date(currentMonday);
      weekStart.setDate(weekStart.getDate() + i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const isPast = i < 0;
      const isCurrent = i === 0;
      const isFuture = i > 0;

      const startIso = toYMD(weekStart);
      const endIso = toYMD(weekEnd);
      const weekNum = getISOWeek(weekStart);
      const weekLabel = `W${weekNum}`;
      const startStr = `${pad(weekStart.getDate())}.${pad(weekStart.getMonth() + 1)}`;
      const endStr = `${pad(weekEnd.getDate())}.${pad(weekEnd.getMonth() + 1)}`;
      const dateRangeLabel = `${startStr} - ${endStr}`;

      buckets.push({
        index: i,
        weekNum,
        year: weekStart.getFullYear(),
        weekLabel,
        dateRangeLabel,
        startIso,
        endIso,
        isPast,
        isCurrent,
        isFuture,
        incomeReal: 0,
        incomePlanned: 0,
        incomeProjected: 0,
        totalIncome: 0,
        expenseReal: 0,
        expensePlanned: 0,
        expenseProjected: 0,
        totalExpense: 0,
        netDifference: 0,
        cumulativeBalance: 0,
        isManuallyCalibrated: false,
        items: []
      });
    }

    // 1. Distribute Single (Non-recurring) Records
    financialRecords.forEach((rec) => {
      if (rec.isRecurring) return;

      const recDateStr = rec.paidDate || rec.dueDate || rec.issueDate;
      if (!recDateStr) return;

      buckets.forEach((b) => {
        if (recDateStr >= b.startIso && recDateStr <= b.endIso) {
          const amt = rec.amountReal > 0 ? rec.amountReal : (rec.amountPlanned || 0);
          const plannedAmt = rec.amountPlanned || rec.amountReal || 0;

          if (rec.type === "income") {
            if (rec.status === "paid") {
              b.incomeReal += amt;
            } else if (b.isFuture) {
              b.incomeProjected += plannedAmt;
            } else {
              b.incomePlanned += plannedAmt;
            }
          } else {
            if (rec.status === "paid") {
              b.expenseReal += amt;
            } else if (b.isFuture) {
              b.expenseProjected += plannedAmt;
            } else {
              b.expensePlanned += plannedAmt;
            }
          }

          b.items.push({
            title: rec.title,
            amount: rec.amountPlanned || rec.amountReal,
            type: rec.type,
            isRecurring: false
          });
        }
      });
    });

    // 2. Project Recurring Movements across the weeks
    financialRecords.forEach((rec) => {
      if (!rec.isRecurring) return;

      const amt = rec.amountPlanned > 0 ? rec.amountPlanned : (rec.amountReal || 0);
      if (!amt) return;

      const config: any = rec.recurringConfig || null;

      const freq = rec.recurringFrequency || "monthly";

      buckets.forEach((b) => {
        const bStart = new Date(b.startIso);
        const bEnd = new Date(b.endIso);

        if (rec.recurringStartDate && new Date(rec.recurringStartDate) > bEnd) return;
        if (rec.recurringEndDate && new Date(rec.recurringEndDate) < bStart) return;

        let occursInWeek = false;

        if (freq === "weekly") {
          occursInWeek = true;
        } else if (freq === "monthly") {
          const targetDay = config?.dayOfMonth || 1;
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const checkDate = new Date(bStart);
            checkDate.setDate(checkDate.getDate() + dayOffset);
            if (checkDate.getDate() === targetDay) {
              occursInWeek = true;
              break;
            }
          }
        } else if (freq === "yearly") {
          const targetMonth = (config?.month || 1) - 1;
          const targetDay = config?.day || 1;
          for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const checkDate = new Date(bStart);
            checkDate.setDate(checkDate.getDate() + dayOffset);
            if (checkDate.getMonth() === targetMonth && checkDate.getDate() === targetDay) {
              occursInWeek = true;
              break;
            }
          }
        }

        if (occursInWeek) {
          if (rec.type === "income") {
            if (b.isPast || b.isCurrent) {
              b.incomeReal += amt;
            } else {
              b.incomeProjected += amt;
            }
          } else {
            if (b.isPast || b.isCurrent) {
              b.expenseReal += amt;
            } else {
              b.expenseProjected += amt;
            }
          }

          b.items.push({
            title: `🔄 ${rec.title}`,
            amount: amt,
            type: rec.type,
            isRecurring: true,
            frequency: freq
          });
        }
      });
    });

    // 3. Final totals & Net Difference per week
    buckets.forEach((b) => {
      b.totalIncome = b.incomeReal + b.incomePlanned + b.incomeProjected;
      b.totalExpense = b.expenseReal + b.expensePlanned + b.expenseProjected;
      b.netDifference = b.totalIncome - b.totalExpense;
    });

    // 4. Calculate Cumulative Running Bank Account Balance across the 18 Weeks with multi-anchor support
    const explicitAnchors: number[] = [];
    buckets.forEach((b, idx) => {
      if (weeklyBankBalances[b.startIso] !== undefined) {
        b.isManuallyCalibrated = true;
        b.manualCalibratedAmount = weeklyBankBalances[b.startIso];
        b.cumulativeBalance = weeklyBankBalances[b.startIso];
        explicitAnchors.push(idx);
      } else {
        b.isManuallyCalibrated = false;
      }
    });

    const currentIdx = buckets.findIndex((b) => b.isCurrent);

    if (explicitAnchors.length === 0) {
      // Fallback: Use default starting balance anchored at current week
      const anchorIdx = currentIdx !== -1 ? currentIdx : 0;
      buckets[anchorIdx].cumulativeBalance = defaultBankBalance;

      // Forward into future weeks
      for (let i = anchorIdx + 1; i < buckets.length; i++) {
        buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
      }

      // Backward into past weeks
      for (let i = anchorIdx - 1; i >= 0; i--) {
        buckets[i].cumulativeBalance = buckets[i + 1].cumulativeBalance - buckets[i + 1].netDifference;
      }
    } else {
      // 1. Process backward before the earliest anchor
      const firstAnchor = explicitAnchors[0];
      for (let i = firstAnchor - 1; i >= 0; i--) {
        buckets[i].cumulativeBalance = buckets[i + 1].cumulativeBalance - buckets[i + 1].netDifference;
      }

      // 2. Process between anchors
      for (let a = 0; a < explicitAnchors.length - 1; a++) {
        const fromIdx = explicitAnchors[a];
        const toIdx = explicitAnchors[a + 1];
        for (let i = fromIdx + 1; i < toIdx; i++) {
          buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
        }
      }

      // 3. Process forward after the latest anchor
      const lastAnchor = explicitAnchors[explicitAnchors.length - 1];
      for (let i = lastAnchor + 1; i < buckets.length; i++) {
        buckets[i].cumulativeBalance = buckets[i - 1].cumulativeBalance + buckets[i].netDifference;
      }
    }

    return buckets;
  }, [financialRecords, weeklyBankBalances, defaultBankBalance]);

  // Smooth Bezier path generator for SVG plotline
  const generateSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const generateAreaPath = (pts: { x: number; y: number }[], baseY: number) => {
    if (pts.length === 0) return "";
    const smooth = generateSmoothPath(pts);
    return `${smooth} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  };

  // Build hierarchical category helper for forms and tree view
  const categoryTree = useMemo(() => {
    const buildTree = (type: FinancialType) => {
      const items = financialCategories.filter((c) => c.type === type);
      const roots = items.filter((c) => !c.parentId || c.level === 1);

      return roots.map((root) => {
        const level2Children = items.filter((c) => c.parentId === root.id);
        const level2Tree = level2Children.map((l2) => {
          const level3Children = items.filter((c) => c.parentId === l2.id);
          return { ...l2, children: level3Children };
        });
        return { ...root, children: level2Tree };
      });
    };

    return {
      incomeTree: buildTree("income"),
      expenseTree: buildTree("expense")
    };
  }, [financialCategories]);

  // Overview Table Matrix Data Calculation Hook
  const overviewTableData = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();

    // 1. Build Period Columns based on tableGranularity
    let columns: {
      id: string;
      label: string;
      subLabel?: string;
      startDate: Date;
      endDate: Date;
      startIso: string;
      endIso: string;
      isCurrent: boolean;
      isFuture: boolean;
    }[] = [];

    if (tableGranularity === "month") {
      const monthNames = [
        t("Jan", "Jan", "Jan"),
        t("Feb", "Feb", "Feb"),
        t("Mar", "Mar", "Már"),
        t("Apr", "Apr", "Ápr"),
        t("May", "Máj", "Máj"),
        t("Jun", "Jún", "Jún"),
        t("Jul", "Júl", "Júl"),
        t("Aug", "Aug", "Aug"),
        t("Sep", "Sep", "Sze"),
        t("Oct", "Okt", "Okt"),
        t("Nov", "Nov", "Nov"),
        t("Dec", "Dec", "Dec")
      ];

      columns = Array.from({ length: 12 }, (_, m) => {
        const startDate = new Date(tableYear, m, 1, 0, 0, 0, 0);
        const endDate = new Date(tableYear, m + 1, 0, 23, 59, 59, 999);
        const isCurrent = now.getFullYear() === tableYear && now.getMonth() === m;
        const isFuture = new Date(tableYear, m, 1) > now;

        return {
          id: `${tableYear}-${pad(m + 1)}`,
          label: `${monthNames[m]}`,
          subLabel: `${tableYear}`,
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else if (tableGranularity === "quarter") {
      columns = [
        { id: `${tableYear}-Q1`, label: `Q1`, subLabel: t("Jan - Mar", "Jan - Mar", "Jan - Már"), startMonth: 0, endMonth: 2 },
        { id: `${tableYear}-Q2`, label: `Q2`, subLabel: t("Apr - Jun", "Apr - Jún", "Ápr - Jún"), startMonth: 3, endMonth: 5 },
        { id: `${tableYear}-Q3`, label: `Q3`, subLabel: t("Jul - Sep", "Júl - Sep", "Júl - Sze"), startMonth: 6, endMonth: 8 },
        { id: `${tableYear}-Q4`, label: `Q4`, subLabel: t("Oct - Dec", "Okt - Dec", "Okt - Dec"), startMonth: 9, endMonth: 11 }
      ].map((q) => {
        const startDate = new Date(tableYear, q.startMonth, 1, 0, 0, 0, 0);
        const endDate = new Date(tableYear, q.endMonth + 1, 0, 23, 59, 59, 999);
        const isCurrent = now >= startDate && now <= endDate;
        const isFuture = startDate > now;

        return {
          id: q.id,
          label: q.label,
          subLabel: `${q.subLabel} ${tableYear}`,
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else if (tableGranularity === "year") {
      const years = [tableYear - 2, tableYear - 1, tableYear, tableYear + 1, tableYear + 2];
      columns = years.map((y) => {
        const startDate = new Date(y, 0, 1, 0, 0, 0, 0);
        const endDate = new Date(y, 11, 31, 23, 59, 59, 999);
        const isCurrent = now.getFullYear() === y;
        const isFuture = y > now.getFullYear();

        return {
          id: `${y}`,
          label: `${y}`,
          subLabel: t("Year", "Rok", "Év"),
          startDate,
          endDate,
          startIso: toYMD(startDate),
          endIso: toYMD(endDate),
          isCurrent,
          isFuture
        };
      });
    } else {
      // Weekly columns
      columns = weeklyTrendData.map((w) => ({
        id: w.startIso,
        label: w.weekLabel,
        subLabel: w.dateRangeLabel,
        startDate: new Date(w.startIso),
        endDate: new Date(w.endIso),
        startIso: w.startIso,
        endIso: w.endIso,
        isCurrent: w.isCurrent,
        isFuture: w.isFuture
      }));
    }

    // 2. Aggregate Records into cellMap: cellMap[categoryId][colId] = { real, estimated, total }
    type CellVal = { real: number; estimated: number; total: number };
    const createEmptyCell = (): CellVal => ({ real: 0, estimated: 0, total: 0 });

    const directCellMap: Record<string, Record<string, CellVal>> = {};

    const addDirect = (catId: string, colId: string, amt: number, isReal: boolean) => {
      if (!catId || !colId || amt <= 0) return;
      if (!directCellMap[catId]) directCellMap[catId] = {};
      if (!directCellMap[catId][colId]) directCellMap[catId][colId] = createEmptyCell();

      if (isReal) {
        directCellMap[catId][colId].real += amt;
      } else {
        directCellMap[catId][colId].estimated += amt;
      }
      directCellMap[catId][colId].total += amt;
    };

    // Distribute single records
    financialRecords.forEach((rec) => {
      if (rec.isRecurring) return;
      const recDate = rec.issueDate || rec.paidDate || rec.dueDate || "";
      if (!recDate || !rec.categoryId) return;

      const amt = rec.amountReal && rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned;
      const isReal = rec.status === "paid";

      columns.forEach((col) => {
        if (recDate >= col.startIso && recDate <= col.endIso) {
          addDirect(rec.categoryId!, col.id, amt, isReal);
        }
      });
    });

    // Distribute recurring records
    financialRecords.forEach((rec) => {
      if (!rec.isRecurring || !rec.categoryId) return;
      const amt = rec.amountPlanned > 0 ? rec.amountPlanned : (rec.amountReal || 0);
      if (!amt) return;

      const config: any = rec.recurringConfig || null;
      const freq = rec.recurringFrequency || "monthly";

      columns.forEach((col) => {
        if (rec.recurringStartDate && new Date(rec.recurringStartDate) > col.endDate) return;
        if (rec.recurringEndDate && new Date(rec.recurringEndDate) < col.startDate) return;

        let occurrences = 0;
        if (tableGranularity === "month") {
          if (freq === "monthly") occurrences = 1;
          else if (freq === "weekly") occurrences = 4;
          else if (freq === "yearly" && col.startDate.getMonth() === (config?.month ? config.month - 1 : 0)) occurrences = 1;
        } else if (tableGranularity === "quarter") {
          if (freq === "monthly") occurrences = 3;
          else if (freq === "weekly") occurrences = 13;
          else if (freq === "yearly") occurrences = 1;
        } else if (tableGranularity === "year") {
          if (freq === "monthly") occurrences = 12;
          else if (freq === "weekly") occurrences = 52;
          else if (freq === "yearly") occurrences = 1;
        } else {
          // week
          if (freq === "weekly") occurrences = 1;
          else if (freq === "monthly" && col.startDate.getDate() <= 7) occurrences = 1;
        }

        if (occurrences > 0) {
          const totalAmt = amt * occurrences;
          const isReal = !col.isFuture && rec.status === "paid";
          addDirect(rec.categoryId!, col.id, totalAmt, isReal);
        }
      });
    });

    // 3. Hierarchical Rollup:
    const rolledUpCellMap: Record<string, Record<string, CellVal>> = {};

    const getCell = (catId: string, colId: string): CellVal => {
      if (!rolledUpCellMap[catId]) rolledUpCellMap[catId] = {};
      if (!rolledUpCellMap[catId][colId]) {
        rolledUpCellMap[catId][colId] = createEmptyCell();
      }
      return rolledUpCellMap[catId][colId];
    };

    // Copy direct sums
    financialCategories.forEach((cat) => {
      columns.forEach((col) => {
        const direct = directCellMap[cat.id]?.[col.id] || createEmptyCell();
        const target = getCell(cat.id, col.id);
        target.real += direct.real;
        target.estimated += direct.estimated;
        target.total += direct.total;
      });
    });

    // Add Level 3 to Level 2
    financialCategories.filter((c) => c.level === 3 && c.parentId).forEach((l3) => {
      columns.forEach((col) => {
        const l3Val = getCell(l3.id, col.id);
        const l2Val = getCell(l3.parentId!, col.id);
        l2Val.real += l3Val.real;
        l2Val.estimated += l3Val.estimated;
        l2Val.total += l3Val.total;
      });
    });

    // Add Level 2 to Level 1
    financialCategories.filter((c) => c.level === 2 && c.parentId).forEach((l2) => {
      columns.forEach((col) => {
        const l2Val = getCell(l2.id, col.id);
        const l1Val = getCell(l2.parentId!, col.id);
        l1Val.real += l2Val.real;
        l1Val.estimated += l2Val.estimated;
        l1Val.total += l2Val.total;
      });
    });

    // 4. Compute Totals across all periods for each category
    const rowTotals: Record<string, CellVal> = {};
    financialCategories.forEach((cat) => {
      rowTotals[cat.id] = createEmptyCell();
      columns.forEach((col) => {
        const v = getCell(cat.id, col.id);
        rowTotals[cat.id].real += v.real;
        rowTotals[cat.id].estimated += v.estimated;
        rowTotals[cat.id].total += v.total;
      });
    });

    // 5. Compute Section Summary Totals for each Column
    const totalExpensesByCol: Record<string, CellVal> = {};
    const totalIncomesByCol: Record<string, CellVal> = {};
    const netCashFlowByCol: Record<string, CellVal> = {};

    const totalExpenseSummary: CellVal = createEmptyCell();
    const totalIncomeSummary: CellVal = createEmptyCell();
    const netSummary: CellVal = createEmptyCell();

    const rootExpenses = financialCategories.filter((c) => c.type === "expense" && (!c.parentId || c.level === 1));
    const rootIncomes = financialCategories.filter((c) => c.type === "income" && (!c.parentId || c.level === 1));

    columns.forEach((col) => {
      const expCell = createEmptyCell();
      rootExpenses.forEach((root) => {
        const v = getCell(root.id, col.id);
        expCell.real += v.real;
        expCell.estimated += v.estimated;
        expCell.total += v.total;
      });
      totalExpensesByCol[col.id] = expCell;
      totalExpenseSummary.real += expCell.real;
      totalExpenseSummary.estimated += expCell.estimated;
      totalExpenseSummary.total += expCell.total;

      const incCell = createEmptyCell();
      rootIncomes.forEach((root) => {
        const v = getCell(root.id, col.id);
        incCell.real += v.real;
        incCell.estimated += v.estimated;
        incCell.total += v.total;
      });
      totalIncomesByCol[col.id] = incCell;
      totalIncomeSummary.real += incCell.real;
      totalIncomeSummary.estimated += incCell.estimated;
      totalIncomeSummary.total += incCell.total;

      const netCell = {
        real: incCell.real - expCell.real,
        estimated: incCell.estimated - expCell.estimated,
        total: incCell.total - expCell.total
      };
      netCashFlowByCol[col.id] = netCell;
      netSummary.real += netCell.real;
      netSummary.estimated += netCell.estimated;
      netSummary.total += netCell.total;
    });

    return {
      columns,
      rolledUpCellMap,
      rowTotals,
      totalExpensesByCol,
      totalIncomesByCol,
      netCashFlowByCol,
      totalExpenseSummary,
      totalIncomeSummary,
      netSummary
    };
  }, [financialCategories, financialRecords, tableGranularity, tableYear, weeklyTrendData]);

  // Helper to render a cell value formatted by tableValueMode with distinct colors (Expense = Red, Income = Green)
  // and reduced font size for expanded child categories (Level 2 & Level 3)
  const renderTableCellValue = (
    val: { real: number; estimated: number; total: number },
    colorType: "expense" | "income" | "net" = "income",
    level: number = 1
  ) => {
    if (!val || (val.real === 0 && val.estimated === 0 && val.total === 0)) {
      return <span className="text-slate-300 dark:text-slate-600 font-normal select-none">—</span>;
    }

    const isExpense = colorType === "expense";
    const isIncome = colorType === "income";

    const realColorClass = isExpense
      ? "text-rose-600 dark:text-rose-400"
      : isIncome
      ? "text-emerald-600 dark:text-emerald-400"
      : val.real >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

    const estColorClass = isExpense
      ? "text-rose-400 dark:text-rose-500"
      : isIncome
      ? "text-emerald-400 dark:text-emerald-500"
      : val.estimated >= 0
      ? "text-emerald-400 dark:text-emerald-500"
      : "text-rose-400 dark:text-rose-500";

    const totalColorClass = isExpense
      ? "text-rose-700 dark:text-rose-300"
      : isIncome
      ? "text-emerald-700 dark:text-emerald-300"
      : val.total >= 0
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-rose-700 dark:text-rose-300";

    // Typography size scaling: Level 1 = standard text-xs (12px), Level 2 = text-[10.5px], Level 3 = text-[9.5px]
    const mainTextSize = level === 1 ? "text-xs" : level === 2 ? "text-[10.5px]" : "text-[9.5px]";
    const estTextSize = level === 1 ? "text-[9px]" : "text-[8px]";
    const mainFontWeight = level === 1 ? "font-bold" : level === 2 ? "font-semibold" : "font-medium";

    if (tableValueMode === "real") {
      return val.real !== 0 ? (
        <span className={`${mainFontWeight} ${mainTextSize} ${realColorClass}`}>{money(val.real)}</span>
      ) : (
        <span className="text-slate-300 dark:text-slate-600 font-normal select-none">—</span>
      );
    }

    if (tableValueMode === "estimated") {
      return val.estimated !== 0 ? (
        <span className={`font-medium ${mainTextSize} ${estColorClass}`}>{money(val.estimated)}</span>
      ) : (
        <span className="text-slate-300 dark:text-slate-600 font-normal select-none">—</span>
      );
    }

    if (tableValueMode === "total") {
      return <span className={`${mainFontWeight} ${mainTextSize} ${totalColorClass}`}>{money(val.total)}</span>;
    }

    // Both mode (Default): Real on top, Estimated below
    return (
      <div className="flex flex-col items-end leading-tight py-0.5">
        {val.real !== 0 ? (
          <span className={`${mainFontWeight} ${mainTextSize} ${realColorClass}`}>{money(val.real)}</span>
        ) : (
          <span className="text-slate-300 dark:text-slate-600 font-normal text-[10px]">—</span>
        )}
        {val.estimated !== 0 && (
          <span className={`${estTextSize} font-medium ${estColorClass}`}>
            est: {money(val.estimated)}
          </span>
        )}
      </div>
    );
  };

  // Helper to render recursive category rows in Overview Table Matrix
  const renderCategoryMatrixRow = (cat: any, level: number = 1, type: "expense" | "income" = "expense"): React.ReactNode => {
    const isExpanded = expandedCatIds.has(cat.id);
    const hasChildren = cat.children && cat.children.length > 0;
    const catTotal = overviewTableData.rowTotals[cat.id] || { real: 0, estimated: 0, total: 0 };

    // Search query filter: if searching, only show matching or if children match
    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase();
      const matchesSelf = cat.name.toLowerCase().includes(q);
      const matchesChild = cat.children?.some((c: any) => c.name.toLowerCase().includes(q) || c.children?.some((c3: any) => c3.name.toLowerCase().includes(q)));
      if (!matchesSelf && !matchesChild) return null;
    }

    return (
      <React.Fragment key={"cat-row-" + cat.id}>
        <tr
          className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
            level === 1
              ? "bg-slate-50/60 dark:bg-slate-800/30 font-bold"
              : level === 2
              ? "bg-white dark:bg-slate-900/80 text-xs font-semibold"
              : "bg-white dark:bg-slate-900 text-xs font-normal text-slate-600 dark:text-slate-400"
          }`}
        >
          {/* Category Name Cell (Sticky Left with solid background and crisp right border) */}
          <td
            className={`w-[320px] min-w-[320px] max-w-[320px] py-2 px-3 sticky left-0 z-20 border-r-2 border-slate-200 dark:border-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.04)] select-none ${
              level === 1
                ? "bg-slate-50 dark:bg-slate-900 font-bold text-xs text-slate-900 dark:text-white"
                : level === 2
                ? "bg-white dark:bg-slate-900 pl-7 font-semibold text-[11px] text-slate-800 dark:text-slate-200"
                : "bg-white dark:bg-slate-900 pl-12 font-normal text-[10px] text-slate-600 dark:text-slate-400"
            }`}
          >
            <div
              className={`flex items-center gap-1.5 ${hasChildren ? "cursor-pointer" : ""}`}
              onClick={() => hasChildren && toggleCategoryExpand(cat.id)}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-transform cursor-pointer"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? "rotate-90 text-purple-600" : ""}`}
                  />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}

              {level === 1 ? (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: cat.color || (type === "expense" ? "#f43f5e" : "#10b981") }}
                />
              ) : (
                <span className="text-slate-400 dark:text-slate-600 text-[10px] shrink-0">
                  {level === 2 ? "↳" : "↳↳"}
                </span>
              )}

              <span className="truncate max-w-[220px]" title={cat.name}>
                {cat.name}
              </span>
            </div>
          </td>

          {/* Period Columns */}
          {overviewTableData.columns.map((col) => {
            const cellVal = overviewTableData.rolledUpCellMap[cat.id]?.[col.id] || { real: 0, estimated: 0, total: 0 };
            return (
              <td
                key={cat.id + "-" + col.id}
                className={`py-1.5 px-3 text-right ${
                  col.isCurrent ? "bg-indigo-50/20 dark:bg-indigo-950/10 border-x border-indigo-100 dark:border-indigo-900/30" : ""
                }`}
              >
                {renderTableCellValue(cellVal, type, level)}
              </td>
            );
          })}

          {/* Row Total (Sticky Right with solid background) */}
          <td className="py-1.5 px-4 text-right font-bold bg-slate-50 dark:bg-slate-800/90 border-l border-slate-200 dark:border-slate-700 sticky right-0 z-20">
            {renderTableCellValue(catTotal, type, level)}
          </td>
        </tr>

        {/* Render nested children if expanded */}
        {hasChildren && isExpanded && cat.children.map((child: any) => renderCategoryMatrixRow(child, level + 1, type))}
      </React.Fragment>
    );
  };

  // Open Creation Modal with preset type & scope
  const handleOpenCreateModal = (type: FinancialType, defaultScope: "global" | "project" | "client" = "global") => {
    setEditingRecord(null);
    setFormType(type);
    setFormSubtype(type === "income" ? "invoice" : "regular");
    setFormTitle("");
    setFormDescription("");
    setFormCategoryId("");
    setFormAmountPlanned("");
    setFormAmountReal("");
    setFormStatus(type === "income" ? "pending" : "planned");
    setFormIssueDate(todayLocal());
    setFormDueDate("");
    setFormPaidDate("");
    setFormPaymentMethod("bank_transfer");
    setFormScope(defaultScope);
    setFormProjectId("");
    setFormClientId("");
    setFormInvoiceNumber(type === "income" ? `FA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : "");
    setFormTaxRate(20);
    setFormIsRecurring(false);
    setFormRecurringFreq("monthly");
    setFormWeeklyDay(1);
    setFormMonthlyType("day_of_month");
    setFormDayOfMonth(1);
    setFormWeekOfMonth(1);
    setFormNthDayOfWeek(1);
    setFormYearlyMonth(1);
    setFormRecurringStartDate(todayLocal());
    setFormRecurringEndDate("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (rec: FinancialRecord) => {
    setEditingRecord(rec);
    setFormType(rec.type);
    setFormSubtype(rec.subtype || "regular");
    setFormTitle(rec.title);
    setFormDescription(rec.description || "");
    setFormCategoryId(rec.categoryId || "");
    setFormAmountPlanned(rec.amountPlanned);
    setFormAmountReal(rec.amountReal);
    setFormStatus(rec.status);
    setFormIssueDate(rec.issueDate || todayLocal());
    setFormDueDate(rec.dueDate || "");
    setFormPaidDate(rec.paidDate || "");
    setFormPaymentMethod(rec.paymentMethod || "bank_transfer");
    setFormScope(rec.projectId ? "project" : rec.clientId ? "client" : "global");
    setFormProjectId(rec.projectId || "");
    setFormClientId(rec.clientId || "");
    setFormInvoiceNumber(rec.invoiceNumber || "");
    setFormTaxRate(rec.taxRate ?? 20);
    setFormIsRecurring(rec.isRecurring || false);
    setFormRecurringFreq(rec.recurringFrequency || "monthly");

    const cfg = rec.recurringConfig || {};
    setFormWeeklyDay(cfg.dayOfWeek ?? 1);
    setFormMonthlyType(cfg.monthlyType ?? "day_of_month");
    setFormDayOfMonth(cfg.dayOfMonth ?? 1);
    setFormWeekOfMonth(cfg.weekOfMonth ?? 1);
    setFormNthDayOfWeek(cfg.dayOfWeek ?? 1);
    setFormYearlyMonth(cfg.month ?? 1);
    setFormRecurringStartDate(rec.recurringStartDate || rec.issueDate || todayLocal());
    setFormRecurringEndDate(rec.recurringEndDate || "");

    setIsModalOpen(true);
  };

  // Save Transaction
  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert(t("Title is required", "Názov záznamu je povinný", "A megnevezés kitöltése kötelező"));
      return;
    }

    // Resolve category path for breadcrumb display
    let path = "";
    if (formCategoryId) {
      const cat = financialCategories.find((c) => c.id === formCategoryId);
      if (cat) {
        if (cat.level === 3 && cat.parentId) {
          const l2 = financialCategories.find((c) => c.id === cat.parentId);
          const l1 = l2?.parentId ? financialCategories.find((c) => c.id === l2.parentId) : null;
          path = [l1?.name, l2?.name, cat.name].filter(Boolean).join(" > ");
        } else if (cat.level === 2 && cat.parentId) {
          const l1 = financialCategories.find((c) => c.id === cat.parentId);
          path = [l1?.name, cat.name].filter(Boolean).join(" > ");
        } else {
          path = cat.name;
        }
      }
    }

    const recConfig = formIsRecurring
      ? {
          dayOfWeek: formRecurringFreq === "weekly" ? formWeeklyDay : formNthDayOfWeek,
          monthlyType: formMonthlyType,
          dayOfMonth: formDayOfMonth,
          weekOfMonth: formWeekOfMonth,
          month: formYearlyMonth
        }
      : null;

    const recordPayload: FinancialRecord = {
      id: editingRecord?.id || `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: formType,
      subtype: formSubtype,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      categoryId: formCategoryId || null,
      categoryPath: path || null,
      amountPlanned: Number(formAmountPlanned) || 0,
      amountReal: Number(formAmountReal) || 0,
      currency: currencyCode || "EUR",
      status: formStatus,
      issueDate: formIssueDate,
      dueDate: formDueDate || null,
      paidDate: formStatus === "paid" ? (formPaidDate || todayLocal()) : (formPaidDate || null),
      paymentMethod: formPaymentMethod || "bank_transfer",
      isRecurring: formIsRecurring,
      recurringFrequency: formIsRecurring ? formRecurringFreq : null,
      recurringConfig: recConfig,
      recurringStartDate: formIsRecurring ? formRecurringStartDate : null,
      recurringEndDate: formIsRecurring ? formRecurringEndDate || null : null,
      projectId: formScope === "project" && formProjectId ? formProjectId : null,
      clientId: formScope === "client" && formClientId ? formClientId : (formScope === "project" && formProjectId ? (projects.find(p => p.id === formProjectId)?.clientId || projects.find(p => p.id === formProjectId)?.leadId || null) : null),
      invoiceNumber: formInvoiceNumber.trim() || null,
      taxRate: formTaxRate,
      attachments: editingRecord?.attachments || [],
      createdBy: editingRecord?.createdBy || (window as any).ccrmCurrentUser?.email || "Admin",
      createdAt: editingRecord?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setFinancialRecords((prev) => {
      const exists = prev.some((r) => r.id === recordPayload.id);
      if (exists) {
        return prev.map((r) => (r.id === recordPayload.id ? recordPayload : r));
      }
      return [recordPayload, ...prev];
    });

    handleCloseModal();
    (window as any).showToast?.(t("Financial record saved!", "Finančný záznam bol uložený!", "Pénzügyi tétel mentve!"));
  };

  // Delete Transaction
  const handleDeleteTransaction = (id: string) => {
    if (confirm(t("Are you sure you want to delete this financial record?", "Naozaj chcete vymazať tento finančný záznam?", "Biztosan törölni szeretné ezt a tételt?"))) {
      setFinancialRecords((prev) => prev.filter((r) => r.id !== id));
      (window as any).showToast?.(t("Record deleted", "Záznam bol vymazaný", "Tétel törölve"));
    }
  };

  // Create Category
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    let parentLevel = 1;
    if (newCatParentId) {
      const parent = financialCategories.find((c) => c.id === newCatParentId);
      if (parent) {
        parentLevel = parent.level + 1;
      }
    }

    if (parentLevel > 3) {
      alert(t("Maximum category depth is 3 levels.", "Maximálna hĺbka kategórií je 3 úrovne.", "A maximális kategóriamélység 3 szint."));
      return;
    }

    const newCat: FinancialCategory = {
      id: `fc-${catTreeType}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: catTreeType,
      name: newCatName.trim(),
      parentId: newCatParentId || null,
      level: parentLevel as 1 | 2 | 3,
      color: newCatColor,
      icon: parentLevel === 1 ? "Layers" : parentLevel === 2 ? "Folder" : "Tag",
      createdAt: new Date().toISOString()
    };

    setFinancialCategories((prev) => [...prev, newCat]);
    setNewCatName("");
    setNewCatParentId("");
    (window as any).showToast?.(t("Category added!", "Kategória bola pridaná!", "Kategória hozzáadva!"));
  };

  // Delete Category
  const handleDeleteCategory = (id: string) => {
    if (confirm(t("Delete category and its subcategories?", "Vymazať kategóriu a všetky jej podkategórie?", "Törli a kategóriát és alkategóriáit?"))) {
      // Find all nested child ids recursively
      const toDeleteIds = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        financialCategories.forEach((c) => {
          if (c.parentId && toDeleteIds.has(c.parentId) && !toDeleteIds.has(c.id)) {
            toDeleteIds.add(c.id);
            changed = true;
          }
        });
      }

      setFinancialCategories((prev) => prev.filter((c) => !toDeleteIds.has(c.id)));
      (window as any).showToast?.(t("Category removed", "Kategória odstránená", "Kategória eltávolítva"));
    }
  };

  // Shared Transaction Form Fields (used in both Slideout Drawer for Edit and Center Popup for Create)
  const renderTransactionFormFields = () => (
    <>
      {/* Type Switcher (Income vs Expense) */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setFormType("income");
            if (!formInvoiceNumber) {
              setFormInvoiceNumber(`FA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
            }
          }}
          className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            formType === "income" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          {t("Income / Invoice", "Príjem / Faktúra", "Bevétel / Számla")}
        </button>
        <button
          type="button"
          onClick={() => setFormType("expense")}
          className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            formType === "expense" ? "bg-rose-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          {t("Expense / Cost", "Výdavok / Náklad", "Kiadás / Költség")}
        </button>
      </div>

      {/* Title & Invoice # */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
            {t("Movement Title *", "Názov finančného pohybu *", "Tétel megnevezése *")}
          </label>
          <input
            type="text"
            required
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder={formType === "income" ? t("e.g. Countertop supply & installation", "napr. Dodávka a montáž kuchynskej linky", "pl. Konyhapult szállítása és beépítése") : t("e.g. Laminam slabs purchase (IT), Office rent...", "napr. Nákup dosiek Taliansko, Nájom skladu...", "pl. Lapok beszerzése, Irodabérlet...")}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
            {t("Invoice # / Doc Ref", "Číslo faktúry / Dokladu", "Számlaszám")}
          </label>
          <input
            type="text"
            value={formInvoiceNumber}
            onChange={(e) => setFormInvoiceNumber(e.target.value)}
            placeholder="FA-2026-0001"
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Scope (Global vs Project vs Client) */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          {t("Financial Scope & Association", "Rozsah a priradenie", "Hatókör és hozzárendelés")}
        </label>
        <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFormScope("global")}
            className={`py-2 px-3 rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              formScope === "global"
                ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            {t("Global Company", "Globálne firemné", "Globális vállalati")}
          </button>

          <button
            type="button"
            onClick={() => setFormScope("project")}
            className={`py-2 px-3 rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              formScope === "project"
                ? "bg-indigo-50 border-indigo-500 text-indigo-700 font-bold dark:bg-indigo-950/40 dark:text-indigo-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            {t("Project", "Projekt", "Projekt")}
          </button>

          <button
            type="button"
            onClick={() => setFormScope("client")}
            className={`py-2 px-3 rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              formScope === "client"
                ? "bg-teal-50 border-teal-500 text-teal-700 font-bold dark:bg-teal-950/40 dark:text-teal-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            {t("Client", "Klient", "Ügyfél")}
          </button>
        </div>

        {/* Project Selector if Project Scope */}
        {formScope === "project" && (
          <div className="pt-2 animate-in fade-in">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">
              {t("Select Associated Project *", "Vyberte projekt *", "Válasszon projektet *")}
            </label>
            <select
              value={formProjectId}
              onChange={(e) => setFormProjectId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="">{t("-- Select Project --", "-- Vyberte projekt --", "-- Válasszon --")}</option>
              {projects.map((p) => {
                const lead = leads.find((l) => l.id === p.leadId || l.id === p.clientId);
                return (
                  <option key={p.id} value={p.id}>
                    {lead ? `${lead.name} (${lead.city || ""})` : p.id}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Client Selector if Client Scope */}
        {formScope === "client" && (
          <div className="pt-2 animate-in fade-in">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">
              {t("Select Associated Client *", "Vyberte klienta *", "Válasszon ügyfelet *")}
            </label>
            <select
              value={formClientId}
              onChange={(e) => setFormClientId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="">{t("-- Select Client --", "-- Vyberte klienta --", "-- Válasszon ügyfelet --")}</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.city || "N/A"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 3-Level Category Selector */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
          {t("Category Classification (3 Levels)", "Klasifikácia kategórie (3 úrovne)", "Kategória besorolás")}
        </label>
        <SearchableCategorySelect
          value={formCategoryId}
          onChange={(catId) => setFormCategoryId(catId === "all" ? "" : catId)}
          categories={financialCategories}
          filterType={formType}
          allowAll={false}
          placeholder={t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon kategóriát --")}
          t={t}
        />
      </div>

      {/* PLANNED & REAL AMOUNTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
            <span>{t("Planned Amount (€) *", "Plánovaná suma (€) *", "Tervezett összeg (€) *")}</span>
            <span className="text-[10px] text-slate-400 font-normal">{t("Budget / Target", "Rozpočet / Cieľ", "Költségvetés")}</span>
          </label>
          <input
            type="number"
            step="0.01"
            required
            value={formAmountPlanned}
            onChange={(e) => setFormAmountPlanned(e.target.value ? parseFloat(e.target.value) : "")}
            placeholder="0.00"
            className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1 flex items-center justify-between">
            <span>{t("Real / Paid Amount (€)", "Skutočná / Reálna suma (€)", "Valós / Fizetett összeg (€)")}</span>
            <span className="text-[10px] text-slate-400 font-normal">{t("Actual realized", "Skutočne zaplatené", "Tényleges")}</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={formAmountReal}
            onChange={(e) => setFormAmountReal(e.target.value ? parseFloat(e.target.value) : "")}
            placeholder="0.00"
            className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Status, Dates, Payment Method */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
            {t("Payment Status", "Stav úhrady", "Fizetési állapot")}
          </label>
          <select
            value={formStatus}
            onChange={(e) => {
              const newSt = e.target.value as FinancialStatus;
              setFormStatus(newSt);
              if (newSt === "paid" && (!formAmountReal || formAmountReal === 0) && formAmountPlanned) {
                setFormAmountReal(formAmountPlanned);
              }
            }}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="planned">{t("Planned / Scheduled", "Plánované", "Tervezett")}</option>
            <option value="pending">{t("Pending / Issued", "Čaká na úhradu", "Fizetésre vár")}</option>
            <option value="paid">{t("Paid / Settled", "Uhradené", "Fizetve")}</option>
            <option value="partially_paid">{t("Partially Paid", "Čiastočne uhradené", "Részben fizetve")}</option>
            <option value="overdue">{t("Overdue", "Po splatnosti", "Lejárt")}</option>
            <option value="cancelled">{t("Cancelled", "Zrušené", "Törölve")}</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
            {t("Issue / Scheduled Date", "Dátum vystavenia / naplánovania", "Kiállítási / tervezett dátum")}
          </label>
          <input
            type="date"
            required
            value={formIssueDate}
            onChange={(e) => setFormIssueDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
            {t("Due Date", "Dátum splatnosti", "Esedékesség dátuma")}
          </label>
          <input
            type="date"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
          />
        </div>
      </div>

      {/* RECURRING PAYMENT CONFIG */}
      <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {t("Recurring Movement Schedule", "Pravidelná / opakujúca sa platba", "Rendszeres / ismétlődő tétel")}
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formIsRecurring}
              onChange={(e) => setFormIsRecurring(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {formIsRecurring && (
          <div className="space-y-3 pt-2 border-t border-indigo-100 dark:border-indigo-900/50 animate-in fade-in">
            {/* Frequency selector: Weekly / Monthly / Yearly */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                {t("Recurrence Frequency", "Periodicita opakovania", "Gyakoriság")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "weekly", label: t("Weekly", "Týždenne", "Heti") },
                  { id: "monthly", label: t("Monthly", "Mesačne", "Havi") },
                  { id: "yearly", label: t("Yearly", "Ročne", "Éves") }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormRecurringFreq(f.id as any)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      formRecurringFreq === f.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* WEEKLY: Select Day of Week */}
            {formRecurringFreq === "weekly" && (
              <div className="animate-in fade-in">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {t("Day of the Week", "Deň v týždni", "A hét napja")}
                </label>
                <select
                  value={formWeeklyDay}
                  onChange={(e) => setFormWeeklyDay(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="1">{t("Monday", "Pondelok", "Hétfő")}</option>
                  <option value="2">{t("Tuesday", "Utorok", "Kedd")}</option>
                  <option value="3">{t("Wednesday", "Streda", "Szerda")}</option>
                  <option value="4">{t("Thursday", "Štvrtok", "Csütörtök")}</option>
                  <option value="5">{t("Friday", "Piatok", "Péntek")}</option>
                  <option value="6">{t("Saturday", "Sobota", "Szombat")}</option>
                  <option value="0">{t("Sunday", "Nedeľa", "Vasárnap")}</option>
                </select>
              </div>
            )}

            {/* MONTHLY: Specific Day vs Nth Weekday */}
            {formRecurringFreq === "monthly" && (
              <div className="space-y-2 animate-in fade-in">
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="monthlyType"
                      checked={formMonthlyType === "day_of_month"}
                      onChange={() => setFormMonthlyType("day_of_month")}
                    />
                    <span>{t("Specific Day of Month", "Konkrétny deň v mesiaci", "A hónap adott napja")}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="monthlyType"
                      checked={formMonthlyType === "nth_weekday"}
                      onChange={() => setFormMonthlyType("nth_weekday")}
                    />
                    <span>{t("Nth Weekday of Month (e.g. 1st Monday)", "Relatívny deň (napr. 1. pondelok)", "N-edik hétköznap (pl. 1. hétfő)")}</span>
                  </label>
                </div>

                {formMonthlyType === "day_of_month" ? (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Day of Month (1 - 31)", "Deň v mesiaci (1 - 31)", "Hányadikán (1 - 31)")}</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formDayOfMonth}
                      onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Week of Month", "Týždeň v mesiaci", "Hét a hónapban")}</label>
                      <select
                        value={formWeekOfMonth}
                        onChange={(e) => setFormWeekOfMonth(parseInt(e.target.value))}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                      >
                        <option value="1">{t("1st (First)", "1. (Prvý)", "1. (Első)")}</option>
                        <option value="2">{t("2nd (Second)", "2. (Druhý)", "2. (Második)")}</option>
                        <option value="3">{t("3rd (Third)", "3. (Tretí)", "3. (Harmadik)")}</option>
                        <option value="4">{t("4th (Fourth)", "4. (Štvrtý)", "4. (Negyedik)")}</option>
                        <option value="-1">{t("Last", "Posledný", "Utolsó")}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Weekday", "Deň v týždni", "Hétköznap")}</label>
                      <select
                        value={formNthDayOfWeek}
                        onChange={(e) => setFormNthDayOfWeek(parseInt(e.target.value))}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                      >
                        <option value="1">{t("Monday", "Pondelok", "Hétfő")}</option>
                        <option value="2">{t("Tuesday", "Utorok", "Kedd")}</option>
                        <option value="3">{t("Wednesday", "Streda", "Szerda")}</option>
                        <option value="4">{t("Thursday", "Štvrtok", "Csütörtök")}</option>
                        <option value="5">{t("Friday", "Piatok", "Péntek")}</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* YEARLY: Month & Day */}
            {formRecurringFreq === "yearly" && (
              <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Month of Year", "Mesiac v roku", "Hónap")}</label>
                  <select
                    value={formYearlyMonth}
                    onChange={(e) => setFormYearlyMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    {[
                      "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
                      "Júl", "August", "September", "Október", "November", "December"
                    ].map((mName, idx) => (
                      <option key={idx + 1} value={idx + 1}>{mName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Day of Month", "Deň v mesiaci", "Nap")}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formDayOfMonth}
                    onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
          {t("Notes / Description", "Poznámka / Popis položiek", "Megjegyzés / leírás")}
        </label>
        <textarea
          rows={2}
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder={t("Additional details, contract references, itemized breakdown...", "Podrobnosti o položkách, zmluve, podmienkach...", "További részletek...")}
          className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* 1. TOP HEADER & COMMAND BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900/90 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <Coins className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t("Financial Management & Revenue Control", "Finančný manažment a riadenie výnosov", "Pénzügyi menedzsment és bevételkezelés")}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("Track planned vs real cash flows, project revenue profitability, single & recurring expenses, and 3-level categories.", "Sledovanie plánovaných a reálnych tokov, ziskovosti projektov, jednorazových a pravidelných výdavkov a 3 úrovní kategórií.", "Tervezett és valós pénzáramlások, projektjövedelmezőség, rendszeres kiadások és 3 szintű kategóriák.")}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleOpenCreateModal("income", "global")}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-2xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>{t("+ New Income / Invoice", "+ Nový príjem / Faktúra", "+ Új bevétel / Számla")}</span>
          </button>

          <button
            onClick={() => handleOpenCreateModal("expense", "global")}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-2xl shadow-md shadow-rose-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>{t("+ New Expense", "+ Nový výdavok", "+ Új kiadás")}</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none gap-2">
        {[
          { id: "overview", label: t("📊 Global Overview & Trend", "📊 Globálny prehľad & Trend", "📊 Globális áttekintés & Trend") },
          { id: "table", label: t("📋 Overview Table", "📋 Prehľadová tabuľka", "📋 Áttekintő táblázat") },
          { id: "movements", label: t("💸 Movements", "💸 Pohyby", "💸 Mozgások") },
          { id: "recurring", label: t("🔄 Recurring Expenses", "🔄 Pravidelné výdavky", "🔄 Rendszeres kiadások") },
          { id: "categories", label: t("🏷️ Movement Categories", "🏷️ Kategórie pohybov", "🏷️ Mozgási kategóriák") }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-t-xl"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. TAB CONTENT 1: GLOBAL OVERVIEW (FOCUSED HYBRID TREND & 3-MONTH PROJECTION) */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* HYBRID WEEKLY TREND & 3-MONTH PROJECTION CHART */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
            {/* 1. Header with Mode Toggle & Bank Balance Calibrators */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-500" />
                    {trendMode === "cumulative"
                      ? t("Weekly Trend & 3-Month Projection (Cumulative Bank Balance)", "Týždenný vývoj a 3-mesačná prognóza (Kumulatívny stav na účte)", "Heti trend és 3 hónapos előrejelzés (Kumulált bankszámla egyenleg)")
                      : t("Weekly Trend & 3-Month Projection (Relative Cash Flow)", "Týždenný vývoj a 3-mesačná prognóza (Relatívny cash flow)", "Heti trend és 3 hónapos előrejelzés (Relatív pénzáramlás)")}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    trendMode === "cumulative" 
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" 
                      : "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                  }`}>
                    {trendMode === "cumulative" ? t("🏦 Cumulative Funds", "🏦 Kumulatívny stav", "🏦 Kumulált egyenleg") : t("📊 Relative Cash Flow", "📊 Relatívny tok", "📊 Relatív folyam")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {trendMode === "cumulative"
                    ? t(
                        "Bars display weekly income & expense. The continuous plotline projects running Bank Account Balance (cumulative cash reserves) forward for the next 3 months. Click any week to calibrate its balance independently.",
                        "Stĺpce zobrazujú týždenné príjmy a výdavky. Spojitá krivka zobrazuje projektovaný stav na bankovom účte. Kliknutím na ľubovoľný týždeň môžete nezávisle nastaviť jeho zostatok.",
                        "Az oszlopok a heti bevételeket és kiadásokat mutatják. A folytonos vonal a várható bankszámla egyenleget jelzi. Kattintson bármelyik hétre az egyenleg független beállításához."
                      )
                    : t(
                        "Bars display cumulative weekly income & expense. The continuous plotline traces weekly net difference and future projected revenue (projected income − projected expense).",
                        "Stĺpce zobrazujú týždenné kumulatívne príjmy a výdavky. Spojitá krivka zobrazuje čistý rozdiel a budúce projektované tržby po odpočítaní výdavkov.",
                        "Az oszlopok a heti kumulált bevételeket és kiadásokat mutatják. A folytonos vonal a heti nettó különbözetet és a jövőbeli tervezett nyereséget jelzi."
                      )}
                </p>
              </div>

              {/* Controls: Mode Switcher Pill */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Mode Switcher Pill */}
                <div className="bg-slate-100 dark:bg-slate-800/90 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => handleSetTrendMode("relative")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      trendMode === "relative"
                        ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm border border-slate-200/80 dark:border-slate-700"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>{t("Relative Flow", "Relatívny tok", "Relatív folyam")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetTrendMode("cumulative")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      trendMode === "cumulative"
                        ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/80 dark:border-slate-700"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    <span>{t("Cumulative Balance", "Stav na účte (Kumulatívny)", "Bankszámla egyenleg")}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Chart Legend Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                  <span>{t("Income (Bar)", "Príjmy (Stĺpec)", "Bevétel (Oszlop)")}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-800">
                  <span className="h-3 w-3 rounded-sm bg-rose-500" />
                  <span>{t("Expense (Bar)", "Výdavky (Stĺpec)", "Kiadás (Oszlop)")}</span>
                </div>
                {trendMode === "cumulative" ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-sm">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-300 dark:ring-emerald-900" />
                    <span>{t("🏦 Total Available Bank Funds (Plotline)", "🏦 Zostatok na účte / Disponibilné financie (Krivka)", "🏦 Bankszámla egyenleg (Vonal)")}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-lg border border-purple-200 dark:border-purple-800 shadow-sm">
                    <span className="h-3 w-3 rounded-full bg-purple-600 ring-2 ring-purple-300 dark:ring-purple-900" />
                    <span>{t("Weekly Net Difference / Flow (Plotline)", "Týždenný čistý zisk / Tok (Krivka)", "Heti nettó különbözet (Vonal)")}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800">
                  <Target className="h-3.5 w-3.5 text-amber-500" />
                  <span>{t("🎯 Reconciled Weekly Anchor", "🎯 Manuálne overený stav", "🎯 Manuálisan rögzített hét")}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-ping" />
                  <span>{t("Future 3-Mo Window", "3-Mesačné okno", "3 Hónapos ablak")}</span>
                </div>
              </div>

              {/* Quick interactive hint */}
              <span className="text-[10px] text-slate-400 italic">
                {t("💡 Click on any week column or node to calibrate its bank balance independently", "💡 Kliknutím na stĺpec alebo bod ľubovoľného týždňa nastavíte jeho zostatok na účte", "💡 Kattintson bármelyik hét oszlopára vagy pontjára a heti egyenleg beállításához")}
              </span>
            </div>

            {/* 3. Interactive SVG Hybrid Visualization */}
            {(() => {
              const N = weeklyTrendData.length;
              if (N === 0) return null;

              const svgWidth = 1000;
              const svgHeight = 360;
              const startX = 65;
              const graphWidth = 905;
              const topY = 45;
              const graphHeight = 245;
              const bottomY = topY + graphHeight;
              const stepX = graphWidth / N;
              const barWidth = Math.min(15, (stepX - 8) / 2);

              // Target value based on active mode
              const getPlotTarget = (b: typeof weeklyTrendData[0]) => trendMode === "cumulative" ? b.cumulativeBalance : b.netDifference;

              // Calculate range & scale
              const maxVal = Math.max(1000, ...weeklyTrendData.map((b) => Math.max(b.totalIncome, b.totalExpense, getPlotTarget(b))));
              const minVal = Math.min(0, ...weeklyTrendData.map((b) => Math.min(0, getPlotTarget(b))));
              const valSpan = (maxVal - minVal) * 1.15 || 1000;
              const scaledMax = maxVal + valSpan * 0.08;
              const scaledMin = minVal - valSpan * 0.07;
              const totalRange = scaledMax - scaledMin;

              const getY = (val: number) => topY + ((scaledMax - val) / totalRange) * graphHeight;
              const zeroY = getY(0);

              // Calculate points for the active plotline
              const points = weeklyTrendData.map((b, idx) => {
                const cx = startX + idx * stepX + stepX / 2;
                const cy = getY(getPlotTarget(b));
                return { x: cx, y: cy, bucket: b, index: idx, value: getPlotTarget(b) };
              });

              // Index of current week
              const currentWeekIdx = weeklyTrendData.findIndex((b) => b.isCurrent);
              const futureStartX = currentWeekIdx >= 0 ? startX + currentWeekIdx * stepX : startX + 4 * stepX;

              // Hovered bucket details
              const activeHoveredBucket = hoveredWeekIdx !== null ? weeklyTrendData[hoveredWeekIdx] : null;

              return (
                <div className="relative select-none">
                  <div className="w-full overflow-x-auto scrollbar-none">
                    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full min-w-[800px] h-auto font-sans">
                      <defs>
                        {/* Gradient for future projection window */}
                        <linearGradient id="futureZoneGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.05" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.12" />
                        </linearGradient>
                        {/* Gradient for Relative Net Difference Plotline */}
                        <linearGradient id="netLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="50%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                        {/* Gradient for Cumulative Bank Balance Plotline */}
                        <linearGradient id="cumulativeLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="50%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                        {/* Gradient for Cumulative Area Fill */}
                        <linearGradient id="cumulativeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                          <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.12" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
                        </linearGradient>
                        {/* Gradient for Income bars */}
                        <linearGradient id="incomeBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        {/* Gradient for Expense bars */}
                        <linearGradient id="expenseBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                        {/* Future hatched pattern for projected income */}
                        <pattern id="projectedIncomePat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fill="#10b981" />
                          <line x1="0" y1="0" x2="0" y2="6" stroke="#047857" strokeWidth="2.5" />
                        </pattern>
                        {/* Future hatched pattern for projected expense */}
                        <pattern id="projectedExpensePat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fill="#f43f5e" />
                          <line x1="0" y1="0" x2="0" y2="6" stroke="#be123c" strokeWidth="2.5" />
                        </pattern>
                        {/* Drop shadow for plotline */}
                        <filter id="plotShadow" x="-20%" y="-20%" width="140%" height="140%">
                          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#7c3aed" floodOpacity="0.3" />
                        </filter>
                      </defs>

                      {/* 1. Future 3-Month Projection Window Background Area */}
                      <rect
                        x={futureStartX}
                        y={topY}
                        width={svgWidth - startX - (futureStartX - startX) - 20}
                        height={graphHeight}
                        fill="url(#futureZoneGrad)"
                        rx="16"
                      />

                      {/* 2. Today / Present Vertical Divider Line */}
                      <line
                        x1={futureStartX}
                        y1={topY - 15}
                        x2={futureStartX}
                        y2={bottomY}
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      {/* Label for Future Window */}
                      <g transform={`translate(${futureStartX + 12}, ${topY - 8})`}>
                        <rect x="0" y="-14" width="200" height="22" rx="11" fill="#6366f1" fillOpacity="0.15" stroke="#6366f1" strokeWidth="1" />
                        <text x="100" y="1" textAnchor="middle" fill="#6366f1" fontSize="10" fontWeight="900" letterSpacing="0.05em">
                          {t("🔮 3-MONTH FUTURE FORECAST", "🔮 3-MESAČNÁ PROGNÓZA", "🔮 3 HÓNAPOS ELŐREJELZÉS")}
                        </text>
                      </g>

                      {/* 3. Horizontal Gridlines & Y-Axis Scale */}
                      {[1, 0.75, 0.5, 0.25, 0, -0.25].map((fraction) => {
                        const val = minVal + (maxVal - minVal) * fraction;
                        const y = getY(val);
                        if (y < topY - 10 || y > bottomY + 10) return null;
                        const isZero = Math.abs(val) < 50;

                        return (
                          <g key={fraction}>
                            <line
                              x1={startX}
                              y1={y}
                              x2={svgWidth - 30}
                              y2={y}
                              stroke={isZero ? "#64748b" : "#cbd5e1"}
                              strokeWidth={isZero ? "1.5" : "0.75"}
                              strokeDasharray={isZero ? "none" : "3 3"}
                              strokeOpacity={isZero ? 0.7 : 0.3}
                            />
                            <text
                              x={startX - 10}
                              y={y + 4}
                              textAnchor="end"
                              className="fill-slate-400 dark:fill-slate-500 font-bold"
                              fontSize="9"
                            >
                              {val >= 0 ? `+${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : `${(val / 1000).toFixed(val <= -10000 ? 0 : 1)}k`} €
                            </text>
                          </g>
                        );
                      })}

                      {/* 4. Weekly Bar Groups (Income & Expense Columns) */}
                      {weeklyTrendData.map((b, idx) => {
                        const cx = startX + idx * stepX + stepX / 2;
                        const isHovered = hoveredWeekIdx === idx;

                        // Income bar geometry
                        const incTop = getY(b.totalIncome);
                        const incHeight = Math.max(1, zeroY - incTop);

                        // Expense bar geometry
                        const expTop = getY(b.totalExpense);
                        const expHeight = Math.max(1, zeroY - expTop);

                        return (
                          <g
                            key={b.weekLabel + idx}
                            className="cursor-pointer transition-all"
                            onMouseEnter={() => setHoveredWeekIdx(idx)}
                            onMouseLeave={() => setHoveredWeekIdx(null)}
                            onClick={() => handleOpenCalibrator(b)}
                          >
                            {/* Transparent hover hit-box */}
                            <rect
                              x={startX + idx * stepX}
                              y={topY}
                              width={stepX}
                              height={graphHeight + 50}
                              fill={isHovered ? "rgba(99, 102, 241, 0.08)" : "transparent"}
                              rx="8"
                            />

                            {/* Income Bar (Left) */}
                            {b.totalIncome > 0 && (
                              <rect
                                x={cx - barWidth - 1.5}
                                y={incTop}
                                width={barWidth}
                                height={incHeight}
                                fill={b.isFuture ? "url(#projectedIncomePat)" : "url(#incomeBarGrad)"}
                                rx="4"
                                opacity={hoveredWeekIdx === null || isHovered ? 1 : 0.45}
                                className="transition-all duration-200"
                              />
                            )}

                            {/* Expense Bar (Right) */}
                            {b.totalExpense > 0 && (
                              <rect
                                x={cx + 1.5}
                                y={expTop}
                                width={barWidth}
                                height={expHeight}
                                fill={b.isFuture ? "url(#projectedExpensePat)" : "url(#expenseBarGrad)"}
                                rx="4"
                                opacity={hoveredWeekIdx === null || isHovered ? 1 : 0.45}
                                className="transition-all duration-200"
                              />
                            )}

                            {/* Reconciled Anchor Marker above week */}
                            {b.isManuallyCalibrated && (
                              <g transform={`translate(${cx}, ${topY + 6})`}>
                                <circle r="5" fill="#f59e0b" />
                                <circle r="8" fill="#f59e0b" fillOpacity="0.25" className="animate-ping" />
                                <text y="3" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">✓</text>
                              </g>
                            )}

                            {/* Current week highlight marker */}
                            {b.isCurrent && (
                              <g transform={`translate(${cx}, ${bottomY + 38})`}>
                                <circle r="3" fill="#6366f1" />
                                <text y="-8" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="900">
                                  {t("TODAY", "DNES", "MA")}
                                </text>
                              </g>
                            )}

                            {/* X-Axis Week Labels */}
                            <text
                              x={cx}
                              y={bottomY + 16}
                              textAnchor="middle"
                              className={`text-[9px] font-black uppercase ${
                                b.isCurrent
                                  ? "fill-indigo-600 dark:fill-indigo-400 font-extrabold"
                                  : b.isFuture
                                  ? "fill-purple-600 dark:fill-purple-400"
                                  : "fill-slate-600 dark:fill-slate-400"
                              }`}
                            >
                              {b.weekLabel}
                            </text>
                            <text
                              x={cx}
                              y={bottomY + 28}
                              textAnchor="middle"
                              className="fill-slate-400 dark:fill-slate-500 text-[8px] font-medium"
                            >
                              {b.dateRangeLabel.split(" - ")[0]}
                            </text>
                          </g>
                        );
                      })}

                      {/* 5. In Cumulative Mode: Soft Area Fill under Plotline */}
                      {trendMode === "cumulative" && (
                        <path
                          d={generateAreaPath(points, bottomY)}
                          fill="url(#cumulativeAreaGrad)"
                          className="transition-all duration-300"
                        />
                      )}

                      {/* 6. Smooth Plotline (Relative Net Diff OR Cumulative Bank Balance) */}
                      <path
                        d={generateSmoothPath(points)}
                        fill="none"
                        stroke={trendMode === "cumulative" ? "url(#cumulativeLineGrad)" : "url(#netLineGrad)"}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#plotShadow)"
                      />

                      {/* 7. Dots / Glowing Nodes on Plotline */}
                      {points.map((pt) => {
                        const isHovered = hoveredWeekIdx === pt.index;
                        const isPositive = pt.value >= 0;

                        return (
                          <g
                            key={"pt-" + pt.index}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredWeekIdx(pt.index)}
                            onMouseLeave={() => setHoveredWeekIdx(null)}
                            onClick={() => handleOpenCalibrator(pt.bucket)}
                          >
                            {/* Outer pulsing ring when hovered or manually calibrated */}
                            {(isHovered || pt.bucket.isManuallyCalibrated) && (
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.bucket.isManuallyCalibrated ? 10 : 12}
                                fill={pt.bucket.isManuallyCalibrated ? "#f59e0b" : isPositive ? "#10b981" : "#f43f5e"}
                                fillOpacity="0.25"
                                className="animate-ping"
                              />
                            )}

                            {/* Node Dot */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isHovered ? 7 : pt.bucket.isManuallyCalibrated ? 6 : 4}
                              fill={pt.bucket.isManuallyCalibrated ? "#f59e0b" : isPositive ? "#10b981" : "#f43f5e"}
                              stroke="#ffffff"
                              strokeWidth={pt.bucket.isManuallyCalibrated ? "2.5" : "2"}
                              className="transition-all duration-150"
                            />
                          </g>
                        );
                      })}

                      {/* Hover guideline */}
                      {hoveredWeekIdx !== null && points[hoveredWeekIdx] && (
                        <line
                          x1={points[hoveredWeekIdx].x}
                          y1={topY}
                          x2={points[hoveredWeekIdx].x}
                          y2={bottomY}
                          stroke="#8b5cf6"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                      )}
                    </svg>
                  </div>

                  {/* Dynamic Hover Tooltip Card with Week-Specific Calibrator Action */}
                  {activeHoveredBucket && (
                    <div className="mt-3 p-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            activeHoveredBucket.isCurrent
                              ? "bg-indigo-500 text-white"
                              : activeHoveredBucket.isFuture
                              ? "bg-purple-500/30 text-purple-300 border border-purple-400/40"
                              : "bg-slate-800 text-slate-300"
                          }`}>
                            {activeHoveredBucket.weekLabel} • {activeHoveredBucket.dateRangeLabel} ({activeHoveredBucket.year})
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            {activeHoveredBucket.isCurrent
                              ? t("Current Week (Reference)", "Aktuálny týždeň (Referenčný)", "Aktuális hét (Referencia)")
                              : activeHoveredBucket.isFuture
                              ? t("🔮 Future Projected Week", "🔮 Budúci projektovaný týždeň", "🔮 Jövőbeli tervezett hét")
                              : t("Historical Week", "História", "Múltbéli hét")}
                          </span>
                          {activeHoveredBucket.isManuallyCalibrated && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              {t("Reconciled Anchor", "Ručne overený stav", "Rögzített állapot")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300">
                          {activeHoveredBucket.items.length}{" "}
                          {t("financial movement(s) in this week", "finančných pohybov v tomto týždni", "pénzügyi tétel ezen a héten")}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        {/* Income */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("Total Income", "Príjmy spolu", "Összes bevétel")}</span>
                          <div className="text-sm font-black text-emerald-400">
                            +{money(activeHoveredBucket.totalIncome)}
                          </div>
                        </div>

                        {/* Expense */}
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("Total Expense", "Výdavky spolu", "Összes kiadás")}</span>
                          <div className="text-sm font-black text-rose-400">
                            -{money(activeHoveredBucket.totalExpense)}
                          </div>
                        </div>

                        {/* Weekly Net Difference */}
                        <div className="space-y-0.5 pl-3 border-l border-slate-700">
                          <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                            {activeHoveredBucket.isFuture ? t("Weekly Net Rev", "Týždenný zisk", "Heti nettó") : t("Weekly Net", "Týždenná zmena", "Heti egyenleg")}
                          </span>
                          <div className={`text-sm font-black ${activeHoveredBucket.netDifference >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {activeHoveredBucket.netDifference >= 0 ? "+" : ""}{money(activeHoveredBucket.netDifference)}
                          </div>
                        </div>

                        {/* Cumulative Bank Account Balance + Inline Calibrate Trigger */}
                        <div className="space-y-0.5 pl-3 border-l border-slate-700 bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-3">
                          <div>
                            <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                              <Landmark className="h-3 w-3" />
                              {t("Bank Balance on Account", "Stav na účte", "Bankszámla egyenleg")}
                            </span>
                            <div className={`text-base font-black ${activeHoveredBucket.cumulativeBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {money(activeHoveredBucket.cumulativeBalance)}
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleOpenCalibrator(activeHoveredBucket)}
                            className="p-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg transition-colors cursor-pointer"
                            title={t(`Calibrate Bank Balance for ${activeHoveredBucket.weekLabel}`, `Nastaviť zostatok pre ${activeHoveredBucket.weekLabel}`, `Egyenleg beállítása: ${activeHoveredBucket.weekLabel}`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expand / Collapse Weekly Data Breakdown Table */}
                  <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setIsWeeklyTableOpen(!isWeeklyTableOpen)}
                      className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer"
                    >
                      <CalendarDays className="h-4 w-4" />
                      {isWeeklyTableOpen
                        ? t("Hide 18-Week Projection Table", "Skryť 18-týždňovú tabuľku prognózy", "18 hetes előrejelzési táblázat elrejtése")
                        : t("Inspect Full 18-Week Weekly Breakdown (4 Past + 13 Future Weeks)", "Zobraziť podrobnú 18-týždňovú tabuľku (4 minulé + 13 budúcich týždňov)", "Részletes 18 hetes lebontás megtekintése (4 múltbéli + 13 jövőbeli hét)")}
                      {isWeeklyTableOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {t("Total Horizon: 18 Weeks (3 Months Forward)", "Časový horizont: 18 týždňov (3 mesiace dopredu)", "Teljes időtáv: 18 hét (3 hónap előre)")}
                    </span>
                  </div>

                  {/* 18-Week Data Table */}
                  {isWeeklyTableOpen && (
                    <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in duration-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-3 px-4">{t("Week / Period", "Týždeň / Obdobie", "Hét / Időszak")}</th>
                            <th className="py-3 px-4">{t("Type", "Typ", "Típus")}</th>
                            <th className="py-3 px-4 text-right">{t("Cumulative Income", "Príjmy", "Bevételek")}</th>
                            <th className="py-3 px-4 text-right">{t("Cumulative Expense", "Výdavky", "Kiadások")}</th>
                            <th className="py-3 px-4 text-right">{t("Weekly Net Flow", "Týždenný čistý tok", "Heti nettó folyam")}</th>
                            <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{t("🏦 Bank Account Balance", "🏦 Stav na účte", "🏦 Bankszámla egyenleg")}</th>
                            <th className="py-3 px-4 text-center">{t("Calibration", "Nastavenie", "Kalibráció")}</th>
                            <th className="py-3 px-4 text-center">{t("Movements", "Pohyby", "Tételek")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                          {weeklyTrendData.map((w) => (
                            <tr
                              key={w.weekLabel + w.startIso}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                                w.isCurrent
                                  ? "bg-indigo-50/50 dark:bg-indigo-950/20 font-bold"
                                  : w.isFuture
                                  ? "bg-purple-50/20 dark:bg-purple-950/10"
                                  : ""
                              }`}
                            >
                              <td className="py-2.5 px-4">
                                <div className="font-bold text-slate-800 dark:text-slate-200">{w.weekLabel}</div>
                                <div className="text-[10px] text-slate-400">{w.dateRangeLabel} ({w.year})</div>
                              </td>
                              <td className="py-2.5 px-4">
                                {w.isCurrent ? (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                    {t("Current Week", "Tento týždeň", "Aktuális hét")}
                                  </span>
                                ) : w.isFuture ? (
                                  <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                                    {t("🔮 Projected", "🔮 Prognóza", "🔮 Tervezett")}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px]">
                                    {t("Historical", "História", "Múltbéli")}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                {money(w.totalIncome)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-bold text-rose-600 dark:text-rose-400">
                                {money(w.totalExpense)}
                              </td>
                              <td className={`py-2.5 px-4 text-right font-black ${w.netDifference >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {w.netDifference >= 0 ? "+" : ""}{money(w.netDifference)}
                              </td>
                              <td className={`py-2.5 px-4 text-right font-black ${w.cumulativeBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <span>{money(w.cumulativeBalance)}</span>
                                  {w.isManuallyCalibrated && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 font-bold">
                                      🎯 {t("Set", "Nastavené", "Fix")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCalibrator(w)}
                                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-600 hover:text-emerald-600 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>{w.isManuallyCalibrated ? t("Edit", "Upraviť", "Módosít") : t("Calibrate", "Nastaviť", "Beállít")}</span>
                                </button>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 font-bold">
                                  {w.items.length}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 4. WEEK-SPECIFIC BANK BALANCE CALIBRATION DIALOG */}
          {calibratingWeek && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                      <Landmark className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t(`Calibrate Bank Balance for ${calibratingWeek.weekLabel}`, `Nastaviť zostatok na účte pre ${calibratingWeek.weekLabel}`, `Heti egyenleg beállítása: ${calibratingWeek.weekLabel}`)}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {calibratingWeek.dateRangeLabel} ({calibratingWeek.year})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalibratingWeek(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    {t("Real Verified Bank Balance at this Week (€)", "Skutočný stav na účte v tomto týždni (€)", "Valós bankszámla egyenleg ezen a héten (€)")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={calibratingVal}
                      onChange={(e) => setCalibratingVal(e.target.value)}
                      placeholder="48500"
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-base font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">€</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t(
                      "Setting this anchor will recalculate the entire timeline: subsequent weeks will add cash flow starting from this sum, and preceding weeks will back-calculate.",
                      "Nastavenie tejto kotvy prepočíta celú časovú os: nasledujúce týždne budú pripočítavať zmeny k tejto sume.",
                      "A rögzítés újraszámolja a teljes idővonalat: a következő hetek ebből az összegből építkeznek."
                    )}
                  </p>
                </div>

                {/* Quick adjustments */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {t("Quick Adjustments", "Rýchle úpravy", "Gyors módosítás")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "+1 000 €", add: 1000 },
                      { label: "+5 000 €", add: 5000 },
                      { label: "+10 000 €", add: 10000 },
                      { label: "-1 000 €", add: -1000 },
                      { label: "-5 000 €", add: -5000 },
                      { label: "48 500 €", set: 48500 }
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const curr = parseFloat(calibratingVal) || 0;
                          if (btn.set !== undefined) {
                            setCalibratingVal(String(btn.set));
                          } else {
                            setCalibratingVal(String(curr + (btn.add || 0)));
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    {calibratingWeek.isManual && (
                      <button
                        type="button"
                        onClick={() => handleResetWeeklyCalibration(calibratingWeek.startIso)}
                        className="px-3 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("Reset to Auto", "Vrátiť na auto", "Visszaállítás")}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalibratingWeek(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      {t("Cancel", "Zrušiť", "Mégse")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveWeeklyCalibration(calibratingWeek.startIso, parseFloat(calibratingVal))}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <Check className="h-4 w-4" />
                      {t("Save & Recalculate Timeline", "Uložiť a prepočítať os", "Mentés és újraszámolás")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4.5 TAB CONTENT: OVERVIEW TABLE MATRIX (EXPENSES -> INCOMES -> SUMMARY) */}
      {activeTab === "table" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* THE MATRIX DATA TABLE CONTAINER */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Sleek Single-Line Table Toolbar */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
              {/* Category Search Filter */}
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={tableSearchQuery}
                  onChange={(e) => setTableSearchQuery(e.target.value)}
                  placeholder={t("Filter categories...", "Filtrovať kategórie...", "Kategóriák szűrése...")}
                  className="w-full pl-8 pr-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                />
                {tableSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTableSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Granularity & Year & Value Mode Switchers */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Granularity Switcher */}
                <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 dark:border-slate-700">
                  {[
                    { id: "week", label: t("Week", "Týždeň", "Hét") },
                    { id: "month", label: t("Month", "Mesiac", "Hónap") },
                    { id: "quarter", label: t("Quarter", "Kvartál", "Negyedév") },
                    { id: "year", label: t("Year", "Rok", "Év") }
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setTableGranularity(g.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        tableGranularity === g.id
                          ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs border border-slate-200 dark:border-slate-700"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Year Navigator (for month, quarter, week) */}
                {(tableGranularity === "month" || tableGranularity === "quarter" || tableGranularity === "week") && (
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setTableYear(tableYear - 1)}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      title={t("Previous Year", "Predchádzajúci rok", "Előző év")}
                    >
                      <ChevronDown className="h-3 w-3 rotate-90" />
                    </button>
                    <span className="px-2 text-xs font-black text-slate-800 dark:text-slate-200 select-none">
                      {tableYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTableYear(tableYear + 1)}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      title={t("Next Year", "Nasledujúci rok", "Következő év")}
                    >
                      <ChevronDown className="h-3 w-3 -rotate-90" />
                    </button>
                  </div>
                )}

                {/* Real vs Estimated Value Mode Toggle */}
                <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setTableValueMode("both")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "both"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs border border-slate-200/80 dark:border-slate-700"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("Real + Est", "Skutočnosť + Plán", "Tény + Terv")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("real")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "real"
                        ? "bg-emerald-500 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("Real", "Skutočnosť", "Tény")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("estimated")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "estimated"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("Est", "Plán", "Terv")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableValueMode("total")}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tableValueMode === "total"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("Combined", "Spolu", "Összesen")}
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                {/* Sticky Header */}
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-30 shadow-xs border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-slate-100 dark:bg-slate-800 z-40 font-black uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 border-r-2 border-slate-200 dark:border-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      {t("Category Structure (3 Levels)", "Štruktúra kategórií (3 úrovne)", "Kategória struktúra (3 szint)")}
                    </th>
                    {overviewTableData.columns.map((col) => (
                      <th
                        key={col.id}
                        className={`py-3 px-3 text-right font-black uppercase text-[10px] tracking-wider min-w-[110px] ${
                          col.isCurrent
                            ? "bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-x border-indigo-200 dark:border-indigo-800"
                            : "text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex flex-col items-end">
                          <span>{col.label}</span>
                          {col.subLabel && <span className="text-[8px] font-medium opacity-60 lowercase">{col.subLabel}</span>}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right font-black uppercase text-[10px] tracking-wider min-w-[130px] bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700 sticky right-0 z-30">
                      {t("Total / Horizon", "Spolu / Horizont", "Összesen")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {/* ======================================================== */}
                  {/* SECTION 1: EXPENSES (TOP OF TABLE) */}
                  {/* ======================================================== */}
                  <tr className="bg-rose-50 dark:bg-rose-950/40 border-y-2 border-rose-200 dark:border-rose-900/50">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-rose-50 dark:bg-slate-900 border-r-2 border-rose-200 dark:border-rose-900/50 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 shrink-0" />
                          <span>{t("💸 EXPENSES", "💸 VÝDAVKY", "💸 KIADÁSOK")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={areAllExpensesExpanded ? collapseAllExpenseCategories : expandAllExpenseCategories}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-900/70 text-rose-700 dark:text-rose-300 text-[10px] font-bold tracking-normal normal-case transition-colors cursor-pointer"
                          title={areAllExpensesExpanded ? t("Collapse all expense categories", "Zbaliť výdavky", "Kiadások becsukása") : t("Expand all expense categories", "Rozbaliť výdavky", "Kiadások kinyitása")}
                        >
                          {areAllExpensesExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                          <span>{areAllExpensesExpanded ? t("Collapse", "Zbaliť", "Becsuk") : t("Expand", "Rozbaliť", "Kinyit")}</span>
                        </button>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-rose-50/60 dark:bg-rose-950/20" />
                  </tr>

                  {/* Render Expense Categories Recursively */}
                  {categoryTree.expenseTree.map((rootCat) => renderCategoryMatrixRow(rootCat, 1, "expense"))}

                  {/* SUB-TOTAL EXPENSES ROW */}
                  <tr className="bg-rose-100/60 dark:bg-rose-950/50 font-black border-y-2 border-rose-300 dark:border-rose-800">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-rose-100 dark:bg-slate-900 z-20 text-rose-800 dark:text-rose-300 border-r-2 border-rose-300 dark:border-rose-800 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <ArrowDownRight className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>{t("Total Expenses", "Výdavky spolu", "Összes kiadás")}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const val = overviewTableData.totalExpensesByCol[col.id];
                      return (
                        <td key={"sub-exp-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(val, "expense")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-extrabold bg-rose-100 dark:bg-rose-950/80 border-l border-slate-200 dark:border-slate-700 sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.totalExpenseSummary, "expense")}
                    </td>
                  </tr>

                  {/* ======================================================== */}
                  {/* SECTION 2: INCOMES (RIGHT BELOW EXPENSES) */}
                  {/* ======================================================== */}
                  <tr className="bg-emerald-50 dark:bg-emerald-950/40 border-y-2 border-emerald-200 dark:border-emerald-900/50">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-emerald-50 dark:bg-slate-900 border-r-2 border-emerald-200 dark:border-emerald-900/50 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 shrink-0" />
                          <span>{t("💰 INCOMES", "💰 PRÍJMY", "💰 BEVÉTELEK")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={areAllIncomesExpanded ? collapseAllIncomeCategories : expandAllIncomeCategories}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold tracking-normal normal-case transition-colors cursor-pointer"
                          title={areAllIncomesExpanded ? t("Collapse all income categories", "Zbaliť príjmy", "Bevételek becsukása") : t("Expand all income categories", "Rozbaliť príjmy", "Bevételek kinyitása")}
                        >
                          {areAllIncomesExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                          <span>{areAllIncomesExpanded ? t("Collapse", "Zbaliť", "Becsuk") : t("Expand", "Rozbaliť", "Kinyit")}</span>
                        </button>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-emerald-50/60 dark:bg-emerald-950/20" />
                  </tr>

                  {/* Render Income Categories Recursively */}
                  {categoryTree.incomeTree.map((rootCat) => renderCategoryMatrixRow(rootCat, 1, "income"))}

                  {/* SUB-TOTAL INCOMES ROW */}
                  <tr className="bg-emerald-100/60 dark:bg-emerald-950/50 font-black border-y-2 border-emerald-300 dark:border-emerald-800">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-emerald-100 dark:bg-slate-900 z-20 text-emerald-800 dark:text-emerald-300 border-r-2 border-emerald-300 dark:border-emerald-800 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <ArrowUpRight className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>{t("Total Incomes", "Príjmy spolu", "Összes bevétel")}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const val = overviewTableData.totalIncomesByCol[col.id];
                      return (
                        <td key={"sub-inc-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(val, "income")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-extrabold bg-emerald-100 dark:bg-emerald-950/80 border-l border-slate-200 dark:border-slate-700 sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.totalIncomeSummary, "income")}
                    </td>
                  </tr>

                  {/* ======================================================== */}
                  {/* SECTION 3: SUMMARY (NET FLOW & BALANCE) AT TABLE END */}
                  {/* ======================================================== */}
                  <tr className="bg-slate-100 dark:bg-slate-800 border-y-2 border-slate-300 dark:border-slate-700">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-2.5 px-4 sticky left-0 z-20 bg-slate-100 dark:bg-slate-900 border-r-2 border-slate-300 dark:border-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        <Landmark className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>{t("📊 FINANCIAL SUMMARY", "📊 FINANČNÉ ZHRNUTIE", "📊 PÉNZÜGYI ÖSSZESÍTŐ")}</span>
                      </div>
                    </td>
                    <td colSpan={overviewTableData.columns.length + 1} className="py-2.5 px-4 bg-slate-100/80 dark:bg-slate-800/60" />
                  </tr>

                  {/* Row: Net Profit / Cash Flow (Income - Expense) */}
                  <tr className="bg-purple-50/50 dark:bg-purple-950/30 font-black border-b border-slate-200 dark:border-slate-700">
                    <td className="w-[320px] min-w-[320px] max-w-[320px] py-3 px-4 sticky left-0 bg-purple-50 dark:bg-slate-900 z-20 text-purple-900 dark:text-purple-300 border-r-2 border-purple-300 dark:border-purple-800 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Coins className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>{t("Net Cash Flow (Diff = Income − Expense)", "Čistý rozdiel (Príjmy − Výdavky)", "Nettó eredmény (Bevétel − Kiadás)")}</span>
                      </div>
                    </td>
                    {overviewTableData.columns.map((col) => {
                      const net = overviewTableData.netCashFlowByCol[col.id];
                      return (
                        <td key={"net-" + col.id} className="py-3 px-3 text-right">
                          {renderTableCellValue(net, "net")}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-black bg-purple-100 dark:bg-purple-950/80 border-l border-slate-200 dark:border-slate-700 sticky right-0 z-20">
                      {renderTableCellValue(overviewTableData.netSummary, "net")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4.6 TAB CONTENT: CHRONOLOGICAL MOVEMENTS LEDGER (TAB 3) */}
      {activeTab === "movements" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* MOVEMENTS CONTROL & FILTER CARD */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
            {/* Top Row: Title, KPI summary chips, Add buttons, Sort toggle */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t("All Financial Movements", "Všetky finančné pohyby", "Összes pénzügyi mozgás")}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {filteredMovements.length}
                  </span>
                </div>

                {/* Live Total KPI Pills */}
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {t("Incomes:", "Príjmy:", "Bevételek:")} +{money(movementsSummary.income)}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    {t("Expenses:", "Výdavky:", "Kiadások:")} -{money(movementsSummary.expense)}
                  </span>
                  <span className={`px-2.5 py-1 rounded-xl border ${
                    movementsSummary.net >= 0
                      ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                      : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  }`}>
                    {t("Net:", "Čistý rozdiel:", "Nettó:")} {movementsSummary.net >= 0 ? "+" : ""}{money(movementsSummary.net)}
                  </span>
                </div>
              </div>

              {/* Actions: Sort order toggle & Quick Add Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMovementsSortOrder(movementsSortOrder === "desc" ? "asc" : "desc")}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  title={movementsSortOrder === "desc" ? t("Sorted by newest first", "Zotriedené od najnovších", "Legújabb elöl") : t("Sorted by oldest first", "Zotriedené od najstarších", "Legrégebbi elöl")}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  <span>{movementsSortOrder === "desc" ? t("Newest First", "Najnovšie", "Legújabb") : t("Oldest First", "Najstaršie", "Legrégebbi")}</span>
                </button>

                <button
                  onClick={() => handleOpenCreateModal("income", "global")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("+ Income", "+ Príjem", "+ Bevétel")}</span>
                </button>

                <button
                  onClick={() => handleOpenCreateModal("expense", "global")}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("+ Expense", "+ Výdavok", "+ Kiadás")}</span>
                </button>
              </div>
            </div>

            {/* Main Filter Bar Row: Search, Type Toggle, Date Preset, Value Range */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
              {/* 1. Search Query Input */}
              <div className="md:col-span-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={movementsSearch}
                  onChange={(e) => setMovementsSearch(e.target.value)}
                  placeholder={t("Filter by title, client, project, category, #FA...", "Hľadať podľa názvu, klienta, projektu, kategórie...", "Keresés név, ügyfél, projekt vagy kategória alapján...")}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                {movementsSearch && (
                  <button
                    type="button"
                    onClick={() => setMovementsSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* 2. Type Selector (All / Income / Expense) */}
              <div className="md:col-span-3 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl flex items-center gap-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMovementsType("all")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "all"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {t("All", "Všetko", "Összes")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementsType("income")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "income"
                      ? "bg-emerald-500 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {t("💰 Incomes", "💰 Príjmy", "💰 Bevételek")}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementsType("expense")}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                    movementsType === "expense"
                      ? "bg-rose-500 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {t("💸 Expenses", "💸 Výdavky", "💸 Kiadások")}
                </button>
              </div>

              {/* 3. Date Range Preset */}
              <div className="md:col-span-3">
                <select
                  value={movementsDatePreset}
                  onChange={(e) => setMovementsDatePreset(e.target.value as any)}
                  className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">{t("📅 All Time", "📅 Celé obdobie", "📅 Teljes időszak")}</option>
                  <option value="this_month">{t("📅 This Month", "📅 Tento mesiac", "📅 Ez a hónap")}</option>
                  <option value="last_month">{t("📅 Last Month", "📅 Minulý mesiac", "📅 Előző hónap")}</option>
                  <option value="this_quarter">{t("📅 This Quarter", "📅 Tento kvartál", "📅 Ez a negyedév")}</option>
                  <option value="this_year">{t("📅 This Year", "📅 Tento rok", "📅 Ez az év")}</option>
                  <option value="custom">{t("⚙️ Custom Date Range...", "⚙️ Vlastný rozsah dátumov...", "⚙️ Egyéni időszak...")}</option>
                </select>
              </div>

              {/* 4. Advanced Filters Toggle */}
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMovementsAdvancedOpen(!isMovementsAdvancedOpen)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isMovementsAdvancedOpen || hasActiveMovementsFilters
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{t("Filters", "Filtre", "Szűrők")}</span>
                  {hasActiveMovementsFilters && (
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                  )}
                </button>

                {hasActiveMovementsFilters && (
                  <button
                    type="button"
                    onClick={clearAllMovementsFilters}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title={t("Clear all filters", "Zrušiť všetky filtre", "Szűrők törlése")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Advanced Filters Drawer: Value Range, Category, Client/Project Scope, Custom Dates */}
            {isMovementsAdvancedOpen && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in fade-in duration-150">
                {/* Category Dropdown (All 3 levels) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t("Category (3 Levels)", "Kategória (3 úrovne)", "Kategória (3 szint)")}
                  </label>
                  <SearchableCategorySelect
                    value={movementsCategoryId}
                    onChange={(catId) => setMovementsCategoryId(catId)}
                    categories={financialCategories}
                    filterType={movementsType}
                    allowAll={true}
                    t={t}
                  />
                </div>

                {/* Scope / Project / Client */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t("Linked Project / Client", "Prepojený projekt / Klient", "Kapcsolt projekt / Ügyfél")}
                  </label>
                  <SearchableScopeSelect
                    value={
                      movementsScope === "global"
                        ? "global"
                        : movementsScope === "project"
                        ? (movementsProjectId === "all" ? "project:all" : `project:${movementsProjectId}`)
                        : movementsScope === "client"
                        ? (movementsClientId === "all" ? "client:all" : `client:${movementsClientId}`)
                        : "all"
                    }
                    onChange={(val) => {
                      if (val === "all" || !val) {
                        setMovementsScope("all");
                        setMovementsProjectId("all");
                        setMovementsClientId("all");
                      } else if (val === "global") {
                        setMovementsScope("global");
                        setMovementsProjectId("all");
                        setMovementsClientId("all");
                      } else if (val.startsWith("project:")) {
                        setMovementsScope("project");
                        setMovementsProjectId(val.replace("project:", ""));
                        setMovementsClientId("all");
                      } else if (val.startsWith("client:")) {
                        setMovementsScope("client");
                        setMovementsClientId(val.replace("client:", ""));
                        setMovementsProjectId("all");
                      }
                    }}
                    projects={projects}
                    leads={leads}
                    allowAll={true}
                    allowGlobal={true}
                    t={t}
                  />
                </div>

                {/* Value Range (Min & Max) */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t("Value Range (€)", "Rozsah sumy (€)", "Értékhatár (€)")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={movementsMinAmount}
                      onChange={(e) => setMovementsMinAmount(e.target.value)}
                      placeholder="Min €"
                      className="w-1/2 py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-bold">–</span>
                    <input
                      type="number"
                      value={movementsMaxAmount}
                      onChange={(e) => setMovementsMaxAmount(e.target.value)}
                      placeholder="Max €"
                      className="w-1/2 py-1.5 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Custom Date Range Picker */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    {t("Custom Dates (From - To)", "Vlastný dátum (Od - Do)", "Egyéni dátum (Tól - Ig)")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={movementsStartDate}
                      onChange={(e) => {
                        setMovementsStartDate(e.target.value);
                        setMovementsDatePreset("custom");
                      }}
                      className="w-1/2 py-1.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-slate-400 font-bold">–</span>
                    <input
                      type="date"
                      value={movementsEndDate}
                      onChange={(e) => {
                        setMovementsEndDate(e.target.value);
                        setMovementsDatePreset("custom");
                      }}
                      className="w-1/2 py-1.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* GROUPED MOVEMENTS LEDGER TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
                  <tr>
                    <th className="py-3 px-4 w-[130px]">{t("Date", "Dátum", "Dátum")}</th>
                    <th className="py-3 px-4 min-w-[220px]">{t("Title & Reference", "Názov & Referencia", "Megnevezés & Hivatkozás")}</th>
                    <th className="py-3 px-4 min-w-[220px]">{t("Category Hierarchy", "Hierarchia kategórie", "Kategória hierarchia")}</th>
                    <th className="py-3 px-4 min-w-[170px]">{t("Link / Scope", "Prepojenie / Rozsah", "Kapcsolat / Hatókör")}</th>
                    <th className="py-3 px-4 w-[150px] text-right">{t("Value", "Suma / Hodnota", "Összeg / Érték")}</th>
                    <th className="py-3 px-4 w-[90px] text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400 font-medium space-y-2">
                        <Coins className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {t("No financial movements found", "Neboli nájdené žiadne finančné pohyby", "Nincs találat a megadott szűrők alapján")}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t("Try clearing or adjusting your search filters.", "Skúste upraviť alebo resetovať filtre.", "Próbálja meg módosítani vagy törölni a szűrőket.")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let globalRenderCount = 0;

                      return groupedMovementsByMonth.map((group) => {
                        // Check if we reached visible limit for infinite scroll
                        if (globalRenderCount >= movementsVisibleCount) return null;

                        const availableSlot = movementsVisibleCount - globalRenderCount;
                        const visibleRecordsInGroup = group.records.slice(0, availableSlot);
                        globalRenderCount += visibleRecordsInGroup.length;

                        return (
                          <React.Fragment key={"month-grp-" + group.monthKey}>
                            {/* MONTH DIVIDER ROW WITH SUMMARY TOTALS */}
                            <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-y-2 border-slate-300 dark:border-slate-700 sticky top-[37px] z-10 shadow-xs">
                              <td colSpan={6} className="py-2.5 px-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <CalendarDays className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    <span className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                                      {group.monthLabel}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                      {group.records.length} {t("movements", "pohybov", "tétel")}
                                    </span>
                                  </div>

                                  {/* Monthly Subtotals */}
                                  <div className="flex items-center gap-3 text-xs font-black">
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      +{money(group.totalIncome)}
                                    </span>
                                    <span className="text-rose-700 dark:text-rose-400">
                                      -{money(group.totalExpense)}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-lg border ${
                                      group.net >= 0
                                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                                        : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800"
                                    }`}>
                                      {t("Net:", "Čistý:", "Nettó:")} {group.net >= 0 ? "+" : ""}{money(group.net)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>

                            {/* MOVEMENT ROWS IN THIS MONTH */}
                            {visibleRecordsInGroup.map((rec) => {
                              const project = projects.find((p) => p.id === rec.projectId);
                              const client = leads.find((l) => l.id === rec.clientId || l.id === project?.clientId || l.id === project?.leadId);
                              const catBreadcrumbs = getCategoryBreadcrumbs(rec.categoryId);
                              const rootCat = catBreadcrumbs[0];
                              const isExpense = rec.type === "expense";
                              const amount = rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned;

                              return (
                                <tr
                                  key={rec.id}
                                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                                >
                                  {/* 1. Date & Status */}
                                  <td className="py-3 px-4 whitespace-nowrap">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">
                                      {formatDateLocalized(rec.paidDate || rec.issueDate, userLanguage)}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        rec.status === "paid"
                                          ? "bg-emerald-500"
                                          : rec.status === "pending" || rec.status === "partially_paid"
                                          ? "bg-amber-500"
                                          : rec.status === "overdue"
                                          ? "bg-rose-500"
                                          : "bg-slate-400"
                                      }`} />
                                      <span className="text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
                                        {rec.status}
                                      </span>
                                    </div>
                                  </td>

                                  {/* 2. Title & Reference & Recurring Badge */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                      <span className="truncate max-w-[280px]" title={rec.title}>
                                        {rec.title}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {rec.invoiceNumber && (
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                          {rec.invoiceNumber}
                                        </span>
                                      )}
                                      {rec.description && (
                                        <span className="text-[11px] text-slate-400 truncate max-w-[220px]" title={rec.description}>
                                          {rec.description}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 3. 3-Level Category Breadcrumbs */}
                                  <td className="py-3 px-4">
                                    {catBreadcrumbs.length > 0 ? (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span
                                          className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
                                          style={{ backgroundColor: rootCat?.color || (isExpense ? "#f43f5e" : "#10b981") }}
                                        />
                                        {catBreadcrumbs.map((c, idx) => (
                                          <React.Fragment key={c.id}>
                                            {idx > 0 && <span className="text-[10px] text-slate-400">›</span>}
                                            <span
                                              className={`text-[11px] ${
                                                idx === catBreadcrumbs.length - 1
                                                  ? "font-bold text-slate-800 dark:text-slate-200"
                                                  : "font-normal text-slate-500 dark:text-slate-400"
                                              }`}
                                            >
                                              {c.name}
                                            </span>
                                          </React.Fragment>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic text-[11px]">
                                        {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                                      </span>
                                    )}
                                  </td>

                                  {/* 4. Link / Scope (Project or Client or Global) */}
                                  <td className="py-3 px-4">
                                    {rec.projectId ? (
                                      (() => {
                                        const projectLead = project ? leads.find((l) => l.id === project.leadId || l.id === project.clientId) : null;
                                        const pName = projectLead ? `${projectLead.name}` : `Projekt ${rec.projectId.slice(0, 8)}`;
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => onOpenProject?.(rec.projectId!)}
                                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                          >
                                            <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate max-w-[140px]" title={pName}>
                                              {pName}
                                            </span>
                                          </button>
                                        );
                                      })()
                                    ) : rec.clientId ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenClient?.(rec.clientId!)}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                      >
                                        <User className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate max-w-[140px]" title={client?.name || rec.clientId}>
                                          {client?.name || rec.clientId.slice(0, 8)}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                        <Globe className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span>{t("Global Company", "Globálne firemné", "Globális vállalati")}</span>
                                      </span>
                                    )}
                                  </td>

                                  {/* 5. Value with Color Coding & Recurring Icon */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <span
                                        className={`font-black text-sm ${
                                          isExpense
                                            ? "text-rose-600 dark:text-rose-400"
                                            : "text-emerald-600 dark:text-emerald-400"
                                        }`}
                                      >
                                        {isExpense ? "-" : "+"}
                                        {money(amount)}
                                      </span>

                                      {/* Recurring Expense/Income icon next to value */}
                                      {rec.isRecurring && (
                                        <span
                                          className="p-1 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                                          title={t(
                                            `Recurring movement (${rec.recurringFrequency || "monthly"})`,
                                            `Pravidelný pohyb (${rec.recurringFrequency || "mesačne"})`,
                                            `Rendszeres tétel (${rec.recurringFrequency || "havi"})`
                                          )}
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                        </span>
                                      )}
                                    </div>

                                    {/* Estimated amount subtitle if different from real */}
                                    {rec.amountPlanned !== rec.amountReal && rec.amountReal > 0 && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        est: {money(rec.amountPlanned)}
                                      </div>
                                    )}
                                  </td>

                                  {/* 6. Action buttons */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(rec)}
                                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                        title={t("Edit movement", "Upraviť pohyb", "Szerkesztés")}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTransaction(rec.id)}
                                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                        title={t("Delete movement", "Vymazať pohyb", "Törlés")}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      });
                    })()
                  )}
                </tbody>
              </table>
            </div>

            {/* Infinite Scroll Loading Sentinel */}
            {filteredMovements.length > 0 && (
              <div
                ref={movementsSentinelRef}
                className="py-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center text-xs text-slate-400 font-medium"
              >
                {movementsVisibleCount < filteredMovements.length ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                    <span>
                      {t(
                        `Loading more movements... (showing ${Math.min(movementsVisibleCount, filteredMovements.length)} of ${filteredMovements.length})`,
                        `Načítavam ďalšie pohyby... (zobrazených ${Math.min(movementsVisibleCount, filteredMovements.length)} z ${filteredMovements.length})`,
                        `További mozgások betöltése... (${Math.min(movementsVisibleCount, filteredMovements.length)} / ${filteredMovements.length})`
                      )}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400">
                    {t(
                      `✓ All ${filteredMovements.length} movements loaded`,
                      `✓ Všetkých ${filteredMovements.length} pohybov načítaných`,
                      `✓ Mind a(z) ${filteredMovements.length} mozgás betöltve`
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: RECURRING EXPENSES MANAGER */}
      {activeTab === "recurring" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* TOP METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Monthly Recurring Commitment */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("Monthly Recurring Costs", "Mesačné pravidelné výdavky", "Havi rendszeres kiadás")}
                </div>
                <div className="text-lg font-black text-rose-600 dark:text-rose-400">
                  -{money(recurringMetrics.totalMonthlyExpense)}
                  <span className="text-xs font-semibold text-slate-400 ml-1">/ {t("mo", "mes", "hó")}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Annual Overhead Projection */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("Annual Overhead Projection", "Ročný projektovaný náklad", "Éves tervezett költség")}
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white">
                  -{money(recurringMetrics.totalAnnualExpense)}
                  <span className="text-xs font-semibold text-slate-400 ml-1">/ {t("yr", "rok", "év")}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Active vs Paused Rules */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("Active Commitments", "Aktívne pravidlá", "Aktív szabályok")}
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{recurringMetrics.activeCount}</span>
                  {recurringMetrics.pausedCount > 0 && (
                    <span className="text-xs font-semibold text-slate-400">
                      ({recurringMetrics.pausedCount} {t("paused", "pozastavených", "szünetel")})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 4: Next Upcoming Charge */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <Clock className="h-5 w-5" />
              </div>
              <div className="truncate">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("Next Upcoming Charge", "Najbližšia platba", "Következő esedékes")}
                </div>
                {(() => {
                  const upcoming = recurringMetrics.nextUpcoming;
                  if (!upcoming) {
                    return <div className="text-xs text-slate-400">{t("None scheduled", "Žiadna", "Nincs")}</div>;
                  }
                  return (
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      <span className="text-rose-600 dark:text-rose-400 font-black">
                        {money(upcoming.record.amountReal || upcoming.record.amountPlanned)}
                      </span>{" "}
                      – {upcoming.record.title}{" "}
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                        ({upcoming.daysLeft === 0 ? t("Today", "Dnes", "Ma") : t(`in ${upcoming.daysLeft}d`, `o ${upcoming.daysLeft} dní`, `${upcoming.daysLeft} nap múlva`)})
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* CONTROL & FILTER CARD */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t("Recurring Expenses & Subscriptions", "Pravidelné výdavky a predplatné", "Rendszeres kiadások és előfizetések")}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t("Configure weekly, monthly, and yearly overheads that automatically calculate in cash flow projections.", "Nastavenie pravidelných výdavkov a fixných nákladov premietaných do cash flow prognózy.", "Rendszeres költségek beállítása és kezelése a pénzáramlás előrejelzéséhez.")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {financialRecords.filter((r) => r.isRecurring).length === 0 && (
                  <button
                    type="button"
                    onClick={handleQuickSeedRecurringExpenses}
                    className="px-3.5 py-1.5 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border border-purple-200 dark:border-purple-800 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t("Load Sample Templates", "Nahrať vzorové šablóny", "Minták betöltése")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenCreateRecurringModal("expense", "global")}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t("+ New Recurring Expense", "+ Nový pravidelný výdavok", "+ Új rendszeres kiadás")}</span>
                </button>
              </div>
            </div>

            {/* Filter Bar Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center text-xs">
              {/* Search input */}
              <div className="lg:col-span-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={recurringSearch}
                  onChange={(e) => setRecurringSearch(e.target.value)}
                  placeholder={t("Search by expense title, vendor, category...", "Hľadať podľa názvu, kategórie...", "Keresés név, kategória alapján...")}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {recurringSearch && (
                  <button
                    type="button"
                    onClick={() => setRecurringSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Frequency Selector */}
              <div className="lg:col-span-3">
                <select
                  value={recurringFreqFilter}
                  onChange={(e) => setRecurringFreqFilter(e.target.value)}
                  className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">{t("All Frequencies", "Všetky frekvencie", "Minden gyakoriság")}</option>
                  <option value="weekly">{t("Weekly (Týždenne)", "Týždenne", "Heti")}</option>
                  <option value="monthly">{t("Monthly (Mesačne)", "Mesačne", "Havi")}</option>
                  <option value="yearly">{t("Yearly (Ročne)", "Ročne", "Éves")}</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="lg:col-span-3">
                <select
                  value={recurringStatusFilter}
                  onChange={(e) => setRecurringStatusFilter(e.target.value as any)}
                  className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">{t("All Statuses (Active & Paused)", "Všetky stavy (Aktívne aj pozastavené)", "Minden állapot")}</option>
                  <option value="active">{t("✓ Active Rules Only", "✓ Iba aktívne pravidlá", "✓ Csak aktív szabályok")}</option>
                  <option value="paused">{t("⏸ Paused Rules Only", "⏸ Iba pozastavené", "⏸ Csak szüneteltetett")}</option>
                </select>
              </div>

              {/* Entity Scope Filter */}
              <div className="lg:col-span-2">
                <select
                  value={recurringScopeFilter}
                  onChange={(e) => setRecurringScopeFilter(e.target.value)}
                  className="w-full py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">{t("All Scopes", "Všetky rozsahy", "Minden hatókör")}</option>
                  <option value="global">{t("🌐 Global Only", "🌐 Iba firemné", "🌐 Vállalati")}</option>
                  <option value="project">{t("💼 Projects Only", "💼 Iba projekty", "💼 Projektek")}</option>
                  <option value="client">{t("👤 Clients Only", "👤 Iba klienti", "👤 Ügyfelek")}</option>
                </select>
              </div>
            </div>
          </div>

          {/* RECURRING EXPENSES TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-3.5 px-4 min-w-[220px]">{t("Recurring Expense & Description", "Pravidelný výdavok & Popis", "Rendszeres kiadás & Leírás")}</th>
                    <th className="py-3.5 px-4 min-w-[220px]">{t("Cadence & Next Due", "Frekvencia & Ďalšia platba", "Gyakoriság & Esedékesség")}</th>
                    <th className="py-3.5 px-4 min-w-[200px]">{t("Category Path", "Hierarchia kategórie", "Kategória útvonal")}</th>
                    <th className="py-3.5 px-4 min-w-[150px]">{t("Linked Entity", "Prepojenie", "Kapcsolódó elem")}</th>
                    <th className="py-3.5 px-4 w-[160px] text-right">{t("Cost / Month", "Suma / Mesiac", "Összeg / Hó")}</th>
                    <th className="py-3.5 px-4 w-[110px] text-center">{t("Status", "Stav", "Állapot")}</th>
                    <th className="py-3.5 px-4 w-[110px] text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {filteredRecurringRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400 font-medium space-y-3">
                        <RefreshCw className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto animate-spin-slow" />
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {t("No recurring expenses found", "Nenašli sa žiadne pravidelné výdavky", "Nincsenek rendszeres kiadások")}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {t("Add your regular rent, software subscriptions, contractor retainers, or utility costs.", "Pridajte nájomné, predplatné softvéru, mzdy alebo fixné prevádzkové náklady.", "Vegyen fel bérleti díjakat, szoftver-előfizetéseket vagy egyéb fix költségeket.")}
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleQuickSeedRecurringExpenses}
                            className="px-3.5 py-1.5 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-xl border border-purple-200 dark:border-purple-800 cursor-pointer"
                          >
                            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
                            {t("Load Standard Overhead Templates", "Nahrať vzorové šablóny", "Alapértelmezett sablonok betöltése")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCreateRecurringModal("expense", "global")}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5 inline mr-1" />
                            {t("Create First Rule", "Vytvoriť prvé pravidlo", "Első szabály létrehozása")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecurringRecords.map((rec) => {
                      const project = projects.find((p) => p.id === rec.projectId);
                      const projectLead = project ? leads.find((l) => l.id === project.leadId || l.id === project.clientId) : null;
                      const pName = projectLead ? `${projectLead.name}` : rec.projectId ? `Projekt ${rec.projectId.slice(0, 8)}` : null;
                      const client = leads.find((l) => l.id === rec.clientId || l.id === project?.clientId || l.id === project?.leadId);
                      const catBreadcrumbs = getCategoryBreadcrumbs(rec.categoryId);
                      const rootCat = catBreadcrumbs[0];
                      const isPaused = rec.status === "cancelled";
                      const amount = rec.amountReal > 0 ? rec.amountReal : rec.amountPlanned;
                      const monthlyCost = getMonthlyEquivalent(amount, rec.recurringFrequency);
                      const { dateStr, daysLeft } = getNextRecurringDueDate(rec);
                      const cadenceText = getRecurrenceDescription(rec);

                      return (
                        <tr
                          key={rec.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group ${
                            isPaused ? "opacity-60 bg-slate-50/30 dark:bg-slate-900/30" : ""
                          }`}
                        >
                          {/* 1. Title & Description */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-sm">
                                {rec.title}
                              </span>
                              {rec.type === "income" && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                  {t("Income", "Príjem", "Bevétel")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {rec.invoiceNumber && (
                                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                  {rec.invoiceNumber}
                                </span>
                              )}
                              {rec.description && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[240px]" title={rec.description}>
                                  {rec.description}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Cadence & Schedule Details */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                {rec.recurringFrequency || "monthly"}
                              </span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                {cadenceText}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>
                                {t("Next:", "Najbližšie:", "Következő:")} {formatDateLocalized(dateStr, userLanguage)}{" "}
                                <span className={daysLeft <= 3 ? "text-rose-500 font-bold" : "text-slate-500"}>
                                  ({daysLeft === 0 ? t("Today", "Dnes", "Ma") : t(`in ${daysLeft}d`, `o ${daysLeft} dní`, `${daysLeft} nap múlva`)})
                                </span>
                              </span>
                            </div>
                          </td>

                          {/* 3. Category Path */}
                          <td className="py-3.5 px-4">
                            {catBreadcrumbs.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
                                  style={{ backgroundColor: rootCat?.color || "#f43f5e" }}
                                />
                                {catBreadcrumbs.map((c, idx) => (
                                  <React.Fragment key={c.id}>
                                    {idx > 0 && <span className="text-[10px] text-slate-400">›</span>}
                                    <span
                                      className={`text-[11px] ${
                                        idx === catBreadcrumbs.length - 1
                                          ? "font-bold text-slate-800 dark:text-slate-200"
                                          : "font-normal text-slate-500 dark:text-slate-400"
                                      }`}
                                    >
                                      {c.name}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                {t("Uncategorized", "Bez kategórie", "Kategória nélkül")}
                              </span>
                            )}
                          </td>

                          {/* 4. Linked Entity */}
                          <td className="py-3.5 px-4">
                            {rec.projectId ? (
                              <button
                                type="button"
                                onClick={() => onOpenProject?.(rec.projectId!)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[120px]" title={pName || rec.projectId}>
                                  {pName}
                                </span>
                              </button>
                            ) : rec.clientId ? (
                              <button
                                type="button"
                                onClick={() => onOpenClient?.(rec.clientId!)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <User className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate max-w-[120px]" title={client?.name || rec.clientId}>
                                  {client?.name || rec.clientId.slice(0, 8)}
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                <Globe className="h-3 w-3 text-slate-400 shrink-0" />
                                <span>{t("Global Company", "Globálne firemné", "Globális vállalati")}</span>
                              </span>
                            )}
                          </td>

                          {/* 5. Amount & Monthly Breakdown */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-black text-sm text-rose-600 dark:text-rose-400">
                              -{money(amount)}
                              {rec.recurringFrequency && rec.recurringFrequency !== "monthly" && (
                                <span className="text-[10px] font-bold text-slate-400 ml-1">
                                  / {rec.recurringFrequency === "weekly" ? t("wk", "týž", "hét") : t("yr", "rok", "év")}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                              ≈ -{money(monthlyCost)} / {t("month", "mesiac", "hónap")}
                            </div>
                          </td>

                          {/* 6. Active / Paused Switch */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleRecurringActive(rec.id)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 border ${
                                !isPaused
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shadow-2xs"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                              }`}
                              title={!isPaused ? t("Click to pause rule", "Kliknutím pozastavíte", "Kattintson a szüneteltetéshez") : t("Click to resume rule", "Kliknutím aktivujete", "Kattintson az aktiváláshoz")}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${!isPaused ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                              <span>{!isPaused ? t("Active", "Aktívne", "Aktív") : t("Paused", "Pozastavené", "Szünetel")}</span>
                            </button>
                          </td>

                          {/* 7. Action buttons */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(rec)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                title={t("Edit recurring expense", "Upraviť pravidlo", "Szerkesztés")}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateRecurring(rec)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                title={t("Duplicate rule", "Duplikovať pravidlo", "Másolás")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(rec.id)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title={t("Delete rule", "Vymazať pravidlo", "Törlés")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB CONTENT 5: 3-LEVEL CATEGORY HIERARCHY TREE MANAGER */}
      {activeTab === "categories" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                {t("Movement Categories", "Kategórie finančných pohybov", "Mozgási kategóriák")}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("Organize your financial movement categories across Main Category (L1) ➔ Subcategory (L2) ➔ Sub-subcategory (L3).", "Organizácia finančných tokov a nákladov v 3 úrovniach: Hlavná kategória (L1) ➔ Podkategória (L2) ➔ Pod-podkategória (L3).", "Pénzügyi tételek 3 szintű rendszerezése: Főkategória (L1) ➔ Alkategória (L2) ➔ Al-alkategória (L3).")}
              </p>
            </div>

            {/* Incomes vs Expenses tree switcher */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
              <button
                onClick={() => setCatTreeType("expense")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  catTreeType === "expense" ? "bg-white dark:bg-slate-700 text-rose-600 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("Expense Categories", "Kategórie výdavkov", "Kiadási kategóriák")}
              </button>
              <button
                onClick={() => setCatTreeType("income")}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  catTreeType === "income" ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm" : "text-slate-500"
                }`}
              >
                {t("Income Categories", "Kategórie príjmov", "Bevételi kategóriák")}
              </button>
            </div>
          </div>

          {/* Quick Add Category Form */}
          <form onSubmit={handleCreateCategory} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                {t("Category Name", "Názov kategórie", "Kategória neve")}
              </label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={t("e.g. Meta Ads, Truck Transport, LAM 5+...", "napr. Meta Ads, Preprava, LAM 5+...", "pl. Google Ads, Szállítás...")}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>

            <div className="min-w-[220px]">
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                {t("Parent Category (optional)", "Nadradená kategória (voliteľné)", "Szülő kategória (opcionális)")}
              </label>
              <select
                value={newCatParentId}
                onChange={(e) => setNewCatParentId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="">{t("★ None (Create as Level 1 Root)", "★ Žiadna (Vytvoriť ako Hlavnú L1)", "★ Nincs (Fő L1 kategória)")}</option>
                {financialCategories
                  .filter((c) => c.type === catTreeType && c.level < 3)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.level === 1 ? `● ${c.name} (L1)` : `  ↳ ${c.name} (L2)`}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">{t("Color", "Farba", "Szín")}</label>
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="h-9 w-12 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm"
            >
              {t("+ Add Category", "+ Pridať kategóriu", "+ Kategória hozzáadása")}
            </button>
          </form>

          {/* Tree Rendering */}
          <div className="space-y-3">
            {(catTreeType === "expense" ? categoryTree.expenseTree : categoryTree.incomeTree).map((l1: any) => (
              <div key={l1.id} className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                {/* Level 1 Header */}
                <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: l1.color }} />
                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">{l1.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Level 1</span>
                  </div>
                  <button
                    onClick={() => handleDeleteCategory(l1.id)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title={t("Delete category", "Vymazať", "Törlés")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Level 2 Children */}
                {l1.children && l1.children.length > 0 && (
                  <div className="p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900">
                    {l1.children.map((l2: any) => (
                      <div key={l2.id} className="pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l2.color || l1.color }} />
                            <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">{l2.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500">Level 2</span>
                          </div>
                          <button
                            onClick={() => handleDeleteCategory(l2.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Level 3 Children */}
                        {l2.children && l2.children.length > 0 && (
                          <div className="pl-6 space-y-1">
                            {l2.children.map((l3: any) => (
                              <div key={l3.id} className="flex items-center justify-between p-1.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l3.color || l2.color }} />
                                  <span className="text-slate-700 dark:text-slate-300 font-medium">{l3.name}</span>
                                  <span className="text-[10px] text-slate-400">(Level 3)</span>
                                </div>
                                <button
                                  onClick={() => handleDeleteCategory(l3.id)}
                                  className="p-0.5 text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9A. EDIT TRANSACTION: RIGHT SLIDEOUT DRAWER PANEL (ENTITIES WITHOUT SEPARATE VIEW) */}
      {isModalOpen && editingRecord && (
        <div className="fixed inset-0 z-[9999] flex justify-end overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ${
              isClosingModal ? "opacity-0" : "opacity-100"
            }`}
            onClick={handleCloseModal}
          />

          {/* Right Slideout Drawer Panel with genuine smooth slide physics */}
          <div
            className={`relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isClosingModal ? "translate-x-full" : "translate-x-0"
            }`}
          >
            {/* Drawer Header (Fixed at top) */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    formType === "income"
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                  }`}
                >
                  {formType === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {formType === "income"
                        ? t("Edit Income / Invoice", "Upraviť príjem / faktúru", "Bevétel / számla szerkesztése")
                        : t("Edit Expense", "Upraviť výdavok", "Kiadás szerkesztése")}
                    </h3>
                    {formIsRecurring && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        {t("Recurring", "Pravidelné", "Ismétlődő")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t(
                      "Update transaction values, 3-level categories, or recurrence rules.",
                      "Úprava finančného záznamu, kategórie alebo pravidiel opakovania.",
                      "Tétel, kategória és ismétlődés adatainak módosítása."
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title={t("Close panel", "Zavrieť panel", "Bezárás")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="transaction-edit-form" onSubmit={handleSaveTransaction} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              {renderTransactionFormFields()}
            </form>

            {/* Sticky Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégsem")}
              </button>
              <button
                type="submit"
                form="transaction-edit-form"
                className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all ${
                  formType === "income"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                }`}
              >
                {t("Save Changes", "Uložiť zmeny", "Módosítások mentése")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9B. CREATE TRANSACTION: CENTER POPUP MODAL */}
      {isModalOpen && !editingRecord && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop overlay */}
          <div
            className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 ${
              isClosingModal ? "opacity-0" : "opacity-100"
            }`}
            onClick={handleCloseModal}
          />

          {/* Center Modal Card */}
          <div
            className={`relative z-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden transition-all duration-200 ${
              isClosingModal ? "scale-95 opacity-0" : "scale-100 opacity-100"
            }`}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    formType === "income"
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                  }`}
                >
                  {formType === "income" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {formType === "income"
                        ? t("Add New Income / Invoice", "Pridať nový príjem / faktúru", "Új bevétel / számla hozzáadása")
                        : t("Add New Expense", "Pridať nový výdavok", "Új kiadás hozzáadása")}
                    </h3>
                    {formIsRecurring && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        {t("Recurring", "Pravidelné", "Ismétlődő")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t(
                      "Specify planned vs real amounts, scope, recurring schedule, and 3-level categories.",
                      "Zadajte plánovanú a reálnu sumu, rozsah, pravidelnosť a kategóriu.",
                      "Adja meg a tervezett és valós összeget, gyakoriságot és kategóriát."
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title={t("Close", "Zavrieť", "Bezárás")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form id="transaction-create-form" onSubmit={handleSaveTransaction} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
              {renderTransactionFormFields()}
            </form>

            {/* Actions Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégsem")}
              </button>
              <button
                type="submit"
                form="transaction-create-form"
                className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition-all ${
                  formType === "income"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                }`}
              >
                {formType === "income"
                  ? t("Create Income", "Vytvoriť príjem", "Bevétel létrehozása")
                  : t("Create Expense", "Vytvoriť výdavok", "Kiadás létrehozása")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. CATEGORY TREE MANAGEMENT MODAL */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                {t("Manage 3-Level Categories", "Správa kategórií (3 úrovne)", "3 szintű kategóriák")}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {t("You can manage categories under the '3-Level Category Tree' tab or add subcategories directly.", "Kategórie môžete spravovať v záložke 'Strom kategórií'.", "A kategóriák kezelhetők a 'Kategória-fa' fül alatt.")}
            </p>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  setIsCatModalOpen(false);
                  handleTabChange("categories");
                }}
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {t("Open Full Category Tree Manager", "Otvoriť strom kategórií", "Kategória-fa megnyitása")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
