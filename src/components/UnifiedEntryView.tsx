import React, { useState } from "react";
import { 
  Folder, FolderPlus, Plus, ChevronRight, Calendar, 
  FileText, Trash2, Edit3, Move, X, Download, 
  UploadCloud, Search, Briefcase, ClipboardList, Database,
  FolderOpen, Trophy, Link, MapPin, Users, Tag
} from "lucide-react";
import type { UnifiedEntryRegistry, UnifiedEntryRow } from "../types";

interface UnifiedEntryViewProps {
  registry: UnifiedEntryRegistry;
  rows: UnifiedEntryRow[];
  setRows: (updater: UnifiedEntryRow[] | ((prev: UnifiedEntryRow[]) => UnifiedEntryRow[])) => void;
  systemLanguage: "en" | "sk" | "hu";
}

export const UnifiedEntryView: React.FC<UnifiedEntryViewProps> = ({
  registry,
  rows,
  setRows,
  systemLanguage
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals / Editors state
  const [isEditing, setIsEditing] = useState(false);
  const [editingRow, setEditingRow] = useState<UnifiedEntryRow | null>(null);
  
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const [isMoving, setIsMoving] = useState(false);
  const [movingItem, setMovingItem] = useState<UnifiedEntryRow | null>(null);

  // Form fields for entry creation/edit
  const [formTitle, setFormTitle] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formFile, setFormFile] = useState<{
    fileName: string;
    fileSize: string;
    fileType: string;
    filePath: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Breadcrumbs path helper
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "Root" }];
    let currentId = currentFolderId;
    const path: typeof crumbs = [];
    
    while (currentId) {
      const folder = rows.find(r => r.id === currentId && r.isFolder);
      if (folder) {
        path.unshift({ id: folder.id, name: folder.title || "Unnamed Folder" });
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

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    const newFolder: UnifiedEntryRow = {
      id: "folder-" + Date.now(),
      parentId: currentFolderId,
      isFolder: true,
      title: folderName.trim()
    };

    setRows(prev => [...prev, newFolder]);
    setFolderName("");
    setIsCreatingFolder(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const rowId = editingRow?.id || "entry-" + Date.now();
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
    setFormTitle("");
    setFormDueDate("");
    setFormFile(null);
    setIsEditing(true);
  };

  const handleOpenEditEntry = (row: UnifiedEntryRow) => {
    setEditingRow(row);
    setFormTitle(row.title || "");
    setFormDueDate(row.dueDate || "");
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

    if (editingRow) {
      // Editing
      setRows(prev => prev.map(r => {
        if (r.id === editingRow.id) {
          return {
            ...r,
            title: registry.modules.includes("title") ? formTitle.trim() : undefined,
            dueDate: registry.modules.includes("due_date") ? formDueDate : undefined,
            fileName: registry.modules.includes("file") ? formFile?.fileName : undefined,
            fileSize: registry.modules.includes("file") ? formFile?.fileSize : undefined,
            fileType: registry.modules.includes("file") ? formFile?.fileType : undefined,
            filePath: registry.modules.includes("file") ? formFile?.filePath : undefined
          };
        }
        return r;
      }));
    } else {
      // Creating
      const newEntry: UnifiedEntryRow = {
        id: "entry-" + Date.now(),
        parentId: currentFolderId,
        isFolder: false,
        title: registry.modules.includes("title") ? formTitle.trim() : undefined,
        dueDate: registry.modules.includes("due_date") ? formDueDate : undefined,
        fileName: registry.modules.includes("file") ? formFile?.fileName : undefined,
        fileSize: registry.modules.includes("file") ? formFile?.fileSize : undefined,
        fileType: registry.modules.includes("file") ? formFile?.fileType : undefined,
        filePath: registry.modules.includes("file") ? formFile?.filePath : undefined
      };
      setRows(prev => [...prev, newEntry]);
    }

    setIsEditing(false);
    setEditingRow(null);
  };

  const handleDeleteItem = (id: string, isFolder: boolean) => {
    const confirmMsg = isFolder
      ? (systemLanguage === "sk" ? "Vymazaním priečinka sa vymaže aj všetok jeho obsah. Pokračovať?" : "Deleting a folder will delete all its nested contents recursively. Proceed?")
      : (systemLanguage === "sk" ? "Naozaj vymazať tento záznam?" : "Are you sure you want to delete this entry?");

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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      
      {/* Header with Custom Registry Color Styling */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 text-left">
        <div className="flex items-center gap-3">
          <div 
            className="p-3 rounded-2xl text-white shadow-md"
            style={{ backgroundColor: registry.color }}
          >
            {registry.icon === "Briefcase" && <Briefcase className="h-6 w-6" />}
            {registry.icon === "Calendar" && <Calendar className="h-6 w-6" />}
            {registry.icon === "ClipboardList" && <ClipboardList className="h-6 w-6" />}
            {registry.icon === "Database" && <Database className="h-6 w-6" />}
            {registry.icon === "FolderOpen" && <FolderOpen className="h-6 w-6" />}
            {registry.icon === "Trophy" && <Trophy className="h-6 w-6" />}
            {registry.icon === "Link" && <Link className="h-6 w-6" />}
            {registry.icon === "MapPin" && <MapPin className="h-6 w-6" />}
            {registry.icon === "Users" && <Users className="h-6 w-6" />}
            {registry.icon === "Tag" && <Tag className="h-6 w-6" />}
          </div>
          <div>
            <h2 className="text-xl font-heading font-bold text-slate-900 uppercase tracking-wider">
              {registry.name}
            </h2>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-0.5">
              {systemLanguage === "sk" ? "Správa unifikovaných záznamov" : "Manage unified entries"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {registry.foldersEnabled && (
            <button
              type="button"
              onClick={() => setIsCreatingFolder(true)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-650 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <FolderPlus className="h-4 w-4" />
              {systemLanguage === "sk" ? "Nový priečinok" : "New Folder"}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenCreateEntry}
            className="px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            style={{ backgroundColor: registry.color }}
          >
            <Plus className="h-4 w-4" />
            {systemLanguage === "sk" ? "Nový záznam" : "New Entry"}
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
                      setCurrentFolderId(crumb.id);
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
            placeholder={systemLanguage === "sk" ? "Vyhľadať v záznamoch..." : "Search entries..."}
          />
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
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
              {systemLanguage === "sk" ? "Priečinok je prázdny" : "This folder is empty"}
            </p>
            <p className="text-[10px] font-medium text-slate-400 mt-1">
              {systemLanguage === "sk" ? "Vytvorte nový záznam alebo priečinok pomocou tlačidiel vyššie." : "Create new elements using the toolbar buttons."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-450 select-none">
                  <th className="py-3.5 px-6">{systemLanguage === "sk" ? "Názov / Priečinok" : "Title / Folder"}</th>
                  {registry.modules.includes("due_date") && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Termín" : "Due Date"}</th>}
                  {registry.modules.includes("file") && <th className="py-3.5 px-4">{systemLanguage === "sk" ? "Súbor" : "Attachment"}</th>}
                  <th className="py-3.5 px-6 text-right">{systemLanguage === "sk" ? "Akcie" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {currentFolderRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                    
                    {/* Title / Name */}
                    <td className="py-3 px-6">
                      {row.isFolder ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setCurrentFolderId(row.id);
                          }}
                          className="flex items-center gap-2 text-indigo-650 hover:text-indigo-850 font-black uppercase tracking-wider cursor-pointer"
                        >
                          <Folder className="h-4.5 w-4.5 text-amber-500 fill-amber-100" />
                          <span>{row.title}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-800">
                          <FileText className="h-4.5 w-4.5 text-slate-400" />
                          <span>{row.title || (systemLanguage === "sk" ? "Bez názvu" : "Untitled")}</span>
                        </div>
                      )}
                    </td>

                    {/* Due Date */}
                    {registry.modules.includes("due_date") && (
                      <td className="py-3 px-4 text-slate-500">
                        {row.dueDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{row.dueDate}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    )}

                    {/* Attachment */}
                    {registry.modules.includes("file") && (
                      <td className="py-3 px-4 text-slate-500">
                        {row.fileName ? (
                          <a
                            href={row.filePath}
                            download
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-850 font-bold hover:underline"
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
                            title="Move item to another folder"
                          >
                            <Move className="h-4 w-4" />
                          </button>
                        )}
                        {!row.isFolder && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditEntry(row)}
                            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Edit entry"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Folder Modal Dialog */}
      {isCreatingFolder && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[2000] p-4 select-none">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-left">
              <h3 className="text-sm font-heading font-black text-slate-800 uppercase tracking-wider">
                {systemLanguage === "sk" ? "Nový priečinok" : "New Folder"}
              </h3>
              <button onClick={() => setIsCreatingFolder(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4 text-left">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                  {systemLanguage === "sk" ? "Názov priečinka" : "Folder Name"}
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white"
                  placeholder={systemLanguage === "sk" ? "Zadajte názov..." : "Enter folder name..."}
                  required
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider"
                >
                  {systemLanguage === "sk" ? "Zrušiť" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/10"
                >
                  {systemLanguage === "sk" ? "Vytvoriť" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New / Edit Entry Modal Dialog */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[2000] p-4 select-none">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-left">
              <h3 className="text-sm font-heading font-black text-slate-800 uppercase tracking-wider">
                {editingRow 
                  ? (systemLanguage === "sk" ? "Upraviť záznam" : "Edit Entry")
                  : (systemLanguage === "sk" ? "Nový záznam" : "New Entry")}
              </h3>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4 text-left">
              {/* Title module */}
              {registry.modules.includes("title") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                    {systemLanguage === "sk" ? "Titulok / Názov" : "Title / Name"} *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 bg-white"
                    placeholder={systemLanguage === "sk" ? "Zadajte názov..." : "Enter title..."}
                    required
                    autoFocus
                  />
                </div>
              )}

              {/* Due Date module */}
              {registry.modules.includes("due_date") && (
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
              )}

              {/* File module */}
              {registry.modules.includes("file") && (
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
      )}

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
                {systemLanguage === "sk" ? "Vyberte cieľový priečinok" : "Select target folder"}
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
