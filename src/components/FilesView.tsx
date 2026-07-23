import React, { useState, useMemo } from "react";
import { 
  FolderOpen, FileText, Search, Clock, User, Euro, 
  ArrowRight, Download, Handshake, Receipt, Plus, X, UploadCloud, File, Trash, Loader2, Eye
} from "lucide-react";
import type { Lead } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";
import { formatBytes } from "../utils/formatBytes";
import { formatMoney } from "../utils/currency";
import { nowLocalStamp } from "../utils/localTime";

interface QueuedFile {
  id: string;
  file: File;
  category: "offer" | "contract" | "invoice";
  clientId: string;
  description: string;
  amount: string;
}

interface FilesViewProps {
  leads: Lead[];
  setLeads: (updater: Lead[] | ((prev: Lead[]) => Lead[])) => void;
  systemLanguage: Language;
  currencyCode?: string | null;
}

export const FilesView: React.FC<FilesViewProps> = ({ leads, setLeads, systemLanguage, currencyCode }) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const money = (value: number, opts?: Intl.NumberFormatOptions) => formatMoney(value, currencyCode, systemLanguage, opts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "offer" | "contract" | "invoice">("all");
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");

  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [isClosingUpload, setIsClosingUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Suggestions search tag state
  const [searchInputs, setSearchInputs] = useState<Record<string, string>>({});
  const [focusedQueueInputId, setFocusedQueueInputId] = useState<string | null>(null);

  const handleSearchInputChange = (queueFileId: string, value: string) => {
    setSearchInputs(prev => ({ ...prev, [queueFileId]: value }));
  };

  const handleSearchInputFocus = (queueFileId: string) => {
    setFocusedQueueInputId(queueFileId);
  };

  const handleSearchInputBlur = () => {
    setTimeout(() => {
      setFocusedQueueInputId(null);
    }, 250);
  };

  const selectSuggestion = (queueFileId: string, lead: Lead) => {
    handleQueueChange(queueFileId, "clientId", lead.id);
    setSearchInputs(prev => ({ ...prev, [queueFileId]: "" }));
    setFocusedQueueInputId(null);
  };

  const getSuggestions = (queueFileId: string) => {
    const query = (searchInputs[queueFileId] || "").toLowerCase().trim();
    const validLeads = leads.filter(l => l.id !== "unassigned-docs");
    
    if (!query) {
      return [...validLeads]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 5);
    }
    return [...validLeads]
      .filter(lead => lead.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const closeUploadDrawer = () => {
    setIsClosingUpload(true);
    setTimeout(() => {
      setIsUploadDrawerOpen(false);
      setIsClosingUpload(false);
      setUploadQueue([]);
      setSearchInputs({});
      setFocusedQueueInputId(null);
    }, 350);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const newQueuedFiles: QueuedFile[] = files.map(file => {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      return {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        category: "offer",
        clientId: "", // Default to empty (unattached)
        description: `Uploaded document: ${nameWithoutExt}`,
        amount: ""
      };
    });

    setUploadQueue(prev => [...prev, ...newQueuedFiles]);
  };

  const handleRemoveFromQueue = (id: string) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id));
    setSearchInputs(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleQueueChange = (id: string, field: keyof QueuedFile, value: any) => {
    setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // formatBytes is imported from ../utils/formatBytes

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadQueue.length === 0 || isUploading) return;

    setIsUploading(true);

    try {
      const uploadResults: Array<{
        queuedFile: QueuedFile;
        eventId: string;
        fileName: string;
        extractedText: string;
      }> = [];

      for (const item of uploadQueue) {
        const eventId = `ev-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("eventId", eventId);

        const res = await fetch("/upload.php", {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to upload: ${item.file.name}`);
        }

        const data = await res.json();
        if (data.success) {
          uploadResults.push({
            queuedFile: item,
            eventId,
            fileName: data.fileName || item.file.name,
            extractedText: data.extractedText || ""
          });
        } else {
          throw new Error(data.error || `Failed to save: ${item.file.name}`);
        }
      }

      setLeads((prevLeads: Lead[]) => {
        const hasUnassigned = prevLeads.some(l => l.id === "unassigned-docs");
        let baseLeads = prevLeads;
        if (!hasUnassigned) {
          const unassignedName = systemLanguage === "sk" 
            ? "Nepriradené dokumenty" 
            : systemLanguage === "hu"
              ? "Nem társított dokumentumok"
              : "Unassigned Documents";
              
          baseLeads = [...prevLeads, {
            id: "unassigned-docs",
            name: unassignedName,
            city: "",
            clientType: "person",
            status: "unassigned-docs",
            source: "system",
            owner: "System",
            value: 0,
            createdAt: new Date().toISOString().split("T")[0],
            timeline: []
          }];
        }

        return baseLeads.map(lead => {
          const leadUploads = uploadResults.filter(r => {
            const targetId = r.queuedFile.clientId || "unassigned-docs";
            return targetId === lead.id;
          });
          
          if (leadUploads.length === 0) return lead;

          const newEvents = leadUploads.map(r => {
            const { queuedFile, eventId, fileName, extractedText } = r;
            const category = queuedFile.category;
            const valNum = parseFloat(queuedFile.amount);

            let eventTitle = "Official Price Offer Sent";
            if (category === "contract") eventTitle = "Contract Signed";
            if (category === "invoice") eventTitle = "Invoice Issued";

            if (systemLanguage === "sk") {
              if (category === "offer") eventTitle = "Odoslaná cenová ponuka";
              if (category === "contract") eventTitle = "Podpísaná zmluva";
              if (category === "invoice") eventTitle = "Vystavená faktúra";
            } else if (systemLanguage === "hu") {
              if (category === "offer") eventTitle = "Árajánlat elküldve";
              if (category === "contract") eventTitle = "Szerződés aláírva";
              if (category === "invoice") eventTitle = "Számla kiállítva";
            }

            // The server only returns readable extracted text (its quality filter
            // drops binary/metadata noise), so append whatever survives.
            const baseDescription = queuedFile.description || `Uploaded ${category} document.`;
            const finalContent = extractedText
              ? `${baseDescription}\n\n--- Document Content ---\n${extractedText}`
              : baseDescription;

            return {
              id: eventId,
              type: "offer" as const,
              timestamp: nowLocalStamp(),
              title: eventTitle,
              content: finalContent,
              amount: isNaN(valNum) ? undefined : valNum,
              fileName: fileName,
              fileSize: formatBytes(queuedFile.file.size),
              fileType: category
            };
          });

          return {
            ...lead,
            timeline: [...newEvents, ...(lead.timeline || [])]
          };
        });
      });

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(
          systemLanguage === "sk" 
            ? `Úspešne nahraných ${uploadQueue.length} dokumentov!` 
            : systemLanguage === "hu"
              ? `Sikeresen feltöltve ${uploadQueue.length} dokumentum!`
              : `Successfully uploaded ${uploadQueue.length} documents!`
        );
      }

      closeUploadDrawer();
    } catch (err: any) {
      console.error(err);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(err.message || t("Failed to upload files.", "Nahranie súborov zlyhalo.", "A fájlok feltöltése sikertelen."));
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (eventId: string, fileName: string) => {
    const confirmMsg = systemLanguage === "sk"
      ? `Naozaj chcete vymazať súbor "${fileName}"?`
      : systemLanguage === "hu"
        ? `Biztosan törölni szeretné a(z) "${fileName}" fájlt?`
        : `Are you sure you want to delete the file "${fileName}"?`;
        
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/delete_file.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: `${eventId}_${fileName}` })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to delete file from server");
      }

      setLeads((prevLeads: Lead[]) => {
        return prevLeads.map(lead => {
          if (!lead.timeline) return lead;
          const updatedTimeline = lead.timeline.filter(event => event.id !== eventId);
          return {
            ...lead,
            timeline: updatedTimeline
          };
        });
      });

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(
          systemLanguage === "sk"
            ? "Súbor bol úspešne vymazaný"
            : systemLanguage === "hu"
              ? "A fájl sikeresen törölve"
              : "File deleted successfully"
        );
      }
    } catch (err: any) {
      console.error(err);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(err.message || t("Failed to delete file.", "Vymazanie súboru zlyhalo.", "A fájl törlése sikertelen."));
      }
    }
  };

  // Dynamic files aggregator: scan all client timelines for offer attachments
  const filesList = useMemo(() => {
    const files: Array<{
      id: string;
      fileName: string;
      fileSize: string;
      fileType: "offer" | "contract" | "invoice";
      clientName: string;
      uploadedAt: string;
      offerValue: number;
      summary: string;
    }> = [];

    leads.forEach(lead => {
      if (lead.timeline && lead.timeline.length > 0) {
        lead.timeline.forEach(event => {
          if (event.type === "offer" && event.fileName) {
            files.push({
              id: event.id,
              fileName: event.fileName,
              fileType: event.fileType || "offer",
              fileSize: event.fileSize || t("Unknown size", "Neznáma veľkosť", "Ismeretlen méret"),
              clientName: lead.name,
              uploadedAt: event.timestamp,
              offerValue: event.amount || 0,
              summary: event.content || ""
            });
          }
        });
      }
    });

    // Sort files by upload date (Newest First)
    return files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [leads]);

  // Extract unique client names dynamically
  const clientNames = useMemo(() => {
    const names = new Set(filesList.map(f => f.clientName));
    return Array.from(names).sort();
  }, [filesList]);

  // Filtered files for the datagrid
  const filteredFiles = useMemo(() => {
    return filesList.filter(file => {
      const matchesSearch = 
        file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.uploadedAt.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = selectedTypeFilter === "all" || file.fileType === selectedTypeFilter;
      const matchesClient = selectedClientFilter === "all" || file.clientName === selectedClientFilter;

      return matchesSearch && matchesType && matchesClient;
    });
  }, [filesList, searchQuery, selectedTypeFilter, selectedClientFilter]);

  // Helper to color-code files based on type
  const getFileTypeProps = (type: "offer" | "contract" | "invoice") => {
    switch (type) {
      case "offer":
        return {
          icon: <Euro className="h-3.5 w-3.5" />,
          badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
          iconContainer: "bg-emerald-600 border-emerald-700",
          textLabel: t("Offer Sheet", "Cenová ponuka", "Árajánlat")
        };
      case "contract":
        return {
          icon: <Handshake className="h-3.5 w-3.5" />,
          badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
          iconContainer: "bg-blue-600 border-blue-700",
          textLabel: t("Contract", "Zmluva", "Szerződés")
        };
      case "invoice":
        return {
          icon: <Receipt className="h-3.5 w-3.5" />,
          badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
          iconContainer: "bg-rose-600 border-rose-700",
          textLabel: t("Invoice", "Faktúra", "Számla")
        };
    }
  };

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-amber-600" /> {getTranslation(systemLanguage, "files.title")}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">{getTranslation(systemLanguage, "files.subtitle")}</p>
        </div>

        {/* Upload Documents Trigger Button */}
        <button
          type="button"
          onClick={() => setIsUploadDrawerOpen(true)}
          className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white transition-all text-xs font-black uppercase flex items-center gap-2 shadow-md shadow-amber-700/20 active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>
            {systemLanguage === "sk" 
              ? "Nahrať dokumenty" 
              : systemLanguage === "hu"
                ? "Dokumentumok feltöltése"
                : "Upload Documents"}
          </span>
        </button>
      </div>

      {/* 2. Amber Control Filter Bar with Always-Visible File Type Switcher */}
      <div className="glass-panel p-6 rounded-[28px] border-2 border-amber-450 bg-white shadow-lg space-y-4">
        
        {/* Always-visible file type pill selector */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{getTranslation(systemLanguage, "files.filter_label")}</label>
          <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-200">
            {(["all", "offer", "contract", "invoice"] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedTypeFilter(type)}
                className={`py-2 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
                  selectedTypeFilter === type 
                    ? "bg-amber-700 text-white border border-amber-800 shadow-md shadow-amber-700/20" 
                    : "text-slate-550 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200"
                }`}
              >
                {type === "all" && (
                  <FolderOpen className={`h-3.5 w-3.5 ${selectedTypeFilter === type ? "text-white" : "text-slate-650"}`} />
                )}
                {type === "offer" && (
                  <Euro className={`h-3.5 w-3.5 ${selectedTypeFilter === type ? "text-white" : "text-emerald-500"}`} />
                )}
                {type === "contract" && (
                  <Handshake className={`h-3.5 w-3.5 ${selectedTypeFilter === type ? "text-white" : "text-blue-500"}`} />
                )}
                {type === "invoice" && (
                  <Receipt className={`h-3.5 w-3.5 ${selectedTypeFilter === type ? "text-white" : "text-rose-500"}`} />
                )}
                <span>
                  {type === "all" && getTranslation(systemLanguage, "files.all")}
                  {type === "offer" && getTranslation(systemLanguage, "files.offers")}
                  {type === "contract" && getTranslation(systemLanguage, "files.contracts")}
                  {type === "invoice" && getTranslation(systemLanguage, "files.invoices")}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Search and Client Filter grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-amber-700 stroke-[2.5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(systemLanguage, "files.search_placeholder")}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-amber-50/10 border-2 border-amber-250 text-xs text-slate-800 placeholder:text-slate-400 font-bold focus:outline-none focus:bg-white focus:border-amber-700 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="relative w-full">
            <select
              value={selectedClientFilter}
              onChange={(e) => setSelectedClientFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-amber-50/10 border-2 border-amber-250 text-xs text-slate-850 font-bold focus:outline-none focus:bg-white focus:border-amber-700 focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">
                {systemLanguage === "sk" ? "Všetci klienti" : systemLanguage === "hu" ? "Minden ügyfél" : "All Clients"}
              </option>
              {clientNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Files Datagrid Table (Amber Light Brown styled) */}
      <div className="glass-panel rounded-[28px] border-2 border-amber-450 bg-white shadow-xl overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[75vh] scrollbar-thin">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-white text-amber-800 text-[10px] font-black uppercase tracking-wider">
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tl-[24px] border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_filename")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_type")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_client")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_date")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_size")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-4 border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_value")}</th>
                <th className="sticky top-0 bg-white z-10 py-4 px-6 rounded-tr-[24px] text-right border-b-2 border-slate-100">{getTranslation(systemLanguage, "files.th_actions")}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-amber-100 text-xs">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 px-6 text-center text-slate-400">
                    <div className="text-2xl mb-2 animate-bounce">📁</div>
                    <div className="font-black text-slate-700 uppercase tracking-wider">{getTranslation(systemLanguage, "files.no_docs")}</div>
                    <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">{getTranslation(systemLanguage, "files.no_docs_desc")}</div>
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  const typeProps = getFileTypeProps(file.fileType);
                  return (
                    <tr 
                      key={file.id}
                      className="hover:bg-amber-50/20 transition-colors duration-150 border-b border-amber-50/60 group"
                    >
                      
                      {/* File Name */}
                      <td className="py-3.5 px-6 font-bold text-slate-900">
                        <div className="flex items-start gap-2.5">
                          <div className={`h-7 w-7 rounded-lg text-white border font-heading font-black text-[9px] flex items-center justify-center shrink-0 shadow ${typeProps.iconContainer} mt-0.5`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="line-clamp-1 font-black text-slate-855 group-hover:text-amber-855 transition-colors">{file.fileName}</span>
                            {file.summary && (
                              <span className="text-[10px] text-slate-400 font-semibold truncate max-w-sm lg:max-w-md mt-0.5" title={file.summary}>
                                {file.summary}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Type Badge */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase border shadow-inner ${typeProps.badgeClass}`}>
                          {typeProps.icon}
                          <span>{typeProps.textLabel}</span>
                        </span>
                      </td>

                      {/* Associated Client */}
                      <td className="py-3.5 px-4 font-black text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-amber-700" />
                          <span>{file.clientName}</span>
                        </div>
                      </td>

                      {/* Uploaded date */}
                      <td className="py-3.5 px-4 text-slate-700 font-black">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-amber-700" />
                          <span>{file.uploadedAt}</span>
                        </div>
                      </td>

                      {/* File size */}
                      <td className="py-3.5 px-4 font-extrabold text-slate-400">
                        {file.fileSize}
                      </td>

                      {/* Offer Value */}
                      <td className="py-3.5 px-4 font-heading font-black text-amber-800 text-xs">
                        {file.offerValue > 0 ? (
                          <span>{money(file.offerValue)}</span>
                        ) : (
                          <span className="text-slate-350 italic">{t("None", "Žiadna", "Nincs")}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!(
                            file.clientName === "Unassigned Documents" ||
                            file.clientName === "Nepriradené dokumenty" ||
                            file.clientName === "Nem társított dokumentumok"
                          ) && (
                            <a 
                              href={`#client-${encodeURIComponent(file.clientName)}`}
                              className="px-2.5 py-1.5 rounded-xl border border-slate-300 hover:border-amber-700 hover:text-amber-800 transition-all text-[8px] font-black uppercase text-slate-600 flex items-center gap-1 bg-white shadow-sm"
                              title={t("Open Client details sheet", "Otvoriť kartu klienta", "Ügyfél adatlap megnyitása")}
                            >
                              <span>{getTranslation(systemLanguage, "files.btn_client")}</span>
                              <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if ((window as any).previewFile) {
                                (window as any).previewFile(`/uploads/${file.id}_${file.fileName}`, file.fileName);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-250 text-indigo-700 transition-all text-[8px] font-black uppercase flex items-center gap-1 shadow-sm cursor-pointer"
                            title={t("Preview file", "Náhľad súboru", "Fájl előnézete")}
                          >
                            <Eye className="h-3 w-3 stroke-[2.5]" />
                            <span>{getTranslation(systemLanguage, "files.btn_view")}</span>
                          </button>
                          <a 
                            href={`/uploads/${file.id}_${file.fileName}`}
                            download={file.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white transition-all text-[8px] font-black uppercase flex items-center gap-1 shadow-sm inline-flex items-center cursor-pointer"
                            title={t("Download offer document", "Stiahnuť dokument ponuky", "Ajánlati dokumentum letöltése")}
                          >
                            <Download className="h-3 w-3 stroke-[2.5]" />
                            <span>{systemLanguage === "sk" ? "Stiahnuť" : systemLanguage === "hu" ? "Letöltés" : "Download"}</span>
                          </a>
                          <button 
                            onClick={() => handleDeleteFile(file.id, file.fileName)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all cursor-pointer"
                            title={t("Delete file permanently", "Natrvalo vymazať súbor", "Fájl végleges törlése")}
                          >
                            <Trash className="h-4 w-4 stroke-[2.2]" />
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

        <div className="bg-amber-50/10 border-t-2 border-amber-100 p-4 flex items-center justify-between text-[10px] text-slate-500 font-black uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-700 stroke-[2.5]" />
            <span>{getTranslation(systemLanguage, "files.footer_note")}</span>
          </div>
          <div>
            {getTranslation(systemLanguage, "files.showing")} <strong className="text-amber-800">{filteredFiles.length}</strong> {getTranslation(systemLanguage, "files.showing_docs")}
          </div>
        </div>
      </div>

      {/* DOCUMENT UPLOAD SLIDEOUT DRAWER (slides up from bottom) */}
      {(isUploadDrawerOpen || isClosingUpload) && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end justify-center ${isClosingUpload ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="fixed inset-0 -z-10" onClick={closeUploadDrawer} />
          
          <div className={`w-full max-w-5xl h-[80vh] bg-white rounded-t-[32px] border-t border-slate-200/80 shadow-2xl p-8 flex flex-col justify-between text-left ${isClosingUpload ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">
                  {systemLanguage === "sk" ? "Systém správy dokumentov" : systemLanguage === "hu" ? "Dokumentumkezelő Rendszer" : "CRM Document Management"}
                </span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight">
                  {systemLanguage === "sk" ? "Nahrať nové dokumenty" : systemLanguage === "hu" ? "Új dokumentumok feltöltése" : "Upload New Documents"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeUploadDrawer}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body: Drag and Drop & Files Queue */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 mt-6 overflow-hidden min-h-0">
              {/* Drag & Drop Area */}
              <div className="w-full md:w-2/5 flex flex-col">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex-1 border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
                    isDragging 
                      ? "border-amber-700 bg-amber-50/30 scale-[0.99] shadow-inner" 
                      : "border-slate-350 hover:border-amber-700 hover:bg-amber-50/10"
                  }`}
                  onClick={() => document.getElementById("file-upload-input")?.click()}
                >
                  <input
                    id="file-upload-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <UploadCloud className={`h-12 w-12 text-amber-700 mb-3 ${isDragging ? "animate-bounce" : ""}`} />
                  <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    {systemLanguage === "sk" ? "Presuňte súbory sem" : systemLanguage === "hu" ? "Húzza ide a fájlokat" : "Drag & Drop files here"}
                  </p>
                  <p className="text-[10px] text-slate-500 font-extrabold uppercase mt-1">
                    {systemLanguage === "sk" ? "alebo kliknite pre výber" : systemLanguage === "hu" ? "vagy kattintson a tallózáshoz" : "or click to browse"}
                  </p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase mt-4 max-w-[200px]">
                    {systemLanguage === "sk" ? "Podporuje PDF, DOC, faktúry a iné súbory" : systemLanguage === "hu" ? "Támogatja a PDF, DOC, számlákat és más fájlokat" : "Supports PDF, DOC, invoices & general files"}
                  </p>
                </div>
              </div>

              {/* Files Queue List */}
              <div className="w-full md:w-3/5 flex flex-col border border-slate-200/80 rounded-[20px] overflow-hidden bg-slate-50/40">
                <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                    {systemLanguage === "sk" 
                      ? `Čakajúce súbory (${uploadQueue.length})` 
                      : systemLanguage === "hu" 
                        ? `Sorban álló fájlok (${uploadQueue.length})` 
                        : `Queued Files (${uploadQueue.length})`}
                  </span>
                  {uploadQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUploadQueue([])}
                      className="text-[8px] font-black uppercase text-rose-600 hover:text-rose-800 transition-colors"
                    >
                      {systemLanguage === "sk" ? "Vyčistiť frontu" : systemLanguage === "hu" ? "Sor kiürítése" : "Clear queue"}
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                  {uploadQueue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                      <File className="h-8 w-8 text-slate-350 mb-2 stroke-[1.5]" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        {systemLanguage === "sk" ? "Žiadne súbory vo fronte" : systemLanguage === "hu" ? "Nincsenek fájlok a sorban" : "No files queued yet"}
                      </span>
                    </div>
                  ) : (
                    uploadQueue.map((item) => {
                      return (
                        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group space-y-3">
                          {/* File info header */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                                <File className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate" title={item.file.name}>{item.file.name}</p>
                                <p className="text-[9px] text-slate-400 font-extrabold uppercase mt-0.5">{formatBytes(item.file.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromQueue(item.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                            >
                              <Trash size={14} />
                            </button>
                          </div>

                          {/* Options grid */}
                          <div className="grid grid-cols-2 gap-3 text-left">
                            {/* Client Dropdown with suggestions search and tags */}
                            <div className="space-y-1 relative">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                {systemLanguage === "sk" ? "Klient / lead" : systemLanguage === "hu" ? "Ügyfél / lead" : "Client / Lead"}
                              </label>
                              {item.clientId ? (
                                <div className="flex items-center">
                                  <div className="w-full inline-flex items-center justify-between gap-1.5 px-3 py-1.5 bg-amber-50/50 border border-amber-300/60 rounded-xl text-[10px] font-bold text-slate-700">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <User className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                      <span className="truncate">{leads.find(l => l.id === item.clientId)?.name || item.clientId}</span>
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleQueueChange(item.id, "clientId", "")}
                                      className="text-slate-400 hover:text-rose-600 p-0.5 hover:bg-slate-200/50 rounded-full cursor-pointer transition-colors"
                                    >
                                      <X className="h-3 w-3 stroke-[2.5]" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative">
                                  <input
                                    type="text"
                                    placeholder={systemLanguage === "sk" ? "Vyhľadať klienta..." : systemLanguage === "hu" ? "Ügyfél keresése..." : "Search client / lead..."}
                                    value={searchInputs[item.id] || ""}
                                    onChange={(e) => handleSearchInputChange(item.id, e.target.value)}
                                    onFocus={() => handleSearchInputFocus(item.id)}
                                    onBlur={handleSearchInputBlur}
                                    className="w-full px-2.5 py-1.5 border border-slate-205 rounded-xl text-[10px] font-bold bg-white focus:outline-none focus:border-amber-700"
                                  />
                                  {/* Suggestions dropdown */}
                                  {focusedQueueInputId === item.id && (
                                    <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-250 rounded-xl shadow-xl z-50 divide-y divide-slate-100 text-[10px]">
                                      {getSuggestions(item.id).length === 0 ? (
                                        <div className="p-2.5 text-slate-400 italic">
                                          {systemLanguage === "sk" ? "Žiadne výsledky" : systemLanguage === "hu" ? "Nincs találat" : "No results found"}
                                        </div>
                                      ) : (
                                        getSuggestions(item.id).map(lead => (
                                          <button
                                            key={lead.id}
                                            type="button"
                                            onClick={() => selectSuggestion(item.id, lead)}
                                            className="w-full text-left px-3 py-2 hover:bg-amber-50/20 font-bold text-slate-700 block transition-colors cursor-pointer"
                                          >
                                            {lead.name}
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Category Dropdown */}
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                {systemLanguage === "sk" ? "Kategória *" : systemLanguage === "hu" ? "Kategória *" : "Category *"}
                              </label>
                              <select
                                value={item.category}
                                onChange={(e) => handleQueueChange(item.id, "category", e.target.value)}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold bg-white focus:outline-none focus:border-amber-700"
                              >
                                <option value="offer">
                                  {systemLanguage === "sk" ? "Cenová ponuka" : systemLanguage === "hu" ? "Árajánlat" : "Offer Sheet"}
                                </option>
                                <option value="contract">
                                  {systemLanguage === "sk" ? "Zmluva" : systemLanguage === "hu" ? "Szerződés" : "Contract"}
                                </option>
                                <option value="invoice">
                                  {systemLanguage === "sk" ? "Faktúra" : systemLanguage === "hu" ? "Számla" : "Invoice"}
                                </option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-left">
                            {/* Description */}
                            <div className="col-span-2 space-y-1">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                {systemLanguage === "sk" ? "Popis / Poznámka" : systemLanguage === "hu" ? "Leírás / Megjegyzés" : "Description / Note"}
                              </label>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => handleQueueChange(item.id, "description", e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold focus:outline-none focus:border-amber-700"
                                placeholder={systemLanguage === "sk" ? "Stručný popis súboru" : systemLanguage === "hu" ? "Rövid leírás a fájlról" : "Brief file description"}
                              />
                            </div>

                            {/* Amount (only makes sense if offer/invoice, but show it optional anyway) */}
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                                {systemLanguage === "sk" ? "Hodnota (€)" : systemLanguage === "hu" ? "Érték (€)" : "Value (€)"}
                              </label>
                              <input
                                type="number"
                                value={item.amount}
                                onChange={(e) => handleQueueChange(item.id, "amount", e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-bold focus:outline-none focus:border-amber-700"
                                placeholder={t("e.g. 5200", "napr. 5200", "pl. 5200")}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-slate-150 pt-4 flex items-center justify-end gap-3 shrink-0 mt-6">
              <button
                type="button"
                onClick={closeUploadDrawer}
                disabled={isUploading}
                className="px-4 py-2 border border-slate-200 text-slate-650 hover:bg-slate-50 rounded-xl text-xs font-black uppercase transition-all duration-150 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {systemLanguage === "sk" ? "Zrušiť" : systemLanguage === "hu" ? "Mégse" : "Cancel"}
              </button>
              
              <button
                type="button"
                onClick={handleUploadSubmit}
                disabled={uploadQueue.length === 0 || isUploading}
                className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white transition-all text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-amber-700/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {systemLanguage === "sk" ? "Nahrávam..." : systemLanguage === "hu" ? "Feltöltés..." : "Uploading..."}
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    <span>
                      {systemLanguage === "sk" 
                        ? `Nahrať dokumenty (${uploadQueue.length})` 
                        : systemLanguage === "hu"
                          ? `Feltöltés (${uploadQueue.length})`
                          : `Upload Documents (${uploadQueue.length})`}
                    </span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
