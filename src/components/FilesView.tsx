import React, { useState, useMemo } from "react";
import { 
  FolderOpen, FileText, Search, Clock, User, Euro, 
  ArrowRight, Download, Handshake, Receipt
} from "lucide-react";
import type { Lead } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface FilesViewProps {
  leads: Lead[];
  systemLanguage: Language;
}

export const FilesView: React.FC<FilesViewProps> = ({ leads, systemLanguage }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "offer" | "contract" | "invoice">("all");
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");

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
    }> = [];

    leads.forEach(lead => {
      if (lead.timeline && lead.timeline.length > 0) {
        lead.timeline.forEach(event => {
          if (event.type === "offer" && event.fileName) {
            files.push({
              id: event.id,
              fileName: event.fileName,
              fileType: event.fileType || "offer",
              fileSize: event.fileSize || "Unknown size",
              clientName: lead.name,
              uploadedAt: event.timestamp,
              offerValue: event.amount || 0
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
          textLabel: "Offer Sheet"
        };
      case "contract":
        return {
          icon: <Handshake className="h-3.5 w-3.5" />,
          badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
          iconContainer: "bg-blue-600 border-blue-700",
          textLabel: "Contract"
        };
      case "invoice":
        return {
          icon: <Receipt className="h-3.5 w-3.5" />,
          badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
          iconContainer: "bg-rose-600 border-rose-700",
          textLabel: "Invoice"
        };
    }
  };

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800 pb-16 relative">
      
      {/* Title Header */}
      <div className="flex items-center justify-between border-b-2 border-slate-150 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-700 text-white flex items-center justify-center shadow-lg shadow-amber-600/35 shrink-0 border-2 border-amber-800">
            <FolderOpen className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-black text-slate-900 uppercase tracking-tight">{getTranslation(systemLanguage, "files.title")}</h2>
            <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-0.5">{getTranslation(systemLanguage, "files.subtitle")}</p>
          </div>
        </div>
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
                {type === "all" && <FolderOpen className="h-3.5 w-3.5" />}
                {type === "offer" && <Euro className="h-3.5 w-3.5 text-emerald-500" />}
                {type === "contract" && <Handshake className="h-3.5 w-3.5 text-blue-500" />}
                {type === "invoice" && <Receipt className="h-3.5 w-3.5 text-rose-500" />}
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
                        <div className="flex items-center gap-2.5">
                          <div className={`h-7 w-7 rounded-lg text-white border font-heading font-black text-[9px] flex items-center justify-center shrink-0 shadow ${typeProps.iconContainer}`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="line-clamp-1 font-black text-slate-850 group-hover:text-amber-850 transition-colors">{file.fileName}</span>
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
                          <span>&euro; {file.offerValue.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-350 italic">None</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a 
                            href={`#client-${encodeURIComponent(file.clientName)}`}
                            className="px-2.5 py-1.5 rounded-xl border border-slate-300 hover:border-amber-700 hover:text-amber-800 transition-all text-[8px] font-black uppercase text-slate-600 flex items-center gap-1 bg-white shadow-sm"
                            title="Open Client details sheet"
                          >
                            <span>{getTranslation(systemLanguage, "files.btn_client")}</span>
                            <ArrowRight className="h-3 w-3 stroke-[2.5]" />
                          </a>
                          <a 
                            href={`/uploads/${file.id}_${file.fileName}`}
                            download={file.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white transition-all text-[8px] font-black uppercase flex items-center gap-1 shadow-sm inline-flex items-center cursor-pointer"
                            title="Download offer document"
                          >
                            <Download className="h-3 w-3 stroke-[2.5]" />
                            <span>{getTranslation(systemLanguage, "files.btn_view")}</span>
                          </a>
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

    </div>
  );
};
