import { useState, useEffect, useMemo, useRef, lazy, Suspense, type ComponentType } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { LoginView } from "./components/LoginView";
import { TaskDashboardView } from "./components/TaskDashboardView";
import type { Lead, UserProfile, RolePermission, Task, UnifiedEntryRegistry, UnifiedEntryRow, CustomDashboard, ProjectType, Project, Warehouse, Supplier, WarehouseItem, WarehouseStock, WarehouseBatch, WarehouseMovement, FinancialCategory, FinancialRecord, InvoiceOffer, CompanyBillingSettings, ExternalInvoicingConfig, AiCustomTemplate } from "./types";
import { VERSION } from "./utils/version";
import { SOCIAL_MEDIA_ENABLED } from "./utils/featureFlags";
import type { MeetingNote } from "./components/MeetingRoomView";
import { getTranslation, formatTranslation } from "./utils/translations";
import { orderLeadStates } from "./utils/leadStates";
import { resolveTaskViewAll } from "./utils/taskSelectors";
import { InstallerWizard } from "./components/InstallerWizard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import FilePreviewPane from "./components/FilePreviewPane";
import { RefreshCw, AlertOctagon, Trash2, Copy } from "lucide-react";
import { ShaderGradient, ShaderGradientCanvas } from "shadergradient";
import { getStoredTheme, getStoredThemeMode, isThemeMode, startThemeWatcher, type Appearance, type ThemeMode } from "./utils/theme";
import { hasPersistentStorage } from "./utils/safeStorage";
import { LicenseBanner } from "./components/LicenseBanner";
import { fetchLicenseState } from "./utils/licenseApi";
import type { LicenseState } from "./utils/license";
import type { UserPrefs, UserPrefsApi } from "./utils/userPrefs";
import {
  DEFAULT_USER_PREFS,
  UserPrefsContext,
  clearLegacyPrefs,
  hasStoredPrefs,
  parseUserMetadata,
  readLegacyPrefs,
  readUserPrefs,
} from "./utils/userPrefs";

// Helper for resilient lazy loading: automatically reloads page if a build update changed chunk hash filenames
const safeLazy = <T extends ComponentType<any>>(importFn: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      return await importFn();
    } catch (error: any) {
      const isChunkError = error && (
        error.name === "ChunkLoadError" ||
        (error.message && (
          error.message.includes("Failed to fetch dynamically imported module") ||
          error.message.includes("Importing a module script failed") ||
          error.message.includes("Loading chunk")
        ))
      );
      // The auto-reload is rate-limited through sessionStorage. When the browser
      // forbids storage we fall back to an in-memory stand-in, which starts empty
      // after every reload — the limiter would never trip and a genuinely missing
      // chunk would reload the page forever. In that case we let the error reach
      // the ErrorBoundary, which offers the user a manual reload instead.
      if (isChunkError && hasPersistentStorage("sessionStorage")) {
        const reloadKey = "ccrm_chunk_reload";
        const lastReload = sessionStorage.getItem(reloadKey);
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem(reloadKey, now.toString());
          window.location.reload();
        }
      }
      throw error;
    }
  });

const Dashboard = safeLazy(() => import("./components/Dashboard").then(m => ({ default: m.Dashboard })));
const SettingsView = safeLazy(() => import("./components/SettingsView").then(m => ({ default: m.SettingsView })));
const LeadsDatagrid = safeLazy(() => import("./components/LeadsDatagrid").then(m => ({ default: m.LeadsDatagrid })));
const ClientsView = safeLazy(() => import("./components/ClientsView").then(m => ({ default: m.ClientsView })));
const FilesView = safeLazy(() => import("./components/FilesView").then(m => ({ default: m.FilesView })));
const PersonalSettingsView = safeLazy(() => import("./components/PersonalSettingsView").then(m => ({ default: m.PersonalSettingsView })));
const EmailView = safeLazy(() => import("./components/EmailView").then(m => ({ default: m.EmailView })));
const RagAiView = safeLazy(() => import("./components/RagAiView").then(m => ({ default: m.RagAiView })));
const ProjectsView = safeLazy(() => import("./components/ProjectsView").then(m => ({ default: m.ProjectsView })));
const MeetingRoomView = safeLazy(() => import("./components/MeetingRoomView").then(m => ({ default: m.MeetingRoomView })));
const UnifiedEntryView = safeLazy(() => import("./components/UnifiedEntryView").then(m => ({ default: m.UnifiedEntryView })));
const DynamicDashboardView = safeLazy(() => import("./components/DynamicDashboardView").then(m => ({ default: m.DynamicDashboardView })));
const UpdateNotesView = safeLazy(() => import("./components/UpdateNotesView").then(m => ({ default: m.UpdateNotesView })));
const AutomationView = safeLazy(() => import("./components/AutomationView").then(m => ({ default: m.AutomationView })));
const SocialMediaView = safeLazy(() => import("./components/SocialMediaView").then(m => ({ default: m.SocialMediaView })));
const WarehouseView = safeLazy(() => import("./components/WarehouseView").then(m => ({ default: m.WarehouseView })));
const FinancialManagementView = safeLazy(() => import("./components/FinancialManagementView").then(m => ({ default: m.FinancialManagementView })));
const InvoicingView = safeLazy(() => import("./components/InvoicingView").then(m => ({ default: m.InvoicingView })));

const ShaderGradientAny = ShaderGradient as any;

// Stable, order-fixed fingerprint of the settings block. Used to tell a genuine
// user edit apart from merely re-receiving the server's own settings, so the
// settings-sync effect never echoes server data back. Field order must be fixed
// (hence an array) and must match on both the client-state and server-data sides.
//
// Empty containers are normalised to null because the two sides represent "empty"
// differently: the server falls back to `[]` for colour maps but `{}` for
// leadStateParents/leadStateFollowUp (and `null` for a malformed column), while
// the client defaults to `{}`. Without this an "empty" field would look different
// depending on which side you asked, so saving settings from an empty field would
// continuously fight with the initial sync.
const computeSettingsSig = (s: any): string => {
  if (!s || typeof s !== "object") return "null";
  return JSON.stringify([
    s.systemName ?? "",
    s.systemLanguage ?? "",
    s.systemCurrency ?? "",
    s.leadStates ?? [],
    s.leadSources ?? [],
    s.leadCategories ?? [],
    s.leadStateColors && Object.keys(s.leadStateColors).length ? s.leadStateColors : null,
    s.leadSourceColors && Object.keys(s.leadSourceColors).length ? s.leadSourceColors : null,
    s.leadCategoryColors && Object.keys(s.leadCategoryColors).length ? s.leadCategoryColors : null,
    s.leadStageGroups && Object.keys(s.leadStageGroups).length ? s.leadStageGroups : null,
    s.leadStateParents && Object.keys(s.leadStateParents).length ? s.leadStateParents : null,
    s.leadStateFollowUp && Object.keys(s.leadStateFollowUp).length ? s.leadStateFollowUp : null,
    s.taskStates ?? [],
    s.taskStateColors && Object.keys(s.taskStateColors).length ? s.taskStateColors : null,
    s.integrationsConfig ?? null,
    s.companyBillingSettings ?? null,
    s.invoicingIntegrations ?? null,
  ]);
};

// Signature of an entire sync.php push payload (minus baseSyncedAt, which is
// just a concurrency token and changes on every request regardless of content).
// Used to tell a genuine unsaved edit apart from an automatic background push
// (e.g. the settings-resync effect) that happens to land after the session died.
const computePushSig = (p: {
  leads?: unknown; tasks?: unknown; users?: unknown; roles?: unknown;
  meetingNotes?: unknown; unifiedEntries?: unknown; unifiedEntriesData?: unknown;
  customDashboards?: unknown; projectTypes?: unknown; projects?: unknown;
  warehouses?: unknown; suppliers?: unknown; warehouseItems?: unknown;
  warehouseStock?: unknown; warehouseBatches?: unknown; warehouseMovements?: unknown;
  financialCategories?: unknown; financialRecords?: unknown;
  invoicesOffers?: unknown; aiCustomTemplates?: unknown;
  settings?: any;
}): string => JSON.stringify([
  p.leads, p.tasks, p.users, p.roles, p.meetingNotes, p.unifiedEntries,
  p.unifiedEntriesData, p.customDashboards, p.projectTypes, p.projects,
  p.warehouses, p.suppliers, p.warehouseItems, p.warehouseStock, p.warehouseBatches, p.warehouseMovements,
  p.financialCategories, p.financialRecords,
  p.invoicesOffers, p.aiCustomTemplates,
  computeSettingsSig(p.settings),
]);

// --- Delta sync (protocol v2) -------------------------------------------------
// Baseline of what the server is known to hold, as id → serialised record, so a
// push can carry just the records that actually changed plus the ids that went
// away. Under v1 every save re-uploaded the entire dataset; on a real install
// that is megabytes per keystroke-level edit and it is the reason a settings
// save took ~15s on a normal office uplink.

type RecordBaseline = Map<string, string>;

// Serialising every record on every push would be O(dataset) main-thread work.
// React state updates rebuild the array but leave untouched items as the SAME
// object, so caching by identity makes the diff cost track the edit, not the
// dataset. WeakMap so dropped records are collected with their entry.
const recordHashCache = new WeakMap<object, string>();

const hashRecord = (record: any): string => {
  if (record === null || typeof record !== "object") return JSON.stringify(record);
  const cached = recordHashCache.get(record);
  if (cached !== undefined) return cached;
  const hash = JSON.stringify(record);
  recordHashCache.set(record, hash);
  return hash;
};

const baselineOf = (records: any[] | undefined): RecordBaseline => {
  const out: RecordBaseline = new Map();
  for (const r of records ?? []) {
    if (r && r.id != null) out.set(String(r.id), hashRecord(r));
  }
  return out;
};

/**
 * Records that differ from the baseline, and ids the baseline had but the current
 * list does not. A missing baseline means "we have never confirmed anything with
 * the server", so everything is treated as changed and nothing as deleted — the
 * safe direction, since inventing deletions is how data disappears.
 */
const diffRecords = (
  records: any[] | undefined,
  baseline: RecordBaseline | undefined
): { changed: any[]; deletedIds: string[]; next: RecordBaseline } => {
  const list = records ?? [];
  const next = baselineOf(list);
  if (!baseline) {
    return { changed: list, deletedIds: [], next };
  }
  const changed: any[] = [];
  for (const r of list) {
    if (!r) continue;
    // A record with no id cannot be held in the baseline (which is keyed by id),
    // so there is no way to tell whether it changed — it must always be sent.
    // Skipping it, as this used to, silently dropped whole collections: user rows
    // carry no id, so every profile edit (name, password, mailbox credentials, a
    // newly added user) was diffed down to an empty array and never reached the
    // server, while the UI happily showed it as saved until the next reload.
    if (r.id == null) {
      changed.push(r);
      continue;
    }
    const id = String(r.id);
    if (baseline.get(id) !== next.get(id)) changed.push(r);
  }
  const deletedIds: string[] = [];
  for (const id of baseline.keys()) {
    if (!next.has(id)) deletedIds.push(id);
  }
  return { changed, deletedIds, next };
};

function App() {
  const activePushesRef = useRef(0);
  const visiblePushesRef = useRef(0);
  const lastPushTimeRef = useRef(0);
  // Set when a push is rejected with 401 (session expired) so the unsaved
  // change can be replayed after the user re-authenticates.
  const pendingPushRef = useRef(false);
  // Latest-value refs so a push that updates one entity never ships a stale copy of the
  // others (sync.php destructively replaces each collection, so a stale array would delete
  // freshly-created rows — the root cause of "assignment/recording resets" bugs).
  const leadsRef = useRef<Lead[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const rolesRef = useRef<RolePermission[]>([]);
  const usersRef = useRef<UserProfile[]>([]);
  const meetingNotesRef = useRef<MeetingNote[]>([]);
  const integrationsConfigRef = useRef<any>(null);
  const unifiedEntriesRef = useRef<UnifiedEntryRegistry[]>([]);
  const unifiedEntriesDataRef = useRef<Record<string, UnifiedEntryRow[]>>({});
  const customDashboardsRef = useRef<CustomDashboard[]>([]);
  const projectTypesRef = useRef<ProjectType[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const warehousesRef = useRef<Warehouse[]>([]);
  const suppliersRef = useRef<Supplier[]>([]);
  const warehouseItemsRef = useRef<WarehouseItem[]>([]);
  const warehouseStockRef = useRef<WarehouseStock[]>([]);
  const warehouseBatchesRef = useRef<WarehouseBatch[]>([]);
  const warehouseMovementsRef = useRef<WarehouseMovement[]>([]);
  const financialCategoriesRef = useRef<FinancialCategory[]>([]);
  const financialRecordsRef = useRef<FinancialRecord[]>([]);
  const invoicesOffersRef = useRef<InvoiceOffer[]>([]);
  const aiCustomTemplatesRef = useRef<AiCustomTemplate[]>([]);
  const companyBillingSettingsRef = useRef<CompanyBillingSettings | null>(null);
  const invoicingIntegrationsRef = useRef<ExternalInvoicingConfig | null>(null);
  // DB clock from the last GET/POST. Sent back as baseSyncedAt so the server can
  // avoid deleting records a concurrent user added after our snapshot.
  const baseSyncedAtRef = useRef<string | null>(null);
  // Serializes outbound pushes so two near-simultaneous saves (e.g. a rename that
  // triggers both a leads push and the settings-effect push) commit in order and
  // cannot revert each other on the server.
  const pushChainRef = useRef<Promise<void>>(Promise.resolve());
  // Signature of the settings we last knew the SERVER held. The settings-sync
  // effect pushes ONLY when the live settings diverge from this — i.e. a genuine
  // user edit — and never when the change came from applying the server's own
  // data. Without this the app echoes the loaded settings straight back and the
  // saving indicator flashes on every page load / poll. (A boolean "skip first
  // run" flag is not enough: the first run is often consumed by the pre-session
  // 401 bootstrap, before the real settings even arrive.)
  const lastSyncedSettingsSigRef = useRef<string | null>(null);
  // Pending debounced settings push (see the settings-sync effect). Non-null means a
  // settings edit is on screen but not yet on its way to the server, which the
  // beforeunload guard has to treat exactly like an in-flight save.
  const settingsPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Signature of the full push payload the server last confirmed (via a successful
  // push or a fresh poll pull). A 401'd push only counts as a "lost" edit — worth
  // alarming the user about and replaying after re-login — when its content
  // actually diverges from this. With no confirmed baseline yet (e.g. before
  // the initial authenticated sync), there is no evidence that a rejected
  // background push represents a user edit, so it must stay silent.
  const lastConfirmedPushSigRef = useRef<string | null>(null);
  // Highest POST protocol the SERVER told us it understands, via the GET response.
  // Stays at 1 until proven otherwise: sending a delta payload to a sync.php that
  // predates protocol v2 would have it read every unsent record as deleted and
  // empty the database, so this must never be optimistic.
  const serverProtocolRef = useRef(1);
  // Per-entity baseline of what the server is known to hold (see diffRecords).
  // Rebuilt from every full pull, advanced after every accepted push. Empty means
  // "nothing confirmed yet" and forces a full send.
  const syncedRecordsRef = useRef<Record<string, RecordBaseline>>({});
  const ueSyncedRecordsRef = useRef<Record<string, RecordBaseline>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncIndicatorVisible, setIsSyncIndicatorVisible] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dbInfo, setDbInfo] = useState<{ host: string; port: string; name: string; user: string; type?: string } | null>(null);

  const getTabFromHash = () => {
    const rawHash = window.location.hash.replace("#", "");
    const baseHash = rawHash.split(/[/?]/)[0];
    const hashLower = baseHash.toLowerCase();
    if (hashLower.startsWith("client-") || hashLower.startsWith("lead-") || hashLower.startsWith("user-") || hashLower.startsWith("ue_") || hashLower.startsWith("dash_") || hashLower.startsWith("settings") || hashLower.startsWith("warehouse") || hashLower.startsWith("financial") || hashLower.startsWith("invoices")) {
      return rawHash; // Keep case sensitivity and allow sub-tabs for settings, warehouse, financial and invoices
    }
    const validTabs = ["dashboard", "overview", "leads", "clients", "invoices", "tasks", "files", "personal-settings", "email", "rag_ai", "automation", "meetings", "projects", "updates", "warehouse", "financial", ...(SOCIAL_MEDIA_ENABLED ? ["social_media"] : [])];
    return validTabs.includes(hashLower) ? rawHash : "dashboard";
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [isInitialSyncResolved, setIsInitialSyncResolved] = useState(false);
  type ToastPayload = {
    // Identity, not the message text: two saves in a row raise the same wording,
    // and matching on the text let the first toast's timer close the second one early.
    id: number;
    message: string;
    variant: "info" | "error" | "warning";
    action?: { label: string; onClick: () => void };
  };
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A toast raised while a save is still in flight waits here instead of going on
  // screen next to the "Saving…" pill — the two contradict each other, and users
  // read "Ukladá sa…" and "…bol úspešne uložený!" side by side as a broken app.
  // It is released the moment the save lands (see the flush effect below).
  const pendingToastRef = useRef<ToastPayload | null>(null);
  const pendingToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Puts a toast on screen and (re)arms its auto-dismiss timer. Only touches refs
  // and setState, so the copy captured by the window.showToast installer stays valid.
  const displayToast = (next: ToastPayload) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast(next);
    // Toasts carrying an action stay until the user acts on them or dismisses them.
    if (!next.action) {
      toastTimerRef.current = setTimeout(() => {
        toastTimerRef.current = null;
        setToast(curr => (curr?.id === next.id ? null : curr));
      }, 5000);
    }
  };

  const flushPendingToast = () => {
    const held = pendingToastRef.current;
    if (pendingToastTimerRef.current) clearTimeout(pendingToastTimerRef.current);
    pendingToastTimerRef.current = null;
    if (!held) return;
    pendingToastRef.current = null;
    displayToast(held);
  };
  const flushPendingToastRef = useRef(flushPendingToast);
  flushPendingToastRef.current = flushPendingToast;

  // Release the held toast as soon as the save that suppressed it finishes, so the
  // user reads one banner at a time: "Ukladá sa…" first, then "…bol úspešne uložený!".
  useEffect(() => {
    if (isSyncIndicatorVisible) return;
    flushPendingToastRef.current();
  }, [isSyncIndicatorVisible]);

  useEffect(() => {
    (window as any).previewFile = (url: string, name: string) => {
      setPreviewFile({ url, name });
    };

    (window as any).showToast = (
      message: string,
      actionOrVariant?: { label: string; onClick: () => void } | "error" | "warning"
    ) => {
      // A dozen call sites put a severity string in the second slot instead of an
      // action. Taken literally that produced a toast with an empty action button
      // that never auto-dismissed, so normalise the two shapes here.
      const action = actionOrVariant && typeof actionOrVariant === "object" ? actionOrVariant : undefined;
      const variant: ToastPayload["variant"] =
        actionOrVariant === "error" || actionOrVariant === "warning" ? actionOrVariant : "info";
      const next: ToastPayload = { id: ++toastIdRef.current, message, variant, action };
      // visiblePushesRef is bumped the moment a save is queued (not when the request
      // actually starts), because callers fire their success toast synchronously right
      // after asking for the push — this check would otherwise always miss.
      if (visiblePushesRef.current > 0) {
        pendingToastRef.current = next;
        if (pendingToastTimerRef.current) clearTimeout(pendingToastTimerRef.current);
        // Safety valve: a stalled or very slow push must never swallow the message.
        pendingToastTimerRef.current = setTimeout(() => flushPendingToastRef.current(), 4000);
        return;
      }
      displayToast(next);
    };
  }, []);
  const [systemName, setSystemName] = useState("CCRM");
  const [systemLanguage, setSystemLanguage] = useState<"en" | "sk" | "hu">("sk");
  const [userLanguage, setUserLanguage] = useState<"en" | "sk" | "hu">("sk");
  // Appearance (light/dark/system/auto) and the light palette are independent:
  // switching to dark and back has to give the user their herb theme again.
  const [userTheme, setUserTheme] = useState<string>(getStoredTheme);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [appearance, setAppearance] = useState<Appearance>(
    () => (document.documentElement.getAttribute("data-appearance") === "dark" ? "dark" : "light")
  );

  // The watcher owns the actual repaint. It also has to react to the OS theme
  // flipping and to the sun rising or setting, so it reads the current choice
  // through a ref rather than being re-attached on every change.
  const themeStateRef = useRef({ mode: themeMode, palette: userTheme });
  themeStateRef.current = { mode: themeMode, palette: userTheme };
  useEffect(
    // Re-attached on every explicit change so the watcher repaints at once and
    // re-arms its timers for the mode that is now in force.
    () => startThemeWatcher(() => themeStateRef.current, setAppearance),
    [themeMode, userTheme]
  );

  // Same three-language shorthand every view uses for one-off copy that has no
  // entry in translations.ts.
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  // Empty string means "auto" — follow the region's currency (see currencyForRegion) until an admin overrides it.
  const [systemCurrency, setSystemCurrency] = useState<string>("");

  // Meeting Room state
  const [meetingsAction, setMeetingsAction] = useState<"list" | "new">("list");
  const [autoOpenAddTask, setAutoOpenAddTask] = useState(false);
  // Server-backed state. The real rows arrive with the first sync GET (see
  // meeting_notes / project_types / projects in sync.php) and every edit is
  // pushed back through updateMeetingNotesAndSync & friends, exactly like leads
  // and tasks below. They used to also be mirrored into localStorage as a
  // paint-ahead cache: that duplicated the server as a source of truth, went
  // stale as soon as the user opened a second device, and — because the cache
  // miss fell back to two hardcoded demo meetings — briefly showed fake
  // meetings in a real customer's CRM on any fresh browser.
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([]);

  // Project Management state
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Warehouse & Inventory Management state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStock[]>([]);
  const [warehouseBatches, setWarehouseBatches] = useState<WarehouseBatch[]>([]);
  const [warehouseMovements, setWarehouseMovements] = useState<WarehouseMovement[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>([]);
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [invoicesOffers, setInvoicesOffers] = useState<InvoiceOffer[]>([]);
  const [aiCustomTemplates, setAiCustomTemplates] = useState<AiCustomTemplate[]>([]);
  const [companyBillingSettings, setCompanyBillingSettings] = useState<CompanyBillingSettings | null>(null);
  const [invoicingIntegrations, setInvoicingIntegrations] = useState<ExternalInvoicingConfig | null>(null);

  // Initial states set to empty / defaults without localStorage or mockData loaders
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unifiedEntries, setUnifiedEntries] = useState<UnifiedEntryRegistry[]>([]);
  const [unifiedEntriesData, setUnifiedEntriesData] = useState<Record<string, UnifiedEntryRow[]>>({});
  const [customDashboards, setCustomDashboards] = useState<CustomDashboard[]>([]);

  const [leadStates, setLeadStates] = useState<string[]>([
    "new", "contacted", "offer sent", "accepted", "rejected"
  ]);

  const [taskStates, setTaskStates] = useState<string[]>([
    "New", "In progress", "Blocked", "Done"
  ]);

  const [taskStateColors, setTaskStateColors] = useState<Record<string, string>>({
    "New": "#3b82f6",
    "In progress": "#f59e0b",
    "Blocked": "#ef4444",
    "Done": "#10b981"
  });

  const [leadSources, setLeadSources] = useState<string[]>([
    "showroom", "facebook", "instagram", "website"
  ]);

  // Placeholders only — the real, language-aware lists are seeded at install
  // (see ccrm_default_lists in api/schema.php) and arrive with the first sync.
  const [leadCategories, setLeadCategories] = useState<string[]>([
    "Products", "Services"
  ]);

  const [leadStateColors, setLeadStateColors] = useState<Record<string, string>>({
    "new": "#3b82f6",
    "contacted": "#0ea5e9",
    "offer sent": "#6366f1",
    "accepted": "#10b981",
    "rejected": "#ef4444"
  });

  const [leadSourceColors, setLeadSourceColors] = useState<Record<string, string>>({
    "showroom": "#10b981",
    "facebook": "#3b82f6",
    "instagram": "#ec4899",
    "website": "#8b5cf6"
  });

  const [leadCategoryColors, setLeadCategoryColors] = useState<Record<string, string>>({
    "Products": "#f59e0b",
    "Services": "#10b981"
  });

  const [leadStageGroups, setLeadStageGroups] = useState<Record<string, "new" | "in_progress" | "closed">>({
    "new": "new",
    "contacted": "in_progress",
    "offer sent": "in_progress",
    "accepted": "closed",
    "rejected": "closed"
  });

  const [leadStateParents, setLeadStateParents] = useState<Record<string, string>>({});

  // Pipeline order shown everywhere in the app — the raw `leadStates` array keeps
  // insertion order, so it has to be sorted the way Settings lists the stages.
  const orderedLeadStates = useMemo(
    () => orderLeadStates(leadStates, leadStageGroups, leadStateParents),
    [leadStates, leadStageGroups, leadStateParents],
  );

  // Per-state flag: which lead states show a "Follow-up done" checkbox on the lead.
  // Keyed by lowercased state name (admin-configurable in Settings). Robust to
  // renaming/removing states — a removed state's entry simply stops mattering.
  const [leadStateFollowUp, setLeadStateFollowUp] = useState<Record<string, boolean>>({});

  const [integrationsConfig, setIntegrationsConfig] = useState<any>({
    emailProvider: "smtp",
    smtpHost: "",
    smtpPort: "465",
    smtpSecure: "ssl",
    smtpAuth: true,
    smtpUser: "",
    smtpPassword: "",
    senderName: "CCRM",
    senderEmail: "",
    exchUrl: "https://outlook.office365.com/EWS/Exchange.asmx",
    exchDomain: "",
    exchAuth: "oauth",
    exchClientId: "00000000-0000-0000-0000-000000000000",
    exchTenantId: "00000000-0000-0000-0000-000000000000",
    exchClientSecret: "",
    exchPassword: "",
    exchMailbox: "",
    metaAppId: "",
    metaAppSecret: "",
    metaAccessToken: "",
    googleDevToken: "",
    googleClientId: "",
    googleClientSecret: "",
    googleRefreshToken: "",
    adsConnected: false,
    campaigns: [],
    zernioApiKey: "",
    zernioConnected: false,
    zernioAccounts: []
  });



  // Roles Registry
  const [roles, setRoles] = useState<RolePermission[]>([]);

  // Users Directory
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Current session (null represents logged-out state)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const stored = sessionStorage.getItem("crm_current_user_rbac");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem("crm_current_user_rbac", JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem("crm_current_user_rbac");
    }
  }, [currentUser]);

  // Licence for this installation. Fetched once per session and re-checked on a
  // slow timer — it changes about once a year, and api/license.php throttles the
  // call it makes to the licence server behind this anyway.
  //
  // `null` means "not known yet, or could not be read", and every consumer treats
  // that as "say nothing": no banner, no seat limit. A licence check that fails
  // must never be the reason someone cannot add a colleague.
  const [licenseState, setLicenseState] = useState<LicenseState | null>(null);
  // Read from inside the sync push handler, which is rebuilt on every render and
  // must not close over a licence state that was current three renders ago.
  const licenseStateRef = useRef<LicenseState | null>(null);
  licenseStateRef.current = licenseState;

  useEffect(() => {
    if (!currentUser) {
      setLicenseState(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const next = await fetchLicenseState();
      if (!cancelled && next) setLicenseState(next);
    };
    load();
    // Six hours: long enough to be invisible, short enough that a licence that
    // expires overnight is reflected in a browser tab left open for days.
    const timer = window.setInterval(load, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser?.email]);

  // Theme, error sidebar and the leads-screen view modes are per-user
  // preferences read out of the DB — see the UserPrefs block below.
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchErrorLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch("/api/error_logs.php");
      const data = await response.json();
      if (data.success) {
        setErrorLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to fetch error logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const clearErrorLogs = async () => {
    if (!confirm(t("Are you sure you want to clear all error logs?", "Naozaj chcete vymazať všetky chybové záznamy?", "Biztosan törli az összes hibanaplót?"))) {
      return;
    }
    try {
      const response = await fetch("/api/error_logs.php", { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        setErrorLogs([]);
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t("Error logs cleared.", "Chybové záznamy boli vymazané.", "A hibanaplók törölve."));
        }
      }
    } catch (e) {
      console.error("Failed to clear error logs", e);
    }
  };

  const handleCopyLogDetails = (log: any) => {
    const text = `### CCRM Exception Report
- **Timestamp**: ${log.created_at}
- **Request**: ${log.request_method} ${log.request_uri}
- **Error Message**: ${log.message}
- **File**: ${log.file ? `${log.file}:${log.line}` : 'N/A'}

#### Stack Trace
\`\`\`
${log.trace || ''}
\`\`\`

#### Request Payload
\`\`\`json
${log.payload || ''}
\`\`\`
`;
    navigator.clipboard.writeText(text).then(() => {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Error details copied!", "Detaily boli skopírované!", "A hiba részletei kimásolva!"));
      }
    });
  };

  // Resolve a user's personal interface language from their DB-backed metadata.
  // Per-user language lives in metadata_json.language — the same durable, server-synced
  // place we keep their default landing page and nav layout — NOT sessionStorage, which
  // is per-tab, wiped on browser close, and doesn't follow the user across devices.
  // Returns null when the user hasn't chosen one, so we fall back to the system language.
  const getUserLanguage = (user: UserProfile | null): "en" | "sk" | "hu" | null => {
    if (!user?.metadata_json) return null;
    try {
      const meta = typeof user.metadata_json === "string"
        ? JSON.parse(user.metadata_json || "{}")
        : (user.metadata_json || {});
      const lang = meta?.language;
      return (lang === "en" || lang === "sk" || lang === "hu") ? lang : null;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    setUserLanguage(getUserLanguage(currentUser) || systemLanguage);
  }, [currentUser, systemLanguage]);

  // Mirror the active language into localStorage. Components that render OUTSIDE
  // the App tree — the ErrorBoundary that wraps it — have no other way to know
  // which language to crash in.
  useEffect(() => {
    try {
      localStorage.setItem("crm_language", userLanguage);
    } catch (e) {
      // Private-mode / quota failures must never break rendering.
    }
  }, [userLanguage]);

  // Change the active UI language and persist it as the user's personal preference in
  // their DB-backed metadata, so it survives refreshes, re-logins and other devices.
  // Falls back to just updating local state when no user is logged in (e.g. login screen).
  const changeUserLanguage = (lang: "en" | "sk" | "hu") => {
    setUserLanguage(lang);
    if (!currentUser) return;
    let currentMeta: any = {};
    try {
      currentMeta = typeof currentUser.metadata_json === "string"
        ? JSON.parse(currentUser.metadata_json || "{}")
        : (currentUser.metadata_json || {});
    } catch (e) {
      console.error("Error parsing user metadata_json", e);
    }
    const nextMeta = { ...currentMeta, language: lang };
    updateUsersAndSync(prevUsers => prevUsers.map(u =>
      u.email === currentUser.email ? { ...u, metadata_json: nextMeta } : u
    ));
    // Keep the in-memory currentUser in step so the effect above doesn't briefly revert.
    setCurrentUser(prev => prev ? { ...prev, metadata_json: nextMeta } : prev);
  };

  // Dynamically update browser tab document title based on the active view and language preference
  useEffect(() => {
    // Routes carry sub-paths and query strings (e.g. "settings/branding",
    // "meetings/new?record=true") — strip them so the base view still resolves.
    const baseTab = activeTab.split(/[/?]/)[0];
    let viewName = "";
    if (baseTab.startsWith("client-")) {
      viewName = decodeURIComponent(baseTab.replace("client-", ""));
    } else if (baseTab.startsWith("lead-")) {
      const leadId = baseTab.replace("lead-", "");
      const targetLead = leads.find(l => String(l.id) === leadId);
      viewName = targetLead ? targetLead.name : "Lead";
    } else if (baseTab.startsWith("user-")) {
      viewName = decodeURIComponent(baseTab.replace("user-", ""));
    } else if (baseTab.startsWith("dash_")) {
      const dashId = baseTab.replace("dash_", "");
      const dash = (customDashboards || []).find(d => String(d.id) === dashId);
      viewName = dash ? dash.name : t("Dashboard", "Nástenka", "Irányítópult");
    } else if (baseTab.startsWith("ue_")) {
      const ueId = baseTab.replace("ue_", "");
      const ue = unifiedEntries.find(u => String(u.id) === ueId);
      viewName = ue ? ue.name : t("Records", "Záznamy", "Nyilvántartás");
    } else {
      switch (baseTab) {
        case "leads":
          viewName = getTranslation(userLanguage, "sidebar.leads");
          break;
        case "clients":
          viewName = getTranslation(userLanguage, "sidebar.clients");
          break;
        case "files":
          viewName = getTranslation(userLanguage, "sidebar.files");
          break;
        case "meetings":
          viewName = getTranslation(userLanguage, "sidebar.meetings");
          break;
        case "settings":
          viewName = getTranslation(userLanguage, "sidebar.settings");
          break;
        case "overview":
          viewName = getTranslation(userLanguage, "sidebar.dashboard");
          break;
        case "tasks":
          viewName = t("Tasks", "Úlohy", "Feladatok");
          break;
        case "projects":
          viewName = t("Projects", "Projekty", "Projektek");
          break;
        case "email":
          viewName = t("Mail Client", "Pošta", "Levelezés");
          break;
        case "rag_ai":
          viewName = t("RAG AI Assistant", "RAG AI Asistent", "RAG AI Asszisztens");
          break;
        case "automation":
          viewName = t("Automation", "Automatizácia", "Automatizálás");
          break;
        case "social_media":
          viewName = t("Social Media", "Sociálne siete", "Közösségi média");
          break;
        case "personal-settings":
          viewName = t("Personal Settings", "Osobné nastavenia", "Személyes beállítások");
          break;
        case "warehouse":
          viewName = t("Warehouse & Inventory", "Sklad a zásoby", "Raktár és készlet");
          break;
        case "invoices":
          viewName = t("Invoices & Price Offers", "Cenové ponuky a faktúry", "Árajánlatok és számlák");
          break;
        case "dashboard":
        default:
          viewName = t("Task Dashboard", "Panel úloh", "Feladat Irányítópult");
          break;
      }
    }

    // Dev-only version suffix so worktrees running side by side on different
    // vite ports are distinguishable by tab title; import.meta.env.DEV is
    // false in a production build, so this never reaches deployed instances.
    document.title = import.meta.env.DEV
      ? `${viewName} | ${systemName} — ${VERSION}`
      : `${viewName} | ${systemName}`;
  }, [activeTab, systemName, userLanguage, leads, customDashboards, unifiedEntries]);
  const taskAccess = (() => {
    if (!currentUser) {
      return { view: false, create: false, edit: false, delete: false, viewAll: false };
    }
    if (currentUser.role.toLowerCase() === "admin") {
      return { view: true, create: true, edit: true, delete: true, viewAll: true };
    }
    const role = roles.find((item) => item.name === currentUser.role);
    const permissions: Partial<RolePermission["permissions"]> = role?.permissions || {};
    const isProjectManager = currentUser.role.toLowerCase() === "project manager";
    const allowed = (slug: string, projectManagerDefault = false) => {
      if (Object.prototype.hasOwnProperty.call(permissions, slug)) {
        return permissions[slug] === "edit" || permissions[slug] === "view";
      }
      return isProjectManager && projectManagerDefault;
    };
    // Unlike the slugs above, seeing the team board is on by default and has to
    // be revoked explicitly — see resolveTaskViewAll.
    return {
      view: allowed("tasks.view", true),
      create: allowed("tasks.create", true),
      edit: allowed("tasks.edit", true),
      delete: permissions["tasks.delete"] === "edit",
      viewAll: resolveTaskViewAll(permissions, false),
    };
  })();


  // --- DYNAMICALLY DERIVED COMPATIBILITY PARAMETERS ---
  const projectManagers = users.map(u => u.name);
  const projectManagerColors = users.reduce((acc, u) => {
    acc[u.name] = u.color;
    return acc;
  }, {} as Record<string, string>);

  // Permission resolver helper
  const getPermission = (section: keyof RolePermission["permissions"]) => {
    if (!currentUser) return "nothing";
    if (currentUser.role.toLowerCase() === "admin") return "edit"; // Admin always has absolute write privileges
    const userRole = roles.find(r => r.name === currentUser.role);
    if (!userRole) return "nothing";
    return userRole.permissions[section] || "nothing";
  };

  // Has settings access flag
  const hasSettingsAccess = 
    getPermission("general_config") !== "nothing" ||
    getPermission("pm_managers") !== "nothing" ||
    getPermission("pipeline_stages") !== "nothing" ||
    getPermission("traffic_sources") !== "nothing" ||
    getPermission("system_reset") !== "nothing" ||
    getPermission("ai_config") !== "nothing";

  // Guard routing pathway from unauthorised users
  useEffect(() => {
    if (currentUser && activeTab === "settings" && !hasSettingsAccess) {
      setActiveTab("dashboard");
      window.location.hash = "dashboard";
    }
  }, [activeTab, currentUser, roles]);

  // Keep latest-value refs current on every render so pushStateToServer can fall back to
  // the freshest state for any entity the caller did not explicitly update.
  leadsRef.current = leads;
  tasksRef.current = tasks;
  rolesRef.current = roles;
  usersRef.current = users;
  meetingNotesRef.current = meetingNotes;
  integrationsConfigRef.current = integrationsConfig;
  unifiedEntriesRef.current = unifiedEntries;
  unifiedEntriesDataRef.current = unifiedEntriesData;
  customDashboardsRef.current = customDashboards;
  projectTypesRef.current = projectTypes;
  projectsRef.current = projects;
  warehousesRef.current = warehouses;
  suppliersRef.current = suppliers;
  warehouseItemsRef.current = warehouseItems;
  warehouseStockRef.current = warehouseStock;
  warehouseBatchesRef.current = warehouseBatches;
  warehouseMovementsRef.current = warehouseMovements;
  financialCategoriesRef.current = financialCategories;
  financialRecordsRef.current = financialRecords;
  invoicesOffersRef.current = invoicesOffers;
  aiCustomTemplatesRef.current = aiCustomTemplates;
  companyBillingSettingsRef.current = companyBillingSettings;
  invoicingIntegrationsRef.current = invoicingIntegrations;

  // --- REAL-TIME SERVER SYNCHRONIZER ENGINE ---
  const pushStateToServer = (
    nextLeads?: Lead[],
    nextTasks?: Task[],
    nextRoles?: RolePermission[],
    nextIntegrationsConfig?: any,
    nextUsers?: UserProfile[],
    nextMeetingNotes?: MeetingNote[],
    nextUnifiedEntries?: UnifiedEntryRegistry[],
    nextUnifiedEntriesData?: Record<string, UnifiedEntryRow[]>,
    nextCustomDashboards?: CustomDashboard[],
    nextProjectTypes?: ProjectType[],
    nextProjects?: Project[],
    nextWarehouses?: Warehouse[],
    nextSuppliers?: Supplier[],
    nextWarehouseItems?: WarehouseItem[],
    nextWarehouseStock?: WarehouseStock[],
    nextWarehouseBatches?: WarehouseBatch[],
    nextWarehouseMovements?: WarehouseMovement[],
    nextFinancialCategories?: FinancialCategory[],
    nextFinancialRecords?: FinancialRecord[],
    nextInvoicesOffers?: InvoiceOffer[],
    nextAiCustomTemplates?: AiCustomTemplate[],
    options?: { showIndicator?: boolean }
  ): Promise<void> => {
    if (!isInstalled || !currentUser || !isInitialSyncResolved) return pushChainRef.current;
    const shouldShowIndicator = options?.showIndicator !== false;
    if (shouldShowIndicator) {
      // Counted here rather than inside doPush: the change is already unsaved the
      // instant it is queued, and showToast reads this counter synchronously to hold
      // "…saved!" messages back until the save really lands.
      visiblePushesRef.current++;
      setIsSyncIndicatorVisible(true);
    }
    // Queue this push behind any in-flight one. Chaining (rather than firing in
    // parallel) guarantees the server applies saves in the order they were made,
    // so a stale settings snapshot can never land after the fresh one.
    const doPush = async () => {
    setIsSyncing(true);
    activePushesRef.current++;
    lastPushTimeRef.current = Date.now();
    // Everything the client currently believes, before deciding how much of it to
    // actually transmit.
    const liveLeads = nextLeads ?? leadsRef.current;
    const liveTasks = nextTasks ?? tasksRef.current;
    const liveUsers = nextUsers ?? usersRef.current;
    const liveMeetingNotes = nextMeetingNotes ?? meetingNotesRef.current;
    const liveUnifiedEntries = nextUnifiedEntries ?? unifiedEntriesRef.current;
    const liveUnifiedEntriesData = nextUnifiedEntriesData ?? unifiedEntriesDataRef.current;
    const liveCustomDashboards = nextCustomDashboards ?? customDashboardsRef.current;
    const liveProjectTypes = nextProjectTypes ?? projectTypesRef.current;
    const liveProjects = nextProjects ?? projectsRef.current;
    const liveWarehouses = nextWarehouses ?? warehousesRef.current;
    const liveSuppliers = nextSuppliers ?? suppliersRef.current;
    const liveWarehouseItems = nextWarehouseItems ?? warehouseItemsRef.current;
    const liveWarehouseStock = nextWarehouseStock ?? warehouseStockRef.current;
    const liveWarehouseBatches = nextWarehouseBatches ?? warehouseBatchesRef.current;
    const liveWarehouseMovements = nextWarehouseMovements ?? warehouseMovementsRef.current;
    const liveFinancialCategories = nextFinancialCategories ?? financialCategoriesRef.current;
    const liveFinancialRecords = nextFinancialRecords ?? financialRecordsRef.current;
    const liveInvoicesOffers = nextInvoicesOffers ?? invoicesOffersRef.current;
    const liveAiCustomTemplates = nextAiCustomTemplates ?? aiCustomTemplatesRef.current;

    const payload: any = {
      baseSyncedAt: baseSyncedAtRef.current,
      leads: liveLeads,
      tasks: liveTasks,
      users: liveUsers,
      roles: nextRoles ?? rolesRef.current,
      meetingNotes: liveMeetingNotes,
      unifiedEntries: liveUnifiedEntries,
      unifiedEntriesData: liveUnifiedEntriesData,
      customDashboards: liveCustomDashboards,
      projectTypes: liveProjectTypes,
      projects: liveProjects,
      warehouses: liveWarehouses,
      suppliers: liveSuppliers,
      warehouseItems: liveWarehouseItems,
      warehouseStock: liveWarehouseStock,
      warehouseBatches: liveWarehouseBatches,
      warehouseMovements: liveWarehouseMovements,
      financialCategories: liveFinancialCategories,
      financialRecords: liveFinancialRecords,
      invoicesOffers: liveInvoicesOffers,
      aiCustomTemplates: liveAiCustomTemplates,
      settings: {
        systemName,
        systemLanguage,
        systemCurrency,
        leadStates,
        leadSources,
        leadCategories,
        leadStateColors,
        leadSourceColors,
        leadCategoryColors,
        leadStageGroups,
        leadStateParents,
        leadStateFollowUp,
        taskStates,
        taskStateColors,
        integrationsConfig: nextIntegrationsConfig ?? integrationsConfigRef.current,
        companyBillingSettings: companyBillingSettingsRef.current,
        invoicingIntegrations: invoicingIntegrationsRef.current
      }
    };

    // Narrow the payload to what actually changed, but only once the server has
    // said it speaks v2. Under v1 an omitted record means "deleted", so sending a
    // delta to an older sync.php would wipe the database — hence the capability
    // check rather than a version assumption.
    const pendingBaselines: Record<string, RecordBaseline> = {};
    const pendingUeBaselines: Record<string, RecordBaseline> = {};
    if (serverProtocolRef.current >= 2) {
      const deleted: Record<string, unknown> = {};
      const narrow = (key: string, records: any[]) => {
        const { changed, deletedIds, next } = diffRecords(records, syncedRecordsRef.current[key]);
        payload[key] = changed;
        if (deletedIds.length) deleted[key] = deletedIds;
        pendingBaselines[key] = next;
      };
      narrow("leads", liveLeads);
      narrow("tasks", liveTasks);
      narrow("users", liveUsers);
      narrow("meetingNotes", liveMeetingNotes);
      narrow("customDashboards", liveCustomDashboards);
      narrow("projectTypes", liveProjectTypes);
      narrow("projects", liveProjects);
      narrow("warehouses", liveWarehouses);
      narrow("suppliers", liveSuppliers);
      narrow("warehouseItems", liveWarehouseItems);
      narrow("warehouseStock", liveWarehouseStock);
      narrow("warehouseBatches", liveWarehouseBatches);
      narrow("warehouseMovements", liveWarehouseMovements);
      narrow("financialCategories", liveFinancialCategories);
      narrow("financialRecords", liveFinancialRecords);
      narrow("invoicesOffers", liveInvoicesOffers);
      narrow("aiCustomTemplates", liveAiCustomTemplates);

      // The registry list stays whole on purpose: sync.php walks unifiedEntries to
      // reach each entry's dynamic table, so an entry omitted here would silently
      // stop its rows syncing. It is a handful of definitions, not user data.
      const ueDeleted: Record<string, string[]> = {};
      const ueChanged: Record<string, any[]> = {};
      for (const [ueId, rows] of Object.entries(liveUnifiedEntriesData ?? {})) {
        const { changed, deletedIds, next } = diffRecords(rows as any[], ueSyncedRecordsRef.current[ueId]);
        ueChanged[ueId] = changed;
        if (deletedIds.length) ueDeleted[ueId] = deletedIds;
        pendingUeBaselines[ueId] = next;
      }
      payload.unifiedEntriesData = ueChanged;
      if (Object.keys(ueDeleted).length) deleted.unifiedEntriesData = ueDeleted;

      payload.syncProtocol = 2;
      if (Object.keys(deleted).length) payload.deleted = deleted;
    }

    try {
      const res = await fetch("/sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        setCurrentUser(null);
        // Only treat this as a lost edit worth replaying after re-login if the
        // payload actually diverges from what
        // the server last confirmed. Otherwise this was an automatic background
        // push (e.g. the settings-resync effect) that happened to land after the
        // session had already died — nothing was really lost, so stay quiet.
        const pushSig = computePushSig(payload);
        const isRealUnsavedChange =
          lastConfirmedPushSigRef.current !== null &&
          pushSig !== lastConfirmedPushSigRef.current;
        if (isRealUnsavedChange) {
          // The mutation did not persist. Remember it so it is replayed from the
          // latest state refs once the user logs back in (see onLoginSuccess).
          pendingPushRef.current = true;
        }
      } else if (res.ok) {
        // The server now holds this exact payload — remember it so a later 401
        // can tell a genuine unsaved edit apart from an echoed no-op push.
        lastConfirmedPushSigRef.current = computePushSig(payload);
        // The server now holds these records, so the next push only has to carry
        // what changes from here. Done only on a confirmed write: advancing the
        // baseline after a failed push would make the client believe an edit was
        // saved and never send it again.
        Object.assign(syncedRecordsRef.current, pendingBaselines);
        Object.assign(ueSyncedRecordsRef.current, pendingUeBaselines);
        // Advance our snapshot clock so a delete right after this edit is not
        // wrongly skipped by the server's concurrency guard.
        try {
          const out = await res.json();
          if (out && typeof out.serverTime === "string") {
            baseSyncedAtRef.current = out.serverTime;
          }
          // Accounts the server refused because the licence has no seat left.
          // The push itself succeeded, so without this the new colleague would
          // simply not be there after the next poll, with nothing said.
          if (Array.isArray(out?.seatRejections) && out.seatRejections.length > 0) {
            const emails = out.seatRejections.filter((e: unknown) => typeof e === "string");
            if (emails.length > 0 && typeof (window as any).showToast === "function") {
              (window as any).showToast(
                formatTranslation(userLanguage, "license.seat_rejected", {
                  emails: emails.join(", "),
                  max: licenseStateRef.current?.maxUsers ?? "—",
                }),
                "warning"
              );
            }
          }
        } catch { /* non-JSON response — keep the previous snapshot clock */ }
      } else {
        // Any other failure (400 invalid payload, 413 too large, 500 DB error).
        // Previously this was swallowed silently, so the change stayed on screen
        // optimistically and then vanished on the next poll with no explanation
        // (exactly the "uploaded offer disappears" report). Surface it instead so
        // the user knows the save did not persist and can retry.
        let serverMsg = "";
        try { serverMsg = (await res.clone().json())?.message || ""; }
        catch { try { serverMsg = await res.text(); } catch { /* ignore */ } }
        console.error("sync.php push failed", res.status, serverMsg);
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(
            `Change not saved (server ${res.status}). Please try again.` +
            (serverMsg ? ` — ${String(serverMsg).slice(0, 140)}` : "")
          );
        }
      }
    } catch (err) {
      console.warn("Failed immediate push to sync.php", err);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t(
          "Change not saved — network error. Please check your connection and try again.",
          "Zmena sa neuložila — chyba siete. Skontrolujte pripojenie a skúste to znova.",
          "A módosítás nem mentődött el — hálózati hiba. Ellenőrizze a kapcsolatot, és próbálja újra."
        ));
      }
    } finally {
      activePushesRef.current = Math.max(0, activePushesRef.current - 1);
      if (activePushesRef.current === 0) {
        setIsSyncing(false);
      }
      if (shouldShowIndicator) {
        visiblePushesRef.current = Math.max(0, visiblePushesRef.current - 1);
        if (visiblePushesRef.current === 0) {
          setIsSyncIndicatorVisible(false);
        }
      }
    }
    };
    pushChainRef.current = pushChainRef.current.then(doPush, doPush);
    return pushChainRef.current;
  };

  const updateUnifiedEntriesAndSync = (
    newEntries: UnifiedEntryRegistry[] | ((prev: UnifiedEntryRegistry[]) => UnifiedEntryRegistry[]),
    newData?: Record<string, UnifiedEntryRow[]> | ((prev: Record<string, UnifiedEntryRow[]>) => Record<string, UnifiedEntryRow[]>)
  ) => {
    let resolvedData = unifiedEntriesData;
    if (newData) {
      resolvedData = typeof newData === "function" ? newData(unifiedEntriesData) : newData;
      setUnifiedEntriesData(resolvedData);
    }
    setUnifiedEntries(prev => {
      const nextEntries = typeof newEntries === "function" ? newEntries(prev) : newEntries;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, nextEntries, resolvedData);
      return nextEntries;
    });
  };

  const updateUnifiedEntriesDataAndSync = (
    ueId: string,
    updater: UnifiedEntryRow[] | ((prev: UnifiedEntryRow[]) => UnifiedEntryRow[])
  ) => {
    setUnifiedEntriesData(prev => {
      const currentRows = prev[ueId] || [];
      const nextRows = typeof updater === "function" ? updater(currentRows) : updater;
      const nextData = { ...prev, [ueId]: nextRows };
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, nextData);
      return nextData;
    });
  };

  const updateCustomDashboardsAndSync = (
    newDashboards: CustomDashboard[] | ((prev: CustomDashboard[]) => CustomDashboard[])
  ) => {
    setCustomDashboards(prev => {
      const nextDashboards = typeof newDashboards === "function" ? newDashboards(prev) : newDashboards;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, nextDashboards);
      return nextDashboards;
    });
  };

  const updateRolesAndSync = (newRoles: RolePermission[] | ((prev: RolePermission[]) => RolePermission[])) => {
    setRoles(prev => {
      const nextRoles = typeof newRoles === "function" ? newRoles(prev) : newRoles;
      pushStateToServer(undefined, undefined, nextRoles);
      return nextRoles;
    });
  };

  const updateIntegrationsConfigAndSync = (next: any) => {
    setIntegrationsConfig((prev: any) => {
      const updated = typeof next === "function" ? next(prev) : next;
      pushStateToServer(undefined, undefined, undefined, updated);
      return updated;
    });
  };

  const syncIntegrationsConfig = (config: any) => {
    if (!config) return;
    setIntegrationsConfig((prev: any) => {
      if (JSON.stringify(config) === JSON.stringify(prev)) return prev;
      return config;
    });
  };

  const updateLeadsAndSync = async (updater: Lead[] | ((prev: Lead[]) => Lead[])) => {
    setLeads((prev) => {
      const nextLeads = typeof updater === "function" ? updater(prev) : updater;
      leadsRef.current = nextLeads;
      pushStateToServer(nextLeads);
      return nextLeads;
    });
  };

  const updateTasksAndSync = (newTasks: Task[] | ((prev: Task[]) => Task[])) => {
    setTasks(prev => {
      const nextTasks = typeof newTasks === "function" ? newTasks(prev) : newTasks;
      tasksRef.current = nextTasks;
      pushStateToServer(undefined, nextTasks);
      return nextTasks;
    });
  };

  const updateProjectsAndSync = (newProjects: Project[] | ((prev: Project[]) => Project[])) => {
    setProjects(prev => {
      const nextProjects = typeof newProjects === "function" ? newProjects(prev) : newProjects;
      projectsRef.current = nextProjects;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, nextProjects);
      return nextProjects;
    });
  };

  const updateProjectTypesAndSync = (newTypes: ProjectType[] | ((prev: ProjectType[]) => ProjectType[])) => {
    setProjectTypes(prev => {
      const nextTypes = typeof newTypes === "function" ? newTypes(prev) : newTypes;
      projectTypesRef.current = nextTypes;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, nextTypes);
      return nextTypes;
    });
  };

  const updateWarehousesAndSync = (newWarehouses: Warehouse[] | ((prev: Warehouse[]) => Warehouse[])) => {
    setWarehouses(prev => {
      const next = typeof newWarehouses === "function" ? newWarehouses(prev) : newWarehouses;
      warehousesRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateSuppliersAndSync = (newSuppliers: Supplier[] | ((prev: Supplier[]) => Supplier[])) => {
    setSuppliers(prev => {
      const next = typeof newSuppliers === "function" ? newSuppliers(prev) : newSuppliers;
      suppliersRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateWarehouseItemsAndSync = (newItems: WarehouseItem[] | ((prev: WarehouseItem[]) => WarehouseItem[])) => {
    setWarehouseItems(prev => {
      const next = typeof newItems === "function" ? newItems(prev) : newItems;
      warehouseItemsRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateWarehouseStockAndSync = (newStock: WarehouseStock[] | ((prev: WarehouseStock[]) => WarehouseStock[])) => {
    setWarehouseStock(prev => {
      const next = typeof newStock === "function" ? newStock(prev) : newStock;
      warehouseStockRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateWarehouseBatchesAndSync = (newBatches: WarehouseBatch[] | ((prev: WarehouseBatch[]) => WarehouseBatch[])) => {
    setWarehouseBatches(prev => {
      const next = typeof newBatches === "function" ? newBatches(prev) : newBatches;
      warehouseBatchesRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateWarehouseMovementsAndSync = (newMovements: WarehouseMovement[] | ((prev: WarehouseMovement[]) => WarehouseMovement[])) => {
    setWarehouseMovements(prev => {
      const next = typeof newMovements === "function" ? newMovements(prev) : newMovements;
      warehouseMovementsRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateFinancialCategoriesAndSync = (newCats: FinancialCategory[] | ((prev: FinancialCategory[]) => FinancialCategory[])) => {
    setFinancialCategories(prev => {
      const next = typeof newCats === "function" ? newCats(prev) : newCats;
      financialCategoriesRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateFinancialRecordsAndSync = (newRecs: FinancialRecord[] | ((prev: FinancialRecord[]) => FinancialRecord[])) => {
    setFinancialRecords(prev => {
      const next = typeof newRecs === "function" ? newRecs(prev) : newRecs;
      financialRecordsRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateInvoicesOffersAndSync = (newOffers: InvoiceOffer[] | ((prev: InvoiceOffer[]) => InvoiceOffer[])) => {
    setInvoicesOffers(prev => {
      const next = typeof newOffers === "function" ? newOffers(prev) : newOffers;
      invoicesOffersRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateAiCustomTemplatesAndSync = (newTemplates: AiCustomTemplate[] | ((prev: AiCustomTemplate[]) => AiCustomTemplate[])) => {
    setAiCustomTemplates(prev => {
      const next = typeof newTemplates === "function" ? newTemplates(prev) : newTemplates;
      aiCustomTemplatesRef.current = next;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, next);
      return next;
    });
  };

  const updateCompanyBillingSettingsAndSync = (newSettings: CompanyBillingSettings | null | ((prev: CompanyBillingSettings | null) => CompanyBillingSettings | null)) => {
    setCompanyBillingSettings(prev => {
      const next = typeof newSettings === "function" ? newSettings(prev) : newSettings;
      companyBillingSettingsRef.current = next;
      pushStateToServer();
      return next;
    });
  };

  const updateInvoicingIntegrationsAndSync = (newIntegrations: ExternalInvoicingConfig | null | ((prev: ExternalInvoicingConfig | null) => ExternalInvoicingConfig | null)) => {
    setInvoicingIntegrations(prev => {
      const next = typeof newIntegrations === "function" ? newIntegrations(prev) : newIntegrations;
      invoicingIntegrationsRef.current = next;
      pushStateToServer();
      return next;
    });
  };

  const updateMeetingNotesAndSync = (newNotes: MeetingNote[] | ((prev: MeetingNote[]) => MeetingNote[])) => {
    setMeetingNotes(prev => {
      const nextNotes = typeof newNotes === "function" ? newNotes(prev) : newNotes;
      meetingNotesRef.current = nextNotes;
      pushStateToServer(undefined, undefined, undefined, undefined, undefined, nextNotes);
      return nextNotes;
    });
  };

  const updateUsersAndSync = (newUsers: UserProfile[] | ((prev: UserProfile[]) => UserProfile[])) => {
    setUsers(prev => {
      const nextUsers = typeof newUsers === "function" ? newUsers(prev) : newUsers;
      usersRef.current = nextUsers;
      pushStateToServer(undefined, undefined, undefined, undefined, nextUsers);
      // Keep the logged-in profile in step, but hand out a new object only when
      // its own row actually changed — an unrelated user's edit must not reset
      // everything that keys off the currentUser identity.
      setCurrentUser(me => {
        if (!me) return me;
        const updatedMe = nextUsers.find(u => u.email === me.email);
        if (!updatedMe || JSON.stringify(updatedMe) === JSON.stringify(me)) return me;
        return updatedMe;
      });
      return nextUsers;
    });
  };

  // ---------------------------------------------------------------------------
  // Per-user interface preferences (theme, error sidebar, leads view modes, seen
  // release note, custom RAG agent).
  //
  // These live in the user's DB row under metadata_json.preferences and reach
  // every screen through UserPrefsContext, so no view has to prop-drill them.
  // They were previously kept in localStorage/sessionStorage, which meant they
  // did not follow the account to another device, were lost whenever the browser
  // cleared site data, and — on iOS Safari with "Block All Cookies", where even
  // reading localStorage throws — crashed the app before it could paint.
  // ---------------------------------------------------------------------------

  // Nobody is logged in on the login screen, so there is no row to write to;
  // preference changes made there stay in memory for the session.
  const [anonPrefs, setAnonPrefs] = useState<Partial<UserPrefs>>({});

  // Keyed on the metadata blob rather than on the currentUser object: a background
  // poll hands out a fresh profile object every few seconds, and rebuilding the
  // preferences (and with them the context value) each time would re-render every
  // consumer for nothing. The blob is a string while it comes from the server, so
  // React's dependency comparison sees an unchanged value.
  const isLoggedIn = !!currentUser;
  const currentUserMetaJson = currentUser?.metadata_json;
  const userPrefs = useMemo<UserPrefs>(
    () => (isLoggedIn
      ? readUserPrefs({ metadata_json: currentUserMetaJson })
      : { ...DEFAULT_USER_PREFS, ...anonPrefs }),
    [isLoggedIn, currentUserMetaJson, anonPrefs]
  );

  const setUserPref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    if (!currentUser) {
      setAnonPrefs(prev => ({ ...prev, [key]: value }));
      return;
    }
    const nextMeta = {
      ...parseUserMetadata(currentUser),
      preferences: { ...readUserPrefs(currentUser), [key]: value }
    };
    updateUsersAndSync(prevUsers => prevUsers.map(u =>
      u.email === currentUser.email ? { ...u, metadata_json: nextMeta } : u
    ));
    // Keep the in-memory profile in step so the change paints immediately rather
    // than waiting for the users list to round-trip.
    setCurrentUser(prev => prev ? { ...prev, metadata_json: nextMeta } : prev);
  };

  // The context value must not close over a stale setter: pushStateToServer reads
  // isInitialSyncResolved from its own closure and silently drops pushes when it
  // is still false, so a memoised setter captured on first render would never
  // save anything.
  const setUserPrefRef = useRef(setUserPref);
  setUserPrefRef.current = setUserPref;
  const userPrefsApi = useMemo<UserPrefsApi>(() => ({
    prefs: userPrefs,
    setPref: (key, value) => setUserPrefRef.current(key, value)
  }), [userPrefs]);

  const errorSidebarEnabled = userPrefs.errorSidebarEnabled;

  // The appearance and the palette live in two places on purpose: localStorage,
  // which index.html can read before the first frame, and the user's DB row,
  // which follows the account to another browser. This adopts the row whenever
  // it disagrees — on login, and after a sync brings a change made elsewhere.
  //
  // Read straight out of the blob rather than through `userPrefs`, which fills
  // absent keys in from DEFAULT_USER_PREFS: an account that has never saved a
  // theme would otherwise look like it had chosen "system", and adopting that
  // would throw away the choice the visitor just made in this browser.
  const storedThemePrefs = useMemo(() => {
    const preferences = parseUserMetadata({ metadata_json: currentUserMetaJson }).preferences;
    return preferences && typeof preferences === "object"
      ? { mode: (preferences as Partial<UserPrefs>).themeMode, palette: (preferences as Partial<UserPrefs>).theme }
      : { mode: undefined, palette: undefined };
  }, [currentUserMetaJson]);
  const storedThemeMode = storedThemePrefs.mode;
  const storedThemePalette = storedThemePrefs.palette;
  useEffect(() => {
    if (!isLoggedIn) return;
    if (isThemeMode(storedThemeMode) && storedThemeMode !== themeModeRef.current) {
      setThemeMode(storedThemeMode);
    }
    if (storedThemePalette && storedThemePalette !== themePaletteRef.current) {
      setUserTheme(storedThemePalette);
    }
  }, [isLoggedIn, storedThemeMode, storedThemePalette]);

  // Writing a preference re-renders with a new `userPrefs`, so the effect above
  // must compare against what is on screen right now, not against a value it
  // captured — otherwise a local change and the row it just wrote fight.
  const themeModeRef = useRef(themeMode);
  themeModeRef.current = themeMode;
  const themePaletteRef = useRef(userTheme);
  themePaletteRef.current = userTheme;

  const changeThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    setUserPref("themeMode", mode);
  };
  const changeThemePalette = (palette: string) => {
    setUserTheme(palette);
    setUserPref("theme", palette);
  };

  useEffect(() => {
    if (errorSidebarEnabled) {
      fetchErrorLogs();
      const interval = setInterval(fetchErrorLogs, 15000);
      return () => clearInterval(interval);
    }
  }, [errorSidebarEnabled]);

  // One-shot adoption of the preferences an existing install still has sitting in
  // localStorage, so this change doesn't reset everybody's theme on first login.
  // Gated on a resolved sync and on the profile actually being present in `users`
  // — pushing a users array we haven't loaded yet would be a write of nothing.
  // Keyed on the email rather than a plain flag so that signing in as a second
  // user in the same tab migrates their preferences too.
  const legacyPrefsMigratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !isInitialSyncResolved) return;
    if (legacyPrefsMigratedForRef.current === currentUser.email) return;
    if (!users.some(u => u.email === currentUser.email)) return;
    legacyPrefsMigratedForRef.current = currentUser.email;

    if (hasStoredPrefs(currentUser)) {
      clearLegacyPrefs();
      return;
    }
    const nextMeta = {
      ...parseUserMetadata(currentUser),
      // The appearance is seeded from what this browser is actually showing,
      // not from DEFAULT_USER_PREFS: writing the default here would be read
      // straight back by the adoption effect above and would silently undo the
      // theme the visitor picked before they ever logged in.
      preferences: { ...DEFAULT_USER_PREFS, ...readLegacyPrefs(), themeMode, theme: userTheme }
    };
    updateUsersAndSync(prevUsers => prevUsers.map(u =>
      u.email === currentUser.email ? { ...u, metadata_json: nextMeta } : u
    ));
    setCurrentUser(prev => prev ? { ...prev, metadata_json: nextMeta } : prev);
    clearLegacyPrefs();
  }, [currentUser, users, isInitialSyncResolved, themeMode, userTheme]);

  const handleSaveUserLayout = (layout: string[], hidden?: string[]) => {
    if (!currentUser) return;
    let currentMeta: any = {};
    try {
      currentMeta = typeof currentUser.metadata_json === "string"
        ? JSON.parse(currentUser.metadata_json || "{}")
        : (currentUser.metadata_json || {});
    } catch (e) {
      console.error("Error parsing user metadata_json", e);
    }
    // navHidden records what the user removed on purpose, so a module added to
    // the product later can be told apart from one they chose to hide.
    const nextMeta = { ...currentMeta, navLayout: layout, ...(hidden ? { navHidden: hidden } : {}) };
    updateUsersAndSync(prevUsers => prevUsers.map(u => {
      if (u.email === currentUser.email) {
        return { ...u, metadata_json: nextMeta };
      }
      return u;
    }));
  };

  // Resolve the default landing page stored in a user's metadata (falls back to caller default)
  const getDefaultPageForUser = (user: UserProfile | null): string | null => {
    if (!user?.metadata_json) return null;
    try {
      const meta = typeof user.metadata_json === "string"
        ? JSON.parse(user.metadata_json || "{}")
        : (user.metadata_json || {});
      return meta?.defaultPage || null;
    } catch (e) {
      return null;
    }
  };

  const handleSaveDefaultPage = (pageId: string) => {
    if (!currentUser) return;
    let currentMeta: any = {};
    try {
      currentMeta = typeof currentUser.metadata_json === "string"
        ? JSON.parse(currentUser.metadata_json || "{}")
        : (currentUser.metadata_json || {});
    } catch (e) {
      console.error("Error parsing user metadata_json", e);
    }
    const nextMeta = { ...currentMeta, defaultPage: pageId };
    updateUsersAndSync(prevUsers => prevUsers.map(u => {
      if (u.email === currentUser.email) {
        return { ...u, metadata_json: nextMeta };
      }
      return u;
    }));
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t("Default landing page set.", "Predvolená úvodná stránka nastavená.", "Az alapértelmezett kezdőoldal beállítva."));
    }
  };

  // Expose leads state globally for markdown file name reference lookup
  useEffect(() => {
    (window as any).leads = leads;
  }, [leads]);

  // Warn before the page is unloaded while a save is still in flight, so a rename
  // (or any edit) is never lost by reloading/closing before it reaches the server.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // A debounced settings edit has not left the browser yet, so it counts as
      // unsaved just as much as a request already in flight.
      if (isSyncing || settingsPushTimerRef.current !== null) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isSyncing]);

  // Sync settings when modified (only AFTER the initial database sync is resolved to prevent overwriting with defaults)
  useEffect(() => {
    if (!isInstalled || !isInitialSyncResolved) return;
    const currentSig = computeSettingsSig({
      leadStates, leadSources, leadCategories, systemName, systemLanguage, systemCurrency,
      leadStateColors, leadSourceColors, leadCategoryColors, leadStageGroups,
      leadStateParents, leadStateFollowUp, taskStates, taskStateColors,
    });
    // Before we have ever seen the server's settings, just record the current
    // signature — there is nothing to push yet, and pushing here would echo the
    // freshly-loaded data (the cause of the indicator flashing on every reload).
    if (lastSyncedSettingsSigRef.current === null) {
      lastSyncedSettingsSigRef.current = currentSig;
      return;
    }
    // Identical to what the server last gave us → this change came from applying
    // server data, not a user edit. Do not echo it back.
    if (lastSyncedSettingsSigRef.current === currentSig) return;
    // A real divergence → persist it, and remember the new baseline.
    lastSyncedSettingsSigRef.current = currentSig;
    // Coalesce bursts before pushing. Every settings edit sends the WHOLE dataset
    // (all leads, tasks, unified rows — multi-MB on a real install), and an
    // <input type="color"> fires onChange for every step the user drags through the
    // picker. Undebounced, one drag queued dozens of full pushes that then drained
    // one-by-one through the serialized push chain: the save did complete, but
    // "Ukladá sa…" stayed up ~15s and the unload guard blocked a reload the whole time.
    if (settingsPushTimerRef.current) clearTimeout(settingsPushTimerRef.current);
    settingsPushTimerRef.current = setTimeout(() => {
      settingsPushTimerRef.current = null;
      // Safe to read from this closure: the effect re-runs on every settings change and
      // resets the timer, so the run that survives to fire is the one holding the
      // newest values.
      pushStateToServer();
    }, 700);
  }, [leadStates, leadSources, leadCategories, systemName, systemLanguage, systemCurrency, leadStateColors, leadSourceColors, leadCategoryColors, leadStageGroups, leadStateParents, leadStateFollowUp, taskStates, taskStateColors, isInitialSyncResolved]);

  // Layout Hash change listener
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);

    if (!window.location.hash) {
      // On initial app load with no explicit route, open the user's chosen default landing page
      window.location.hash = getDefaultPageForUser(currentUser) || "dashboard";
    }

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Server data poller.
  //
  // The server exposes a cheap `?probe=1` endpoint that returns only the
  // current data version. We poll that on every tick and only pull the full
  // (multi-MB) snapshot when the version actually moves. This replaces the old
  // behaviour of re-fetching, re-serialising and JSON.stringify-comparing the
  // entire dataset every few seconds — the main source of UI jank with ~1k
  // leads. Every ~12th tick we force a full pull regardless, so writes made
  // outside the SPA (cron agents, AI summaries) that don't bump the version
  // still surface within a minute.
  useEffect(() => {
    let lastDataVersion: string | null = null;
    let tick = 0;

    /* The PHP session is a cookie shared by every tab, while the logged-in user
       here lives in per-tab sessionStorage. Logging in as a colleague in a
       second tab rebinds this tab's writes to them without any 401 firing: the
       header keeps showing the old name while sync.php files every change under
       the new one. The server now reports whose session it is, so treat a
       disagreement as "this tab is no longer logged in as who it thinks". */
    const sessionUserChanged = (data: any) => {
      const serverEmail = String(data?.sessionUser?.email || "").trim().toLowerCase();
      const shownEmail = String(currentUser?.email || "").trim().toLowerCase();
      return serverEmail !== "" && shownEmail !== "" && serverEmail !== shownEmail;
    };

    const applyServerData = (data: any) => {
      setIsInstalled(true);
      setIsDemoMode(data.demoMode === true);
      // Not a real read: with DEMO_MODE on, an unauthenticated GET answers 200
      // with just the login picker instead of a 401, so a session that dies
      // mid-use lands here rather than in the 401 branch. Everything below would
      // treat that as "the server holds nothing" — blanking the dataset on screen
      // and re-anchoring the delta baseline to empty. Take only what the login
      // screen needs and stop.
      if (data.authenticated === false) {
        if (Array.isArray(data.users)) setUsers(data.users);
        const s = data.settings;
        if (s) {
          if (s.systemName && s.systemName !== systemName) setSystemName(s.systemName);
          if (s.systemLanguage && s.systemLanguage !== systemLanguage) setSystemLanguage(s.systemLanguage);
          if (s.systemCurrency !== undefined && s.systemCurrency !== systemCurrency) setSystemCurrency(s.systemCurrency || "");
        }
        setCurrentUser(null);
        return;
      }
      // Someone else's login took over the browser session. Stop before this
      // pull hands their data to a screen still labelled with the old user.
      if (sessionUserChanged(data)) {
        setCurrentUser(null);
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(t(
            "You are now signed in as a different user in this browser. Please log in again.",
            "V tomto prehliadači ste teraz prihlásený ako iný používateľ. Prihláste sa znova.",
            "Ebben a böngészőben már más felhasználóként van bejelentkezve. Jelentkezzen be újra."
          ), "warning");
        }
        return;
      }
      if (typeof data.serverTime === "string") {
        baseSyncedAtRef.current = data.serverTime;
      }
      if (data.leads && Array.isArray(data.leads)) {
        setLeads((prev) => JSON.stringify(prev) === JSON.stringify(data.leads) ? prev : data.leads);
      }
      if (data.tasks && Array.isArray(data.tasks)) {
        setTasks((prev) => JSON.stringify(prev) === JSON.stringify(data.tasks) ? prev : data.tasks);
      }
      if (data.users && Array.isArray(data.users)) {
        setUsers((prev) => JSON.stringify(prev) === JSON.stringify(data.users) ? prev : data.users);
        // Compare against the CURRENT user via the updater, not the one captured
        // in this closure: the closure is only refreshed when the logged-in email
        // changes, so comparing against it kept reporting "changed" and handed
        // out a new object on every single pull. Anything keyed on the currentUser
        // identity (personal settings, the language effect, the mail poller) then
        // reset itself every few seconds — which wiped forms while typing.
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const updatedMe = data.users.find((u: UserProfile) => u.email === prev.email);
          if (!updatedMe) return prev;
          const getNormUser = (u: UserProfile) => {
            const meta = typeof u.metadata_json === "string"
              ? JSON.parse(u.metadata_json || "{}")
              : (u.metadata_json || {});
            return { ...u, metadata_json: meta };
          };
          if (JSON.stringify(getNormUser(updatedMe)) === JSON.stringify(getNormUser(prev))) return prev;
          return updatedMe;
        });
      }
      if (data.db_info) {
        setDbInfo(data.db_info);
      }
      if (data.roles && Array.isArray(data.roles)) {
        setRoles((prev) => JSON.stringify(prev) === JSON.stringify(data.roles) ? prev : data.roles);
      }
      if (data.meetingNotes && Array.isArray(data.meetingNotes)) {
        setMeetingNotes((prev) => JSON.stringify(prev) === JSON.stringify(data.meetingNotes) ? prev : data.meetingNotes);
      }
      if (data.unifiedEntries && Array.isArray(data.unifiedEntries)) {
        setUnifiedEntries((prev) => JSON.stringify(prev) === JSON.stringify(data.unifiedEntries) ? prev : data.unifiedEntries);
      }
      if (data.unifiedEntriesData) {
        setUnifiedEntriesData((prev) => JSON.stringify(prev) === JSON.stringify(data.unifiedEntriesData) ? prev : data.unifiedEntriesData);
      }
      if (data.customDashboards && Array.isArray(data.customDashboards)) {
        setCustomDashboards(data.customDashboards);
      }
      if (data.projectTypes && Array.isArray(data.projectTypes)) {
        setProjectTypes(data.projectTypes);
      }
      if (data.projects && Array.isArray(data.projects)) {
        setProjects(data.projects);
      }
      if (data.warehouses && Array.isArray(data.warehouses)) {
        setWarehouses(data.warehouses);
      }
      if (data.suppliers && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers);
      }
      if (data.warehouseItems && Array.isArray(data.warehouseItems)) {
        setWarehouseItems(data.warehouseItems);
      }
      if (data.warehouseStock && Array.isArray(data.warehouseStock)) {
        setWarehouseStock(data.warehouseStock);
      }
      if (data.warehouseBatches && Array.isArray(data.warehouseBatches)) {
        setWarehouseBatches(data.warehouseBatches);
      }
      if (data.warehouseMovements && Array.isArray(data.warehouseMovements)) {
        setWarehouseMovements(data.warehouseMovements);
      }
      if (data.financialCategories && Array.isArray(data.financialCategories)) {
        setFinancialCategories(data.financialCategories);
      }
      if (data.financialRecords && Array.isArray(data.financialRecords)) {
        setFinancialRecords(data.financialRecords);
      }
      if (data.invoicesOffers && Array.isArray(data.invoicesOffers)) {
        setInvoicesOffers(data.invoicesOffers);
      }
      if (data.aiCustomTemplates && Array.isArray(data.aiCustomTemplates)) {
        setAiCustomTemplates(data.aiCustomTemplates);
      }
      if (data.settings) {
        const s = data.settings;
        if (s.systemName && s.systemName !== systemName) setSystemName(s.systemName);
        if (s.systemLanguage && s.systemLanguage !== systemLanguage) setSystemLanguage(s.systemLanguage);
        if (s.systemCurrency !== undefined && s.systemCurrency !== systemCurrency) setSystemCurrency(s.systemCurrency || "");
        if (s.companyBillingSettings) setCompanyBillingSettings(s.companyBillingSettings);
        if (s.invoicingIntegrations) setInvoicingIntegrations(s.invoicingIntegrations);
        setLeadStates((prev) => s.leadStates && JSON.stringify(s.leadStates) !== JSON.stringify(prev) ? s.leadStates : prev);
        setLeadSources((prev) => s.leadSources && JSON.stringify(s.leadSources) !== JSON.stringify(prev) ? s.leadSources : prev);
        setLeadCategories((prev) => s.leadCategories && JSON.stringify(s.leadCategories) !== JSON.stringify(prev) ? s.leadCategories : prev);
        setLeadStateColors((prev) => s.leadStateColors && JSON.stringify(s.leadStateColors) !== JSON.stringify(prev) ? s.leadStateColors : prev);
        setLeadSourceColors((prev) => s.leadSourceColors && JSON.stringify(s.leadSourceColors) !== JSON.stringify(prev) ? s.leadSourceColors : prev);
        setLeadCategoryColors((prev) => s.leadCategoryColors && JSON.stringify(s.leadCategoryColors) !== JSON.stringify(prev) ? s.leadCategoryColors : prev);
        setLeadStageGroups((prev) => s.leadStageGroups && JSON.stringify(s.leadStageGroups) !== JSON.stringify(prev) ? s.leadStageGroups : prev);
        setLeadStateParents((prev) => s.leadStateParents && JSON.stringify(s.leadStateParents) !== JSON.stringify(prev) ? s.leadStateParents : prev);
        setLeadStateFollowUp((prev) => s.leadStateFollowUp && JSON.stringify(s.leadStateFollowUp) !== JSON.stringify(prev) ? s.leadStateFollowUp : prev);
        setTaskStates((prev) => s.taskStates && JSON.stringify(s.taskStates) !== JSON.stringify(prev) ? s.taskStates : prev);
        setTaskStateColors((prev) => s.taskStateColors && JSON.stringify(s.taskStateColors) !== JSON.stringify(prev) ? s.taskStateColors : prev);
        if (s.integrationsConfig) syncIntegrationsConfig(s.integrationsConfig);
        // Remember what the server just gave us. The settings-sync effect compares
        // against this so applying server data never triggers an echo push.
        lastSyncedSettingsSigRef.current = computeSettingsSig(s);
      }
      // Whether this server understands delta pushes. Read from its own response
      // rather than assumed, so a client that is newer than the backend it happens
      // to be talking to keeps sending full snapshots instead of silently asking
      // it to delete everything it did not mention.
      if (typeof data.syncProtocol === "number") {
        serverProtocolRef.current = data.syncProtocol;
      }
      // Re-anchor the delta baseline on server truth. This is what makes the whole
      // scheme self-healing: however far local bookkeeping drifted — a lost
      // response, a rejected conflict, a record the server skipped — the next full
      // pull restores an accurate picture of what the server actually holds.
      syncedRecordsRef.current = {
        leads: baselineOf(data.leads ?? leadsRef.current),
        tasks: baselineOf(data.tasks ?? tasksRef.current),
        users: baselineOf(data.users ?? usersRef.current),
        meetingNotes: baselineOf(data.meetingNotes ?? meetingNotesRef.current),
        customDashboards: baselineOf(data.customDashboards ?? customDashboardsRef.current),
        projectTypes: baselineOf(data.projectTypes ?? projectTypesRef.current),
        projects: baselineOf(data.projects ?? projectsRef.current),
        warehouses: baselineOf(data.warehouses ?? warehousesRef.current),
        suppliers: baselineOf(data.suppliers ?? suppliersRef.current),
        warehouseItems: baselineOf(data.warehouseItems ?? warehouseItemsRef.current),
        warehouseStock: baselineOf(data.warehouseStock ?? warehouseStockRef.current),
        warehouseBatches: baselineOf(data.warehouseBatches ?? warehouseBatchesRef.current),
        warehouseMovements: baselineOf(data.warehouseMovements ?? warehouseMovementsRef.current),
        financialCategories: baselineOf(data.financialCategories ?? financialCategoriesRef.current),
        financialRecords: baselineOf(data.financialRecords ?? financialRecordsRef.current),
        invoicesOffers: baselineOf(data.invoicesOffers ?? invoicesOffersRef.current),
        aiCustomTemplates: baselineOf(data.aiCustomTemplates ?? aiCustomTemplatesRef.current),
      };
      const ueData = data.unifiedEntriesData ?? unifiedEntriesDataRef.current ?? {};
      const nextUeBaselines: Record<string, RecordBaseline> = {};
      for (const [ueId, rows] of Object.entries(ueData)) {
        nextUeBaselines[ueId] = baselineOf(rows as any[]);
      }
      ueSyncedRecordsRef.current = nextUeBaselines;
      // Baseline for the "was this a real unsaved edit" check on a future 401
      // (see pushStateToServer) — local state now matches what the server holds.
      lastConfirmedPushSigRef.current = computePushSig({
        leads: data.leads ?? leadsRef.current,
        tasks: data.tasks ?? tasksRef.current,
        users: data.users ?? usersRef.current,
        roles: data.roles ?? rolesRef.current,
        meetingNotes: data.meetingNotes ?? meetingNotesRef.current,
        unifiedEntries: data.unifiedEntries ?? unifiedEntriesRef.current,
        unifiedEntriesData: data.unifiedEntriesData ?? unifiedEntriesDataRef.current,
        customDashboards: data.customDashboards ?? customDashboardsRef.current,
        projectTypes: data.projectTypes ?? projectTypesRef.current,
        projects: data.projects ?? projectsRef.current,
        warehouses: data.warehouses ?? warehousesRef.current,
        suppliers: data.suppliers ?? suppliersRef.current,
        warehouseItems: data.warehouseItems ?? warehouseItemsRef.current,
        warehouseStock: data.warehouseStock ?? warehouseStockRef.current,
        warehouseBatches: data.warehouseBatches ?? warehouseBatchesRef.current,
        warehouseMovements: data.warehouseMovements ?? warehouseMovementsRef.current,
        financialCategories: data.financialCategories ?? financialCategoriesRef.current,
        financialRecords: data.financialRecords ?? financialRecordsRef.current,
        invoicesOffers: data.invoicesOffers ?? invoicesOffersRef.current,
        aiCustomTemplates: data.aiCustomTemplates ?? aiCustomTemplatesRef.current,
        settings: data.settings ?? {},
      });
    };

    const fetchFull = async () => {
      const pollStartTime = Date.now();
      const res = await fetch(`/sync.php?t=${Date.now()}`);
      if (res.status === 401) {
        // Installed, but no valid session: show the login screen instead of
        // hanging on the loader forever.
        setIsInstalled(true);
        setCurrentUser(null);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (activePushesRef.current > 0 || pollStartTime < lastPushTimeRef.current || Date.now() - lastPushTimeRef.current < 4000) {
        return;
      }
      if (data && data.installed === false) {
        setIsInstalled(false);
        return;
      }
      if (data && data.installed === true) {
        applyServerData(data);
        if (typeof data.dataVersion !== "undefined") lastDataVersion = data.dataVersion;
      }
    };

    // Initial bootstrap is always a full pull.
    (async () => {
      try {
        await fetchFull();
      } catch (err) {
        console.warn("Staging sync backend offline", err);
      } finally {
        // Always leave the boot loader, even on a 5xx or malformed response, so
        // the app never hangs forever on "Syncing…". Worst case the user sees the
        // login/app shell and the next poll recovers.
        setIsInitialSyncResolved(true);
      }
    })();

    const poller = setInterval(async () => {
      const pollStartTime = Date.now();
      try {
        tick++;
        const forceFull = tick % 12 === 0;
        if (!forceFull) {
          const probeRes = await fetch(`/sync.php?probe=1&t=${Date.now()}`);
          if (probeRes.status === 401) {
            setIsInstalled(true);
            setCurrentUser(null);
            return;
          }
          if (!probeRes.ok) return;
          const probe = await probeRes.json();
          // Under DEMO_MODE a dead session answers 200, not 401 (see
          // applyServerData). Without this the logout only surfaces on the next
          // forced full pull, up to a minute later.
          if (probe && probe.authenticated === false) {
            setIsInstalled(true);
            setCurrentUser(null);
            return;
          }
          // Cheapest place to catch a session taken over by another tab: the
          // probe runs every 5s, the full pull only when data actually moves.
          if (probe && sessionUserChanged(probe)) {
            setIsInstalled(true);
            setCurrentUser(null);
            return;
          }
          if (activePushesRef.current > 0 || pollStartTime < lastPushTimeRef.current || Date.now() - lastPushTimeRef.current < 4000) {
            return;
          }
          if (probe && probe.installed === false) {
            setIsInstalled(false);
            return;
          }
          // Nothing changed since our last full pull — skip the heavy fetch.
          if (lastDataVersion !== null && probe.dataVersion === lastDataVersion) {
            return;
          }
        }
        await fetchFull();
      } catch (err) {
        // quiet fail on background polling
      }
    }, 5000);

    return () => clearInterval(poller);
    // Re-subscribe on login/logout so a fresh session immediately re-syncs
    // (the GET now requires auth) and the poller closure never holds a stale user.
  }, [isInstalled, currentUser?.email]);

  // Background email fetching poller when the user is logged in
  useEffect(() => {
    if (!currentUser) return;

    let emailSettings: any = null;
    try {
      if (currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string'
          ? JSON.parse(currentUser.metadata_json)
          : currentUser.metadata_json;
        emailSettings = metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing emailSettings for background fetching", e);
    }

    if (!emailSettings || !emailSettings.isValidated) {
      return;
    }

    const fetchEmailsInBackground = async () => {
      try {
        await fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=1`, {
          headers: { "X-User-Email": currentUser.email }
        });
      } catch (err) {
        console.warn("Background email fetching failed", err);
      }
    };

    // Run once on load/login
    fetchEmailsInBackground();

    // Poll every 2 minutes
    const interval = setInterval(fetchEmailsInBackground, 120000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // View router
  const renderWorkspaceView = () => {
    // Raw currency code (or "" for "auto, follow region") — passed down so each
    // view can resolve the symbol AND its correct prefix/suffix position using
    // its own display language (see src/utils/currency.ts).
    const currencyCode = systemCurrency || null;
    const activeUser = currentUser || users[0] || {
      id: "guest",
      name: t("Guest User", "Hosť", "Vendég"),
      email: "guest@example.com",
      role: "Viewer",
      color: "#6366f1",
      avatar: null,
      activityLog: [],
      metadata_json: "{}"
    };

    if (activeTab.startsWith("user-")) {
      const username = decodeURIComponent(activeTab.replace("user-", ""));
      return (
        <SettingsView 
          systemName={systemName} 
          setSystemName={setSystemName} 
          leadStates={orderedLeadStates}
          setLeadStates={setLeadStates}
          leadSources={leadSources}
          setLeadSources={setLeadSources}
          users={users}
          setUsers={updateUsersAndSync}
          roles={roles}
          setRoles={updateRolesAndSync}
          getPermission={getPermission}
          currentUser={activeUser}
          leadStateColors={leadStateColors}
          setLeadStateColors={setLeadStateColors}
          leadCategories={leadCategories}
          setLeadCategories={setLeadCategories}
          leadSourceColors={leadSourceColors}
          setLeadSourceColors={setLeadSourceColors}
          leadCategoryColors={leadCategoryColors}
          setLeadCategoryColors={setLeadCategoryColors}
          leadStageGroups={leadStageGroups}
          setLeadStageGroups={setLeadStageGroups}
          leadStateFollowUp={leadStateFollowUp}
          setLeadStateFollowUp={setLeadStateFollowUp}
          systemLanguage={systemLanguage}
          setSystemLanguage={setSystemLanguage}
          systemCurrency={systemCurrency}
          setSystemCurrency={setSystemCurrency}
          userLanguage={userLanguage}
          initialSelectedUserName={username}
          leadStateParents={leadStateParents}
          setLeadStateParents={setLeadStateParents}
          taskStates={taskStates}
          setTaskStates={setTaskStates}
          taskStateColors={taskStateColors}
          setTaskStateColors={setTaskStateColors}
          isDemoMode={isDemoMode}
          dbInfo={dbInfo || undefined}
          projectTypes={projectTypes}
          setProjectTypes={updateProjectTypesAndSync}
          companyBillingSettings={companyBillingSettings}
          setCompanyBillingSettings={updateCompanyBillingSettingsAndSync}
          invoicingIntegrations={invoicingIntegrations}
          setInvoicingIntegrations={updateInvoicingIntegrationsAndSync}
          aiCustomTemplates={aiCustomTemplates}
          setAiCustomTemplates={updateAiCustomTemplatesAndSync}
          licenseState={licenseState}
          onLicenseStateChange={setLicenseState}
        />
      );
    }

    if (activeTab.startsWith("dash_")) {
      const dashId = activeTab.replace("dash_", "");
      const dashboard = customDashboards.find(d => d.id === dashId);
      if (dashboard) {
        return (
          <DynamicDashboardView
            dashboard={dashboard}
            onSaveDashboard={(updated: CustomDashboard) => {
              updateCustomDashboardsAndSync((prev) =>
                prev.map((d) => (d.id === updated.id ? updated : d))
              );
            }}
            systemLanguage={userLanguage}
            currencyCode={currencyCode}
          />
        );
      }
    }

    if (activeTab.startsWith("ue_")) {
      const parts = activeTab.split("/");
      const ueId = parts[0].replace("ue_", "");
      const subPath = parts[1] || null;
      const ueRegistry = unifiedEntries.find(ue => ue.id === ueId);
      if (ueRegistry) {
        return (
          <UnifiedEntryView
            registry={ueRegistry}
            rows={unifiedEntriesData[ueId] || []}
            setRows={(updater: any) => updateUnifiedEntriesDataAndSync(ueId, updater)}
            systemLanguage={userLanguage}
            leads={leads}
            subPath={subPath}
          />
        );
      }
    }

    if (activeTab.startsWith("client-")) {
      const clientName = decodeURIComponent(activeTab.replace("client-", ""));
      return (
        <ClientsView 
          leads={leads}
          setLeads={updateLeadsAndSync}
          projectManagers={projectManagers}
          leadSources={leadSources}
          initialSelectedClient={clientName}
          systemLanguage={userLanguage}
          tasks={tasks}
          setTasks={updateTasksAndSync}
          leadCategories={leadCategories}
          integrationsConfig={integrationsConfig}
          taskStates={taskStates}
          systemName={systemName}
          currencyCode={currencyCode}
        />
      );
    }

    if (activeTab.startsWith("lead-")) {
      const leadId = activeTab.replace("lead-", "");
      return (
        <LeadsDatagrid 
          systemName={systemName}
          leads={leads}
          setLeads={updateLeadsAndSync}
          leadStates={orderedLeadStates}
          leadSources={leadSources}
          projectManagers={projectManagers}
          leadStateColors={leadStateColors}
          leadStateParents={leadStateParents}
          initialSelectedLeadId={leadId}
          projectManagerColors={projectManagerColors}
          leadCategories={leadCategories}
          leadSourceColors={leadSourceColors}
          leadCategoryColors={leadCategoryColors}
          systemLanguage={userLanguage}
          tasks={tasks}
          setTasks={updateTasksAndSync}
          users={users}
          taskStates={taskStates}
          taskStateColors={taskStateColors}
          integrationsConfig={integrationsConfig}
          leadStageGroups={leadStageGroups}
          projectTypes={projectTypes}
          setProjects={updateProjectsAndSync}
          setActiveTab={setActiveTab}
          leadStateFollowUp={leadStateFollowUp}
          currencyCode={currencyCode}
        />
      );
    }
    if (activeTab.startsWith("settings")) {
      const parts = activeTab.split("/");
      const subTab = parts[1] || "branding";
      const settingsAction = parts[2] || null;
      const settingsActionId = parts[3] || null;
      return (
        <SettingsView 
          systemName={systemName} 
          setSystemName={setSystemName} 
          leadStates={orderedLeadStates}
          setLeadStates={setLeadStates}
          leadSources={leadSources}
          setLeadSources={setLeadSources}
          users={users}
          setUsers={updateUsersAndSync}
          roles={roles}
          setRoles={updateRolesAndSync}
          getPermission={getPermission}
          currentUser={activeUser}
          leadStateColors={leadStateColors}
          setLeadStateColors={setLeadStateColors}
          leadCategories={leadCategories}
          setLeadCategories={setLeadCategories}
          leadSourceColors={leadSourceColors}
          setLeadSourceColors={setLeadSourceColors}
          leadCategoryColors={leadCategoryColors}
          setLeadCategoryColors={setLeadCategoryColors}
          leadStageGroups={leadStageGroups}
          setLeadStageGroups={setLeadStageGroups}
          leadStateFollowUp={leadStateFollowUp}
          setLeadStateFollowUp={setLeadStateFollowUp}
          systemLanguage={systemLanguage}
          setSystemLanguage={setSystemLanguage}
          systemCurrency={systemCurrency}
          setSystemCurrency={setSystemCurrency}
          userLanguage={userLanguage}
          leadStateParents={leadStateParents}
          setLeadStateParents={setLeadStateParents}
          isDemoMode={isDemoMode}
          integrationsConfig={integrationsConfig}
          updateIntegrationsConfig={updateIntegrationsConfigAndSync}
          dbInfo={dbInfo || undefined}
          taskStates={taskStates}
          setTaskStates={setTaskStates}
          taskStateColors={taskStateColors}
          setTaskStateColors={setTaskStateColors}
          setLeads={updateLeadsAndSync}
          setTasks={updateTasksAndSync}
          projectTypes={projectTypes}
          setProjectTypes={updateProjectTypesAndSync}
          companyBillingSettings={companyBillingSettings}
          setCompanyBillingSettings={updateCompanyBillingSettingsAndSync}
          invoicingIntegrations={invoicingIntegrations}
          setInvoicingIntegrations={updateInvoicingIntegrationsAndSync}
          aiCustomTemplates={aiCustomTemplates}
          setAiCustomTemplates={updateAiCustomTemplatesAndSync}
          unifiedEntries={unifiedEntries}
          setUnifiedEntries={updateUnifiedEntriesAndSync}
          unifiedEntriesData={unifiedEntriesData}
          initialSubTab={subTab}
          settingsAction={settingsAction}
          settingsActionId={settingsActionId}
          licenseState={licenseState}
          onLicenseStateChange={setLicenseState}
        />
      );
    }

    const rawBaseTab = activeTab.split(/[/?]/)[0];
    const baseTab = rawBaseTab === "social_media" && !SOCIAL_MEDIA_ENABLED ? "dashboard" : rawBaseTab;
    switch (baseTab) {
      case "leads":
        return (
          <LeadsDatagrid 
            systemName={systemName}
            leads={leads}
            setLeads={updateLeadsAndSync}
            leadStates={orderedLeadStates}
            leadSources={leadSources}
            projectManagers={projectManagers}
            leadStateColors={leadStateColors}
            leadStateParents={leadStateParents}
            projectManagerColors={projectManagerColors}
            leadCategories={leadCategories}
            leadSourceColors={leadSourceColors}
            leadCategoryColors={leadCategoryColors}
            systemLanguage={userLanguage}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            users={users}
            taskStates={taskStates}
            taskStateColors={taskStateColors}
            integrationsConfig={integrationsConfig}
            leadStageGroups={leadStageGroups}
            projectTypes={projectTypes}
            setProjects={updateProjectsAndSync}
            setActiveTab={setActiveTab}
            leadStateFollowUp={leadStateFollowUp}
            currencyCode={currencyCode}
          />
        );
      case "projects":
        return (
          <ProjectsView
            projects={projects}
            setProjects={updateProjectsAndSync}
            projectTypes={projectTypes}
            setProjectTypes={updateProjectTypesAndSync}
            leads={leads}
            users={users}
            userLanguage={userLanguage}
            canEdit={getPermission("general_config") === "edit"}
            financialRecords={financialRecords}
            setFinancialRecords={updateFinancialRecordsAndSync}
            financialCategories={financialCategories}
            setFinancialCategories={updateFinancialCategoriesAndSync}
            currencyCode={currencyCode}
          />
        );
      case "clients":
        return (
          <ClientsView 
            leads={leads}
            setLeads={updateLeadsAndSync}
            projectManagers={projectManagers}
            projectManagerColors={projectManagerColors}
            leadSources={leadSources}
            systemLanguage={userLanguage}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leadCategories={leadCategories}
            taskStates={taskStates}
            integrationsConfig={integrationsConfig}
            systemName={systemName}
            currencyCode={currencyCode}
            financialRecords={financialRecords}
            setFinancialRecords={updateFinancialRecordsAndSync}
            financialCategories={financialCategories}
            setFinancialCategories={updateFinancialCategoriesAndSync}
          />
        );
      case "financial":
        return (
          <FinancialManagementView
            financialRecords={financialRecords}
            setFinancialRecords={updateFinancialRecordsAndSync}
            financialCategories={financialCategories}
            setFinancialCategories={updateFinancialCategoriesAndSync}
            projects={projects}
            leads={leads}
            users={users}
            userLanguage={userLanguage}
            currencyCode={currencyCode}
            onOpenProject={(projId) => {
              window.location.hash = `projects?id=${projId}`;
              setActiveTab("projects");
            }}
            onOpenClient={(clientId) => {
              const cl = leads.find(l => l.id === clientId);
              if (cl) {
                window.location.hash = `clients?name=${encodeURIComponent(cl.name)}`;
                setActiveTab("clients");
              }
            }}
          />
        );
      case "invoices":
        return (
          <InvoicingView
            invoicesOffers={invoicesOffers}
            setInvoicesOffers={updateInvoicesOffersAndSync}
            leads={leads}
            setLeads={updateLeadsAndSync}
            warehouseItems={warehouseItems}
            companyBillingSettings={companyBillingSettings}
            aiCustomTemplates={aiCustomTemplates}
            invoicingIntegrations={invoicingIntegrations}
            currentUser={activeUser}
            systemLanguage={userLanguage}
            systemCurrency={currencyCode}
            onOpenSettings={() => {
              window.location.hash = "settings/invoicing";
              setActiveTab("settings/invoicing");
            }}
          />
        );
      case "files":
        return (
          <FilesView leads={leads} setLeads={updateLeadsAndSync} systemLanguage={userLanguage} currencyCode={currencyCode} />
        );
      case "personal-settings":
        return (
          <PersonalSettingsView
            currentUser={activeUser}
            users={users}
            setUsers={updateUsersAndSync}
            systemLanguage={systemLanguage}
            userLanguage={userLanguage}
            setUserLanguage={changeUserLanguage}
            userTheme={userTheme}
            setUserTheme={changeThemePalette}
            themeMode={themeMode}
            setThemeMode={changeThemeMode}
            appearance={appearance}
            onSync={() => {}}
            errorSidebarEnabled={errorSidebarEnabled}
            setErrorSidebarEnabled={(enabled: boolean) => setUserPref("errorSidebarEnabled", enabled)}
          />
        );
      case "email":
        return (
          <EmailView
            currentUser={activeUser}
            leads={leads}
            setLeads={updateLeadsAndSync}
            systemLanguage={userLanguage}
            projectManagerColors={projectManagerColors}
            integrationsConfig={integrationsConfig}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            users={users}
            taskStates={taskStates}
          />
        );

      case "overview":
        return (
          <Dashboard 
            systemName={systemName}
            leads={leads}
            leadSourceColors={leadSourceColors}
            leadCategoryColors={leadCategoryColors}
            leadStageGroups={leadStageGroups}
            leadStates={orderedLeadStates}
            leadStateColors={leadStateColors}
            systemLanguage={userLanguage}
            leadStateParents={leadStateParents}
            campaigns={integrationsConfig.campaigns}
            currencyCode={currencyCode}
          />
        );
      case "rag_ai":
        return (
          <RagAiView systemLanguage={userLanguage} currentUser={activeUser} leads={leads} />
        );
      case "meetings":
        return (
          <MeetingRoomView 
            leads={leads}
            users={users}
            currentUser={activeUser}
            systemLanguage={userLanguage}
            meetingNotes={meetingNotes}
            setMeetingNotes={updateMeetingNotesAndSync}
            initialView={meetingsAction}
            onClearInitialView={() => setMeetingsAction("list")}
            integrationsConfig={integrationsConfig}
            tasks={tasks}
            setTasks={updateTasksAndSync}
            taskStates={taskStates}
          />
        );
      case "automation":
        return (
          <AutomationView
            systemLanguage={userLanguage}
            users={users}
            leads={leads}
            taskStates={taskStates}
            leadStates={orderedLeadStates}
            leadSources={leadSources}
            setAppTab={setActiveTab}
          />
        );
      case "social_media":
        return (
          <SocialMediaView systemLanguage={userLanguage} integrationsConfig={integrationsConfig} isDemoMode={isDemoMode} />
        );
      case "updates":
        return (
          <UpdateNotesView systemLanguage={userLanguage} />
        );
      case "warehouse":
        return (
          <WarehouseView
            systemLanguage={userLanguage}
            systemCurrency={currencyCode}
            currentUser={activeUser}
            warehouses={warehouses}
            setWarehouses={updateWarehousesAndSync}
            suppliers={suppliers}
            setSuppliers={updateSuppliersAndSync}
            warehouseItems={warehouseItems}
            setWarehouseItems={updateWarehouseItemsAndSync}
            warehouseStock={warehouseStock}
            setWarehouseStock={updateWarehouseStockAndSync}
            warehouseBatches={warehouseBatches}
            setWarehouseBatches={updateWarehouseBatchesAndSync}
            warehouseMovements={warehouseMovements}
            setWarehouseMovements={updateWarehouseMovementsAndSync}
            leads={leads}
            users={users}
            onAddTimelineEvent={(leadId, event) => {
              setLeads(prev => prev.map(l => {
                if (l.id === leadId) {
                  return {
                    ...l,
                    timeline: [event, ...(l.timeline || [])]
                  };
                }
                return l;
              }));
              pushStateToServer();
            }}
          />
        );
      default:
        return (
          <TaskDashboardView 
            tasks={tasks}
            setTasks={updateTasksAndSync}
            leads={leads}
            users={users}
            systemLanguage={userLanguage}
            currentUser={activeUser}
            taskStates={taskStates}
            taskStateColors={taskStateColors}
            taskAccess={taskAccess}
            autoOpenAddTask={autoOpenAddTask}
            setAutoOpenAddTask={setAutoOpenAddTask}
          />
        );
    }
  };

  // Redirect to InstallerWizard if not configured
  if (!isInstalled) {
    return (
      <InstallerWizard 
        onInstallSuccess={() => {
          setIsInstalled(true);
          window.location.reload();
        }}
        systemLanguage={userLanguage}
      />
    );
  }

  // While loading initial sync data from the database, show a premium glassmorphic loader
  if (isInstalled && !isInitialSyncResolved) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50/50 p-6 relative overflow-hidden select-none font-sans">
        <style dangerouslySetInnerHTML={{__html: `
          .loader {
            width: 65px;
            aspect-ratio: 1;
            position: relative;
          }
          .loader:before,
          .loader:after {
            content: "";
            position: absolute;
            border-radius: 50px;
            box-shadow: 0 0 0 3px inset rgba(255,255,255,0.95);
            filter: drop-shadow(0 1px 4px rgba(30,27,75,0.45));
            animation: l4 2.5s infinite;
          }
          .loader:after {
            animation-delay: -1.25s;
          }
          @keyframes l4 {
            0% { inset: 0 35px 35px 0; }
            12.5% { inset: 0 35px 0 0; }
            25% { inset: 35px 35px 0 0; }
            37.5% { inset: 35px 0 0 0; }
            50% { inset: 35px 0 0 35px; }
            62.5% { inset: 0 0 0 35px; }
            75% { inset: 0 0 35px 35px; }
            87.5% { inset: 0 0 35px 0; }
            100% { inset: 0 35px 35px 0; }
          }
        `}} />

        {/* Animated 3D Shader Background */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <ShaderGradientCanvas
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          >
            <ShaderGradientAny
              animate="on"
              axesHelper="off"
              brightness={1.5}
              cAzimuthAngle={250}
              cDistance={1.5}
              cPolarAngle={140}
              cameraZoom={12.5}
              color1="#809bd6"
              color2="#910aff"
              color3="#af38ff"
              destination="onCanvas"
              embedMode="off"
              envPreset="city"
              format="gif"
              fov={45}
              frameRate={10}
              gizmoHelper="hide"
              grain="on"
              lightType="3d"
              pixelDensity={1}
              positionX={0}
              positionY={0}
              positionZ={0}
              range="disabled"
              rangeEnd={40}
              rangeStart={0}
              reflection={0.5}
              rotationX={0}
              rotationY={0}
              rotationZ={140}
              shader="defaults"
              type="sphere"
              uAmplitude={7}
              uDensity={0.8}
              uFrequency={5.5}
              uSpeed={0.3}
              uStrength={0.4}
              wireframe={false}
            />
          </ShaderGradientCanvas>
        </div>

        <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
          {/* Custom Loader Animation */}
          <div className="mb-8 flex items-center justify-center h-16 w-16">
            <div className="loader"></div>
          </div>
          
          <h2 className="text-xl font-heading font-black tracking-widest text-white uppercase [text-shadow:0_2px_8px_rgba(30,27,75,0.55)]">
            CCRM
          </h2>
          <p className="text-[10px] font-black text-white/90 uppercase tracking-widest mt-3.5 animate-pulse [text-shadow:0_1px_5px_rgba(30,27,75,0.6)]">
            {t("Syncing database connection...", "Pripájam sa k databáze...", "Kapcsolódás az adatbázishoz...")}
          </p>
        </div>
      </div>
    );
  }

  const displayUser = currentUser || users[0] || {
    id: "guest",
    name: t("Guest User", "Hosť", "Vendég"),
    email: "guest@example.com",
    role: "Viewer",
    color: "#6366f1",
    avatar: null,
    activityLog: [],
    metadata_json: "{}"
  };

  const showMailIcon = (() => {
    try {
      if (displayUser && displayUser.metadata_json) {
        const metadata = typeof displayUser.metadata_json === 'string' 
          ? JSON.parse(displayUser.metadata_json) 
          : displayUser.metadata_json;
        return metadata?.emailSettings?.isValidated === true;
      }
    } catch (e) {}
    return false;
  })();

  if (!currentUser) {
    return (
      <LoginView 
        users={users}
        systemName={systemName}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          // If a mutation was lost to an expired session, replay the latest
          // state now that we are authenticated again so the change is not lost.
          if (pendingPushRef.current) {
            pendingPushRef.current = false;
            setTimeout(() => {
              pushStateToServer(
                // 21 positional "next…" slots precede the options object. Keep this
                // padding in step with the pushStateToServer signature: when the
                // invoices/AI-template slots were added the options object silently
                // slid into `nextInvoicesOffers`, corrupting the replayed payload.
                undefined, undefined, undefined, undefined, undefined, undefined,
                undefined, undefined, undefined, undefined, undefined,
                undefined, undefined, undefined, undefined, undefined, undefined,
                undefined, undefined, undefined, undefined,
                { showIndicator: false }
              );
            }, 0);
          }
          // Route the user to their chosen default landing page right after login
          const dp = getDefaultPageForUser(user) || "dashboard";
          setActiveTab(dp);
          window.location.hash = dp;
        }}
        systemLanguage={userLanguage}
        isDemoMode={isDemoMode}
        isModal={false}
      />
    );
  }

  return (
    <UserPrefsContext.Provider value={userPrefsApi}>
    <div className="flex h-screen overflow-hidden relative font-sans antialiased text-slate-800 bg-slate-50/50">

      {/* Blurred application background layout if not logged in */}
      <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${!currentUser ? "filter blur-md pointer-events-none select-none" : ""}`}>
        {/* Sidebar navigation with role-gated settings visibility */}
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => { 
            if (tab === "settings" && !hasSettingsAccess) return;
            window.location.hash = tab; 
          }} 
          systemName={systemName}
          showSettings={hasSettingsAccess}
          onLogout={() => {
            fetch("/api/logout.php", { method: "POST" })
              .finally(() => {
                setCurrentUser(null);
                window.location.href = "/";
              });
          }}
          systemLanguage={userLanguage}
          showMailIcon={showMailIcon}
          integrationsConfig={integrationsConfig}
          showRagAi={getPermission("rag_view") !== "nothing"}
          currentUser={currentUser}
          roles={roles}
          canEditNav={getPermission("nav_edit") === "edit" || currentUser?.role?.toLowerCase() === "project manager"}
          onSaveUserLayout={handleSaveUserLayout}
          unifiedEntries={unifiedEntries}
          customDashboards={customDashboards}
          onSaveCustomDashboards={updateCustomDashboardsAndSync}
          defaultPage={getDefaultPageForUser(currentUser) || "dashboard"}
          onSaveDefaultPage={handleSaveDefaultPage}
        />
        
        {/* Workspace Area - Add pb-20 on mobile viewports so that the bottom navigation bar never overlaps content */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          <Header
            activeTab={activeTab}
            systemName={systemName}
            currentUser={displayUser}
            onLogout={() => {
              fetch("/api/logout.php", { method: "POST" })
                .finally(() => {
                  setCurrentUser(null);
                  window.location.href = "/";
                });
            }}
            systemLanguage={userLanguage}
            setSystemLanguage={changeUserLanguage}
            isDemoMode={isDemoMode}
            onOpenPersonalSettings={() => {
              setActiveTab("personal-settings");
              window.location.hash = "personal-settings";
            }}
            onNavigateMeetings={(action) => {
              setMeetingsAction(action);
              setActiveTab("meetings");
              window.location.hash = "meetings";
            }}
            onAddTask={() => {
              setActiveTab("tasks");
              window.location.hash = "tasks";
              setAutoOpenAddTask(true);
            }}
            onNavigateUpdates={() => {
              setActiveTab("updates");
              window.location.hash = "updates";
            }}
          />
          
          <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-[1600px] mx-auto w-full relative flex flex-col justify-between">
            <div className="shrink-0 w-full">
              {/* Advance warning that the licence is lapsing. Above the workspace
                  rather than over it: nothing here justifies interrupting work,
                  and it stays out of the per-view ErrorBoundary so a crash in one
                  module cannot take the notice down with it. */}
              <LicenseBanner
                state={licenseState}
                language={userLanguage}
                isAdmin={(currentUser?.role || "").toLowerCase() === "admin"}
                onOpenLicenseSettings={() => {
                  window.location.hash = "settings/license";
                }}
              />
              {/* Per-view boundary: a render error in one module (a single CRM tab)
                  used to escape to the root boundary and take the whole app down,
                  leaving a reload as the only way back. Contained here, the sidebar,
                  header and every other tab keep working, and switching tabs clears
                  the error via resetKey. */}
              <ErrorBoundary contained resetKey={activeTab}>
                <Suspense fallback={<div className="w-full flex items-center justify-center py-24"><RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" /></div>}>
                  {renderWorkspaceView()}
                </Suspense>
              </ErrorBoundary>
            </div>
            <footer className="mt-12 pt-4 border-t border-slate-200/50 flex justify-between items-center text-[10px] text-slate-400 select-none font-semibold uppercase tracking-wider">
              <span>{systemName} CRM &bull; Active Node</span>
              <span>v{VERSION}</span>
            </footer>
          </main>
        </div>
      </div>
      


      {/* Bottom-right notification stack. The save indicator and the toast share one
          column so they can never land on top of each other — they used to be two
          independently positioned "fixed" banners 4px apart, which read as a single
          garbled banner whenever both were up. */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2 pointer-events-none">
        {/* Global save indicator — reassures the user their change is being saved
            and, together with the beforeunload guard, that they should not leave or
            reload the page until it disappears. */}
        {isSyncIndicatorVisible && (
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom duration-200 select-none">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
            <span className="text-[11px] font-black uppercase tracking-wider">
              {userLanguage === "sk" ? "Ukladá sa…" : userLanguage === "hu" ? "Mentés…" : "Saving…"}
            </span>
          </div>
        )}
        {toast && (
          <div className="pointer-events-auto animate-in slide-in-from-bottom duration-300">
            <div className={`bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs font-black uppercase tracking-wider border ${
              toast.variant === "error" ? "border-rose-500/70" : toast.variant === "warning" ? "border-amber-500/70" : "border-slate-800"
            }`}>
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick();
                    setToast(null);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-[10px]"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-white font-black ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Global File Preview Modal overlay */}
      {previewFile && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-300">
          <div 
            className="fixed inset-0" 
            onClick={() => setPreviewFile(null)} 
          />
          <div className="w-full max-w-5xl h-[85vh] bg-white rounded-t-[32px] rounded-b-[32px] border border-slate-200/80 shadow-2xl p-6 flex flex-col justify-between text-left relative z-10 animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 shrink-0">
              <div className="min-w-0 pr-4">
                <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">{t("File Preview", "Náhľad súboru", "Fájl előnézet")}</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight truncate">{previewFile.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* The browser's own viewer reports why a document failed to open,
                    which the embedded frame cannot, so keep an escape hatch to it. */}
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                >
                  {t("Open in a new tab", "Otvoriť na novej karte", "Megnyitás új lapon")}
                </a>
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 border border-amber-800 text-white text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                >
                  {t("Download", "Stiahnuť", "Letöltés")}
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content preview pane */}
            <div className="flex-1 mt-4 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 flex items-center justify-center">
              <FilePreviewPane
                key={previewFile.url}
                url={previewFile.url}
                name={previewFile.name}
                t={t}
              />
            </div>
          </div>
        </div>
      )}

      {/* Right Error Sidebar */}
      {errorSidebarEnabled && (
        <div className="w-[300px] bg-white border-l border-slate-200 flex flex-col h-full shrink-0 animate-in slide-in-from-right duration-300 text-left">
          <div className="p-4.5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-1.5 text-red-650">
              <AlertOctagon className="h-4.5 w-4.5 text-red-550 animate-pulse" />
              <span className="font-heading font-extrabold text-slate-900 uppercase tracking-wider text-[10.5px]">
                {t("Background Errors", "Chyby na pozadí", "Háttérhibák")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={fetchErrorLogs}
                className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-850 rounded-xl transition-all cursor-pointer"
                title={t("Refresh", "Obnoviť", "Frissítés")}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={clearErrorLogs}
                className="p-1.5 hover:bg-red-50 text-red-650 hover:text-red-800 rounded-xl transition-all cursor-pointer"
                title={t("Clear All", "Vymazať všetko", "Összes törlése")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/40 scrollbar-thin">
            {isLoadingLogs ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : errorLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-bold text-[10.5px]">
                {t("No background errors", "Žiadne chyby na pozadí", "Nincsenek háttérhibák")}
              </div>
            ) : (
              errorLogs.map((log: any) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="p-3 bg-white hover:bg-red-50/10 rounded-2xl border border-slate-200 hover:border-red-200/60 transition-all cursor-pointer shadow-sm flex flex-col gap-1.5 text-[10.5px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8.5px] text-slate-400">{log.created_at}</span>
                    <span className={`px-1.5 py-0.5 rounded-md font-black text-[7.5px] uppercase ${
                      log.request_method === 'POST' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {log.request_method}
                    </span>
                  </div>
                  <div className="font-mono text-[8.5px] text-slate-500 truncate">
                    {log.request_uri}
                  </div>
                  <div className="font-bold text-red-650 line-clamp-2 leading-relaxed">
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Exception Detail Popup Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-250 overflow-hidden flex flex-col max-h-[85vh] text-left">
            <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-red-650">
                <AlertOctagon className="h-5 w-5 shrink-0" />
                <h3 className="font-heading font-extrabold text-slate-900 uppercase tracking-wider text-xs">
                  {t("Exception / Error Details", "Detail výnimky / chyby", "Kivétel / hiba részletei")}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyLogDetails(selectedLog)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 font-bold"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t("Copy", "Kopírovať", "Másolás")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="text-slate-450 hover:text-slate-800 p-1.5 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 font-medium text-slate-750 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Date & Time", "Dátum a čas", "Dátum és idő")}</span>
                  <span className="font-mono text-[10.5px] text-slate-700 font-bold">{selectedLog.created_at}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Method & URI", "Metóda a URI", "Metódus és URI")}</span>
                  <span className="font-mono text-[10.5px] text-slate-750 font-bold">{selectedLog.request_method} {selectedLog.request_uri}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("File & Line", "Súbor a riadok", "Fájl és sor")}</span>
                  <span className="font-mono text-[10.5px] text-slate-700 font-bold">{selectedLog.file ? `${selectedLog.file.split('/').pop()}:${selectedLog.line}` : 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Error Message", "Chybová správa", "Hibaüzenet")}</span>
                <div className="p-3 bg-red-50 text-red-800 rounded-xl font-mono text-[11px] font-bold border border-red-100 whitespace-pre-wrap leading-relaxed">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.file && (
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Full File Path", "Úplná cesta k súboru", "Teljes fájlútvonal")}</span>
                  <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl font-mono text-[10.5px] border border-slate-150">
                    {selectedLog.file} (Line {selectedLog.line})
                  </div>
                </div>
              )}

              {selectedLog.trace && (
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Stack Trace", "Výpis zásobníka", "Hívási verem")}</span>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[10px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 max-h-64">
                    {selectedLog.trace}
                  </pre>
                </div>
              )}

              {selectedLog.payload && (
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">{t("Request Payload", "Telo požiadavky", "Kérés tartalma")}</span>
                  <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[10px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 max-h-48">
                    {selectedLog.payload}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </UserPrefsContext.Provider>
  );
}

export default App;
