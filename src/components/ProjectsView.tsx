import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, Settings, Search, Users, Briefcase, ChevronDown } from "lucide-react";
import type { Project, ProjectType, Lead, UserProfile } from "../types";
import { ProjectDetailsView } from "./ProjectDetailsView";
import { ProjectSettings } from "./ProjectSettings";
import type { Language } from "../utils/translations";

interface ProjectsViewProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  projectTypes: ProjectType[];
  setProjectTypes: React.Dispatch<React.SetStateAction<ProjectType[]>>;
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  canEdit: boolean;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  setProjects,
  projectTypes,
  setProjectTypes,
  leads,
  users,
  userLanguage,
  canEdit
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [activeSubTab, setActiveSubTab] = useState<"list" | "settings">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingProjectType, setEditingProjectType] = useState<ProjectType | null>(null);

  // "+ New Project" dropdown control
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);

  // Compute stats for summary badges
  const totalProjects = projects.length;
  const activeCount = projects.filter(p => p.status === "active").length;
  const completedCount = projects.filter(p => p.status === "completed").length;

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pType = projectTypes.find(t => t.id === p.projectTypeId);
      const lead = leads.find(l => l.id === p.leadId);
      const leadName = lead?.name || "";
      const matchesSearch = 
        leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pType?.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = selectedStatusFilter === "all" || p.status === selectedStatusFilter;
      const matchesType = selectedTypeFilter === "all" || p.projectTypeId === selectedTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [projects, projectTypes, leads, searchQuery, selectedStatusFilter, selectedTypeFilter]);

  const handleStartCreateProject = (type: ProjectType) => {
    setIsCreateDropdownOpen(false);
    
    // Create new blank project
    const newProj: Project = {
      id: "proj-" + Date.now(),
      projectTypeId: type.id,
      leadId: null,
      clientId: null,
      status: "active",
      managers: [],
      data: {},
      timeline: [],
      gantt: []
    };

    setEditingProjectType(type);
    setEditingProject(newProj);
  };

  const handleSaveProject = (updatedProject: Project) => {
    setProjects(prev => {
      const exists = prev.some(p => p.id === updatedProject.id);
      if (exists) {
        return prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      } else {
        return [updatedProject, ...prev];
      }
    });

    setEditingProject(null);
    setEditingProjectType(null);
    (window as any).showToast(t("Project saved successfully!", "Projekt bol úspešne uložený!", "Projekt sikeresen mentve!"));
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("Are you sure you want to delete this project?", "Naozaj chcete vymazať tento projekt?", "Biztosan törli ezt a projektet?"))) {
      return;
    }

    setProjects(prev => prev.filter(p => p.id !== id));
    (window as any).showToast(t("Project deleted.", "Projekt bol vymazaný.", "Projekt törölve."));
  };

  const calculateProgress = (project: Project) => {
    if (!project.gantt || project.gantt.length === 0) return 0;
    const sum = project.gantt.reduce((acc, row) => acc + (row.progress || 0), 0);
    return Math.round(sum / project.gantt.length);
  };

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Briefcase className={className} />;
  };
  if (editingProject && editingProjectType) {
    return (
      <ProjectDetailsView
        project={editingProject}
        projectType={editingProjectType}
        leads={leads}
        users={users}
        userLanguage={userLanguage}
        onClose={() => {
          setEditingProject(null);
          setEditingProjectType(null);
          window.location.hash = "projects";
        }}
        onSave={handleSaveProject}
      />
    );
  }

  return (
    <div className="space-y-6 text-left">
      
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 select-none">
        <div className="flex flex-col">
          <h2 className="font-heading font-black text-slate-800 text-xl uppercase tracking-widest flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
            {t("Project Management", "Manažment projektov", "Projektmenedzsment")}
          </h2>
          <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest mt-0.5">
            {t("Track deliverables, roadmaps, and client workflows", "Sledovanie dodávok, plánov a klientskych procesov", "Szállítások, útemtervek és ügyfélfolyamatok nyomon követése")}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab("list")}
            className={`px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === "list"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {t("Projects List", "Zoznam projektov", "Projektek listája")}
          </button>
          <button
            onClick={() => setActiveSubTab("settings")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === "settings"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>{t("Settings", "Nastavenia", "Beállítások")}</span>
          </button>
        </div>
      </div>

      {activeSubTab === "settings" ? (
        <div className="mt-4">
          <ProjectSettings
            projectTypes={projectTypes}
            setProjectTypes={setProjectTypes}
            userLanguage={userLanguage}
            canEdit={canEdit}
          />
        </div>
      ) : (
        <>
          {/* Summary badging widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Total Projects", "Projekty celkovo", "Összes projekt")}
              </span>
              <span className="font-heading font-bold text-2xl text-slate-850 mt-1 block">
                {totalProjects}
              </span>
            </div>
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Active Projects", "Aktívne projekty", "Aktív projektek")}
              </span>
              <span className="font-heading font-bold text-2xl text-purple-600 mt-1 block">
                {activeCount}
              </span>
            </div>
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Completed Projects", "Dokončené projekty", "Befejezett projektek")}
              </span>
              <span className="font-heading font-bold text-2xl text-emerald-600 mt-1 block">
                {completedCount}
              </span>
            </div>
          </div>

          {/* Filtering and Actions header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("Search projects...", "Vyhľadať projekty...", "Projekt keresése...")}
                  className="w-full pl-9.5 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-semibold text-slate-800 bg-white"
                />
              </div>

              {/* Status Filter */}
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="all">{t("All Statuses", "Všetky stavy", "Minden állapot")}</option>
                <option value="active">{t("Active", "Aktívne", "Aktív")}</option>
                <option value="completed">{t("Completed", "Dokončené", "Befejezett")}</option>
                <option value="on_hold">{t("On Hold", "Pozastavené", "Függőben")}</option>
                <option value="cancelled">{t("Cancelled", "Zrušené", "Törölt")}</option>
              </select>

              {/* Type Filter */}
              <select
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="all">{t("All Types", "Všetky typy", "Minden típus")}</option>
                {projectTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Create Project Button with Type Dropdown */}
            {canEdit && (
              <div className="relative select-none">
                <button
                  onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider hover:bg-indigo-700 shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  <Plus className="h-4.5 w-4.5" />
                  <span>{t("New Project", "Nový projekt", "Új projekt")}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 ml-1" />
                </button>

                {isCreateDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-[950] animate-in slide-in-from-top-2 duration-250">
                    <span className="block px-4 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-1.5 text-left">
                      {t("Select Project Type", "Vyberte typ projektu", "Válasszon projekt típust")}
                    </span>
                    {projectTypes.length === 0 ? (
                      <span className="block px-4 py-2 text-xs text-slate-450 italic text-left">
                        {t("No types configured.", "Nie sú nastavené typy.", "Nincsenek típusok.")}
                      </span>
                    ) : (
                      projectTypes.map(type => (
                        <button
                          key={type.id}
                          onClick={() => handleStartCreateProject(type)}
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />
                          <span>{type.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Projects Card Grid */}
          {filteredProjects.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl border border-white/60 bg-white/95 text-center text-slate-400 shadow-glass mt-6">
              <p className="text-sm font-semibold">{t("No projects found matching filters.", "Nenašli sa žiadne projekty.", "Nem találhatóak projektek.")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {filteredProjects.map(p => {
                const pType = projectTypes.find(t => t.id === p.projectTypeId);
                const lead = leads.find(l => l.id === p.leadId);
                const clientName = lead?.name || t("Unassigned client", "Nepriradený klient", "Nincs hozzárendelve");
                const progress = calculateProgress(p);

                if (!pType) return null;

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setEditingProjectType(pType);
                      setEditingProject(p);
                    }}
                    className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col text-left group relative"
                  >
                    {/* Project Type Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div 
                        className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: pType.color }}
                      >
                        {renderIcon(pType.icon, "h-3.5 w-3.5")}
                        <span>{pType.name}</span>
                      </div>

                      {/* Status badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.status === "completed"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : p.status === "on_hold"
                            ? "bg-amber-50 text-amber-600 border-amber-100"
                            : p.status === "cancelled"
                              ? "bg-rose-50 text-rose-600 border-rose-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                      }`}>
                        {p.status}
                      </span>
                    </div>

                    {/* Client Name */}
                    <h4 className="font-heading font-bold text-slate-800 group-hover:text-indigo-600 transition-colors text-base">
                      {clientName}
                    </h4>
                    
                    {/* Assigned Managers */}
                    {p.managers && p.managers.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-450 font-bold mt-2">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{p.managers.join(", ")}</span>
                      </div>
                    )}

                    <div className="flex-1 min-h-[20px]" />

                    {/* Roadmap Progress Bar */}
                    {pType.hasGantt && p.gantt && p.gantt.length > 0 && (
                      <div className="mt-4.5 space-y-1.5 shrink-0 select-none">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-450 uppercase">
                          <span>{t("Roadmap Progress", "Postup projektu", "Projekt haladása")}</span>
                          <span className="text-slate-700">{progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 relative overflow-hidden border border-slate-200/50">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${progress}%`,
                              backgroundColor: pType.color
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Hover delete trigger */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="absolute right-4 top-14 opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer z-10"
                        title={t("Delete Project", "Vymazať projekt", "Projekt törlése")}
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </>
      )}

    </div>
  );
};
