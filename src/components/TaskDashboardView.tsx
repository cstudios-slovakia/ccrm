import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  CheckSquare, Check, Calendar as CalendarIcon, 
  ChevronLeft, ChevronRight, Lock, Briefcase, Plus, X, AlertCircle,
  ChevronDown, ChevronUp
} from "lucide-react";
import type { Task, UserProfile, Lead } from "../types";
import type { Language } from "../utils/translations";

interface TaskDashboardViewProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  leads: Lead[];
  users?: UserProfile[]; // made optional to avoid TS errors if not passed
  systemLanguage: Language;
}

export const TaskDashboardView: React.FC<TaskDashboardViewProps> = ({
  tasks,
  setTasks,
  leads,
  users = [],
  systemLanguage
}) => {
  // --- Translations Helper ---
  const t = (en: string, sk: string, hu: string) => {
    if (systemLanguage === "sk") return sk;
    if (systemLanguage === "hu") return hu;
    return en;
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Expand/collapse states for task buckets
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(true);
  const [isTodayExpanded, setIsTodayExpanded] = useState(true);
  const [isTomorrowExpanded, setIsTomorrowExpanded] = useState(false);
  const [isFutureExpanded, setIsFutureExpanded] = useState(false);

  // Add Task Drawer State
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [isClosingDrawer, setIsClosingDrawer] = useState(false);

  const closeAddDrawer = () => {
    setIsClosingDrawer(true);
    setTimeout(() => {
      setIsAddDrawerOpen(false);
      setIsClosingDrawer(false);
    }, 350);
  };
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDeadline, setNewDeadline] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [newRelatedLeadId, setNewRelatedLeadId] = useState("");
  const [newIsLocking, setNewIsLocking] = useState(false);
  const [newAssignedUser, setNewAssignedUser] = useState("");

  // Helpers
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

  const monthNames = [
    t("January", "Január", "Január"), t("February", "Február", "Február"), t("March", "Marec", "Március"),
    t("April", "Apríl", "Április"), t("May", "Máj", "Május"), t("June", "Jún", "Június"),
    t("July", "Júl", "Július"), t("August", "August", "Augusztus"), t("September", "September", "Szeptember"),
    t("October", "Október", "Október"), t("November", "November", "November"), t("December", "December", "December")
  ];

  const daysInMonth = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    const days: Date[] = [];
    while (date.getMonth() === currentMonth) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [currentYear, currentMonth]);

  const paddingDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); 
    return (firstDay + 6) % 7;
  }, [currentYear, currentMonth]);

  // Find all timeline events from leads to display on the calendar
  const allEvents = useMemo(() => {
    const events: { date: string; title: string; leadName: string; type: string; isTask: boolean }[] = [];
    leads.forEach(lead => {
      if (lead.timeline) {
        lead.timeline.forEach(ev => {
          const evDate = ev.timestamp.split(" ")[0]; // YYYY-MM-DD
          events.push({
            date: evDate,
            title: ev.title,
            leadName: lead.name,
            type: ev.type,
            isTask: false
          });
        });
      }
    });
    return events;
  }, [leads]);

  // Combine tasks and events for rendering chips
  const getItemsForDate = (dateStr: string) => {
    const dayTasks = tasks.filter(t => t.deadline === dateStr && t.status !== "done");
    const dayEvents = allEvents.filter(e => e.date === dateStr);
    return { dayTasks, dayEvents };
  };

  const handleToggleTaskStatus = (taskId: string) => {
    setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: "done" } : task));
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      (window as any).showToast(t("Please enter a task title!", "Prosím zadajte názov úlohy!", "Kérjük, adja meg a feladat címét!"));
      return;
    }

    const createdTask: Task = {
      id: `task-${Date.now()}`,
      title: newTitle.trim(),
      description: newDescription.trim(),
      status: "todo",
      priority: newPriority,
      deadline: newDeadline,
      owner: newAssignedUser || "Erik",
      assignedUsers: newAssignedUser ? [newAssignedUser] : ["Erik"],
      relatedLeadId: newRelatedLeadId || undefined,
      isLocking: newRelatedLeadId ? newIsLocking : false
    };

    setTasks(prev => [createdTask, ...prev]);

    // Reset Form & Close Drawer
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewRelatedLeadId("");
    setNewIsLocking(false);
    setNewAssignedUser("");
    closeAddDrawer();
  };

  // --- RENDERING ---

  // --- RENDERING HELPERS ---

  const renderMonthGrid = () => {
    return (
      <div className="flex flex-col h-full bg-white animate-in fade-in zoom-in-95 duration-200">
        {/* Days Header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 shrink-0">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="py-2.5 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0">
              {d}
            </div>
          ))}
        </div>
        
        {/* Grid Cells */}
        <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:overflow-y-auto overflow-visible">
          {Array.from({ length: paddingDays }).map((_, i) => (
            <div key={`pad-${i}`} className="bg-slate-50/50 border-b border-r border-slate-100 min-h-[80px]" />
          ))}
          
          {daysInMonth.map((date, idx) => {
            const dateStr = date.toISOString().split("T")[0];
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const isTomorrow = dateStr === tomorrowStr;

            const { dayTasks, dayEvents } = getItemsForDate(dateStr);
            
            const totalItems = dayTasks.length + dayEvents.length;
            const displayTasks = dayTasks.slice(0, 3);
            const displayEvents = dayEvents.slice(0, Math.max(0, 3 - displayTasks.length));
            const hiddenCount = totalItems - (displayTasks.length + displayEvents.length);

            // Determine cell background styling based on time bucket
            let cellBgClass = "bg-white";
            if (isPast) cellBgClass = "bg-slate-50/70";
            else if (isToday) cellBgClass = "bg-indigo-50/40 border-indigo-100/60 shadow-[inset_0_0_10px_rgba(79,70,229,0.05)]";
            else if (isTomorrow) cellBgClass = "bg-amber-50/30";

            return (
              <div
                key={idx}
                onClick={() => setSelectedDay(date)}
                className={`min-h-[80px] border-b border-r border-slate-100 p-1.5 flex flex-col gap-1 transition-all cursor-pointer group relative hover:bg-slate-50 ${cellBgClass}`}
              >
                <div className={`text-[10px] font-black self-end mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? "bg-indigo-600 text-white shadow-sm" : 
                  isPast ? "text-slate-300 group-hover:text-slate-500" :
                  isTomorrow ? "text-amber-600 group-hover:bg-amber-100" :
                  "text-slate-400 group-hover:bg-slate-100 group-hover:text-indigo-600"
                }`}>
                  {date.getDate()}
                </div>
                
                <div className="flex-1 space-y-1 overflow-hidden">
                  {/* Render Tasks */}
                  {displayTasks.map(t => (
                    <div key={t.id} className={`truncate text-[8px] font-bold px-1 py-0.5 rounded border shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${
                      t.priority === 'high' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      t.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {t.isLocking && <Lock className="inline h-2 w-2 mr-0.5 -mt-0.5 text-rose-500" />}
                      {t.title}
                    </div>
                  ))}

                  {/* Render Events */}
                  {displayEvents.map((e, eIdx) => (
                    <div key={`ev-${eIdx}`} className="truncate text-[8px] font-bold px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-1">
                      <div className="h-1 w-1 rounded-full bg-indigo-400 shrink-0" />
                      {e.title}
                    </div>
                  ))}
                  
                  {hiddenCount > 0 && (
                    <div className="text-[8px] font-black text-slate-400 pl-1">
                      +{hiddenCount}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    if (!selectedDay) return null;
    
    const selectedDateStr = selectedDay.toISOString().split("T")[0];
    const { dayTasks, dayEvents } = getItemsForDate(selectedDateStr);
    const isPast = selectedDateStr < todayStr;

    return (
      <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <button 
              onClick={() => setSelectedDay(null)}
              className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-wider transition-colors cursor-pointer mb-2"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("Back to Month Calendar", "Späť na mesačný kalendár", "Vissza a havi naptárhoz")}
            </button>
            <h2 className="text-2xl font-black text-slate-850 tracking-tight flex items-center gap-2">
              <CalendarIcon className="h-6 w-6 text-indigo-600 stroke-[2.5]" />
              {selectedDay.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
          </div>
          <button
            onClick={() => {
              setNewDeadline(selectedDateStr);
              setIsAddDrawerOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            {t("Add Task", "Pridať úlohu", "Új feladat")}
          </button>
        </div>

        <div className="flex-1 lg:overflow-y-auto overflow-visible p-6 space-y-8 bg-slate-50/30">
          {/* TASKS LIST */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-violet-600" />
              {t("Pending Tasks", "Čakajúce úlohy", "Függőben lévő feladatok")}
            </h3>
            {dayTasks.length === 0 ? (
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
                <span className="text-xs font-bold text-slate-400">{t("No tasks scheduled.", "Žiadne úlohy.", "Nincsenek feladatok.")}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {dayTasks.map(task => (
                  <div key={task.id} className={`p-4 rounded-2xl bg-white border shadow-sm flex gap-3 transition-all relative overflow-hidden ${
                    isPast ? "border-rose-200" : "border-slate-200/80"
                  }`}>
                    {task.isLocking && <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500" />}
                    <button
                      onClick={() => handleToggleTaskStatus(task.id)}
                      className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer ${
                        isPast ? "border-rose-400 hover:bg-rose-50 hover:border-emerald-500" : "border-slate-300 hover:border-emerald-500 hover:bg-emerald-50"
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[3] text-emerald-500 opacity-0 hover:opacity-100" />
                    </button>
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <h4 className="text-sm font-black text-slate-800 truncate">{task.title}</h4>
                      {task.description && <p className="text-xs font-semibold text-slate-500 line-clamp-2">{task.description}</p>}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${
                          task.priority === "high" ? "bg-rose-50 text-rose-600 border-rose-200" :
                          task.priority === "medium" ? "bg-amber-50 text-amber-600 border-amber-200" :
                          "bg-slate-50 text-slate-600 border-slate-200"
                        }`}>{task.priority}</span>
                        
                        {task.relatedLeadId && (
                          <span className="text-[9px] font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
                            <Briefcase className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{leads.find(l => l.id === task.relatedLeadId)?.name || "Lead"}</span>
                          </span>
                        )}

                        {task.assignedUsers && task.assignedUsers.length > 0 && (
                          <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
                            <span className="h-1 w-1 rounded-full bg-indigo-500 shrink-0" />
                            <span className="truncate">{task.assignedUsers.join(", ")}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* EVENTS LIST */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-amber-600" />
              {t("Timeline Events", "Udalosti na časovej osi", "Idővonal események")}
            </h3>
            {dayEvents.length === 0 ? (
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
                <span className="text-xs font-bold text-slate-400">{t("No events logged.", "Žiadne udalosti.", "Nincsenek események.")}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {dayEvents.map((ev, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">{ev.type}</span>
                      <span className="text-[9px] font-bold text-slate-450 flex items-center gap-1">
                        <Briefcase className="h-2.5 w-2.5" /> {ev.leadName}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-slate-750">{ev.title}</h4>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- TASK BUCKETS ---
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
  const overdueTasks = tasks.filter(t => t.deadline < todayStr && t.status !== "done").sort((a, b) => a.deadline.localeCompare(b.deadline));
  const todayTasks = tasks.filter(t => t.deadline === todayStr && t.status !== "done");
  const tomorrowTasks = tasks.filter(t => t.deadline === tomorrowStr && t.status !== "done");
  const futureTasks = tasks.filter(t => t.deadline > tomorrowStr && t.status !== "done").sort((a, b) => a.deadline.localeCompare(b.deadline));

  const renderTaskCard = (task: Task) => (
    <div key={task.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex gap-3 transition-all relative overflow-hidden hover:border-slate-300">
      {task.isLocking && <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500" />}
      <button
        onClick={() => handleToggleTaskStatus(task.id)}
        className="mt-0.5 h-5 w-5 rounded-md border-2 border-slate-300 flex items-center justify-center shrink-0 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50"
      >
        <Check className="h-3 w-3 stroke-[3] text-emerald-500 opacity-0 hover:opacity-100" />
      </button>
      <div className="flex-1 space-y-1.5 min-w-0">
        <h4 className="text-sm font-black text-slate-800 truncate">{task.title}</h4>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${
            task.priority === "high" ? "bg-rose-50 text-rose-600 border-rose-200" :
            task.priority === "medium" ? "bg-amber-50 text-amber-600 border-amber-200" :
            "bg-slate-50 text-slate-600 border-slate-200"
          }`}>{task.priority}</span>
          
          {task.relatedLeadId && (
            <span className="text-[9px] font-bold text-slate-600 flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
              <Briefcase className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{leads.find(l => l.id === task.relatedLeadId)?.name || "Lead"}</span>
            </span>
          )}

          {task.assignedUsers && task.assignedUsers.length > 0 && (
            <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
              <span className="h-1 w-1 rounded-full bg-indigo-500 shrink-0" />
              <span className="truncate">{task.assignedUsers.join(", ")}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // --- FULL CALENDAR MONTH VIEW WITH LEFT SIDEBAR (SPLIT VIEW) ---
  return (
    <div className="w-full lg:h-[calc(100vh-8rem)] h-auto flex flex-col animate-in fade-in slide-in-from-top-4 duration-300">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-850 tracking-tight font-heading flex items-center gap-2">
            <CalendarIcon className="h-7 w-7 text-indigo-600 stroke-[2.5]" />
            {t("Master Calendar", "Hlavný Kalendár", "Fő Naptár")}
          </h1>
          <p className="text-xs font-medium text-slate-450 tracking-wide mt-1">
            {t(
              "Overview of all scheduled tasks, pipeline blocks, and timeline events.",
              "Prehľad všetkých úloh, blokovaní a udalostí v čase.",
              "Az összes ütemezett feladat és esemény áttekintése."
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="px-4 text-sm font-black text-indigo-950 min-w-[140px] text-center tracking-wider uppercase">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          
          <button
            onClick={() => setIsAddDrawerOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="h-4.5 w-4.5 stroke-[3]" />
            {t("Add New Task", "Pridať novú úlohu", "Új feladat hozzáadása")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: TASK LISTS */}
        <div className="flex flex-col lg:h-full lg:overflow-y-auto overflow-visible h-auto space-y-6 pr-2 pb-6 lg:pb-0">
          
          {/* Overdue */}
          <div className="bg-rose-50/50 border border-rose-100 rounded-3xl p-5 shadow-sm transition-all">
            <button 
              onClick={() => setIsOverdueExpanded(!isOverdueExpanded)}
              className="w-full flex items-center justify-between text-left focus:outline-none group/btn cursor-pointer"
            >
              <h3 className="text-xs font-black text-rose-600 uppercase tracking-widest flex items-center gap-2 select-none">
                <AlertCircle className="h-5 w-5" /> {t("Overdue", "Zmeškané", "Lejárt")} ({overdueTasks.length})
              </h3>
              <span className="text-rose-500 group-hover/btn:text-rose-700 transition-colors">
                {isOverdueExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </span>
            </button>
            {isOverdueExpanded && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {overdueTasks.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-rose-200/50 bg-white/50 rounded-2xl text-center">
                    <span className="text-xs font-bold text-rose-500">{t("No overdue tasks!", "Žiadne zmeškané úlohy!", "Nincs lemaradás!")}</span>
                  </div>
                ) : (
                  <div className="space-y-3">{overdueTasks.map(renderTaskCard)}</div>
                )}
              </div>
            )}
          </div>

          {/* Today */}
          <div className="bg-indigo-50/30 border border-indigo-100 rounded-3xl p-5 shadow-sm transition-all">
            <button 
              onClick={() => setIsTodayExpanded(!isTodayExpanded)}
              className="w-full flex items-center justify-between text-left focus:outline-none group/btn cursor-pointer"
            >
              <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 select-none">
                <CheckSquare className="h-5 w-5" /> {t("Today", "Dnes", "Ma")} ({todayTasks.length})
              </h3>
              <span className="text-indigo-500 group-hover/btn:text-indigo-700 transition-colors">
                {isTodayExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </span>
            </button>
            {isTodayExpanded && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {todayTasks.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-indigo-200/50 bg-white/50 rounded-2xl text-center">
                    <span className="text-xs font-bold text-indigo-400">{t("All caught up!", "Všetko hotové!", "Minden kész!")}</span>
                  </div>
                ) : (
                  <div className="space-y-3">{todayTasks.map(renderTaskCard)}</div>
                )}
              </div>
            )}
          </div>

          {/* Tomorrow */}
          <div className="bg-amber-50/30 border border-amber-100 rounded-3xl p-5 shadow-sm transition-all">
            <button 
              onClick={() => setIsTomorrowExpanded(!isTomorrowExpanded)}
              className="w-full flex items-center justify-between text-left focus:outline-none group/btn cursor-pointer"
            >
              <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center gap-2 select-none">
                <CalendarIcon className="h-5 w-5" /> {t("Tomorrow", "Zajtra", "Holnap")} ({tomorrowTasks.length})
              </h3>
              <span className="text-amber-500 group-hover/btn:text-amber-700 transition-colors">
                {isTomorrowExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </span>
            </button>
            {isTomorrowExpanded && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {tomorrowTasks.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-amber-200/50 bg-white/50 rounded-2xl text-center">
                    <span className="text-xs font-bold text-amber-550">{t("No tasks for tomorrow.", "Žiadne úlohy na zajtra.", "Nincs feladat holnapra.")}</span>
                  </div>
                ) : (
                  <div className="space-y-3">{tomorrowTasks.map(renderTaskCard)}</div>
                )}
              </div>
            )}
          </div>

          {/* Future */}
          <div className="bg-slate-50/50 border border-slate-200 rounded-3xl p-5 shadow-sm transition-all">
            <button 
              onClick={() => setIsFutureExpanded(!isFutureExpanded)}
              className="w-full flex items-center justify-between text-left focus:outline-none group/btn cursor-pointer"
            >
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 select-none">
                <CalendarIcon className="h-5 w-5" /> {t("Upcoming", "Nadchádzajúce", "Közelgő")} ({futureTasks.length})
              </h3>
              <span className="text-slate-500 group-hover/btn:text-slate-700 transition-colors">
                {isFutureExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </span>
            </button>
            {isFutureExpanded && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {futureTasks.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-slate-200 bg-white/50 rounded-2xl text-center">
                    <span className="text-xs font-bold text-slate-400">{t("No upcoming tasks.", "Žiadne nadchádzajúce úlohy.", "Nincsenek közelgő feladatok.")}</span>
                  </div>
                ) : (
                  <div className="space-y-3">{futureTasks.map(renderTaskCard)}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CALENDAR OR DAY VIEW */}
        <div className="flex flex-col lg:h-full h-auto bg-white rounded-3xl border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.02)] lg:overflow-hidden overflow-visible">
          {selectedDay ? renderDayView() : renderMonthGrid()}
        </div>
      </div>

      {renderAddDrawer()}
    </div>
  );

  // Helper function to render drawer
  function renderAddDrawer() {
    if (!isAddDrawerOpen && !isClosingDrawer) return null;
    if (typeof document === "undefined") return null;
    return createPortal(
      <div className="fixed inset-0 z-[100000] flex justify-end">
        <div onClick={closeAddDrawer} className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm ${isClosingDrawer ? "animate-fade-out" : "animate-fade-in"}`} />
        <div className={`relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col p-6 overflow-y-auto ${isClosingDrawer ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-indigo-600" />
              {t("Create New Task", "Vytvoriť novú úlohu", "Új feladat")}
            </h2>
            <button onClick={closeAddDrawer} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
              <X className="h-5 w-5" />
            </button>
          </div>
          
          <form onSubmit={handleCreateTask} className="flex-1 py-5 space-y-5 text-xs font-bold">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase">{t("Task Title", "Názov", "Cím")}</label>
              <input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none" />
            </div>
            
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase">{t("Description", "Popis", "Leírás")}</label>
              <textarea rows={3} value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none resize-none" />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase">{t("Deadline Date", "Termín", "Határidő")}</label>
              <input type="date" required value={newDeadline} onChange={e => setNewDeadline(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{t("Priority", "Priorita", "Prioritás")}</label>
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-xl border-2 border-slate-200">
                {(["low", "medium", "high"] as const).map(prio => (
                  <button
                    key={prio} type="button" onClick={() => setNewPriority(prio)}
                    className={`py-2 rounded-lg font-black text-[9px] uppercase transition-all ${
                      newPriority === prio 
                        ? (prio === "high" ? "bg-rose-600 text-white" : prio === "medium" ? "bg-amber-500 text-white" : "bg-slate-600 text-white")
                        : "bg-white text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {prio}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase">{t("Assign Project Manager", "Priradiť projektového manažéra", "Projektmenedzser kijelölése")}</label>
              <select 
                value={newAssignedUser} 
                onChange={e => setNewAssignedUser(e.target.value)} 
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none bg-white"
              >
                <option value="">{t("-- Unassigned (Default Erik) --", "-- Nepriradený (Predvolený Erik) --", "-- Kijelöletlen (Alapértelmezett Erik) --")}</option>
                {users.map(u => (
                  <option key={u.name} value={u.name}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase">{t("Link to Lead/Client", "Prepojiť so záujemcom", "Összekapcsolás ügyféllel")}</label>
              <select value={newRelatedLeadId} onChange={e => { setNewRelatedLeadId(e.target.value); if (!e.target.value) setNewIsLocking(false); }} className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none bg-white">
                <option value="">{t("-- None --", "-- Žiadny --", "-- Nincs --")}</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {newRelatedLeadId && (
              <div className="p-3 rounded-xl bg-violet-50/50 border border-violet-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-violet-700 uppercase flex items-center gap-1"><Lock className="h-3 w-3" /> Block Pipeline Stage</span>
                <input type="checkbox" checked={newIsLocking} onChange={e => setNewIsLocking(e.target.checked)} className="h-4 w-4 cursor-pointer" />
              </div>
            )}
            
            <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-600/20">
              {t("Save Task", "Uložiť", "Mentés")}
            </button>
          </form>
        </div>
      </div>,
      document.body
    );
  }
};
