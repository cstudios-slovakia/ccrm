import type { 
  Lead, Appointment, GeneratedDocument, MarketingChannel, 
  NewsletterCampaign, Task, TimeLog, Employee, CustomForm, FormSubmission,
  ProjectType, Project
} from "../types";

export const INITIAL_LEADS: Lead[] = [
  {
    id: "lead-1",
    name: "Ján Novák",
    city: "Bratislava",
    clientType: "business",
    status: "new",
    source: "website",
    owner: "Sam",
    value: 12500,
    createdAt: "2026-05-15",
    rating: 5,
    phone: "+421 905 123 456",
    email: "novak@laminam.sk",
    address: {
      street: "Mlynské Nivy 42",
      city: "Bratislava",
      postalCode: "821 09",
      country: "Slovakia"
    },
    companyId: "36123456",
    taxId: "2021234567",
    vatId: "SK2021234567",
    contactPerson: "Ing. Ján Novák",
    website: "https://laminam.sk",
    timeline: [
      {
        id: "ev-1",
        type: "phone",
        timestamp: "2026-05-15 10:00",
        title: "Discovery Call Logged",
        content: "Discussed interior stone cladding options for the main showroom. Client is highly interested in thin porcelain slate slabs."
      },
      {
        id: "ev-2",
        type: "email",
        timestamp: "2026-05-16 11:30",
        title: "Sent Digital Catalog & Pricing",
        content: "Emailed complete porcelain slate stone catalog and basic thickness pricing guidelines."
      },
      {
        id: "ev-3",
        type: "appointment",
        timestamp: "2026-05-20 14:00",
        title: "Showroom Meeting Bratislava",
        content: "Met at our main showroom. Selected grey marble slab variants. Sam compiled official technical logistics requirements.",
        extraTime: "14:00"
      },
      {
        id: "ev-4",
        type: "offer",
        timestamp: "2026-05-22 15:45",
        title: "Official Price Offer Sent",
        content: "Drafted and emailed formal budget quote detailing complete slabs cutting & assembly pricing.",
        amount: 12500,
        fileName: "novak_slabs_proposal.pdf",
        fileSize: "1.45 MB",
        fileType: "offer"
      },
      {
        id: "ev-4-con",
        type: "offer",
        timestamp: "2026-05-24 10:00",
        title: "Signed Partnership Contract",
        content: "Bilateral custom fabrication agreement fully signed by Ing. Ján Novák.",
        amount: 12500,
        fileName: "novak_signed_agreement.pdf",
        fileSize: "2.80 MB",
        fileType: "contract"
      },
      {
        id: "ev-4-inv",
        type: "offer",
        timestamp: "2026-05-25 14:00",
        title: "Retainer Prepayment Invoice Issued",
        content: "Generated and sent custom stone cladding project prepayment invoice.",
        amount: 5000,
        fileName: "nivy_prepayment_invoice_3022.pdf",
        fileSize: "1.10 MB",
        fileType: "invoice"
      },
      {
        id: "ev-5",
        type: "note",
        timestamp: "2026-05-26 09:15",
        title: "Internal Coordination Details",
        content: "Sent final layout specifications to logistics managers for transport capacity scheduling."
      }
    ]
  },
  {
    id: "lead-2",
    name: "Martina Kováčová",
    city: "Trnava",
    clientType: "person",
    status: "contacted",
    source: "instagram",
    owner: "Jordan",
    value: 8400,
    createdAt: "2026-05-18",
    rating: 4,
    phone: "+421 911 987 654",
    email: "m.kovacova@gmail.com",
    address: {
      street: "Kukučínova 15",
      city: "Trnava",
      postalCode: "917 01",
      country: "Slovakia"
    },
    timeline: [
      {
        id: "ev-6",
        type: "phone",
        timestamp: "2026-05-18 09:30",
        title: "Inbound Inquiry Call",
        content: "Customer inquired about kitchen countertop quartz. Scheduled stone samples layout presentation."
      },
      {
        id: "ev-7",
        type: "email",
        timestamp: "2026-05-19 14:20",
        title: "Countertop Drawing File Received",
        content: "Client sent draft layout sketches detailing sink cutouts and edge rounding specifications."
      },
      {
        id: "ev-8",
        type: "note",
        timestamp: "2026-05-24 16:00",
        title: "Sample Selection Pinned",
        content: "Client selected White Calacatta Quartz and requested postal delivery of mini-sample slabs."
      }
    ]
  },
  {
    id: "lead-3",
    name: "Thomas Müller",
    city: "Košice",
    clientType: "partner",
    status: "offer sent",
    source: "showroom",
    owner: "Alex",
    value: 45000,
    createdAt: "2026-05-10",
    rating: 3,
    phone: "+49 172 888 999",
    email: "t.mueller@bavaria-logistics.de",
    address: {
      street: "Hauptstrasse 102",
      city: "Košice",
      postalCode: "040 01",
      country: "Germany"
    },
    companyId: "DE98765432",
    taxId: "115/908/332",
    contactPerson: "Thomas Müller",
    website: "https://bavaria-logistics.de",
    timeline: [
      {
        id: "ev-9",
        type: "note",
        timestamp: "2026-05-10 10:00",
        title: "Corporate Partnership Registration",
        content: "Bavaria Logistics registered as a corporate dealer partner for luxury porcelain tiles distribution."
      },
      {
        id: "ev-10",
        type: "offer",
        timestamp: "2026-05-12 11:30",
        title: "Wholesale Partnership Offer",
        content: "Drafted discount matrices detailing wholesale pricing terms for regional distribution.",
        amount: 45000
      }
    ]
  },
  {
    id: "lead-4",
    name: "Marek Szabó",
    city: "Nitra",
    clientType: "business",
    status: "accepted",
    source: "website",
    owner: "Jordan",
    value: 19800,
    createdAt: "2026-05-12",
    rating: 5,
    phone: "+421 907 555 444",
    email: "szabo@nitrastone.sk",
    address: {
      street: "Štefánikova trieda 88",
      city: "Nitra",
      postalCode: "949 01",
      country: "Slovakia"
    },
    companyId: "47228833",
    taxId: "2023991122",
    vatId: "SK2023991122",
    contactPerson: "Marek Szabó",
    website: "https://nitrastone.sk",
    timeline: [
      {
        id: "ev-4-1",
        type: "phone",
        timestamp: "2026-05-12 10:15",
        title: "Initial Web Inquiry Call",
        content: "Marek called regarding high-grade porcelain outdoor paving for a luxury villa development in Zobor, Nitra."
      },
      {
        id: "ev-4-2",
        type: "email",
        timestamp: "2026-05-13 14:00",
        title: "Sent Architectural Catalog & Specs",
        content: "Sent heavy-duty 20mm thickness porcelain slate guidelines and technical loading certificate spreadsheets."
      },
      {
        id: "ev-4-3",
        type: "note",
        timestamp: "2026-05-15 16:30",
        title: "Sample Request Received",
        content: "Selected darker anthracite stone slabs samples. Requested express delivery to Nitra office."
      },
      {
        id: "ev-4-4",
        type: "offer",
        timestamp: "2026-05-18 11:00",
        title: "Custom Cut Offer Sent",
        content: "Created custom pricing list with precision edge cutting and layout optimization consulting included.",
        amount: 19800
      },
      {
        id: "ev-4-5",
        type: "appointment",
        timestamp: "2026-05-20 15:00",
        title: "Onsite Material Selection Meeting",
        content: "Marek visited the showroom. Confirmed order layout. Contract signed and prepay invoice generated.",
        extraTime: "15:00"
      }
    ]
  },
  {
    id: "lead-5",
    name: "Elena Horváthová",
    city: "Bratislava",
    clientType: "person",
    status: "new",
    source: "facebook",
    owner: "Alex",
    value: 32000,
    createdAt: "2026-05-02",
    rating: 4,
    phone: "+421 915 222 111",
    email: "elena.horvath@post.sk",
    address: {
      street: "Hviezdoslavovo námestie 14",
      city: "Bratislava",
      postalCode: "811 02",
      country: "Slovakia"
    },
    timeline: [
      {
        id: "ev-5-1",
        type: "note",
        timestamp: "2026-05-02 18:45",
        title: "Facebook Lead Capture",
        content: "Lead captured from Facebook carousel ad showcasing kitchen bookmatched marble wall panels."
      },
      {
        id: "ev-5-2",
        type: "phone",
        timestamp: "2026-05-04 09:30",
        title: "Introduction & Scope Discovery Call",
        content: "Had a 15-minute phone call. Elena wants top-tier Calacatta gold bookmatched porcelain walls for her master bathroom."
      },
      {
        id: "ev-5-3",
        type: "email",
        timestamp: "2026-05-05 13:10",
        title: "Bathroom Floorplan Received",
        content: "Elena emailed PDF layouts of the bathroom showing dimensions and active water outlets."
      },
      {
        id: "ev-5-4",
        type: "appointment",
        timestamp: "2026-05-08 10:00",
        title: "Digital Design Alignment Consultation",
        content: "3D rendering mockup alignment session via Google Meet. Fine-tuned seamless tile layout.",
        extraTime: "10:00"
      },
      {
        id: "ev-5-5",
        type: "offer",
        timestamp: "2026-05-11 15:00",
        title: "Premium Bookmatched Slab Offer",
        content: "Sent detailed quotation for 4 mirror-matched Calacatta slabs, custom fabrication, and delivery.",
        amount: 32000
      }
    ]
  },
  {
    id: "lead-6",
    name: "Jozef Varga",
    city: "Žilina",
    clientType: "partner",
    status: "rejected",
    source: "facebook",
    owner: "Sam",
    value: 4200,
    createdAt: "2026-04-20",
    rating: 2
  },
  {
    id: "lead-7",
    name: "Peter Baláž",
    city: "Banská Bystrica",
    clientType: "business",
    status: "contacted",
    source: "website",
    owner: "Sam",
    value: 28500,
    createdAt: "2026-05-20",
    rating: 4
  },
  {
    id: "lead-8",
    name: "Zuzana Molnárová",
    city: "Prešov",
    clientType: "person",
    status: "offer sent",
    source: "showroom",
    owner: "Jordan",
    value: 15000,
    createdAt: "2026-05-22",
    rating: 3
  },
  {
    id: "lead-9",
    name: "Ladislav Tóth",
    city: "Bratislava",
    clientType: "partner",
    status: "accepted",
    source: "facebook",
    owner: "Alex",
    value: 62000,
    createdAt: "2026-05-05",
    rating: 5
  },
  {
    id: "lead-10",
    name: "Michal Krajčírik",
    city: "Žilina",
    clientType: "business",
    status: "new",
    source: "instagram",
    owner: "Sam",
    value: 9500,
    createdAt: "2026-05-24",
    rating: 1
  },
  {
    id: "lead-11",
    name: "Lucia Nagyová",
    city: "Poprad",
    clientType: "person",
    status: "offer sent",
    source: "website",
    owner: "Jordan",
    value: 21400,
    createdAt: "2026-05-19",
    rating: 4
  },
  {
    id: "lead-12",
    name: "Branislav Polák",
    city: "Trenčín",
    clientType: "partner",
    status: "accepted",
    source: "showroom",
    owner: "Alex",
    value: 74000,
    createdAt: "2026-05-08",
    rating: 5
  },
  {
    id: "lead-13",
    name: "Veronika Šimková",
    city: "Trnava",
    clientType: "business",
    status: "contacted",
    source: "facebook",
    owner: "Sam",
    value: 11200,
    createdAt: "2026-05-21",
    rating: 3
  },
  {
    id: "lead-14",
    name: "Patrik Hudec",
    city: "Nitra",
    clientType: "person",
    status: "rejected",
    source: "website",
    owner: "Jordan",
    value: 5900,
    createdAt: "2026-05-14",
    rating: 2
  },
  {
    id: "lead-15",
    name: "Katarína Liptáková",
    city: "Košice",
    clientType: "business",
    status: "new",
    source: "showroom",
    owner: "Alex",
    value: 36800,
    createdAt: "2026-05-25",
    rating: 4
  },
  {
    id: "lead-16",
    name: "Ivan Rusnák",
    city: "Bratislava",
    clientType: "partner",
    status: "accepted",
    source: "website",
    owner: "Sam",
    value: 85000,
    createdAt: "2026-05-01",
    rating: 5
  },
  {
    id: "lead-17",
    name: "Mária Gallová",
    city: "Banská Bystrica",
    clientType: "person",
    status: "contacted",
    source: "instagram",
    owner: "Jordan",
    value: 14300,
    createdAt: "2026-05-23",
    rating: 3
  },
  {
    id: "lead-18",
    name: "Stanislav Fekete",
    city: "Prešov",
    clientType: "business",
    status: "offer sent",
    source: "facebook",
    owner: "Alex",
    value: 23000,
    createdAt: "2026-05-11",
    rating: 4
  },
  {
    id: "lead-19",
    name: "Jana Sedláková",
    city: "Žilina",
    clientType: "person",
    status: "accepted",
    source: "website",
    owner: "Sam",
    value: 18700,
    createdAt: "2026-05-03",
    rating: 5
  },
  {
    id: "lead-20",
    name: "Robert Orosz",
    city: "Poprad",
    clientType: "partner",
    status: "new",
    source: "showroom",
    owner: "Jordan",
    value: 6500,
    createdAt: "2026-05-26",
    rating: 2
  },
  {
    id: "lead-21",
    name: "Gabriela Antalová",
    city: "Trenčín",
    clientType: "business",
    status: "contacted",
    source: "website",
    owner: "Alex",
    value: 29900,
    createdAt: "2026-05-17",
    rating: 4
  },
  {
    id: "lead-22",
    name: "Martin Belan",
    city: "Bratislava",
    clientType: "person",
    status: "offer sent",
    source: "instagram",
    owner: "Sam",
    value: 41200,
    createdAt: "2026-05-09",
    rating: 5
  },
  {
    id: "lead-23",
    name: "Zdenka Drobná",
    city: "Trnava",
    clientType: "partner",
    status: "accepted",
    source: "facebook",
    owner: "Jordan",
    value: 17600,
    createdAt: "2026-05-04",
    rating: 3
  },
  {
    id: "lead-24",
    name: "Richard Fischer",
    city: "Nitra",
    clientType: "business",
    status: "rejected",
    source: "website",
    owner: "Alex",
    value: 53000,
    createdAt: "2026-04-28",
    rating: 4
  },
  {
    id: "lead-25",
    name: "Alexandra Medveďová",
    city: "Košice",
    clientType: "person",
    status: "new",
    source: "showroom",
    owner: "Sam",
    value: 38000,
    createdAt: "2026-05-27",
    rating: 5
  },
  {
    id: "lead-26",
    name: "Andrej Hruška",
    city: "Banská Bystrica",
    clientType: "partner",
    status: "contacted",
    source: "instagram",
    owner: "Jordan",
    value: 8900,
    createdAt: "2026-05-16",
    rating: 3
  },
  {
    id: "lead-27",
    name: "Dominika Kováčiková",
    city: "Prešov",
    clientType: "business",
    status: "offer sent",
    source: "website",
    owner: "Alex",
    value: 48600,
    createdAt: "2026-05-07",
    rating: 5
  }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-1",
    clientName: "Ján Novák (Laminam)",
    email: "novak@laminam.sk",
    date: "2026-05-29",
    time: "14:30",
    duration: 60,
    status: "confirmed",
    notes: "Technical specifications review for architectural glass.",
    synced: true
  },
  {
    id: "apt-2",
    clientName: "Thomas Müller",
    email: "t.mueller@bavaria-logistics.de",
    date: "2026-05-30",
    time: "10:00",
    duration: 45,
    status: "confirmed",
    notes: "SLA contract discussion and price adjustments.",
    synced: true
  },
  {
    id: "apt-3",
    clientName: "Martina Kováčová",
    email: "kovacova@studiodesign.sk",
    date: "2026-06-02",
    time: "11:15",
    duration: 30,
    status: "pending",
    notes: "Follow-up call on design templates.",
    synced: false
  }
];

export const INITIAL_DOCUMENTS: GeneratedDocument[] = [
  {
    id: "doc-1",
    title: "Proposal for Custom Cladding - Laminam Glass",
    type: "proposal",
    clientName: "Laminam Glass Slovakia",
    value: 12500,
    content: "## Proposal: Architectural Glass Cladding\n\nPrepared for **Laminam Glass Slovakia**.\n\n### 1. Project Scope\nWe will supply and install 240m² of custom structural glass cladding at your central Bratislava headquarters.\n\n### 2. Timeline\n- Materials sourcing: 4 weeks\n- Onsite structural assembly: 2 weeks\n\n### 3. Investment\n- Structural glass segments: €8,500\n- Professional engineering labor: €4,000\n- **Total Investment: €12,500**",
    createdAt: "2026-05-20",
    status: "sent"
  },
  {
    id: "doc-2",
    title: "Varga Woodworks Quote #2026-88",
    type: "quote",
    clientName: "Varga Woodworks",
    value: 4200,
    content: "## Quote: Custom CNC Milling Services\n\nClient: **Varga Woodworks**\n\n* Custom CNC pattern carving (50 units) - €2,200\n* Premium walnut sanding & finishing treatment - €2,000\n\n**Total Price: €4,200**",
    createdAt: "2026-04-18",
    status: "expired"
  },
  {
    id: "doc-3",
    title: "Fintech Slovakia SLA Agreement",
    type: "contract",
    clientName: "Fintech Slovakia a.s.",
    value: 32000,
    content: "## Service Level Agreement (SLA)\n\nThis contract is entered between **Fintech Slovakia a.s.** and **CCRM Solutions**.\n\n### 1. SLA Performance Matrix\n- Server uptime guarantee: 99.99%\n- Support response window: Under 2 hours\n\n### 2. Retainer Terms\nMonthly support fee: €2,666 (representing €32,000 annualized).\n\nBoth parties sign to execute this contract.",
    createdAt: "2026-05-02",
    status: "signed"
  }
];

export const INITIAL_MARKETING: MarketingChannel[] = [
  { name: "Google Ads", spend: 3200, revenue: 19800, leadsCount: 42 },
  { name: "LinkedIn Campaigns", spend: 1800, revenue: 32000, leadsCount: 15 },
  { name: "Facebook Retargeting", spend: 1400, revenue: 4200, leadsCount: 28 },
  { name: "Instagram Organic", spend: 500, revenue: 8400, leadsCount: 35 },
  { name: "Newsletter Referrals", spend: 200, revenue: 15000, leadsCount: 19 }
];

export const INITIAL_CAMPAIGNS: NewsletterCampaign[] = [
  {
    id: "cmp-1",
    subject: "Boost Your Sales Funnel with CCRM 2.0",
    content: "Hi {name},\n\nWe are thrilled to present our latest CRM enhancements focusing on smart document templates, custom forms, and dynamic calendar integrations.\n\nClick below to access our free consultation!",
    segment: "leads",
    status: "sent",
    sentAt: "2026-05-20",
    stats: { opens: 142, clicks: 58, bounce: 3, conversions: 12 }
  },
  {
    id: "cmp-2",
    subject: "Quarterly System Operations & Retainer SLA Updates",
    content: "Dear Partner,\n\nPlease review our updated SLA uptime statistics. We achieved 100% core infrastructure availability throughout Q1 2026.",
    segment: "won_clients",
    status: "sent",
    sentAt: "2026-05-05",
    stats: { opens: 8, clicks: 6, bounce: 0, conversions: 4 }
  },
  {
    id: "cmp-3",
    subject: "Summer Campaign Promotion - Exclusive Discount",
    content: "Hey {name},\n\nGet ready for our hot summer product discounts of up to 25% off setup fees!",
    segment: "all",
    status: "draft",
    stats: { opens: 0, clicks: 0, bounce: 0, conversions: 0 }
  }
];

export const INITIAL_TASKS: Task[] = [
  {
    id: "task-1",
    title: "Draft SLA contract for Bavaria Logistics",
    description: "Prepare standard wholesale SLA layout including slab delivery timelines.",
    status: "In progress",
    priority: "high",
    deadline: "2026-05-30",
    deadlineTime: "12:00",
    owner: "Alex",
    assignedUsers: ["Alex", "Jordan"],
    relatedLeadId: "lead-3",
    isLocking: true
  },
  {
    id: "task-2",
    title: "Onsite laser measurement for kitchen countertop",
    description: "Visit Martina's property in Trnava to take precise Proliner measurements for Calacatta Quartz.",
    status: "New",
    priority: "high",
    deadline: "2026-05-31",
    deadlineTime: "10:00",
    owner: "Sam",
    assignedUsers: ["Sam"],
    relatedLeadId: "lead-2",
    isLocking: true
  },
  {
    id: "task-3",
    title: "Slab delivery coordination from Italy",
    description: "Coordinate with logistics for the Laminam 12mm thickness slabs arriving from Fiorano Modenese.",
    status: "New",
    priority: "medium",
    deadline: "2026-06-02",
    deadlineTime: "16:00",
    owner: "Jordan",
    assignedUsers: ["Jordan"],
    relatedLeadId: "lead-1",
    isLocking: false
  },
  {
    id: "task-4",
    title: "Showroom Presentation & Sample Review",
    description: "Prepare physical samples of Bookmatched Calacatta Gold for Elena's bathroom project.",
    status: "New",
    priority: "high",
    deadline: "2026-05-29",
    deadlineTime: "19:00",
    owner: "Alex",
    assignedUsers: ["Alex"],
    relatedLeadId: "lead-5",
    isLocking: false,
    isAiGenerated: true
  },
  {
    id: "task-5",
    title: "Submit Commercial Proposal for Villa Zobor",
    description: "Compile fabrication and installation pricing for Marek's outdoor paving project.",
    status: "Done",
    priority: "medium",
    deadline: "2026-05-28",
    deadlineTime: "23:59",
    owner: "Jordan",
    assignedUsers: ["Jordan"],
    relatedLeadId: "lead-4",
    isLocking: false
  },
  {
    id: "task-6",
    title: "CNC Milling Programming",
    description: "Prepare the waterjet and CNC toolpaths for the kitchen sink cutouts.",
    status: "Blocked",
    priority: "low",
    deadline: "2026-06-05",
    deadlineTime: "12:00",
    owner: "Sam",
    assignedUsers: ["Sam"],
    relatedLeadId: "lead-2",
    isLocking: false
  },
  {
    id: "task-7",
    title: "Finalize edge profiling parameters for Laminam",
    description: "Establish default mitred apron parameters for the fabrication department.",
    status: "New",
    priority: "medium",
    deadline: "2026-05-30",
    deadlineTime: "23:59",
    owner: "Alex",
    assignedUsers: ["Alex"],
    relatedLeadId: "lead-1",
    isLocking: false
  },
  {
    id: "task-8",
    title: "Site safety clearance for Villa Zobor claddings",
    description: "Approve scaffolding and hoisting setup before slab installations.",
    status: "New",
    priority: "high",
    deadline: "2026-05-30",
    deadlineTime: "10:00",
    owner: "Sam",
    assignedUsers: ["Sam"],
    relatedLeadId: "lead-4",
    isLocking: true
  },
  {
    id: "task-9",
    title: "Review sample shipping logs from Italy",
    description: "Confirm tracked numbers for 6mm ceramic panels coming next week.",
    status: "New",
    priority: "medium",
    deadline: "2026-05-27",
    deadlineTime: "16:00",
    owner: "Jordan",
    assignedUsers: ["Jordan"],
    relatedLeadId: "lead-3",
    isLocking: false
  },
  {
    id: "task-10",
    title: "Prepare cutting layouts for showroom slabs",
    description: "Create optimal nest layouts in CAD/CAM to minimize slab offcut waste.",
    status: "New",
    priority: "medium",
    deadline: "2026-05-31",
    deadlineTime: "23:59",
    owner: "Sam",
    assignedUsers: ["Sam"],
    relatedLeadId: "lead-3",
    isLocking: false
  },
  {
    id: "task-11",
    title: "Review wholesale pricing strategy",
    description: "Examine material markup for large-scale architectural projects.",
    status: "New",
    priority: "low",
    deadline: "2026-06-10",
    deadlineTime: "23:59",
    owner: "Alex",
    assignedUsers: ["Alex"],
    isLocking: false
  }
];

export const INITIAL_TIMELOGS: TimeLog[] = [
  {
    id: "log-1",
    employeeName: "Peter Mlynár",
    projectName: "ERP Integration",
    clientName: "Bavaria Logistics",
    hours: 6.5,
    date: "2026-05-27",
    description: "Custom mapping of Bavaria Logistics database structures to ERP schemas."
  },
  {
    id: "log-2",
    employeeName: "Lucia Krajčíková",
    projectName: "Newsletter setup",
    clientName: "Studio Design Bratislava",
    hours: 3.2,
    date: "2026-05-28",
    description: "Created master visual email layouts and tested variable injection."
  },
  {
    id: "log-3",
    employeeName: "Peter Mlynár",
    projectName: "Client Audit",
    clientName: "Laminam Glass Slovakia",
    hours: 2.0,
    date: "2026-05-29",
    description: "Preparatory call and engineering brief coordination."
  }
];

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: "emp-1",
    name: "Peter Mlynár",
    role: "Senior Sales & Integrations Lead",
    email: "mlynar@ccrm.sk",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
    performanceScore: 94,
    leaves: [
      { id: "lv-1", startDate: "2026-07-10", endDate: "2026-07-24", type: "vacation", status: "approved" },
      { id: "lv-2", startDate: "2026-05-12", endDate: "2026-05-13", type: "sick", status: "approved" }
    ]
  },
  {
    id: "emp-2",
    name: "Lucia Krajčíková",
    role: "Marketing Specialist",
    email: "krajcikova@ccrm.sk",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
    performanceScore: 89,
    leaves: [
      { id: "lv-3", startDate: "2026-08-15", endDate: "2026-08-20", type: "vacation", status: "pending" }
    ]
  },
  {
    id: "emp-3",
    name: "Ján Novák",
    role: "Field Architect & Auditing Contractor",
    email: "novak@laminam.sk",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
    performanceScore: 82,
    leaves: []
  }
];

export const INITIAL_FORMS: CustomForm[] = [
  {
    id: "form-1",
    title: "Architectural Consultation Form",
    description: "Standard web-embed form to capture cladding and glass design queries.",
    createdAt: "2026-05-15",
    submissionsCount: 4,
    fields: [
      { id: "fld-1", label: "Full Name", type: "text", required: true },
      { id: "fld-2", label: "Corporate Email", type: "email", required: true },
      { id: "fld-3", label: "Contact Phone", type: "tel", required: false },
      { id: "fld-4", label: "Estimated Budget (€)", type: "select", required: true, options: ["< €10,000", "€10,000 - €50,000", "> €50,000"] },
      { id: "fld-5", label: "Project Description", type: "textarea", required: true }
    ]
  }
];

export const INITIAL_SUBMISSIONS: FormSubmission[] = [
  {
    id: "sub-1",
    formId: "form-1",
    submittedAt: "2026-05-15 11:20",
    data: {
      "Full Name": "Ján Novák",
      "Corporate Email": "novak@laminam.sk",
      "Contact Phone": "+421 905 123 456",
      "Estimated Budget (€)": "€10,000 - €50,000",
      "Project Description": "Looking for modern visual glass coverings for our commercial workspace panels."
    }
  },
  {
    id: "sub-2",
    formId: "form-1",
    submittedAt: "2026-05-24 16:45",
    data: {
      "Full Name": "Peter Gula",
      "Corporate Email": "gula@glassworks.sk",
      "Contact Phone": "+421 944 888 777",
      "Estimated Budget (€)": "< €10,000",
      "Project Description": "Need simple window panel glass thickness analysis."
    }
  }
];

export const DUMMY_TEMPLATES = [
  {
    id: "tpl-prop",
    title: "Standard Project Proposal",
    type: "proposal",
    content: "## Proposal: {projectName}\n\nClient: **{clientName}**\nDate: {currentDate}\n\n### Introduction\nWe are pleased to submit this business development proposal to supply custom technical services.\n\n### Investment Summary\n* Consulting Retainer - €5,000\n* Custom Configuration Support - €7,500\n\n**Total Estimated Cost: {totalValue}**"
  },
  {
    id: "tpl-quote",
    title: "Standard Service Quote",
    type: "quote",
    content: "## Quote: Specialized Retainer Services\n\nClient Name: **{clientName}**\nQuote Ref: #Q-{randomId}\n\n* Basic service hour allocation (10 hours) - €1,200\n* Priority developer support package - €3,000\n\n**Total Proposal Price: {totalValue}**\n\n*Valid for 30 days.*"
  },
  {
    id: "tpl-contr",
    title: "Service SLA Contract",
    type: "contract",
    content: "## MASTER SERVICES CONTRACT (SLA)\n\nThis Agreement is enacted on {currentDate} between **{clientName}** and **CCRM Solutions**.\n\n### 1. Performance Commitments\nWe pledge to supply highly scalable infrastructure and visual pipelines. Total contract value is locked at **{totalValue}**.\n\n### 2. Termination & Support\nEither party may cancel with a 30-day written alert."
  }
];

export const INITIAL_PROJECT_TYPES: ProjectType[] = [
  {
    id: "pt-custom-slab",
    name: "Custom Slab Installation",
    description: "Custom stone slabs installation for kitchen or bathroom countertops",
    icon: "Layers",
    color: "purple",
    attributes: [
      {
        id: "slab-material",
        name: "Slab Material",
        type: "select",
        required: true,
        options: ["Carrara Marble", "Calacatta Viola", "Super White Quartzite", "Nero Marquina"]
      },
      {
        id: "thickness",
        name: "Thickness (cm)",
        type: "number",
        required: true
      },
      {
        id: "edge-profile",
        name: "Edge Profile",
        type: "radio",
        required: false,
        options: ["Eased", "Bullnose", "Mitered", "Ogee"]
      },
      {
        id: "installation-date",
        name: "Requested Install Date",
        type: "date",
        required: true
      },
      {
        id: "additional-notes",
        name: "Additional Custom Notes",
        type: "textarea",
        required: false
      }
    ],
    hasTimeline: true,
    hasGantt: true
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj-1",
    projectTypeId: "pt-custom-slab",
    leadId: "lead-1",
    clientId: "lead-1",
    status: "active",
    managers: ["Sam"],
    data: {
      "slab-material": "Carrara Marble",
      "thickness": "3",
      "edge-profile": "Mitered",
      "installation-date": "2026-08-15",
      "additional-notes": "Please verify site readiness before fabrication."
    },
    timeline: [
      {
        id: "te-p1-1",
        type: "appointment",
        timestamp: "2026-07-10 10:00",
        title: "Initial Site Measurement",
        content: "Sam to visit client site for laser measurements and templates."
      }
    ],
    gantt: [
      {
        id: "g-p1-1",
        title: "Laser Measurement & Template",
        contactId: "lead-1",
        startDate: "2026-07-10",
        endDate: "2026-07-11",
        progress: 100
      },
      {
        id: "g-p1-2",
        title: "Slab Fabrication",
        contactId: "lead-1",
        startDate: "2026-07-12",
        endDate: "2026-07-16",
        progress: 40
      }
    ]
  }
];

// Helper to seed localStorage
export const seedStorageIfEmpty = () => {
  if (!localStorage.getItem("crm_seeded_v9")) {
    localStorage.setItem("crm_leads", JSON.stringify(INITIAL_LEADS));
    localStorage.setItem("crm_appointments", JSON.stringify(INITIAL_APPOINTMENTS));
    localStorage.setItem("crm_documents", JSON.stringify(INITIAL_DOCUMENTS));
    localStorage.setItem("crm_marketing", JSON.stringify(INITIAL_MARKETING));
    localStorage.setItem("crm_campaigns", JSON.stringify(INITIAL_CAMPAIGNS));
    localStorage.setItem("crm_tasks", JSON.stringify(INITIAL_TASKS));
    localStorage.setItem("crm_timelogs", JSON.stringify(INITIAL_TIMELOGS));
    localStorage.setItem("crm_employees", JSON.stringify(INITIAL_EMPLOYEES));
    localStorage.setItem("crm_forms", JSON.stringify(INITIAL_FORMS));
    localStorage.setItem("crm_submissions", JSON.stringify(INITIAL_SUBMISSIONS));
    localStorage.setItem("crm_projectTypes", JSON.stringify(INITIAL_PROJECT_TYPES));
    localStorage.setItem("crm_projects", JSON.stringify(INITIAL_PROJECTS));
    
    localStorage.setItem("crm_seeded_v9", "true");
  }
};

// Global Store interfaces
export interface CRMStore {
  leads: Lead[];
  appointments: Appointment[];
  documents: GeneratedDocument[];
  marketing: MarketingChannel[];
  campaigns: NewsletterCampaign[];
  tasks: Task[];
  timelogs: TimeLog[];
  employees: Employee[];
  forms: CustomForm[];
  submissions: FormSubmission[];
  projectTypes: ProjectType[];
  projects: Project[];
}

export const loadCRMData = (): CRMStore => {
  seedStorageIfEmpty();
  return {
    leads: JSON.parse(localStorage.getItem("crm_leads") || "[]"),
    appointments: JSON.parse(localStorage.getItem("crm_appointments") || "[]"),
    documents: JSON.parse(localStorage.getItem("crm_documents") || "[]"),
    marketing: JSON.parse(localStorage.getItem("crm_marketing") || "[]"),
    campaigns: JSON.parse(localStorage.getItem("crm_campaigns") || "[]"),
    tasks: JSON.parse(localStorage.getItem("crm_tasks") || "[]"),
    timelogs: JSON.parse(localStorage.getItem("crm_timelogs") || "[]"),
    employees: JSON.parse(localStorage.getItem("crm_employees") || "[]"),
    forms: JSON.parse(localStorage.getItem("crm_forms") || "[]"),
    submissions: JSON.parse(localStorage.getItem("crm_submissions") || "[]"),
    projectTypes: JSON.parse(localStorage.getItem("crm_projectTypes") || "[]"),
    projects: JSON.parse(localStorage.getItem("crm_projects") || "[]")
  };
};

export const saveCRMData = (data: Partial<CRMStore>) => {
  Object.entries(data).forEach(([key, val]) => {
    localStorage.setItem(`crm_${key}`, JSON.stringify(val));
  });
};

export const resetCRMData = () => {
  localStorage.removeItem("crm_seeded_v9");
  localStorage.removeItem("crm_projectTypes");
  localStorage.removeItem("crm_projects");
  seedStorageIfEmpty();
};
