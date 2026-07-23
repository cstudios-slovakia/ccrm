import React, { useState, useMemo, useEffect, useRef } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { createPortal } from "react-dom";
import { 
  Users, MapPin, Search, Clock, User, Briefcase, Handshake, 
  Euro, UserCheck, Check, Layers, Phone, Mail, Globe, 
  Calendar, ArrowLeft, Plus, TrendingUp, PencilLine, FileText,
  X, FolderOpen, Download, Trash2, SlidersHorizontal,
  CornerDownLeft, CornerLeftDown, Loader2, Brain, Mic, Play, Pause, Square, Sparkles,
  ChevronLeft, ChevronRight
} from "lucide-react";
import type { Lead, TimelineEvent, Task } from "../types";
import { cn } from "../utils/cn";
import { BlockEditor } from "./BlockEditor";
import type { EditorBlock } from "./BlockEditor";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { resolveCurrencySymbol, formatMoney } from "../utils/currency";

interface ClientsViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  projectManagers: string[];
  projectManagerColors?: Record<string, string>;
  leadSources: string[];
  initialSelectedClient?: string;
  systemLanguage: Language;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  leadCategories: string[];
  integrationsConfig?: any;
  taskStates: string[];
  systemName?: string;
  currencyCode?: string | null;
}


interface FinancialReportViewProps {
  summary: string;
  systemLanguage: string;
}

export const FinancialReportView: React.FC<FinancialReportViewProps> = ({ summary, systemLanguage }) => {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);

  // Parse the years, revenues, and profits from markdown table
  const parsedData = useMemo(() => {
    const lines = summary.split('\n');
    const years: string[] = [];
    const revenues: number[] = [];
    const profits: number[] = [];

    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        const yearMatch = parts[1].match(/^\d{4}$/);
        if (yearMatch) {
          const year = parts[1];
          const cleanNum = (str: string) => {
            let cleaned = str.replace(/&euro;/g, '').replace(/[€\s]/g, '');
            if (/, \d{3}/.test(cleaned) || /,\d{3}/.test(cleaned)) {
              cleaned = cleaned.replace(/,/g, '');
            }
            return parseFloat(cleaned);
          };
          const revenue = cleanNum(parts[2]);
          const profit = cleanNum(parts[3]);

          if (!isNaN(revenue)) {
            years.push(year);
            revenues.push(revenue);
            profits.push(isNaN(profit) ? 0 : profit);
          }
        }
      }
    }
    return { years, revenues, profits };
  }, [summary]);

  useEffect(() => {
    if (!chartRef.current || parsedData.years.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const ChartGlob = (window as any).Chart;
    if (!ChartGlob) {
      console.warn("Chart.js is not loaded yet");
      return;
    }

    chartInstanceRef.current = new ChartGlob(ctx, {
      type: 'line',
      data: {
        labels: parsedData.years,
        datasets: [
          {
            label: systemLanguage === 'sk' ? 'Celkové výnosy (€)' : systemLanguage === 'hu' ? 'Összes bevétel (€)' : 'Total Revenues (€)',
            data: parsedData.revenues,
            borderColor: 'rgb(79, 70, 229)',
            backgroundColor: 'rgba(79, 70, 229, 0.05)',
            borderWidth: 3,
            pointBackgroundColor: 'rgb(79, 70, 229)',
            pointRadius: 5,
            fill: true,
            tension: 0.3,
            order: 2,
          },
          {
            label: systemLanguage === 'sk' ? 'Výsledok hospodárenia (€)' : systemLanguage === 'hu' ? 'Nettó nyereség/veszteség (€)' : 'Net Profit/Loss (€)',
            data: parsedData.profits,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 3,
            pointBackgroundColor: 'rgb(16, 185, 129)',
            pointRadius: 5,
            fill: true,
            tension: 0.3,
            order: 1,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: {
                family: 'Google Sans, sans-serif',
                weight: 'bold',
                size: 10
              },
              color: '#334155'
            }
          },
          tooltip: {
            titleFont: {
              family: 'Google Sans, sans-serif',
              weight: 'bold'
            },
            bodyFont: {
              family: 'Google Sans, sans-serif'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#64748b',
              font: {
                family: 'Google Sans, sans-serif',
                size: 9,
                weight: 'bold'
              },
              callback: (value: any) => '€' + value.toLocaleString()
            },
            grid: {
              color: '#f1f5f9'
            }
          },
          x: {
            ticks: {
              color: '#64748b',
              font: {
                family: 'Google Sans, sans-serif',
                size: 10,
                weight: 'bold'
              }
            },
            grid: {
              display: false
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [parsedData, systemLanguage]);

  const renderBeautifulReport = (text: string) => {
    if (!text) return null;

    const cleanedText = text.replace(/```markdown\s*/g, '').replace(/```\s*/g, '');
    const lines = cleanedText.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let tableRows: string[][] = [];

    const formatInlineMarkdown = (str: string) => {
      if (!str) return '';
      // Escape HTML first so any markup in AI/registry-sourced text is inert;
      // only our own ** / * markers are then turned into <strong>/<em>.
      const escaped = str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-slate-900 font-extrabold">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>');
    };

    const flushList = (key: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${key}`} className="space-y-1 my-3 pl-5 list-disc text-slate-650 font-semibold leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }} />
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    const flushTable = (key: string) => {
      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${key}`} className="overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="min-w-full divide-y divide-slate-250 text-[11px]">
              <thead className="bg-slate-50">
                <tr>
                  {tableRows[0].map((cell, idx) => (
                    <th key={idx} className="px-4 py-2 text-left font-black text-slate-700 uppercase tracking-wider" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {tableRows.slice(1).map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className={`px-4 py-2 font-bold ${cellIdx === 0 ? 'text-slate-800 font-extrabold' : 'text-slate-600'}`} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      const h1Match = line.match(/^#\s+(.*$)/);
      const h2Match = line.match(/^##\s+(.*$)/);
      const h3Match = line.match(/^###\s+(.*$)/);
      const listMatch = line.match(/^\s*[-\*]\s+(.*$)/);
      const isTableLine = line.startsWith('|');

      if (h1Match || h2Match || h3Match || listMatch || isTableLine === false) {
        flushList(String(i));
        flushTable(String(i));
      }

      if (h1Match) {
        elements.push(
          <h2 key={i} className="text-sm font-black text-slate-900 uppercase tracking-wide mt-6 mb-3 border-b border-slate-200 pb-1.5 flex items-center gap-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h1Match[1]) }} />
        );
      } else if (h2Match) {
        elements.push(
          <h3 key={i} className="text-xs font-black text-slate-850 uppercase tracking-wide mt-5 mb-2 flex items-center gap-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h2Match[1]) }} />
        );
      } else if (h3Match) {
        elements.push(
          <h4 key={i} className="text-[11px] font-black text-slate-650 uppercase tracking-wider mt-4 mb-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h3Match[1]) }} />
        );
      } else if (listMatch) {
        listItems.push(formatInlineMarkdown(listMatch[1]));
      } else if (isTableLine) {
        const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const isSeparator = cells.every(c => /^[-:]+$/.test(c));
        if (!isSeparator) {
          tableRows.push(cells);
        }
      } else if (line !== "") {
        elements.push(
          <p key={i} className="my-2.5 leading-relaxed text-slate-600 font-semibold" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }} />
        );
      }
    }

    flushList("end");
    flushTable("end");

    return <div className="space-y-1 text-[11.5px]">{elements}</div>;
  };

  return (
    <div className="space-y-6">
      {parsedData.years.length > 0 && (
        <div className="p-4 rounded-2xl bg-white border border-slate-150 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
              {systemLanguage === 'sk' ? 'Graf vývoja hospodárenia' : systemLanguage === 'hu' ? 'Pénzügyi trend diagram' : 'Financial Trend Chart'}
            </h4>
          </div>
          <div className="h-48 relative w-full">
            <canvas ref={chartRef} />
          </div>
        </div>
      )}
      
      <div className="p-6 rounded-2xl bg-indigo-50/15 border-2 border-indigo-100/60 shadow-inner leading-relaxed text-xs">
        {renderBeautifulReport(summary)}
      </div>
    </div>
  );
};

export const ClientsView: React.FC<ClientsViewProps> = ({
  leads,
  setLeads,
  projectManagers,
  projectManagerColors = {},
  leadSources,
  initialSelectedClient,
  systemLanguage,
  tasks: _tasks,
  setTasks,
  leadCategories,
  integrationsConfig,
  taskStates,
  systemName = "CCRM",
  currencyCode
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const currencySymbol = resolveCurrencySymbol(currencyCode, systemLanguage);
  const money = (value: number, opts?: Intl.NumberFormatOptions) => formatMoney(value, currencyCode, systemLanguage, opts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterCity, setFilterCity] = useState("");
  const [filterPM, setFilterPM] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedType, filterCity, filterPM]);
  
  // State hook to toggle detail card edit mode
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Register Client Drawer & Input States
  const [showRegisterDrawer, setShowRegisterDrawer] = useState(false);
  const [isClosingRegisterDrawer, setIsClosingRegisterDrawer] = useState(false);
  
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientType, setNewClientType] = useState<"person" | "business" | "partner">("business");
  const [newClientCity, setNewClientCity] = useState("");
  const [newClientStreet, setNewClientStreet] = useState("");
  const [newClientPostalCode, setNewClientPostalCode] = useState("");
  const [newClientCountry, setNewClientCountry] = useState("Slovakia");
  const [newClientCompanyId, setNewClientCompanyId] = useState("");
  const [newClientTaxId, setNewClientTaxId] = useState("");
  const [newClientVatId, setNewClientVatId] = useState("");
  const [newClientContactPerson, setNewClientContactPerson] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");
  const [newClientEstablishmentDate, setNewClientEstablishmentDate] = useState("");
  const [newClientLegalForm, setNewClientLegalForm] = useState("");
  const [newClientSkNace, setNewClientSkNace] = useState("");
  const [newClientOrganizationSize, setNewClientOrganizationSize] = useState("");
  const [newClientOwnershipType, setNewClientOwnershipType] = useState("");
  const [newClientDataSource, setNewClientDataSource] = useState("");
  const [newClientDissolutionDate, setNewClientDissolutionDate] = useState("");
  const [newClientRegion, setNewClientRegion] = useState("");
  const [newClientDistrict, setNewClientDistrict] = useState("");
  const [newClientOwner, setNewClientOwner] = useState(projectManagers[0] || "");
  const [newClientValue, setNewClientValue] = useState("");
  const [newClientCategories, setNewClientCategories] = useState<string[]>([]);

  // RegisterUZ autocomplete state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [activeSuggestionInput, setActiveSuggestionInput] = useState<"name" | "companyId" | "profileName" | "profileCompanyId" | null>(null);
  const suggestionTimeoutRef = useRef<any>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // VAT validation state
  const [newClientVatStatus, setNewClientVatStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [newClientVatResult, setNewClientVatResult] = useState<{ valid: boolean; name?: string; address?: string; checkedAt?: string; error?: string } | null>(null);

  const [profileVatStatus, setProfileVatStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "error">("idle");
  const [profileVatResult, setProfileVatResult] = useState<{ valid: boolean; name?: string; address?: string; checkedAt?: string; error?: string } | null>(null);

  const validateVatCode = async (vat: string, isProfile: boolean) => {
    const cleanVat = vat.replace(/[^A-Za-z0-9]/g, "").trim();
    if (cleanVat.length < 4) {
      if (isProfile) {
        setProfileVatStatus("idle");
        setProfileVatResult(null);
      } else {
        setNewClientVatStatus("idle");
        setNewClientVatResult(null);
      }
      return;
    }

    if (isProfile) {
      setProfileVatStatus("checking");
      setProfileVatResult(null);
    } else {
      setNewClientVatStatus("checking");
      setNewClientVatResult(null);
    }

    try {
      const response = await fetch(`/api/validate_vat.php?vat=${encodeURIComponent(cleanVat)}`);
      const data = await response.json();
      if (data.success) {
        const valResult = {
          valid: !!data.valid,
          name: data.name || "",
          address: data.address || "",
          checkedAt: new Date().toISOString()
        };

        if (data.valid) {
          if (isProfile) {
            setProfileVatStatus("valid");
            setProfileVatResult(valResult);
            if (activeClient) {
              setLeads(prev => prev.map(lead => {
                if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
                  return { ...lead, vatValidationResult: valResult };
                }
                return lead;
              }));
            }
          } else {
            setNewClientVatStatus("valid");
            setNewClientVatResult(valResult);
          }
        } else {
          const invResult = { valid: false, checkedAt: new Date().toISOString() };
          if (isProfile) {
            setProfileVatStatus("invalid");
            setProfileVatResult(invResult);
            if (activeClient) {
              setLeads(prev => prev.map(lead => {
                if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
                  return { ...lead, vatValidationResult: invResult };
                }
                return lead;
              }));
            }
          } else {
            setNewClientVatStatus("invalid");
            setNewClientVatResult(invResult);
          }
        }
      } else {
        const errResult = { valid: false, error: data.message, checkedAt: new Date().toISOString() };
        if (isProfile) {
          setProfileVatStatus("error");
          setProfileVatResult(errResult);
        } else {
          setNewClientVatStatus("error");
          setNewClientVatResult(errResult);
        }
      }
    } catch (err: any) {
      const errResult = { valid: false, error: err.message || "Network error", checkedAt: new Date().toISOString() };
      if (isProfile) {
        setProfileVatStatus("error");
        setProfileVatResult(errResult);
      } else {
        setNewClientVatStatus("error");
        setNewClientVatResult(errResult);
      }
    }
  };

  const renderVatValidation = (status: "idle" | "checking" | "valid" | "invalid" | "error", result: any) => {
    if (status === "idle") return null;

    return (
      <div className="mt-1 flex items-center">
        {status === "checking" && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full animate-pulse">
            <Loader2 className="h-2.5 w-2.5 animate-spin text-emerald-500" />
            {getTranslation(systemLanguage, "clients.vat_validation.checking")}
          </span>
        )}
        
        {status === "valid" && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" title={result?.name}>
            ✓ {getTranslation(systemLanguage, "clients.vat_validation.valid")}
          </span>
        )}

        {status === "invalid" && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            ✗ {getTranslation(systemLanguage, "clients.vat_validation.invalid")}
          </span>
        )}

        {status === "error" && (
          <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full" title={result?.error}>
            ⚠ {getTranslation(systemLanguage, "clients.vat_validation.error")}
          </span>
        )}
      </div>
    );
  };




  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSuggestions([]);
        setActiveSuggestionInput(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (newClientType === "person") {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setActiveSuggestionInput(null);
    }
  }, [newClientType]);

  useEffect(() => {
    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, []);

  const fetchSuggestions = async (val: string, inputType: "name" | "companyId" | "profileName" | "profileCompanyId", country: string = newClientCountry) => {
    if (val.trim().length < 3) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setActiveSuggestionInput(inputType);
      return;
    }

    const isSlovakia = country === "Slovakia";
    const isCzechia = country === "Czechia" || country === "Czech Republic";

    if (!isSlovakia && !isCzechia) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setActiveSuggestionInput(inputType);
      return;
    }

    setIsLoadingSuggestions(true);
    setActiveSuggestionInput(inputType);
    try {
      const endpoint = isSlovakia
        ? `/api/registeruz.php?action=suggest&query=${encodeURIComponent(val)}`
        : `/api/ares_cz.php?action=suggest&query=${encodeURIComponent(val)}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSuggestions(data);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      console.error("Error fetching suggestions", err);
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewClientName(val);
    
    if (newClientType === "person") return;
    
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, "name");
    }, 350);
  };

  const handleCompanyIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewClientCompanyId(val);
    
    if (newClientType === "person") return;
    
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, "companyId", newClientCountry);
    }, 350);
  };

  const handleProfileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProfileName(val);
    
    if (profileType === "person") return;
    
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, "profileName", profileCountry);
    }, 350);
  };

  const handleProfileCompanyIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setProfileCompanyId(val);
    
    if (profileType === "person") return;
    
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }
    
    suggestionTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, "profileCompanyId", profileCountry);
    }, 350);
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, "");
  };

  const handleSelectSuggestion = async (item: any) => {
    const isProfile = activeSuggestionInput === "profileName" || activeSuggestionInput === "profileCompanyId";
    
    setSuggestions([]);
    setActiveSuggestionInput(null);
    
    const loadingMsg = systemLanguage === "sk" ? "Načítavam údaje z registra..." : systemLanguage === "hu" ? "Cégadatok betöltése..." : "Loading company details...";
    const successMsg = systemLanguage === "sk" ? "Údaje o firme úspešne načítané!" : systemLanguage === "hu" ? "Cégadatok sikeresen betöltve!" : "Company details loaded successfully!";
    const errorMsg = systemLanguage === "sk" ? "Chyba pri načítaní údajov z registra." : systemLanguage === "hu" ? "Hiba a cégadatok betöltésekor." : "Error loading company details.";
    
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(loadingMsg);
    }
    
    const country = isProfile ? profileCountry : newClientCountry;
    const isSlovakia = country === "Slovakia";
    const isCzechia = country === "Czechia" || country === "Czech Republic";

    try {
      const endpoint = isSlovakia
        ? `/api/registeruz.php?action=detail&id=${item.id}`
        : `/api/ares_cz.php?action=detail&id=${item.id}`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to fetch detail");
      const detail = await res.json();
      
      if (isSlovakia) {
        if (detail && detail.id) {
          const nameVal = detail.nazovUJ || stripHtml(item.entityName) || "";
          const companyIdVal = detail.ico || item.entNumber || "";
          const taxIdVal = detail.dic || item.taxNumber || "";
          
          let vatVal = "";
          if (detail.dic) {
            vatVal = `SK${detail.dic}`;
          } else if (item.taxNumber) {
            vatVal = `SK${item.taxNumber}`;
          }
          
          if (isProfile) {
            setProfileName(nameVal);
            setProfileCompanyId(companyIdVal);
            setProfileTaxId(taxIdVal);
            setProfileVatId(vatVal);
            setProfileCity(detail.mesto || "");
            setProfileStreet(detail.ulica || "");
            setProfilePostalCode(detail.psc || "");
            setProfileCountry("Slovakia");
            setProfileEstablishmentDate(detail.datumZalozenia || "");
            setProfileLegalForm(detail.pravnaForma || "");
            setProfileSkNace(detail.skNace || "");
            setProfileOrganizationSize(detail.velkostOrganizacie || "");
            setProfileOwnershipType(detail.druhVlastnictva || "");
            setProfileDataSource(detail.zdrojDat || "");
            setProfileDissolutionDate(detail.datumZrusenia || "");
            setProfileRegion(detail.kraj || "");
            setProfileDistrict(detail.okres || "");
          } else {
            setNewClientName(nameVal);
            setNewClientCompanyId(companyIdVal);
            setNewClientTaxId(taxIdVal);
            setNewClientVatId(vatVal);
            if (vatVal) {
              validateVatCode(vatVal, false);
            } else {
              setNewClientVatStatus("idle");
              setNewClientVatResult(null);
            }
            setNewClientCity(detail.mesto || "");
            setNewClientStreet(detail.ulica || "");
            setNewClientPostalCode(detail.psc || "");
            setNewClientCountry("Slovakia");
            setNewClientEstablishmentDate(detail.datumZalozenia || "");
            setNewClientLegalForm(detail.pravnaForma || "");
            setNewClientSkNace(detail.skNace || "");
            setNewClientOrganizationSize(detail.velkostOrganizacie || "");
            setNewClientOwnershipType(detail.druhVlastnictva || "");
            setNewClientDataSource(detail.zdrojDat || "");
            setNewClientDissolutionDate(detail.datumZrusenia || "");
            setNewClientRegion(detail.kraj || "");
            setNewClientDistrict(detail.okres || "");
          }
          
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast(successMsg);
          }
        } else {
          throw new Error("Invalid detail response");
        }
      } else if (isCzechia) {
        if (detail && (detail.ico || detail.icoId)) {
          const nameVal = detail.obchodniJmeno || stripHtml(item.entityName) || "";
          const companyIdVal = detail.ico || item.entNumber || "";
          
          let rawDic = detail.dic || item.taxNumber || "";
          let cleanedTaxId = rawDic;
          if (rawDic.toUpperCase().startsWith("CZ")) {
            cleanedTaxId = rawDic.substring(2);
          }
          
          let vatVal = rawDic;
          if (!vatVal && detail.ico) {
            vatVal = `CZ${detail.ico}`;
          }
          
          const sidlo = detail.sidlo || {};
          const cityVal = sidlo.nazevObce || "";
          const streetPart = sidlo.nazevUlice || sidlo.nazevCastiObce || sidlo.nazevObce || "";
          const houseNo = sidlo.cisloDomovni || "";
          const orientNo = sidlo.cisloOrientacni || "";
          let streetVal = streetPart;
          if (houseNo || orientNo) {
            streetVal += " " + houseNo + (orientNo ? "/" + orientNo : "");
          }
          
          if (isProfile) {
            setProfileName(nameVal);
            setProfileCompanyId(companyIdVal);
            setProfileTaxId(cleanedTaxId);
            setProfileVatId(vatVal);
            setProfileStreet(streetVal.trim());
            setProfileCity(cityVal);
            setProfilePostalCode(sidlo.psc ? String(sidlo.psc) : "");
            setProfileCountry(profileCountry);
            setProfileEstablishmentDate(detail.datumVzniku || "");
            setProfileLegalForm(detail.pravniForma || "");
            setProfileRegion(sidlo.nazevKraje || "");
            setProfileDistrict(sidlo.nazevOkresu || "");
          } else {
            setNewClientName(nameVal);
            setNewClientCompanyId(companyIdVal);
            setNewClientTaxId(cleanedTaxId);
            setNewClientVatId(vatVal);
            if (vatVal) {
              validateVatCode(vatVal, false);
            } else {
              setNewClientVatStatus("idle");
              setNewClientVatResult(null);
            }
            setNewClientStreet(streetVal.trim());
            setNewClientCity(cityVal);
            setNewClientPostalCode(sidlo.psc ? String(sidlo.psc) : "");
            setNewClientCountry(newClientCountry);
            setNewClientEstablishmentDate(detail.datumVzniku || "");
            setNewClientLegalForm(detail.pravniForma || "");
            setNewClientRegion(sidlo.nazevKraje || "");
            setNewClientDistrict(sidlo.nazevOkresu || "");
          }
          
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast(successMsg);
          }
        } else {
          throw new Error("Invalid detail response");
        }
      }
    } catch (err) {
      console.error("Error fetching detail", err);
      const isCzech = country === "Czechia" || country === "Czech Republic";
      
      const nameVal = stripHtml(item.entityName) || "";
      const companyIdVal = item.entNumber || "";
      
      let rawTax = item.taxNumber || "";
      let cleanedTax = rawTax;
      if (isCzech && rawTax.toUpperCase().startsWith("CZ")) {
        cleanedTax = rawTax.substring(2);
      }
      
      let vatVal = rawTax;
      if (!vatVal && item.entNumber) {
        vatVal = isCzech ? `CZ${item.entNumber}` : `SK${item.entNumber}`;
      } else if (vatVal && !isCzech && !vatVal.toUpperCase().startsWith("SK")) {
        vatVal = `SK${vatVal}`;
      }
      
      if (isProfile) {
        setProfileName(nameVal);
        setProfileCompanyId(companyIdVal);
        setProfileTaxId(cleanedTax);
        setProfileVatId(vatVal);
      } else {
        setNewClientName(nameVal);
        setNewClientCompanyId(companyIdVal);
        setNewClientTaxId(cleanedTax);
        setNewClientVatId(vatVal);
        if (vatVal) {
          validateVatCode(vatVal, false);
        } else {
          setNewClientVatStatus("idle");
          setNewClientVatResult(null);
        }
      }

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(errorMsg, "error");
      }
    }
  };

  useEffect(() => {
    if (projectManagers.length > 0 && !newClientOwner) {
      setNewClientOwner(projectManagers[0]);
    }
  }, [projectManagers]);

  const closeRegisterDrawer = () => {
    setIsClosingRegisterDrawer(true);
    setTimeout(() => {
      setShowRegisterDrawer(false);
      setIsClosingRegisterDrawer(false);
    }, 350);
  };

  const handleRegisterClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      (window as any).showToast(t("Client name is required!", "Meno klienta je povinné!", "Az ügyfél neve kötelező!"));
      return;
    }
    const leadId = `client-${Date.now()}`;
    const newLead: Lead = {
      id: leadId,
      name: newClientName.trim(),
      city: newClientCity.trim(),
      clientType: newClientType,
      status: "accepted", // Won client status
      source: "website",
      owner: newClientOwner || projectManagers[0] || currentUser?.name || "",
      value: parseFloat(newClientValue) || 0,
      createdAt: new Date().toISOString(),
      rating: 5,
      phone: newClientPhone.trim() || undefined,
      email: newClientEmail.trim() || undefined,
      address: {
        street: newClientStreet.trim(),
        city: newClientCity.trim(),
        postalCode: newClientPostalCode.trim(),
        country: newClientCountry
      },
      companyId: newClientType !== "person" ? newClientCompanyId.trim() : undefined,
      taxId: newClientType !== "person" ? newClientTaxId.trim() : undefined,
      vatId: newClientType !== "person" ? newClientVatId.trim() : undefined,
      vatValidationResult: newClientType !== "person" ? newClientVatResult : null,
      contactPerson: newClientType !== "person" ? newClientContactPerson.trim() : undefined,
      website: newClientType !== "person" ? newClientWebsite.trim() : undefined,
      establishmentDate: newClientType !== "person" ? newClientEstablishmentDate.trim() : undefined,
      legalForm: newClientType !== "person" ? newClientLegalForm.trim() : undefined,
      skNace: newClientType !== "person" ? newClientSkNace.trim() : undefined,
      organizationSize: newClientType !== "person" ? newClientOrganizationSize.trim() : undefined,
      ownershipType: newClientType !== "person" ? newClientOwnershipType.trim() : undefined,
      dataSource: newClientType !== "person" ? newClientDataSource.trim() : undefined,
      dissolutionDate: newClientType !== "person" ? newClientDissolutionDate.trim() : undefined,
      region: newClientType !== "person" ? newClientRegion.trim() : undefined,
      district: newClientType !== "person" ? newClientDistrict.trim() : undefined,
      categories: newClientCategories,
      timeline: [
        {
          id: `ev-${Date.now()}`,
          type: "note",
          timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
          title: t("Client Registered", "Klient zaregistrovaný", "Ügyfél regisztrálva"),
          content: t(
            "Client profile successfully registered inside CRM system.",
            "Profil klienta bol úspešne zaregistrovaný v CRM systéme.",
            "Az ügyfélprofil sikeresen regisztrálva a CRM rendszerben."
          )
        }
      ]
    };

    setLeads(prev => [newLead, ...prev]);

    // Reset Form
    setNewClientName("");
    setNewClientPhone("");
    setNewClientEmail("");
    setNewClientType("business");
    setNewClientCity("");
    setNewClientStreet("");
    setNewClientPostalCode("");
    setNewClientCountry("Slovakia");
    setNewClientCompanyId("");
    setNewClientTaxId("");
    setNewClientVatId("");
    setNewClientContactPerson("");
    setNewClientWebsite("");
    setNewClientEstablishmentDate("");
    setNewClientLegalForm("");
    setNewClientSkNace("");
    setNewClientOrganizationSize("");
    setNewClientOwnershipType("");
    setNewClientDataSource("");
    setNewClientDissolutionDate("");
    setNewClientRegion("");
    setNewClientDistrict("");
    setNewClientOwner(projectManagers[0] || "");
    setNewClientValue("");
    setNewClientCategories([]);
    setNewClientVatStatus("idle");
    setNewClientVatResult(null);
    
    closeRegisterDrawer();
    (window as any).showToast(t("New client registered successfully!", "Nový klient bol úspešne zaregistrovaný!", "Az új ügyfél sikeresen regisztrálva!"));
  };

  /**
   * Dynamic Client Profile Aggregator:
   * Consolidates raw leads matching the same trimmed, case-insensitive client name into
   * unified Client Profile entities. It accumulates financial values, groups timeline activities,
   * compiles corporate registers, and sorts events chronologically (newest first).
   */
  const clientProfiles = useMemo(() => {
    const profilesMap: Record<string, {
      name: string;
      city: string;
      clientType: "person" | "business" | "partner";
      source: string;
      owner: string;
      totalValue: number;
      leadsCount: number;
      associatedLeads: Lead[];
      
      // Extended Metadata fields
      phone: string;
      email: string;
      street: string;
      postalCode: string;
      country: string;
      companyId: string;
      taxId: string;
      vatId: string;
      contactPerson: string;
      website: string;
      establishmentDate: string;
      legalForm: string;
      skNace: string;
      organizationSize: string;
      ownershipType: string;
      dataSource: string;
      dissolutionDate: string;
      region: string;
      district: string;
      timeline: TimelineEvent[];
      categories: string[];
      aiSummary?: string;
      aiSummaryFingerprint?: string;
      financialSummary?: string;
      vatValidationResult?: {
        valid: boolean;
        name?: string;
        address?: string;
        checkedAt?: string;
        error?: string;
      } | null;
    }> = {};

    leads.forEach(lead => {
      const clientKey = lead.name.trim().toLowerCase();
      if (!profilesMap[clientKey]) {
        profilesMap[clientKey] = {
          name: lead.name,
          city: lead.city || "",
          clientType: lead.clientType || "person",
          source: lead.source || "website",
          owner: lead.owner || "",
          totalValue: 0,
          leadsCount: 0,
          associatedLeads: [],
          
          phone: lead.phone || "",
          email: lead.email || "",
          street: lead.address?.street || "",
          postalCode: lead.address?.postalCode || "",
          country: lead.address?.country || "Slovakia",
          companyId: lead.companyId || "",
          taxId: lead.taxId || "",
          vatId: lead.vatId || "",
          contactPerson: lead.contactPerson || "",
          website: lead.website || "",
          establishmentDate: lead.establishmentDate || "",
          legalForm: lead.legalForm || "",
          skNace: lead.skNace || "",
          organizationSize: lead.organizationSize || "",
          ownershipType: lead.ownershipType || "",
          dataSource: lead.dataSource || "",
          dissolutionDate: lead.dissolutionDate || "",
          region: lead.region || "",
          district: lead.district || "",
          timeline: lead.timeline || [],
          categories: [],
          aiSummary: lead.aiSummary || "",
          aiSummaryFingerprint: lead.aiSummaryFingerprint || "",
          financialSummary: lead.financialSummary || "",
          vatValidationResult: lead.vatValidationResult || null
        };
      } else {
        if (lead.aiSummary && !profilesMap[clientKey].aiSummary) {
          profilesMap[clientKey].aiSummary = lead.aiSummary;
          profilesMap[clientKey].aiSummaryFingerprint = lead.aiSummaryFingerprint;
        }
        if (lead.financialSummary && !profilesMap[clientKey].financialSummary) {
          profilesMap[clientKey].financialSummary = lead.financialSummary;
        }
        if (lead.vatValidationResult && !profilesMap[clientKey].vatValidationResult) {
          profilesMap[clientKey].vatValidationResult = lead.vatValidationResult;
        }
      }
      profilesMap[clientKey].totalValue += lead.value;
      profilesMap[clientKey].leadsCount += 1;
      profilesMap[clientKey].associatedLeads.push(lead);

      if (lead.categories && Array.isArray(lead.categories)) {
        lead.categories.forEach(cat => {
          if (!profilesMap[clientKey].categories.includes(cat)) {
            profilesMap[clientKey].categories.push(cat);
          }
        });
      }
      
      // Merge unique timeline events safely
      if (lead.timeline && lead.timeline.length > 0) {
        lead.timeline.forEach(event => {
          if (!profilesMap[clientKey].timeline.some(e => e.id === event.id)) {
            profilesMap[clientKey].timeline.push(event);
          }
        });
      }
    });

    // Sort timelines chronologically (Newest First)
    Object.values(profilesMap).forEach(profile => {
      profile.timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });

    return Object.values(profilesMap);
  }, [leads, leadSources]);

  // Find active client details based on URL deep routing
  const activeClient = useMemo(() => {
    if (!initialSelectedClient) return null;
    return clientProfiles.find(c => c.name.toLowerCase() === initialSelectedClient.toLowerCase()) || null;
  }, [clientProfiles, initialSelectedClient]);

  // RegisterUZ dynamically loaded statement list states
  const [registryStatements, setRegistryStatements] = useState<any[]>([]);
  const [isLoadingRegistryStatements, setIsLoadingRegistryStatements] = useState(false);

  useEffect(() => {
    if (!activeClient || !activeClient.companyId || activeClient.clientType === "person") {
      setRegistryStatements([]);
      return;
    }

    const fetchRegistryData = async () => {
      setIsLoadingRegistryStatements(true);
      try {
        const res = await fetch(`/api/registeruz.php?action=lookup&ico=${encodeURIComponent(activeClient.companyId)}`);
        if (!res.ok) throw new Error("Entity lookup failed");
        const detail = await res.json();
        if (detail && detail.idUctovnychZavierok && detail.idUctovnychZavierok.length > 0) {
          const statementIds = detail.idUctovnychZavierok.slice(-5).reverse();
          const statementDetails = await Promise.all(
            statementIds.map(async (id: any) => {
              try {
                const sRes = await fetch(`/api/registeruz.php?action=statement&id=${id}`);
                return await sRes.json();
              } catch (e) {
                return null;
              }
            })
          );
          setRegistryStatements(statementDetails.filter(Boolean));
        } else {
          setRegistryStatements([]);
        }
      } catch (err) {
        console.error("Error fetching registry statements", err);
        setRegistryStatements([]);
      } finally {
        setIsLoadingRegistryStatements(false);
      }
    };

    fetchRegistryData();
  }, [activeClient?.companyId, activeClient?.clientType]);

  // Retrieve current user session to authenticate API requests to mail_broker.php
  const currentUser = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("crm_current_user_rbac");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }, []);

  const userEmailSettings = useMemo(() => {
    try {
      if (currentUser && currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        return metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing user emailSettings", e);
    }
    return null;
  }, [currentUser]);

  const [clientEmails, setClientEmails] = useState<TimelineEvent[]>([]);
  const [isLoadingMails, setIsLoadingMails] = useState(false);

  useEffect(() => {
    if (!activeClient || !activeClient.email || !userEmailSettings || !userEmailSettings.isValidated) {
      setClientEmails([]);
      return;
    }

    const fetchClientMails = async () => {
      setIsLoadingMails(true);
      try {
        const inboxRes = await fetch(
          `/api/mail_broker.php?action=get_emails&folder=INBOX&email=${encodeURIComponent(activeClient.email)}`,
          { headers: { "X-User-Email": currentUser.email } }
        );
        const inboxData = await inboxRes.json();
        
        let sentEmails: any[] = [];
        try {
          const sentRes = await fetch(
            `/api/mail_broker.php?action=get_emails&folder=Sent&email=${encodeURIComponent(activeClient.email)}`,
            { headers: { "X-User-Email": currentUser.email } }
          );
          const sentData = await sentRes.json();
          if (sentData.success && Array.isArray(sentData.emails)) {
            sentEmails = sentData.emails;
          }
        } catch (e) {}

        const combinedEmails: TimelineEvent[] = [];
        
        const processMail = (mail: any) => {
          const isOutgoing = mail.from?.address?.toLowerCase() === currentUser?.email?.toLowerCase();
          const folderPrefix = isOutgoing ? "sent" : "inbox";
          return {
            id: `email-${folderPrefix}-${mail.uid}`,
            type: "email" as const,
            timestamp: mail.date.substring(0, 16),
            title: mail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)"),
            content: `${t("From:", "Od:", "Feladó:")} ${mail.from.name || mail.from.address} <${mail.from.address}>\n\n${t(
              "To view this email or reply, please open the Mail Client.",
              "Ak si chcete e-mail zobraziť alebo naň odpovedať, otvorte poštového klienta.",
              "Az e-mail megtekintéséhez vagy megválaszolásához nyissa meg a levelezőt."
            )}`,
            seen: mail.seen,
            isOutgoing: isOutgoing
          };
        };

        if (inboxData.success && Array.isArray(inboxData.emails)) {
          inboxData.emails.forEach((m: any) => {
            const isMatch = m.from?.address?.toLowerCase() === activeClient.email?.toLowerCase() ||
                            m.to?.address?.toLowerCase() === activeClient.email?.toLowerCase();
            if (isMatch) combinedEmails.push(processMail(m));
          });
        }
        sentEmails.forEach((m: any) => {
          const isMatch = m.from?.address?.toLowerCase() === activeClient.email?.toLowerCase() ||
                          m.to?.address?.toLowerCase() === activeClient.email?.toLowerCase();
          if (isMatch) combinedEmails.push(processMail(m));
        });

        setClientEmails(combinedEmails);
      } catch (err) {
        console.error("Failed to load timeline client emails", err);
      } finally {
        setIsLoadingMails(false);
      }
    };

    fetchClientMails();
  }, [activeClient, userEmailSettings, currentUser]);

  const activeClientTimeline = useMemo(() => {
    if (!activeClient) return [];
    const standardEvents = activeClient.timeline || [];
    const emailIds = new Set(clientEmails.map(e => e.id));
    const merged = [
      ...standardEvents.filter(e => !emailIds.has(e.id)),
      ...clientEmails
    ];
    return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [activeClient, clientEmails]);

  // Group events into future and past relative to current timestamp
  const { futureEvents, pastEvents } = useMemo(() => {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const nowStr = new Date(Date.now() - tzOffset).toISOString().replace("T", " ").substring(0, 16);
    
    const future = activeClientTimeline
      .filter(e => e.timestamp > nowStr)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)); // ascending: closest future event at the bottom
      
    const past = activeClientTimeline
      .filter(e => e.timestamp <= nowStr)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // descending: most recent past event at the top
      
    return { futureEvents: future, pastEvents: past };
  }, [activeClient, activeClientTimeline]);

  // --- CLIENT DETAIL VIEW FORM STATE HOOKS ---
  const [profileName, setProfileName] = useState("");
  const [profileStreet, setProfileStreet] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profilePostalCode, setProfilePostalCode] = useState("");
  const [profileCountry, setProfileCountry] = useState("Slovakia");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileType, setProfileType] = useState<"person" | "business" | "partner">("person");
  const [profileOwner, setProfileOwner] = useState("");
  const [profileCompanyId, setProfileCompanyId] = useState("");
  const [profileTaxId, setProfileTaxId] = useState("");
  const [profileVatId, setProfileVatId] = useState("");
  const [profileContactPerson, setProfileContactPerson] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileEstablishmentDate, setProfileEstablishmentDate] = useState("");
  const [profileLegalForm, setProfileLegalForm] = useState("");
  const [profileSkNace, setProfileSkNace] = useState("");
  const [profileOrganizationSize, setProfileOrganizationSize] = useState("");
  const [profileOwnershipType, setProfileOwnershipType] = useState("");
  const [profileDataSource, setProfileDataSource] = useState("");
  const [profileDissolutionDate, setProfileDissolutionDate] = useState("");
  const [profileRegion, setProfileRegion] = useState("");
  const [profileDistrict, setProfileDistrict] = useState("");
  const [profileCategories, setProfileCategories] = useState<string[]>([]);

  // --- EVENT TIMELINE LOGGING STATES ---
  const [logType, setLogType] = useState<"phone" | "email" | "note" | "offer" | "appointment" | null>(null);
  const [logContent, setLogContent] = useState("");
  const [logAmount, setLogAmount] = useState("");
  const [logTime, setLogTime] = useState("");
  const [logFileName, setLogFileName] = useState("");
  const [logFileSize, setLogFileSize] = useState("");
  const [logFileType, setLogFileType] = useState<"offer" | "contract" | "invoice">("offer");
  
  // Explicit Event Date/Time
  const [logDate, setLogDate] = useState(() => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split("T")[0];
  });
  const [logTimeOfEvent, setLogTimeOfEvent] = useState(() => {
    const d = new Date();
    return d.toTimeString().substring(0, 5);
  });

  // --- DETAIL TABS & DOCUMENT UPLOADER STATE ---
  const [activeDetailTab, setActiveDetailTab] = useState<"timeline" | "files" | "leads" | "financial_status">("timeline");
  const [isAnalyzingFinancial, setIsAnalyzingFinancial] = useState(false);

  const handleDownloadStatement = async (statementId: string, client: any) => {
    if (!client) return;
    
    // Switch to financial status tab to show loading state
    setActiveDetailTab("financial_status");
    setIsAnalyzingFinancial(true);
    
    try {
      const res = await fetchWithTimeout("/api/summarize_financial.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statementId: String(statementId),
          systemLanguage
        })
      });
      
      if (!res.ok) {
        throw new Error("Financial analysis failed");
      }
      
      const result = await res.json();
      if (result.success && result.summary) {
        setLeads(prev => prev.map(lead => {
          if (lead.name.trim().toLowerCase() === client.name.trim().toLowerCase()) {
            return {
              ...lead,
              financialSummary: result.summary
            };
          }
          return lead;
        }));
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Financial analysis successfully generated!", "Finančná analýza bola úspešne vygenerovaná!", "A pénzügyi elemzés sikeresen elkészült!"));
        }
      } else {
        throw new Error(result.message || "Failed to generate summary");
      }
    } catch (e: any) {
      console.error(e);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Failed to generate financial analysis.", "Nepodarilo sa vygenerovať analýzu.", "Nem sikerült létrehozni a pénzügyi elemzést."));
      }
    } finally {
      setIsAnalyzingFinancial(false);
    }
  };
  const handleCreateFinancialReport = async () => {
    if (!activeClient || !activeClient.companyId) return;
    
    setIsAnalyzingFinancial(true);
    
    try {
      const res = await fetchWithTimeout("/api/generate_report.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: String(activeClient.companyId),
          systemLanguage
        })
      });
      
      if (!res.ok) {
        throw new Error("Financial report generation failed");
      }
      
      const result = await res.json();
      if (result.success && result.report) {
        setLeads(prev => prev.map(lead => {
          if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
            return {
              ...lead,
              financialSummary: result.report
            };
          }
          return lead;
        }));
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Financial report successfully generated!", "Finančný report bol úspešne vygenerovaný!", "A pénzügyi jelentés sikeresen elkészült!"));
        }
      } else {
        throw new Error(result.message || "Failed to generate report");
      }
    } catch (e: any) {
      console.error(e);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Failed to generate financial report.", "Nepodarilo sa vygenerovať finančný report.", "Nem sikerült létrehozni a pénzügyi jelentést."));
      }
    } finally {
      setIsAnalyzingFinancial(false);
    }
  };
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSize, setUploadFileSize] = useState("");
  const [uploadFileType, setUploadFileType] = useState<"offer" | "contract" | "invoice">("offer");
  const [uploadDescription, setUploadDescription] = useState("");

  // Recording & transcription states for note logger
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused" | "stopped" | "none">("none");
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadedAudioFile, setUploadedAudioFile] = useState<string | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [recordingMeetingId, setRecordingMeetingId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  
  // Audio Context and Visualizer states for note logger
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array | null>(null);
  
  // Custom Audio Player states for note logger
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  
  // Blocks state for note logger
  const [noteBlocks, setNoteBlocks] = useState<EditorBlock[]>([
    { id: "b-1", type: "paragraph", content: "" }
  ]);

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [localSummary, setLocalSummary] = useState<string | undefined>(undefined);

  // Filter tasks belonging to the active client
  const activeClientTasks = useMemo(() => {
    if (!activeClient) return [];
    const clientLeadIds = (activeClient.associatedLeads || []).map((l: any) => l.id);
    return _tasks.filter(t => t.relatedLeadId && clientLeadIds.includes(t.relatedLeadId));
  }, [_tasks, activeClient]);

  // Compute active client data fingerprint to monitor changes
  const activeClientFingerprint = useMemo(() => {
    if (!activeClient) return "";
    const tasksStr = activeClientTasks.map(t => `${t.id}-${t.status}-${t.title}-${t.deadline}`).join('|');
    const timelineStr = (activeClient.timeline || []).map(e => `${e.id}-${e.type}-${e.timestamp}-${e.content || ''}-${e.amount || 0}`).join('|');
    const detailsStr = `${activeClient.name}-${activeClient.city || ''}-${activeClient.clientType}-${activeClient.totalValue}-${activeClient.owner}-${activeClient.email || ''}-${activeClient.phone || ''}-${(activeClient.categories || []).join(',')}`;
    return `${detailsStr}#${timelineStr}#${activeClient.leadsCount}#${tasksStr}`;
  }, [activeClient, activeClientTasks]);

  const isOpenAiConfigured = !!(integrationsConfig?.openAiKey && integrationsConfig.openAiKey.trim() !== "");

  // Recording timer
  useEffect(() => {
    if (recordingState !== "recording") return;
    const interval = setInterval(() => {
      setRecordDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [recordingState]);

  // Visualizer height updater
  useEffect(() => {
    if (recordingState !== "recording" || !analyser || !dataArray) {
      return;
    }

    let animationFrameId: number;
    const update = () => {
      analyser.getByteFrequencyData(dataArray as any);
      animationFrameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [recordingState, analyser, dataArray]);

  const startVisualizer = (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const ana = ctx.createAnalyser();
      ana.fftSize = 64;
      src.connect(ana);
      const bufferLength = ana.frequencyBinCount;
      const data = new Uint8Array(bufferLength);
      setAudioContext(ctx);
      setAnalyser(ana);
      setDataArray(data);
    } catch (e) {
      console.warn("Visualizer init failed", e);
    }
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported by this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophoneStream(stream);

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsUploadingAudio(true);
        const ext = mimeType.split("/")[1] || "webm";
        const blob = new Blob(chunks, { type: mimeType });
        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);

        const tempId = `note_event_${Date.now()}`;
        setRecordingMeetingId(tempId);
        const formData = new FormData();
        formData.append("audio", blob, `meeting_${tempId}.${ext}`);
        formData.append("meetingId", tempId);

        try {
          const res = await fetch("/api/upload_audio.php", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setUploadedAudioFile(data.filePath);
            if (typeof (window as any).showToast === "function") {
              (window as any).showToast(t("Audio recording saved successfully!", "Hlasová nahrávka bola úspešne uložená!", "A hangfelvétel sikeresen mentve!"));
            }
          } else {
            throw new Error(data.message || "Upload failed");
          }
        } catch (err: any) {
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast(t("Failed to upload audio to server:", "Nepodarilo sa nahrať zvuk na server:", "Nem sikerült feltölteni a hangot a szerverre:") + " " + err.message, "error");
          }
        } finally {
          setIsUploadingAudio(false);
        }
      };

      setMediaRecorder(recorder);
      setRecordDuration(0);
      recorder.start();
      setRecordingState("recording");
      startVisualizer(stream);
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Microphone access denied:", "Prístup k mikrofónu bol zamietnutý:", "A mikrofonhoz való hozzáférés megtagadva:") + " " + err.message, "error");
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      setRecordingState("paused");
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      setMicrophoneStream(null);
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      setAudioContext(null);
    }
    setRecordingState("stopped");
  };

  const removeAudioFile = () => {
    if (confirm(t("Are you sure you want to remove this recording?", "Naozaj chcete odstrániť túto nahrávku?", "Biztosan eltávolítja ezt a felvételt?"))) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setAudioUrl(null);
      setUploadedAudioFile(null);
      setRecordingState("none");
    }
  };

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleTranscribeMeeting = async () => {
    setIsTranscribing(true);
    const serializeBlocksToPlainText = (blocks: EditorBlock[]): string => {
      return blocks.map(b => b.content.replace(/<[^>]*>/g, "")).join("\n");
    };
    const manualNotesText = serializeBlocksToPlainText(noteBlocks);

    const activeMeetingId = recordingMeetingId || `note_event_${Date.now()}`;

    try {
      const res = await fetchWithTimeout("/api/transcribe_meeting.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: activeMeetingId,
          manualNotes: manualNotesText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.transcription) {
          // Append transcription to block editor
          setNoteBlocks(prev => [
            ...prev,
            { id: `b-trans-${Date.now()}`, type: "paragraph", content: `<strong>${t("Transcription:", "Prepis:", "Átirat:")}</strong> ${data.transcription}` }
          ]);
          setEditorKey(prev => prev + 1);
        }
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("AI Transcription completed successfully!", "AI prepis bol úspešne dokončený!", "Az AI átirat sikeresen elkészült!"));
        }
      } else {
        throw new Error(data.message || "Transcription failed");
      }
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Transcription failed:", "Prepis zlyhal:", "Az átírás sikertelen:") + " " + err.message, "error");
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  // Sync local summary state with activeClient's stored summary
  useEffect(() => {
    setLocalSummary(activeClient?.aiSummary);
  }, [activeClient?.name, activeClient?.aiSummary]);

  // Auto-regenerate summary if fingerprint changes
  useEffect(() => {
    if (!activeClient || !activeClientFingerprint || !isOpenAiConfigured) return;
    if (activeClient.aiSummaryFingerprint === activeClientFingerprint) return;
    if (isGeneratingSummary) return;

    const generateSummary = async () => {
      setIsGeneratingSummary(true);
      try {
        const clientTimeline = activeClient.timeline || [];
        const priceOffers = clientTimeline.filter(e => e.type === "offer");
        const otherData = {
          city: activeClient.city || "",
          clientType: activeClient.clientType,
          owner: activeClient.owner,
          categories: activeClient.categories || [],
          totalValue: activeClient.totalValue,
          email: activeClient.email || "",
          phone: activeClient.phone || "",
        };

        const response = await fetchWithTimeout("/api/summarize_client_lead.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: activeClient.name,
            type: "client",
            tasks: activeClientTasks,
            events: clientTimeline,
            priceOffers: priceOffers,
            otherData: otherData,
            systemLanguage: systemLanguage
          })
        });

        if (!response.ok) {
          throw new Error("Failed to generate AI summary");
        }

        const data = await response.json();
        if (data.success && data.summary) {
          setLocalSummary(data.summary);
          setLeads(prev => prev.map(l => {
            if (l.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
              return {
                ...l,
                aiSummary: data.summary,
                aiSummaryFingerprint: activeClientFingerprint
              };
            }
            return l;
          }));
        }
      } catch (err) {
        console.error("AI summary generation error:", err);
      } finally {
        setIsGeneratingSummary(false);
      }
    };

    const timer = setTimeout(() => {
      generateSummary();
    }, 1200);

    return () => clearTimeout(timer);
  }, [activeClientFingerprint, activeClient, isOpenAiConfigured, setLeads, systemLanguage]);

  const renderCompactAudioRecorder = () => {
    return (
      <div className="flex items-center justify-between gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm text-xs select-none">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex h-2.5 w-2.5 shrink-0">
            {recordingState === "recording" && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            )}
            <span className={cn(
              "relative inline-flex rounded-full h-2.5 w-2.5",
              recordingState === "recording" ? "bg-rose-600" :
              recordingState === "paused" ? "bg-amber-500" :
              recordingState === "stopped" ? "bg-emerald-500" : "bg-slate-350"
            )}></span>
          </div>
          
          <div className="text-left truncate">
            <span className="font-extrabold uppercase text-[9px] text-slate-700">
              {recordingState === "none" && (systemLanguage === "sk" ? "Hlasový záznam" : systemLanguage === "hu" ? "Hangrögzítés" : "Voice Recording")}
              {recordingState === "recording" && `${formatDuration(recordDuration)}`}
              {recordingState === "paused" && (systemLanguage === "sk" ? "Pozastavené" : systemLanguage === "hu" ? "Megállítva" : "Paused")}
              {recordingState === "stopped" && (systemLanguage === "sk" ? "Nahrávka" : systemLanguage === "hu" ? "Felvétel" : "Recording")}
            </span>
          </div>
        </div>

        {/* Small Audio Player */}
        {recordingState === "stopped" && audioUrl && (
          <div className="flex items-center gap-2 flex-1 max-w-[150px]">
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={() => {
                if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
              }}
              onDurationChange={() => {
                if (audioRef.current) setAudioDuration(audioRef.current.duration);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (!audioRef.current) return;
                if (isPlaying) {
                  audioRef.current.pause();
                } else {
                  audioRef.current.play();
                }
              }}
              className="p-1 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="h-3 w-3 fill-white" /> : <Play className="h-3 w-3 fill-white" />}
            </button>
            <span className="text-[8px] font-black text-slate-400">
              {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(audioDuration))}
            </span>
            <button
              type="button"
              onClick={removeAudioFile}
              className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
              title={t("Delete audio", "Odstrániť nahrávku", "Hangfelvétel törlése")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {recordingState === "none" && (
            <button
              type="button"
              onClick={startRecording}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <Mic className="h-3 w-3 fill-white" />
              <span>{systemLanguage === "sk" ? "Nahrať" : systemLanguage === "hu" ? "Felvétel" : "Record"}</span>
            </button>
          )}

          {recordingState === "recording" && (
            <>
              <button
                type="button"
                onClick={pauseRecording}
                className="p-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer"
                title={t("Pause", "Pozastaviť", "Szünet")}
              >
                <Pause className="h-3 w-3 fill-white" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Square className="h-3 w-3 fill-white" />
                <span>{t("Stop", "Zastaviť", "Leállítás")}</span>
              </button>
            </>
          )}

          {recordingState === "paused" && (
            <>
              <button
                type="button"
                onClick={resumeRecording}
                className="p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer"
                title={t("Resume", "Pokračovať", "Folytatás")}
              >
                <Play className="h-3 w-3 fill-white" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Square className="h-3 w-3 fill-white" />
                <span>{t("Stop", "Zastaviť", "Leállítás")}</span>
              </button>
            </>
          )}

          {recordingState === "stopped" && isOpenAiConfigured && (
            <button
              type="button"
              disabled={isTranscribing || isUploadingAudio || !uploadedAudioFile}
              onClick={handleTranscribeMeeting}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5"
            >
              {isTranscribing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span>{systemLanguage === "sk" ? "Prepísať" : systemLanguage === "hu" ? "Átír" : "Transcribe"}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // --- TIMELINE EMAIL VIEW DRAWER STATE ---
  const [selectedTimelineEmail, setSelectedTimelineEmail] = useState<any | null>(null);
  const [isClosingEmailDetail, setIsClosingEmailDetail] = useState(false);

  const closeEmailDetailSlideout = () => {
    setIsClosingEmailDetail(true);
    setTimeout(() => {
      setSelectedTimelineEmail(null);
      setIsClosingEmailDetail(false);
    }, 350);
  };

  const [isLoadingEmailDetail, setIsLoadingEmailDetail] = useState(false);
  const [timelineEmailDetailBody, setTimelineEmailDetailBody] = useState<any | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedLogFile, setSelectedLogFile] = useState<File | null>(null);

  const handleTimelineEmailClick = async (event: any) => {
    if (event.type !== "email") return;
    
    setSelectedTimelineEmail(event);
    setIsLoadingEmailDetail(true);
    setTimelineEmailDetailBody(null);
    
    try {
      const parts = event.id.split("-");
      const uid = parts[parts.length - 1];
      const folder = event.isOutgoing ? "Sent" : "INBOX";
      
      const currentUserStr = sessionStorage.getItem("crm_current_user_rbac");
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      
      const res = await fetch(
        `/api/mail_broker.php?action=get_email_detail&folder=${folder}&uid=${uid}`,
        { headers: { "X-User-Email": currentUser?.email || "" } }
      );
      const data = await res.json();
      if (data.success && data.email) {
        setTimelineEmailDetailBody(data.email);
      } else {
        setTimelineEmailDetailBody({
          uid,
          html: "",
          text: event.content || t("No message content.", "Správa nemá obsah.", "Az üzenetnek nincs tartalma.")
        });
      }
    } catch (e) {
      console.error("Failed to load email details", e);
      setTimelineEmailDetailBody({
        uid: event.id,
        html: "",
        text: event.content || t("No message content.", "Správa nemá obsah.", "Az üzenetnek nincs tartalma.")
      });
    } finally {
      setIsLoadingEmailDetail(false);
    }
  };

  // Reference to track the name of the last active client loaded into the editor
  const lastActiveClientNameRef = useRef<string | null>(null);

  // Sync form states with activeClient properties when deep-route is loaded
  useEffect(() => {
    if (activeClient) {
      const clientNameChanged = lastActiveClientNameRef.current !== activeClient.name;
      
      // Only sync form states if we transitioned to a different client, or if we are not currently editing
      if (clientNameChanged || !isEditingProfile) {
        setProfileName(activeClient.name);
        setProfileStreet(activeClient.street);
        setProfileCity(activeClient.city);
        setProfilePostalCode(activeClient.postalCode);
        setProfileCountry(activeClient.country);
        setProfilePhone(activeClient.phone);
        setProfileEmail(activeClient.email);
        setProfileType(activeClient.clientType);
        setProfileOwner(activeClient.owner);
        setProfileCompanyId(activeClient.companyId);
        setProfileTaxId(activeClient.taxId);
        setProfileVatId(activeClient.vatId);
        if (activeClient.vatId) {
          if (activeClient.vatValidationResult && activeClient.vatValidationResult.valid) {
            setProfileVatStatus("valid");
            setProfileVatResult(activeClient.vatValidationResult);
          } else {
            validateVatCode(activeClient.vatId, true);
          }
        } else {
          setProfileVatStatus("idle");
          setProfileVatResult(null);
        }
        setProfileContactPerson(activeClient.contactPerson);
        setProfileWebsite(activeClient.website);
        setProfileEstablishmentDate(activeClient.establishmentDate || "");
        setProfileLegalForm(activeClient.legalForm || "");
        setProfileSkNace(activeClient.skNace || "");
        setProfileOrganizationSize(activeClient.organizationSize || "");
        setProfileOwnershipType(activeClient.ownershipType || "");
        setProfileDataSource(activeClient.dataSource || "");
        setProfileDissolutionDate(activeClient.dissolutionDate || "");
        setProfileRegion(activeClient.region || "");
        setProfileDistrict(activeClient.district || "");
        setProfileCategories(activeClient.categories || []);
        
        if (clientNameChanged) {
          setIsEditingProfile(false); // Reset to read-only by default on transition to a new client
        }
        
        lastActiveClientNameRef.current = activeClient.name;
      }
    } else {
      lastActiveClientNameRef.current = null;
    }
  }, [activeClient, isEditingProfile]);

  // --- PERSIST DUAL-PANEL CLIENT DETAILS CHANGES ---
  const handleUpdateClientProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient) return;
    if (!profileName.trim()) {
      (window as any).showToast(t("Client Name is strictly required!", "Meno klienta je striktne povinné!", "Az ügyfél neve feltétlenül kötelező!"));
      return;
    }

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        return {
          ...lead,
          name: profileName.trim(),
          city: profileCity.trim(),
          clientType: profileType,
          owner: profileOwner,
          phone: profilePhone.trim(),
          email: profileEmail.trim(),
          address: {
            street: profileStreet.trim(),
            city: profileCity.trim(),
            postalCode: profilePostalCode.trim(),
            country: profileCountry
          },
          companyId: profileType !== "person" ? profileCompanyId.trim() : undefined,
          taxId: profileType !== "person" ? profileTaxId.trim() : undefined,
          vatId: profileType !== "person" ? profileVatId.trim() : undefined,
          vatValidationResult: profileType !== "person" ? profileVatResult : null,
          contactPerson: profileType !== "person" ? profileContactPerson.trim() : undefined,
          website: profileType !== "person" ? profileWebsite.trim() : undefined,
          establishmentDate: profileType !== "person" ? profileEstablishmentDate.trim() : undefined,
          legalForm: profileType !== "person" ? profileLegalForm.trim() : undefined,
          skNace: profileType !== "person" ? profileSkNace.trim() : undefined,
          organizationSize: profileType !== "person" ? profileOrganizationSize.trim() : undefined,
          ownershipType: profileType !== "person" ? profileOwnershipType.trim() : undefined,
          dataSource: profileType !== "person" ? profileDataSource.trim() : undefined,
          dissolutionDate: profileType !== "person" ? profileDissolutionDate.trim() : undefined,
          region: profileType !== "person" ? profileRegion.trim() : undefined,
          district: profileType !== "person" ? profileDistrict.trim() : undefined,
          categories: profileCategories
        };
      }
      return lead;
    }));

    setIsEditingProfile(false); // Toggle back to read-only
    // Update dynamic URL to reflect new client profile name
    window.location.hash = `client-${encodeURIComponent(profileName.trim())}`;
    (window as any).showToast(t("Client profile parameters successfully updated!", "Parametre profilu klienta boli úspešne aktualizované!", "Az ügyfélprofil paraméterei sikeresen frissültek!"));
  };

  // --- LOG A NEW EVENT INTO TIMELINE ---
  const handleAddTimelineEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !logType) return;

    let contentString = logContent.trim();
    let titleString = "";

    const timestampStr = `${logDate} ${logTimeOfEvent}`;

    if (logType === "phone") {
      titleString = t("Phone Call Logged", "Zaznamenaný telefonát", "Rögzített telefonhívás");
      if (!contentString) contentString = t("Completed voice call with customer regarding updates.", "Uskutočnený telefonát so zákazníkom ohľadom noviniek.", "Telefonhívás az ügyféllel a fejleményekről.");
    } else if (logType === "email") {
      titleString = t("Email Logged", "Zaznamenaný e-mail", "Rögzített e-mail");
      if (!contentString) contentString = t("Outbound email correspondence successfully transmitted.", "Odchádzajúca e-mailová komunikácia bola úspešne odoslaná.", "A kimenő e-mail sikeresen elküldve.");
    } else if (logType === "note") {
      titleString = t("Internal Note Added", "Pridaná interná poznámka", "Belső jegyzet hozzáadva");
      // Note type is rich: saved as JSON stringified blocks
      const hasContent = noteBlocks.some(b => b.content.trim().length > 0);
      if (!hasContent && !uploadedAudioFile) {
        (window as any).showToast(t("Please write down some details or record audio for the note!", "Napíšte prosím nejaké detaily alebo nahrajte zvuk k poznámke!", "Kérjük, írjon le néhány részletet, vagy rögzítsen hangot a jegyzethez!"));
        return;
      }
      contentString = JSON.stringify(noteBlocks);
    } else if (logType === "appointment") {
      titleString = t("Meeting Scheduled", "Naplánované stretnutie", "Találkozó ütemezve");
      if (!logTime.trim()) {
        (window as any).showToast(t("Please select appointment time!", "Vyberte prosím čas stretnutia!", "Kérjük, válassza ki a találkozó időpontját!"));
        return;
      }
      if (!contentString) contentString = `${t("Client appointment set for", "Stretnutie s klientom naplánované na", "Ügyféltalálkozó időpontja")} ${logTime.trim()}`;
    } else if (logType === "offer") {
      titleString = t("Formal Offer Submitted", "Odoslaná oficiálna ponuka", "Hivatalos ajánlat elküldve");
      const amt = parseFloat(logAmount);
      if (isNaN(amt) || amt <= 0) {
        (window as any).showToast(t("Offer amount must be a positive number!", "Suma ponuky musí byť kladné číslo!", "Az ajánlat összegének pozitív számnak kell lennie!"));
        return;
      }
      titleString = `Commercial Proposal Sent (${money(amt)})`;
      if (!contentString) contentString = `Submitted commercial proposal of ${money(amt)} to client.`;
    }

    const eventId = `ev-${Date.now()}`;
    let uploadedFilePath: string | undefined;

    // Upload file if selected
    if (logType === "offer" && selectedLogFile) {
      const formData = new FormData();
      formData.append("file", selectedLogFile);
      formData.append("eventId", eventId);

      try {
        const uploadRes = await fetch("/upload.php", {
          method: "POST",
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          (window as any).showToast(t("File upload failed:", "Nahrávanie súboru zlyhalo:", "A fájl feltöltése sikertelen:") + " " + (uploadData.error || ""));
          return;
        }
        // Store the actual server path so the timeline link never depends on the event id
        uploadedFilePath = uploadData.filePath;
      } catch (err) {
        console.error("Error uploading file", err);
        (window as any).showToast(t("Error uploading file to server.", "Chyba pri nahrávaní súboru na server.", "Hiba a fájl szerverre való feltöltése közben."));
        return;
      }
    }

    const newEvent: TimelineEvent = {
      id: eventId,
      type: logType,
      timestamp: timestampStr,
      title: titleString,
      content: contentString
    };

    const offerAmt = parseFloat(logAmount);

    if (logType === "offer") {
      if (!isNaN(offerAmt)) newEvent.amount = offerAmt;
      if (logFileName) {
        newEvent.fileName = logFileName;
        newEvent.fileSize = logFileSize;
        newEvent.fileType = logFileType;
        if (uploadedFilePath) newEvent.filePath = uploadedFilePath;
      }
    } else if (logType === "appointment") {
      newEvent.extraTime = logTime;
    } else if (logType === "note") {
      if (uploadedAudioFile) newEvent.audioFile = uploadedAudioFile;
      if ((window as any)._latestTranscription) {
        newEvent.transcription = (window as any)._latestTranscription;
      }
    }

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        const currentTimeline = lead.timeline || [];
        const uniqueEventId = `${eventId}-${lead.id}`;
        const updatedLead = {
          ...lead,
          timeline: [{ ...newEvent, id: uniqueEventId }, ...currentTimeline]
        };
        if (logType === "offer" && !isNaN(offerAmt)) {
          updatedLead.value = offerAmt;
        }
        return updatedLead;
      }
      return lead;
    }));

    // Auto-create PM task if the event is in the future
    const eventDateTime = new Date(`${logDate}T${logTimeOfEvent}:00`);
    if (eventDateTime.getTime() > Date.now()) {
      let deadlineVal = logDate;

      // Find original lead from activeClient
      const matchedLead = leads.find(l => l.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase());
      const leadOwner = matchedLead?.owner || currentUser?.name || projectManagers[0] || "";
      const leadId = matchedLead?.id;

      const taskTitle = systemLanguage === "sk" 
        ? `Budúca udalosť: ${activeClient.name} (${titleString})`
        : systemLanguage === "hu"
          ? `Jövőbeli esemény: ${activeClient.name} (${titleString})`
          : `Future Event: ${activeClient.name} (${titleString})`;

      const autoPMTask: Task = {
        id: `task-${Date.now()}`,
        title: taskTitle,
        description: logType === "note"
          ? t("Meeting Note Added", "Pridaná poznámka zo stretnutia", "Találkozó jegyzet hozzáadva")
          : (contentString || `${t("Scheduled for", "Naplánované na", "Ütemezve erre")} ${logDate} ${logTimeOfEvent}`),
        status: taskStates[0] || "todo",
        priority: "medium",
        deadline: deadlineVal,
        owner: leadOwner,
        createdBy: currentUser?.name || "",
        assignedUsers: [leadOwner],
        relatedLeadId: leadId,
        isLocking: false
      };

      setTasks(prev => [autoPMTask, ...prev]);
    }

    setLogContent("");
    setLogAmount("");
    setLogTime("");
    setLogFileName("");
    setLogFileSize("");
    setLogFileType("offer");
    setSelectedLogFile(null);
    setLogType(null); // Reset selector so fields close smoothly

    // Reset audio and note editor states
    setNoteBlocks([{ id: "b-1", type: "paragraph", content: "" }]);
    setAudioUrl(null);
    setUploadedAudioFile(null);
    setRecordingState("none");
    setRecordingMeetingId(null);
    if ((window as any)._latestTranscription) delete (window as any)._latestTranscription;
    
    // Reset date/time to now
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    setLogDate((new Date(Date.now() - tzOffset)).toISOString().split("T")[0]);
    setLogTimeOfEvent(new Date().toTimeString().substring(0, 5));
    (window as any).showToast(t("Event logged successfully!", "Udalosť bola úspešne zaznamenaná!", "Az esemény sikeresen rögzítve!"));
  };

  const handleAttachFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !uploadFileName) return;

    const eventId = `ev-${Date.now()}`;
    let uploadedFilePath: string | undefined;

    // Upload file if selected
    if (selectedUploadFile) {
      const formData = new FormData();
      formData.append("file", selectedUploadFile);
      formData.append("eventId", eventId);

      try {
        const uploadRes = await fetch("/upload.php", {
          method: "POST",
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          (window as any).showToast(t("File upload failed:", "Nahrávanie súboru zlyhalo:", "A fájl feltöltése sikertelen:") + " " + (uploadData.error || ""));
          return;
        }
        uploadedFilePath = uploadData.filePath;
      } catch (err) {
        console.error("Error uploading file", err);
        (window as any).showToast(t("Error uploading file to server.", "Chyba pri nahrávaní súboru na server.", "Hiba a fájl szerverre való feltöltése közben."));
        return;
      }
    }

    const newEvent: TimelineEvent = {
      id: eventId,
      type: "offer",
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
      title: `Document Attached: ${uploadFileName}`,
      content: uploadDescription.trim() || `Attached document for category ${uploadFileType}.`,
      fileName: uploadFileName,
      fileSize: uploadFileSize,
      fileType: uploadFileType,
      filePath: uploadedFilePath,
    };

    setLeads(prev => prev.map(lead => {
      if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
        const currentTimeline = lead.timeline || [];
        const uniqueEventId = `${eventId}-${lead.id}`;
        return {
          ...lead,
          timeline: [{ ...newEvent, id: uniqueEventId }, ...currentTimeline]
        };
      }
      return lead;
    }));

    setUploadFileName("");
    setUploadFileSize("");
    setUploadDescription("");
    setSelectedUploadFile(null);
    alert(t("Document attached successfully!", "Dokument bol úspešne pripojený!", "A dokumentum sikeresen csatolva!"));
  };

  // Extract unique cities dynamically from the active customer registry
  const uniqueCities = useMemo(() => {
    const cities = new Set(clientProfiles.map(c => c.city).filter(Boolean));
    return Array.from(cities).sort();
  }, [clientProfiles]);

  // Filter clients list
  const processedClients = useMemo(() => {
    return clientProfiles
      .filter(client => {
        const matchesSearch = 
          searchQuery === "" ||
          client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.owner.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesType = selectedType === "all" || client.clientType === selectedType;

        const matchesCity = filterCity === "" || client.city.toLowerCase() === filterCity.toLowerCase();
        
        const matchesPM = filterPM === "" || client.owner.toLowerCase() === filterPM.toLowerCase();

        return matchesSearch && matchesType && matchesCity && matchesPM;
      });
  }, [clientProfiles, searchQuery, selectedType, filterCity, filterPM]);

  // Paginated subset of clients
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * 50;
    return processedClients.slice(startIndex, startIndex + 50);
  }, [processedClients, currentPage]);



  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Preset European countries dropdown
  const europeanCountries = [
    "Slovakia", "Hungary", "Austria", "Czechia", "Poland",
    "Germany", "France", "Italy", "Spain", "United Kingdom", 
    "Netherlands", "Belgium", "Switzerland", "Czech Republic",
    "Bulgaria", "Croatia", "Cyprus", "Denmark", "Estonia",
    "Finland", "Greece", "Ireland", "Latvia", "Lithuania",
    "Luxembourg", "Malta", "Portugal", "Romania", "Slovenia",
    "Sweden"
  ];

  // Helper to color-code events
  const getEventColors = (type: string) => {
    switch (type) {
      case "phone":
        return {
          dotBg: "bg-blue-600 border-blue-700 text-white shadow-md shadow-blue-500/20",
          cardBorder: "border-l-4 border-l-blue-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-blue-50 text-blue-700 border-blue-200"
        };
      case "email":
        return {
          dotBg: "bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-500/20",
          cardBorder: "border-l-4 border-l-indigo-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200"
        };
      case "note":
        return {
          dotBg: "bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-500/20",
          cardBorder: "border-l-4 border-l-amber-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-amber-50 text-amber-700 border-amber-200"
        };
      case "offer":
        return {
          dotBg: "bg-emerald-600 border-emerald-700 text-white shadow-md shadow-emerald-500/20",
          cardBorder: "border-l-4 border-l-emerald-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200"
        };
      case "appointment":
        return {
          dotBg: "bg-rose-600 border-rose-700 text-white shadow-md shadow-rose-500/20",
          cardBorder: "border-l-4 border-l-rose-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-rose-50 text-rose-700 border-rose-200"
        };
      default:
        return {
          dotBg: "bg-slate-600 border-slate-700 text-white shadow-md",
          cardBorder: "border-l-4 border-l-slate-500 border-y-slate-200 border-r-slate-200",
          badgeBg: "bg-slate-50 text-slate-750 border-slate-200"
        };
    }
  };

  // Helper to render lucide icon for event
  const renderEventIcon = (type: string) => {
    switch (type) {
      case "phone": return <Phone className="h-3 w-3 stroke-[2.5]" />;
      case "email": return <Mail className="h-3 w-3 stroke-[2.5]" />;
      case "note": return <FileText className="h-3 w-3 stroke-[2.5]" />;
      case "offer": return <Euro className="h-3 w-3 stroke-[2.5]" />;
      case "appointment": return <Calendar className="h-3 w-3 stroke-[2.5]" />;
      default: return <Clock className="h-3 w-3 stroke-[2.5]" />;
    }
  };

  // ----------------------------------------------------
  // --- SUB-RENDER ROUTE: DEDICATED CLIENT DETAIL VIEW ---
  // ----------------------------------------------------
  if (initialSelectedClient) {
    if (!activeClient) {
      return (
        <div className="p-8 glass-panel rounded-[28px] border-2 border-red-400 bg-white shadow-glass text-center space-y-4">
          <div className="text-4xl text-rose-600 animate-bounce">⚠️</div>
          <h2 className="text-xl font-heading font-black text-slate-900 uppercase tracking-wide">{t("Client Profile Not Found", "Profil klienta sa nenašiel", "Az ügyfélprofil nem található")}</h2>
          <p className="text-xs text-slate-600 font-semibold">{t(`The profile name '${initialSelectedClient}' could not be resolved in the active database.`, `Názov profilu '${initialSelectedClient}' sa nepodarilo nájsť v aktívnej databáze.`, `A(z) '${initialSelectedClient}' profilnév nem feloldható az aktív adatbázisban.`)}</p>
          <button
            onClick={() => { window.location.hash = "clients"; }}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md"
          >
            {t("Back to Clients List", "Späť na zoznam klientov", "Vissza az ügyféllistához")}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
        {/* Back header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { window.location.hash = "clients"; }}
            className="px-4.5 py-3 rounded-2xl bg-white border-2 border-slate-300 text-slate-700 hover:text-slate-955 hover:border-slate-850 transition-all text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-sm"
          >
            <ArrowLeft className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.back_to_clients")}
          </button>

          <div className="flex items-center gap-3">
            {/* AI Summary Purple Card */}
            {(!isOpenAiConfigured && !localSummary) ? (
              <div className="flex items-center gap-2.5 bg-purple-50/50 border border-purple-250 p-2.5 px-3.5 rounded-2xl max-w-md text-xs font-bold text-purple-800 shadow-sm">
                <Brain className="h-5 w-5 text-purple-400 shrink-0" />
                <span className="text-[10px] text-purple-650 italic">
                  {systemLanguage === "sk" ? "AI zhrnutie nie je k dispozícii. Nastavte OpenAI kľúč v nastaveniach." : systemLanguage === "hu" ? "Az AI összefoglaló nem érhető el. Állítsa be az OpenAI kulcsot a beállításokban." : "AI summary unavailable. Configure OpenAI Key in settings."}
                </span>
              </div>
            ) : (localSummary || isGeneratingSummary) ? (
              <div className="flex items-center gap-2.5 bg-purple-50 border-2 border-purple-200 p-2.5 px-3.5 rounded-2xl max-w-xl text-xs font-bold text-purple-900 shadow-sm hover:shadow-md transition-all animate-fade-in">
                <Brain className={`h-5 w-5 text-purple-600 shrink-0 ${isGeneratingSummary ? 'animate-pulse' : ''}`} />
                <div>
                  {isGeneratingSummary && !localSummary ? (
                    <span className="text-[10px] text-purple-650 italic animate-pulse flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                      {systemLanguage === "sk" ? "Generuje sa AI zhrnutie..." : systemLanguage === "hu" ? "AI összefoglaló generálása..." : "Generating AI summary..."}
                    </span>
                  ) : (
                    <p className="leading-relaxed text-[11px] font-semibold text-left">
                      {localSummary}
                      {isGeneratingSummary && (
                        <span className="ml-1 text-[9px] text-purple-500 animate-pulse">
                          ({systemLanguage === "sk" ? "Aktualizuje sa..." : systemLanguage === "hu" ? "Frissítés..." : "Updating..."})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <span className="text-xs font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 border-2 border-emerald-300 px-4 py-2 rounded-2xl shadow-inner">
              {getTranslation(systemLanguage, "common.client_value")}: {money(activeClient.totalValue, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Master Dual-Panel Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL: Comprehensive Details Form */}
          <div className="lg:col-span-5 glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl space-y-6">
            <div className="border-b-2 border-slate-150 pb-4 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-black text-sm shadow-md">
                  {getInitials(profileName || activeClient.name)}
                </div>
                <div>
                  <h3 className="text-md font-heading font-black text-slate-900 uppercase tracking-tight">{getTranslation(systemLanguage, "profile.client_contact")}</h3>
                  <p className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wide mt-0.5">{getTranslation(systemLanguage, "profile.edit_desc")}</p>
                </div>
              </div>
              
              {/* Pencil Toggle edit button */}
              <button
                type="button"
                onClick={() => {
                  if (isEditingProfile) {
                    // Revert changes on toggle off
                    setProfileName(activeClient.name);
                    setProfileStreet(activeClient.street);
                    setProfileCity(activeClient.city);
                    setProfilePostalCode(activeClient.postalCode);
                    setProfileCountry(activeClient.country);
                    setProfilePhone(activeClient.phone);
                    setProfileEmail(activeClient.email);
                    setProfileType(activeClient.clientType);
                    setProfileOwner(activeClient.owner);
                    setProfileCompanyId(activeClient.companyId);
                    setProfileTaxId(activeClient.taxId);
                    setProfileVatId(activeClient.vatId);
                    if (activeClient.vatId) {
                      if (activeClient.vatValidationResult && activeClient.vatValidationResult.valid) {
                        setProfileVatStatus("valid");
                        setProfileVatResult(activeClient.vatValidationResult);
                      } else {
                        validateVatCode(activeClient.vatId, true);
                      }
                    } else {
                      setProfileVatStatus("idle");
                      setProfileVatResult(null);
                    }
                    setProfileContactPerson(activeClient.contactPerson);
                    setProfileWebsite(activeClient.website);
                    setProfileEstablishmentDate(activeClient.establishmentDate || "");
                    setProfileLegalForm(activeClient.legalForm || "");
                    setProfileSkNace(activeClient.skNace || "");
                    setProfileOrganizationSize(activeClient.organizationSize || "");
                    setProfileOwnershipType(activeClient.ownershipType || "");
                    setProfileDataSource(activeClient.dataSource || "");
                    setProfileDissolutionDate(activeClient.dissolutionDate || "");
                    setProfileRegion(activeClient.region || "");
                    setProfileDistrict(activeClient.district || "");
                  }
                  setIsEditingProfile(!isEditingProfile);
                }}
                className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all border-2 shadow-sm ${
                  isEditingProfile 
                    ? "bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100" 
                    : "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                }`}
                title={isEditingProfile ? t("Cancel editing", "Zrušiť úpravy", "Szerkesztés megszakítása") : t("Edit Profile details", "Upraviť údaje profilu", "Profiladatok szerkesztése")}
              >
                {isEditingProfile ? <X className="h-4.5 w-4.5 stroke-[2.5]" /> : <PencilLine className="h-4.5 w-4.5 stroke-[2.5]" />}
              </button>
            </div>

            <form onSubmit={handleUpdateClientProfile} className="space-y-4 text-xs font-bold">
              
              {/* Name & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 relative">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.client_name")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      readOnly={!isEditingProfile}
                      value={profileName}
                      onChange={handleProfileNameChange}
                      className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all pr-9 ${
                        isEditingProfile 
                          ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                          : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                      }`}
                    />
                    {isEditingProfile && isLoadingSuggestions && activeSuggestionInput === "profileName" && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      </div>
                    )}
                  </div>
                  {isEditingProfile && activeSuggestionInput === "profileName" && suggestions.length > 0 && (
                    <div 
                      ref={dropdownRef}
                      className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-[999]"
                    >
                      {suggestions.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          onClick={() => handleSelectSuggestion(item)}
                          className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 text-left cursor-pointer"
                        >
                          <div className="font-bold text-slate-800 text-[11px]">{stripHtml(item.entityName)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.entNumber && `IČO: ${item.entNumber}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.client_type")}</label>
                  {isEditingProfile ? (
                    <select
                      value={profileType}
                      onChange={(e) => setProfileType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-800"
                    >
                      <option value="person">{systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}</option>
                      <option value="business">{systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}</option>
                      <option value="partner">{systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}</option>
                    </select>
                  ) : (
                    <div className="pt-2 pl-0 text-slate-900 text-sm font-black uppercase tracking-wider cursor-default select-all">
                      {profileType === "business" && `🏢 ${systemLanguage === "sk" ? "Firma / Podnikanie" : systemLanguage === "hu" ? "Cég / Vállalkozás" : "Company / Business"}`}
                      {profileType === "partner" && `🤝 ${systemLanguage === "sk" ? "Obchodný partner" : systemLanguage === "hu" ? "Kereskedő partner" : "Dealer Partner"}`}
                      {profileType === "person" && `👤 ${systemLanguage === "sk" ? "Súkromná osoba" : systemLanguage === "hu" ? "Magánszemély" : "Private Person"}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-500" /> {getTranslation(systemLanguage, "profile.phone")}</label>
                  <input
                    type="text"
                    required
                    readOnly={!isEditingProfile}
                    placeholder={t("e.g. +421 905...", "napr. +421 905...", "pl. +421 905...")}
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingProfile 
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                        : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1"><Mail className="h-3 w-3 text-emerald-500" /> {getTranslation(systemLanguage, "profile.email")}</label>
                  <input
                    type="email"
                    required
                    readOnly={!isEditingProfile}
                    placeholder={t("e.g. client@email.com", "napr. client@email.com", "pl. client@email.com")}
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl focus:outline-none transition-all ${
                      isEditingProfile 
                        ? "bg-slate-50 border-2 border-slate-200 focus:bg-white focus:border-emerald-500 text-slate-800" 
                        : "bg-transparent border-0 pl-0 text-slate-900 text-sm font-black cursor-default select-all"
                    }`}
                  />
                </div>
              </div>

              {/* Address details */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-3">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "profile.address_details")}</span>
                
                <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border-2 border-slate-200">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.street")}</label>
                    <input
                      type="text"
                      readOnly={!isEditingProfile}
                      placeholder={isEditingProfile ? "e.g. Mlynské Nivy 42" : t("No Street Added", "Bez ulice", "Nincs utca megadva")}
                      value={profileStreet}
                      onChange={(e) => setProfileStreet(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                        isEditingProfile 
                          ? "bg-white border-2 border-slate-200 text-slate-800" 
                          : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.city")}</label>
                      <input
                        type="text"
                        readOnly={!isEditingProfile}
                        placeholder={isEditingProfile ? t("e.g. Bratislava", "napr. Bratislava", "pl. Pozsony") : ""}
                        value={profileCity}
                        onChange={(e) => setProfileCity(e.target.value)}
                        className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                          isEditingProfile 
                            ? "bg-white border-2 border-slate-200 text-slate-800" 
                            : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                        }`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.postal")}</label>
                      <input
                        type="text"
                        readOnly={!isEditingProfile}
                        placeholder={isEditingProfile ? t("e.g. 821 09", "napr. 821 09", "pl. 821 09") : ""}
                        value={profilePostalCode}
                        onChange={(e) => setProfilePostalCode(e.target.value)}
                        className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                          isEditingProfile 
                            ? "bg-white border-2 border-slate-200 text-slate-800" 
                            : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.country")}</label>
                    {isEditingProfile ? (
                      <select
                        value={profileCountry}
                        onChange={(e) => setProfileCountry(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-white border-2 border-slate-200 focus:outline-none text-slate-800"
                      >
                        {europeanCountries.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="pl-0 text-slate-900 font-black cursor-default select-all">
                        🇪🇺 {profileCountry}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Corporate Registries section */}
              {profileType !== "person" && (
                <div className="border-t-2 border-slate-100 pt-4 space-y-3">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "profile.corporate_details")}</span>
                  
                  <div className="space-y-3 bg-slate-50/50 p-3 rounded-xl border-2 border-slate-200">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1 relative">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.company_id")}</label>
                        <div className="relative">
                          <input
                            type="text"
                            readOnly={!isEditingProfile}
                            value={profileCompanyId}
                            onChange={handleProfileCompanyIdChange}
                            className={`w-full px-2 py-1.5 rounded-lg focus:outline-none pr-7 ${
                              isEditingProfile 
                                ? "bg-white border-2 border-slate-200 text-slate-800" 
                                : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                            }`}
                          />
                          {isEditingProfile && isLoadingSuggestions && activeSuggestionInput === "profileCompanyId" && (
                            <div className="absolute right-2 top-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                            </div>
                          )}
                        </div>
                        {isEditingProfile && activeSuggestionInput === "profileCompanyId" && suggestions.length > 0 && (
                          <div 
                            ref={dropdownRef}
                            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-[999]"
                          >
                            {suggestions.map((item, idx) => (
                              <div
                                key={item.id || idx}
                                onClick={() => handleSelectSuggestion(item)}
                                className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 text-left cursor-pointer"
                              >
                                <div className="font-bold text-slate-800 text-[11px]">{stripHtml(item.entityName)}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {item.entNumber && `IČO: ${item.entNumber}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.tax_id")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileTaxId}
                          onChange={(e) => setProfileTaxId(e.target.value)}
                          className={`w-full px-2 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.vat_id")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileVatId}
                          onChange={(e) => setProfileVatId(e.target.value)}
                          onBlur={() => validateVatCode(profileVatId, true)}
                          className={`w-full px-2 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                        {renderVatValidation(profileVatStatus, profileVatResult)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.contact_person")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileContactPerson}
                          onChange={(e) => setProfileContactPerson(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-455 uppercase tracking-wider flex items-center gap-1"><Globe className="h-3 w-3" /> {getTranslation(systemLanguage, "profile.website")}</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          placeholder={isEditingProfile ? t("e.g. www.company.sk", "napr. www.firma.sk", "pl. www.cegnev.hu") : ""}
                          value={profileWebsite}
                          onChange={(e) => setProfileWebsite(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all text-blue-650 underline"
                          }`}
                        />
                      </div>
                    </div>
                    {/* Additional RegisterUZ Metadata */}
                    <div className="border-t border-slate-200/50 pt-2 grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                          {systemLanguage === "sk" ? "Dátum založenia" : systemLanguage === "hu" ? "Alapítás dátuma" : "Establishment Date"}
                        </label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileEstablishmentDate}
                          onChange={(e) => setProfileEstablishmentDate(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                          {systemLanguage === "sk" ? "Právna forma" : systemLanguage === "hu" ? "Jogi forma" : "Legal Form"}
                        </label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileLegalForm}
                          onChange={(e) => setProfileLegalForm(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">SK NACE</label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileSkNace}
                          onChange={(e) => setProfileSkNace(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                          {systemLanguage === "sk" ? "Veľkosť organizácie" : systemLanguage === "hu" ? "Szervezet mérete" : "Org Size"}
                        </label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileOrganizationSize}
                          onChange={(e) => setProfileOrganizationSize(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                          {systemLanguage === "sk" ? "Kraj / Okres" : systemLanguage === "hu" ? "Kerület / Járás" : "Region / District"}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly={!isEditingProfile}
                            value={profileRegion}
                            onChange={(e) => setProfileRegion(e.target.value)}
                            className={`w-1/2 px-3 py-1.5 rounded-lg focus:outline-none ${
                              isEditingProfile 
                                ? "bg-white border-2 border-slate-200 text-slate-800" 
                                : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                            }`}
                            placeholder={t("Region", "Kraj", "Megye")}
                          />
                          <input
                            type="text"
                            readOnly={!isEditingProfile}
                            value={profileDistrict}
                            onChange={(e) => setProfileDistrict(e.target.value)}
                            className={`w-1/2 px-3 py-1.5 rounded-lg focus:outline-none ${
                              isEditingProfile 
                                ? "bg-white border-2 border-slate-200 text-slate-800" 
                                : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                            }`}
                            placeholder={t("District", "Okres", "Járás")}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                          {systemLanguage === "sk" ? "Zdroj dát" : systemLanguage === "hu" ? "Adatforrás" : "Data Source"}
                        </label>
                        <input
                          type="text"
                          readOnly={!isEditingProfile}
                          value={profileDataSource}
                          onChange={(e) => setProfileDataSource(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg focus:outline-none ${
                            isEditingProfile 
                              ? "bg-white border-2 border-slate-200 text-slate-800" 
                              : "bg-transparent border-0 pl-0 text-slate-900 font-black cursor-default select-all"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Manager */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "profile.primary_pm")}</label>
                {isEditingProfile ? (
                  <select
                    value={profileOwner}
                    onChange={(e) => setProfileOwner(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-slate-850 font-bold"
                  >
                    {projectManagers.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                ) : (
                  <div className="pl-0 text-slate-900 font-black cursor-default select-all">
                    👤 {profileOwner}
                  </div>
                )}
              </div>

              {/* Client Categories */}
              <div className="border-t-2 border-slate-100 pt-4 space-y-2 text-left">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  📁 {systemLanguage === "sk" ? "Kategórie Klienta" : systemLanguage === "hu" ? "Ügyfél kategóriák" : "Client Categories"}
                </label>
                {isEditingProfile ? (
                  <div className="grid grid-cols-2 gap-2 bg-emerald-50/5 border border-slate-200/60 p-3 rounded-2xl">
                    {leadCategories.map((cat) => {
                      const isChecked = profileCategories.includes(cat);
                      return (
                        <label 
                          key={cat} 
                          className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-black uppercase tracking-wide cursor-pointer transition-all ${
                            isChecked 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700" 
                              : "bg-white border-slate-200/60 text-slate-500 hover:border-slate-350"
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setProfileCategories(prev => prev.filter(c => c !== cat));
                              } else {
                                setProfileCategories(prev => [...prev, cat]);
                              }
                            }}
                            className="hidden"
                          />
                          <span className={`h-2 w-2 rounded-full ${isChecked ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                          <span className="truncate">{cat}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {profileCategories.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic">{t("None", "Žiadne", "Nincs")}</span>
                    ) : (
                      profileCategories.map((cat) => (
                        <span 
                          key={cat}
                          className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-255 text-[9px] font-extrabold uppercase"
                        >
                          {cat}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Actions visible only in edit mode */}
              {isEditingProfile && (
                <div className="pt-4 border-t-2 border-slate-100 flex gap-3 animate-in fade-in duration-200">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-4.5 w-4.5 stroke-[2.5]" /> {systemLanguage === "sk" ? "Uložiť profil klienta" : systemLanguage === "hu" ? "Ügyfélprofil mentése" : "Save Client Profile"}
                  </button>
                </div>
              )}

            </form>
          </div>

          {/* RIGHT PANEL: Chronological Event Timeline & Interactive Logger (Combined) */}
          <div className="lg:col-span-7">
            <div className="glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl space-y-6">
              
              {/* Tab Navigation Switches */}
              <div className="flex flex-wrap justify-start border-b-2 border-slate-100 pb-2.5 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab("timeline")}
                  className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                    activeDetailTab === "timeline"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/10 border-emerald-700"
                      : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <Clock className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.history_timeline")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab("files")}
                  className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                    activeDetailTab === "files"
                      ? "bg-[#5c4033] text-white shadow-md shadow-[#5c4033]/15 border-[#3d2b1f]"
                      : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <FileText className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.attached_files")} ({activeClient.timeline.filter(e => e.fileName).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab("leads")}
                  className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                    activeDetailTab === "leads"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 border-blue-700"
                      : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <Layers className="h-4.5 w-4.5 stroke-[2.5]" /> {systemLanguage === "sk" ? "Aktívne Leady" : systemLanguage === "hu" ? "Aktív leadek" : "Active Leads"} ({(activeClient.associatedLeads || []).filter((l: any) => l.status.toLowerCase() !== "won" && l.status.toLowerCase() !== "lost").length})
                </button>
                {activeClient.clientType !== "person" && (
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab("financial_status")}
                    className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 border-2 ${
                      activeDetailTab === "financial_status"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/10 border-indigo-700"
                        : "text-slate-550 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border-slate-200"
                    }`}
                  >
                    <TrendingUp className="h-4.5 w-4.5 stroke-[2.5]" /> {t("Financial Report", "Finančný report", "Pénzügyi jelentés")}
                  </button>
                )}
              </div>

              {activeDetailTab === "timeline" && (
                <>
                  {/* Log event Form (New Event Bar) */}
                  <div>
                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b-2 border-slate-100 pb-2">
                      <PencilLine className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> {getTranslation(systemLanguage, "common.log_event_client")}
                    </h3>

                    <form onSubmit={handleAddTimelineEvent} className="space-y-4 text-xs font-bold">
                      
                      {/* Event Category Switcher */}
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-450 uppercase tracking-wider">{getTranslation(systemLanguage, "common.event_type")}</label>
                        <div className="grid grid-cols-5 gap-1.5 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-200">
                          {(["phone", "email", "note", "offer", "appointment"] as const).map(type => {
                            const colors = getEventColors(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setLogType(type)}
                                className={`py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1 ${
                                  logType === type 
                                    ? `${colors.dotBg} border-2 shadow` 
                                    : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200"
                                }`}
                              >
                                {renderEventIcon(type)}
                                <span>
                                  {type === "phone" && (systemLanguage === "sk" ? "Hovor" : systemLanguage === "hu" ? "Hívás" : "Call")}
                                  {type === "email" && (systemLanguage === "sk" ? "E-mail" : systemLanguage === "hu" ? "E-mail" : "Email")}
                                  {type === "note" && (systemLanguage === "sk" ? "Poznámka" : systemLanguage === "hu" ? "Jegyzet" : "Note")}
                                  {type === "offer" && (systemLanguage === "sk" ? "Ponuka" : systemLanguage === "hu" ? "Ajánlat" : "Offer")}
                                  {type === "appointment" && (systemLanguage === "sk" ? "Meet" : systemLanguage === "hu" ? "Találkozó" : "Meet")}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Conditional form fields - Expand-down conditionally */}
                      <div className={`grid transition-all duration-300 ease-in-out ${logType ? "grid-rows-[1fr] opacity-100 mt-4 border-t border-slate-150 pt-4" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
                        <div className="overflow-hidden space-y-4">
                          
                          {/* Date and Time selectors for the event */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_date") || "Event Date"}</label>
                              <input
                                type="date"
                                required
                                value={logDate}
                                onChange={(e) => setLogDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none text-xs font-bold text-slate-700"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_time") || "Event Time"}</label>
                              <input
                                type="time"
                                required
                                value={logTimeOfEvent}
                                onChange={(e) => setLogTimeOfEvent(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none text-xs font-bold text-slate-700"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {logType === "offer" && (
                              <>
                                <div className="space-y-1 animate-in slide-in-from-left duration-200">
                                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.offer_amount")}</label>
                                  <input
                                    type="number"
                                    required
                                    min="0"
                                    placeholder={t("e.g. 15000", "napr. 15000", "pl. 15000")}
                                    value={logAmount}
                                    onChange={(e) => setLogAmount(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none font-bold text-xs"
                                  />
                                </div>
                                <div className="space-y-1 animate-in slide-in-from-left duration-200">
                                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.attach_doc")}</label>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-2 border-amber-300 transition-all cursor-pointer text-[10px] font-black uppercase shadow-sm select-none shrink-0">
                                      <FolderOpen className="h-4 w-4" />
                                      <span>{getTranslation(systemLanguage, "logger.choose_file")}</span>
                                      <input 
                                        type="file" 
                                        className="hidden" 
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const MAX_MB = 64;
                                            if (file.size > MAX_MB * 1024 * 1024) {
                                              (window as any).showToast?.(t(
                                                `File is too large (max ${MAX_MB} MB).`,
                                                `Súbor je príliš veľký (max ${MAX_MB} MB).`,
                                                `A fájl túl nagy (max ${MAX_MB} MB).`,
                                              ));
                                              e.target.value = "";
                                              return;
                                            }
                                            setSelectedLogFile(file);
                                            setLogFileName(file.name);
                                            setLogFileSize((file.size / 1024 / 1024).toFixed(2) + " MB");
                                          }
                                        }}
                                      />
                                    </label>
                                    <input
                                      type="text"
                                      placeholder={getTranslation(systemLanguage, "logger.no_file")}
                                      value={logFileName ? `${logFileName} (${logFileSize})` : ""}
                                      readOnly
                                      className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:outline-none text-[10px] text-slate-500 font-bold"
                                    />
                                    {logFileName && (
                                      <button 
                                        type="button" 
                                        onClick={() => { setLogFileName(""); setLogFileSize(""); }} 
                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl animate-in fade-in"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Always-visible file type selection when a file is selected */}
                                {logFileName && (
                                  <div className="md:col-span-2 space-y-1.5 animate-in slide-in-from-top-2 duration-200 border-t border-slate-100 pt-3">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.specify_type")}</label>
                                    <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-200">
                                      {(["offer", "contract", "invoice"] as const).map(type => (
                                        <button
                                          key={type}
                                          type="button"
                                          onClick={() => setLogFileType(type)}
                                          className={`py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
                                            logFileType === type 
                                              ? "bg-amber-700 text-white border border-amber-800 shadow" 
                                              : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200"
                                          }`}
                                        >
                                          <span>
                                            {type === "offer" && getTranslation(systemLanguage, "logger.type.offer")}
                                            {type === "contract" && getTranslation(systemLanguage, "logger.type.contract")}
                                            {type === "invoice" && getTranslation(systemLanguage, "logger.type.invoice")}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
 
                            {logType === "appointment" && (
                              <div className="space-y-1 animate-in slide-in-from-left duration-200">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.appt_time")}</label>
                                <input
                                  type="text"
                                  required
                                  placeholder={getTranslation(systemLanguage, "logger.appt_placeholder")}
                                  value={logTime}
                                  onChange={(e) => setLogTime(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
 
                          {/* Description details */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "logger.event_details")}</label>
                            {logType === "note" ? (
                              <div className="space-y-2 border-2 border-slate-200 rounded-xl p-3 bg-slate-50/50 text-left">
                                {renderCompactAudioRecorder()}
                                <div className="border border-slate-200 rounded-xl bg-white p-2 min-h-[140px] max-h-[260px] overflow-y-auto outline-none text-xs">
                                  <BlockEditor
                                    key={editorKey}
                                    initialBlocks={noteBlocks}
                                    onChange={(blocks) => {
                                      setNoteBlocks(blocks);
                                      const serializeBlocksToPlainText = (blks: EditorBlock[]): string => {
                                        return blks.map(b => b.content.replace(/<[^>]*>/g, "")).join("\n");
                                      };
                                      setLogContent(serializeBlocksToPlainText(blocks));
                                    }}
                                    systemLanguage={systemLanguage}
                                  />
                                </div>
                              </div>
                            ) : (
                              <textarea
                                required={!!logType}
                                rows={3}
                                placeholder={logType ? getTranslation(systemLanguage, "logger.details_placeholder_log") : getTranslation(systemLanguage, "logger.details_placeholder_generic")}
                                value={logContent}
                                onChange={(e) => setLogContent(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 focus:bg-white focus:outline-none resize-none"
                              />
                            )}
                          </div>
 
                          {/* Submit log */}
                          {/* Submit log */}
                          <button
                            type="submit"
                            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-lg w-fit ml-auto border-2 border-emerald-700"
                          >
                            <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> {getTranslation(systemLanguage, "logger.btn_log")}
                          </button>

                        </div>
                      </div>

                    </form>
                  </div>

                  {/* Timeline event log */}
                  <div className="border-t-2 border-slate-150 pt-6 space-y-4">
                    <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                      <Clock className="h-4.5 w-4.5 text-emerald-600 animate-pulse stroke-[2.5]" /> {getTranslation(systemLanguage, "common.chronological_timeline")}
                      {isLoadingMails && <span className="ml-2 text-[9px] text-emerald-500 font-extrabold uppercase animate-pulse">{t("Syncing Mail...", "Synchronizujem poštu...", "Levelek szinkronizálása...")}</span>}
                    </h3>

                    {activeClientTimeline.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2 animate-bounce">📜</div>
                        <div className="font-black text-slate-700 uppercase tracking-wider">{t("No events logged yet", "Zatiaľ neboli zaznamenané žiadne udalosti", "Még nincs rögzített esemény")}</div>
                        <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">{t("Use the form above to add phone calls, emails, notes or proposals.", "Pomocou formulára vyššie pridajte telefonáty, e-maily, poznámky alebo ponuky.", "A fenti űrlap segítségével adjon hozzá hívásokat, e-maileket, jegyzeteket vagy ajánlatokat.")}</div>
                      </div>
                    ) : (
                      <div className="relative pl-0 md:pl-4 space-y-6 py-2">
                        {/* Running timeline vertical line on desktop/mobile */}
                        <div className="absolute left-[17px] md:left-[132px] top-2 bottom-2 w-1 bg-emerald-100 rounded-full"></div>

                        {/* 1. FUTURE EVENTS (Rendered at top, closest future closest to line) */}
                        {futureEvents.map((event) => {
                          const colors = getEventColors(event.type);
                          return (
                            <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                              
                              {/* Left Date / Time part */}
                              <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                  {event.timestamp.substring(0, 10)}
                                </span>
                                <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                                  {event.timestamp.substring(11, 16)}
                                </span>
                              </div>

                              {/* Timeline dot */}
                              <div className="relative z-10 flex items-center justify-center shrink-0 w-9 h-9">
                                <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shadow-md ${colors.dotBg} transition-transform group-hover:scale-110`}>
                                  {renderEventIcon(event.type)}
                                </span>
                              </div>

                              {/* Event Card */}
                              <div className="flex-1 min-w-0 pl-3 md:pl-0">
                                <div 
                                  onClick={() => event.type === "email" && handleTimelineEmailClick(event)}
                                  className={`${event.type === "email" ? "cursor-pointer hover:border-indigo-400 active:scale-[0.99]" : ""} bg-amber-50/10 border-2 border-dashed border-amber-300 rounded-2xl p-4 transition-all shadow-md hover:shadow-lg ${colors.cardBorder}`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200/50 pb-2 mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-wide">
                                        {event.title}
                                      </span>
                                      <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-widest shadow-inner ${colors.badgeBg}`}>
                                        {getTranslation(systemLanguage, `timeline.badge.${event.type}`)}
                                      </span>
                                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-white border border-amber-600 tracking-widest shadow-sm">
                                        {getTranslation(systemLanguage, "timeline.upcoming")}
                                      </span>
                                    </div>
                                    <span className="block md:hidden text-[9px] font-black text-slate-450 uppercase tracking-wider">
                                      {event.timestamp}
                                    </span>
                                  </div>

                                  {(() => {
                                    if (event.type === "note" && event.content.trim().startsWith("[")) {
                                      try {
                                        const blocks: EditorBlock[] = JSON.parse(event.content);
                                        return (
                                          <div className="space-y-2 text-[11px] text-slate-700 font-bold select-text text-left mt-2">
                                            {/* Audio file section */}
                                            {event.audioFile && (
                                              <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-100/80 border border-slate-200 w-fit mb-2">
                                                <audio src={event.audioFile} controls className="h-6 max-w-[180px] text-[8px]" />
                                                {event.transcription && (
                                                  <details className="cursor-pointer">
                                                    <summary className="text-[9px] uppercase tracking-wider text-indigo-600 hover:text-indigo-800 font-extrabold select-none">
                                                      {t("Transcript", "Prepis", "Átirat")}
                                                    </summary>
                                                    <div className="mt-1 p-2 bg-white rounded border border-slate-100 text-[9.5px] font-medium leading-relaxed max-w-[240px] whitespace-pre-wrap">
                                                      {event.transcription}
                                                    </div>
                                                  </details>
                                                )}
                                              </div>
                                            )}
                                            
                                            {/* Parse blocks */}
                                            <div className="space-y-1.5">
                                              {blocks.map((b) => {
                                                if (b.type === "todo") {
                                                  return (
                                                    <div key={b.id} className="flex items-center gap-1.5">
                                                      <input type="checkbox" checked={!!b.checked} readOnly className="rounded border-slate-300" />
                                                      <span className={b.checked ? "line-through text-slate-400" : ""}>{b.content.replace(/<[^>]*>/g, "")}</span>
                                                    </div>
                                                  );
                                                }
                                                if (b.type === "bullet") {
                                                  return (
                                                    <ul key={b.id} className="list-disc pl-4 space-y-0.5 text-left">
                                                      <li>{b.content.replace(/<[^>]*>/g, "")}</li>
                                                    </ul>
                                                  );
                                                }
                                                if (b.type.startsWith("h")) {
                                                  return <div key={b.id} className="font-black uppercase tracking-tight text-[11px] mt-1 text-slate-900 text-left">{b.content.replace(/<[^>]*>/g, "")}</div>;
                                                }
                                                return <p key={b.id} className="leading-normal text-left">{b.content.replace(/<[^>]*>/g, "")}</p>;
                                              })}
                                            </div>
                                          </div>
                                        );
                                      } catch (e) {
                                        console.error("Failed to parse JSON note blocks in future event", e);
                                      }
                                    }

                                    const lines = event.content.split("\n");
                                    const showGradient = lines.length > 5 || event.content.length > 250;
                                    return (
                                      <div className={`relative ${showGradient ? "max-h-[8.1em] overflow-hidden" : ""}`} style={{ lineHeight: 1.35 }}>
                                        <p className="text-[11px] text-slate-700 font-bold select-text whitespace-pre-wrap">
                                          {event.content}
                                        </p>
                                        {showGradient && (
                                          <div 
                                            className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-slate-50 via-slate-50/70 to-transparent" 
                                            style={{ height: "2.7em" }}
                                          />
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Extra values */}
                                  {event.type === "offer" && event.amount !== undefined && (
                                    <div className="mt-3 pl-3 border-l-4 border-emerald-500 flex items-center gap-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                      <TrendingUp className="h-4 w-4" /> {t("BUDGET WORTH OFFERED:", "PONÚKNUTÝ ROZPOČET:", "FELAJÁNLOTT KÖLTSÉGVETÉS:")} {money(event.amount)}
                                    </div>
                                  )}

                                  {event.type === "appointment" && event.extraTime && (
                                    <div className="mt-3 pl-3 border-l-4 border-rose-500 flex items-center gap-1 text-[10px] font-black text-rose-700 uppercase tracking-wider">
                                      <Calendar className="h-4 w-4" /> {t("MEETING SCHEDULED AT:", "STRETNUTIE NAPLÁNOVANÉ NA:", "TALÁLKOZÓ IDŐPONTJA:")} {event.extraTime}
                                    </div>
                                  )}

                                  {/* File Attachment details */}
                                  {event.fileName && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-200 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-amber-900 uppercase tracking-wider">
                                        <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                                        <span className="truncate max-w-[150px]">{event.fileName}</span>
                                        <span className="text-[9px] font-extrabold text-slate-400">({event.fileSize})</span>
                                      </div>
                                      <a 
                                        href={event.filePath || `/uploads/${event.id}_${event.fileName}`}
                                        download={event.fileName}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 hover:bg-amber-250 transition-all text-[8px] font-black uppercase text-amber-800 tracking-wider shadow-sm cursor-pointer"
                                      >
                                        {t("View File", "Zobraziť súbor", "Fájl megtekintése")}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. TODAY DIVIDER LINE (Delineates future and past) */}
                        <div className="relative z-10 flex items-center gap-3 my-6 animate-in fade-in duration-300">
                          <div className="hidden md:block w-[116px] shrink-0"></div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="h-0.5 bg-emerald-500/35 flex-1"></div>
                            <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-100 border-2 border-emerald-300 px-4 py-1.5 rounded-full tracking-widest shadow-sm flex items-center gap-1.5 shrink-0 select-text">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                              {t("Today", "Dnes", "Ma")} ({new Date().toISOString().substring(0, 10)})
                            </span>
                            <div className="h-0.5 bg-emerald-500/35 flex-1"></div>
                          </div>
                        </div>

                        {/* 3. PAST EVENTS (Rendered at bottom, most recent closest to line) */}
                        {pastEvents.map((event) => {
                          const colors = getEventColors(event.type);
                          const pmName = event.type === "email"
                            ? (event.isOutgoing ? (currentUser?.name || projectManagers[0] || "") : (activeClient.owner || currentUser?.name || projectManagers[0] || ""))
                            : (activeClient.owner || currentUser?.name || projectManagers[0] || "");
                          const pmColor = projectManagerColors[pmName] || "#6366f1";
                          return (
                            <div key={event.id} className="relative flex flex-row items-start gap-4 md:gap-8 group animate-in fade-in slide-in-from-bottom duration-250">
                              
                              {/* Left Date / Time part */}
                              <div className="hidden md:block w-[100px] text-right pt-1.5 shrink-0 select-text">
                                <span className="text-[10px] font-black text-slate-550 uppercase tracking-wider block">
                                  {event.timestamp.substring(0, 10)}
                                </span>
                                <span className="text-[9px] font-extrabold text-slate-400 block mt-0.5">
                                  {event.timestamp.substring(11, 16)}
                                </span>
                              </div>

                              {/* Timeline dot */}
                              <div className="relative z-10 flex items-center justify-center shrink-0 w-9 h-9">
                                <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shadow-md ${colors.dotBg} transition-transform group-hover:scale-110`}>
                                  {renderEventIcon(event.type)}
                                </span>
                              </div>

                              {/* Event Card */}
                              <div className="flex-1 min-w-0 pl-3 md:pl-0">
                                <div 
                                  onClick={() => event.type === "email" && handleTimelineEmailClick(event)}
                                  className={`${event.type === "email" ? "cursor-pointer hover:border-indigo-400 active:scale-[0.99]" : ""} bg-slate-50/60 border rounded-2xl p-4 transition-all shadow-md hover:shadow-lg ${colors.cardBorder}`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-200/50 pb-2 mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-wide">
                                        {event.title}
                                      </span>
                                      {event.type === "email" ? (
                                        <>
                                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border tracking-widest shadow-inner ${colors.badgeBg} flex items-center gap-1.5`}>
                                            {event.isOutgoing ? (
                                              <>
                                                <CornerDownLeft className="h-3 w-3 stroke-[2.5]" />
                                                <span>{t("Outgoing", "Odchádzajúci", "Kimenő")}</span>
                                              </>
                                            ) : (
                                              <>
                                                <CornerLeftDown className="h-3 w-3 stroke-[2.5]" />
                                                <span>{t("Incoming", "Prichádzajúci", "Bejövő")}</span>
                                              </>
                                            )}
                                          </span>
                                          <span 
                                            className="inline-flex items-center gap-1 text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-sm text-white"
                                            style={{ backgroundColor: pmColor, borderColor: pmColor }}
                                          >
                                            @ {pmName}
                                          </span>
                                        </>
                                      ) : (
                                        <span className={`text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-widest shadow-inner ${colors.badgeBg}`}>
                                          {getTranslation(systemLanguage, `timeline.badge.${event.type}`)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="block md:hidden text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                      {event.timestamp}
                                    </span>
                                  </div>

                                  {(() => {
                                    if (event.type === "note" && event.content.trim().startsWith("[")) {
                                      try {
                                        const blocks: EditorBlock[] = JSON.parse(event.content);
                                        return (
                                          <div className="space-y-2 text-[11px] text-slate-700 font-bold select-text text-left">
                                            {/* Audio file section */}
                                            {event.audioFile && (
                                              <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-100/80 border border-slate-200 w-fit mb-2">
                                                <audio src={event.audioFile} controls className="h-6 max-w-[180px] text-[8px]" />
                                                {event.transcription && (
                                                  <details className="cursor-pointer">
                                                    <summary className="text-[9px] uppercase tracking-wider text-indigo-600 hover:text-indigo-800 font-extrabold select-none">
                                                      {t("Transcript", "Prepis", "Átirat")}
                                                    </summary>
                                                    <div className="mt-1 p-2 bg-white rounded border border-slate-100 text-[9.5px] font-medium leading-relaxed max-w-[240px] whitespace-pre-wrap">
                                                      {event.transcription}
                                                    </div>
                                                  </details>
                                                )}
                                              </div>
                                            )}
                                            
                                            {/* Parse blocks */}
                                            <div className="space-y-1.5">
                                              {blocks.map((b) => {
                                                if (b.type === "todo") {
                                                  return (
                                                    <div key={b.id} className="flex items-center gap-1.5">
                                                      <input type="checkbox" checked={!!b.checked} readOnly className="rounded border-slate-300" />
                                                      <span className={b.checked ? "line-through text-slate-400" : ""}>{b.content.replace(/<[^>]*>/g, "")}</span>
                                                    </div>
                                                  );
                                                }
                                                if (b.type === "bullet") {
                                                  return (
                                                    <ul key={b.id} className="list-disc pl-4 space-y-0.5 text-left">
                                                      <li>{b.content.replace(/<[^>]*>/g, "")}</li>
                                                    </ul>
                                                  );
                                                }
                                                if (b.type.startsWith("h")) {
                                                  return <div key={b.id} className="font-black uppercase tracking-tight text-[11px] mt-1 text-slate-900 text-left">{b.content.replace(/<[^>]*>/g, "")}</div>;
                                                }
                                                return <p key={b.id} className="leading-normal text-left">{b.content.replace(/<[^>]*>/g, "")}</p>;
                                              })}
                                            </div>
                                          </div>
                                        );
                                      } catch (e) {
                                        console.error("Failed to parse JSON note blocks in past event", e);
                                      }
                                    }

                                    const lines = event.content.split("\n");
                                    const showGradient = lines.length > 5 || event.content.length > 250;
                                    return (
                                      <div className={`relative ${showGradient ? "max-h-[8.1em] overflow-hidden" : ""}`} style={{ lineHeight: 1.35 }}>
                                        <p className="text-[11px] text-slate-700 font-bold select-text whitespace-pre-wrap">
                                          {event.content}
                                        </p>
                                        {showGradient && (
                                          <div 
                                            className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-slate-50 via-slate-50/70 to-transparent" 
                                            style={{ height: "2.7em" }}
                                          />
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Extra values */}
                                  {event.type === "offer" && event.amount !== undefined && (
                                    <div className="mt-3 pl-3 border-l-4 border-emerald-500 flex items-center gap-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                                      <TrendingUp className="h-4 w-4" /> {t("BUDGET WORTH OFFERED:", "PONÚKNUTÝ ROZPOČET:", "FELAJÁNLOTT KÖLTSÉGVETÉS:")} {money(event.amount)}
                                    </div>
                                  )}

                                  {event.type === "appointment" && event.extraTime && (
                                    <div className="mt-3 pl-3 border-l-4 border-rose-500 flex items-center gap-1 text-[10px] font-black text-rose-700 uppercase tracking-wider">
                                      <Calendar className="h-4 w-4" /> {t("MEETING SCHEDULED AT:", "STRETNUTIE NAPLÁNOVANÉ NA:", "TALÁLKOZÓ IDŐPONTJA:")} {event.extraTime}
                                    </div>
                                  )}

                                  {/* File Attachment details */}
                                  {event.fileName && (
                                    <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-200 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-amber-900 uppercase tracking-wider">
                                        <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                                        <span className="truncate max-w-[150px]">{event.fileName}</span>
                                        <span className="text-[9px] font-extrabold text-slate-400">({event.fileSize})</span>
                                      </div>
                                      <a 
                                        href={event.filePath || `/uploads/${event.id}_${event.fileName}`}
                                        download={event.fileName}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 hover:bg-amber-250 transition-all text-[8px] font-black uppercase text-amber-800 tracking-wider shadow-sm cursor-pointer"
                                      >
                                        {t("View File", "Zobraziť súbor", "Fájl megtekintése")}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    )}
                  </div>
                </>
              )}

              {activeDetailTab === "files" && (
                <div className="space-y-6">
                  {/* Attach New Document Form */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border-2 border-slate-200">
                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                      <FolderOpen className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> {t("Attach New Document to Profile", "Pripojiť nový dokument k profilu", "Új dokumentum csatolása a profilhoz")}
                    </h3>

                    <form onSubmit={handleAttachFile} className="space-y-4 text-xs font-bold">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">{t("Upload File", "Nahrať súbor", "Fájl feltöltése")} *</label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-2 border-amber-300 transition-all cursor-pointer text-[10px] font-black uppercase shadow-sm select-none shrink-0">
                              <FolderOpen className="h-4 w-4" />
                              <span>{t("Select File", "Vybrať súbor", "Fájl kiválasztása")}</span>
                              <input 
                                type="file" 
                                required
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const MAX_MB = 64;
                                    if (file.size > MAX_MB * 1024 * 1024) {
                                      (window as any).showToast?.(t(
                                        `File is too large (max ${MAX_MB} MB).`,
                                        `Súbor je príliš veľký (max ${MAX_MB} MB).`,
                                        `A fájl túl nagy (max ${MAX_MB} MB).`,
                                      ));
                                      e.target.value = "";
                                      return;
                                    }
                                    setSelectedUploadFile(file);
                                    setUploadFileName(file.name);
                                    setUploadFileSize((file.size / 1024 / 1024).toFixed(2) + " MB");
                                  }
                                }}
                              />
                            </label>
                            <input
                              type="text"
                              placeholder={t("No file chosen", "Nie je vybraný žiadny súbor", "Nincs kiválasztott fájl")}
                              value={uploadFileName ? `${uploadFileName} (${uploadFileSize})` : ""}
                              readOnly
                              className="flex-1 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 focus:outline-none text-[10px] text-slate-550 font-bold"
                            />
                            {uploadFileName && (
                              <button 
                                type="button" 
                                onClick={() => { setUploadFileName(""); setUploadFileSize(""); }} 
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">{t("Document Category", "Kategória dokumentu", "Dokumentum kategória")} *</label>
                          <div className="grid grid-cols-3 gap-2 bg-white p-1 rounded-xl border-2 border-slate-200">
                            {(["offer", "contract", "invoice"] as const).map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setUploadFileType(type)}
                                className={`py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
                                  uploadFileType === type 
                                    ? "bg-amber-600 text-white border border-amber-700 shadow" 
                                    : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
                                }`}
                              >
                                <span>
                                  {type === "offer" && t("Offer", "Ponuka", "Ajánlat")}
                                  {type === "contract" && t("Contract", "Zmluva", "Szerződés")}
                                  {type === "invoice" && t("Invoice", "Faktúra", "Számla")}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider block pl-0.5">{t("Document Description / Remarks", "Popis dokumentu / Poznámky", "Dokumentum leírása / Megjegyzések")} *</label>
                        <input
                          type="text"
                          required
                          placeholder={t("e.g. Approved price quote sheet for Q2...", "napr. Schválený cenový návrh za Q2...", "pl. Jóváhagyott árajánlat a Q2-re...")}
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          className="w-full px-4 py-2 rounded-xl bg-white border-2 border-slate-200 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-lg w-fit ml-auto border-2 border-emerald-700"
                      >
                        <Plus className="h-4.5 w-4.5 stroke-[2.5]" /> {t("Attach File to Client", "Pripojiť súbor ku klientovi", "Fájl csatolása az ügyfélhez")}
                      </button>
                    </form>
                  </div>

                  {/* Attached Documents List */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                      <FileText className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> {t("Attached Client Documents", "Pripojené dokumenty klienta", "Csatolt ügyféldokumentumok")} ({activeClient.timeline.filter(e => e.fileName).length})
                    </h3>

                    {activeClient.timeline.filter(e => e.fileName).length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2">📁</div>
                        <div className="font-black text-slate-700 uppercase tracking-wider">{t("No files attached to this client", "K tomuto klientovi nie sú pripojené žiadne súbory", "Nincs fájl csatolva ehhez az ügyfélhez")}</div>
                        <div className="text-[9px] mt-1.5 uppercase tracking-wide font-extrabold text-slate-400">{t("Use the attachment form above to upload proposals, contracts or invoices.", "Pomocou formulára vyššie nahrajte ponuky, zmluvy alebo faktúry.", "A fenti űrlap segítségével töltsön fel ajánlatokat, szerződéseket vagy számlákat.")}</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {activeClient.timeline.filter(e => e.fileName).map((file) => {
                          return (
                            <div 
                              key={file.id} 
                              className="p-4 rounded-2xl bg-white border-2 border-slate-150 shadow-md flex items-center justify-between gap-4 hover:border-slate-300 transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:scale-105 ${
                                  file.fileType === "contract"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : file.fileType === "invoice"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}>
                                  <FileText className="h-5 w-5 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide truncate">
                                    {file.fileName}
                                  </span>
                                  <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] border font-black ${
                                      file.fileType === "contract"
                                        ? "bg-amber-100/50 text-amber-800 border-amber-200"
                                        : file.fileType === "invoice"
                                        ? "bg-emerald-100/50 text-emerald-800 border-emerald-200"
                                        : "bg-blue-100/50 text-blue-800 border-blue-200"
                                    }`}>
                                      {file.fileType || t("document", "dokument", "dokumentum")}
                                    </span>
                                    &bull; {file.fileSize || t("Unknown size", "Neznáma veľkosť", "Ismeretlen méret")} &bull; {file.timestamp.substring(0, 10)}
                                  </span>
                                  <p className="text-[10px] text-slate-505 font-bold mt-1 leading-normal italic line-clamp-1">
                                    "{file.content}"
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={(file as any).filePath || `/uploads/${file.id}_${file.fileName}`}
                                  download={file.fileName}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all text-slate-600 hover:text-slate-900 shadow-sm flex items-center justify-center cursor-pointer"
                                  title={systemLanguage === "sk" ? "Stiahnuť dokument" : systemLanguage === "hu" ? "Dokumentum letöltése" : "Download Document"}
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(systemLanguage === "sk" ? "Naozaj chcete natrvalo odpojiť tento dokument?" : systemLanguage === "hu" ? "Biztosan véglegesen le szeretné választani ezt a dokumentumot?" : "Are you sure you want to permanently detach this document?")) {
                                      const backupLeads = [...leads];
                                      setLeads(prev => prev.map(lead => {
                                        if (lead.name.trim().toLowerCase() === activeClient.name.trim().toLowerCase()) {
                                          return {
                                            ...lead,
                                            timeline: (lead.timeline || []).filter(evt => evt.id !== file.id)
                                          };
                                        }
                                        return lead;
                                      }));
                                      (window as any).showToast(
                                        systemLanguage === "sk" ? "Dokument bol úspešne odpojený!" : systemLanguage === "hu" ? "Dokumentum sikeresen leválasztva!" : "Document detached successfully!",
                                        {
                                          label: systemLanguage === "sk" ? "Krok späť" : systemLanguage === "hu" ? "Visszavonás" : "Undo",
                                          onClick: () => setLeads(backupLeads)
                                        }
                                      );
                                    }
                                  }}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all text-rose-600 hover:text-rose-700 shadow-sm"
                                  title={systemLanguage === "sk" ? "Odpojiť dokument" : systemLanguage === "hu" ? "Dokumentum leválasztása" : "Detach Document"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>


                </div>
              )}

              {activeDetailTab === "leads" && (
                <div className="space-y-4 text-left">
                  <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                    <Layers className="h-4.5 w-4.5 text-blue-600 stroke-[2.5]" /> {systemLanguage === "sk" ? "Aktívne obchodné prípady (Leady)" : systemLanguage === "hu" ? "Aktív leadek" : "Active Leads / Deals"}
                  </h3>
                  {((activeClient.associatedLeads || []).filter((l: any) => l.status.toLowerCase() !== "won" && l.status.toLowerCase() !== "lost")).length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                      {systemLanguage === "sk" ? "Žiadne aktívne leady pre tohto klienta" : systemLanguage === "hu" ? "Nincsenek aktív leadek ehhez az ügyfélhez" : "No active leads for this client"}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(activeClient.associatedLeads || [])
                        .filter((l: any) => l.status.toLowerCase() !== "won" && l.status.toLowerCase() !== "lost")
                        .map((lead: any) => {
                          const stateColors: Record<string, string> = {
                            todo: "#2563eb",
                            "contacted / in progress": "#eab308",
                            "in progress": "#eab308",
                            proposal: "#8b5cf6",
                            negotiation: "#ec4899",
                            won: "#10b981",
                            lost: "#ef4444"
                          };
                          const stateColor = stateColors[(lead.status || "").toLowerCase()] || "#64748b";
                          return (
                            <div 
                              key={lead.id} 
                              className="p-4 rounded-2xl border-2 border-slate-150 bg-slate-50/50 hover:bg-slate-50 transition-all shadow-sm flex items-center justify-between gap-4 cursor-pointer"
                              onClick={() => {
                                window.location.hash = `lead-${lead.id}`;
                              }}
                            >
                              <div className="min-w-0">
                                <h4 className="font-heading font-black text-xs uppercase text-slate-800 tracking-tight truncate max-w-[280px]">{lead.name || t("Untitled Lead", "Lead bez názvu", "Cím nélküli lead")}</h4>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[9px] font-black uppercase text-slate-450 tracking-wider">
                                  <span>{t("Worth", "Hodnota", "Érték")}: <strong className="text-emerald-700 font-extrabold">{money(lead.value)}</strong></span>
                                  <span>&bull;</span>
                                  <span>PM: <strong className="text-slate-600 font-extrabold">{lead.owner || t("Unassigned", "Nepriradené", "Nincs hozzárendelve")}</strong></span>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <span 
                                  className="px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase text-white shadow-sm"
                                  style={{ backgroundColor: stateColor }}
                                >
                                  {lead.status}
                                </span>
                                <span className="text-slate-400 font-black text-xs">&rarr;</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {activeDetailTab === "financial_status" && (
                <div className="space-y-4 text-left">
                  <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
                    <h3 className="text-xs font-black text-slate-455 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-4.5 w-4.5 text-indigo-600 stroke-[2.5]" /> 
                      {t("AI Financial Report", "AI Finančný report", "AI pénzügyi jelentés")}
                    </h3>
                    {activeClient.clientType !== "person" && activeClient.companyId && (
                      <button
                        type="button"
                        disabled={isAnalyzingFinancial}
                        onClick={handleCreateFinancialReport}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-200 text-indigo-800 border border-indigo-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Brain className="h-3.5 w-3.5 text-indigo-600" />
                        <span>
                          {activeClient.financialSummary
                            ? t("Regenerate Report", "Pre-generovať report", "Jelentés újragenerálása")
                            : t("Create Report", "Vytvoriť report", "Jelentés létrehozása")}
                        </span>
                      </button>
                    )}
                  </div>
                  
                  {isAnalyzingFinancial ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-xs text-slate-500 font-bold uppercase">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                      <span>{t("AI is generating financial report...", "AI generuje finančný report...", "Az AI pénzügyi jelentést készít...")}</span>
                    </div>
                  ) : activeClient.financialSummary ? (
                    <FinancialReportView summary={activeClient.financialSummary} systemLanguage={systemLanguage} />
                  ) : (
                    <div className="py-10 text-center text-slate-455 text-xs font-black uppercase tracking-wider flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <Brain className="h-8 w-8 text-indigo-300 animate-pulse" />
                      <div>
                        {t("No financial report has been generated yet.", "Žiadny finančný report nie je vygenerovaný.", "Még nem készült pénzügyi jelentés.")}
                      </div>
                      {activeClient.clientType !== "person" && activeClient.companyId ? (
                        <button
                          type="button"
                          onClick={handleCreateFinancialReport}
                          className="mt-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-indigo-700 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                        >
                          <Brain className="h-4 w-4" />
                          <span>{t("Create Financial Report", "Vytvoriť finančný report", "Pénzügyi jelentés létrehozása")}</span>
                        </button>
                      ) : (
                        <div className="text-[10px] text-slate-450 font-semibold lowercase tracking-tight max-w-sm mt-1">
                          {t("the client must have a company ID configured to generate a financial report.", "na vytvorenie reportu musí mať klient vyplnené IČO.", "a pénzügyi jelentés létrehozásához az ügyfélnek beállított cégazonosítóval kell rendelkeznie.")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* RegisterUZ Financial Statements (Slovak Register) */}
                  {activeClient.clientType !== "person" && activeClient.companyId && (
                    <div className="space-y-4 pt-6 border-t-2 border-slate-100">
                      <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b-2 border-slate-100">
                        <Download className="h-4.5 w-4.5 text-emerald-600 stroke-[2.5]" /> 
                        {systemLanguage === "sk" ? "Registre: Účtovné závierky (PDF)" : systemLanguage === "hu" ? "Regiszter: Pénzügyi beszámolók (PDF)" : "Registry: Financial Statements (PDF)"}
                      </h3>

                      {isLoadingRegistryStatements ? (
                        <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500 font-bold uppercase">
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          <span>{t("Loading statements from registry...", "Načítavam závierky z registra...", "Beszámolók betöltése a regiszterből...")}</span>
                        </div>
                      ) : registryStatements.length === 0 ? (
                        <div className="py-6 text-center text-slate-455 text-xs font-extrabold uppercase tracking-wide">
                          {t("No financial statements found in registry", "Žiadne závierky neboli nájdené v registri", "Nem találhatók pénzügyi beszámolók a regiszterben")}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {registryStatements.map((stmt: any) => {
                            const label = `${stmt.typ || "Závierka"} (${stmt.obdobieOd || ""} - ${stmt.obdobieDo || ""})`;
                            const reportIds = stmt.idUctovnychVykazov || [];
                            return (
                              <div key={stmt.id} className="p-4 rounded-2xl bg-white border-2 border-slate-150 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-350 transition-all text-left">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0">
                                    <FileText className="h-5 w-5 stroke-[2.5]" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                      {label}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase mt-0.5">
                                      ID: {stmt.id} | {stmt.zdrojDat || "RÚZ"}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {/* Link to download the full statement PDF */}
                                  <a
                                    href={`/api/registeruz.php?action=pdf&id=${stmt.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => handleDownloadStatement(stmt.id, activeClient)}
                                    className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    <span>
                                      {systemLanguage === "sk" ? "Celá závierka (PDF)" : systemLanguage === "hu" ? "Teljes beszámoló (PDF)" : "Full Statement (PDF)"}
                                    </span>
                                  </a>

                                  {/* Links to download individual reports */}
                                  {reportIds.map((rid: any, rIdx: number) => (
                                    <a
                                      key={rid}
                                      href={`/api/registeruz.php?action=pdf&id=${rid}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      <span>
                                        {t(`Report ${rIdx + 1}`, `Výkaz ${rIdx + 1}`, `Kimutatás ${rIdx + 1}`)}
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // --- DEFAULT ROUTE: MAIN OVERVIEW CLIENTS LIST GRID ---
  // ----------------------------------------------------
  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">

      {/* 1. Title header */}
      <div className="flex flex-col border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" /> {getTranslation(systemLanguage, "clients.title")}
        </h2>
        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
          {getTranslation(systemLanguage, "clients.subtitle")}
        </p>
      </div>

      {/* 2. Control search & filter bar */}
      <div className="glass-panel p-6 rounded-[28px] border-2 border-emerald-450 bg-white shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          
          {/* Saturated & Prominent Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-emerald-600 stroke-[2.5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(systemLanguage, "clients.filter.search")}
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-emerald-50/15 border-2 border-emerald-250 text-xs text-slate-800 placeholder:text-slate-400 font-extrabold focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner"
            />
          </div>

          {/* Register New Client Button */}
          <button
            type="button"
            onClick={() => setShowRegisterDrawer(true)}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-emerald-700 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-500/10 hover:scale-[1.02] active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="h-4.5 w-4.5 text-emerald-100 stroke-[2.5]" />
            {systemLanguage === "sk" ? "Registrovať klienta" : systemLanguage === "hu" ? "Ügyfél regisztráció" : "Register Client"}
          </button>

          {/* Saturated Client Type Selector */}
          <div className="relative w-full sm:w-[180px] shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 text-slate-700 rounded-2xl px-4 py-3 shadow-sm hover:border-slate-300 transition-colors">
              <Users className="h-4.5 w-4.5 text-slate-400 shrink-0" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-transparent text-[11px] font-black text-slate-700 focus:outline-none cursor-pointer uppercase tracking-wider w-full select-none"
              >
                <option value="all" className="bg-white text-slate-700">{t("All Types", "Všetky typy", "Minden típus")}</option>
                <option value="person" className="bg-white text-slate-700">{t("Person", "Osoba", "Személy")}</option>
                <option value="business" className="bg-white text-slate-700">{t("Business", "Firma", "Cég")}</option>
                <option value="partner" className="bg-white text-slate-700">{t("Partner", "Partner", "Partner")}</option>
              </select>
            </div>
          </div>

          {/* Saturated Toggle Filters Drawer Button */}
          <button
            type="button"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-center shadow-sm shrink-0 active:scale-95 ${
              showFilterDrawer
                ? "bg-emerald-700 text-white border-emerald-800 shadow-md shadow-emerald-700/25"
                : "bg-slate-50 border-slate-250 text-slate-550 hover:bg-slate-100 hover:text-slate-800"
            }`}
            title={showFilterDrawer ? t("Close Filters Drawer", "Zavrieť panel filtrov", "Szűrőpanel bezárása") : t("Open Filters Drawer", "Otvoriť panel filtrov", "Szűrőpanel megnyitása")}
          >
            <SlidersHorizontal className="h-4.5 w-4.5 stroke-[2.5]" />
          </button>

        </div>

        {/* Collapsible Filter Panel (Collapses smoothly using modern CSS grid/height transitions) */}
        <div className={`grid transition-all duration-350 ease-in-out ${showFilterDrawer ? "grid-rows-[1fr] opacity-100 border-t border-slate-150 pt-4" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
          <div className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1">
              
              {/* City Location Filter */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider pl-0.5">{t("Filter by City Location", "Filtrovať podľa mesta", "Szűrés város szerint")}</label>
                <div className="relative">
                  <select
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 font-extrabold text-xs text-slate-700 uppercase tracking-wide cursor-pointer appearance-none"
                  >
                    <option value="">{getTranslation(systemLanguage, "clients.filter.city")}</option>
                    {uniqueCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Account PM Manager Filter */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider pl-0.5">{t("Filter by Account Manager (PM)", "Filtrovať podľa manažéra (PM)", "Szűrés ügyfélmenedzser szerint (PM)")}</label>
                <div className="relative">
                  <select
                    value={filterPM}
                    onChange={(e) => setFilterPM(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 font-extrabold text-xs text-slate-700 uppercase tracking-wide cursor-pointer appearance-none"
                  >
                    <option value="">{getTranslation(systemLanguage, "clients.filter.pm")}</option>
                    {projectManagers.map(pm => (
                      <option key={pm} value={pm}>{pm}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 3. Clients Data Grid Table */}
      <div className="glass-panel rounded-[28px] border-2 border-emerald-450 bg-white shadow-xl overflow-hidden">
        <div className="overflow-x-auto lg:overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse text-left block lg:table">
            <thead className="hidden lg:table-header-group">
              <tr className="bg-white text-emerald-700 text-[10px] font-black uppercase tracking-wider">
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tl-[24px] border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.client")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{t("Contact Phone", "Kontaktný telefón", "Kapcsolattartó telefon")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "login.email")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.city")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.type")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "leads.table.pm")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 text-center border-b-2 border-slate-100">{getTranslation(systemLanguage, "clients.card.leads_count")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tr-[24px] text-right border-b-2 border-slate-100">{getTranslation(systemLanguage, "clients.card.total_value")}</th>
              </tr>
            </thead>

            <tbody className="divide-y-0 lg:divide-y lg:divide-emerald-100 text-xs block lg:table-row-group">
              {processedClients.length === 0 ? (
                <tr className="block lg:table-row">
                  <td colSpan={8} className="py-16 px-6 text-center text-slate-400 block lg:table-cell w-full lg:w-auto">
                    <div className="text-2xl mb-2 animate-bounce">👥</div>
                    <div className="font-black text-slate-700 uppercase tracking-wider">{t("No registered clients found", "Nenašli sa žiadni registrovaní klienti", "Nem található regisztrált ügyfél")}</div>
                    <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">{t("We aggregate clients automatically from your leads database.", "Klientov automaticky agregujeme z vašej databázy leadov.", "Az ügyfeleket automatikusan összesítjük a lead-adatbázisából.")}</div>
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => (
                  <tr 
                    key={client.name}
                    onClick={() => { window.location.hash = `client-${encodeURIComponent(client.name)}`; }}
                    className="block lg:table-row border-b-4 border-slate-200/80 lg:border-b lg:border-emerald-50/60 p-4 lg:p-0 hover:bg-emerald-50/40 transition-colors duration-150 cursor-pointer group"
                  >
                    
                    {/* Client Name & initials */}
                    <td className="block lg:table-cell py-1.5 lg:py-3.5 px-0 lg:px-6 font-bold text-slate-900 mb-2 lg:mb-0 w-full lg:w-auto">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white border border-emerald-700 font-heading font-black text-[9px] flex items-center justify-center shrink-0 shadow">
                          {getInitials(client.name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="line-clamp-1 group-hover:text-emerald-700 transition-colors font-black text-sm lg:text-xs text-slate-850">{client.name}</span>
                          {client.categories && client.categories.length > 0 && (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider line-clamp-1 mt-0.5">
                              {client.categories.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      {client.phone ? (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-500 stroke-[2.5]" /> {client.phone}</span>
                      ) : (
                        <span className="text-slate-350 italic">{t("None", "Žiadne", "Nincs")}</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      {client.email ? (
                        <span className="flex items-center gap-1 truncate max-w-[140px]"><Mail className="h-3 w-3 text-emerald-500 stroke-[2.5]" /> {client.email}</span>
                      ) : (
                        <span className="text-slate-350 italic">{t("None", "Žiadne", "Nincs")}</span>
                      )}
                    </td>

                    {/* City location / address */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-emerald-500 stroke-[2.5] shrink-0" />
                        <span className="line-clamp-1 text-slate-650">
                          {client.street ? `${client.street}, ` : ""}
                          {client.city || ""}
                          {client.country ? ` (${client.country})` : ""}
                        </span>
                      </div>
                    </td>

                    {/* Client Type badge */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 mr-3.5">
                      {client.clientType === "business" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-600 text-white border border-emerald-700 shadow-sm animate-fade-in">
                          <Briefcase className="h-2.5 w-2.5 text-white" /> {t("Business", "Firma", "Cég")}
                        </span>
                      )}
                      {client.clientType === "partner" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-500 text-white border border-amber-600 shadow-sm animate-fade-in">
                          <Handshake className="h-2.5 w-2.5 text-white" /> {t("Partner", "Partner", "Partner")}
                        </span>
                      )}
                      {client.clientType === "person" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500 text-white border border-emerald-600 shadow-sm animate-fade-in">
                          <User className="h-2.5 w-2.5 text-white" /> {t("Person", "Osoba", "Személy")}
                        </span>
                      )}
                    </td>

                    {/* PM Manager */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-slate-700 font-black mr-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">PM:</span>
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
                          <span>{client.owner}</span>
                        </div>
                      </div>
                    </td>

                    {/* Deals count */}
                    <td className="inline-flex items-center lg:table-cell py-1 lg:py-3.5 px-0 lg:px-4 text-center mr-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">{t("Deals", "Obchody", "Üzletek")}:</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white border border-emerald-600 shadow">
                          <Layers className="h-3 w-3 text-white" /> {client.leadsCount}
                        </span>
                      </div>
                    </td>

                    {/* Total Value */}
                    <td className="inline-flex items-center lg:table-cell py-1.5 lg:py-3.5 px-0 lg:px-6 font-heading font-black text-emerald-700 text-sm w-full lg:w-auto mt-1 lg:mt-0 pt-2 lg:pt-3.5 border-t border-slate-50 lg:border-t-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-slate-400 lg:hidden uppercase tracking-wider">{t("Worth", "Hodnota", "Érték")}:</span>
                        <span className="font-heading font-black text-emerald-700 text-sm">
                          {money(client.totalValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {processedClients.length > 50 && (
          <div className="bg-white border-t border-slate-100 px-4 py-3 flex items-center justify-between sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-slate-200 text-xs font-bold rounded-xl text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {t("Previous", "Predchádzajúca", "Előző")}
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(processedClients.length / 50)))}
                disabled={currentPage === Math.ceil(processedClients.length / 50)}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-200 text-xs font-bold rounded-xl text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {t("Next", "Ďalšia", "Következő")}
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {t("Showing", "Zobrazuje sa", "Megjelenítve")} <span className="text-emerald-700 font-extrabold">{(currentPage - 1) * 50 + 1}</span> {t("to", "až", "–")} <span className="text-emerald-700 font-extrabold">{Math.min(currentPage * 50, processedClients.length)}</span> {t("of", "z", "/")} <span className="text-emerald-700 font-extrabold">{processedClients.length}</span> {t("results", "výsledkov", "találat")}
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label={t("Pagination", "Stránkovanie", "Lapozás")}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    <span className="sr-only">{t("Previous", "Predchádzajúca", "Előző")}</span>
                    <ChevronLeft className="h-4 w-4 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.ceil(processedClients.length / 50) }, (_, i) => i + 1).map((pageNum) => {
                    const isFirstOrLast = pageNum === 1 || pageNum === Math.ceil(processedClients.length / 50);
                    const isClose = Math.abs(pageNum - currentPage) <= 1;
                    if (!isFirstOrLast && !isClose) {
                      if (pageNum === 2 || pageNum === Math.ceil(processedClients.length / 50) - 1) {
                        return (
                          <span key={`ellipse-${pageNum}`} className="relative inline-flex items-center px-3 py-2 border border-slate-200 bg-white text-xs font-bold text-slate-500">
                            ...
                          </span>
                        );
                      }
                      return null;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        aria-current={currentPage === pageNum ? "page" : undefined}
                        className={cn(
                          "relative inline-flex items-center px-3 py-2 border text-xs font-bold transition-colors",
                          currentPage === pageNum
                            ? "z-10 bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-emerald-50/50 hover:text-emerald-700"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(processedClients.length / 50)))}
                    disabled={currentPage === Math.ceil(processedClients.length / 50)}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    <span className="sr-only">{t("Next", "Ďalšia", "Következő")}</span>
                    <ChevronRight className="h-4 w-4 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}

        <div className="bg-emerald-50/20 border-t-2 border-emerald-100 p-4 flex items-center justify-between text-[10px] text-slate-500 font-black uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-emerald-600 stroke-[2.5]" />
            <span>{t("Click any client row to inspect profile details & timeline logs", "Kliknutím na riadok klienta zobrazíte detaily profilu a záznamy časovej osi", "Kattintson egy ügyfélsorra a profiladatok és az idővonal megtekintéséhez")}</span>
          </div>
          <div>
            {t("Total", "Spolu", "Összesen")} <strong className="text-emerald-700">{processedClients.length}</strong> {t("unique clients", "jedinečných klientov", "egyedi ügyfél")}
          </div>
        </div>
      </div>

      {/* TIMELINE EMAIL DETAIL SLIDEOUT OVERLAY */}
      {(selectedTimelineEmail || isClosingEmailDetail) && typeof document !== "undefined" && createPortal(
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[9999] flex flex-col justify-start ${isClosingEmailDetail ? "animate-fade-out" : "animate-fade-in"}`}>
          
          <div className={`w-full max-w-4xl mx-auto bg-white rounded-b-[28px] border-b-2 border-slate-200 shadow-2xl flex flex-col relative overflow-hidden h-[75vh] max-h-[80vh] ${isClosingEmailDetail ? "animate-slide-out-top" : "animate-slide-in-top"}`}>
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="text-left min-w-0 flex-1 pr-4">
                <span className="text-[10px] font-black uppercase text-pink-500 tracking-wider">{t("Email Correspondence", "E-mailová korešpondencia", "E-mail levelezés")}</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight truncate">{selectedTimelineEmail.title}</h3>
              </div>
              <button
                onClick={closeEmailDetailSlideout}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Body / parsed content */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col">
              {isLoadingEmailDetail ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400 my-auto">
                  <Loader2 className="animate-spin text-pink-500" size={24} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">{t("Loading mail contents...", "Načítavam obsah e-mailu...", "Levél tartalmának betöltése...")}</span>
                </div>
              ) : timelineEmailDetailBody ? (
                <div className="flex-1 flex flex-col justify-between">
                  <div className="border-b border-slate-150 pb-3 mb-4 text-left">
                    <p className="text-[10px] text-slate-550 font-bold">
                      {t("Subject", "Predmet", "Tárgy")}: <strong className="text-slate-800">{selectedTimelineEmail.title}</strong>
                    </p>
                    <p className="text-[10px] text-slate-550 font-bold mt-1">
                      {t("Date", "Dátum", "Dátum")}: <span className="text-slate-700">{selectedTimelineEmail.timestamp}</span>
                    </p>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    {timelineEmailDetailBody.html ? (
                      <iframe 
                        className="w-full h-full min-h-[400px] border-0 rounded-2xl bg-transparent"
                        title={t("Timeline parsed mail content", "Spracovaný obsah e-mailu z časovej osi", "Idővonal feldolgozott e-mail tartalma")}
                        sandbox=""
                        srcDoc={`
                          <html>
                            <head>
                              <style>
                                body {
                                  font-family: system-ui, -apple-system, sans-serif;
                                  color: #0f172a;
                                  background-color: transparent;
                                  line-height: 1.6;
                                  font-size: 13px;
                                }
                                a { color: #db2777; text-decoration: none; }
                                a:hover { text-decoration: underline; }
                                blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; margin: 12px 0; }
                              </style>
                            </head>
                            <body>
                              ${timelineEmailDetailBody.html}
                            </body>
                          </html>
                        `}
                      />
                    ) : (
                      <div className="text-left text-xs text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed select-text p-4 bg-slate-50 rounded-2xl border border-slate-150">
                        {timelineEmailDetailBody.text || t("No message content.", "Žiadny obsah správy.", "Nincs üzenettartalom.")}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-400 py-12 text-xs font-semibold my-auto">
                  {t("No message content.", "Žiadny obsah správy.", "Nincs üzenettartalom.")}
                </div>
              )}
            </div>
          </div>

          {/* Backdrop click close target */}
          <div className="flex-1 w-full" onClick={closeEmailDetailSlideout} />
        </div>,
        document.body
      )}

      {/* REGISTER NEW CLIENT SLIDEOUT OVERLAY */}
      {(showRegisterDrawer || isClosingRegisterDrawer) && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex flex-col justify-end ${isClosingRegisterDrawer ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="flex-1" onClick={closeRegisterDrawer} />
          
          <div className={`w-full max-w-4xl mx-auto bg-white rounded-t-[32px] border-t-2 border-emerald-450 shadow-2xl flex flex-col relative max-h-[85vh] ${isClosingRegisterDrawer ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-6 py-5 rounded-t-[30px] flex items-center justify-between shrink-0">
              <div className="text-left">
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">{systemName} CRM System</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight text-slate-800">
                  {systemLanguage === "sk" ? "Registrovať Nového Klienta" : systemLanguage === "hu" ? "Új Ügyfél Regisztrálása" : "Register New Client"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeRegisterDrawer}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Form Body */}
            <form onSubmit={handleRegisterClient} className="flex-1 overflow-y-auto p-6 space-y-6 text-left text-xs font-bold text-slate-700">
              {/* Basic Details Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {systemLanguage === "sk" ? "Základné Informácie" : systemLanguage === "hu" ? "Alapvető Információk" : "Basic Information"}
                </h4>

                {/* Client Type Radio Group */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-left">
                    <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider">
                      {systemLanguage === "sk" ? "Typ klienta" : systemLanguage === "hu" ? "Ügyfél típusa" : "Client Type"}
                    </span>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {systemLanguage === "sk" ? "Vyberte typ registrovaného subjektu" : systemLanguage === "hu" ? "Válassza ki a regisztrált alany típusát" : "Choose the type of entity to register"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/60 shrink-0">
                    {[
                      { id: "business", label: systemLanguage === "sk" ? "Firma" : systemLanguage === "hu" ? "Cég" : "Company" },
                      { id: "person", label: systemLanguage === "sk" ? "Fyzická osoba" : systemLanguage === "hu" ? "Magánszemély" : "Person" },
                      { id: "partner", label: systemLanguage === "sk" ? "Partner" : systemLanguage === "hu" ? "Partner" : "Partner" }
                    ].map(opt => {
                      const active = newClientType === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5 select-none",
                            active 
                              ? "bg-white text-emerald-700 shadow-sm border border-slate-200/50" 
                              : "text-slate-450 hover:text-slate-600 border border-transparent"
                          )}
                        >
                          <input
                            type="radio"
                            name="newClientType"
                            value={opt.id}
                            checked={active}
                            onChange={() => setNewClientType(opt.id as any)}
                            className="sr-only"
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Krajina" : systemLanguage === "hu" ? "Ország" : "Country"}
                    </label>
                    <select
                      value={newClientCountry}
                      onChange={(e) => setNewClientCountry(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold cursor-pointer"
                    >
                      {europeanCountries.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="md:col-span-2 space-y-1 relative">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Meno klienta *" : systemLanguage === "hu" ? "Ügyfél neve *" : "Client Name *"}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={newClientName}
                        onChange={handleNameChange}
                        placeholder={systemLanguage === "sk" ? "napr. Ján Novák alebo Acme Corp" : systemLanguage === "hu" ? "pl. Kiss János vagy Acme Corp" : "e.g. Ján Novák or Acme Corp"}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold pr-9"
                      />
                      {isLoadingSuggestions && activeSuggestionInput === "name" && (
                        <div className="absolute right-3 top-2.5">
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                        </div>
                      )}
                    </div>
                    {activeSuggestionInput === "name" && suggestions.length > 0 && (
                      <div 
                        ref={dropdownRef}
                        className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-[999]"
                      >
                        {suggestions.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => handleSelectSuggestion(item)}
                            className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 text-left cursor-pointer"
                          >
                            <div className="font-bold text-slate-800 text-[11px]">{stripHtml(item.entityName)}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.entNumber && `IČO: ${item.entNumber}`}
                              {item.entNumber && item.taxNumber && " | "}
                              {item.taxNumber && `DIČ: ${item.taxNumber}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="md:col-span-1 space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? `Odhadovaná hodnota (${currencySymbol})` : systemLanguage === "hu" ? `Becsült érték (${currencySymbol})` : `Estimated Worth (${currencySymbol})`}
                    </label>
                    <input
                      type="number"
                      value={newClientValue}
                      onChange={(e) => setNewClientValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Telefónne číslo" : systemLanguage === "hu" ? "Telefonszám" : "Phone Number"}
                    </label>
                    <input
                      type="text"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      placeholder="+421..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "E-mailová adresa" : systemLanguage === "hu" ? "E-mail cím" : "Email Address"}
                    </label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="client@email.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Priradený PM manažér" : systemLanguage === "hu" ? "Hozzárendelt PM menedzser" : "Assigned PM Manager"}
                    </label>
                    <select
                      value={newClientOwner}
                      onChange={(e) => setNewClientOwner(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold cursor-pointer"
                    >
                      {projectManagers.map(pm => (
                        <option key={pm} value={pm}>{pm}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Address Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {systemLanguage === "sk" ? "Adresa a Lokalita" : systemLanguage === "hu" ? "Cím és Elhelyezkedés" : "Address & Location"}
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Ulica a číslo" : systemLanguage === "hu" ? "Utca, házszám" : "Street Address"}
                    </label>
                    <input
                      type="text"
                      value={newClientStreet}
                      onChange={(e) => setNewClientStreet(e.target.value)}
                      placeholder={systemLanguage === "sk" ? "napr. Mlynské Nivy 42" : systemLanguage === "hu" ? "pl. Mlynské Nivy 42" : "e.g. Mlynské Nivy 42"}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Mesto" : systemLanguage === "hu" ? "Város" : "City"}
                    </label>
                    <input
                      type="text"
                      value={newClientCity}
                      onChange={(e) => setNewClientCity(e.target.value)}
                      placeholder={systemLanguage === "sk" ? "napr. Bratislava" : systemLanguage === "hu" ? "pl. Pozsony" : "e.g. Bratislava"}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "PSČ" : systemLanguage === "hu" ? "Irányítószám" : "Postal Code"}
                    </label>
                    <input
                      type="text"
                      value={newClientPostalCode}
                      onChange={(e) => setNewClientPostalCode(e.target.value)}
                      placeholder={systemLanguage === "sk" ? "napr. 82109" : systemLanguage === "hu" ? "pl. 82109" : "e.g. 82109"}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1 md:col-span-4">
                    <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                      {systemLanguage === "sk" ? "Zaujímavé kategórie" : systemLanguage === "hu" ? "Érdeklődési kategóriák" : "Interested Categories"}
                    </label>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {leadCategories.map(cat => {
                        const isSelected = newClientCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setNewClientCategories(newClientCategories.filter(c => c !== cat));
                              } else {
                                setNewClientCategories([...newClientCategories, cat]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Corporate Register Section (Only for Business/Partner) */}
              {newClientType !== "person" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
                  <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {systemLanguage === "sk" ? "Firemné Registre" : systemLanguage === "hu" ? "Céges adatok" : "Corporate Registers"}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1 relative">
                      <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                        {systemLanguage === "sk" ? "IČO (Identifikačné číslo)" : systemLanguage === "hu" ? "Cégjegyzékszám (IČO)" : "Company ID (IČO)"}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newClientCompanyId}
                          onChange={handleCompanyIdChange}
                          placeholder={t("e.g. 36123456", "napr. 36123456", "pl. 36123456")}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold pr-9"
                        />
                        {isLoadingSuggestions && activeSuggestionInput === "companyId" && (
                          <div className="absolute right-3 top-2.5">
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          </div>
                        )}
                      </div>
                      {activeSuggestionInput === "companyId" && suggestions.length > 0 && (
                        <div 
                          ref={dropdownRef}
                          className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-[999]"
                        >
                          {suggestions.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              onClick={() => handleSelectSuggestion(item)}
                              className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 text-left cursor-pointer"
                            >
                              <div className="font-bold text-slate-800 text-[11px]">{stripHtml(item.entityName)}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {item.entNumber && `IČO: ${item.entNumber}`}
                                {item.entNumber && item.taxNumber && " | "}
                                {item.taxNumber && `DIČ: ${item.taxNumber}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                        {systemLanguage === "sk" ? "DIČ (Daňové registračné číslo)" : systemLanguage === "hu" ? "Adószám (DIČ)" : "Tax ID (DIČ)"}
                      </label>
                      <input
                        type="text"
                        value={newClientTaxId}
                        onChange={(e) => setNewClientTaxId(e.target.value)}
                        placeholder={t("e.g. 2021234567", "napr. 2021234567", "pl. 2021234567")}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                        {systemLanguage === "sk" ? "IČ DPH" : systemLanguage === "hu" ? "Közösségi adószám (IČ DPH)" : "VAT ID (IČ DPH)"}
                      </label>
                      <input
                        type="text"
                        value={newClientVatId}
                        onChange={(e) => setNewClientVatId(e.target.value)}
                        onBlur={() => validateVatCode(newClientVatId, false)}
                        placeholder={t("e.g. SK2021234567", "napr. SK2021234567", "pl. SK2021234567")}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                      />
                      {renderVatValidation(newClientVatStatus, newClientVatResult)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                        {systemLanguage === "sk" ? "Kontaktná osoba" : systemLanguage === "hu" ? "Kapcsolattartó személy" : "Contact Person"}
                      </label>
                      <input
                        type="text"
                        value={newClientContactPerson}
                        onChange={(e) => setNewClientContactPerson(e.target.value)}
                        placeholder={systemLanguage === "sk" ? "napr. Ing. Ján Novák" : systemLanguage === "hu" ? "pl. Kiss János" : "e.g. Ing. Ján Novák"}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-455 uppercase tracking-wider block">
                        {systemLanguage === "sk" ? "Webstránka" : systemLanguage === "hu" ? "Weboldal" : "Website URL"}
                      </label>
                      <input
                        type="text"
                        value={newClientWebsite}
                        onChange={(e) => setNewClientWebsite(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeRegisterDrawer}
                  className="px-5 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  {systemLanguage === "sk" ? "Zrušiť" : systemLanguage === "hu" ? "Mégse" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                  {systemLanguage === "sk" ? "Vytvoriť profil" : systemLanguage === "hu" ? "Profil létrehozása" : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
