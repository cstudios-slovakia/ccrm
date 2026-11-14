export type AgencyLanguage = "en" | "sk" | "hu";

export type LocalizedLabel =
  | string
  | {
      en?: string;
      sk?: string;
      hu?: string;
    };

export function resolveLocalizedLabel(label: LocalizedLabel | undefined, lang: AgencyLanguage): string {
  if (!label) return "";
  if (typeof label === "string") return label;
  return label[lang] || label.en || label.sk || label.hu || "";
}

export type AgencyStageGroup = "new" | "in_progress" | "ready" | "placed" | "closed";

export interface AgencyStage {
  id: string;
  label: LocalizedLabel;
  color: string;
  group: AgencyStageGroup;
}

export interface AgencyChecklistTemplateItem {
  key: string;
  label: LocalizedLabel;
  hasExpiry?: boolean;
  required?: boolean;
}

export interface AgencyShiftTemplate {
  id: string;
  code: string;
  name: LocalizedLabel;
  startTime: string;
  endTime: string;
  defaultHours: number;
  payMultiplier: number;
  billMultiplier: number;
  color: string;
}

export type AgencySchemaFieldType = "text" | "date" | "select" | "textarea" | "number" | "checkbox";

export interface AgencyProfileSchemaField {
  key: string;
  label: LocalizedLabel;
  type: AgencySchemaFieldType;
  required?: boolean;
  system?: boolean;
  options?: string[];
}

export interface AgencyProfileSchemaSection {
  id: string;
  label: LocalizedLabel;
  enabled: boolean;
  sensitive: boolean;
  fields: AgencyProfileSchemaField[];
  customFields: AgencyProfileSchemaField[];
}

export interface AgencySettings {
  stages: AgencyStage[];
  checklistItems: AgencyChecklistTemplateItem[];
  shiftTemplates: AgencyShiftTemplate[];
  holidayCountry: "SK" | "HU";
  overtimeMultiplier: number;
  holidayMultiplier: number;
  defaultCurrency: string;
  autoCreateExpense: boolean;
  defaultExpenseCategoryId: string;
  profileSchema: AgencyProfileSchemaSection[];
}

export type AgencyWorkerStatus = "candidate" | "rented" | "inactive" | "archived";

export type AgencyProfileData = Record<string, Record<string, unknown>>;

export interface AgencyWorker {
  id: string;
  workerCode: string;
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  stageId: string;
  workerStatus: AgencyWorkerStatus;
  nationality: string;
  dateOfBirth: string;
  targetCompanyClientId?: string;
  profile: AgencyProfileData;
  skills: string[];
  notes: string;
  defaultPayRate: number | null;
  defaultBillRate: number | null;
  currency: string;
  assignedRecruiter: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgencyWorkplace {
  id: string;
  companyClientId: string;
  name: string;
  address: string;
  contactLeadId: string | null;
  defaultShiftCode: string;
  notes: string;
  active: boolean;
}

export type AgencyPlacementStatus = "active" | "paused" | "ended";
export type AgencyRateType = "hourly" | "daily" | "monthly";

export interface AgencyPlacement {
  id: string;
  workerId: string;
  companyClientId: string;
  workplaceId: string | null;
  contactLeadId: string | null;
  jobRole: string;
  status: AgencyPlacementStatus;
  startDate: string;
  endDate: string | null;
  payRate: number | null;
  payRateType: AgencyRateType;
  billRate: number | null;
  billRateType: AgencyRateType;
  currency: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AgencyChecklistStatus = "missing" | "submitted" | "verified" | "expired";

export interface AgencyWorkerChecklistItem {
  id: string;
  workerId: string;
  itemKey: string;
  label: string;
  status: AgencyChecklistStatus;
  expiresAt: string | null;
  note: string;
  fileId: string | null;
  sortOrder: number;
}

export type AgencyFileCategory = "cv" | "passport" | "permit" | "id_doc" | "medical" | "contract" | "other";

export interface AgencyWorkerFile {
  id: string;
  workerId: string;
  category: AgencyFileCategory;
  checklistItemId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export type AgencyTimelineEventType =
  | "stage_change"
  | "contact"
  | "placement"
  | "sick_leave"
  | "compliance"
  | "note"
  | "work_log";

export interface AgencyTimelineEvent {
  id: string;
  workerId: string;
  eventType: AgencyTimelineEventType;
  title: string;
  description: string;
  meta: Record<string, unknown>;
  occurredAt: string;
  createdBy: string;
}

export type AgencyShiftStatus = "scheduled" | "worked" | "sick" | "absent" | "holiday";

export interface AgencyShift {
  id: string;
  workerId: string;
  placementId: string | null;
  companyClientId: string;
  workplaceId: string | null;
  workDate: string;
  shiftTemplateId: string | null;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  hours: number;
  overtimeHours: number;
  status: AgencyShiftStatus;
  sickNote: string;
  notes: string;
}

export interface AgencyPaymentLineItem {
  id: string;
  kind: "earning" | "deduction";
  label: string;
  amount: number;
}

export type AgencyPaymentStatus = "draft" | "approved" | "paid";

export interface AgencyPayment {
  id: string;
  workerId: string;
  placementId: string | null;
  companyClientId: string | null;
  periodYm: string;
  regularHours: number;
  overtimeHours: number;
  sickDays: number;
  basePay: number;
  items: AgencyPaymentLineItem[];
  grossPay: number;
  deductionsTotal: number;
  netPay: number;
  paidAmount: number;
  billableTotal: number;
  currency: string;
  status: AgencyPaymentStatus;
  paidAt: string | null;
  financialRecordId: string | null;
  notes: string;
  updatedAt?: string;
}

export interface AgencyCalculatedPayment {
  workerId: string;
  placementId: string | null;
  companyClientId: string | null;
  periodYm: string;
  regularHours: number;
  overtimeHours: number;
  sickDays: number;
  basePay: number;
  items: AgencyPaymentLineItem[];
  grossPay: number;
  deductionsTotal: number;
  netPay: number;
  paidAmount: number;
  billableTotal: number;
  currency: string;
  status: AgencyPaymentStatus;
  paidAt: string | null;
  financialRecordId: string | null;
  notes: string;
}

export interface AgencyBootstrapPayload {
  settings: AgencySettings;
  workers: AgencyWorker[];
  workplaces: AgencyWorkplace[];
  placements: AgencyPlacement[];
  checklists: AgencyWorkerChecklistItem[];
  shifts: AgencyShift[];
  payments: AgencyPayment[];
}

export interface AgencyWorkerDetailPayload {
  worker: AgencyWorker;
  placements: AgencyPlacement[];
  checklist: AgencyWorkerChecklistItem[];
  files: AgencyWorkerFile[];
  timeline: AgencyTimelineEvent[];
  shifts: AgencyShift[];
  payments: AgencyPayment[];
}

export const DEFAULT_AGENCY_PROFILE_SCHEMA: AgencyProfileSchemaSection[] = [
  {
    id: "applicant",
    label: { en: "Applicant Identity", sk: "Identita uchádzača", hu: "Jelölt adatai" },
    enabled: true,
    sensitive: false,
    fields: [
      { key: "surname", label: { en: "Surname", sk: "Priezvisko", hu: "Vezetéknév" }, type: "text", required: true, system: true },
      { key: "givenNames", label: { en: "Given Names", sk: "Meno", hu: "Keresztnév" }, type: "text", required: true, system: true },
      { key: "maidenName", label: { en: "Maiden / Previous Surname", sk: "Rodné priezvisko", hu: "Születési név" }, type: "text", required: false, system: true },
      { key: "dateOfBirth", label: { en: "Date of Birth", sk: "Dátum narodenia", hu: "Születési dátum" }, type: "date", required: false, system: true },
      { key: "sex", label: { en: "Sex", sk: "Pohlavie", hu: "Nem" }, type: "select", required: false, system: true, options: ["F", "M", "Other"] },
      { key: "nationality", label: { en: "Nationality", sk: "Štátna príslušnosť", hu: "Állampolgárság" }, type: "text", required: true, system: true },
      { key: "placeOfBirth", label: { en: "Place of Birth", sk: "Miesto narodenia", hu: "Születési hely" }, type: "text", required: false, system: true },
      { key: "countryOfBirth", label: { en: "Country of Birth", sk: "Štát narodenia", hu: "Születési ország" }, type: "text", required: false, system: true },
      { key: "maritalStatus", label: { en: "Marital Status", sk: "Rodinný stav", hu: "Családi állapot" }, type: "select", required: false, system: true, options: ["Single", "Married", "Divorced", "Widowed"] },
      { key: "education", label: { en: "Education", sk: "Vzdelanie", hu: "Végzettség" }, type: "text", required: false, system: true },
      { key: "professionBefore", label: { en: "Previous Profession", sk: "Predchádzajúce povolanie", hu: "Korábbi foglalkozás" }, type: "text", required: false, system: true },
    ],
    customFields: [],
  },
  {
    id: "passport",
    label: { en: "Travel Document / Passport", sk: "Cestovný doklad / Pas", hu: "Úti okmány / Útlevél" },
    enabled: true,
    sensitive: true,
    fields: [
      { key: "number", label: { en: "Passport Number", sk: "Číslo pasu", hu: "Útlevél száma" }, type: "text", required: true, system: true },
      { key: "issuedByCountry", label: { en: "Issued By Country", sk: "Vydávajúca krajina", hu: "Kiállító ország" }, type: "text", required: false, system: true },
      { key: "issuedAtPlace", label: { en: "Issued At Place", sk: "Miesto vydania", hu: "Kiállítás helye" }, type: "text", required: false, system: true },
      { key: "issuedDate", label: { en: "Issued Date", sk: "Dátum vydania", hu: "Kiállítás dátuma" }, type: "date", required: false, system: true },
      { key: "validUntil", label: { en: "Valid Until", sk: "Platnosť do", hu: "Érvényesség vége" }, type: "date", required: true, system: true },
    ],
    customFields: [],
  },
  {
    id: "permit",
    label: { en: "Residence / Work Permit", sk: "Povolenie na pobyt / prácu", hu: "Tartózkodási / Munkavállalási engedély" },
    enabled: true,
    sensitive: true,
    fields: [
      { key: "applicationType", label: { en: "Application Type", sk: "Typ žiadosti", hu: "Kérelem típusa" }, type: "text", required: false, system: true },
      { key: "residencePermitType", label: { en: "Residence Permit Type", sk: "Typ pobytu", hu: "Tartózkodási engedély típusa" }, type: "text", required: false, system: true },
      { key: "purpose", label: { en: "Purpose (Employment)", sk: "Účel pobytu", hu: "Cél" }, type: "text", required: false, system: true },
      { key: "purposeDetail", label: { en: "Purpose Detail / Police Dept.", sk: "Detail účelu / OCP PZ", hu: "Részletek / Rendőrkapitányság" }, type: "text", required: false, system: true },
      { key: "permitNumber", label: { en: "Permit Number", sk: "Číslo povolenia / karty", hu: "Engedély száma" }, type: "text", required: false, system: true },
      { key: "validUntil", label: { en: "Permit Valid Until", sk: "Platnosť povolenia do", hu: "Engedély érvényessége" }, type: "date", required: false, system: true },
    ],
    customFields: [],
  },
  {
    id: "stayWork",
    label: { en: "Stay & Employment Readiness", sk: "Pobyt a zamestnanie", hu: "Tartózkodás és munkavégzés" },
    enabled: true,
    sensitive: false,
    fields: [
      { key: "plannedEntryDate", label: { en: "Planned Entry Date", sk: "Plánovaný vstup na územie", hu: "Tervezett belépés" }, type: "date", required: false, system: true },
      { key: "stayDurationRequested", label: { en: "Stay Duration Requested", sk: "Požadovaná dĺžka pobytu", hu: "Igényelt tartózkodás hossza" }, type: "text", required: false, system: true },
      { key: "languages", label: { en: "Languages", sk: "Jazykové znalosti", hu: "Nyelvtudás" }, type: "text", required: false, system: true },
      { key: "jobPositionCode", label: { en: "Job Position / SK ISCO", sk: "Pracovná pozícia / SK ISCO", hu: "Munkakör / FEOR" }, type: "text", required: false, system: true },
      { key: "employerName", label: { en: "Sponsor / Agency Employer", sk: "Zamestnávateľ", hu: "Munkáltató" }, type: "text", required: false, system: true },
      { key: "employerIco", label: { en: "Employer IČO", sk: "IČO zamestnávateľa", hu: "Munkáltató adószáma / IČO" }, type: "text", required: false, system: true },
      { key: "workplaceCity", label: { en: "Workplace City", sk: "Mesto pracoviska", hu: "Munkahely városa" }, type: "text", required: false, system: true },
    ],
    customFields: [],
  },
  {
    id: "addresses",
    label: { en: "Home & SK Addresses", sk: "Adresy (domov a SR)", hu: "Lakcímek" },
    enabled: true,
    sensitive: true,
    fields: [
      { key: "homeStreet", label: { en: "Home Street", sk: "Domáca ulica", hu: "Állandó utca" }, type: "text", required: false, system: true },
      { key: "homeCity", label: { en: "Home City", sk: "Domáce mesto", hu: "Állandó város" }, type: "text", required: false, system: true },
      { key: "homeCountry", label: { en: "Home Country", sk: "Domovský štát", hu: "Állandó ország" }, type: "text", required: false, system: true },
      { key: "skStreet", label: { en: "Local Accommodation Street", sk: "Ulica na SR", hu: "Szállás utca" }, type: "text", required: false, system: true },
      { key: "skCity", label: { en: "Local City", sk: "Mesto na SR", hu: "Szállás város" }, type: "text", required: false, system: true },
      { key: "skPostalCode", label: { en: "Local Postal Code", sk: "PSČ na SR", hu: "Irányítószám" }, type: "text", required: false, system: true },
      { key: "lastAbroadCity", label: { en: "Last Stay Abroad City", sk: "Posledný pobyt v zahraničí", hu: "Utolsó külföldi tartózkodás" }, type: "text", required: false, system: true },
      { key: "previousStayInSk", label: { en: "Previous Stay in SK", sk: "Predošlý pobyt v SR", hu: "Korábbi tartózkodás" }, type: "text", required: false, system: true },
    ],
    customFields: [],
  },
  {
    id: "family",
    label: { en: "Family & Emergency Data", sk: "Rodinné a núdzové údaje", hu: "Családi és sürgősségi adatok" },
    enabled: true,
    sensitive: true,
    fields: [
      { key: "fatherFullName", label: { en: "Father's Full Name", sk: "Meno a priezvisko otca", hu: "Apa neve" }, type: "text", required: false, system: true },
      { key: "fatherNationality", label: { en: "Father's Nationality", sk: "Štátna príslušnosť otca", hu: "Apa állampolgársága" }, type: "text", required: false, system: true },
      { key: "motherFullName", label: { en: "Mother's Full Name", sk: "Meno a priezvisko matky", hu: "Anya neve" }, type: "text", required: false, system: true },
      { key: "motherMaidenName", label: { en: "Mother's Maiden Name", sk: "Rodné priezvisko matky", hu: "Anya születési neve" }, type: "text", required: false, system: true },
      { key: "spouseFullName", label: { en: "Spouse Full Name", sk: "Meno manžela/manželky", hu: "Házastárs neve" }, type: "text", required: false, system: true },
      { key: "spouseBirthDate", label: { en: "Spouse Date of Birth", sk: "Dátum narodenia manžela/ky", hu: "Házastárs születési dátuma" }, type: "date", required: false, system: true },
      { key: "childrenSummary", label: { en: "Children / Dependants", sk: "Deti / Vyživované osoby", hu: "Gyermekek / Eltartottak" }, type: "textarea", required: false, system: true },
      { key: "siblingsSummary", label: { en: "Siblings / Relatives", sk: "Súrodenci / Príbuzní", hu: "Testvérek / Rokonok" }, type: "textarea", required: false, system: true },
      { key: "emergencyContact", label: { en: "Emergency Contact Phone", sk: "Núdzový kontakt", hu: "Sürgősségi elérhetőség" }, type: "text", required: false, system: true },
    ],
    customFields: [],
  },
];

export const DEFAULT_AGENCY_SETTINGS: AgencySettings = {
  stages: [
    { id: "sourced", label: { en: "Sourced", sk: "Získaný", hu: "Jelölt" }, color: "#64748b", group: "new" },
    { id: "screened", label: { en: "Screened", sk: "Overený", hu: "Előszűrt" }, color: "#0ea5e9", group: "in_progress" },
    { id: "interview", label: { en: "Interview", sk: "Pohovor", hu: "Interjú" }, color: "#6366f1", group: "in_progress" },
    { id: "docs_pending", label: { en: "Docs & Permit", sk: "Doklady a pobyt", hu: "Dokumentumok" }, color: "#f59e0b", group: "in_progress" },
    { id: "ready", label: { en: "Ready to Place", sk: "Pripravený", hu: "Beosztásra kész" }, color: "#14b8a6", group: "ready" },
    { id: "placed", label: { en: "Rented / Placed", sk: "Prenajatý", hu: "Kihelyezve" }, color: "#10b981", group: "placed" },
    { id: "rejected", label: { en: "Withdrawn / Rejected", sk: "Vyradený", hu: "Elutasítva" }, color: "#ef4444", group: "closed" },
  ],
  checklistItems: [
    { key: "passport", label: { en: "Valid Passport", sk: "Platný cestovný pas", hu: "Érvényes útlevél" }, hasExpiry: true, required: true },
    { key: "permit", label: { en: "Work / Residence Permit", sk: "Povolenie na pobyt / prácu", hu: "Tartózkodási / Munkaengedély" }, hasExpiry: true, required: true },
    { key: "contract", label: { en: "Signed Agency Contract", sk: "Podpísaná pracovná zmluva", hu: "Aláírt szerződés" }, hasExpiry: false, required: true },
    { key: "medical", label: { en: "Medical Fitness Certificate", sk: "Lekárska prehliadka", hu: "Orvosi alkalmassági" }, hasExpiry: true, required: true },
    { key: "bozp", label: { en: "Safety / BOZP Induction", sk: "Školenie BOZP", hu: "Munkavédelmi oktatás" }, hasExpiry: true, required: false },
    { key: "accommodation", label: { en: "Accommodation Assignment", sk: "Pridelenie ubytovania", hu: "Szállás kijelölése" }, hasExpiry: false, required: false },
  ],
  shiftTemplates: [
    { id: "morning", code: "R", name: { en: "Morning", sk: "Ranná", hu: "Délelőtt" }, startTime: "06:00", endTime: "14:00", defaultHours: 8, payMultiplier: 1.0, billMultiplier: 1.0, color: "#0ea5e9" },
    { id: "afternoon", code: "P", name: { en: "Afternoon", sk: "Poobedná", hu: "Délután" }, startTime: "14:00", endTime: "22:00", defaultHours: 8, payMultiplier: 1.05, billMultiplier: 1.05, color: "#8b5cf6" },
    { id: "night", code: "N", name: { en: "Night", sk: "Nočná", hu: "Éjszakai" }, startTime: "22:00", endTime: "06:00", defaultHours: 8, payMultiplier: 1.25, billMultiplier: 1.25, color: "#334155" },
    { id: "day12", code: "D12", name: { en: "12h Day", sk: "Denná 12h", hu: "Nappali 12 óra" }, startTime: "06:00", endTime: "18:00", defaultHours: 12, payMultiplier: 1.0, billMultiplier: 1.0, color: "#10b981" },
  ],
  holidayCountry: "SK",
  overtimeMultiplier: 1.25,
  holidayMultiplier: 1.5,
  defaultCurrency: "EUR",
  autoCreateExpense: true,
  defaultExpenseCategoryId: "fc-exp-payroll",
  profileSchema: DEFAULT_AGENCY_PROFILE_SCHEMA,
};
