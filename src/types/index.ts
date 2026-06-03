export interface ClientAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface TimelineEvent {
  id: string;
  type: "phone" | "email" | "note" | "offer" | "appointment";
  timestamp: string; // YYYY-MM-DD HH:MM
  title: string;
  content: string;
  amount?: number; // for offers
  extraTime?: string; // for appointments
  fileName?: string; // name of attached file
  fileSize?: string; // size of attached file e.g. "1.5 MB"
  fileType?: "offer" | "contract" | "invoice";
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
  
  // Interactive Timeline Logs
  timeline?: TimelineEvent[];
  
  // Lead Interested Categories
  categories?: string[];
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
  status: "todo" | "in_progress" | "blocked" | "done";
  priority: "low" | "medium" | "high";
  deadline: string; // YYYY-MM-DD
  owner: string;    // Task creator or primary owner
  assignedUsers: string[]; // names of assigned team members
  relatedLeadId?: string; // linked lead or client id (optional)
  isLocking?: boolean; // if true, it blocks related lead from transitioning stages until done
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
  name: string;
  email: string;
  password?: string;
  role: string;
  color: string;
  activityLog?: UserActivityLog[];
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
}
