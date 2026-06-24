import React, { useState } from "react";
import * as Icons from "lucide-react";
import { 
  Folder, FolderPlus, Plus, ChevronRight, Calendar, 
  FileText, Trash2, Edit3, Move, X, Download, 
  UploadCloud, Search, Briefcase, Users
} from "lucide-react";
import type { UnifiedEntryRegistry, UnifiedEntryRow } from "../types";

interface UnifiedEntryViewProps {
  registry: UnifiedEntryRegistry;
  rows: UnifiedEntryRow[];
  setRows: (updater: UnifiedEntryRow[] | ((prev: UnifiedEntryRow[]) => UnifiedEntryRow[])) => void;
  systemLanguage: "en" | "sk" | "hu";
  leads?: any[]; // Passed down from App to allow linking client
  subPath?: string | null;
}

// Resolved dynamically from Lucide Icons collection

export const UnifiedEntryView: React.FC<UnifiedEntryViewProps> = ({
  registry,
  rows,
  setRows,
  systemLanguage,
  leads = [],
  subPath = null
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals / Editors state
  const [isEditing, setIsEditing] = useState(false);
  const [editingRow, setEditingRow] = useState<UnifiedEntryRow | null>(null);
  const [editingIsFolder, setEditingIsFolder] = useState(false);

  const [isMoving, setIsMoving] = useState(false);
  const [movingItem, setMovingItem] = useState<UnifiedEntryRow | null>(null);

  // Form fields for entry creation/edit
  const [formTitle, setFormTitle] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formWarningDays, setFormWarningDays] = useState(0);
  const [formClientId, setFormClientId] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [formLeadId, setFormLeadId] = useState("");
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [isLeadDropdownOpen, setIsLeadDropdownOpen] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [formFile, setFormFile] = useState<{
    fileName: string;
    fileSize: string;
    fileType: string;
    filePath: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const currentFolderId = (subPath && subPath.startsWith("folder-"))
    ? subPath
    : (subPath && subPath.startsWith("entry-"))
      ? (rows.find(r => r.id === subPath)?.parentId || null)
      : null;

  const isEditingEntryView = subPath?.startsWith("entry-") || false;
  const editingEntryRow = isEditingEntryView ? (rows.find(r => r.id === subPath) || null) : null;

  React.useEffect(() => {
    if (subPath && subPath.startsWith("entry-")) {
      const entryRow = rows.find(r => r.id === subPath);
      if (entryRow) {
        setFormTitle(entryRow.title || "");
        setFormDueDate(entryRow.dueDate || "");
        setFormWarningDays(entryRow.warningDays || 0);
        setFormClientId(entryRow.clientId || "");
        const cl = entryRow.clientId ? leads.find(l => l.id === entryRow.clientId) : null;
        setClientSearchQuery(cl ? cl.name : "");
        setFormLeadId(entryRow.leadId || "");
        const ld = entryRow.leadId ? leads.find(l => l.id === entryRow.leadId) : null;
        setLeadSearchQuery(ld ? ld.name : "");
        setFormFile(entryRow.fileName ? {
          fileName: entryRow.fileName,
          fileSize: entryRow.fileSize || "",
          fileType: entryRow.fileType || "",
          filePath: entryRow.filePath || ""
        } : null);
      }
    }
  }, [subPath, rows, leads]);

  const isDueDateActive = registry.modules.includes("due_date") || (registry.foldersEnabled && registry.folderModules?.includes("due_date"));
  const isFileActive = registry.modules.includes("file") || (registry.foldersEnabled && registry.folderModules?.includes("file"));
  const isClientActive = registry.modules.includes("client") || (registry.foldersEnabled && registry.folderModules?.includes("client"));
  const isLeadActive = registry.modules.includes("lead") || (registry.foldersEnabled && registry.folderModules?.includes("lead"));

  const folderSingularEn = registry.folderName || "Folder";
  const folderSingularSk = registry.folderName || "priečinok";
  const entrySingularEn = registry.entryName || "Entry";
  const entrySingularSk = registry.entryName || "záznam";

  // Breadcrumbs path helper
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Root" }];
    let currentId = currentFolderId;
    const path: typeof crumbs = [];
    
    while (currentId) {
      const folder = rows.find(r => r.id === currentId && r.isFolder);
      if (folder) {
        path.unshift({ id: folder.id, name: folder.title || (systemLanguage === "sk" ? "Nepomenovaný " + folderSingularSk : "Unnamed " + folderSingularEn) });
        currentId = folder.parentId;
      } else {
        break;
      }
    }
    return [...crumbs, ...path];
  };

  const currentFolderRows = rows.filter(row => {
    // If searching, show all items matching query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = row.title?.toLowerCase().includes(q) ?? false;
      const fileMatch = row.fileName?.toLowerCase().includes(q) ?? false;
      return titleMatch || fileMatch;
    }
    return row.parentId === currentFolderId;
  });

  const getFoldersListExcept = (excludeId: string) => {
    // Return list of all folders except the excluded one and its nested children
    const getChildrenIds = (id: string): string[] => {
      const children = rows.filter(r => r.parentId === id);
      return [id, ...children.flatMap(c => getChildrenIds(c.id))];
    };
    const excludedIds = getChildrenIds(excludeId);
    return rows.filter(r => r.isFolder && !excludedIds.includes(r.id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const rowId = editingRow?.id || "row-" + Date.now();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", rowId); // upload.php requires eventId prefix

    try {
      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        // Format size
        const sizeStr = file.size > 1024 * 1024 
          ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
          : (file.size / 1024).toFixed(0) + " KB";
          
        setFormFile({
          fileName: data.fileName || file.name,
          fileSize: sizeStr,
          fileType: file.type,
          filePath: `/uploads/${rowId}_${data.fileName || file.name}`
        });
      } else {
        alert("Upload failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Failed to connect to upload service.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenCreateEntry = () => {
    setEditingRow(null);
    setEditingIsFolder(false);
    setFormTitle("");
    setFormDueDate("");
    setFormWarningDays(0);
    setFormClientId("");
    setClientSearchQuery("");
    setFormLeadId("");
    setLeadSearchQuery("");
    setFormFile(null);
    setIsEditing(true);
  };

  const handleOpenCreateFolder = () => {
    setEditingRow(null);
    setEditingIsFolder(true);
    setFormTitle("");
    setFormDueDate("");
    setFormWarningDays(0);
    setFormClientId("");
    setClientSearchQuery("");
    setFormLeadId("");
    setLeadSearchQuery("");
    setFormFile(null);
    setIsEditing(true);
  };

  const handleOpenEditRow = (row: UnifiedEntryRow) => {
    setEditingRow(row);
    setEditingIsFolder(row.isFolder);
    setFormTitle(row.title || "");
    setFormDueDate(row.dueDate || "");
    setFormWarningDays(row.warningDays || 0);
    setFormClientId(row.clientId || "");
    const cl = row.clientId ? leads.find(l => l.id === row.clientId) : null;
    setClientSearchQuery(cl ? cl.name : "");
    setFormLeadId(row.leadId || "");
    const ld = row.leadId ? leads.find(l => l.id === row.leadId) : null;
    setLeadSearchQuery(ld ? ld.name : "");
    setFormFile(row.fileName ? {
      fileName: row.fileName,
      fileSize: row.fileSize || "",
      fileType: row.fileType || "",
      filePath: row.filePath || ""
    } : null);
    setIsEditing(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();

    const activeModules = editingIsFolder 
      ? (registry.folderModules || ["title"]) 
      : registry.modules;

    if (editingRow) {
      // Editing
      setRows(prev => prev.map(r => {
        if (r.id === editingRow.id) {
          return {
            ...r,
            title: (activeModules.includes("title") || editingIsFolder) ? formTitle.trim() : undefined,
            dueDate: activeModules.includes("due_date") ? formDueDate : undefined,
            warningDays: activeModules.includes("due_date") ? formWarningDays : undefined,
            clientId: activeModules.includes("client") ? formClientId : undefined,
            leadId: activeModules.includes("lead") ? formLeadId : undefined,
            fileName: activeModules.includes("file") ? formFile?.fileName : undefined,
            fileSize: activeModules.includes("file") ? formFile?.fileSize : undefined,
            fileType: activeModules.includes("file") ? formFile?.fileType : undefined,
            filePath: activeModules.includes("file") ? formFile?.filePath : undefined,
            icon: editingIsFolder ? registry.icon : undefined
          };
        }
        return r;
      }));
    } else {
      // Creating
      const newEntry: UnifiedEntryRow = {
        id: (editingIsFolder ? "folder-" : "entry-") + Date.now(),
        parentId: currentFolderId,
        isFolder: editingIsFolder,
        title: (activeModules.includes("title") || editingIsFolder) ? formTitle.trim() : undefined,
        dueDate: activeModules.includes("due_date") ? formDueDate : undefined,
        warningDays: activeModules.includes("due_date") ? formWarningDays : undefined,
        clientId: activeModules.includes("client") ? formClientId : undefined,
        leadId: activeModules.includes("lead") ? formLeadId : undefined,
        fileName: activeModules.includes("file") ? formFile?.fileName : undefined,
        fileSize: activeModules.includes("file") ? formFile?.fileSize : undefined,
        fileType: activeModules.includes("file") ? formFile?.fileType : undefined,
        filePath: activeModules.includes("file") ? formFile?.filePath : undefined,
        icon: editingIsFolder ? registry.icon : undefined
      };
      setRows(prev => [...prev, newEntry]);
    }

    setIsEditing(false);
    setEditingRow(null);
  };

  const handleSaveDedicatedEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntryRow) return;

    const activeModules = registry.modules;

    setRows(prev => prev.map(r => {
      if (r.id === editingEntryRow.id) {
        return {
          ...r,
          title: activeModules.includes("title") ? formTitle.trim() : undefined,
          dueDate: activeModules.includes("due_date") ? formDueDate : undefined,
          warningDays: activeModules.includes("due_date") ? formWarningDays : undefined,
          clientId: activeModules.includes("client") ? formClientId : undefined,
          leadId: activeModules.includes("lead") ? formLeadId : undefined,
          fileName: activeModules.includes("file") ? formFile?.fileName : undefined,
          fileSize: activeModules.includes("file") ? formFile?.fileSize : undefined,
          fileType: activeModules.includes("file") ? formFile?.fileType : undefined,
          filePath: activeModules.includes("file") ? formFile?.filePath : undefined
        };
      }
      return r;
    }));

    // Redirect back to parent folder
    window.location.hash = "ue_" + registry.id + (editingEntryRow.parentId ? "/" + editingEntryRow.parentId : "");
  };

  const renderClientSelector = () => {
    const linkedClient = formClientId ? leads.find(l => l.id === formClientId) : null;
    const filteredLeads = leads.filter(lead => {
      if (lead.status !== "accepted" || lead.id === "unassigned-docs") return false;
      const q = clientSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return lead.name.toLowerCase().includes(q) || 
             (lead.phone && lead.phone.includes(q)) || 
             (lead.email && lead.email.toLowerCase().includes(q));
    });

    return (
      <div className="flex flex-col gap-1.5 relative">
        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
          {systemLanguage === "sk" ? "Priradený klient" : "Linked Client"}
        </label>
        
        <div className="relative">
          <div className="relative z-10">
            <input
              type="text"
              value={clientSearchQuery}
              onChange={(e) => {
                setClientSearchQuery(e.target.value);
                setIsClientDropdownOpen(true);
              }}
              onFocus={() => setIsClientDropdownOpen(true)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
              placeholder={systemLanguage === "sk" ? "Vyhľadať klienta..." : "Search client..."}
            />
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3.5" />
            {clientSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setClientSearchQuery("");
                  setFormClientId("");
                  setIsClientDropdownOpen(true);
                }}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-650 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {isClientDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-[2999]" 
                onClick={() => setIsClientDropdownOpen(false)}
              />
              <div className="absolute z-[3000] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredLeads.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 text-xs">
                    {systemLanguage === "sk" ? "Žiadni klienti sa nenašli" : "No clients found"}
                  </div>
                ) : (
                  filteredLeads.map(lead => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setFormClientId(lead.id);
                        setClientSearchQuery(lead.name);
                        setIsClientDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex flex-col gap-0.5 cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{lead.name}</span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {lead.email || "No email"} • {lead.phone || "No phone"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {linkedClient && (
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-250 text-emerald-800 text-xs font-semibold space-y-2 relative shadow-sm animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5 mb-1.5">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-emerald-700">
                <Users className="h-3.5 w-3.5" />
                <span>{systemLanguage === "sk" ? "Základné info o klientovi" : "Client Information"}</span>
              </div>
              <a
                href={`#client-${encodeURIComponent(linkedClient.name)}`}
                className="text-[10px] text-emerald-600 hover:text-emerald-950 font-black underline flex items-center gap-0.5"
              >
                {systemLanguage === "sk" ? "Profil klienta" : "View Profile"}
                <ChevronRight className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <span className="text-[10px] text-emerald-600 block">{systemLanguage === "sk" ? "Meno" : "Name"}</span>
                <span className="font-extrabold text-[13px]">{linkedClient.name}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 block">{systemLanguage === "sk" ? "Mesto" : "City"}</span>
                <span className="font-bold">{linkedClient.city || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 block">Email</span>
                <span className="font-bold truncate block">{linkedClient.email || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 block">{systemLanguage === "sk" ? "Telefón" : "Phone"}</span>
                <span className="font-bold">{linkedClient.phone || "-"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLeadSelector = () => {
    const linkedLead = formLeadId ? leads.find(l => l.id === formLeadId) : null;
    const filteredLeads = leads.filter(lead => {
      if (lead.status === "accepted" || lead.id === "unassigned-docs") return false;
      const q = leadSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return lead.name.toLowerCase().includes(q) || 
             (lead.phone && lead.phone.includes(q)) || 
             (lead.email && lead.email.toLowerCase().includes(q));
    });

    return (
      <div className="flex flex-col gap-1.5 relative">
        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
          {systemLanguage === "sk" ? "Priradený lead" : "Linked Lead"}
        </label>
        
        <div className="relative">
          <div className="relative z-10">
            <input
              type="text"
              value={leadSearchQuery}
              onChange={(e) => {
                setLeadSearchQuery(e.target.value);
                setIsLeadDropdownOpen(true);
              }}
              onFocus={() => setIsLeadDropdownOpen(true)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
              placeholder={systemLanguage === "sk" ? "Vyhľadať lead..." : "Search lead..."}
            />
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3.5" />
            {leadSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setLeadSearchQuery("");
                  setFormLeadId("");
                  setIsLeadDropdownOpen(true);
                }}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-650 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {isLeadDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-[2999]" 
                onClick={() => setIsLeadDropdownOpen(false)}
              />
              <div className="absolute z-[3000] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredLeads.length === 0 ? (
                  <div className="p-3 text-center text-slate-400 text-xs">
                    {systemLanguage === "sk" ? "Žiadne leady sa nenašli" : "No leads found"}
                  </div>
                ) : (
                  filteredLeads.map(lead => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setFormLeadId(lead.id);
                        setLeadSearchQuery(lead.name);
                        setIsLeadDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex flex-col gap-0.5 cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{lead.name}</span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {lead.email || "No email"} • {lead.phone || "No phone"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {linkedLead && (
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-250 text-indigo-800 text-xs font-semibold space-y-2 relative shadow-sm animate-in fade-in slide-in-from-top-1 duration-150 mt-1.5">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5 mb-1.5">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-indigo-700">
                <Briefcase className="h-3.5 w-3.5" />
                <span>{systemLanguage === "sk" ? "Základné info o leade" : "Lead Information"}</span>
              </div>
              <a
                href={`#lead-${encodeURIComponent(linkedLead.id)}`}
                className="text-[10px] text-indigo-600 hover:text-indigo-955 font-black underline flex items-center gap-0.5"
              >
                {systemLanguage === "sk" ? "Profil leadu" : "View Profile"}
                <ChevronRight className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <span className="text-[10px] text-indigo-600 block">{systemLanguage === "sk" ? "Meno" : "Name"}</span>
                <span className="font-extrabold text-[13px]">{linkedLead.name}</span>
              </div>
              <div>
                <span className="text-[10px] text-indigo-600 block">{systemLanguage === "sk" ? "Status" : "Status"}</span>
                <span className="font-bold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 inline-block">{linkedLead.status || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] text-indigo-600 block">Email</span>
                <span className="font-bold truncate block">{linkedLead.email || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] text-indigo-600 block">{systemLanguage === "sk" ? "Telefón" : "Phone"}</span>
                <span className="font-bold">{linkedLead.phone || "-"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleDeleteItem = (id: string, isFolder: boolean) => {
    const confirmMsg = isFolder
      ? (systemLanguage === "sk" 
          ? `Vymazaním ${folderSingularSk.toLowerCase()}a sa vymaže aj všetok jeho obsah. Pokračovať?` 
          : `Deleting a ${folderSingularEn.toLowerCase()} will delete all its nested contents recursively. Proceed?`)
      : (systemLanguage === "sk" 
          ? `Naozaj vymazať tento ${entrySingularSk.toLowerCase()}?` 
          : `Are you sure you want to delete this ${entrySingularEn.toLowerCase()}?`);

    if (confirm(confirmMsg)) {
      const deleteRecursive = (idToDelete: string, currentRows: UnifiedEntryRow[]): UnifiedEntryRow[] => {
        let result = currentRows.filter(r => r.id !== idToDelete);
        const children = currentRows.filter(r => r.parentId === idToDelete);
        for (const child of children) {
          result = deleteRecursive(child.id, result);
        }
        return result;
      };
      setRows(prev => deleteRecursive(id, prev));
    }
  };

  const handleMoveItem = (targetFolderId: string | null) => {
    if (!movingItem) return;
    setRows(prev => prev.map(r => {
      if (r.id === movingItem.id) {
        return { ...r, parentId: targetFolderId };
      }
      return r;
    }));
    setIsMoving(false);
    setMovingItem(null);
  };



  // Recursive folder summary calculations (now counts OK, Warning, and Due recursively)
  const getFolderSummary = (folderId: string): { ok: number; warning: number; due: number } => {
    let ok = 0;
    let warning = 0;
    let due = 0;

    const checkItem = (item: UnifiedEntryRow) => {
      if (item.isFolder) {
        const children = rows.filter(r => r.parentId === item.id);
        children.forEach(checkItem);
      } else {
        if (item.dueDate) {
          const status = getDueDateStatus(item.dueDate, item.warningDays);
          if (status === "overdue") {
            due++;
          } else if (status === "warning") {
            warning++;
          } else {
            ok++;
          }
        } else {
          ok++;
        }
      }
    };

    const children = rows.filter(r => r.parentId === folderId);
    children.forEach(checkItem);

    return { ok, warning, due };
  };

  // Helper to determine due date status based on warningDays threshold
  const getDueDateStatus = (dueDateStr: string, warningDaysInput?: number): "overdue" | "warning" | "normal" => {
    if (!dueDateStr) return "normal";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    if (due < today) {
      return "overdue";
    }

    const warningThresholdDays = warningDaysInput !== undefined ? warningDaysInput : 0;
    if (warningThresholdDays > 0) {
      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= warningThresholdDays) {
        return "warning";
      }
    }

    return "normal";
  };

  if (isEditingEntryView) {
    if (!editingEntryRow) {
      return (
        <div className="flex-1 overflow-y-auto px-6 py-6 text-center text-slate-500">
          <p>{systemLanguage === "sk" ? `${entrySingularSk} sa nenašiel.` : `${entrySingularEn} not found.`}</p>
          <button
            onClick={() => { window.location.hash = "ue_" + registry.id; }}
            className="mt-4 px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl font-bold cursor-pointer"
          >
            {systemLanguage === "sk" ? "Späť" : "Go Back"}
          </button>
        </div>
      );
    }

    const activeModules = registry.modules;

    return (
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4 text-left">
          <button
            type="button"
            onClick={() => {
              window.location.hash = "ue_" + registry.id + (editingEntryRow.parentId ? "/" + editingEntryRow.parentId : "");
            }}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-heading font-bold text-slate-900 uppercase tracking-wider">
              {systemLanguage === "sk" ? `Detail a úprava: ${entrySingularSk.toLowerCase()}` : `Details & Editing: ${entrySingularEn.toLowerCase()}`}
            </h2>
            <p className="text-xs text-slate-550 uppercase font-bold tracking-wider mt-0.5">
              {editingEntryRow.title || (systemLanguage === "sk" ? "Bez názvu" : "Untitled")}
            </p>
          </div>
        </div>

        {/* Edit Form */}
        <div className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-xl p-6 text-left">
          <form onSubmit={handleSaveDedicatedEntry} className="space-y-6">
            {/* Title module */}
            {activeModules.includes("title") && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                  {systemLanguage === "sk" ? "Titulok / Názov" : "Title / Name"}
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                  placeholder={systemLanguage === "sk" ? "Zadajte názov..." : "Enter name..."}
                  required
                />
              </div>
            )}

            {/* Due Date module */}
            {activeModules.includes("due_date") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                    {systemLanguage === "sk" ? "Termín (Due Date)" : "Due Date"}
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                    {systemLanguage === "sk" ? "Počet dní pre varovanie pred termínom" : "Warning days before due date"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formWarningDays}
                    onChange={(e) => setFormWarningDays(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                    placeholder="e.g. 3"
                  />
                </div>
              </div>
            )}

            {/* File module */}
            {activeModules.includes("file") && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                  {systemLanguage === "sk" ? "Príloha (Súbor)" : "Attachment (File)"}
                </label>
                {formFile ? (
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-bold text-slate-700 truncate">{formFile.fileName}</span>
                        <span className="text-[9px] text-slate-400">({formFile.fileSize})</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={formFile.filePath}
                        download
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-indigo-650 transition-colors"
                        title="Download file"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setFormFile(null)}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-6 transition-all bg-slate-50/50 hover:bg-indigo-50/5 text-center cursor-pointer group">
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      disabled={isUploading}
                    />
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud className="h-8 w-8 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      <span className="text-xs font-bold text-slate-500 group-hover:text-indigo-650 transition-colors">
                        {isUploading 
                          ? (systemLanguage === "sk" ? "Nahráva sa..." : "Uploading...")
                          : (systemLanguage === "sk" ? "Kliknite alebo pretiahnite súbor sem" : "Click or drag file here")}
                      </span>
                      <span className="text-[10px] text-slate-400">Max size: 50MB</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Client module */}
            {activeModules.includes("client") && renderClientSelector()}

            {/* Lead module */}
            {activeModules.includes("lead") && renderLeadSelector()}

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "ue_" + registry.id + (editingEntryRow.parentId ? "/" + editingEntryRow.parentId : "");
                }}
                className="px-4 py-2.5 rounded-xl hover:bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {systemLanguage === "sk" ? "Zrušiť" : "Cancel"}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer"
                style={{ backgroundColor: registry.color }}
              >
                {systemLanguage === "sk" ? "Uložiť zmeny" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      
      {/* Header with Custom Registry Color Styling */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 text-left">
        <div className="flex items-center gap-3">
          <div 
            className="p-3 rounded-2xl text-white shadow-md"
            style={{ backgroundColor: registry.color }}
          >
            {(() => {
              const IconComponent = (Icons as any)[registry.icon] || Icons.FolderOpen;
              return <IconComponent className="h-6 w-6" />;
            })()}
          </div>
          <div>
            <h2 className="text-xl font-heading font-bold text-slate-900 uppercase tracking-wider">
              {registry.name}
            </h2>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-0.5">
              {systemLanguage === "sk" ? `Správa: ${registry.name.toLowerCase()}` : `Manage: ${registry.name.toLowerCase()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {registry.foldersEnabled && (
            <button
              type="button"
              onClick={handleOpenCreateFolder}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-650 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <FolderPlus className="h-4 w-4" />
              {systemLanguage === "sk" ? "Nový " + folderSingularSk.toLowerCase() : "New " + folderSingularEn}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenCreateEntry}
            className="px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            style={{ backgroundColor: registry.color }}
          >
            <Plus className="h-4 w-4" />
            {systemLanguage === "sk" ? "Nový " + entrySingularSk.toLowerCase() : "New " + entrySingularEn}
          </button>
        </div>
      </div>
 
      {/* Navigation Breadcrumbs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Breadcrumbs */}
        <div className="flex items-center flex-wrap gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 select-none">
          {getBreadcrumbs().map((crumb, idx, arr) => {
            const isLast = idx === arr.length - 1;
            return (
              <React.Fragment key={crumb.id || "root"}>
                {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-350" />}
                {isLast ? (
                  <span className="text-slate-700 font-extrabold">{crumb.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      window.location.hash = "ue_" + registry.id + (crumb.id ? "/" + crumb.id : "");
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const draggedId = e.dataTransfer.getData("text/plain");
                      if (draggedId && draggedId !== crumb.id) {
                        setRows(prev => prev.map(r => {
                          if (r.id === draggedId) {
                            return { ...r, parentId: crumb.id };
                          }
                          return r;
                        }));
                      }
                    }}
                    className="hover:text-indigo-650 transition-colors cursor-pointer"
                  >
                    {crumb.name}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64 select-none">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-all bg-white"
            placeholder={systemLanguage === "sk" ? "Vyhľadať..." : "Search..."}
          />
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-650 text-xs"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid / Rows table */}
      <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass overflow-hidden">
        {currentFolderRows.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <span className="text-3xl">🗂️</span>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-2">
              {systemLanguage === "sk" ? `${folderSingularSk} je prázdny` : `This ${folderSingularEn.toLowerCase()} is empty`}
            </p>
            <p className="text-[10px] font-medium text-slate-400 mt-1">
              {systemLanguage === "sk" 
                ? `Vytvorte nový ${entrySingularSk.toLowerCase()} alebo ${folderSingularSk.toLowerCase()} pomocou tlačidiel vyššie.` 
                : `Create a new ${entrySingularEn.toLowerCase()} or ${folderSingularEn.toLowerCase()} using the toolbar buttons.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-450 select-none">
                  <th className="py-3.5 px-6">{systemLanguage === "sk" ? `Názov / ${folderSingularSk}` : `Title / ${folderSingularEn}`}</th>
                  {isDueDateActive && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Termín" : "Due Date"}</th>}
                  {isFileActive && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Súbor" : "Attachment"}</th>}
                  {isClientActive && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Klient" : "Client"}</th>}
                  {isLeadActive && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Lead" : "Lead"}</th>}
                  <th className="py-3.5 px-6 text-right">{systemLanguage === "sk" ? "Akcie" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {currentFolderRows.map((row) => {
                  const rowModules = row.isFolder ? (registry.folderModules || ["title"]) : registry.modules;
                  
                  // Render summaries if folder and active in settings (OK, Warning, Due in green, yellow, red)
                  let summarySpan = null;
                  if (row.isFolder && registry.showFolderSummary) {
                    const stats = getFolderSummary(row.id);
                    summarySpan = (
                      <div className="flex items-center gap-1.5 ml-2.5 text-[9px] font-bold uppercase tracking-wider">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {stats.ok} OK
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                          {stats.warning} Warn
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
                          {stats.due} Due
                        </span>
                      </div>
                    );
                  }

                  const dueDateStatus = !row.isFolder && row.dueDate ? getDueDateStatus(row.dueDate, row.warningDays) : "normal";
                  let dueDateClass = "text-slate-500";
                  if (dueDateStatus === "overdue") {
                    dueDateClass = "text-rose-600 font-black animate-pulse";
                  } else if (dueDateStatus === "warning") {
                    dueDateClass = "text-orange-500 font-bold";
                  }

                  const linkedClient = row.clientId ? leads.find(l => l.id === row.clientId) : null;

                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${
                        dragOverFolderId === row.id ? "bg-indigo-50/80 border-y border-indigo-300" : ""
                      }`}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", row.id);
                      }}
                      onDragOver={(e) => {
                        if (row.isFolder) {
                          e.preventDefault();
                          if (dragOverFolderId !== row.id) {
                            setDragOverFolderId(row.id);
                          }
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverFolderId === row.id) {
                          setDragOverFolderId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverFolderId(null);
                        const draggedId = e.dataTransfer.getData("text/plain");
                        if (draggedId && draggedId !== row.id) {
                          // Prevent dragging a folder inside itself
                          const isAncestor = (ancestorId: string, childId: string): boolean => {
                            const child = rows.find(r => r.id === childId);
                            if (!child || !child.parentId) return false;
                            if (child.parentId === ancestorId) return true;
                            return isAncestor(ancestorId, child.parentId);
                          };
                          if (!isAncestor(draggedId, row.id)) {
                            setRows(prev => prev.map(r => {
                              if (r.id === draggedId) {
                                return { ...r, parentId: row.id };
                              }
                              return r;
                            }));
                          }
                        }
                      }}
                      onClick={(e) => {
                        // Prevent row selection detail-trigger when clicking buttons or anchors
                        const target = e.target as HTMLElement;
                        if (target.closest("button") || target.closest("a") || target.closest("input")) {
                           return;
                        }
                        setSearchQuery("");
                        window.location.hash = "ue_" + registry.id + "/" + row.id;
                      }}
                    >
                      
                      {/* Title / Name */}
                      <td className="py-3 px-6">
                        {row.isFolder ? (() => {
                          const IconComponent = (Icons as any)[registry.icon] || Icons.Folder;
                          return (
                            <div className="flex items-center gap-3 text-indigo-650 hover:text-indigo-850 font-black uppercase tracking-wider">
                              <div className="h-8 w-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 shadow-sm">
                                <IconComponent className="h-4 w-4" />
                              </div>
                              <span>{row.title}</span>
                              {summarySpan}
                            </div>
                          );
                        })() : (
                          <div className="flex items-center gap-2 text-slate-800">
                            <FileText className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                            <span>{row.title || (systemLanguage === "sk" ? "Bez názvu" : "Untitled")}</span>
                          </div>
                        )}
                      </td>

                      {/* Due Date */}
                      {isDueDateActive && (
                        <td className="py-3 px-4">
                          {rowModules.includes("due_date") && row.dueDate ? (
                            <div className={`flex items-center gap-1.5 ${dueDateClass}`}>
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{row.dueDate}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      {/* Attachment */}
                      {isFileActive && (
                        <td className="py-3 px-4 text-slate-500">
                          {rowModules.includes("file") && row.fileName ? (
                            <a
                              href={row.filePath}
                              download
                              className="inline-flex items-center gap-1 text-indigo-650 hover:text-indigo-850 font-bold hover:underline"
                              title="Download attachment"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span className="max-w-[150px] truncate">{row.fileName}</span>
                              <span className="text-[9px] text-slate-400 font-medium">({row.fileSize})</span>
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      {/* Client */}
                      {isClientActive && (
                        <td className="py-3 px-4 text-slate-500">
                          {rowModules.includes("client") && linkedClient ? (
                            <a
                              href={`#client-${encodeURIComponent(linkedClient.name)}`}
                              className="inline-flex items-center gap-1 text-indigo-650 hover:underline font-bold"
                            >
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span>{linkedClient.name}</span>
                            </a>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      )}

                      {/* Lead */}
                      {isLeadActive && (() => {
                        const linkedLead = row.leadId ? leads.find(l => l.id === row.leadId) : null;
                        return (
                          <td className="py-3 px-4 text-slate-500">
                            {rowModules.includes("lead") && linkedLead ? (
                              <a
                                href={`#lead-${encodeURIComponent(linkedLead.id)}`}
                                className="inline-flex items-center gap-1 text-indigo-650 hover:underline font-bold"
                              >
                                <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                                <span>{linkedLead.name}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })()}

                      {/* Action buttons */}
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                          {registry.foldersEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                setMovingItem(row);
                                setIsMoving(true);
                              }}
                              className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                              title={systemLanguage === "sk" ? `Presunúť do iného ${folderSingularSk.toLowerCase()}a` : `Move item to another ${folderSingularEn.toLowerCase()}`}
                            >
                              <Move className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (row.isFolder) {
                                handleOpenEditRow(row);
                              } else {
                                window.location.hash = "ue_" + registry.id + "/" + row.id;
                              }
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title={row.isFolder 
                              ? (systemLanguage === "sk" ? `Upraviť ${folderSingularSk.toLowerCase()}` : `Edit ${folderSingularEn.toLowerCase()}`) 
                              : (systemLanguage === "sk" ? `Upraviť ${entrySingularSk.toLowerCase()}` : `Edit ${entrySingularEn.toLowerCase()}`)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(row.id, row.isFolder)}
                            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New / Edit Row Modal Dialog (Folders and Entries Unified) */}
      {isEditing && (() => {
        const activeFormModules = editingIsFolder ? (registry.folderModules || ["title"]) : registry.modules;
        return (
          <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[2000] p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-left">
                <h3 className="text-sm font-heading font-black text-slate-800 uppercase tracking-wider">
                  {editingIsFolder 
                    ? (editingRow 
                        ? (systemLanguage === "sk" ? `Upraviť ${folderSingularSk.toLowerCase()}` : `Edit ${folderSingularEn}`)
                        : (systemLanguage === "sk" ? `Nový ${folderSingularSk}` : `New ${folderSingularEn}`))
                    : (editingRow 
                        ? (systemLanguage === "sk" ? `Upraviť ${entrySingularSk.toLowerCase()}` : `Edit ${entrySingularEn}`)
                        : (systemLanguage === "sk" ? `Nový ${entrySingularSk}` : `New ${entrySingularSk}`)) /* Keep Slovak naming correct */}
                </h3>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-650">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEntry} className="space-y-4 text-left">
                {/* Title module */}
                {(activeFormModules.includes("title") || editingIsFolder) && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                      {editingIsFolder
                        ? (systemLanguage === "sk" ? `Názov pre ${folderSingularSk.toLowerCase()}` : `${folderSingularEn} Name`)
                        : (systemLanguage === "sk" ? `Názov pre ${entrySingularSk.toLowerCase()}` : `${entrySingularEn} Name`)} *
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white"
                      placeholder={editingIsFolder
                        ? (systemLanguage === "sk" ? `Zadajte názov pre ${folderSingularSk.toLowerCase()}...` : `Enter ${folderSingularEn.toLowerCase()} name...`)
                        : (systemLanguage === "sk" ? `Zadajte názov pre ${entrySingularSk.toLowerCase()}...` : `Enter ${entrySingularEn.toLowerCase()} name...`)}
                      required
                      autoFocus
                    />
                  </div>
                )}

                {/* Due Date module */}
                {activeFormModules.includes("due_date") && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                        {systemLanguage === "sk" ? "Termín (Due Date)" : "Due Date"}
                      </label>
                      <input
                        type="date"
                        value={formDueDate}
                        onChange={(e) => setFormDueDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                        {systemLanguage === "sk" ? "Počet dní pre varovanie pred termínom" : "Warning days before due date"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formWarningDays}
                        onChange={(e) => setFormWarningDays(parseInt(e.target.value) || 0)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white text-slate-700"
                        placeholder="e.g. 3"
                      />
                    </div>
                  </div>
                )}

                {/* File module */}
                {activeFormModules.includes("file") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                      {systemLanguage === "sk" ? "Príloha (Súbor)" : "Attachment (File)"}
                    </label>
                    {formFile ? (
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-700 truncate">{formFile.fileName}</span>
                          <span className="text-[9px] text-slate-450 font-bold shrink-0">({formFile.fileSize})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormFile(null)}
                          className="text-rose-500 hover:text-rose-700 p-1 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className={`h-6 w-6 text-slate-400 ${isUploading ? "animate-pulse" : ""}`} />
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1.5">
                              {isUploading ? "Uploading file..." : (systemLanguage === "sk" ? "Nahrať súbor" : "Upload file")}
                            </p>
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Client module */}
                {activeFormModules.includes("client") && renderClientSelector()}

                {/* Lead module */}
                {activeFormModules.includes("lead") && renderLeadSelector()}

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider"
                  >
                    {systemLanguage === "sk" ? "Zrušiť" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="px-4 py-2 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-md disabled:opacity-50"
                    style={{ backgroundColor: registry.color }}
                  >
                    {systemLanguage === "sk" ? "Uložiť" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}


      {/* Move Item Folder Selection Modal Dialog */}
      {isMoving && movingItem && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[2000] p-4 select-none">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-left">
              <h3 className="text-sm font-heading font-black text-slate-800 uppercase tracking-wider">
                {systemLanguage === "sk" ? "Presunúť položku" : "Move Item"}
              </h3>
              <button onClick={() => { setIsMoving(false); setMovingItem(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                {systemLanguage === "sk" ? `Vyberte cieľový ${folderSingularSk.toLowerCase()}` : `Select target ${folderSingularEn.toLowerCase()}`}
              </span>

              <div className="max-h-60 overflow-y-auto space-y-1 pr-1 border border-slate-150 rounded-2xl p-2 bg-slate-50/50">
                {/* Root option */}
                <button
                  type="button"
                  onClick={() => handleMoveItem(null)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 text-xs font-bold text-slate-650 hover:text-indigo-650 transition-all text-left cursor-pointer"
                >
                  <Folder className="h-4 w-4 text-slate-400" />
                  <span>/ (Root)</span>
                </button>

                {getFoldersListExcept(movingItem.id).map(folder => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => handleMoveItem(folder.id)}
                    className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 text-xs font-bold text-slate-650 hover:text-indigo-650 transition-all text-left cursor-pointer"
                  >
                    <Folder className="h-4 w-4 text-amber-500 fill-amber-50" />
                    <span className="truncate">{folder.title}</span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setIsMoving(false); setMovingItem(null); }}
                  className="px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider"
                >
                  {systemLanguage === "sk" ? "Zrušiť" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
