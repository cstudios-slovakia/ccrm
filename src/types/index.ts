export interface ClientAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

// Business-document event types. They behave like `offer` (a note plus one or
// more attached documents) but name the actual paperwork being filed against
// the lead.
export const DOCUMENT_EVENT_TYPES = [
  "order",            // OBJEDNÁVKA
  "proforma_invoice", // ZÁLOHOVÁ FAKTÚRA
  "advance_receipt",  // DOKLAD O PRIJATOM PREDDAVKU
  "invoice",          // FAKTÚRA
  "delivery_note",    // DODACÍ LIST
] as const;

export type DocumentEventType = (typeof DOCUMENT_EVENT_TYPES)[number];

// Note: `TimelineEventType` is already taken by the project-type configuration
// entity further down, so the lead timeline's own discriminator is named
// LeadEventType.
export type LeadEventType =
  | "phone"
  | "email"
  | "note"
  | "offer"
  | "appointment"
  // Written automatically whenever the lead moves to another pipeline state.
  // The old → new pair lives in `content` as plain text (there is no column for
  // it), so it survives the sync round-trip like any other logged event and its
  // date/time stay editable afterwards.
  | "status_change"
  | DocumentEventType;

// One file attached to a timeline event. Events can carry several (e.g. a batch
// of advance invoices logged in one go).
export interface TimelineAttachment {
  name: string;
  size?: string; // human readable, e.g. "1.5 MB"
  path?: string; // server-returned path, e.g. "/uploads/ev-123_doc.pdf"
}

export interface TimelineEvent {
  id: string;
  type: LeadEventType;
  timestamp: string; // YYYY-MM-DD HH:MM
  title: string;
  content: string;
  amount?: number; // for offers
  extraTime?: string; // for appointments
  fileName?: string; // name of attached file — first attachment (legacy single-file field)
  fileSize?: string; // size of attached file e.g. "1.5 MB"
  fileType?: "offer" | "contract" | "invoice";
  filePath?: string; // server-returned path to the attached file, e.g. "/uploads/ev-123_doc.pdf"
  // Every attached document. The fileName/fileSize/filePath trio above mirrors
  // the first entry so events written before this existed still render.
  attachments?: TimelineAttachment[];
  isOutgoing?: boolean;
  audioFile?: string; // path to audio recording file
  transcription?: string; // RAG or speech-to-text transcript
  // Who produced this entry — the user who logged the note, sent the mail or
  // moved the lead to another state. Optional on purpose: entries nobody in the
  // CRM triggered (incoming mail, imported paperwork) and every event written
  // before this field existed simply have no author and render without a name.
  author?: string;
}

/**
 * Who a new lead is handed to when it arrives without an owner — leads captured
 * by the public webhook, created by a workflow, imported, or added in the app
 * without picking a project manager.
 *
 * The assignment itself is made server-side (sync.php / api/pipeline.php) so a
 * single rotation cursor is shared by every device and every entry point; the
 * client only edits these rules and shows the result.
 */
export type LeadAssignmentMode =
  | "off"        // nobody is auto-assigned — new leads stay unassigned
  | "selected"   // hand out to the chosen users, in the order they are listed
  | "all";       // hand out to every registered user

export interface LeadAssignmentSettings {
  mode: LeadAssignmentMode;
  /** Ordered pool for mode "selected"; ignored otherwise. Names, matching `Lead.owner`. */
  users: string[];
  /** true = round-robin through the pool; false = always the first user in it. */
  rotate: boolean;
}

export interface Lead {
  id: string;
  name: string;             // Client name
  city: string;             // City
  clientType: "person" | "business" | "partner"; // Client type
  status: string;           // Lead state
  source: string;           // Lead source
  owner: string;            // Project manager
  value: number;            // Lead value
  createdAt: string;
  rating?: number;          // Star rating (1-5)
  
  // Extended Client Details
  phone?: string;
  email?: string;
  address?: ClientAddress;
  
  // Corporate registries (when clientType is business or partner)
  companyId?: string;
  taxId?: string;
  vatId?: string;
  contactPerson?: string;
  website?: string;
  establishmentDate?: string;
  legalForm?: string;
  skNace?: string;
  organizationSize?: string;
  ownershipType?: string;
  dataSource?: string;
  dissolutionDate?: string;
  region?: string;
  district?: string;
  
  // Interactive Timeline Logs
  timeline?: TimelineEvent[];
  
  // VAT Validation Results Cache
  vatValidationResult?: {
    valid: boolean;
    name?: string;
    address?: string;
    checkedAt?: string;
    error?: string;
  } | null;
  
  // Lead Interested Categories
  categories?: string[];

  // Free-text description of what the client is interested in / the problem to
  // be solved. Captured on the "add new lead" form and editable afterwards.
  interestNote?: string;

  // Lead Referral (links to another Lead/Client ID)
  referralLeadId?: string;

  // Follow-up tracking — a map of completed follow-ups keyed by the lowercased
  // lead-state name, value = YYYY-MM-DD it was ticked. One checkbox is shown per
  // state flagged for follow-up in Settings (leadStateFollowUp).
  followUps?: Record<string, string>;

  // AI Summary & Verification Fingerprint
  aiSummary?: string;
  aiSummaryFingerprint?: string;
  financialSummary?: string;
}

export interface Appointment {
  id: string;
  clientName: string;
  email: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  status: "pending" | "confirmed" | "cancelled";
  notes: string;
  synced: boolean;
}

export interface GeneratedDocument {
  id: string;
  title: string;
  type: "proposal" | "quote" | "contract";
  clientName: string;
  value: number;
  content: string;
  createdAt: string;
  status: "draft" | "sent" | "signed" | "expired";
}

export interface MarketingChannel {
  name: string;
  spend: number;
  revenue: number;
  leadsCount: number;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  content: string;
  segment: "all" | "leads" | "won_clients" | "employees";
  status: "draft" | "sent";
  sentAt?: string;
  stats: {
    opens: number;
    clicks: number;
    bounce: number;
    conversions: number;
  };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  startDate?: string; // YYYY-MM-DD
  deadline: string; // YYYY-MM-DD
  deadlineTime?: string; // HH:MM (overdue time)
  owner: string;    // Primary assignee (empty when unassigned; kept for DB compatibility)
  createdBy?: string; // Immutable creator name; absent on legacy tasks
  assignedUsers: string[]; // names of assigned team members
  relatedLeadId?: string; // linked lead or client id (optional)
  isLocking?: boolean; // if true, it blocks related lead from transitioning stages until done
  completedBy?: string; // name of user who completed the task
  completedAt?: string; // timestamp (YYYY-MM-DD HH:MM) when completed
  isAiGenerated?: boolean; // if true, task was generated by AI
  archived?: boolean; // if true, hidden from active calendar/global views regardless of status
}

export interface TimeLog {
  id: string;
  employeeName: string;
  projectName: string;
  clientName: string;
  hours: number;
  date: string; // YYYY-MM-DD
  description: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
  performanceScore: number; // 0-100
  leaves: {
    id: string;
    startDate: string;
    endDate: string;
    type: "vacation" | "sick" | "personal";
    status: "pending" | "approved" | "rejected";
  }[];
}

export interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  options?: string[]; // for select dropdowns
}

export interface CustomForm {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  createdAt: string;
  submissionsCount: number;
}

export interface FormSubmission {
  id: string;
  formId: string;
  submittedAt: string;
  data: Record<string, string>;
}

export interface UserActivityLog {
  id: string;
  action: string;
  timestamp: string;
  details?: string;
  type: "login" | "create" | "update" | "delete" | "system";
}

export interface UserProfile {
  // Server-assigned row id (a hash of the e-mail). Absent on records created in
  // the browser until they have been synced back; the delta sync relies on it to
  // tell an edited row from an untouched one.
  id?: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  color: string;
  activityLog?: UserActivityLog[];
  metadata_json?: any;
}

export interface RolePermission {
  name: string;
  permissions: {
    general_config: "edit" | "view" | "nothing";
    pm_managers: "edit" | "view" | "nothing";
    pipeline_stages: "edit" | "view" | "nothing";
    traffic_sources: "edit" | "view" | "nothing";
    system_reset: "edit" | "view" | "nothing";
    [key: string]: "edit" | "view" | "nothing"; // Allow granular & custom permission slugs dynamically
  };
  defaultNavLayout?: string[]; // Array of active module item IDs in order
}

export interface UnifiedEntryRegistry {
  id: string;
  name: string;
  entryName?: string;
  folderName?: string;
  icon: string;
  color: string;
  modules: string[]; // e.g. ["title", "due_date", "file"]
  folderModules: string[]; // e.g. ["title", "due_date", "file"]
  foldersEnabled: boolean;
  showFolderSummary?: boolean;
  warningDays?: number;
  archived: boolean;
}

export interface UnifiedEntryRow {
  id: string;
  parentId: string | null;
  isFolder: boolean;
  title?: string;
  dueDate?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  filePath?: string;
  clientId?: string; // Links entry/folder to a Client/Lead ID
  leadId?: string; // Links entry/folder to a Lead ID
  warningDays?: number;
  icon?: string;
}

export interface CustomDashboard {
  id: string;
  name: string;
  icon: string;
  color: string;
  prompts: { prompt: string; layout: any }[];
  layout: {
    widgets: any[];
  };
  activeModel: string;
  archived: boolean;
}

export type ProjectAttributeType = 
  | "textfield" 
  | "textarea" 
  | "select" 
  | "date" 
  | "time" 
  | "datetime" 
  | "number" 
  | "checkbox" 
  | "radio" 
  | "files"
  | "contact";

export interface ProjectAttribute {
  id: string;
  name: string;
  type: ProjectAttributeType;
  required: boolean;
  options?: string[];
}

export interface TimelineEventType {
  id: string;
  name: string;
  color: string;
  icon: string;
  attributes: ProjectAttribute[];
}

export interface ProjectType {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  attributes: ProjectAttribute[];
  hasTimeline: boolean;
  hasGantt: boolean;
  timelineEventTypes?: TimelineEventType[];
}

export interface ProjectTimelineEvent {
  id: string;
  type: string; // fallback or general categorizer
  eventType?: string; // custom event type ID
  timestamp: string; // YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM
  title: string;
  content?: string;
  data?: Record<string, any>; // timeline event custom attributes
}

export interface ProjectGanttRow {
  id: string;
  title: string;
  contactId: string; // client id
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  progress: number; // 0-100
}

export interface Project {
  id: string;
  projectTypeId: string;
  leadId?: string | null;
  clientId?: string | null;
  status: string; // e.g. "active" | "completed" | "on_hold" | "cancelled"
  managers: string[]; // employee ids or names
  data: Record<string, any>; // keyed by attribute.id
  timeline?: ProjectTimelineEvent[];
  gantt?: ProjectGanttRow[];
}

// Warehouse & Inventory Management Types

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  managerUserId?: string | null;
  isDefault: boolean;
  createdAt?: string;
}

export interface SupplierContact {
  name: string;
  position?: string;
  phone?: string;
  email?: string;
}

export interface Supplier {
  id: string;
  name: string;
  companyId?: string | null; // IČO
  taxId?: string | null;     // DIČ
  vatId?: string | null;     // IČ DPH
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  iban?: string | null;
  swift?: string | null;
  paymentDueDays: number;
  notes?: string | null;
  contacts: SupplierContact[];
  createdAt?: string;
}

export interface WarehouseItem {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  categories?: string[];
  unit: string; // 'ks' | 'm²' | 'bm' | 'm³' | 'kg' | 'l' | 'balenie' | string
  minStock: number;
  optimalStock: number;
  defaultLocation?: string | null;
  hasExpiration: boolean;
  imageUrl?: string | null;
  defaultSellPrice: number;
  avgPurchasePrice: number; // Weighted Average Purchase price (WAP)
  lastPurchasePrice: number;
  createdAt?: string;
}

export interface WarehouseStock {
  warehouseId: string;
  itemId: string;
  quantity: number;
  reservedQuantity: number;
  location?: string | null;
}

export interface WarehouseBatch {
  id: string;
  itemId: string;
  warehouseId: string;
  batchNumber: string;
  expirationDate: string; // YYYY-MM-DD
  initialQuantity: number;
  currentQuantity: number;
  purchasePrice: number;
  createdAt?: string;
}

export type WarehouseMovementType = 'inward' | 'outward' | 'transfer' | 'adjustment';
export type WarehouseMovementStatus = 'draft' | 'confirmed' | 'cancelled';

export interface WarehouseMovementItem {
  id: string;
  movementId?: string;
  itemId: string;
  batchId?: string | null;
  quantity: number;
  unitPurchasePrice: number;
  unitSellPrice: number;
  totalPrice: number;
  expirationDate?: string | null;
  note?: string | null;
}

export interface WarehouseMovement {
  id: string;
  documentNumber: string; // e.g. PRI-2026-0001, VYD-2026-0001
  type: WarehouseMovementType;
  status: WarehouseMovementStatus;
  warehouseId: string;
  targetWarehouseId?: string | null;
  supplierId?: string | null;
  leadId?: string | null;
  totalCostValue: number;
  totalSellValue: number;
  totalProfitValue: number;
  createdBy: string;
  note?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  issuedAt: string;
  createdAt?: string;
  items: WarehouseMovementItem[];
}

// ==========================================
// Financial Management & Invoicing Types
// ==========================================

export type FinancialType = 'income' | 'expense';
export type FinancialStatus = 'planned' | 'pending' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';
export type FinancialRecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export interface FinancialCategory {
  id: string;
  type: FinancialType;
  name: string;
  parentId?: string | null;
  level: 1 | 2 | 3;
  color?: string | null;
  icon?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinancialRecurrenceConfig {
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday (for weekly)
  monthlyType?: 'day_of_month' | 'nth_weekday'; // for monthly
  dayOfMonth?: number; // 1-31 (for monthly day_of_month)
  weekOfMonth?: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, -1 = last (for monthly nth_weekday)
  month?: number; // 1-12 (for yearly)
}

export interface FinancialRecord {
  id: string;
  type: FinancialType;
  subtype?: string; // 'regular' | 'invoice' | 'expense' | 'tax' | 'salary' | 'material' | 'overhead'
  title: string;
  description?: string | null;
  categoryId?: string | null;
  categoryPath?: string | null;
  amountPlanned: number;
  amountReal: number;
  currency?: string; // default 'EUR'
  status: FinancialStatus;
  issueDate: string; // YYYY-MM-DD
  dueDate?: string | null; // YYYY-MM-DD
  paidDate?: string | null; // YYYY-MM-DD
  paymentMethod?: string | null; // 'bank_transfer' | 'card' | 'cash' | 'credit'
  isRecurring: boolean;
  recurringFrequency?: FinancialRecurringFrequency | null;
  recurringConfig?: FinancialRecurrenceConfig | null;
  recurringStartDate?: string | null;
  recurringEndDate?: string | null;
  projectId?: string | null; // NULL for Global Company-Wide record
  clientId?: string | null;  // NULL for Global Company-Wide record
  invoiceNumber?: string | null;
  taxRate?: number; // e.g. 20 for 20%
  attachments?: TimelineAttachment[];
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectRevenueAnalysis {
  projectId: string;
  totalPlannedIncome: number;
  totalRealIncome: number;
  totalPlannedExpenses: number;
  totalRealExpenses: number;
  plannedProfit: number;
  realProfit: number;
  plannedMarginPct: number;
  realMarginPct: number;
  invoicesCount: number;
  paidInvoicesCount: number;
  expensesCount: number;
  expensesByCategory: Record<string, { planned: number; real: number; categoryName: string; color: string }>;
}

// ==========================================
// Invoices & Price Offers (Version 1.9)
// ==========================================

export type InvoiceOfferType = 'price_offer' | 'proforma' | 'invoice';
export type InvoiceOfferMode = 'default' | 'custom' | 'external';
export type InvoiceOfferStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'invoiced' | 'cancelled';
export type ExternalInvoiceProvider = 'superfaktura' | 'idoklad';

export interface InvoiceOfferItem {
  id: string;
  warehouseItemId?: string | null;
  sku?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number; // e.g. 20 for 20%
  discountPct: number; // 0-100
  totalPrice: number; // calculated line total with/without VAT depending on config
}

export interface UspCardItem {
  id?: string;
  title: string;
  subtitle: string;
  icon?: string;
}

export interface InvoiceOffer {
  id: string;
  documentNumber: string; // e.g. CP-2026-001 or FA-2026-001
  type: InvoiceOfferType;
  mode: InvoiceOfferMode;
  externalProvider?: ExternalInvoiceProvider | null;
  externalId?: string | null;
  externalPdfUrl?: string | null;
  
  // Mandatory Lead / Client Pairing
  leadId: string;
  clientId?: string | null;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientStreet?: string | null;
  clientCity?: string | null;
  clientPostalCode?: string | null;
  clientCountry?: string | null;
  clientIco?: string | null;
  clientDic?: string | null;
  clientIcdph?: string | null;
  
  // Content & Customisation
  title: string; // e.g. "Predbežná cenová ponuka"
  subject: string; // e.g. "Rekonštrukcia plochej strechy — Šahy"
  location?: string | null; // e.g. "Šahy"
  greetingNote?: string | null; // e.g. "Dobrý deň, pán Šimon Zsolt Frenko,"
  introNote?: string | null; // Trust paragraph
  
  // Value Proposition / USP Highlights
  uspCards: UspCardItem[];
  reassuranceNote?: string | null;
  
  // Items Scope
  items: InvoiceOfferItem[];
  
  // Financial totals
  subtotal: number;
  vatAmount: number;
  totalPrice: number;
  priceRangeMin?: number | null;
  priceRangeMax?: number | null;
  currency: string; // 'EUR', 'CZK', etc.
  
  // Execution Parameters (3 key cards)
  durationText?: string | null; // e.g. "2–3 dni"
  startDateText?: string | null; // e.g. "Koniec júna"
  warrantyText?: string | null; // e.g. "10 rokov"
  
  // Closing & Action
  nextStepsNote?: string | null;
  closingNote?: string | null;
  signOffTeam?: string | null; // e.g. "Tím SIGNUM Slovakia s.r.o."
  
  // Custom AI Template metadata
  customTemplateId?: string | null;
  customTemplateStyle?: Record<string, any> | null;
  
  // Status & File
  status: InvoiceOfferStatus;
  issuedAt: string; // YYYY-MM-DD
  validUntil?: string | null; // YYYY-MM-DD
  dueDate?: string | null; // YYYY-MM-DD
  fileName?: string | null;
  filePath?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
}

export interface CompanyBillingSettings {
  companyName: string;
  companySubtitle?: string;
  companyLogoUrl?: string | null;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  companyId: string; // IČO
  taxId: string;     // DIČ
  vatId: string;     // IČ DPH
  email: string;
  phone: string;
  phoneSecondary?: string;
  website: string;
  iban: string;
  swift: string;
  bankName: string;
  
  // Default terms. Seeded into every new document by InvoicingView, so the names
  // here must match the Settings → Invoicing form that writes them.
  defaultPaymentDueDays: number;
  defaultVatRate: number;
  defaultWarrantyText: string;
  defaultDurationText: string;
  defaultStartDateText?: string;
  defaultNextSteps: string;
  defaultSocialProof: string; // reference clients printed in the document footer
  defaultUspCards: UspCardItem[];
}

export interface ExternalInvoicingConfig {
  superfaktura: {
    enabled: boolean;
    email: string;
    apiKey: string;
    companyId: string;
    sandbox: boolean;
  };
  idoklad: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    sandbox: boolean;
  };
}

export interface AiCustomTemplate {
  id: string;
  name: string;
  description?: string;
  sourcePdfUrl?: string;
  sourcePdfName?: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    accent: string;
    text: string;
  };
  typography: {
    fontFamily: string;
    headingStyle: string;
  };
  sectionsOrder: string[];
  customBannerText?: string;
  badgeStyle?: 'rounded' | 'square' | 'pill';
  createdAt: string;
}
