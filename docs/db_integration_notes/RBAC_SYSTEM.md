# Role-Based Access Control (RBAC) System Design

This document details the architectural strategy for securing the Laminam CRM modules and views based on assigned user roles. It ensures proper permissions tracking for actions like editing templates, deleting records, or adjusting marketing metrics.

---

## 1. Mapped User Roles & Permissions Matrix

The Laminam CRM maps specific application functions (permission slugs) to the three standard system roles. The table below represents this flipped mapping, where rows show application features/functions and columns denote authorization status across each role:

| Function / Permission Slug | Feature Area / Description | `viewer` (Guest) | `project_manager` (PM) | `admin` (Owner) |
| :--- | :--- | :---: | :---: | :---: |
| **`leads.view`** | Access and view lead records, basic details, and pipeline stages. | ✅ | ✅ | ✅ |
| **`leads.create`** | Add new business, partner, or personal lead prospects to the database. | ❌ | ✅ | ✅ |
| **`leads.edit`** | Modify contact info, estimated deal values, star ratings, and category tags. | ❌ | ✅ | ✅ |
| **`leads.delete`** | Permanently remove lead profiles and all associated event timelines. | ❌ | ❌ | ✅ |
| **`tasks.view`** | Inspect task deadlines, boards, Kanban state, and team assignments. | ✅ | ✅ | ✅ |
| **`tasks.create`** | Generate new check-list actions and assignees. | ❌ | ✅ | ✅ |
| **`tasks.edit`** | Move task cards across todo, in-progress, blocked, and done columns. | ❌ | ✅ | ✅ |
| **`tasks.delete`** | Permanently delete checklists and assignees structures. | ❌ | ❌ | ✅ |
| **`timeline.log`** | Log timeline history notes, phone call diaries, and custom descriptions. | ❌ | ✅ | ✅ |
| **`timeline.delete`** | Purge timeline records from the history feed. | ❌ | ❌ | ✅ |
| **`calendar.view`** | View team schedules, events, booked intervals, and calendar slots. | ✅ | ✅ | ✅ |
| **`calendar.create`** | Place new bookings, customer events, and schedule meetings. | ❌ | ✅ | ✅ |
| **`calendar.edit`** | Modify timing, title, or details of existing booking allocations. | ❌ | ✅ | ✅ |
| **`calendar.delete`** | Cancel and remove scheduled calendar event slots. | ❌ | ❌ | ✅ |
| **`time_records.view`**| Browse logged stop-watch intervals and work-hour charts. | ✅ | ✅ | ✅ |
| **`time_records.log`** | Start, stop, and manually record time-tracking stopwatch sessions. | ❌ | ✅ | ✅ |
| **`newsletter.view`** | Browse saved marketing email campaigns and subscriber metrics. | ✅ | ✅ | ✅ |
| **`newsletter.edit`** | Create, draft, and modify template HTML email newsletters. | ❌ | ✅ | ✅ |
| **`newsletter.send`** | Trigger bulk mailing processes to registered newsletter targets. | ❌ | ❌ | ✅ |
| **`hr.view`** | Browse registered employees, system users list, and roles. | ✅ | ✅ | ✅ |
| **`hr.edit`** | Modify worker rosters, department information, or wage specifications. | ❌ | ❌ | ✅ |
| **`files.view`** | Download and review uploaded documents, offers, and proposals. | ✅ | ✅ | ✅ |
| **`files.create`** | Upload contract proposals, receipts, and offer attachments. | ❌ | ✅ | ✅ |
| **`files.delete`** | Remove static documentation from the storage and database record list. | ❌ | ❌ | ✅ |
| **`general_config`** | Change application branding, UI colors, active language, and currencies. | ❌ | ❌ | ✅ |
| **`pm_managers`** | Create, edit, suspend, or upgrade Project Manager user profiles. | ❌ | ❌ | ✅ |
| **`pipeline_stages`** | Rearrange, rename, add, or delete statuses in the lead pipeline Kanban. | ❌ | ❌ | ✅ |
| **`traffic_sources`** | Customize marketing channels, categories, and their color associations. | ❌ | ❌ | ✅ |
| **`system_reset`** | Wipe out mock CRM seed data, empty logs, or wipe databases cleanly. | ❌ | ❌ | ✅ |

---

## 2. Dynamic UI Component Authorization

To enforce this structure cleanly within the React front-end, wrap vulnerable elements or routes inside a dedicated, lightweight `<Authorize />` component or evaluate permissions explicitly.

### 2.1. Permission Guard Component
Create the guard layout inside a new component file `src/components/Authorize.tsx`:

```tsx
import React from 'react';
import { useAuth } from '../hooks/useAuth'; // Custom hook connecting to backend profile

interface AuthorizeProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const Authorize: React.FC<AuthorizeProps> = ({ 
  permission, 
  fallback = null, 
  children 
}) => {
  const { user } = useAuth();

  if (!user) return <>{fallback}</>;

  // Admin always authorized
  if (user.role === 'admin') return <>{children}</>;

  // Check custom permission slates
  const hasPermission = checkUserPermission(user.role, permission);
  if (hasPermission) return <>{children}</>;

  return <>{fallback}</>;
};

// Simple permissions checker
export function checkUserPermission(role: string, permissionSlug: string): boolean {
  if (role === 'admin') return true;

  const PM_PERMISSIONS = [
    'leads.view', 'leads.create', 'leads.edit',
    'tasks.view', 'tasks.create', 'tasks.edit',
    'timeline.log',
    'calendar.view', 'calendar.create', 'calendar.edit',
    'time_records.log',
    'newsletter.view', 'newsletter.create', 'newsletter.edit',
    'hr.view',
    'files.view', 'files.create'
  ];

  const VIEWER_PERMISSIONS = [
    'leads.view',
    'tasks.view',
    'calendar.view',
    'time_records.view',
    'newsletter.view',
    'hr.view',
    'files.view'
  ];

  if (role === 'project_manager') {
    return PM_PERMISSIONS.includes(permissionSlug);
  }

  if (role === 'viewer') {
    return VIEWER_PERMISSIONS.includes(permissionSlug);
  }

  return false;
}
```

---

## 3. Practical Frontend UI Protections

Here are concrete examples of how to apply this security paradigm across existing Laminam CRM components.

### 3.1. Disabling In-Place Star Ratings for Guests
Inside [src/components/LeadsDatagrid.tsx](file:///Users/erik/Documents/vibe%20coding/crm/src/components/LeadsDatagrid.tsx), prevent guest users from changing ratings directly by evaluating user roles before firing updates:

```tsx
const handleStarRatingClick = (leadId: string, value: number) => {
  if (currentUser.role === 'viewer') {
    alert("Unauthorized Action: Viewers cannot modify lead ratings.");
    return;
  }
  
  // Proceed with rating update...
};
```

### 3.2. Restricting settings View Panel Access
Conditionally block settings panels inside `src/components/Sidebar.tsx` to hide configurations from PMs or Guest profiles:

```tsx
<Authorize permission="settings.manage" fallback={null}>
  <a 
    href="#settings"
    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-extrabold transition-all uppercase tracking-wider ${
      activeTab === "settings" ? "bg-blue-600 text-white shadow-lg" : "text-slate-550 hover:bg-slate-100"
    }`}
  >
    <Settings className="h-4.5 w-4.5" />
    Settings
  </a>
</Authorize>
```

### 3.3. Disabling lead Deletions
Ensure the action buttons are conditionally hidden in Lead/Client view rows:

```tsx
{currentUser.role === 'admin' && (
  <button 
    onClick={() => handleDeleteLead(lead.id)}
    className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all"
    title="Delete Lead Opportunity"
  >
    <Trash2 className="h-3.5 w-3.5" />
  </button>
)}
```

---

## 4. API-Level Backend Authorization (Essential)

> [!CAUTION]
> Frontend checks are purely for UX aesthetics (hiding buttons). **Backend authorization is mandatory.** Every REST endpoint in the PHP/Laravel controllers must validate the JWT token or session roles on every single write request before updating MySQL records.
