# Laminam CRM - Database Interconnection Documentation

Welcome! This folder contains complete technical specifications and plans to guide the next developer/agent in connecting this high-fidelity React Single Page Application (SPA) with a persistent MySQL database and PHP/Laravel backend.

---

## 📁 Documentation Contents

Click on any of the documents below to read the comprehensive specifications:

1.  **[SCHEMA.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/db_integration_notes/SCHEMA.md)**:
    Complete MySQL DDL statements, schemas, index configurations, and primary/foreign key mappings for all CRM objects.
2.  **[API_CONTRACTS.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/db_integration_notes/API_CONTRACTS.md)**:
    Rest API request/response JSON contracts for loading, creating, editing, and deleting leads, tasks, timeline logs, and public dynamic forms.
3.  **[STATE_SYNC.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/db_integration_notes/STATE_SYNC.md)**:
    React state context persistence models, detailing the migration path from synchronous `localStorage` to asynchronous fetch updates and optimistic offline triggers.
4.  **[RBAC_SYSTEM.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/db_integration_notes/RBAC_SYSTEM.md)**:
    Role-Based Access Control matrix. Details authorization checks to secure specific UI buttons, block views, and restrict guest actions.
5.  **[WIZARD_INSTALL.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/db_integration_notes/WIZARD_INSTALL.md)**:
    Composer package installation wizard flow, database connection forms, Demo Mode state badges, and dynamic data truncation procedures.

---

## 🎯 Architecture Diagram

This diagram visualizes how the SPA views, dynamic state providers, REST API middleware, and MySQL database tables interconnect:

```mermaid
graph TD
    subgraph SPA Frontend (React 19)
        A[Sidebar / Hash Router] --> B[Leads & Clients Views]
        B --> C[Details Card & Timeline]
        C --> D[State context Providers]
    end

    subgraph API Middleware (Laravel / Custom package)
        D -- "fetch API (JSON)" --> E[Auth & Session Controllers]
        D -- "fetch API (JSON)" --> F[Leads & Tasks Controllers]
        D -- "fetch API (JSON)" --> G[Settings & Forms Controllers]
    end

    subgraph Persistent Database (MySQL)
        E --> H[(users & roles)]
        F --> I[(leads & tasks)]
        G --> J[(settings & dynamic forms)]
    end
```

---

## 🚀 Recommended Next Implementation Steps

When you are ready to begin the database integration phase, follow this sequential roadmap:

1.  **Initialize migrations**: Run the DDL scripts in `SCHEMA.md` on your MySQL server.
2.  **Run backend controllers**: Setup your Laravel/PHP routes according to `API_CONTRACTS.md`.
3.  **Deploy package installer**: Setup the installation forms and demo seeder from `WIZARD_INSTALL.md`.
4.  **Connect frontend Context**: Mount the React asynchronous Context providers as described in `STATE_SYNC.md` to swap `localStorage` operations with active fetch calls.
5.  **Enforce RBAC limits**: Add UI permission guards described in `RBAC_SYSTEM.md` to hide delete/write operations for guests.
